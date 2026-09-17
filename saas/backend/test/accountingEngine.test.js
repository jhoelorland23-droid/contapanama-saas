const assert = require('assert');
const {
  CHART_OF_ACCOUNTS,
  buildJournalForTransaction,
  buildJournal,
  trialBalance,
  generalLedger,
  closingReview,
  closingReviewByClient,
  portfolioReview,
  agingReport,
  monthlyAccountingSummary,
  filterTransactionsByPeriod,
} = require('../services/accountingEngine');

assert(CHART_OF_ACCOUNTS.some(account => account.codigo === '1020' && account.nombre === 'Banco General'));
assert(CHART_OF_ACCOUNTS.some(account => account.codigo === '2020'));
assert(CHART_OF_ACCOUNTS.some(account => account.codigo === '2021'));

const ingreso = buildJournalForTransaction({
  id: 'ingreso-1',
  fecha: '2026-09-01',
  periodo: '2026-09',
  tipo: 'ingreso',
  descripcion: 'Factura honorarios CPA',
  categoria_contable: 'honorarios',
  monto: 1000,
  itbms: 70,
  estado_pago: 'pagado',
  banco: 'Banco General',
});

assert.strictEqual(ingreso.balanceado, true);
assert.strictEqual(ingreso.total_debe, 1070);
assert.strictEqual(ingreso.total_haber, 1070);
assert(ingreso.lineas.some(line => line.cuenta_codigo === '1030' && line.debe === 1070));
assert(ingreso.lineas.some(line => line.cuenta_codigo === '4020' && line.haber === 1000));
assert(ingreso.lineas.some(line => line.cuenta_codigo === '2020' && line.haber === 70));

const gastoDeduciblePendiente = buildJournalForTransaction({
  id: 'gasto-1',
  fecha: '2026-09-02',
  periodo: '2026-09',
  tipo: 'gasto',
  descripcion: 'Alquiler oficina',
  categoria_contable: 'alquiler',
  monto: 500,
  itbms: 35,
  deducible: true,
  estado_pago: 'pendiente',
});

assert.strictEqual(gastoDeduciblePendiente.balanceado, true);
assert(gastoDeduciblePendiente.lineas.some(line => line.cuenta_codigo === '5020' && line.debe === 500));
assert(gastoDeduciblePendiente.lineas.some(line => line.cuenta_codigo === '2021' && line.debe === 35));
assert(gastoDeduciblePendiente.lineas.some(line => line.cuenta_codigo === '2010' && line.haber === 535));

const gastoNoDeduciblePagado = buildJournalForTransaction({
  id: 'gasto-2',
  fecha: '2026-09-03',
  periodo: '2026-09',
  tipo: 'gasto',
  descripcion: 'Gasto no deducible',
  categoria_contable: 'otros_gastos',
  monto: 200,
  itbms: 14,
  deducible: false,
  estado_pago: 'pagado',
  banco: 'BAC',
});

assert.strictEqual(gastoNoDeduciblePagado.balanceado, true);
assert(gastoNoDeduciblePagado.lineas.some(line => line.cuenta_codigo === '5990' && line.debe === 214));
assert(!gastoNoDeduciblePagado.lineas.some(line => line.cuenta_codigo === '2021'));
assert(gastoNoDeduciblePagado.lineas.some(line => line.cuenta_codigo === '2010' && line.haber === 214));

const balance = trialBalance(buildJournal([
  { id: 'ingreso-1', fecha: '2026-09-01', periodo: '2026-09', tipo: 'ingreso', descripcion: 'Factura honorarios CPA', categoria_contable: 'honorarios', monto: 1000, itbms: 70, estado_pago: 'pagado', fecha_pago: '2026-09-01', banco: 'Banco General' },
  { id: 'gasto-1', fecha: '2026-09-02', periodo: '2026-09', tipo: 'gasto', descripcion: 'Alquiler oficina', categoria_contable: 'alquiler', monto: 500, itbms: 35, deducible: true, estado_pago: 'pendiente' },
  { id: 'gasto-2', fecha: '2026-09-03', periodo: '2026-09', tipo: 'gasto', descripcion: 'Gasto no deducible', categoria_contable: 'otros_gastos', monto: 200, itbms: 14, deducible: false, estado_pago: 'pagado', fecha_pago: '2026-09-03', banco: 'BAC' },
]));

assert.strictEqual(balance.balanceado, true);
assert.strictEqual(balance.diferencia, 0);

