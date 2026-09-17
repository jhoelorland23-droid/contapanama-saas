const assert = require('node:assert/strict');
const {
  buildJournal, trialBalance, generalLedger, accountLedger,
  closingReview, monthlyAccountingSummary, agingReport, portfolioReview,
} = require('../services/accountingEngine');
const { dateKey, periodRange, historyParams } = require('../services/accountingPeriod');
const { validatePayment, isSettlementOnlyUpdate, bankPeriodSql } = require('../services/paymentValidation');

const common = { cliente_id: 'period-client', cliente_nombre: 'Cliente prueba periodos', estado_contable: 'registrado', banco: 'Banco General', metodo_pago: 'transferencia', conciliado: true };
const documents = [
  { ...common, id: 'invoice', tipo: 'ingreso', fecha: '2025-12-20', periodo: '2025-12', monto: 1000, itbms: 70, categoria_contable: 'honorarios', descripcion: 'Honorarios diciembre', estado_pago: 'pagado', fecha_pago: '2026-01-08' },
  { ...common, id: 'expense', tipo: 'gasto', fecha: '2025-12-22', periodo: '2025-12', monto: 200, itbms: 14, deducible: true, categoria_contable: 'alquiler', descripcion: 'Alquiler diciembre', estado_pago: 'pagado', fecha_pago: '2026-02-04' },
  { ...common, id: 'carry', tipo: 'ingreso', fecha: '2025-11-01', periodo: '2025-11', monto: 50, itbms: 0, categoria_contable: 'honorarios', descripcion: 'Saldo anterior', estado_pago: 'pendiente', conciliado: false },
];
const journal = buildJournal(documents);
assert.equal(journal.length, 5);
assert.deepEqual(buildJournal(documents, { periodo: '2025-12' }), buildJournal(documents.map(tx => ({ ...tx, estado_pago: 'pendiente', fecha_pago: null })), { periodo: '2025-12' }));
assert.deepEqual(buildJournal(documents, { periodo: '2026-01' }).map(tx => tx.tipo_asiento), ['cobro']);
assert.deepEqual(buildJournal(documents, { periodo: '2026-02' }).map(tx => tx.tipo_asiento), ['pago']);
assert.equal(buildJournal(documents, { periodo: '2026-01', desde: '2026-01-09' }).length, 0);

const january = accountLedger(journal, '1030', { periodo: '2026-01' });
assert.equal(january.saldo_inicial, 1120);
assert.equal(january.debe, 0);
assert.equal(january.haber, 1070);
assert.equal(january.saldo, 50);
assert.equal(january.data[0].saldo, 50);
assert.equal(january.data[0].fecha, '2026-01-08');
assert.equal(accountLedger(journal, '2010', { periodo: '2026-01' }).saldo, -214);
assert.equal(accountLedger(journal, '2010', { periodo: '2026-02' }).saldo, 0);
assert.equal(accountLedger(journal, '1020', { periodo: '2026-02' }).saldo, 856);
assert.equal(generalLedger(journal, { periodo: '2026-02' }).total_movimientos, 2);
const summary = monthlyAccountingSummary(documents, { anio: 2026 });
assert.equal(summary.totales.ingresos, 0);
assert.equal(summary.totales.gastos, 0);
assert.equal(summary.totales.itbms_neto, 0);
assert.equal(summary.totales.cuentas_por_cobrar, 50);
assert.equal(summary.totales.cuentas_por_pagar, 0);
assert.equal(summary.totales.total_asientos, 2);
assert.equal(summary.meses_con_movimiento, 2);
for (const row of summary.data) {
  const balance = trialBalance(journal, { periodo: row.periodo });
  const aging = agingReport(documents, { periodo: row.periodo });
  assert.equal(balance.cuentas.find(a => a.cuenta_codigo === '1030').saldo, aging.total_por_cobrar);
  assert.equal(-balance.cuentas.find(a => a.cuenta_codigo === '2010').saldo || 0, aging.total_por_pagar);
  assert.equal(row.cuentas_por_cobrar, aging.total_por_cobrar);
  assert.equal(row.cuentas_por_pagar, aging.total_por_pagar);
  assert.equal(Number(balance.cuentas.reduce((sum, a) => sum + a.saldo, 0).toFixed(2)), 0);
  assert.equal(balance.balanceado, true);
}
const dec = agingReport(documents, { periodo: '2025-12' });
assert.equal(dec.fecha_corte, '2025-12-31');
assert.equal(dec.total_por_cobrar, 1120);
assert.equal(dec.total_por_pagar, 214);
assert.equal(agingReport(documents, { fechaCorte: '2025-12-01' }).total_por_cobrar, 50);
assert.equal(agingReport(documents, { fechaCorte: '2026-01-07' }).total_por_cobrar, 1120);
assert.equal(agingReport(documents, { fechaCorte: '2026-01-08' }).total_por_cobrar, 50);
assert.equal(agingReport(documents, { periodo: '2026-01', fecha_corte: '2025-12-31' }).total_por_cobrar, 1120);
assert.deepEqual(historyParams({ periodo: '2026-01', cliente_id: 'x' }), { cliente_id: 'x', hasta: '2026-01-31' });
assert.deepEqual(periodRange({ periodo: '2024-02' }), { desde: '2024-02-01', hasta: '2024-02-29' });
assert.equal(dateKey(new Date('2026-01-08T00:00:00Z')), '2026-01-08');
assert.equal(dateKey('2026-02-30'), '');
assert.throws(() => periodRange({ periodo: '2026-13' }), /invalido/);

