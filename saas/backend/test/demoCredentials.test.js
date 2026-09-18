const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const net = require('node:net');
const { randomBytes } = require('node:crypto');
const { requireDemoCredentials } = require('../config/demoCredentials');
const { runCaptured, startService, stop } = require('./helpers/processHarness');
const backend = path.resolve(__dirname, '..');
const password = () => 'Aa1!' + randomBytes(32).toString('hex');

test('demo seed requires explicit opt-in and dynamic credential; production always rejects', () => {
  assert.throws(() => requireDemoCredentials({}), /deshabilitado/);
  assert.throws(() => requireDemoCredentials({ ALLOW_DEMO_SEED: 'true' }), /PASSWORD requerida/);
  const env = { ALLOW_DEMO_SEED: 'true', CONTAPANAMA_QA_PASSWORD: password() };
  assert.equal(requireDemoCredentials(env).password, env.CONTAPANAMA_QA_PASSWORD);
  assert.throws(() => requireDemoCredentials({ ...env, NODE_ENV: 'production' }), /produccion/);
});

test('empty local API fails closed with seed disabled or missing credential', async () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'contapanama-no-demo-'));
  try {
    for (const enabled of ['false', 'true']) {
      const env = { ...process.env, NODE_ENV: 'test', JWT_SECRET: randomBytes(32).toString('hex'),
        ALLOW_DEMO_SEED: enabled, CONTAPANAMA_LOCAL_DATA_DIR: path.join(cwd, 'state'), DOTENV_CONFIG_PATH: path.join(cwd, 'absent.env') };
      delete env.CONTAPANAMA_QA_PASSWORD;
      const r = await runCaptured(process.execPath, [path.join(backend, 'server.local.js')], { cwd, env, timeoutMs: 30000 });
      assert.equal(r.code, 1); assert.equal(r.timedOut, false);
      assert.match(r.stderr, enabled === 'true' ? /PASSWORD requerida/ : /deshabilitado/);
      assert.equal(fs.existsSync(path.join(cwd, 'state')), false);
    }
  } finally { fs.rmSync(cwd, { recursive: true, force: true }); }
});

test('random login, wrong password, persistent user and API restart without reseeding', async () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'contapanama-demo-auth-'));
  let child;
  const secret = password(), logs = [];
  const port = await new Promise(resolve => {
    const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const n = s.address().port; s.close(() => resolve(n)); });
  });
  const base = `http://127.0.0.1:${port}`;
  const env = { ...process.env, NODE_ENV: 'test', JWT_SECRET: randomBytes(32).toString('hex'),
    ALLOW_DEMO_SEED: 'true', CONTAPANAMA_QA_PASSWORD: secret, PORT: String(port), HOST: '127.0.0.1',
    CONTAPANAMA_LOCAL_DATA_DIR: path.join(cwd, 'state'), CONTAPANAMA_LOCAL_PERSISTENCE: 'on', DOTENV_CONFIG_PATH: path.join(cwd, 'absent.env') };
  const start = () => startService({ command: process.execPath, args: [path.join(backend, 'server.local.js')],
    options: { cwd, env }, onOutput: text => logs.push(text), probe: async signal => (await fetch(base + '/health', { signal })).ok });
  const login = value => fetch(base + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@contapanama.pa', password: value }) });
  try {
    child = await start();
    assert.equal((await login(password())).status, 401);
    const response = await login(secret); assert.equal(response.status, 200);
    const user = (await response.json()).user;
    const stateFile = path.join(env.CONTAPANAMA_LOCAL_DATA_DIR, 'contapanama-state.json');
    const before = fs.readFileSync(stateFile, 'utf8');
    assert.equal(before.includes(secret), false);
    await stop(child); child = null;
    env.ALLOW_DEMO_SEED = 'false'; delete env.CONTAPANAMA_QA_PASSWORD;
    child = await start();
    const restarted = await login(secret); assert.equal(restarted.status, 200);
    assert.equal((await restarted.json()).user.id, user.id);
    assert.equal(fs.readFileSync(stateFile, 'utf8'), before);
    assert.equal(logs.join('').includes(secret), false);
  } finally { await stop(child); fs.rmSync(cwd, { recursive: true, force: true }); }
});