const ledger = generalLedger(buildJournal([
  { id: 'ingreso-1', fecha: '2026-09-01', periodo: '2026-09', tipo: 'ingreso', descripcion: 'Factura honorarios CPA', categoria_contable: 'honorarios', monto: 1000, itbms: 70, estado_pago: 'pagado', fecha_pago: '2026-09-01', banco: 'Banco General' },
  { id: 'gasto-1', fecha: '2026-09-02', periodo: '2026-09', tipo: 'gasto', descripcion: 'Alquiler oficina', categoria_contable: 'alquiler', monto: 500, itbms: 35, deducible: true, estado_pago: 'pendiente' },
]));

assert.strictEqual(ledger.balanceado, true);
assert.strictEqual(ledger.total_cuentas, 7);
assert.strictEqual(ledger.total_movimientos, 8);
assert.strictEqual(ledger.data.find(account => account.cuenta_codigo === '1020').saldo, 1070);
assert.strictEqual(ledger.data.find(account => account.cuenta_codigo === '2020').saldo_natural, 70);

const review = closingReview([
  { id: 'ingreso-pendiente', fecha: '2026-09-04', periodo: '2026-09', tipo: 'ingreso', descripcion: 'Factura pendiente', categoria_contable: 'ventas_servicios', monto: 300, itbms: 21, estado_pago: 'pendiente' },
  { id: 'gasto-pagado', fecha: '2026-09-05', periodo: '2026-09', tipo: 'gasto', descripcion: 'Servicio pagado sin conciliar', categoria_contable: 'servicios_publicos', monto: 100, itbms: 7, deducible: true, estado_pago: 'pagado', fecha_pago: '2026-09-05', banco: 'Banco General', metodo_pago: 'transferencia', conciliado: false },
]);

assert.strictEqual(review.balanceado, true);
assert.strictEqual(review.listo_para_cierre, false);
assert.strictEqual(review.cuentas_por_cobrar, 321);
assert.strictEqual(review.pagados_sin_conciliar, 1);
assert(review.issues.some(issue => issue.codigo === 'CUENTAS_POR_COBRAR'));
assert(review.issues.some(issue => issue.codigo === 'BANCOS_SIN_CONCILIAR'));

const emptyReview = closingReview([]);
assert.strictEqual(emptyReview.listo_para_cierre, false);
assert(emptyReview.issues.some(issue => issue.codigo === 'SIN_REGISTROS'));

const clientMatrix = closingReviewByClient([
  { id: 'tx-cliente-a', cliente_id: 'cliente-a', cliente_nombre: 'Cliente A', fecha: '2026-09-01', periodo: '2026-09', tipo: 'ingreso', descripcion: 'Factura pagada', categoria_contable: 'ventas_servicios', monto: 100, itbms: 7, estado_pago: 'pagado', fecha_pago: '2026-09-01', banco: 'Banco General', conciliado: true },
], [
  { id: 'cliente-a', nombre: 'Cliente A', ruc: '1-1-1', tipo: 'juridica', actividad: 'Servicios', estado: 'activo' },
  { id: 'cliente-b', nombre: 'Cliente B', ruc: '2-2-2', tipo: 'natural', actividad: 'Comercio', estado: 'activo' },
]);

assert.strictEqual(clientMatrix.total_clientes, 2);
assert.strictEqual(clientMatrix.listos, 0);
assert.strictEqual(clientMatrix.pendientes, 2);
assert(clientMatrix.data.find(row => row.cliente_id === 'cliente-a').issues.some(issue => issue.codigo === 'VINCULOS_BANCARIOS_INVALIDOS'));
assert(clientMatrix.data.find(row => row.cliente_id === 'cliente-b').issues.some(issue => issue.codigo === 'SIN_REGISTROS'));
const filteredClientMatrix = closingReviewByClient([
  { id: 'foreign-only', cliente_id: 'cliente-b', cliente_nombre: 'Cliente B', fecha: '2026-09-01', tipo: 'ingreso', monto: 100 },
], [{ id: 'cliente-a', nombre: 'Cliente A' }, { id: 'cliente-b', nombre: 'Cliente B' }],
{ periodo: '2026-09', cliente_id: 'cliente-a' });
assert.strictEqual(filteredClientMatrix.total_clientes, 1);
assert.strictEqual(filteredClientMatrix.data[0].cliente_id, 'cliente-a');
assert.strictEqual(filteredClientMatrix.data[0].total_ingresos, 0);

