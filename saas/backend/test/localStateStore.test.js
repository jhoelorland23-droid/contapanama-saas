const assert = require('node:assert/strict');
const { test } = require('node:test');
const express = require('express');
const { createLocalStateStore } = require('../services/localStateStore');

const deferred = () => {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
};
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

async function fixture(t, routes, options = {}) {
  const store = createLocalStateStore({ rows: [] });
  const saved = [];
  const app = express();
  app.use(express.json());
  app.use(store.middleware({ persist: snapshot => saved.push(snapshot), ...options }));
  app.get('/rows', (_req, res) => res.json(store.state.rows));
  routes(app, store.state);
  app.use((error, _req, res, _next) => res.status(error.status || 500).json({ error: error.message }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeIdleConnections(); }));
  const base = `http://127.0.0.1:${server.address().port}`;
  const send = (url, extra = {}) => fetch(base + url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}', ...extra });
  return { store, saved, send, read: () => fetch(base + '/rows').then(r => r.json()) };
}

test('publishes only after synchronous durable save, leaving late handler edits isolated', async t => {
  const f = await fixture(t, (app, state) => app.post('/add', (_req, res) => {
    state.rows.push('saved');
    res.json(state.rows);
    state.rows.push('too late');
  }));
  const response = await f.send('/add');
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), ['saved']);
  assert.deepEqual(f.saved, [{ rows: ['saved'] }]);
  assert.deepEqual(await f.read(), ['saved']);
});

test('save failures and error responses leave no partial state', async t => {
  const f = await fixture(t, (app, state) => {
    app.post('/fail-save', (_req, res) => { state.rows.push('not saved'); res.json({ ok: true }); });
    app.post('/invalid', (_req, res) => { state.rows.push('invalid'); res.status(422).json({ error: 'invalid' }); });
  }, { persist: () => { throw new Error('disk full'); } });
  assert.equal((await f.send('/fail-save')).status, 503);
  assert.equal((await f.send('/invalid')).status, 422);
  assert.deepEqual(await f.read(), []);
  assert.deepEqual(f.store.snapshot(), { rows: [] });
});

test('readers cannot see an uncommitted draft and competing writers preserve both operations', async t => {
  const entered = deferred(), gate = deferred();
  let secondEntered = false;
  const f = await fixture(t, (app, state) => {
    app.post('/first', async (_req, res) => { state.rows.push('first'); entered.resolve(); await gate.promise; res.json({ ok: true }); });
    app.post('/second', (_req, res) => { secondEntered = true; state.rows.push('second'); res.json({ ok: true }); });
  });
  const first = f.send('/first');
  await entered.promise;
  const second = f.send('/second');
  assert.deepEqual(await f.read(), []);
  assert.equal(secondEntered, false);
  gate.resolve();
  assert.equal((await first).status, 200);
  assert.equal((await second).status, 200);
  assert.deepEqual(await f.read(), ['first', 'second']);
});

test('a timed-out handler cannot commit over a later successful request', async t => {
  const gate = deferred(), completed = deferred();
  const f = await fixture(t, (app, state) => {
    app.post('/timeout', async (_req, res) => { state.rows.push('timed out'); await gate.promise; state.rows.push('late'); res.json({ ok: true }); completed.resolve(); });
    app.post('/next', (_req, res) => { state.rows.push('next'); res.json({ ok: true }); });
  }, { timeoutMs: 40 });
  assert.equal((await f.send('/timeout')).status, 503);
  assert.equal((await f.send('/next')).status, 200);
  gate.resolve();
  await completed.promise;
  assert.deepEqual(await f.read(), ['next']);
  assert.deepEqual(f.saved, [{ rows: ['next'] }]);
});

test('connection loss does not release a still-running writer into a race', async t => {
  const gate = deferred(), entered = deferred();
  let secondEntered = false;
  const f = await fixture(t, (app, state) => {
    app.post('/first', async (_req, res) => { state.rows.push('first'); entered.resolve(); await gate.promise; res.json({ ok: true }); });
    app.post('/second', (_req, res) => { secondEntered = true; state.rows.push('second'); res.json({ ok: true }); });
  });
  const controller = new AbortController();
  const first = f.send('/first', { signal: controller.signal }).catch(error => error);
  await entered.promise;
  controller.abort();
  const second = f.send('/second');
  await delay(15);
  assert.equal(secondEntered, false);
  assert.deepEqual(await f.read(), []);
  gate.resolve();
  await first;
  assert.equal((await second).status, 200);
  assert.deepEqual(await f.read(), ['first', 'second']);
});
