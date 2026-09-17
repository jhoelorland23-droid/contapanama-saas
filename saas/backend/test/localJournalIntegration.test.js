const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const { randomUUID, createHash } = require('node:crypto');
const fs = require('node:fs');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'contapanama-local-journal-'));
const stateFile = path.join(temp, 'contapanama-state.json');
const reviewFile = path.join(root, '.local-data/contapanama-state.json');
const digest = file => fs.existsSync(file) ? createHash('sha256').update(fs.readFileSync(file)).digest('hex') : null;
const reviewBefore = digest(reviewFile);
const report = { started_at: new Date().toISOString(), checks: [] };
let server, base, token = '', output = '';
const check = name => { report.checks.push(name); console.log('PASS ' + name); };
const readDisk = () => JSON.parse(fs.readFileSync(stateFile, 'utf8'));

async function stop() {
  if (server && server.exitCode === null) { const done = once(server, 'exit'); server.kill(); await done; }
}
async function start() {
  const probe = net.createServer();
  probe.listen(0, '127.0.0.1');
  await once(probe, 'listening');
  const port = probe.address().port;
  await new Promise(resolve => probe.close(resolve));
  base = `http://127.0.0.1:${port}`;
  server = spawn(process.execPath, [path.join(root, 'server.local.js')], {
    cwd: root, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, PORT: String(port), HOST: '127.0.0.1', JWT_SECRET: require('node:crypto').randomBytes(32).toString('hex'),
      CONTAPANAMA_LOCAL_DATA_DIR: temp, CONTAPANAMA_LOCAL_PERSISTENCE: 'on' },
  });
  server.stdout.on('data', part => { output += part; });
  server.stderr.on('data', part => { output += part; });
  for (let i = 0; i < 150; i++) {
    try { if ((await fetch(base + '/health')).ok) return; } catch {}
    if (server.exitCode !== null) throw new Error(output);
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error('Local QA server did not start: ' + output);
}
// Synchronous PDF checks block this process past the API keep-alive timeout; a reused idle socket then resets.
const noKeepAlive = { Connection: 'close' };
async function request(url, body, method = body ? 'POST' : 'GET') {
  const response = await fetch(base + url, { method, headers: { ...noKeepAlive, 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(15000) });
  const data = await response.json();
  if (!response.ok) throw new Error(`${response.status}: ${data.error}`);
  return data;
}

async function main() {
  await start();
  token = (await request('/api/auth/login', { email: 'admin@contapanama.pa', password: process.env.CONTAPANAMA_QA_PASSWORD })).token;
  const user = await request('/api/auth/me');
  const initial = await request('/api/contabilidad/libro');
  assert.equal(initial.estado, 'pendiente_revision');
  await assert.rejects(request('/api/reportes/libro-diario?anio=2025'), /409.*incorpore/);
  assert.equal(initial.revision.documentos, 10);
  assert.equal(readDisk().asientos_contables.length, 0);
  const pending = readDisk().transacciones.find(tx => tx.estado_pago === 'pendiente');
  await request('/api/transacciones/' + pending.id, { descripcion: 'QA historial modificado',
    revision_esperada: (await request(`/api/transacciones/${pending.id}/revision`)).revision, motivo_ajuste: 'QA descripcion verificada con soporte' }, 'PUT');
  await assert.rejects(request('/api/contabilidad/libro/incorporar', {
    fingerprint: initial.revision.fingerprint, confirmacion: 'INCORPORAR LIBRO',
  }), /409.*cambiaron/);
  const preview = await request('/api/contabilidad/libro');
  const approval = { fingerprint: preview.revision.fingerprint, confirmacion: 'INCORPORAR LIBRO' };
  const approvals = await Promise.all([request('/api/contabilidad/libro/incorporar', approval), request('/api/contabilidad/libro/incorporar', approval)]);
  assert.equal(approvals[0].data.id, approvals[1].data.id);
  assert.equal(readDisk().libros_contables.length, 1);
  assert.equal(readDisk().asientos_contables.length, preview.revision.asientos);
  check('history stays unposted until CPA confirmation; stale and duplicate approvals handled correctly');

  const client = await request('/api/clientes', { nombre: 'QA libro local', ruc: 'QA-LOCAL-JOURNAL', tipo: 'natural' });
  const doc = await request('/api/transacciones', { cliente_id: client.id, fecha: '2038-01-02', tipo: 'ingreso',
    descripcion: 'QA libro local original', monto: 100, itbms: 0, tasa_itbms: 0, categoria_itbms: 'exento', estado_pago: 'pendiente' });
  const journalUrl = `/api/contabilidad/asientos?anio=2038&cliente_id=${client.id}`;
  const original = (await request(journalUrl)).data[0];
  assert(original.persistido);
  assert(readDisk().asientos_contables.some(e => e.id === original.id), 'Response must follow disk commit, not precede it');
  await request('/api/transacciones/' + doc.id, { monto: 200,
    revision_esperada: (await request(`/api/transacciones/${doc.id}/revision`)).revision, motivo_ajuste: 'QA importe revisado contra soporte' }, 'PUT');
  const corrected = await request(journalUrl);
  assert.equal(corrected.total_asientos, 3);
  assert.deepEqual(corrected.data.find(e => e.id === original.id), original);
  assert.equal(corrected.data.filter(e => e.rectifica_id === original.id).length, 1);
  const balance = await request(`/api/contabilidad/balance-comprobacion?anio=2038&cliente_id=${client.id}`);
  assert.equal(balance.cuentas.find(c => c.cuenta_codigo === '1030').saldo, 200);
  assert.equal((await request(`/api/contabilidad/resumen-mensual?anio=2038&cliente_id=${client.id}`)).data[0].total_asientos, 3);
  await assert.rejects(request('/api/transacciones/' + doc.id, null, 'DELETE'), /409.*asientos publicados/);
  assert.deepEqual(await request(journalUrl), corrected);
  check('local journal commits to disk before success; corrections preserve history and feed annual reports');

  const beforeFailure = digest(stateFile);
  fs.mkdirSync(stateFile + '.tmp');
  try {
    await assert.rejects(request('/api/transacciones', { fecha: '2038-01-03', tipo: 'ingreso', descripcion: 'QA disco bloqueado',
      monto: 10, itbms: 0, tasa_itbms: 0, estado_pago: 'pendiente' }), /503.*guardar/);
    assert.equal(digest(stateFile), beforeFailure);
    assert.deepEqual(await request(journalUrl), corrected);
  } finally { fs.rmdirSync(stateFile + '.tmp'); }
  check('actual filesystem save failure leaves documents, journal and audit unchanged');

  const payment = { importe: 50, fecha: '2038-02-01', metodo_pago: 'efectivo', idempotencia: randomUUID() };
  const paymentUrl = `/api/transacciones/${doc.id}/pagos`;
  await Promise.all(Array.from({ length: 8 }, () => request(paymentUrl, payment)));
  assert.equal((await request(paymentUrl)).pagos.length, 1);
  assert.equal(readDisk().pagos_transacciones.filter(p => p.transaccion_id === doc.id).length, 1);
  const afterPayment = await request(journalUrl);
  assert.equal(afterPayment.total_asientos, 4);
  assert.equal(afterPayment.data.filter(e => e.tipo_asiento === 'cobro').length, 1);
  const jan = await request(`/api/contabilidad/asientos?periodo=2038-01&cliente_id=${client.id}`);
  assert.deepEqual(jan.data, corrected.data);
  await request(`/api/contabilidad/cierre-estado?periodo=2038-01&cliente_id=${client.id}`, { estado: 'cerrado' }, 'PUT');
  await assert.rejects(request('/api/transacciones/' + doc.id, { monto: 300 }, 'PUT'), /409/);
  check('eight retries create one cash receipt; January history and closed period remain intact');

  const beforeRestart = digest(stateFile);
  await stop();
  await start();
  assert.equal(digest(stateFile), beforeRestart);
  assert.deepEqual(await request(journalUrl), afterPayment);
  check('local journal and historical totals survive backend restart');

  await stop();
  const goodState = fs.readFileSync(stateFile);
  const damaged = JSON.parse(goodState);
  const entry = damaged.asientos_contables.find(e => e.id === original.id);
  entry.cliente_nombre = 'QA alteration';
  fs.writeFileSync(stateFile, JSON.stringify(damaged));
  await start();
  await assert.rejects(request(journalUrl), /409.*integridad/);
  const pdfError = await fetch(base + `/api/reportes/balance-comprobacion?anio=2038&cliente_id=${client.id}`, { headers: { Authorization: `Bearer ${token}` } });
  assert.equal(pdfError.status, 409);
  assert((await fetch(base + '/health')).ok, 'Integrity failure must not crash the API');
  await assert.rejects(request('/api/reportes/libro-diario?anio=2038'), /409.*integridad/);
  await stop();
  fs.writeFileSync(stateFile, goodState);
  await start();
  assert.deepEqual(await request(journalUrl), afterPayment);
  check('tampered history is rejected by JSON and PDF endpoints without crashing the API');

  await stop();
  const drifted = JSON.parse(goodState);
  drifted.transacciones.find(t => t.id === doc.id).monto = 300;
  fs.writeFileSync(stateFile, JSON.stringify(drifted));
  await start();
  const beforeDriftWrite = digest(stateFile);
  await assert.rejects(request('/api/transacciones', { fecha: '2038-03-01', tipo: 'ingreso',
    descripcion: 'QA no incorporar alteracion externa', monto: 10, itbms: 0, estado_pago: 'pendiente' }), /409.*sin una correccion/);
  assert.equal(digest(stateFile), beforeDriftWrite);
  assert.deepEqual(await request(journalUrl), afterPayment);
  const drift = await request(`/api/contabilidad/consistencia?anio=2038&cliente_id=${client.id}`);
  assert.equal(drift.estado, 'divergente');
  assert.deepEqual(drift.pendientes.map(p => p.tipo_asiento), ['reversa_ajuste', 'documento']);
  assert.equal(drift.totales.documentos.ingresos, 300);
  assert.equal(drift.totales.libro.ingresos, 200);
  assert.equal((await request('/api/contabilidad/libro')).consistencia.estado, 'divergente');
  await stop();
  fs.writeFileSync(stateFile, goodState);
  await start();
  assert.equal((await request(`/api/contabilidad/consistencia?anio=2038&cliente_id=${client.id}`)).estado, 'consistente');
  assert.equal((await request('/api/contabilidad/libro')).consistencia.estado, 'consistente');
  check('unreviewed local source changes cannot be silently published by an unrelated write and are reported as documentos != libro');

  const other = await request('/api/auth/register', { nombre: 'QA otro usuario', email: 'qa-other-local@example.com', password: process.env.CONTAPANAMA_QA_PASSWORD });
  const ownerToken = token;
  token = other.token;
  assert.equal((await request('/api/contabilidad/libro')).estado, 'pendiente_revision');
  assert.equal((await request(journalUrl)).total_asientos, 0);
  await assert.rejects(request('/api/transacciones', { cliente_id: client.id, fecha: '2038-01-01', tipo: 'ingreso',
    descripcion: 'QA cliente ajeno', monto: 100, itbms: 0, tasa_itbms: 0, estado_pago: 'pendiente' }), /404/);
  const otherDoc = await request('/api/transacciones', { fecha: '2038-01-01', tipo: 'ingreso', descripcion: 'QA libro nuevo',
    monto: 100, itbms: 0, tasa_itbms: 0, estado_pago: 'pendiente' });
  assert.equal((await request('/api/contabilidad/libro')).data.metodo_incorporacion, 'libro_nuevo');
  assert(readDisk().asientos_contables.some(e => e.transaccion_id === otherDoc.id && e.usuario_id === other.user.id));
  token = ownerToken;
  const requestRaw = async (url, options = {}) => {
    const response = await fetch(base + url, { ...options, headers: { ...noKeepAlive, ...(options.headers || {}) }, signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error(`${response.status}: ${await response.text()}`);
    return response;
  };
  await require('./documentCorrection.scenario')({
    request: async (url, options) => (await requestRaw(url, options)).json(), requestRaw,
    authHeaders: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, check,
    outputDirectory: process.env.CONTAPANAMA_LOCAL_JOURNAL_QA_OUTPUT,
    withSaveFailure: async action => {
      const before = digest(stateFile);
      fs.mkdirSync(stateFile + '.tmp');
      try { await action(); assert.equal(digest(stateFile), before); }
      finally { fs.rmdirSync(stateFile + '.tmp'); }
    },
  });
  await require('./journalPdf.scenario')({
    request: async (url, options) => (await requestRaw(url, options)).json(), requestRaw,
    authHeaders: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, check,
    outputDirectory: process.env.CONTAPANAMA_LOCAL_JOURNAL_QA_OUTPUT,
  });
  await require('./entityBooks.scenario')({
    request: async (url, options) => (await requestRaw(url, options)).json(), requestRaw,
    authHeaders: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, check,
    outputDirectory: process.env.CONTAPANAMA_LOCAL_JOURNAL_QA_OUTPUT,
  });
  const editFixture = async action => {
    await stop();
    const value = readDisk(); action(value);
    fs.writeFileSync(stateFile, JSON.stringify(value));
    await start();
  };
  const legacyCheck = await require('./legacyEntityBooks.scenario')({
    request: async (url, options) => (await requestRaw(url, options)).json(), requestRaw, check,
    install: fixture => editFixture(value => { for (const [collection, rows] of Object.entries(fixture)) value[collection].push(...rows); }),
    setRole: (uid, rol) => editFixture(value => { value.usuarios.find(user => user.id === uid).rol = rol; }),
    snapshot: uid => Object.fromEntries(['transacciones', 'asientos_contables', 'asiento_lineas', 'libros_contables',
      'cierres_periodo', 'libros_entidad', 'folios_libro', 'audit_events'].map(collection =>
      [collection, (readDisk()[collection] || []).filter(row => row.usuario_id === uid)])),
    withSaveFailure: async action => {
      fs.mkdirSync(stateFile + '.tmp');
      try { await action(); } finally { fs.rmdirSync(stateFile + '.tmp'); }
    },
  });
  await require('./bankReconciliation.scenario')({
    request: async (url, options) => (await requestRaw(url, options)).json(), requestRaw,
    authHeaders: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, check,
    outputDirectory: process.env.CONTAPANAMA_LOCAL_JOURNAL_QA_OUTPUT,
    installBank: row => editFixture(value => { value.movimientos_bancarios.push(row); }),
    setRole: (uid, rol) => editFixture(value => { value.usuarios.find(user => user.id === uid).rol = rol; }),
  });
  const accountsCheck = await require('./bankAccounts.scenario')({
    request: async (url, options) => (await requestRaw(url, options)).json(), requestRaw,
    authHeaders: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, check,
    outputDirectory: process.env.CONTAPANAMA_LOCAL_JOURNAL_QA_OUTPUT,
    clearLegacyAccount: id => editFixture(value => { value.transacciones.find(t=>t.id===id).cuenta_bancaria_id=null; }),
    installBank: row => editFixture(value => { value.movimientos_bancarios.push(row); }),
    setRole: (uid, rol) => editFixture(value => { value.usuarios.find(user => user.id === uid).rol = rol; }),
    snapshot: uid => Object.fromEntries(Object.entries(readDisk()).map(([table, rows]) => [table, rows.filter(row => row.usuario_id === uid)])),
    withSaveFailure: async action => {
      const before = digest(stateFile);
      fs.mkdirSync(stateFile + '.tmp');
      try { await action(); assert.equal(digest(stateFile), before); }
      finally { fs.rmdirSync(stateFile + '.tmp'); }
    },
  });
  await stop(); await start();
  assert.deepEqual(await request(accountsCheck.endpoint), accountsCheck.expected);
  assert.deepEqual(await request(accountsCheck.statements.endpoint), accountsCheck.statements.expected);
  assert.deepEqual(await request(accountsCheck.subledger.endpoint), accountsCheck.subledger.expected);
  check('immutable bank account dimensions and twelve-month subledger survive local restart');
  const restoredStatement=await requestRaw('/api/extractos-bancarios/'+accountsCheck.statements.fileId+'/soporte',
    {headers:{Authorization:'Bearer '+token}});
  assert.equal(createHash('sha256').update(Buffer.from(await restoredStatement.arrayBuffer())).digest('hex'),accountsCheck.statements.pdfHash);
  check('statement directory, immutable versions and original PDF hash survive local restart');
  assert.deepEqual(await (await requestRaw(legacyCheck.endpoint, { headers: legacyCheck.headers })).json(), legacyCheck.expected);
  check('legacy client book identifiers and folios survive local backend restart');
  assert(readDisk().libros_contables.some(b => b.usuario_id === user.id));
  assert.equal(digest(reviewFile), reviewBefore);
  check('new books initialize on first document; foreign clients and journals remain isolated; review data untouched');
}

(async () => {
  try { await main(); report.passed = true; }
  catch (error) { report.passed = false; report.error = error.stack; console.error(error.stack); console.error(output.slice(-2500)); process.exitCode = 1; }
  finally {
    await stop();
    assert.equal(path.dirname(path.resolve(temp)), path.resolve(os.tmpdir()));
    assert(path.basename(temp).startsWith('contapanama-local-journal-'));
    fs.rmSync(temp, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    report.finished_at = new Date().toISOString();
    const directory = process.env.CONTAPANAMA_LOCAL_JOURNAL_QA_OUTPUT;
    if (directory) { fs.mkdirSync(directory, { recursive: true }); fs.writeFileSync(path.join(directory, 'results.json'), JSON.stringify(report, null, 2)); }
  }
})();
