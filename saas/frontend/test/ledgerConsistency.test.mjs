import { test } from 'node:test';
import assert from 'node:assert/strict';
import { consistencyStatus } from '../src/ledgerConsistency.mjs';
test('unverified and failed checks are never presented as consistent', () => {
  assert.equal(consistencyStatus(null).label, 'PENDIENTE / NO VERIFICADO');
  assert.equal(consistencyStatus({estado:'consistente'}, '', true).tone, 'warning');
  assert.equal(consistencyStatus({estado:'consistente'}, 'Network failure').label, 'ERROR / INTEGRIDAD FALLIDA');
  assert.equal(consistencyStatus({estado:'integridad_fallida'}).tone, 'danger');
  assert.equal(consistencyStatus({estado:'divergente'}).label, 'DIVERGENTE');
  assert.equal(consistencyStatus({estado:'consistente'}).label, 'CONSISTENTE');
});

test('filtered consistency is a warning, including legacy consistent responses with outside differences', () => {
  for (const estado of ['consistente_en_filtro', 'consistente']) {
    const data = { estado, pendientes_fuera_del_filtro: 2 };
    assert.deepEqual(consistencyStatus(data), {
      label: 'CONSISTENTE EN EL FILTRO / EXISTEN DIFERENCIAS FUERA DEL FILTRO', tone: 'warning',
    });
    assert.equal(consistencyStatus(data, '', false, { estado: 'divergente' }).tone, 'warning');
    assert.equal(data.pendientes_fuera_del_filtro, 2);
  }
  assert.equal(consistencyStatus({ estado: 'divergente', pendientes_fuera_del_filtro: 2 }).label, 'DIVERGENTE');
  assert.equal(consistencyStatus({ estado: 'consistente_en_filtro', pendientes: [{}] }).label, 'DIVERGENTE');
  assert.equal(consistencyStatus({ estado: 'consistente', cuentas_divergentes: [{}] }).label, 'DIVERGENTE');
});

test('errors and integrity failures win over loading, scoped consistency and divergence', () => {
  const failures = [{ estado: 'integridad_fallida' }, { estado: 'error' }, { integridad: 'fallida' }, { errores: ['Integrity failure'] }];
  for (const loading of [false, true]) {
    for (const estado of ['consistente', 'consistente_en_filtro', 'divergente']) {
      const data = { estado, pendientes_fuera_del_filtro: 2 };
      const expected = { label: 'ERROR / INTEGRIDAD FALLIDA', tone: 'danger' };
      assert.deepEqual(consistencyStatus(data, 'Network failure', loading), expected);
      for (const failure of failures) {
        assert.deepEqual(consistencyStatus({ ...data, ...failure }, '', loading), expected);
        assert.deepEqual(consistencyStatus(data, '', loading, failure), expected);
      }
    }
  }
});

test('global summary without filter metadata never permits a green badge for known divergence', () => {
  for (const summary of [{ estado: 'divergente' }, { pendientes: 2 }, { cuentas_divergentes: 1 }]) {
    for (const data of [null, { estado: 'consistente' }, { estado: 'consistente', pendientes_fuera_del_filtro: 0 }]) {
      assert.deepEqual(consistencyStatus(data, '', false, summary), { label: 'DIVERGENTE', tone: 'danger' });
      assert.notEqual(consistencyStatus(data, '', true, summary).tone, 'success');
    }
  }
  assert.equal(consistencyStatus(null, '', false, { estado: 'consistente' }).label, 'PENDIENTE / NO VERIFICADO');
  assert.equal(consistencyStatus({ estado: 'consistente', pendientes_fuera_del_filtro: 0 }, '', false, { estado: 'consistente' }).tone, 'success');
});
