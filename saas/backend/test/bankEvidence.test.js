const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { bankClosingReview } = require('../services/bankEvidence');
const { reconciliationReport } = require('../services/reconciliationReport');
const { buildJournal, closingReview, closingReviewByClient, portfolioReview, monthlyAccountingSummary } = require('../services/accountingEngine');

function fixture() {
  const uid = randomUUID(), cid = randomUUID();
  const client = { id: cid, nombre: 'Empresa de prueba' };
  const account = { id: randomUUID(), usuario_id: uid, cliente_id: cid, banco: 'Banco General', nombre: 'Operativa', numero: '12345678', moneda: 'USD' };
  const tx = { id: randomUUID(), usuario_id: uid, cliente_id: cid, fecha: '2044-01-02', periodo: '2044-01', tipo: 'ingreso',
    descripcion: 'Cobro documentado', categoria_contable: 'honorarios', monto: 100, itbms: 0, estado_pago: 'pagado',
    fecha_pago: '2044-01-03', metodo_pago: 'transferencia', banco: account.banco, cuenta_bancaria_id: account.id, conciliado: true };
  const bank = { id: randomUUID(), usuario_id: uid, cliente_id: cid, cuenta_bancaria_id: account.id, banco: account.banco,
    fecha: '2044-01-03', tipo: 'credito', monto: 100, transaccion_id: tx.id, conciliado: true };
  return { client, account, tx, bank, scope: { periodo: '2044-01', cliente_id: cid }, evidence: { accounts: [account], movements: [bank] } };
}

test('a historical reconciled flag cannot pass closing without bank evidence', () => {
  const { tx, scope } = fixture();
  const r = closingReview([tx], buildJournal([tx]), scope, { movements: [], accounts: [] });
  assert.equal(r.listo_para_cierre, false);
  assert.equal(r.control_bancario.vinculos_invalidos, 1);
  assert.equal(r.pagados_sin_conciliar, 1);
  assert(r.issues.some(i => i.codigo === 'VINCULOS_BANCARIOS_INVALIDOS' && i.severidad === 'critica'));
  assert.equal(bankClosingReview([tx], scope).estado, 'no_verificado');
});

test('a bank payment without bank metadata remains visible in both reviews', () => {
  const { tx, scope, client } = fixture();
  const incomplete = { ...tx, banco: '', cuenta_bancaria_id: null };
  const closing = bankClosingReview([incomplete], scope, { movements: [], accounts: [] });
  const recon = reconciliationReport([incomplete], [], scope, [client], []);
  assert.equal(closing.pagos_pendientes, 1);
  assert.equal(recon.transacciones_pendientes.length, 1);
  assert.equal(recon.registros_contables.length, 1);
  assert.equal(recon.resumen[0].movimiento_neto_contable, 100);
});

test('valid matching permits bookkeeping review but never certifies statement balances', () => {
  const { tx, scope, evidence } = fixture();
  const r = closingReview([tx], buildJournal([tx]), scope, evidence);
  assert.equal(r.listo_para_cierre, true);
  assert.equal(r.control_bancario.movimientos_verificados, true);
  assert.equal(r.control_bancario.saldo_verificado, false);
  assert.equal(r.control_bancario.pagos_vinculados_periodo, 1);
  assert(!r.checklist.some(item => item.item === 'Banco conciliado'));
});

test('same account, client, owner, amount, direction and cutoff are required', () => {
  const { tx, bank, scope, evidence } = fixture();
  for (const patch of [{ cliente_id: randomUUID() }, { usuario_id: randomUUID() }, { cuenta_bancaria_id: randomUUID() },
    { monto: 101 }, { tipo: 'debito' }, { fecha: '2044-02-01' }, { transaccion_id: randomUUID() }, { conciliado: false }]) {
    const r = bankClosingReview([tx], scope, { ...evidence, movements: [{ ...bank, ...patch }] });
    assert.equal(r.sin_pendientes, false, JSON.stringify(patch));
    assert.equal(r.pagos_pendientes, 1);
  }
});

test('ambiguous legacy matches and two payments claiming one movement fail closed', () => {
  const { tx, bank, scope, evidence } = fixture();
  assert.equal(bankClosingReview([tx], scope, { ...evidence, movements: [bank, { ...bank, id: randomUUID() }] }).vinculos_invalidos, 3);
  const payment = { id: randomUUID(), fecha: tx.fecha_pago, importe: 100, banco: tx.banco, metodo_pago: tx.metodo_pago,
    cuenta_bancaria_id: tx.cuenta_bancaria_id, conciliado: true, movimiento_bancario_id: bank.id };
  const r = bankClosingReview([{ ...tx, monto: 200, pagos: [payment, { ...payment, id: randomUUID() }] }], scope, evidence);
  assert.equal(r.pagos_pendientes, 2);
  assert.equal(r.movimientos_pendientes, 1);
});

