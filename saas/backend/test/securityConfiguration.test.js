const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const net = require('node:net');
const { randomBytes } = require('node:crypto');
const { execFileSync, spawnSync } = require('node:child_process');
const { requireJwtSecret } = require('../config/validateEnv');
const { runCaptured, startService, stop } = require('./helpers/processHarness');
const backend = path.resolve(__dirname, '..');
const repo = path.resolve(backend, '../..');

test('JWT requires explicit non-placeholder configuration', () => {
  for (const value of [undefined, '', '   ', 'short', 'cambia_esto_por_64_bytes_aleatorios_seguros']) {
    assert.throws(() => requireJwtSecret({ JWT_SECRET: value }), /JWT_SECRET requerido/);
  }
  const secret = randomBytes(32).toString('hex');
  assert.equal(requireJwtSecret({ JWT_SECRET: secret }), secret);
});

test('missing JWT exits local and SQL servers before opening state or database', async () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'contapanama-no-jwt-'));
  try {
    const env = { ...process.env, NODE_ENV: 'test', CONTAPANAMA_LOCAL_DATA_DIR: path.join(cwd, 'state'),
      DOTENV_CONFIG_PATH: path.join(cwd, 'absent.env') };
    delete env.JWT_SECRET;
    for (const file of ['server.local.js', 'server.js']) {
      const result = await runCaptured(process.execPath, [path.join(backend, file)], { cwd, env, timeoutMs: 15000 });
      assert.equal(result.code, 1);
      assert.equal(result.timedOut, false);
      assert.match(result.stderr, /JWT_SECRET requerido/);
      assert.equal(fs.existsSync(env.CONTAPANAMA_LOCAL_DATA_DIR), false);
    }
  } finally { fs.rmSync(cwd, { recursive: true, force: true }); }
});

test('explicit random JWT starts isolated local API and authenticates a synthetic user', async () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'contapanama-explicit-jwt-'));
  let child;
  try {
    const port = await new Promise(resolve => {
      const socket = net.createServer();
      socket.listen(0, '127.0.0.1', () => { const p = socket.address().port; socket.close(() => resolve(p)); });
    });
    const secret = randomBytes(32).toString('hex');
    const base = `http://127.0.0.1:${port}`;
    child = await startService({ command: process.execPath, args: [path.join(backend, 'server.local.js')],
      options: { cwd, env: { ...process.env, NODE_ENV: 'test', JWT_SECRET: secret, PORT: String(port),
        HOST: '127.0.0.1', CONTAPANAMA_LOCAL_DATA_DIR: path.join(cwd, 'state'),
        DOTENV_CONFIG_PATH: path.join(cwd, 'absent.env') } },
      probe: async signal => (await fetch(base + '/health', { signal })).ok });
    const login = await fetch(base + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@contapanama.pa', password: process.env.CONTAPANAMA_QA_PASSWORD }) });
    assert.equal(login.status, 200);
    const { token } = await login.json();
    assert.ok(require('jsonwebtoken').verify(token, secret).id);
    assert.throws(() => require('jsonwebtoken').verify(token, randomBytes(32).toString('hex')));
  } finally { await stop(child); fs.rmSync(cwd, { recursive: true, force: true }); }
});

test('tracked runtime JavaScript has no literal JWT fallback', () => {
  const files = execFileSync('git', ['ls-files', '-z'], { cwd: repo }).toString().split('\0')
    .filter(p => /\.(js|cjs|mjs)$/.test(p) && !p.includes('/test/'));
  for (const file of files) {
    const source = fs.readFileSync(path.join(repo, file), 'utf8');
    assert.doesNotMatch(source, /JWT_SECRET\s*=.*(?:\|\||\?\?)\s*['"`]/, file);
    assert.doesNotMatch(source, /REDACTED_HISTORICAL_JWT/, file);
  }
});

const composePaths = ['saas/docker-compose.yml', 'PROYECTO APP/files_extracted/saas/docker-compose.yml'];
const required = ['POSTGRES_USER', 'POSTGRES_PASSWORD', 'POSTGRES_DB', 'PGADMIN_DEFAULT_EMAIL', 'PGADMIN_DEFAULT_PASSWORD'];
test('both Compose files use required nonempty variable syntax, not credential defaults', () => {
  for (const file of composePaths) {
    const source = fs.readFileSync(path.join(repo, file), 'utf8');
    for (const key of required) {
      const line = source.split(/\r?\n/).find(line => line.trimStart().startsWith(key + ':'));
      assert.ok(line, key);
      assert.ok(line.trim() === `${key}: \${${key}:?${key} requerido}`, key);
    }
    assert.ok(source.includes('$$POSTGRES_USER') && source.includes('$$POSTGRES_DB'));
  }
});

const dockerAvailable = spawnSync('docker', ['compose', 'version'], { windowsHide: true }).status === 0;
test('real Docker Compose rejects missing/empty password and accepts explicit configuration',
  { skip: !dockerAvailable && 'Docker Compose unavailable; structural contract is tested separately' }, () => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'contapanama-compose-'));
    try {
      const envFile = path.join(cwd, 'empty.env');
      fs.writeFileSync(envFile, '');
      for (const file of composePaths) {
        const env = { ...process.env, POSTGRES_USER: 'qa', POSTGRES_DB: 'qa', PGADMIN_DEFAULT_EMAIL: 'qa@example.test',
          PGADMIN_DEFAULT_PASSWORD: randomBytes(32).toString('hex'), POSTGRES_PASSWORD: randomBytes(32).toString('hex') };
        const args = ['compose', '--env-file', envFile, '-f', path.join(repo, file), 'config', '--quiet'];
        assert.equal(spawnSync('docker', args, { cwd, env, windowsHide: true }).status, 0);
        for (const password of [undefined, '']) {
          const invalid = { ...env };
          if (password === undefined) delete invalid.POSTGRES_PASSWORD;
          else invalid.POSTGRES_PASSWORD = password;
          assert.notEqual(spawnSync('docker', args, { cwd, env: invalid, windowsHide: true }).status, 0);
        }
      }
    } finally { fs.rmSync(cwd, { recursive: true, force: true }); }
  });
