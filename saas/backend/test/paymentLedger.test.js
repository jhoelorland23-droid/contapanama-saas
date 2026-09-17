const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { preparePayment, paymentSummary, outstandingAt, paymentsFor, validateTimeline } = require('../services/paymentLedger');
const { buildJournal, trialBalance, agingReport } = require('../services/accountingEngine');
const { reconciliationReport } = require('../services/reconciliationReport');
const { createLocalPaymentRepository } = require('../services/localPaymentRepository');

const tx = { id: randomUUID(), usuario_id: randomUUID(), cliente_id: randomUUID(), cliente_nombre: 'QA',
  fecha: '2030-12-20', periodo: '2030-12', descripcion: 'Factura QA', tipo: 'ingreso', estado_pago: 'pendiente',
  monto: 1000, itbms: 70, categoria_contable: 'honorarios', banco: 'Banco General' };
const accountId = randomUUID();
const body = (importe, fecha, extra = {}) => ({ importe, fecha, metodo_pago: 'transferencia', banco: 'Banco General',
  referencia: 'QA', idempotencia: randomUUID(), cuenta_bancaria_id: extra.metodo_pago === 'efectivo' ? null : accountId, ...extra });
const first = preparePayment(tx, body('400.00', '2031-01-08'), randomUUID());
const partial = { ...tx, pagos: [first] };
assert.equal(paymentSummary(partial).estado_pago, 'parcial');
assert.equal(outstandingAt(partial, '2030-12-31'), 1070);
assert.equal(outstandingAt(partial, '2031-01-31'), 670);
for (const bad of ['-1', '0', '1.001', 'NaN', 'Infinity', '1e3', '9999999999999999999']) {
  assert.throws(() => preparePayment(tx, body(bad, '2031-01-08'), randomUUID()));
}
assert.throws(() => preparePayment(partial, body('670.01', '2031-02-08'), randomUUID()), /saldo/);
assert.throws(() => preparePayment(tx, body('1', '2030-12-19'), randomUUID()), /fecha/);
assert.throws(() => preparePayment(tx, body('1', '2031-02-30'), randomUUID()), /fecha/);
assert.throws(() => preparePayment({ ...tx, estado_contable: 'borrador_ia' }, body('1', '2031-01-08'), randomUUID()), /borrador/);
assert.throws(() => preparePayment({ ...tx, estado_pago: 'parcial' }, body('1', '2031-01-08'), randomUUID()), /incompleto/);
const second = preparePayment(partial, body('670', '2031-02-08', { metodo_pago: 'efectivo', banco: '' }), randomUUID());
const settled = { ...tx, pagos: [first, second] };
assert.equal(paymentSummary(settled).estado_pago, 'pagado');
assert.equal(outstandingAt(settled, '2031-01-31'), 670);
assert.equal(outstandingAt(settled, '2031-02-28'), 0);
const journal = buildJournal([settled]);
assert.equal(journal.length, 3);
assert.equal(journal.filter(j => j.tipo_asiento === 'documento').length, 1);
assert.equal(journal.flatMap(j => j.lineas).filter(l => l.cuenta_codigo === '2020').length, 1);
assert.equal(trialBalance(journal).balanceado, true);
assert.equal(journal[2].lineas[0].cuenta_codigo, '1010');
const reversed = { ...settled, pagos: [first, { ...second, anulado_fecha: '2031-03-05', anulado_motivo: 'Duplicado' }] };
assert.equal(outstandingAt(reversed, '2031-02-28'), 0);
assert.equal(outstandingAt(reversed, '2031-03-31'), 670);
assert.equal(buildJournal([reversed], { periodo: '2031-03' })[0].tipo_asiento, 'reversa_cobro');
assert.equal(trialBalance(buildJournal([reversed])).balanceado, true);
assert.throws(() => preparePayment(reversed, body('670', '2031-02-20'), randomUUID()), /saldo/);
assert.doesNotThrow(() => preparePayment(reversed, body('670', '2031-03-06'), randomUUID()));
assert.equal(agingReport([reversed], { periodo: '2031-01' }).total_por_cobrar, 670);
const bank = { id: randomUUID(), cuenta_bancaria_id: accountId, cliente_id: tx.cliente_id, fecha: '2031-01-08', banco: 'Banco General', monto: 400, tipo: 'credito', conciliado: false };
const report = reconciliationReport([settled], [bank], { periodo: '2031-01' });
assert.equal(report.resumen[0].saldo_contable, 400);
assert.equal(report.sugerencias[0].pago_id, first.id);
assert.equal(report.sugerencias[0].monto, 400);
assert.equal(reconciliationReport([settled], [], { periodo: '2031-02' }).resumen[0].num_pendientes, 1);
assert.equal(paymentsFor({ ...tx, estado_pago: 'pagado', fecha_pago: '2031-01-01' })[0].legacy, true);

async function concurrency() {
  const state = { transacciones: [{ ...tx }], pagos_transacciones: [], movimientos_bancarios: [], audit_events: [] };
  const repo = createLocalPaymentRepository(state, () => null);
  const pay = () => repo.transaction(tx.usuario_id, async db => {
    const current = await db.get(tx.id);
    const p = preparePayment(current, body('600', '2031-01-08'), randomUUID());
    return db.save(current, [...paymentsFor(current), p], 'pago_registrado', current, {});
  });
  const results = await Promise.allSettled([pay(), pay()]);
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal(state.pagos_transacciones.length, 1);
  assert.equal(paymentSummary(repo.read(tx.usuario_id, tx.id)).saldo_pendiente, 470);
  validateTimeline(repo.read(tx.usuario_id, tx.id), state.pagos_transacciones);
  const prior = JSON.stringify(state);
  const brokenDisk = createLocalPaymentRepository(state, () => null, () => { throw new Error('Disk unavailable'); });
  await assert.rejects(brokenDisk.transaction(tx.usuario_id, async db => {
    const current = await db.get(tx.id);
    const p = preparePayment(current, body('100', '2031-01-09'), randomUUID());
    return db.save(current, [...paymentsFor(current), p], 'pago_registrado', current, {});
  }), /No se pudo guardar/);
  assert.equal(JSON.stringify(state), prior);
  let closed = false;
  const closingRace = createLocalPaymentRepository(state, () => closed);
  await assert.rejects(closingRace.transaction(tx.usuario_id, async db => {
    const current = await db.get(tx.id);
    await db.assertOpen('2031-01-09', tx.cliente_id);
    const p = preparePayment(current, body('100', '2031-01-09'), randomUUID());
    const result = db.save(current, [...paymentsFor(current), p], 'pago_registrado', current, {});
    closed = true;
    return result;
  }), /se cerro/);
  assert.equal(JSON.stringify(state), prior);
}
concurrency().then(() => console.log('Payment ledger tests passed: partial, cash, reversal, historical balances, tax once, matching, concurrent overpayment'))
  .catch(error => { console.error(error); process.exitCode = 1; });
