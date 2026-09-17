export const SESSION_EVENT = "cp_session_expired";

export function createReadQueue(limit = 4) {
  let active = 0;
  const queue = [];
  const drain = () => {
    while (active < limit && queue.length) {
      const { task, resolve, reject } = queue.shift(); active++;
      let pending;
      try { pending = task(); } catch (error) { active--; reject(error); continue; }
      Promise.resolve(pending).then(resolve, reject).finally(() => { active--; drain(); });
    }
  };
  return task => new Promise((resolve, reject) => { queue.push({ task, resolve, reject }); drain(); });
}

export function createApiClient(baseUrl = "", {
  fetchImpl = globalThis.fetch,
  storage = globalThis.localStorage,
  eventTarget = globalThis.window,
  timeoutMs = 15000,
} = {}) {
  const read = createReadQueue();
  const request = async (path, opts = {}, asBlob = false) => {
    const isSignIn = ["/api/auth/login", "/api/auth/register"].includes(path.split("?")[0]);
    const token = isSignIn ? null : storage.getItem("cp_token");
    const controller = new AbortController();
    const cancel = () => controller.abort();
    opts.signal?.addEventListener('abort', cancel, { once: true });
    if (opts.signal?.aborted) cancel();
    const timer = setTimeout(() => controller.abort(), asBlob ? timeoutMs * 4 : timeoutMs);
    try {
      if (opts.signal?.aborted) throw Object.assign(new Error('Solicitud cancelada.'), { name: 'AbortError' });
      const res = await fetchImpl(`${baseUrl}${path}`, {
        ...opts,
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...opts.headers,
        },
      });
      if (res.ok && asBlob) return await res.blob();
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        let message = data?.error || data?.errors?.[0]?.msg || `Error ${res.status}`;
        if (res.status === 401 && !isSignIn) {
          // A delayed response must not invalidate a newer session.
          if (storage.getItem("cp_token") === token) {
            storage.removeItem("cp_token");
            eventTarget.dispatchEvent(new Event(SESSION_EVENT));
          }
          message = "Tu sesi\u00f3n venci\u00f3. Inicia sesi\u00f3n nuevamente.";
        } else if (res.status >= 500) {
          message = "El servicio no est\u00e1 disponible. Intenta nuevamente en unos momentos.";
        } else if (res.status === 429) {
          const seconds = Number(res.headers.get("Retry-After"));
          if (Number.isFinite(seconds) && seconds > 0) {
            message = `Demasiados intentos. Espera ${Math.ceil(seconds / 60)} minuto(s) antes de volver a entrar.`;
          }
        }
        throw Object.assign(new Error(message), { status: res.status });
      }
      if (data === null) throw new Error("El servicio envi\u00f3 una respuesta inesperada. Intenta nuevamente.");
      return data;
    } catch (error) {
      if (opts.signal?.aborted) throw Object.assign(new Error('Solicitud cancelada.'), { name: 'AbortError' });
      if (controller.signal.aborted) {
        throw new Error("El servicio tard\u00f3 demasiado en responder. Intenta nuevamente.");
      }
      if (error instanceof TypeError) {
        throw new Error("No se pudo conectar con ContaPanam\u00e1. Revisa tu conexi\u00f3n e intenta nuevamente.");
      }
      throw error;
    } finally {
      clearTimeout(timer);
      opts.signal?.removeEventListener('abort', cancel);
    }
  };
  return {
    get: (path, options) => read(() => request(path, options)),
    post: (path, body) => request(path, { method: "POST", body: JSON.stringify(body) }),
    put: (path, body) => request(path, { method: "PUT", body: JSON.stringify(body) }),
    patch: (path, body) => request(path, { method: "PATCH", body: JSON.stringify(body) }),
    delete: path => request(path, { method: "DELETE" }),
    blob: path => request(path, {}, true),
  };
}
