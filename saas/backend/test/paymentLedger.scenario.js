const qaCredentials = require('./helpers/qaCredentials');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

module.exports = async function paymentScenario({ request, requestRaw, authHeaders }) {
  const read = url => request(url, { headers: authHeaders });
  const send = (method, url, body) => request(url, { method, headers: authHeaders, body: JSON.stringify(body) });
  const client = await send('POST', '/api/clientes', { nombre: 'QA abonos multimes', tipo: 'jur\u00eddica', ruc: 'QA-ABONOS' });
  const account = await require('./bankAccountFixture').createAccount(request, authHeaders, client.id);
  const otherAccount = await require('./bankAccountFixture').createAccount(request, authHeaders, client.id, { banco: 'BAC' });
  const scope = period => `periodo=${period}&cliente_id=${client.id}`;
  const base = { cliente_id: client.id, fecha: '2030-12-20', banco: 'Banco General', metodo_pago: 'transferencia',
    estado_pago: 'pendiente', categoria_contable: 'honorarios', tasa_itbms: 0.07 };
  const invoice = await send('POST', '/api/transacciones', { ...base, tipo: 'ingreso', descripcion: 'QA cobro parcial multimes', monto: 1000, itbms: 70 });
  const expense = await send('POST', '/api/transacciones', { ...base, tipo: 'gasto', descripcion: 'QA pago parcial proveedor', monto: 200, itbms: 14, deducible: true, categoria_contable: 'alquiler' });
  const endpoint = `/api/transacciones/${invoice.id}/pagos`;
  const original = await read(`/api/contabilidad/asientos?${scope('2030-12')}`);
  await send('PUT', `/api/contabilidad/cierre-estado?${scope('2030-12')}`, { estado: 'cerrado', nota: 'Documentos pendientes de pago confirmados CPA.' });
  const payload = { importe: '400.00', cuenta_bancaria_id: account.id, fecha: '2031-01-08', metodo_pago: 'transferencia', banco: 'Banco General', referencia: 'ABONO-400', idempotencia: randomUUID() };
  const first = await send('POST', endpoint, payload);
  assert.equal(first.estado_pago, 'parcial'); assert.equal(first.saldo_pendiente, 670);
  const replay = await send('POST', endpoint, payload);
  assert.equal(replay.repetido, true); assert.equal(replay.pagos.length, 1);
  await assert.rejects(send('POST', endpoint, { ...payload, importe: '401' }), /409/);
  await assert.rejects(send('POST', endpoint, { ...payload, importe: '671', idempotencia: randomUUID() }), /409/);
  await assert.rejects(send('POST', endpoint, { ...payload, fecha: '2030-12-21', importe: '1', idempotencia: randomUUID() }), /409/);
  await assert.rejects(send('PUT', `/api/transacciones/${invoice.id}`, { monto: 9999 }), /409/);
  await assert.rejects(send('PUT', `/api/transacciones/${invoice.id}`, { conciliado: false }), /409/);
  await assert.rejects(send('DELETE', `/api/transacciones/${invoice.id}`), /409/);
  assert.deepEqual(await read(`/api/contabilidad/asientos?${scope('2030-12')}`), original);
  const bank = await send('POST', '/api/movimientos-bancarios', { cliente_id: client.id, cuenta_bancaria_id: account.id, idempotencia: randomUUID(), fecha: payload.fecha, tipo: 'credito', monto: 400, banco: 'Banco General', descripcion: 'QA abono banco 400', referencia: 'ABONO-400' });
  const wrongBank = await send('POST', '/api/movimientos-bancarios', { cliente_id: client.id, cuenta_bancaria_id: otherAccount.id, idempotencia: randomUUID(), fecha: payload.fecha, tipo: 'debito', monto: 400, banco: 'BAC', descripcion: 'QA banco incorrecto' });
  const p1 = first.pagos[0].id;
  const p1Url = `${endpoint}/${p1}`;
  await assert.rejects(send('POST', '/api/conciliacion/match', { transaccion_id: invoice.id, movimiento_id: bank.id }), /409/);
  await assert.rejects(send('POST', `${p1Url}/conciliar`, { movimiento_id: wrongBank.id }), /409/);
  await assert.rejects(send('POST', `${p1Url}/conciliar`, { movimiento_id: 'no-id' }), /422/);
  const reconciliation = await read('/api/fiscal/conciliacion?periodo=2031-01');
  assert(reconciliation.sugerencias.some(s => s.pago_id === p1 && s.movimiento_id === bank.id && s.monto === 400));
  assert.equal(reconciliation.resumen.find(r => r.banco === 'Banco General').saldo_contable, 400);
  await send('POST', `${p1Url}/conciliar`, { movimiento_id: bank.id });
  await assert.rejects(send('POST', `${p1Url}/anular`, { fecha: '2031-01-09', motivo: 'Registro duplicado' }), /409/);
  await send('POST', `${p1Url}/desconciliar`, {});
  assert((await read('/api/fiscal/conciliacion?periodo=2031-01')).movimientos_pendientes.some(m => m.id === bank.id));
  await send('POST', `${p1Url}/conciliar`, { movimiento_id: bank.id });
  await assert.rejects(send('POST', `${p1Url}/conciliar`, { movimiento_id: bank.id }), /409/);
  await assert.rejects(send('PUT', `/api/contabilidad/cierre-estado?${scope('2031-01')}`, { estado: 'cerrado' }), /409/);
  // The rejected candidate remains a real bank row and needs its own support.
  const bankExpense = await send('POST', '/api/transacciones', { cliente_id: client.id, fecha: payload.fecha,
    tipo: 'gasto', descripcion: 'QA soporte de debito BAC', monto: 400, itbms: 0, tasa_itbms: 0,
    categoria_contable: 'honorarios', deducible: true, estado_pago: 'pendiente',
    banco: 'BAC', metodo_pago: 'transferencia', cuenta_bancaria_id: otherAccount.id });
  await send('POST', '/api/conciliacion/match', { transaccion_id: bankExpense.id, movimiento_id: wrongBank.id });
  await send('PUT', `/api/contabilidad/cierre-estado?${scope('2031-01')}`, { estado: 'cerrado', nota: 'Abono de enero conciliado.' });
  await assert.rejects(send('POST', `${p1Url}/desconciliar`, {}), /409/);
  const cash = { importe: '670', fecha: '2031-02-08', metodo_pago: 'efectivo', referencia: 'CAJA-670', idempotencia: randomUUID() };
  const paid = await send('POST', endpoint, cash);
  assert.equal(paid.estado_pago, 'pagado'); assert.equal(paid.saldo_pendiente, 0);
  assert.equal(paid.total_pagado, 1070); assert.equal(paid.pagos.length, 2);
  const feb = await read(`/api/contabilidad/asientos?${scope('2031-02')}`);
  assert.equal(feb.data.length, 1); assert.equal(feb.data[0].lineas[0].cuenta_codigo, '1010');
  const p2 = paid.pagos.find(p => p.metodo_pago === 'efectivo').id;
  const voided = await send('POST', `${endpoint}/${p2}/anular`, { fecha: '2031-03-05', motivo: 'Cobro en caja duplicado' });
  assert.equal(voided.saldo_pendiente, 670); assert.equal(voided.estado_pago, 'parcial');
  assert.deepEqual(await read(`/api/contabilidad/asientos?${scope('2031-02')}`), feb);
  await assert.rejects(send('POST', endpoint, { ...cash, fecha: '2031-02-20', idempotencia: randomUUID() }), /409/);
  assert.equal((await send('POST', `${endpoint}/${p2}/anular`, { fecha: '2031-03-05', motivo: 'Cobro en caja duplicado' })).pagos.length, 2);
  const expenseUrl = `/api/transacciones/${expense.id}/pagos`;
  const expensePaid = await send('POST', expenseUrl, { ...cash, importe: '100', idempotencia: randomUUID() });
  assert.equal(expensePaid.saldo_pendiente, 114);
  const year = await read(`/api/contabilidad/resumen-mensual?anio=2031&cliente_id=${client.id}`);
  assert.equal(year.totales.ingresos, 0); assert.equal(year.totales.gastos, 400);
  assert.equal(year.data[0].cuentas_por_cobrar, 670);
  assert.equal(year.data[1].cuentas_por_cobrar, 0);
  assert.equal(year.data[2].cuentas_por_cobrar, 670);
  for (let month = 1; month <= 12; month++) {
    const q = scope(`2031-${String(month).padStart(2, '0')}`);
    const balance = await read(`/api/contabilidad/balance-comprobacion?${q}`);
    const aging = await read(`/api/contabilidad/antiguedad?${q}`);
    assert.equal(balance.cuentas.find(c => c.cuenta_codigo === '1030').saldo, aging.total_por_cobrar);
    assert.equal(-balance.cuentas.find(c => c.cuenta_codigo === '2010').saldo, aging.total_por_pagar);
  }
  const listed = await read(`/api/transacciones?cliente_id=${client.id}`);
  assert.equal(listed.data.find(t => t.id === invoice.id).saldo_pendiente, 670);
  const summary = await read(`/api/transacciones/resumen?cliente_id=${client.id}`);
  assert.equal(Number(summary.cuentas_por_cobrar), 670); assert.equal(Number(summary.cuentas_por_pagar), 114);
  const stranger = await send('POST', '/api/auth/register', { nombre: 'QA otro usuario pagos', email: `qa-payments-${Date.now()}@example.com`, password: qaCredentials.randomPassword() });
  const otherHeaders = { 'Content-Type': 'application/json', Authorization: `Bearer ${stranger.token}` };
  await assert.rejects(request(endpoint, { headers: otherHeaders }), /404/);
  await assert.rejects(request(endpoint, { method: 'POST', headers: otherHeaders, body: JSON.stringify(payload) }), /404/);
  const audit = await read(`/api/transacciones/${invoice.id}/auditoria`);
  assert.equal(audit.data.filter(e => e.accion === 'pago_registrado').length, 2);
  assert.equal(audit.data.filter(e => e.accion === 'pago_anulado').length, 1);
  for (const [name, route] of [
    ['antiguedad-abonos', '/api/reportes/antiguedad'],
    ['mayor-abonos', '/api/reportes/mayor/1030'],
  ]) {
    const response = await requestRaw(`${route}?${scope('2031-03')}`, { headers: authHeaders });
    const buffer = Buffer.from(await response.arrayBuffer());
    assert.equal(buffer.subarray(0, 4).toString(), '%PDF');
    if (process.env.CONTAPANAMA_PAYMENT_QA_OUTPUT) {
      fs.mkdirSync(process.env.CONTAPANAMA_PAYMENT_QA_OUTPUT, { recursive: true });
      fs.writeFileSync(path.join(process.env.CONTAPANAMA_PAYMENT_QA_OUTPUT, `${name}.pdf`), buffer);
    }
  }
  console.log('Payment API tests passed: partial receipts/payments, replay, bank linking, reversal, closed periods, audit, tenant isolation and 12 matching balances');
  return { endpoint, expected: await read(endpoint), authHeaders };
};