const portfolio = portfolioReview([
  { id: 'port-1', cliente_id: 'cliente-a', cliente_nombre: 'Cliente A', fecha: '2026-09-01', periodo: '2026-09', tipo: 'ingreso', descripcion: 'Factura pagada', categoria_contable: 'ventas_servicios', monto: 1000, itbms: 70, estado_pago: 'pagado', fecha_pago: '2026-09-01', banco: 'Banco General', conciliado: true },
  { id: 'port-2', cliente_id: 'cliente-a', cliente_nombre: 'Cliente A', fecha: '2026-09-03', periodo: '2026-09', tipo: 'gasto', descripcion: 'Gasto sin conciliar', categoria_contable: 'alquiler', monto: 200, itbms: 14, deducible: true, estado_pago: 'pagado', fecha_pago: '2026-09-03', banco: 'Banco General', metodo_pago: 'transferencia', conciliado: false },
  { id: 'port-3', cliente_id: 'cliente-b', cliente_nombre: 'Cliente B', fecha: '2026-09-05', periodo: '2026-09', tipo: 'ingreso', descripcion: 'Factura pendiente', categoria_contable: 'ventas_servicios', monto: 300, itbms: 21, estado_pago: 'pendiente' },
], [
  { id: 'cliente-a', nombre: 'Cliente A', ruc: '1-1-1', tipo: 'juridica', actividad: 'Servicios', estado: 'activo' },
  { id: 'cliente-b', nombre: 'Cliente B', ruc: '2-2-2', tipo: 'natural', actividad: 'Comercio', estado: 'activo' },
]);

assert.strictEqual(portfolio.total_clientes, 2);
assert.strictEqual(portfolio.clientes_con_movimiento, 2);
assert.strictEqual(portfolio.total_ingresos, 1300);
assert.strictEqual(portfolio.total_gastos, 200);
assert.strictEqual(portfolio.itbms_neto, 77);
assert.strictEqual(portfolio.cuentas_por_cobrar, 321);
assert.strictEqual(portfolio.pagadas_sin_conciliar, 2);
assert.strictEqual(portfolio.data.find(row => row.cliente_id === 'cliente-a').conciliadas_count, 0);
assert.strictEqual(portfolio.data.find(row => row.cliente_id === 'cliente-a').pagadas_sin_conciliar, 2);

const aging = agingReport([
  { id: 'cxc-1', cliente_id: 'cliente-a', cliente_nombre: 'Cliente A', fecha: '2026-09-01', fecha_vencimiento: '2026-09-30', periodo: '2026-09', tipo: 'ingreso', descripcion: 'Factura pendiente', monto: 100, itbms: 7, estado_pago: 'pendiente' },
  { id: 'cxp-1', cliente_id: 'cliente-b', cliente_nombre: 'Cliente B', fecha: '2026-07-01', fecha_vencimiento: '2026-07-31', periodo: '2026-07', tipo: 'gasto', descripcion: 'Proveedor pendiente', monto: 200, itbms: 14, estado_pago: 'pendiente' },
  { id: 'paid-1', cliente_id: 'cliente-c', cliente_nombre: 'Cliente C', fecha: '2026-08-01', fecha_vencimiento: '2026-08-31', periodo: '2026-08', tipo: 'ingreso', descripcion: 'Factura pagada', monto: 50, itbms: 3.5, estado_pago: 'pagado', fecha_pago: '2026-08-01' },
], { tipo: 'todos', fechaCorte: '2026-09-15' });

assert.strictEqual(aging.total_documentos, 2);
assert.strictEqual(aging.total_por_cobrar, 107);
assert.strictEqual(aging.total_por_pagar, 214);
assert.strictEqual(aging.buckets.corriente.count, 1);
assert.strictEqual(aging.buckets.dias_31_60.count, 1);

const filteredByClient = filterTransactionsByPeriod([
  { id: 'a-1', cliente_id: 'cliente-a', fecha: '2026-09-01', periodo: '2026-09' },
  { id: 'b-1', cliente_id: 'cliente-b', fecha: '2026-09-02', periodo: '2026-09' },
], { periodo: '2026-09', cliente_id: 'cliente-a' });

assert.strictEqual(filteredByClient.length, 1);
assert.strictEqual(filteredByClient[0].id, 'a-1');

const annualSummary = monthlyAccountingSummary([
  { id: 'jan-1', cliente_id: 'cliente-a', fecha: '2026-01-10', periodo: '2026-01', tipo: 'ingreso', descripcion: 'Factura enero', categoria_contable: 'ventas_servicios', monto: 1000, itbms: 70, estado_pago: 'pagado', fecha_pago: '2026-01-10', banco: 'Banco General', conciliado: true },
  { id: 'mar-1', cliente_id: 'cliente-a', fecha: '2026-03-10', periodo: '2026-03', tipo: 'ingreso', descripcion: 'Factura marzo pendiente', categoria_contable: 'ventas_servicios', monto: 500, itbms: 35, estado_pago: 'pendiente' },
  { id: 'mar-2', cliente_id: 'cliente-a', fecha: '2026-03-12', periodo: '2026-03', tipo: 'gasto', descripcion: 'Gasto marzo', categoria_contable: 'alquiler', monto: 200, itbms: 14, deducible: true, estado_pago: 'pagado', fecha_pago: '2026-03-12', banco: 'Banco General', conciliado: true },
], { anio: '2026' });

