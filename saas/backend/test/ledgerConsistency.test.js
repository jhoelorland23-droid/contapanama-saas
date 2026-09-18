const assert = require('node:assert/strict');
const { test } = require('node:test');
const { journalPlan } = require('../services/journalLedger');
const { ledgerConsistency } = require('../services/ledgerConsistency');

const invoice = { id: 'doc-1', cliente_id: 'client-1', cliente_nombre: 'QA', fecha: '2030-05-05', periodo: '2030-05',
  descripcion: 'Honorarios', tipo: 'ingreso', categoria_contable: 'honorarios', monto: 1000, itbms: 70, estado_pago: 'pendiente' };
const expense = { id: 'doc-2', cliente_id: 'client-1', cliente_nombre: 'QA', fecha: '2030-05-09', periodo: '2030-05',
  descripcion: 'Multa', tipo: 'gasto', categoria_contable: 'gastos_operativos', monto: 150, itbms: 10.5, deducible: false, estado_pago: 'pendiente' };
const numbered = entries => entries.map((e, i) => ({ ...e, numero: i + 1 }));

test('client scope excludes other documentary totals and exposes out-of-scope drift', () => {
  const other = { ...invoice, id: 'other', cliente_id: 'client-2', monto: 200 };
  const entries = numbered(journalPlan([invoice, other]));
  const result = ledgerConsistency([invoice, { ...other, monto: 300 }], entries, { cliente_id: 'client-1', periodo: '2030-05' });
  assert.equal(result.estado, 'consistente_en_filtro');
  assert.equal(result.totales.documentos.ingresos, 1000);
  assert.equal(result.pendientes.length, 0);
  assert.equal(result.pendientes_fuera_del_filtro, 2);
  const detail = ledgerConsistency([invoice, { ...other, monto: 300 }], entries, { cliente_id: 'client-2' });
  assert.equal(detail.estado, 'divergente');
  assert.equal(detail.pendientes[0].cliente_id, 'client-2');
  assert.equal(detail.pendientes[0].periodo, '2030-05');
});

test('period and year filters distinguish scoped consistency from global divergence', () => {
  const other = { ...invoice, id: 'other-period', fecha: '2031-06-05', periodo: '2031-06' };
  const entries = numbered(journalPlan([invoice, other]));
  const changed = [invoice, { ...other, monto: 300 }];
  for (const scope of [{ periodo: '2030-05' }, { anio: '2030' }, { cliente_id: 'client-1', periodo: '2030-05' }]) {
    const result = ledgerConsistency(changed, entries, scope);
    assert.equal(result.estado, 'consistente_en_filtro');
    assert.deepEqual(result.pendientes, []);
    assert.deepEqual(result.cuentas_divergentes, []);
    assert.equal(result.pendientes_fuera_del_filtro, 2);
    assert.equal(result.totales.documentos.ingresos, 1000);
  }
  assert.equal(ledgerConsistency(changed, entries, { periodo: '2031-06' }).estado, 'divergente');
  assert.equal(ledgerConsistency(changed, entries).estado, 'divergente');
});

test('in-scope differences win over out-of-scope differences', () => {
  const other = { ...invoice, id: 'other', cliente_id: 'client-2' };
  const entries = numbered(journalPlan([invoice, other]));
  const result = ledgerConsistency([{ ...invoice, monto: 500 }, { ...other, monto: 300 }], entries, { cliente_id: 'client-1' });
  assert.equal(result.estado, 'divergente');
  assert.equal(result.pendientes.length, 2);
  assert.equal(result.pendientes_fuera_del_filtro, 2);
});

test('integrity failure outside client or period filters wins over consistency and divergence', () => {
  const other = { ...invoice, id: 'tampered', cliente_id: 'client-2', fecha: '2031-06-05', periodo: '2031-06' };
  const entries = numbered(journalPlan([invoice, other]));
  entries.find(entry => entry.transaccion_id === other.id).lineas[0].debe = 999;
  for (const scope of [{ cliente_id: 'client-1' }, { periodo: '2030-05' }, { anio: '2030' }]) {
    for (const current of [invoice, { ...invoice, monto: 500 }]) {
      const result = ledgerConsistency([current, other], entries, scope);
      assert.equal(result.estado, 'integridad_fallida');
      assert.equal(result.integridad, 'fallida');
      assert.ok(result.errores.length);
    }
  }
});

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
