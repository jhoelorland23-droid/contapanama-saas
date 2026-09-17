const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const net = require('node:net');
const http = require('node:http');
const { spawn } = require('node:child_process');
const { randomBytes, createHash } = require('node:crypto');
const { Client } = require('pg');
const backend = path.resolve(__dirname, '..');
const repo = path.resolve(backend, '../..');
const root = path.join(process.env.LOCALAPPDATA || os.homedir(), 'ContaPanama', 'sql-review', createHash('sha256').update(repo).digest('hex').slice(0, 16));
const configPath = path.join(root, 'review.json');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function port(preferred = 0) {
  return new Promise((resolve, reject) => {
    const s = net.createServer();
    s.once('error', e => preferred ? port().then(resolve, reject) : reject(e));
    s.listen(preferred, '127.0.0.1', () => { const n = s.address().port; s.close(() => resolve(n)); });
  });
}
function readConfig() {
  const c = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  if (c.kind !== 'contapanama-synthetic-review-v1' || c.repo !== repo || c.database !== 'contapanama_review') throw new Error('Entorno ajeno: no se modifico.');
  return c;
}
function environment(c) {
  return { ...process.env, NODE_ENV: 'test', HOST: '127.0.0.1', PORT: String(c.apiPort),
    PGHOST: '127.0.0.1', PGPORT: String(c.pgPort), PGUSER: 'review_admin', PGPASSWORD: c.password,
    PGDATABASE: c.database, PGSSLMODE: 'disable',
    DATABASE_URL: `postgresql://review_admin:${c.password}@127.0.0.1:${c.pgPort}/${c.database}`,
    JWT_SECRET: c.jwt, BCRYPT_ROUNDS: '8', FRONTEND_URL: `http://localhost:${c.webPort}`,
    CONTAPANAMA_API_URL: `http://127.0.0.1:${c.apiPort}`, CONTAPANAMA_WEB_PORT: String(c.webPort),
    VITE_SQL_REVIEW: '1',
    CONTAPANAMA_JOURNAL_SYNC: c.syncMode, TZ: 'America/Panama' };
}
function run(c, command, args) {
  return new Promise((resolve, reject) => {
    const p = spawn(command, args, { cwd: backend, env: environment(c), windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    p.stdout.on('data', x => { output += x; }); p.stderr.on('data', x => { output += x; });
    const timer = setTimeout(() => p.kill(), 90000);
    p.once('error', e => { clearTimeout(timer); reject(e); });
    p.once('exit', code => {
      clearTimeout(timer); p.stdout.destroy(); p.stderr.destroy();
      code === 0 ? resolve(output) : reject(new Error(output.replaceAll(c.password, '[redacted]')));
    });
  });
}
async function waitFor(url, test) {
  const until = Date.now() + 60000;
  while (Date.now() < until) {
    try { const r = await fetch(url, { signal: AbortSignal.timeout(2000) }); if (r.ok && await test(r)) return; } catch (_) { /* startup */ }
    await delay(250);
  }
  throw new Error(`No responde ${url}; revise ${root}`);
}
async function control(c, action) {
  const r = await fetch(`http://127.0.0.1:${c.controlPort}/${action}`, { method: 'POST',
    headers: { Authorization: `Bearer ${c.controlSecret}` }, signal: AbortSignal.timeout(60000) });
  if (!r.ok) throw new Error(`Control de revision: ${r.status}`);
  return r.json();
}
async function serve(c) {
  const pg = name => path.join(c.pgBin, name + (process.platform === 'win32' ? '.exe' : ''));
  const data = path.join(root, 'data');
  let api, web, stopping = false;
  const startChild = (name, file, args, cwd) => {
    const log = fs.openSync(path.join(root, `${name}.log`), 'a');
    const p = spawn(file, args, { cwd, env: environment(c), windowsHide: true, stdio: ['ignore', log, log] });
    fs.closeSync(log); p.once('error', e => console.error(`${name}: ${e.message}`)); return p;
  };
  const stopChild = p => new Promise(resolve => {
    if (!p || p.exitCode !== null || p.signalCode !== null) return resolve();
    p.once('exit', resolve); p.kill();
  });
  const startApi = async () => {
    api = startChild('api', process.execPath, [path.join(backend, 'server.js')], backend);
    await waitFor(`http://127.0.0.1:${c.apiPort}/health`, async r => (await r.json()).db === c.database);
  };
  const stop = async () => {
    if (stopping) return;
    stopping = true;
    await stopChild(web); await stopChild(api);
    await run(c, pg('pg_ctl'), ['-D', data, '-w', '-m', 'fast', 'stop']);
  };
  process.on('SIGTERM', () => stop().finally(() => process.exit()));
  process.on('SIGINT', () => stop().finally(() => process.exit()));
  try {
    if (!fs.existsSync(path.join(data, 'PG_VERSION'))) {
      const pw = path.join(root, 'bootstrap-password');
      fs.writeFileSync(pw, c.password, { mode: 0o600, flag: 'wx' });
      try { await run(c, pg('initdb'), ['-D', data, '-U', 'review_admin', '-A', 'scram-sha-256', `--pwfile=${pw}`, '--locale=C', '-E', 'UTF8']); }
      finally { fs.unlinkSync(pw); }
    }
    // No existing user cluster or DATABASE_URL is ever used by this launcher.
    try { await run(c, pg('pg_ctl'), ['-D', data, 'status']); }
    catch (_) { await run(c, pg('pg_ctl'), ['-D', data, '-l', path.join(root, 'postgres.log'), '-o', `-h 127.0.0.1 -p ${c.pgPort} -c timezone=America/Panama`, '-w', 'start']); }
    const db = new Client({ host: '127.0.0.1', port: c.pgPort, user: 'review_admin', password: c.password, database: 'postgres' });
    await db.connect();
    try {
      const directory = (await db.query('SHOW data_directory')).rows[0].data_directory;
      if (path.resolve(directory) !== path.resolve(data)) throw new Error('Cluster ajeno: arranque rechazado');
      if (!(await db.query('SELECT 1 FROM pg_database WHERE datname=$1', [c.database])).rowCount) await db.query('CREATE DATABASE contapanama_review');
    } finally { await db.end(); }
    await run(c, process.execPath, ['db/migrate.js', '--apply']);
    await startApi();
    if (!c.seeded) {
      await require('../db/reviewSeed')(c, environment(c));
      c.seeded = true;
      fs.writeFileSync(configPath, JSON.stringify(c), { mode: 0o600 });
    }
    web = startChild('web', process.execPath, [path.resolve(backend, '../frontend/node_modules/vite/bin/vite.js'), '--host', '127.0.0.1', '--port', String(c.webPort), '--strictPort'], path.resolve(backend, '../frontend'));
    await waitFor(`http://127.0.0.1:${c.webPort}`, async r => (await r.text()).includes('<title>ContaPanam'));
    const server = http.createServer(async (req, res) => {
      if (req.method !== 'POST' || req.headers.authorization !== `Bearer ${c.controlSecret}`) { res.writeHead(403).end(); return; }
      try {
        if (req.url === '/restart-api') { await stopChild(api); await startApi(); }
        else if (req.url === '/stop') await stop();
        else if (req.url !== '/status') { res.writeHead(404).end(); return; }
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ kind: c.kind, web: `http://localhost:${c.webPort}`, api: `http://127.0.0.1:${c.apiPort}`, database: c.database, syncMode: c.syncMode }));
        if (stopping) server.close(() => process.exit());
      } catch (e) { console.error(e.message); res.writeHead(500).end(); }
    });
    server.listen(c.controlPort, '127.0.0.1');
  } catch (e) { await stop().catch(() => {}); throw e; }
}
async function main() {
  const action = process.argv[2] || 'start';
  if (action === 'serve') return serve(readConfig());
  if (action !== 'start') { console.log(JSON.stringify(await control(readConfig(), action))); return; }
  fs.mkdirSync(root, { recursive: true, mode: 0o700 });
  let c = fs.existsSync(configPath) ? readConfig() : null;
  if (c) { try { console.log(JSON.stringify(await control(c, 'status'))); return; } catch (_) { /* stopped review */ } }
  if (!c) c = { kind: 'contapanama-synthetic-review-v1', repo, database: 'contapanama_review',
    password: randomBytes(24).toString('hex'), jwt: randomBytes(32).toString('hex'), controlSecret: randomBytes(32).toString('hex'),
    pgPort: await port(), syncMode: 'full' };
  c.pgBin = process.env.CONTAPANAMA_PG_BIN || c.pgBin || path.join(os.homedir(), '.cache', 'contapanama-postgres', '17.11', 'pgsql', 'bin');
  if (!fs.existsSync(path.join(c.pgBin, process.platform === 'win32' ? 'pg_ctl.exe' : 'pg_ctl'))) throw new Error('Configure CONTAPANAMA_PG_BIN antes de iniciar.');
  c.apiPort = await port(Number(process.env.CONTAPANAMA_REVIEW_API_PORT || 4000));
  c.webPort = await port(Number(process.env.CONTAPANAMA_REVIEW_WEB_PORT || 5173));
  c.controlPort = await port();
  fs.writeFileSync(configPath, JSON.stringify(c), { mode: 0o600 });
  const log = fs.openSync(path.join(root, 'review.log'), 'a');
  const child = spawn(process.execPath, [__filename, 'serve'], { detached: true, windowsHide: true, stdio: ['ignore', log, log] });
  child.unref(); fs.closeSync(log);
  const until = Date.now() + 120000;
  while (Date.now() < until) {
    try { console.log(JSON.stringify(await control(c, 'status'))); console.log('Solo datos sinteticos. Login: qa-review@example.test / [REDACTED_QA_PASSWORD]'); return; } catch (_) { await delay(500); }
  }
  throw new Error(`Arranque incompleto; revise ${path.join(root, 'review.log')}`);
}
if (require.main === module) main().catch(e => { console.error(e.message); process.exitCode = 1; });
module.exports = { readConfig, control, root };
