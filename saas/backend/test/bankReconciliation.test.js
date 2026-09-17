const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { reconciliationReport, reconciliationScope } = require('../services/reconciliationReport');
const { prepareBankMovement, assertBankClient } = require('../services/bankMovement');

const a = randomUUID(), b = randomUUID();
const clients = [{ id: a, nombre: 'Empresa A' }, { id: b, nombre: 'Empresa B' }];
const accounts = [a,b].map(cliente_id => ({ id: randomUUID(), cliente_id, nombre: 'Operativa', numero: '00001234', tipo: 'corriente', moneda: 'USD', banco: 'Banco General' }));
const tx = { id: randomUUID(), cliente_id: a, fecha: '2040-01-02', tipo: 'ingreso', descripcion: 'Cobro A',
  monto: 100, itbms: 0, cuenta_bancaria_id: accounts[0].id, banco: 'Banco General', estado_pago: 'pagado', fecha_pago: '2040-01-05', metodo_pago: 'transferencia' };
const bank = { id: randomUUID(), cliente_id: a, cuenta_bancaria_id: accounts[0].id, fecha: '2040-01-05', tipo: 'credito', monto: 100, banco: 'Banco General', descripcion: 'Deposito A' };
const report = (txs, banks, scope = {}) => reconciliationReport(txs, banks, { periodo: '2040-01', ...scope }, clients, accounts);

test('separate identical bank names by client, without cross-client suggestions', () => {
  const r = report([tx], [bank, { ...bank, id: randomUUID(), cliente_id: b, cuenta_bancaria_id: accounts[1].id }]);
  assert.equal(r.resumen.length, 2);
  assert.equal(r.resumen.find(r => r.cliente_id === a).movimiento_neto_contable, 100);
  assert.equal(r.resumen.find(r => r.cliente_id === b).movimiento_neto_contable, 0);
  assert.equal(r.sugerencias.length, 1);
  assert(r.sugerencias.every(r => r.cliente_id === a));
  assert.equal(report([tx], [bank], { cliente_id: b }).resumen.length, 0);
  assert.throws(() => assertBankClient(tx, { ...bank, cliente_id: b }), /otro cliente/);
  assert.throws(() => assertBankClient(tx, { ...bank, cliente_id: null }), /Asigne/);
});
test('zero net difference is not a verified statement balance or proof of matching', () => {
  const r = report([tx], [bank]);
  assert.equal(r.resumen[0].diferencia, 0);
  assert.equal(r.resumen[0].estado, 'pendiente');
  assert.equal(r.saldo_verificado, false);
  const matched = report([{ ...tx, conciliado: true }], [{ ...bank, conciliado: true, transaccion_id: tx.id }]);
  assert.equal(matched.resumen[0].estado, 'movimientos_vinculados');
  assert.equal(matched.resumen[0].saldo_verificado, false);
  assert.equal(matched.movimientos_periodo.length, 1);
  assert.equal(matched.registros_contables.length, 1);
});
test('future bank match does not clear historical payments; prior pending bank rows carry forward', () => {
  const r = report([{ ...tx, conciliado: true }], [{ ...bank, fecha: '2040-02-01', conciliado: true, transaccion_id: tx.id },
    { ...bank, id: randomUUID(), fecha: '2039-12-01' }]);
  assert.equal(r.transacciones_pendientes.length, 1);
  assert.equal(r.movimientos_pendientes.length, 1);
  assert.equal(r.movimientos_pendientes[0].anterior_al_periodo, true);
  assert.equal(r.resumen[0].movimiento_neto_bancario, 0);
});
test('legacy flags without owned same-client links remain review exceptions', () => {
  const r = report([{ ...tx, conciliado: true }], [{ ...bank, conciliado: true, transaccion_id: tx.id, cliente_id: null }]);
  assert(r.transacciones_pendientes[0].requiere_revision);
  assert(r.movimientos_pendientes[0].requiere_revision);
  assert.equal(r.sugerencias.length, 0);
  assert(r.resumen.some(r => r.estado === 'sin_cliente'));
});
test('unpaid documents remain outside bank flows and payment pending totals', () => {
  const r = report([{ ...tx, estado_pago: 'pendiente', fecha_pago: null }], [bank]);
  assert.equal(r.documentos_sin_pago.length, 1);
  assert.equal(r.transacciones_pendientes.length, 0);
  assert.equal(r.resumen[0].movimiento_neto_contable, 0);
  assert.equal(r.sugerencias[0].registra_pago, true);
});
test('cancellation has two ledger events and no pending active payment at cutoff', () => {
  const payment = { id: randomUUID(), cuenta_bancaria_id: accounts[0].id, importe: 100, fecha: tx.fecha_pago, banco: tx.banco, metodo_pago: 'transferencia',
    anulado_fecha: '2040-01-20', conciliado: false };
  const r = report([{ ...tx, pagos: [payment] }], [bank]);
  assert.equal(r.registros_contables.length, 2);
  assert.equal(r.resumen[0].movimiento_neto_contable, 0);
  assert.equal(r.transacciones_pendientes.length, 0);
  assert.equal(r.movimientos_pendientes.length, 1);
});
test('invalid bank amounts, dates, client and direction fail before persistence', () => {
  for (const extra of [{ monto: '1.001' }, { monto: '-1' }, { monto: '1e3' }, { monto: '0' },
    { monto: '9999999999999' }, { tipo: 'deposito' }, { fecha: '2040-02-30' }, { fecha: '2040-01-01T12:00:00Z' },
    { cliente_id: null }, { banco: '' }]) assert.throws(() => prepareBankMovement({ ...bank, ...extra }));
  assert.equal(prepareBankMovement({ ...bank, monto: '123.45' }).monto, 123.45);
  for (const scope of [{ periodo: '2040-13' }, { anio: 'invalid' }, { cliente_id: 'invalid' },
    { periodo: '2040-01', anio: 2040 }]) assert.throws(() => reconciliationScope(scope));
});
test('all annual records remain available beyond former 8, 10 and 45 limits', () => {
  const banks = Array.from({ length: 60 }, (_, i) => ({ ...bank, id: randomUUID(), referencia: 'BANK-' + i }));
  const r = reconciliationReport([tx], banks, { anio: 2040, cliente_id: a }, clients, accounts);
  assert.equal(r.movimientos_pendientes.length, 60);
  assert.equal(r.movimientos_periodo.length, 60);
  assert.equal(r.sugerencias.length, 60);
});
