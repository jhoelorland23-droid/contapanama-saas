const qaCredentials = require('./helpers/qaCredentials');
const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');
const { startService, stop, runCaptured, positiveInteger } = require('./helpers/processHarness');
const { fileMetadata } = require('./helpers/fileMetadata');
const fs = require('node:fs');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const { Client } = require('pg');

// Never use DATABASE_URL or an existing cluster: this test owns its entire database.
const backend = path.resolve(__dirname, '..');
const reviewFile = path.join(backend, '.local-data', 'contapanama-state.json');
const reviewMetadataBefore = fileMetadata(reviewFile);
const pgBin = process.env.CONTAPANAMA_PG_BIN;
const exe = name => path.join(pgBin, `${name}${process.platform === 'win32' ? '.exe' : ''}`);
const password = randomBytes(24).toString('hex');
const jwtSecret = randomBytes(32).toString('hex');
const clients = new Set();
const report = { started_at: new Date().toISOString(), checks: [] };
let temp, dataDir, pgPort, apiPort, api, baseUrl, web;
let apiOutput = '';
const outputDirectory = process.env.CONTAPANAMA_POSTGRES_QA_OUTPUT
  ? path.resolve(process.env.CONTAPANAMA_POSTGRES_QA_OUTPUT)
  : fs.mkdtempSync(path.join(os.tmpdir(), 'contapanama-pg-logs-'));
fs.mkdirSync(outputDirectory, { recursive: true });
console.log(`PostgreSQL QA logs: ${outputDirectory}`);
const clean = value => String(value).replaceAll(password, '[redacted]').replace(/Bearer [A-Za-z0-9_.-]+/g, 'Bearer [redacted]');
const logChild = label => (text, stream) => {
  fs.appendFileSync(path.join(outputDirectory, `${label}.${stream}.log`), clean(text));
  if (label === 'api') apiOutput += text;
};
const startupOptions = () => ({
  timeoutMs: positiveInteger(process.env.CONTAPANAMA_QA_STARTUP_TIMEOUT_MS, 60000, 'CONTAPANAMA_QA_STARTUP_TIMEOUT_MS'),
  attempts: positiveInteger(process.env.CONTAPANAMA_QA_STARTUP_ATTEMPTS, 3, 'CONTAPANAMA_QA_STARTUP_ATTEMPTS'),
  probeTimeoutMs: positiveInteger(process.env.CONTAPANAMA_QA_PROBE_TIMEOUT_MS, 5000, 'CONTAPANAMA_QA_PROBE_TIMEOUT_MS'),
});

function check(name, evidence = {}) {
  report.checks.push({ name, ...evidence });
  console.log(`PASS ${name}`);
}

function freePort() {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.on('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const port = probe.address().port;
      probe.close(() => resolve(port));
    });
  });
}

function environment(database = 'contapanama_qa') {
  return { ...process.env, PGHOST: '127.0.0.1', PGPORT: String(pgPort), PGUSER: 'qa_admin',
    PGPASSWORD: password, PGDATABASE: database, PGSSLMODE: 'disable',
    DATABASE_URL: `postgresql://qa_admin:${password}@127.0.0.1:${pgPort}/${database}`,
    NODE_ENV: 'test', HOST: '127.0.0.1', PORT: String(apiPort), JWT_SECRET: jwtSecret,
    BCRYPT_ROUNDS: '8', FRONTEND_URL: 'http://localhost:5173',
    TZ: 'America/Panama', CONTAPANAMA_INTEGRATION_TOKEN: randomBytes(32).toString('hex') };
}

async function run(command, args, options = {}) {
  const { restartApi, stdio, timeoutMs, ...spawnOptions } = options;
  const result = await runCaptured(command, args, { cwd: backend, env: environment(), ...spawnOptions,
    timeoutMs: timeoutMs || positiveInteger(process.env.CONTAPANAMA_QA_CHILD_TIMEOUT_MS, restartApi ? 600000 : 90000, 'CONTAPANAMA_QA_CHILD_TIMEOUT_MS'),
    inheritedPipeGraceMs: path.basename(command).startsWith('pg_ctl') ? 1000 : undefined,
    onOutput: logChild('commands'), ipc: Boolean(restartApi),
    onChild: child => { if (restartApi) child.on('message', async message => {
      if (message?.action !== 'restart-api') return;
      try { await restartApi(); child.send({ requestId: message.requestId, ok: true }); }
      catch (e) { child.send({ requestId: message.requestId, error: e.message }); }
    }); },
  });
  if (result.code !== 0) throw new Error(`${path.basename(command)} failed (${result.code}${result.timedOut ? ', timeout' : ''}): ${clean(result.error?.stack || '')}\n${clean(result.output)}`);
  return result.output;
}

