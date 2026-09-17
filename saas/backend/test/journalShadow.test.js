const { test } = require('node:test');
const assert = require('node:assert/strict');
const { comparePlans } = require('../services/journalIncrementalSql');
const { journalPlan } = require('../services/journalLedger');
const doc = { id: 'test', fecha: '2040-01-02', descripcion: 'QA', monto: 100, itbms: 7, tipo: 'ingreso', estado_pago: 'pendiente' };
test('shadow ignores generated UUIDs but compares all financial and provenance fields', () => {
  const full = journalPlan([doc]), inc = journalPlan([doc]);
  assert.equal(comparePlans(full, inc, 8, 8).equal, true);
  assert.equal(comparePlans(full, inc, 8, 9).equal, false);
  assert.equal(comparePlans(full, inc, 8, 8, {'':2}, {'':3}).equal, false);
  for (const field of ['origen','origen_clave','revision','rectifica_id','fecha','periodo','tipo_asiento','motivo','contenido_hash']) {
    const changed = structuredClone(inc); changed[0][field] = 'different';
    assert.equal(comparePlans(full, changed, 8, 8).equal, false, field);
  }
  for (const field of ['cuenta_codigo','debe','haber']) {
    const changed = structuredClone(inc); changed[0].lineas[0][field] = 'different';
    assert.equal(comparePlans(full, changed, 8, 8).equal, false, field);
  }
});
