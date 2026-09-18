import assert from 'node:assert/strict';
import test from 'node:test';
import { randomBytes } from 'node:crypto';
import { createApiClient, SESSION_EVENT } from '../src/api.mjs';

function harness(fetchImpl, timeoutMs = 1000) {
  const saved = new Map([['cp_token', 'test-session']]);
  const storage = {
    getItem: key => saved.get(key) ?? null,
    removeItem: key => saved.delete(key),
  };
  const events = [];
  const api = createApiClient('', {
    fetchImpl, storage, timeoutMs,
    eventTarget: { dispatchEvent: event => events.push(event.type) },
  });
  return { api, saved, events };
}

test('incorrect login preserves the real error and does not send or clear a saved session', async () => {
  const password = randomBytes(32).toString('hex');
  const h = harness(async (_url, opts) => {
    assert.equal(opts.headers.Authorization, undefined);
    assert.deepEqual(JSON.parse(opts.body), { email: 'cpa@example.com', password });
    return Response.json({ error: 'Credenciales incorrectas' }, { status: 401 });
  });
  await assert.rejects(h.api.post('/api/auth/login', { email: 'cpa@example.com', password }),
    { message: 'Credenciales incorrectas', status: 401 });
  assert.equal(h.saved.get('cp_token'), 'test-session');
  assert.deepEqual(h.events, []);
});

test('successful login returns a session and protected requests use authorization', async () => {
  const h = harness(async (url, opts) => {
    if (url === '/api/auth/login') return Response.json({ token: 'new-session', user: { nombre: 'CPA' } });
    assert.equal(opts.headers.Authorization, 'Bearer test-session');
    return Response.json({ nombre: 'CPA' });
  });
  assert.equal((await h.api.post('/api/auth/login', {})).token, 'new-session');
  assert.equal((await h.api.get('/api/auth/me')).nombre, 'CPA');
});

for (const kind of ['json', 'pdf']) {
  test(`expired ${kind} request invalidates session and signals the login screen`, async () => {
    const h = harness(async () => Response.json({ error: 'Token expirado' }, { status: 401 }));
    await assert.rejects(kind === 'pdf' ? h.api.blob('/api/reportes/diario') : h.api.get('/api/auth/me'),
      error => error.status === 401 && error.message.includes('Inicia sesi'));
    assert.equal(h.saved.has('cp_token'), false);
    assert.deepEqual(h.events, [SESSION_EVENT]);
  });
}

test('an old unauthorized response cannot erase a newly authenticated session', async () => {
  let finish;
  const h = harness(() => new Promise(resolve => { finish = resolve; }));
  const pending = h.api.get('/api/auth/me');
  h.saved.set('cp_token', 'new-session');
  finish(Response.json({ error: 'Token expirado' }, { status: 401 }));
  await assert.rejects(pending);
  assert.equal(h.saved.get('cp_token'), 'new-session');
  assert.deepEqual(h.events, []);
});

test('network outage preserves the session and provides an actionable error', async () => {
  const h = harness(async () => { throw new TypeError('Failed to fetch'); });
  await assert.rejects(h.api.get('/api/auth/me'), /No se pudo conectar/);
  assert.equal(h.saved.get('cp_token'), 'test-session');
  assert.deepEqual(h.events, []);
});

test('gateway failure and invalid server response do not masquerade as expired authentication', async () => {
  for (const status of [200, 502, 503]) {
    const h = harness(async () => new Response('<html>Unavailable</html>', { status }));
    await assert.rejects(h.api.get('/api/auth/me'), status === 200 ? /respuesta inesperada/ : /no est.*disponible/);
    assert.equal(h.saved.get('cp_token'), 'test-session');
    assert.deepEqual(h.events, []);
  }
});

test('timeout exits loading without clearing the session', async () => {
  const h = harness((_url, { signal }) => new Promise((_resolve, reject) => {
    signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
  }), 10);
  await assert.rejects(h.api.get('/api/auth/me'), /tard.*demasiado/);
  assert.equal(h.saved.get('cp_token'), 'test-session');
});

test('rate limit displays the server retry interval', async () => {
  const h = harness(async () => Response.json({ error: 'Demasiados intentos' }, {
    status: 429, headers: { 'Retry-After': '125' },
  }));
  await assert.rejects(h.api.post('/api/auth/login', {}), /Espera 3 minuto/);
  assert.deepEqual(h.events, []);
});

test('field validation errors remain understandable', async () => {
  const h = harness(async () => Response.json({ errors: [{ msg: 'Nombre requerido' }] }, { status: 422 }));
  await assert.rejects(h.api.post('/api/auth/register', {}), { message: 'Nombre requerido', status: 422 });
});

test('PDF requests return the authenticated document unchanged', async () => {
  const h = harness(async (_url, opts) => {
    assert.equal(opts.headers.Authorization, 'Bearer test-session');
    return new Response('%PDF-test', { headers: { 'Content-Type': 'application/pdf' } });
  });
  const doc = await h.api.blob('/api/reportes/diario');
  assert.equal(doc.type, 'application/pdf');
  assert.equal(await doc.text(), '%PDF-test');
});