async function connect(database = 'contapanama_qa') {
  const client = new Client({ connectionString: environment(database).DATABASE_URL, connectionTimeoutMillis: 5000 });
  // A deliberate cluster stop terminates every session; that must not crash the harness.
  client.on('error', () => {});
  clients.add(client);
  await client.connect();
  return client;
}

async function requestRaw(url, options = {}) {
  // Synchronous PDF checks can block this process past the API's keep-alive timeout;
  // reusing that idle socket afterwards fails with ECONNRESET, so never keep sockets alive.
  const response = await fetch(`${baseUrl}${url}`, { ...options, headers: { Connection: 'close', ...(options.headers || {}) }, signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error(`${options.method || 'GET'} ${url} -> ${response.status}: ${await response.text()}`);
  return response;
}

async function request(url, options) {
  return (await requestRaw(url, options)).json();
}

async function stopApi() {
  await stop(api);
}

async function startApi(database = 'contapanama_qa', timezone = 'America/Panama', extraEnv = {}) {
  api = await startService({ command: process.execPath, args: [path.join(backend, 'server.js')],
    options: { cwd: backend, env: { ...environment(database), TZ: timezone, ...extraEnv } },
    ...startupOptions(), onOutput: logChild('api'), onChild: child => { api = child; },
    probe: async signal => {
      const response = await fetch(`${baseUrl}/health`, { signal, headers: { Connection: 'close' } });
      if (!response.ok) return false;
      const health = await response.json();
      return health.status === 'ok' && health.db === database && health.env === 'test';
    },
  });
}

const clusterLog = () => path.join(temp, 'postgres.log');
const clusterOptions = () => `-h 127.0.0.1 -p ${pgPort} -c timezone=America/Panama`;
const clusterTimeout = () => Math.ceil(startupOptions().timeoutMs / 1000);
async function startCluster() {
  const { attempts, timeoutMs, probeTimeoutMs } = startupOptions();
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await run(exe('pg_ctl'), ['-D', dataDir, '-l', clusterLog(), '-o', clusterOptions(), '-w', '-t', String(clusterTimeout()), 'start'], { timeoutMs: timeoutMs + 10000 });
    } catch (error) {
      const status = await runCaptured(exe('pg_ctl'), ['-D', dataDir, 'status'], {
        cwd: backend, env: environment(), timeoutMs: probeTimeoutMs, onOutput: logChild('commands'), inheritedPipeGraceMs: 1000,
      });
      if (status.code === 0) {
        // A timed-out pg_ctl can leave its postmaster starting. Never start another.
        const deadline = Date.now() + timeoutMs;
        while (Date.now() < deadline) {
          const client = new Client({ connectionString: environment('postgres').DATABASE_URL,
            connectionTimeoutMillis: Math.max(1, Math.min(probeTimeoutMs, deadline - Date.now())), query_timeout: probeTimeoutMs });
          client.on('error', () => {});
          try { await client.connect(); await client.query('SELECT 1'); return; }
          catch (_) { await new Promise(resolve => setTimeout(resolve, 150)); }
          finally { await client.end().catch(() => {}); }
        }
        throw error;
      }
      // pg_ctl status=3 explicitly means no server. Unknown status must fail closed.
      if (status.code !== 3 || attempt === attempts) throw error;
      await new Promise(resolve => setTimeout(resolve, 250));
    }
  }
}
const stopCluster = () => run(exe('pg_ctl'), ['-D', dataDir, '-w', '-t', String(clusterTimeout()), '-m', 'fast', 'stop'], { timeoutMs: startupOptions().timeoutMs + 10000 });