const missingDate = [{ ...documents[0], fecha_pago: null }];
assert.equal(buildJournal(missingDate).length, 1);
assert.equal(agingReport(missingDate, { anio: 2026 }).total_por_cobrar, 1070);
assert.equal(closingReview(missingDate).listo_para_cierre, false);
assert(closingReview(missingDate).issues.some(i => i.codigo === 'PAGOS_SIN_SOPORTE_CONTABLE'));
for (const invalid of [null, '2025-12-01', '2026-02-30']) {
  assert.equal(buildJournal([{ ...documents[0], fecha_pago: invalid }]).length, 1);
}
assert.equal(buildJournal([{ ...documents[0], estado_pago: 'parcial' }]).length, 1);
const cash = buildJournal([{ ...documents[0], metodo_pago: 'efectivo' }], { periodo: '2026-01' });
assert.equal(cash[0].lineas[0].cuenta_codigo, '1010');
const report = closingReview(documents, journal, { periodo: '2025-12' });
assert.equal(report.cuentas_por_cobrar, 1120);
assert.equal(report.pagados_sin_conciliar, 0);
assert.equal(report.listo_para_cierre, true);
assert.equal(closingReview(documents, journal, { periodo: '2026-01' }).total_asientos, 1);
const portfolio = portfolioReview(documents, [{ id: common.cliente_id, nombre: common.cliente_nombre }], { periodo: '2026-01' });
assert.equal(portfolio.total_ingresos, 0);
assert.equal(portfolio.cuentas_por_cobrar, 50);
assert.equal(portfolio.data[0].pagadas_count, 1);
assert.equal(validatePayment(documents[0]), null);
assert.match(validatePayment({ ...documents[0], fecha_pago: null }), /fecha real/);
assert.match(validatePayment({ ...documents[0], fecha_pago: '2025-12-01' }), /fecha real/);
assert.match(validatePayment({ ...documents[0], metodo_pago: '' }), /metodo/);
assert.match(validatePayment({ ...documents[0], banco: '' }), /banco/);
assert.match(validatePayment({ ...documents[0], estado_pago: 'parcial' }), /abonos/i);
assert.equal(validatePayment({ ...documents[0], banco: '', metodo_pago: 'efectivo' }), null);
assert.equal(isSettlementOnlyUpdate({ estado_pago: 'pendiente' }, { estado_pago: 'pagado', fecha_pago: '2026-01-08' }), true);
assert.equal(isSettlementOnlyUpdate({ estado_pago: 'pendiente' }, { estado_pago: 'pagado', monto: 1 }), false);
assert.equal(isSettlementOnlyUpdate(documents[0], { estado_pago: 'pagado', fecha_pago: '2026-02-08' }), false);
assert.match(bankPeriodSql(false).paid, /fecha_pago >= fecha/);
assert.match(bankPeriodSql(true).paid, /1 year/);

console.log('Accounting period tests passed: accrual, settlements, cutoffs, carry-forward, cash and 12-month consistency');
module.exports = { documents };
