const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

module.exports = async function periodScenario({ request, requestRaw, authHeaders }) {
  const read = url => request(url, { headers: authHeaders });
  const send = (method, url, body) => request(url, { method, headers: authHeaders, body: JSON.stringify(body) });
  for (const url of ['/api/contabilidad/asientos?periodo=2026-13', '/api/reportes/balance-comprobacion?anio=x', '/api/contabilidad/antiguedad?fecha_corte=2026-02-30']) {
    await assert.rejects(read(url), /422/);
  }
  const client = await send('POST', '/api/clientes', { nombre: 'QA periodos contables', tipo: 'jur\u00eddica', ruc: 'QA-PERIODOS', estado: 'activo' });
  const cid = client.id;
  assert(cid);
  const account = await require('./bankAccountFixture').createAccount(request, authHeaders, cid);
  const base = { cliente_id: cid, banco: 'Banco General', metodo_pago: 'transferencia', estado_pago: 'pendiente', tasa_itbms: 0.07, categoria_contable: 'honorarios' };
  const invoice = await send('POST', '/api/transacciones', { ...base, tipo: 'ingreso', fecha: '2028-12-20', descripcion: 'QA ingreso diciembre cobrado enero', monto: 1000, itbms: 70 });
  await send('POST', `/api/transacciones/${invoice.id}/cuenta`, { cuenta_bancaria_id: account.id, motivo: 'QA cuenta confirmada con soporte bancario' });
  const expense = await send('POST', '/api/transacciones', { ...base, tipo: 'gasto', fecha: '2028-12-22', descripcion: 'QA gasto diciembre pagado febrero', monto: 200, itbms: 14, deducible: true, categoria_contable: 'alquiler' });
  await send('POST', `/api/transacciones/${expense.id}/cuenta`, { cuenta_bancaria_id: account.id, motivo: 'QA cuenta del proveedor confirmada antes del cierre' });
  const scope = period => `periodo=${period}&cliente_id=${cid}`;
  const originalDecember = await read(`/api/contabilidad/asientos?${scope('2028-12')}`);
  assert.equal(originalDecember.total_asientos, 2);
  const closedDecember = await send('PUT', `/api/contabilidad/cierre-estado?${scope('2028-12')}`, { estado: 'cerrado', nota: 'CPA confirma CxC 1070 y CxP 214 al cierre.' });
  assert.equal(closedDecember.data.estado, 'cerrado');
  assert.equal((await read(`/api/contabilidad/cierre-estado?${scope('2028-12')}`)).data.id, closedDecember.data.id);
  const daily = await read(`/api/transacciones/diario?${scope('2028-12')}`);
  assert(daily.entradas.every(day => /^2028-12-\d{2}$/.test(day.fecha)));
  await assert.rejects(send('PUT', `/api/transacciones/${invoice.id}`, { monto: 10 }), /409/);
  const paid = await send('PUT', `/api/transacciones/${invoice.id}`, { estado_pago: 'pagado', fecha_pago: '2029-01-08', metodo_pago: 'transferencia', banco: 'Banco General', referencia_pago: 'QA-COBRO-ENERO' });
  assert.equal(paid.periodo, '2028-12');
  assert.equal(paid.fecha_pago, '2029-01-08');
  assert.deepEqual(await read(`/api/contabilidad/asientos?${scope('2028-12')}`), originalDecember);
  const january = await read(`/api/contabilidad/asientos?${scope('2029-01')}`);
  assert.equal(january.total_asientos, 1);
  assert.equal(january.data[0].tipo_asiento, 'cobro');
  assert.equal(january.data[0].fecha, '2029-01-08');
  const janAging = await read(`/api/contabilidad/antiguedad?${scope('2029-01')}`);
  assert.equal(janAging.fecha_corte, '2029-01-31');
  assert.equal(janAging.total_por_cobrar, 0);
  assert.equal(janAging.total_por_pagar, 214);
  const historical = await read(`/api/contabilidad/antiguedad?${scope('2029-01')}&fecha_corte=2028-12-31`);
  assert.equal(historical.total_por_cobrar, 1070);
  const bank = await send('POST', '/api/movimientos-bancarios', { cliente_id: cid, cuenta_bancaria_id: account.id, idempotencia: require('node:crypto').randomUUID(), fecha: '2029-01-08', descripcion: 'QA deposito enero', tipo: 'credito', monto: 1070, banco: 'Banco General', referencia: 'QA-COBRO-ENERO' });
  const recon = await read('/api/fiscal/conciliacion?periodo=2029-01');
  assert(recon.transacciones_pendientes.some(tx => tx.id === invoice.id));
  assert.equal(recon.resumen.find(b => b.banco === 'Banco General').saldo_contable, 1070);
  assert.equal((await read('/api/fiscal/conciliacion?periodo=2028-12')).resumen.length, 0);
  await send('POST', '/api/conciliacion/match', { transaccion_id: invoice.id, movimiento_id: bank.id });
  assert.deepEqual(await read(`/api/contabilidad/asientos?${scope('2028-12')}`), originalDecember);
  await send('PUT', `/api/contabilidad/cierre-estado?${scope('2029-01')}`, { estado: 'cerrado', nota: 'Cobro enero conciliado; proveedor pendiente.' });
  await assert.rejects(send('PUT', `/api/transacciones/${invoice.id}`, { conciliado: false }), /409/);
  await assert.rejects(send('PUT', `/api/transacciones/${expense.id}`, { estado_pago: 'pagado', fecha_pago: '2029-01-31' }), /409/);
  await assert.rejects(send('PUT', `/api/transacciones/${expense.id}`, { estado_pago: 'pagado', fecha_pago: '2028-12-01' }), /422/);
  await send('PUT', `/api/transacciones/${expense.id}`, { estado_pago: 'pagado', fecha_pago: '2029-02-04', metodo_pago: 'transferencia', banco: 'Banco General' });
  const januaryAfterPayment = await read(`/api/contabilidad/antiguedad?${scope('2029-01')}`);
  assert.equal(januaryAfterPayment.total_por_pagar, 214);
  const janLedger = await read(`/api/contabilidad/mayor/1030?${scope('2029-01')}`);
  assert.equal(janLedger.saldo_inicial, 1070);
  assert.equal(janLedger.haber, 1070);
  assert.equal(janLedger.saldo, 0);
  assert.equal(janLedger.data[0].saldo, 0);
  const summary = await read(`/api/contabilidad/resumen-mensual?anio=2029&cliente_id=${cid}`);
  assert.equal(summary.totales.ingresos, 0);
  assert.equal(summary.totales.gastos, 0);
  assert.equal(summary.totales.cuentas_por_pagar, 0);
  assert.equal(summary.data[0].cuentas_por_pagar, 214);
  assert.equal(summary.totales.total_asientos, 2);
  for (const month of summary.data) {
    const balance = await read(`/api/contabilidad/balance-comprobacion?${scope(month.periodo)}`);
    const aging = await read(`/api/contabilidad/antiguedad?${scope(month.periodo)}`);
    assert.equal(balance.cuentas.find(a => a.cuenta_codigo === '1030').saldo, aging.total_por_cobrar);
    assert.equal(-balance.cuentas.find(a => a.cuenta_codigo === '2010').saldo || 0, aging.total_por_pagar);
  }
  const other = await send('POST', '/api/clientes', { nombre: 'QA cliente sin movimientos', tipo: 'natural', ruc: 'QA-OTRO-PERIODOS' });
  assert.equal((await read(`/api/contabilidad/balance-comprobacion?anio=2029&cliente_id=${other.id}`)).cuentas.length, 0);
  const pdfs = [
    ['balance', `/api/reportes/balance-comprobacion?${scope('2029-01')}`],
    ['mayor-cxc', `/api/reportes/mayor/1030?${scope('2029-01')}`],
    ['mayor-general', `/api/reportes/mayor-general?${scope('2029-01')}`],
    ['resumen-anual', `/api/reportes/resumen-mensual?anio=2029&cliente_id=${cid}`],
  ];
  for (const [name, url] of pdfs) {
    const response = await requestRaw(url, { headers: authHeaders });
    assert.equal(response.headers.get('content-type'), 'application/pdf');
    const buffer = Buffer.from(await response.arrayBuffer());
    assert.equal(buffer.subarray(0, 4).toString(), '%PDF');
    if (process.env.CONTAPANAMA_PERIOD_QA_OUTPUT) {
      fs.mkdirSync(process.env.CONTAPANAMA_PERIOD_QA_OUTPUT, { recursive: true });
      fs.writeFileSync(path.join(process.env.CONTAPANAMA_PERIOD_QA_OUTPUT, `${name}.pdf`), buffer);
    }
  }
  console.log('Cross-period API tests passed: closed invoice, later collection, reconciliation, locked payment month, 12 balances and 4 PDFs');
};