assert.strictEqual(annualSummary.total_meses, 12);
assert.strictEqual(annualSummary.meses_con_movimiento, 2);
assert.strictEqual(annualSummary.totales.ingresos, 1500);
assert.strictEqual(annualSummary.totales.gastos, 200);
assert.strictEqual(annualSummary.totales.itbms_neto, 91);
assert.strictEqual(annualSummary.data.find(row => row.periodo === '2026-01').listo_para_cierre, false);
assert.strictEqual(annualSummary.data.find(row => row.periodo === '2026-03').cuentas_por_cobrar, 535);
assert.strictEqual(annualSummary.data.find(row => row.periodo === '2026-03').riesgo, 'critico');
assert.strictEqual(annualSummary.data.find(row => row.periodo === '2026-03').control_bancario.pendientes_anteriores, 1);
assert.strictEqual(annualSummary.totales.cuentas_por_cobrar, 535);
assert.strictEqual(annualSummary.data.find(row => row.periodo === '2026-04').total_transacciones, 0);

const posted = { id: 'posted', cliente_id: 'review-client', fecha: '2026-09-01', periodo: '2026-09', tipo: 'ingreso', monto: 100, itbms: 7, estado_pago: 'pagado', fecha_pago: '2026-09-01', banco: 'Banco General', conciliado: true, categoria_contable: 'honorarios' };
const draft = { ...posted, id: 'draft', monto: 900, itbms: 63, estado_contable: 'borrador_ia', estado_pago: 'pendiente' };
const draftExpense = { ...draft, id: 'draft-expense', tipo: 'gasto', deducible: true };
const mixed = [posted, draft, draftExpense];
assert.throws(() => buildJournalForTransaction(draft), /borrador/);
assert.deepStrictEqual(buildJournal(mixed), buildJournal([posted]));
assert.deepStrictEqual(trialBalance(buildJournal(mixed)), trialBalance(buildJournal([posted])));
assert.deepStrictEqual(generalLedger(buildJournal(mixed)), generalLedger(buildJournal([posted])));
assert.strictEqual(agingReport(mixed).total_pendiente, 0);
const reviewDrafts = closingReview(mixed);
assert.strictEqual(reviewDrafts.total_transacciones, 1);
assert.strictEqual(reviewDrafts.total_borradores, 2);
assert.strictEqual(reviewDrafts.itbms_debito, 7);
assert.strictEqual(reviewDrafts.itbms_credito, 0);
assert.strictEqual(reviewDrafts.cuentas_por_cobrar, 0);
assert.strictEqual(reviewDrafts.cuentas_por_pagar, 0);
assert.strictEqual(reviewDrafts.listo_para_cierre, false);
assert(reviewDrafts.issues.some(issue => issue.codigo === 'BORRADORES_PENDIENTES'));
assert.strictEqual(closingReview([posted]).listo_para_cierre, false);
assert.strictEqual(closingReview([{ ...posted, metodo_pago: 'efectivo', banco: '', conciliado: false }]).listo_para_cierre, true);
const mixedYear = monthlyAccountingSummary(mixed, { anio: 2026 });
assert.strictEqual(mixedYear.totales.ingresos, 100);
assert.strictEqual(mixedYear.totales.gastos, 0);
assert.strictEqual(mixedYear.data[8].total_borradores, 2);
const clientDraftReview = closingReviewByClient(mixed, [{ id: 'review-client', nombre: 'Revision CPA' }]);
assert.strictEqual(clientDraftReview.data[0].total_ingresos, 100);
assert.strictEqual(clientDraftReview.data[0].total_borradores, 2);
const draftPortfolio = portfolioReview(mixed, [{ id: 'review-client', nombre: 'Revision CPA' }]);
assert.strictEqual(draftPortfolio.total_ingresos, 100);
assert.strictEqual(draftPortfolio.total_gastos, 0);
assert.strictEqual(draftPortfolio.data[0].total_borradores, 2);
const postedDrafts = mixed.map(tx => ({ ...tx, estado_contable: 'registrado' }));
assert.strictEqual(buildJournal(postedDrafts).length, 4);
assert.strictEqual(monthlyAccountingSummary(postedDrafts, { anio: 2026 }).totales.ingresos, 1000);
assert.strictEqual(monthlyAccountingSummary(postedDrafts, { anio: 2026 }).totales.gastos, 900);

console.log('Accounting engine tests passed');