async function snapshot(client) {
  const { rows: tables } = await client.query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename");
  const result = {};
  for (const { tablename } of tables) {
    assert.match(tablename, /^[a-z_]+$/);
    const primaryKey = tablename === 'folios_libro' ? 'asiento_id' : 'id';
    const { rows } = await client.query(`SELECT to_jsonb(t) AS row FROM public."${tablename}" t ORDER BY ${primaryKey}`);
    result[tablename] = rows.map(item => item.row);
  }
  return result;
}

function assertOwnedTemp() {
  assert(temp && path.dirname(path.resolve(temp)) === path.resolve(os.tmpdir()));
  assert(path.basename(temp).startsWith('contapanama-pg-qa-'));
  assert.equal(dataDir, path.join(temp, 'data'));
  assert.equal(fs.realpathSync(temp), path.resolve(temp));
}

async function main() {
  assert(pgBin, 'Set CONTAPANAMA_PG_BIN to the directory containing initdb and pg_ctl');
  for (const name of ['initdb', 'pg_ctl', 'pg_dump', 'pg_restore']) assert(fs.existsSync(exe(name)), `Missing ${name}`);
  temp = fs.mkdtempSync(path.join(os.tmpdir(), 'contapanama-pg-qa-'));
  dataDir = path.join(temp, 'data');
  assertOwnedTemp();
  pgPort = await freePort();
  apiPort = await freePort();
  assert.notEqual(pgPort, apiPort);
  baseUrl = `http://127.0.0.1:${apiPort}`;
  const pwFile = path.join(temp, 'bootstrap-password');
  fs.writeFileSync(pwFile, password, { mode: 0o600, flag: 'wx' });
  await run(exe('initdb'), ['-D', dataDir, '-U', 'qa_admin', '-A', 'scram-sha-256', `--pwfile=${pwFile}`, '--locale=C', '-E', 'UTF8']);
  fs.unlinkSync(pwFile);
  await startCluster();
  const admin = await connect('postgres');
  const { rows: [settings] } = await admin.query('SELECT version(), current_setting(\'listen_addresses\') AS host, current_setting(\'TimeZone\') AS timezone');
  assert.equal(settings.host, '127.0.0.1');
  check('isolated PostgreSQL cluster, password authentication, loopback only', settings);
  await admin.query('CREATE DATABASE contapanama_qa');
  await admin.query('CREATE DATABASE contapanama_restore');
  await admin.query('CREATE DATABASE contapanama_upgrade');
  await run(process.execPath, ['db/migrate.js', '--apply']);
  let db = await connect();
  check('schema migration on empty database');
  if (process.env.CONTAPANAMA_PG_BENCH_ONLY === '1') {
    await startApi();
    report.benchmark = await require('./helpers/journalBenchmark')({ request, check, documents: Number(process.env.CONTAPANAMA_PG_BENCH) });
    return;
  }
  await run(process.execPath, ['db/migrate.js', '--apply'], { env: environment('contapanama_upgrade') });
  const upgrade = await connect('contapanama_upgrade');
  await upgrade.query(`ALTER TABLE transacciones DROP CONSTRAINT transacciones_estado_pago_check;
    ALTER TABLE transacciones ADD CONSTRAINT transacciones_estado_pago_check CHECK (estado_pago IN ('pendiente','pagado'));
    DROP TRIGGER trg_asientos_upd ON asientos_contables`);
  await run(process.execPath, ['db/migrate.js', '--apply'], { env: environment('contapanama_upgrade') });
  assert.equal((await upgrade.query("SELECT 1 FROM pg_trigger WHERE tgname='trg_asientos_upd' AND NOT tgisinternal")).rowCount, 1,
    'Migration must recreate missing triggers even when the earlier ones exist');
  const upgradedCheck = await upgrade.query("SELECT pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE conname='transacciones_estado_pago_check'");
  assert.match(upgradedCheck.rows[0].definition, /parcial/, 'Migration must upgrade the old pending/paid check for partial payments');
  check('upgrade from old payment-state constraint and incomplete trigger set');
  await upgrade.query(`INSERT INTO usuarios(id,nombre,email,password_hash) VALUES('00000000-0000-0000-0000-000000000001','QA migration','qa-migration@example.com','unused');
    DROP INDEX idx_cierre_mes_global;
    INSERT INTO cierres_periodo(usuario_id,periodo,alcance,estado) VALUES
      ('00000000-0000-0000-0000-000000000001','2037-01','mensual','en_revision'),
      ('00000000-0000-0000-0000-000000000001','2037-01','mensual','cerrado');
    ALTER TABLE transacciones DROP CONSTRAINT transacciones_estado_pago_check;
    ALTER TABLE transacciones ADD CONSTRAINT transacciones_estado_pago_check CHECK (estado_pago IN ('pendiente','pagado'))`);
  const beforeFailedMigration = await snapshot(upgrade);
  await assert.rejects(run(process.execPath, ['db/migrate.js', '--apply'], { env: environment('contapanama_upgrade') }), /idx_cierre_mes_global/);
  assert.deepEqual(await snapshot(upgrade), beforeFailedMigration);
  assert.doesNotMatch((await upgrade.query("SELECT pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE conname='transacciones_estado_pago_check'")).rows[0].definition, /parcial/);
  check('duplicate legacy closures stop migration; all prior rows and constraints remain intact');
  await startApi();
  const signup = await request('/api/auth/register', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nombre: 'QA PostgreSQL CPA', email: 'qa-postgres@example.com', password: qaCredentials.randomPassword() }) });
  const authHeaders = { 'Content-Type': 'application/json', Authorization: `Bearer ${signup.token}` };
  assert.equal((await request('/api/auth/me', { headers: authHeaders })).id, signup.user.id);
  check('registration and authenticated SQL API');
  await require('./importLocalState.scenario')({ db, connect, check });
  await require('./journalShadow.scenario')({ db, check });
  await require('./accountingPeriods.scenario')({ request, requestRaw, authHeaders });
  check('monthly and annual accounting, cross-year payments, closed periods, 4 PDFs');
  const paymentCheck = await require('./paymentLedger.scenario')({ request, requestRaw, authHeaders });
  check('partial payments, reversals, reconciliation, tenant isolation, 12 balances, 2 PDFs');
  await require('./postgresConcurrency.scenario')({ request, authHeaders, db, connect, check });
  const journalCheck = await require('./journalPostgres.scenario')({ request, requestRaw, authHeaders, db, check });
  const correctionCheck = await require('./documentCorrection.scenario')({ request, requestRaw, authHeaders, db, check,
    outputDirectory: process.env.CONTAPANAMA_POSTGRES_QA_OUTPUT });
  await require('./journalPdf.scenario')({ request, requestRaw, authHeaders, check,
    outputDirectory: process.env.CONTAPANAMA_POSTGRES_QA_OUTPUT });
  const entityCheck = await require('./entityBooks.scenario')({ request, requestRaw, authHeaders, db, check,
    outputDirectory: process.env.CONTAPANAMA_POSTGRES_QA_OUTPUT });
  const legacyEntityCheck = await require('./legacyEntityBooks.scenario')({ request, requestRaw, check,
    install: fixture => require('./legacyEntityFixture').installLegacyEntityFixture(db, fixture),
    setRole: (uid, rol) => db.query('UPDATE usuarios SET rol=$2 WHERE id=$1', [uid, rol]),
    snapshot: async uid => Object.fromEntries(Object.entries(await snapshot(db))
      .filter(([table]) => ['transacciones','asientos_contables','asiento_lineas','libros_contables',
        'cierres_periodo','libros_entidad','folios_libro','audit_events'].includes(table))
      .map(([table, rows]) => [table, rows.filter(row => row.usuario_id === uid)])),
    withSaveFailure: async action => {
      await db.query(`CREATE FUNCTION qa_fail_legacy_folio() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'QA legacy folio failure'; END $$;
        CREATE TRIGGER qa_fail_legacy_folio BEFORE INSERT ON folios_libro FOR EACH ROW EXECUTE FUNCTION qa_fail_legacy_folio()`);
      try { await action(); }
      finally { await db.query('DROP TRIGGER qa_fail_legacy_folio ON folios_libro; DROP FUNCTION qa_fail_legacy_folio()'); }
    },
  });
  if (process.env.CONTAPANAMA_POSTGRES_BROWSER === '1') {
    const webPort = await freePort();
    const webUrl = `http://127.0.0.1:${webPort}`;
    web = await startService({ command: process.execPath,
      args: [path.resolve(backend,'../frontend/node_modules/vite/bin/vite.js'),'--host','127.0.0.1','--port',String(webPort),'--strictPort'],
      options: { cwd: path.resolve(backend,'../frontend'), env: { ...environment(), CONTAPANAMA_API_URL: baseUrl } },
      ...startupOptions(), onOutput: logChild('vite'), onChild: child => { web = child; },
      probe: async signal => (await fetch(webUrl, { signal })).ok,
    });
    const output = await run(process.execPath, [path.join(backend, '../frontend/test/payments.browser.cjs')], {
      env: { ...environment(), CONTAPANAMA_DISPOSABLE_PG_TEST: '1', CONTAPANAMA_PG_QA_API: baseUrl,
        CONTAPANAMA_WEB_URL: webUrl, CONTAPANAMA_POSTGRES_QA_OUTPUT: process.env.CONTAPANAMA_POSTGRES_QA_OUTPUT || path.join(temp,'browser') },
      stdio: ['ignore','pipe','pipe','ipc'], restartApi: async () => { await stopApi(); await startApi(); },
    });
    console.log(output);
    check('browser payment workflow with real PostgreSQL, desktop and mobile');
  }
  await require('./bankReconciliation.scenario')({ request, requestRaw, authHeaders, check, db,
    outputDirectory: process.env.CONTAPANAMA_POSTGRES_QA_OUTPUT,
    installBank: row => db.query(`INSERT INTO movimientos_bancarios
      (id,usuario_id,cliente_id,fecha,descripcion,banco,tipo,monto,referencia,conciliado)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,false)`,
      [row.id,row.usuario_id,row.cliente_id,row.fecha,row.descripcion,row.banco,row.tipo,row.monto,row.referencia]),
    setRole: (uid, rol) => db.query('UPDATE usuarios SET rol=$2 WHERE id=$1',[uid,rol]),
  });
  const accountsCheck = await require('./bankAccounts.scenario')({ request, requestRaw, authHeaders, check, db,
    outputDirectory: process.env.CONTAPANAMA_POSTGRES_QA_OUTPUT,
    clearLegacyAccount: async id => {
      // Disposable fixture only: simulate a pre-account document without changing its published journal.
      await db.query('BEGIN');
      try {
        await db.query('ALTER TABLE transacciones DISABLE TRIGGER trg_documento_cuenta_guard');
        await db.query('UPDATE transacciones SET cuenta_bancaria_id=NULL WHERE id=$1',[id]);
        await db.query('ALTER TABLE transacciones ENABLE TRIGGER trg_documento_cuenta_guard');
        await db.query('COMMIT');
      } catch(error) { await db.query('ROLLBACK'); throw error; }
    },
    installBank: row => db.query(`INSERT INTO movimientos_bancarios
      (id,usuario_id,cliente_id,fecha,descripcion,banco,tipo,monto,referencia,conciliado)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,false)`,
      [row.id,row.usuario_id,row.cliente_id,row.fecha,row.descripcion,row.banco,row.tipo,row.monto,row.referencia]),
    setRole: (uid, rol) => db.query('UPDATE usuarios SET rol=$2 WHERE id=$1',[uid,rol]),
    snapshot: async uid => Object.fromEntries(Object.entries(await snapshot(db)).map(([table, rows]) => [table, rows.filter(row => row.usuario_id === uid)])),
    withSaveFailure: async action => {
      await db.query(`CREATE FUNCTION qa_fail_bank_operation() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'QA operation failure'; END $$;
        CREATE TRIGGER qa_fail_bank_operation BEFORE INSERT ON operaciones_bancarias FOR EACH ROW EXECUTE FUNCTION qa_fail_bank_operation()`);
      try { await action(); }
      finally { await db.query('DROP TRIGGER qa_fail_bank_operation ON operaciones_bancarias; DROP FUNCTION qa_fail_bank_operation()'); }
    },
  });
  if (Number(process.env.CONTAPANAMA_PG_BENCH) > 0) {
    report.benchmark = await require('./helpers/journalBenchmark')({ request, check, documents: Number(process.env.CONTAPANAMA_PG_BENCH) });
  }
  const resilienceCheck = await require('./journalResilience.scenario')({ request, requestRaw, authHeaders, db, check,
    restartApi: async extraEnv => { await stopApi(); await startApi('contapanama_qa', 'America/Panama', extraEnv); },
    stopCluster, startCluster });
  // The outage above terminated every session; later steps need a live client.
  await db.end().catch(() => {});
  clients.delete(db);
  db = await connect();
  assert.deepEqual(await request(resilienceCheck.endpoint, { headers: authHeaders }), resilienceCheck.expected);
  await stopApi();
  await startApi('contapanama_qa', 'Pacific/Kiritimati');
  assert.deepEqual(await request(resilienceCheck.endpoint, { headers: authHeaders }), resilienceCheck.expected);
  assert.deepEqual(await request(paymentCheck.endpoint, { headers: authHeaders }), paymentCheck.expected);
  assert.deepEqual(await request(journalCheck.endpoint, { headers: authHeaders }), journalCheck.expected);
  assert.deepEqual(await request(correctionCheck.endpoint, { headers: authHeaders }), correctionCheck.expected);
  assert.deepEqual(await request(entityCheck.endpoint, { headers: authHeaders }), entityCheck.expected);
  assert.deepEqual(await request(accountsCheck.endpoint, { headers: authHeaders }), accountsCheck.expected);
  assert.deepEqual(await request(accountsCheck.statements.endpoint, { headers: authHeaders }), accountsCheck.statements.expected);
  assert.deepEqual(await request(accountsCheck.subledger.endpoint, { headers: authHeaders }), accountsCheck.subledger.expected);
  assert.deepEqual(await request(legacyEntityCheck.endpoint, { headers: legacyEntityCheck.headers }), legacyEntityCheck.expected);
  check('payment history and civil dates survive API restart in another timezone');
  await stopApi();
  if (process.env.CONTAPANAMA_JOURNAL_SYNC === 'shadow') {
    const summary = (await db.query(`SELECT accion,count(*)::int AS total FROM audit_events
      WHERE accion IN ('journal_shadow_match','journal_shadow_divergence','journal_shadow_error')
      AND usuario_id IN (SELECT id FROM usuarios WHERE nombre <> 'QA Shadow') GROUP BY accion ORDER BY accion`)).rows;
    assert(summary.some(r=>r.accion==='journal_shadow_match'&&r.total>0));
    assert(!summary.some(r=>r.accion!=='journal_shadow_match'));
    check('shadow plans match across real SQL scenarios; no unforced divergence or hidden fallback error', { summary });
    const coverageRows = (await db.query(`SELECT despues_json FROM audit_events
      WHERE accion='journal_shadow_coverage'
      AND usuario_id IN (SELECT id FROM usuarios WHERE nombre <> 'QA Shadow')`)).rows;
    report.shadow_coverage = require('./helpers/shadowCoverage').summarizeCoverage(coverageRows.map(row => row.despues_json));
    assert.equal(report.shadow_coverage.compared, summary.find(r=>r.accion==='journal_shadow_match').total);
    check('normal shadow coverage: total = compared + fallback; zero divergence', report.shadow_coverage);
  }
  const before = await snapshot(db);
  await db.query('DROP TRIGGER trg_asientos_upd ON asientos_contables');
  await run(process.execPath, ['db/migrate.js', '--apply']);
  assert.deepEqual(await snapshot(db), before);
  assert.equal((await db.query("SELECT 1 FROM pg_trigger WHERE tgname='trg_asientos_upd' AND NOT tgisinternal")).rowCount, 1,
    'Schema reapplication skipped the missing trigger because another trigger already existed');
  check('schema reapplication preserves all table rows');
  const dump = path.join(temp, 'accounting.dump');
  await run(exe('pg_dump'), ['--format=custom', '--file', dump]);
  await run(exe('pg_restore'), ['--exit-on-error', '--dbname=contapanama_restore', dump]);
  const restored = await connect('contapanama_restore');
  assert.deepEqual(await snapshot(restored), before);
  const preservedEntry = before.asientos_contables.find(e => e.origen_clave);
  assert(preservedEntry, 'The backup must contain a real published journal');
  await assert.rejects(restored.query(`INSERT INTO asiento_lineas
    (asiento_id,usuario_id,orden,cuenta_codigo,cuenta_nombre,tipo_cuenta,debe,haber)
    VALUES($1,$2,999,'1010','Caja','activo',1,0)`, [preservedEntry.id, preservedEntry.usuario_id]),
  error => error.code === '23514');
  check('restored journal still rejects appending lines to an already published entry');
  await startApi('contapanama_restore');
  assert.deepEqual(await request(accountsCheck.statements.endpoint,{headers:authHeaders}),accountsCheck.statements.expected);
  assert.deepEqual(await request(accountsCheck.subledger.endpoint,{headers:authHeaders}),accountsCheck.subledger.expected);
  const dimension=before.dimensiones_bancarias[0];
  assert(dimension);
  await assert.rejects(restored.query(`INSERT INTO dimensiones_bancarias(id,usuario_id,cliente_id,asiento_id,orden,cuenta_bancaria_id,asiento_hash,fuente,dimension_hash)
    SELECT uuid_generate_v4(),usuario_id,cliente_id,asiento_id,orden,cuenta_bancaria_id,asiento_hash,fuente,dimension_hash FROM dimensiones_bancarias WHERE id=$1`,[dimension.id]),e=>e.code==='23514');
  check('restored bank subledger matches all twelve months and still rejects late historical dimensions');
  const restoredStatement=await requestRaw('/api/extractos-bancarios/'+accountsCheck.statements.fileId+'/soporte',{headers:authHeaders});
  assert.equal(require('node:crypto').createHash('sha256').update(Buffer.from(await restoredStatement.arrayBuffer())).digest('hex'),accountsCheck.statements.pdfHash);
  check('restored database serves identical statement versions, twelve-month comparison and original PDF bytes');
  assert.deepEqual(await request(legacyEntityCheck.endpoint, { headers: legacyEntityCheck.headers }), legacyEntityCheck.expected);
  assert.deepEqual(await request(entityCheck.endpoint, { headers: authHeaders }), entityCheck.expected);
  assert.deepEqual(await request(paymentCheck.endpoint, { headers: authHeaders }), paymentCheck.expected);
  assert.deepEqual(await request(journalCheck.endpoint, { headers: authHeaders }), journalCheck.expected);
  assert.deepEqual(await request(resilienceCheck.endpoint, { headers: authHeaders }), resilienceCheck.expected);
  assert.deepEqual(await request(correctionCheck.endpoint, { headers: authHeaders }), correctionCheck.expected);
  check('pg_dump and pg_restore: identical rows in every public table and live payment API', {
    tables: Object.fromEntries(Object.entries(before).map(([table, rows]) => [table, rows.length])),
  });
  check('only disposable PostgreSQL fixtures used; review data was not opened');
}

