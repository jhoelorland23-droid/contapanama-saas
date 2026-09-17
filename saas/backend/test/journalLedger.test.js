const assert = require('node:assert/strict');
const { test } = require('node:test');
const { journalPlan, incorporationPreview, publicJournal, verifyEntry } = require('../services/journalLedger');
const { trialBalance, monthlyAccountingSummary } = require('../services/accountingEngine');

const invoice = { id: 'document-1', cliente_id: 'client-1', cliente_nombre: 'QA',
  fecha: '2030-12-05', periodo: '2030-12', descripcion: 'Honorarios',
  tipo: 'ingreso', categoria_contable: 'honorarios', monto: 1000, itbms: 70, estado_pago: 'pendiente' };
const numbered = entries => entries.map((e, i) => ({ ...e, numero: i + 1 }));

test('posting is balanced, reproducible and ignores drafts', () => {
  const entries = numbered(journalPlan([invoice, { ...invoice, id: 'draft', estado_contable: 'borrador' }]));
  assert.equal(entries.length, 1);
  assert.equal(entries[0].cliente_id, invoice.cliente_id);
  assert.equal(entries[0].revision, 1);
  verifyEntry(entries[0]);
  assert.deepEqual(journalPlan([invoice], entries), []);
  assert.equal(trialBalance(publicJournal(entries, [invoice])).balanceado, true);
});

test('correction preserves originals and posts exact reversal plus replacement', () => {
  const original = numbered(journalPlan([invoice]));
  const saved = structuredClone(original);
  const changed = { ...invoice, monto: 2000, itbms: 140 };
  const correction = journalPlan([changed], original);
  assert.deepEqual(original, saved);
  assert.equal(correction.length, 2);
  assert.equal(correction[0].rectifica_id, original[0].id);
  assert.equal(correction[1].revision, 2);
  assert.deepEqual(correction[0].lineas, original[0].lineas.map(l => ({ ...l, debe: l.haber, haber: l.debe })));
  const all = numbered([...original, ...correction]);
  assert.deepEqual(journalPlan([changed], all), []);
  const journal = publicJournal(all, [changed]);
  const balance = trialBalance(journal);
  assert.equal(balance.cuentas.find(c => c.cuenta_codigo === '1030').saldo, 2140);
  assert.equal(monthlyAccountingSummary([changed], { anio: '2030', journal }).data[11].total_asientos, 3);
  const third = journalPlan([{ ...changed, monto: 3000, itbms: 210 }], all);
  assert.equal(third[0].rectifica_id, correction[1].id);
  assert.equal(third[1].revision, 3);
});

test('payment and reversal keep their actual month without changing the document', () => {
  const original = numbered(journalPlan([invoice]));
  const tx = { ...invoice, pagos: [{ id: 'payment-1', importe: 400, fecha: '2031-01-12',
    metodo_pago: 'efectivo', conciliado: false }] };
  const payments = journalPlan([tx], original);
  assert.equal(payments.length, 1);
  assert.equal(payments[0].fecha, '2031-01-12');
  const all = numbered([...original, ...payments]);
  const reversed = { ...tx, pagos: [{ ...tx.pagos[0], anulado_fecha: '2031-02-03', anulado_motivo: 'QA' }] };
  const reversals = journalPlan([reversed], all);
  assert.equal(reversals.length, 1);
  assert.equal(reversals[0].tipo_asiento, 'reversa_cobro');
  assert.equal(reversals[0].fecha, '2031-02-03');
  assert.deepEqual(publicJournal(all, [tx], { periodo: '2030-12' }), publicJournal(original, [invoice], { periodo: '2030-12' }));
});

test('notes and bank reconciliation do not repost money', () => {
  const tx = { ...invoice, pagos: [{ id: 'payment-1', importe: 400, fecha: '2031-01-12', metodo_pago: 'transferencia', banco: 'Banco General' }] };
  const original = numbered(journalPlan([tx]));
  const changed = { ...tx, notas: 'Soporte verificado', pagos: [{ ...tx.pagos[0], conciliado: true }] };
  assert.deepEqual(journalPlan([changed], original), []);
  assert.equal(publicJournal(original, [changed], { periodo: '2031-01' })[0].conciliado, true);
});

test('preview blocks invalid legacy payments and invalid zero entries without throwing', () => {
  assert.equal(incorporationPreview([{ ...invoice, estado_pago: 'pagado' }]).puede_incorporar, false);
  assert.equal(incorporationPreview([{ ...invoice, monto: 0, itbms: 0 }]).puede_incorporar, false);
  assert.equal(incorporationPreview([{ ...invoice, estado_pago: 'pagado', estado_contable: 'borrador' }]).puede_incorporar, true);
});

test('tampering and cross-client filtering cannot alter the published view silently', () => {
  const entries = numbered(journalPlan([invoice]));
  assert.deepEqual(publicJournal(entries, [invoice], { cliente_id: 'different-client' }), []);
  entries[0].lineas[0].debe = 999;
  assert.throws(() => journalPlan([invoice], entries), /balanceado|integridad/);
});

test('moving a document between open years preserves the old journal and cancels its old balance', () => {
  const original = numbered(journalPlan([invoice]));
  const changed = { ...invoice, fecha: '2031-01-01', periodo: '2031-01' };
  const entries = numbered([...original, ...journalPlan([changed], original)]);
  const oldYear = publicJournal(entries, [changed], { anio: '2030' }, true);
  const newYear = publicJournal(entries, [changed], { anio: '2031' }, true);
  assert.equal(oldYear.length, 2);
  assert.equal(trialBalance(oldYear, { anio: '2030' }).cuentas.find(c => c.cuenta_codigo === '1030').saldo, 0);
  const next = trialBalance(newYear, { anio: '2031' }).cuentas.find(c => c.cuenta_codigo === '1030');
  assert.equal(next.saldo_inicial, 0);
  assert.equal(next.saldo, 1070);
  assert.equal(journalPlan([changed], entries).length, 0);
});

test('changing balanced contents or the client fails integrity verification', () => {
  const [entry] = journalPlan([invoice]);
  assert.throws(() => verifyEntry({ ...entry, cliente_id: 'different-client' }), /integridad/);
  assert.throws(() => verifyEntry({ ...entry, lineas: entry.lineas.map(l => ({ ...l, debe: l.debe * 2, haber: l.haber * 2 })) }), /integridad/);
});
