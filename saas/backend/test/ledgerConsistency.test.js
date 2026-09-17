const assert = require('node:assert/strict');
const { test } = require('node:test');
const { journalPlan } = require('../services/journalLedger');
const { ledgerConsistency } = require('../services/ledgerConsistency');

const invoice = { id: 'doc-1', cliente_id: 'client-1', cliente_nombre: 'QA', fecha: '2030-05-05', periodo: '2030-05',
  descripcion: 'Honorarios', tipo: 'ingreso', categoria_contable: 'honorarios', monto: 1000, itbms: 70, estado_pago: 'pendiente' };
const expense = { id: 'doc-2', cliente_id: 'client-1', cliente_nombre: 'QA', fecha: '2030-05-09', periodo: '2030-05',
  descripcion: 'Multa', tipo: 'gasto', categoria_contable: 'gastos_operativos', monto: 150, itbms: 10.5, deducible: false, estado_pago: 'pendiente' };
const numbered = entries => entries.map((e, i) => ({ ...e, numero: i + 1 }));

test('published book that matches its documents is consistent, with report gaps explained', () => {
  const entries = numbered(journalPlan([invoice, expense]));
  const result = ledgerConsistency([invoice, expense], entries, { periodo: '2030-05' });
  assert.equal(result.estado, 'consistente');
  assert.deepEqual(result.pendientes, []);
  assert.deepEqual(result.cuentas_divergentes, []);
  assert.equal(result.totales.documentos.ingresos, 1000);
  assert.equal(result.totales.libro.ingresos, 1000);
  // Report "gastos" excludes the non-deductible ITBMS that the engine expenses (150 vs 160.50).
  assert.equal(result.totales.documentos.gastos, 150);
  assert.equal(result.totales.libro.gastos, 160.5);
  assert.equal(result.totales.reportes_vs_libro.gastos, -10.5);
  assert.equal(result.totales.reportes_vs_libro.gastos_explicados_por_itbms_no_deducible, true);
});

test('a document altered after publication is reported as divergent with the pending correction and account deltas', () => {
  const entries = numbered(journalPlan([invoice]));
  const altered = { ...invoice, monto: 1500, itbms: 105 };
  const result = ledgerConsistency([altered], entries);
  assert.equal(result.estado, 'divergente');
  assert.deepEqual(result.pendientes.map(p => [p.origen_clave, p.tipo_asiento]), [[`rectifica-${entries[0].id}`, 'reversa_ajuste'], ['tx-doc-1', 'documento']]);
  assert.deepEqual(result.cuentas_divergentes.map(row => [row.cuenta_codigo, row.diferencia]), [['1030', -535], ['2020', 35], ['4020', 500]]);
  assert.equal(result.totales.documentos.ingresos, 1500);
  assert.equal(result.totales.libro.ingresos, 1000);
});

test('notes and reconciliation flags never count as divergence; a missing document does', () => {
  const entries = numbered(journalPlan([invoice, expense]));
  assert.equal(ledgerConsistency([{ ...invoice, notas: 'soporte', conciliado: true }, expense], entries).estado, 'consistente');
  const missing = ledgerConsistency([invoice], entries);
  assert.equal(missing.estado, 'divergente');
  assert.deepEqual(missing.pendientes.map(p => p.tipo_asiento), ['reversa_ajuste']);
});

test('a tampered stored entry fails integrity instead of being silently re-derived', () => {
  const entries = numbered(journalPlan([invoice]));
  entries[0].lineas[0].debe = 999;
  const result = ledgerConsistency([invoice], entries);
  assert.equal(result.estado, 'integridad_fallida');
  assert.match(result.errores[0], /balanceado|integridad/);
});
