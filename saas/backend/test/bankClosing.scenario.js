const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

module.exports = async function bankClosingScenario({ request, requestRaw, authHeaders, check, snapshot, setRole, outputDirectory }) {
  const read = url => request(url, { headers: authHeaders });
  const send = (method, url, body) => request(url, { method, headers: authHeaders, body: JSON.stringify(body) });
  const uid = (await read('/api/auth/me')).id;
  const client = await send('POST', '/api/clientes', { nombre: 'QA CIERRE BANCARIO', tipo: 'natural', ruc: 'QA-CIERRE-BANCO' });
  const account = await require('./bankAccountFixture').createAccount(request, authHeaders, client.id);
  const scope = `periodo=2045-01&cliente_id=${client.id}`;
  const closeUrl = '/api/contabilidad/cierre-estado?' + scope;
  const doc = await send('POST', '/api/transacciones', { cliente_id: client.id, fecha: '2045-01-02', tipo: 'ingreso',
    descripcion: 'QA-CIERRE-COBRO', monto: 100, itbms: 0, tasa_itbms: 0, categoria_contable: 'honorarios',
    estado_pago: 'pagado', fecha_pago: '2045-01-03', metodo_pago: 'transferencia', banco: account.banco, cuenta_bancaria_id: account.id });
  const first = await read('/api/contabilidad/cierre?' + scope);
  assert.equal(first.control_bancario.pagos_pendientes, 1);
  assert.equal(first.listo_para_cierre, false);
  const before = await snapshot(uid);
  await assert.rejects(send('PUT', closeUrl, { estado: 'cerrado' }), /409/);
  for (const extra of ['&hasta=2045-01-01', '&desde=2045-01-04', '&fecha_corte=2045-01-01', '&anio=2045']) {
    await assert.rejects(send('PUT', closeUrl + extra, { estado: 'cerrado' }), /422/);
  }
  assert.deepEqual(await snapshot(uid), before);
  check('closing rejects unmatched payments and partial-date or mixed-scope bypasses without changing journal, closure or audit');

  const feb = await read(`/api/contabilidad/cierre?periodo=2045-02&cliente_id=${client.id}`);
  const annual = await read(`/api/contabilidad/cierre?anio=2045&cliente_id=${client.id}`);
  const months = await read(`/api/contabilidad/resumen-mensual?anio=2045&cliente_id=${client.id}`);
  assert.equal(feb.control_bancario.pendientes_anteriores, 1);
  assert.equal(annual.pagados_sin_conciliar, 1);
  assert(months.data.every(row => row.control_bancario.pagos_pendientes === 1 && !row.listo_para_cierre));
  const portfolio = await read('/api/contabilidad/cartera?' + scope);
  assert.equal(portfolio.data.length, 1);
  assert.equal(portfolio.data[0].cliente_id, client.id);
  assert.equal(portfolio.data[0].conciliadas_count, 0);
  assert.equal((await read('/api/contabilidad/cierres-clientes?' + scope)).data[0].pagados_sin_conciliar, 1);
  check('monthly, annual, twelve-month summary and client portfolio expose the same bank exception including carry-forward');

  const role = (await read('/api/auth/me')).rol;
  await setRole(uid, 'cliente');
  try {
    for (const estado of ['cerrado', 'en_revision']) await assert.rejects(send('PUT', closeUrl, { estado }), /403/);
  } finally { await setRole(uid, role); }
  assert.deepEqual(await snapshot(uid), before);
  check('client role cannot close or reopen a period even with a previously issued token');

  const bank = await send('POST', '/api/movimientos-bancarios', { cliente_id: client.id, cuenta_bancaria_id: account.id,
    fecha: '2045-01-03', banco: account.banco, descripcion: 'QA-CIERRE-DEPOSITO', tipo: 'credito', monto: 100, idempotencia: randomUUID() });
  const unmatched = await read('/api/contabilidad/cierre?' + scope);
  assert.equal(unmatched.control_bancario.movimientos_pendientes, 1);
  await assert.rejects(send('PUT', closeUrl, { estado: 'cerrado' }), /409/);
  const report = await requestRaw('/api/reportes/cierre?' + scope, { headers: authHeaders });
  assert.equal(report.status, 200);
  const pdf = Buffer.from(await report.arrayBuffer());
  const text = require('./journalPdf.scenario').pdfText(pdf);
  assert(text.includes('Movimientos bancarios sin respaldo contable'));
  assert(text.includes('NO verificados'));
  assert(text.includes('Pagos o cobros sin conciliacion bancaria'));
  if (outputDirectory) fs.writeFileSync(path.join(outputDirectory, 'cierre-evidencia-bancaria.pdf'), pdf);
  check('closing PDF exposes orphan bank rows and does not certify statement balances');

  await send('POST', '/api/conciliacion/match', { transaccion_id: doc.id, movimiento_id: bank.id });
  const ready = await read('/api/contabilidad/cierre?' + scope);
  assert.equal(ready.control_bancario.movimientos_verificados, true);
  assert.equal(ready.control_bancario.saldo_verificado, false);
  assert.equal(ready.listo_para_cierre, true);
  const closed = await send('PUT', closeUrl, { estado: 'cerrado', nota: 'QA vinculo contable validado; no certifica saldos de extracto.' });
  assert.equal(closed.data.estado, 'cerrado');
  const recorded = (await snapshot(uid)).audit_events.find(e => e.objeto_id === closed.data.id && e.accion === 'periodo_contable_cerrado');
  assert.equal(recorded.despues_json.review.control_bancario.movimientos_verificados, true);
  assert.equal(recorded.despues_json.review.control_bancario.saldo_verificado, false);
  await assert.rejects(send('POST', '/api/movimientos-bancarios', { cliente_id: client.id, cuenta_bancaria_id: account.id,
    fecha: '2045-01-10', banco: account.banco, descripcion: 'QA-BLOQUEADO', tipo: 'debito', monto: 1, idempotencia: randomUUID() }), /409/);
  check('a unique valid link passes bookkeeping closure, records bank evidence in audit, and locks subsequent bank writes');
};
