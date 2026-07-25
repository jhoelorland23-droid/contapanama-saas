// API client — wrapper de fetch con token JWT y base URL configurable.
// Funciona en dos modos:
//   - "demo"  → no llama al backend; las screens usan mock data
//   - "live"  → todas las llamadas van al backend real

const makeApi = ({ baseUrl = "/api", getToken } = {}) => {
  const fetchJson = async (path, opts = {}) => {
    const token = getToken && getToken();
    const headers = {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(opts.headers || {}),
    };
    let res;
    try {
      res = await fetch(`${baseUrl}${path}`, { ...opts, headers });
    } catch (e) {
      throw new ApiError("No se puede conectar con el backend. ¿Está corriendo en " + baseUrl + "?", 0, e);
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new ApiError(data.error || `Error ${res.status}`, res.status, data);
    }
    return data;
  };

  return {
    get: (p) => fetchJson(p),
    post: (p, body) => fetchJson(p, { method: "POST", body: JSON.stringify(body) }),
    put: (p, body) => fetchJson(p, { method: "PUT", body: JSON.stringify(body) }),
    patch: (p, body) => fetchJson(p, { method: "PATCH", body: JSON.stringify(body) }),
    delete: (p) => fetchJson(p, { method: "DELETE" }),
    pdf: async (p, filename) => {
      const token = getToken && getToken();
      const res = await fetch(`${baseUrl}${p}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new ApiError(d.error || `Error ${res.status}`, res.status, d);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename || p.split("/").pop().split("?")[0] + ".pdf";
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    },
    raw: fetchJson,
  };
};

class ApiError extends Error {
  constructor(msg, status, cause) {
    super(msg);
    this.status = status;
    this.cause = cause;
  }
}

// React hook: returns { data, loading, error, refetch } and aborts when stale.
const useApiQuery = (fetcher, deps = [], opts = {}) => {
  const { enabled = true, fallback = null } = opts;
  const [state, setState] = React.useState({ data: fallback, loading: enabled, error: null });
  const [tick, setTick] = React.useState(0);

  React.useEffect(() => {
    if (!enabled) {
      setState({ data: fallback, loading: false, error: null });
      return;
    }
    let alive = true;
    setState(s => ({ ...s, loading: true, error: null }));
    Promise.resolve(fetcher())
      .then(data => { if (alive) setState({ data, loading: false, error: null }); })
      .catch(err => { if (alive) setState({ data: fallback, loading: false, error: err }); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick, enabled]);

  return { ...state, refetch: () => setTick(t => t + 1) };
};

Object.assign(window, { makeApi, ApiError, useApiQuery });
