const qaCredentials = require('./helpers/qaCredentials');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

module.exports = async function bankAccountsScenario({ request, requestRaw, authHeaders, check, snapshot, withSaveFailure, installBank, clearLegacyAccount, setRole, db, outputDirectory }) {
  const read = url => request(url, { headers: authHeaders });
  const send = (url, body, headers = authHeaders) => request(url, { method: 'POST', headers, body: JSON.stringify(body) });
  const uid = (await read('/api/auth/me')).id;
  const client = await send('/api/clientes', { nombre: 'QA CUENTAS SEPARADAS', tipo: 'natural', ruc: 'QA-ACCOUNT-ISOLATION' });
  const otherClient = await send('/api/clientes', { nombre: 'QA CUENTA AJENA', tipo: 'natural', ruc: 'QA-ACCOUNT-FOREIGN' });
  const accountPayload = { cliente_id: client.id, nombre: 'Operativa principal', banco: 'Banco General',
    numero: '1234-5678-9012', tipo: 'corriente', moneda: 'USD', idempotencia: randomUUID() };
  const created = await Promise.all(Array.from({ length: 8 }, () => send('/api/cuentas-bancarias', accountPayload)));
  assert.equal(new Set(created.map(a => a.id)).size, 1);
  assert.equal(created.filter(a => !a.repetido).length, 1);
  const account = created[0];
  assert.equal(account.numero, '123456789012');
  await assert.rejects(send('/api/cuentas-bancarias', { ...accountPayload, nombre: 'Otro nombre' }), /409/);
  await assert.rejects(send('/api/cuentas-bancarias', { ...accountPayload, numero: '1234 5678 9012', idempotencia: randomUUID() }), /409/);
  await assert.rejects(send('/api/cuentas-bancarias', { ...accountPayload, banco: 'banco general', idempotencia: randomUUID() }), /409/);
  await assert.rejects(send('/api/cuentas-bancarias', { ...accountPayload, moneda: 'EUR', idempotencia: randomUUID() }), /422/);
  const account2 = await send('/api/cuentas-bancarias', { ...accountPayload, nombre: 'Reserva secundaria', numero: '123456783456', tipo: 'ahorros', idempotencia: randomUUID() });
  const foreign = await require('./bankAccountFixture').createAccount(request, authHeaders, otherClient.id);
  check('account registry normalizes numbers, rejects duplicates and unsupported currencies; eight retries create one identity');

  const instant = { cliente_id: client.id, fecha: '2042-05-01', tipo: 'gasto', descripcion: 'ACCOUNT-INITIAL-SETTLEMENT',
    monto: 20, itbms: 0, tasa_itbms: 0, categoria_itbms: 'exento', estado_pago: 'pagado',
    fecha_pago: '2042-05-02', metodo_pago: 'transferencia', banco: account.banco };
  const beforeInvalid = await snapshot(uid);
  for (const [body, status] of [
    [instant, 422], [{ ...instant, cuenta_bancaria_id: 'bad' }, 422],
    [{ ...instant, cuenta_bancaria_id: foreign.id }, 409],
    [{ ...instant, cuenta_bancaria_id: randomUUID() }, 404],
    [{ ...instant, cuenta_bancaria_id: account.id, metodo_pago: 'efectivo' }, 422],
    [{ ...instant, cuenta_bancaria_id: account.id, banco: 'BAC' }, 409],
  ]) await assert.rejects(send('/api/transacciones', body), new RegExp(String(status)));
  assert.deepEqual(await snapshot(uid), beforeInvalid);
  const instantPaid = await send('/api/transacciones', { ...instant, cuenta_bancaria_id: account.id });
  assert.equal((await read(`/api/transacciones/${instantPaid.id}/pagos`)).pagos[0].cuenta_bancaria_id, account.id);
  const cashPaid = await send('/api/transacciones', { ...instant, descripcion: 'ACCOUNT-INITIAL-CASH', metodo_pago: 'efectivo', banco: '' });
  assert.equal((await read(`/api/transacciones/${cashPaid.id}/pagos`)).pagos[0].cuenta_bancaria_id, null);
  const initialPending = await send('/api/transacciones', { ...instant, estado_pago: 'pendiente', fecha_pago: null });
  const updateUrl = `/api/transacciones/${initialPending.id}`;
  const settle = { estado_pago: 'pagado', fecha_pago: instant.fecha_pago, metodo_pago: instant.metodo_pago, banco: instant.banco };
  const update = body => request(updateUrl, { method: 'PUT', headers: authHeaders, body: JSON.stringify(body) });
  const unchangedPending = await snapshot(uid);
  await assert.rejects(update(settle), /422/);
  await assert.rejects(update({ ...settle, cuenta_bancaria_id: account.id }), /422/);
  await assert.rejects(update({ ...settle, descripcion: 'No bypass with combined correction',
    motivo_ajuste: 'Revision combinada del soporte inicial', revision_esperada: (await read(updateUrl + '/revision')).revision }), /422/);
  assert.deepEqual(await snapshot(uid), unchangedPending);
  await send(updateUrl + '/cuenta', { cuenta_bancaria_id: account.id, motivo: 'Cuenta del pago inicial confirmada con soporte' });
  await update(settle);
  assert.equal((await read(updateUrl + '/pagos')).pagos[0].cuenta_bancaria_id, account.id);
  check('initial cash and bank settlement persist correctly; missing, foreign, invalid or mismatched accounts roll back, including combined PUT corrections');

  const bankBody = { cliente_id: client.id, cuenta_bancaria_id: account.id, fecha: '2041-01-10', banco: account.banco,
    descripcion: 'ACCOUNT-BANK-PRIMARY', tipo: 'credito', monto: 100, referencia: 'ACC-PRIMARY' };
  const batch = { idempotencia: randomUUID(), movimientos: [bankBody, { ...bankBody, descripcion: 'ACCOUNT-BANK-SECONDARY', cuenta_bancaria_id: account2.id }] };
  const journalUrl = `/api/contabilidad/asientos?anio=2041&cliente_id=${client.id}`;
  const journalBeforeImport = await read(journalUrl);
  const imports = await Promise.all(Array.from({ length: 8 }, () => send('/api/movimientos-bancarios/bulk', batch)));
  assert.equal(imports.filter(r => !r.repetido).length, 1);
  for (const imported of imports) assert.deepEqual(imported.data.map(m => m.id), imports[0].data.map(m => m.id));
  const [bank, secondBank] = imports[0].data;
  const bankUrl = `/api/movimientos-bancarios?cliente_id=${client.id}`;
  assert.equal((await read(bankUrl)).total, 2);
  assert.deepEqual(await read(journalUrl), journalBeforeImport);
  const saved = await snapshot(uid);
  assert.equal(saved.operaciones_bancarias.filter(o => o.idempotencia === batch.idempotencia).length, 1);
  assert.equal(saved.audit_events.filter(e => [bank.id, secondBank.id].includes(e.objeto_id)).length, 2);
  for (const changed of [
    { ...batch, movimientos: batch.movimientos.toReversed() },
    { ...batch, movimientos: [{ ...bankBody, monto: 101 }] },
    { ...batch, movimientos: [{ ...bankBody, cuenta_bancaria_id: account2.id }] },
  ]) await assert.rejects(send('/api/movimientos-bancarios/bulk', changed), /409/);
  await assert.rejects(send('/api/movimientos-bancarios', { ...bankBody, idempotencia: batch.idempotencia }), /409/);
  await assert.rejects(send('/api/movimientos-bancarios', bankBody), /422/);
  await assert.rejects(send('/api/movimientos-bancarios', { ...bankBody, cuenta_bancaria_id: null, idempotencia: randomUUID() }), /422/);
  await assert.rejects(send('/api/movimientos-bancarios/bulk', { idempotencia: randomUUID(),
    movimientos: [bankBody, { ...bankBody, cuenta_bancaria_id: foreign.id }] }), /409/);
  assert.deepEqual(await snapshot(uid), saved);
  check('eight import retries persist one batch, two movements and two audits; altered payload, missing key and cross-client batch leave no changes');

  const document = await send('/api/transacciones', { cliente_id: client.id, fecha: '2041-01-02', tipo: 'ingreso',
    descripcion: 'ACCOUNT-DOCUMENT', monto: 100, itbms: 0, tasa_itbms: 0, categoria_itbms: 'exento', estado_pago: 'pendiente', banco: account.banco });
  const paymentUrl = `/api/transacciones/${document.id}/pagos`;
  const paymentPayload = { importe: 100, fecha: bankBody.fecha, banco: account.banco, metodo_pago: 'transferencia',
    cuenta_bancaria_id: account.id, idempotencia: randomUUID() };
  await assert.rejects(send(paymentUrl, { ...paymentPayload, cuenta_bancaria_id: null }), /422/);
  await assert.rejects(send(paymentUrl, { ...paymentPayload, cuenta_bancaria_id: foreign.id }), /409/);
  await assert.rejects(send(paymentUrl, { ...paymentPayload, cuenta_bancaria_id: randomUUID() }), /404/);
  const paid = await send(paymentUrl, paymentPayload);
  await assert.rejects(send(paymentUrl, { ...paymentPayload, cuenta_bancaria_id: account2.id }), /409/);
  const matchUrl = `${paymentUrl}/${paid.pagos[0].id}/conciliar`;
  await assert.rejects(send(matchUrl, { movimiento_id: secondBank.id }), /409.*otra cuenta/);
  const reportUrl = `/api/fiscal/conciliacion?anio=2041&cliente_id=${client.id}`;
  const beforeMatch = await read(reportUrl);
  assert.equal(beforeMatch.resumen.length, 2);
  assert.equal(beforeMatch.sugerencias.length, 1);
  assert.equal(beforeMatch.sugerencias[0].movimiento_id, bank.id);
  assert.equal(beforeMatch.alcance_conciliacion, 'movimientos_por_cuenta');
  const filteredUrl = reportUrl + '&cuenta_bancaria_id=' + account2.id;
  const filtered = await read(filteredUrl);
  assert.equal(filtered.movimientos_periodo.length, 1);
  assert.equal(filtered.registros_contables.length, 0);
  assert.equal(filtered.sugerencias.length, 0);
  assert(filtered.cuenta_nombre.includes('***3456'));
  assert.equal((await read(bankUrl + '&cuenta_bancaria_id=' + account.id)).total, 1);
  for (const key of [randomUUID(), foreign.id]) await assert.rejects(read(reportUrl + '&cuenta_bancaria_id=' + key), /404/);
  await assert.rejects(read(reportUrl + '&cuenta_bancaria_id=bad'), /422/);
  const journalBeforeMatch = await read(journalUrl);
  const storedJournal = state => Object.fromEntries(['asientos_contables','asiento_lineas','folios_libro'].map(table => [table,state[table] || []]));
  const persistedBeforeMatch = storedJournal(await snapshot(uid));
  await send(matchUrl, { movimiento_id: bank.id });
  const afterMatch = await read(journalUrl);
  const withoutLiveFlags = result => ({ ...result, data: result.data.map(({ conciliado, ...entry }) => entry) });
  assert.deepEqual(withoutLiveFlags(afterMatch), withoutLiveFlags(journalBeforeMatch));
  assert.deepEqual(storedJournal(await snapshot(uid)), persistedBeforeMatch);
  const matched = await read(reportUrl);
  assert.equal(matched.resumen.find(r => r.cuenta_bancaria_id === account.id).estado, 'movimientos_vinculados');
  assert.equal(matched.saldo_verificado, false);
  check('equal-amount payments cannot cross two accounts at the same bank; scoped month/year flows remain distinct and matching does not repost journal');

  const legacy = await send('/api/transacciones', { cliente_id: client.id, fecha: '2041-02-01', tipo: 'ingreso',
    descripcion: 'ACCOUNT-LEGACY-PAYMENT', monto: 10, itbms: 0, tasa_itbms: 0, estado_pago: 'pagado',
    banco: account.banco, cuenta_bancaria_id:account.id, metodo_pago: 'transferencia', fecha_pago: '2041-02-02' });
  await clearLegacyAccount(legacy.id);
  const unassigned = (await read(reportUrl)).transacciones_pendientes.find(p => p.id === legacy.id);
  assert.equal(unassigned.cuenta_bancaria_id, null);
  assert.equal(unassigned.cuenta_nombre, 'Sin cuenta asignada');
  const beforeAssignment = await read(journalUrl);
  const assignment = { cuenta_bancaria_id: account.id, motivo: 'Cuenta confirmada con soporte del cobro historico' };
  await assert.rejects(send(`/api/transacciones/${legacy.id}/cuenta`, { ...assignment, motivo: 'x' }), /422/);
  await send(`/api/transacciones/${legacy.id}/cuenta`, assignment);
  await send(`/api/transacciones/${legacy.id}/cuenta`, assignment);
  await assert.rejects(send(`/api/transacciones/${legacy.id}/cuenta`, { ...assignment, cuenta_bancaria_id: account2.id }), /409/);
  assert.deepEqual(await read(journalUrl), beforeAssignment);
  assert.equal((await snapshot(uid)).audit_events.filter(e => e.objeto_id === legacy.id && e.accion === 'documento_cuenta_asignada').length, 1);
  const secondLegacy = await send('/api/transacciones', { ...legacy, id: undefined, descripcion: 'ACCOUNT-LEGACY-CONVERSION', cuenta_bancaria_id: account.id });
  await clearLegacyAccount(secondLegacy.id);
  const beforeConversion = await read(journalUrl);
  await send(`/api/transacciones/${secondLegacy.id}/pagos/${secondLegacy.id}/cuenta`, assignment);
  assert.deepEqual(await read(journalUrl), beforeConversion);
  assert.equal((await read(`/api/transacciones/${secondLegacy.id}/pagos`)).pagos[0].cuenta_bancaria_id, account.id);
  check('unassigned legacy receipts remain visible; explicit audited assignment and conversion preserve original journal IDs, hashes and folios');

  const historicalBank = { ...bankBody, id: randomUUID(), usuario_id: uid, cliente_id: null, cuenta_bancaria_id: null,
    fecha: '2041-02-05', descripcion: 'ACCOUNT-LEGACY-BANK', conciliado: false, transaccion_id: null, created_at: new Date().toISOString() };
  await installBank(historicalBank);
  const bankAssignmentUrl = `/api/movimientos-bancarios/${historicalBank.id}/cuenta`;
  const bankAssignment = { cuenta_bancaria_id: account.id, motivo: 'Cliente y cuenta confirmados con extracto historico' };
  const beforeBankAssignment = storedJournal(await snapshot(uid));
  await assert.rejects(send(bankAssignmentUrl, { ...bankAssignment, motivo: '' }), /422/);
  const assignedBank = await send(bankAssignmentUrl, bankAssignment);
  assert.equal(assignedBank.cliente_id, client.id); assert.equal(assignedBank.cuenta_bancaria_id, account.id);
  await send(bankAssignmentUrl, bankAssignment);
  await assert.rejects(send(bankAssignmentUrl, { ...bankAssignment, cuenta_bancaria_id: account2.id }), /409/);
  assert.equal((await snapshot(uid)).audit_events.filter(e => e.objeto_id === historicalBank.id && e.accion === 'movimiento_cuenta_asignada').length, 1);
  assert.deepEqual(storedJournal(await snapshot(uid)), beforeBankAssignment);
  const originalRole = (await read('/api/auth/me')).rol;
  await setRole(uid, 'cliente');
  try {
    await assert.rejects(send('/api/cuentas-bancarias', { ...accountPayload, numero: '00009999', idempotencia: randomUUID() }), /403/);
    await assert.rejects(send(`/api/cuentas-bancarias/${account.id}/estado`, { activa:false, motivo:'QA sin permisos contables para archivar' }), /403/);
    await assert.rejects(send(bankAssignmentUrl, bankAssignment), /403/);
    await assert.rejects(send(`/api/transacciones/${legacy.id}/cuenta`, assignment), /403/);
  } finally { await setRole(uid, originalRole); }
  check('legacy bank account assignment requires explicit owner and reason, audits once, cannot be reassigned and is restricted to accountants');

  const failedBatch = { idempotencia: randomUUID(), movimientos: [{ ...bankBody, fecha: '2041-03-01', descripcion: 'ACCOUNT-FAIL-ROLLBACK' }] };
  const beforeFailure = await snapshot(uid);
  await withSaveFailure(async () => {
    await assert.rejects(send('/api/movimientos-bancarios/bulk', failedBatch), /50[03]/);
    assert.deepEqual(await snapshot(uid), beforeFailure);
  });
  const recovered = await send('/api/movimientos-bancarios/bulk', failedBatch);
  assert.equal(recovered.total, 1);
  assert.equal(recovered.repetido, false);
  check('failure during durable save rolls back imported rows, operation key and audit; the same request succeeds after recovery');

  if (db) {
    await assert.rejects(db.query('UPDATE cuentas_bancarias SET numero=$2 WHERE id=$1', [account.id, '00009999']), e => e.code === '23514');
    await assert.rejects(db.query('DELETE FROM cuentas_bancarias WHERE id=$1', [account.id]), e => e.code === '23514');
    await assert.rejects(db.query('UPDATE operaciones_bancarias SET resultado_json=$2 WHERE usuario_id=$1', [uid, '{}']), e => e.code === '23514');
    await assert.rejects(db.query('DELETE FROM operaciones_bancarias WHERE usuario_id=$1', [uid]), e => e.code === '23514');
    await assert.rejects(db.query('UPDATE pagos_transacciones SET cuenta_bancaria_id=$2 WHERE id=$1', [paid.pagos[0].id, account2.id]), e => e.code === '23514');
    await assert.rejects(db.query('UPDATE movimientos_bancarios SET cuenta_bancaria_id=$2 WHERE id=$1', [bank.id, account2.id]), e => e.code === '23514');
    await assert.rejects(db.query('UPDATE transacciones SET cliente_id=$2 WHERE id=$1', [document.id, otherClient.id]), e => e.code === '23514');
    check('SQL guards reject account identity edits, account/operation deletion, payment reassignment and document owner drift');
  }
  const pendingDocument = await send('/api/transacciones', { cliente_id: client.id, fecha: '2041-04-01', tipo: 'ingreso',
    descripcion: 'ACCOUNT-ARCHIVED-PAYMENT', monto: 100, itbms: 0, tasa_itbms: 0, estado_pago: 'pendiente' });
  const archive = { activa: false, motivo: 'Cuenta archivada tras revisar el historial de prueba' };
  await send(`/api/transacciones/${pendingDocument.id}/cuenta`, { ...assignment, motivo: 'Asignacion previa al archivo de cuenta para probar pago total' });
  const archiveBank = await send('/api/movimientos-bancarios', { ...bankBody, fecha: '2041-04-02', idempotencia: randomUUID() });
  await send(`/api/cuentas-bancarias/${account.id}/estado`, archive);
  const beforeArchivedMatch = await snapshot(uid);
  await assert.rejects(send('/api/conciliacion/match', { transaccion_id: pendingDocument.id, movimiento_id: archiveBank.id }), /409.*archivada/);
  await assert.rejects(request(`/api/transacciones/${pendingDocument.id}`, { method: 'PUT', headers: authHeaders,
    body: JSON.stringify({ ...settle, fecha_pago: '2041-04-02' }) }), /409.*archivada/);
  assert.deepEqual(await snapshot(uid), beforeArchivedMatch);
  await assert.rejects(send('/api/transacciones', { ...instant, cuenta_bancaria_id: account.id }), /409.*archivada/);
  await assert.rejects(send('/api/movimientos-bancarios', { ...bankBody, idempotencia: randomUUID() }), /409.*archivada/);
  await assert.rejects(send(`/api/transacciones/${pendingDocument.id}/pagos`, { ...paymentPayload, fecha: '2041-04-02', idempotencia: randomUUID() }), /409.*archivada/);
  assert.equal((await send('/api/movimientos-bancarios/bulk', batch)).repetido, true);
  assert.equal((await send(paymentUrl, paymentPayload)).repetido, true);
  const other = await send('/api/auth/register', { nombre: 'QA Cuenta otro usuario', email: `accounts-${randomUUID()}@example.com`, password: qaCredentials.randomPassword() });
  const otherHeaders = { 'Content-Type': 'application/json', Authorization: 'Bearer ' + other.token };
  assert.equal((await request('/api/cuentas-bancarias', { headers: otherHeaders })).data.length, 0);
  await assert.rejects(request(reportUrl, { headers: otherHeaders }), /404/);
  await assert.rejects(send(`/api/cuentas-bancarias/${account.id}/estado`, archive, otherHeaders), /404|403/);
  check('archived accounts reject new movements but preserve history and exact retries; other users cannot see or modify them');

  const response = await requestRaw(`/api/reportes/conciliacion?anio=2041&cliente_id=${client.id}&cuenta_bancaria_id=${account2.id}`, { headers: authHeaders });
  const pdf = Buffer.from(await response.arrayBuffer());
  const text = require('./journalPdf.scenario').pdfText(pdf);
  assert(text.includes('Reserva secundaria')); assert(text.includes('***3456'));
  assert(text.includes('ACCOUNT-BANK-SECONDARY')); assert(!text.includes('ACCOUNT-BANK-PRIMARY'));
  assert(!text.includes('123456783456')); assert(!text.includes(otherClient.nombre));
  assert(text.includes('NO verificados'));
  if (outputDirectory) fs.writeFileSync(path.join(outputDirectory, 'conciliacion-cuenta-individual.pdf'), pdf);
  check('account PDF retains masked identity and excludes other accounts and clients without claiming certified balances');
  const packageResponse = await requestRaw(`/api/reportes/paquete-cierre?anio=2041&cliente_id=${client.id}`, { headers: authHeaders });
  assert.equal(packageResponse.status, 200);
  const packagePdf = Buffer.from(await packageResponse.arrayBuffer());
  const packageText = require('./journalPdf.scenario').pdfText(packagePdf);
  for (const label of ['Movimientos por cliente y cuenta', 'Operativa principal', 'Reserva secundaria', '***9012', '***3456']) assert(packageText.includes(label), label);
  assert(!packageText.includes(account.numero)); assert(!packageText.includes(account2.numero));
  assert(!packageText.includes(otherClient.nombre), 'A client closure package must not include another client directory row');
  const monthPackage = await requestRaw(`/api/reportes/paquete-cierre?periodo=2041-01&cliente_id=${client.id}`, { headers: authHeaders });
  assert.equal(monthPackage.status, 200);
  const monthText = require('./journalPdf.scenario').pdfText(Buffer.from(await monthPackage.arrayBuffer()));
  assert(monthText.includes(client.nombre)); assert(!monthText.includes(otherClient.nombre));
  if (outputDirectory) fs.writeFileSync(path.join(outputDirectory, 'paquete-cierre-cuentas.pdf'), packagePdf);
  check('monthly/annual closure package distinguishes accounts at the same bank with masked identities');
  await require('./bankClosing.scenario')({ request, requestRaw, authHeaders, check, snapshot, setRole, outputDirectory });
  const statements = await require('./bankStatements.scenario')({ request, requestRaw, authHeaders, check, snapshot, setRole, withSaveFailure, db });
  const subledger = await require('./bankSubledger.scenario')({ request, requestRaw, authHeaders, check, snapshot, withSaveFailure, db });
  return { endpoint: filteredUrl, expected: await read(filteredUrl), statements, subledger };
};