test('prior exceptions carry forward through all twelve months and annual review', () => {
  const { tx, scope } = fixture();
  const evidence = { movements: [], accounts: [] };
  const annual = closingReview([tx], buildJournal([tx]), { anio: '2044' }, evidence);
  assert.equal(annual.pagados_sin_conciliar, 1);
  const months = monthlyAccountingSummary([tx], { anio: '2044', cliente_id: scope.cliente_id, bankEvidence: evidence });
  assert(months.data.every(m => !m.listo_para_cierre && m.control_bancario.pagos_pendientes === 1));
  assert(months.data.slice(1).every(m => m.control_bancario.pendientes_anteriores === 1));
});

test('bank-only clients and unassigned bank rows cannot disappear from closing totals', () => {
  const { client, bank, evidence, scope } = fixture();
  const other = { id: randomUUID(), nombre: 'Empresa ajena' };
  const unassigned = { ...bank, id: randomUUID(), cliente_id: null, transaccion_id: null, conciliado: false };
  const all = { ...evidence, movements: [bank, unassigned] };
  assert.equal(bankClosingReview([], { anio: '2044' }, all).movimientos_pendientes, 2);
  const byClient = closingReviewByClient([], [client, other], scope, [], all);
  assert.equal(byClient.total_clientes, 1);
  assert.equal(byClient.data[0].control_bancario.movimientos_pendientes, 1);
  assert(byClient.data[0].issues.some(i => i.codigo === 'BANCO_SIN_REGISTRO_CONTABLE'));
  assert.equal(bankClosingReview([], { ...scope, cliente_id: other.id }, all).movimientos_pendientes, 0);
});

test('cash and unpaid documents are not fabricated bank matches', () => {
  const { tx, scope } = fixture();
  const evidence = { movements: [], accounts: [] };
  for (const document of [{ ...tx, metodo_pago: 'efectivo', cuenta_bancaria_id: null, banco: '', conciliado: false },
    { ...tx, estado_pago: 'pendiente', fecha_pago: null, conciliado: false }]) {
    const r = closingReview([document], buildJournal([document]), scope, evidence);
    assert.equal(r.listo_para_cierre, true);
    assert.equal(r.control_bancario.estado, 'sin_movimientos');
    assert.equal(r.control_bancario.movimientos_verificados, false);
  }
});

test('cancellation is evaluated at each cutoff and leaves orphan bank rows pending', () => {
  const { tx, bank, scope, evidence, client } = fixture();
  const p = { id: randomUUID(), fecha: tx.fecha_pago, importe: 100, banco: tx.banco, metodo_pago: tx.metodo_pago,
    cuenta_bancaria_id: tx.cuenta_bancaria_id, conciliado: true, movimiento_bancario_id: bank.id, anulado_fecha: '2044-02-05' };
  const paid = { ...tx, pagos: [p] };
  assert.equal(bankClosingReview([paid], scope, evidence).sin_pendientes, true);
  const feb = { ...scope, periodo: '2044-02' };
  const r = bankClosingReview([paid], feb, evidence);
  assert.equal(r.pagos_pendientes, 0);
  assert.equal(r.movimientos_pendientes, 1);
  const recon = reconciliationReport([paid], [bank], feb, [client], evidence.accounts);
  assert.equal(recon.transacciones_pendientes.length, r.pagos_pendientes);
  assert.equal(recon.movimientos_pendientes.length, r.movimientos_pendientes);
});

test('portfolio and monthly directory honor the selected client including bank-only evidence', () => {
  const { tx, client, bank, scope, evidence } = fixture();
  const other = { id: randomUUID(), nombre: 'Otra empresa' };
  const foreign = { ...tx, id: randomUUID(), cliente_id: other.id, monto: 9999 };
  const all = { ...evidence, movements: [bank, { ...bank, id: randomUUID(), cliente_id: other.id, conciliado: false }] };
  const portfolio = portfolioReview([tx, foreign], [client, other], scope, buildJournal([tx, foreign]), all);
  assert.equal(portfolio.total_clientes, 1);
  assert.equal(portfolio.total_ingresos, 100);
  assert.equal(portfolio.data[0].conciliadas_count, 1);
  const months = monthlyAccountingSummary([tx, foreign], { anio: '2044', cliente_id: client.id, journal: buildJournal([tx, foreign]), bankEvidence: all });
  assert.equal(months.totales.ingresos, 100);
  assert.equal(months.data[0].control_bancario.movimientos_pendientes, 0);
});