async function cleanup() {
  await stop(web);
  await stopApi();
  for (const client of clients) await client.end().catch(() => {});
  if (!temp) return;
  assertOwnedTemp();
  if (fs.existsSync(path.join(dataDir, 'postmaster.pid'))) {
    await stopCluster();
  }
  assert(!fs.existsSync(path.join(dataDir, 'postmaster.pid')), 'Cluster still running; do not delete its files');
  if (fs.existsSync(clusterLog())) fs.copyFileSync(clusterLog(), path.join(outputDirectory, 'postgres.log'));
  fs.rmSync(temp, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 });
  check('test API and cluster stopped; disposable directory removed');
}

(async () => {
  try { await main(); report.passed = true; }
  catch (error) {
    report.passed = false;
    // undici wraps socket errors as "fetch failed"; the cause names the real failure.
    report.error = clean([error.stack, error.cause && `cause: ${error.cause.stack || error.cause}`].filter(Boolean).join('\n'));
    console.error(report.error);
    console.error(clean(apiOutput.slice(-5000)));
    process.exitCode = 1;
  } finally {
    try { await cleanup(); }
    catch (error) { report.passed = false; report.cleanup_error = clean(error.stack); console.error(report.cleanup_error); process.exitCode = 1; }
    try {
      assert.deepEqual(fileMetadata(reviewFile), reviewMetadataBefore);
      check('review file metadata unchanged (lstat only; not a content fingerprint)');
    } catch (error) { report.passed = false; report.metadata_error = error.message; process.exitCode = 1; }
    report.finished_at = new Date().toISOString();
    fs.writeFileSync(path.join(outputDirectory, 'results.json'), JSON.stringify(report, null, 2));
    fs.writeFileSync(path.join(outputDirectory, 'api.log'), clean(apiOutput));
  }
})();
