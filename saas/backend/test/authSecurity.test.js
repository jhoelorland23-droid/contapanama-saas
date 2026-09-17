const assert = require('assert');
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const PORT = String(32000 + Math.floor(Math.random() * 20000));
const BASE_URL = `http://127.0.0.1:${PORT}`;
const TEST_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'contapanama-auth-'));

const serverPath = path.join(__dirname, '..', 'server.local.js');
const child = spawn(process.execPath, [serverPath], {
  env: {
    ...process.env,
    PORT,
    HOST: '127.0.0.1',
    JWT_SECRET: require('node:crypto').randomBytes(32).toString('hex'),
    CONTAPANAMA_LOCAL_DATA_DIR: TEST_DATA_DIR,
    LOGIN_RATE_LIMIT_MAX: '3',
    LOGIN_RATE_LIMIT_WINDOW_MS: '60000',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});

let serverOutput = '';
child.stdout.on('data', chunk => { serverOutput += chunk.toString(); });
child.stderr.on('data', chunk => { serverOutput += chunk.toString(); });

async function request(pathname, options = {}) {
  const response = await fetch(`${BASE_URL}${pathname}`, options);
  const data = await response.json().catch(() => ({}));
  return { response, data };
}

async function waitForServer() {
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    try {
      const { response } = await request('/health');
      if (response.ok) return;
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 150));
  }
  throw new Error(`Servidor local no inicio.\n${serverOutput}`);
}

async function run() {
  await waitForServer();

  const body = email => JSON.stringify({ email, password: process.env.CONTAPANAMA_QA_PASSWORD });
  const headers = { 'Content-Type': 'application/json' };

  for (let i = 0; i < 3; i += 1) {
    const { response, data } = await request('/api/auth/login', {
      method: 'POST',
      headers,
      body: body('admin@contapanama.pa'),
    });
    assert.strictEqual(response.status, 401);
    assert.strictEqual(data.error, 'Credenciales incorrectas');
  }

  const blocked = await request('/api/auth/login', {
    method: 'POST',
    headers,
    body: body('admin@contapanama.pa'),
  });
  assert.strictEqual(blocked.response.status, 429);
  assert.ok(blocked.data.error.includes('Demasiados intentos'));
  assert.ok(blocked.response.headers.get('retry-after'));

  const otherAccount = await request('/api/auth/login', {
    method: 'POST',
    headers,
    body: JSON.stringify({ email: 'otro@contapanama.pa', password: process.env.CONTAPANAMA_QA_PASSWORD }),
  });
  assert.strictEqual(otherAccount.response.status, 401);

  console.log('Auth security tests passed');
}

run()
  .catch(error => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    child.kill();
    fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true });
  });
