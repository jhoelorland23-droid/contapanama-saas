import { test } from 'node:test';
import assert from 'node:assert/strict';
import { consistencyStatus } from '../src/ledgerConsistency.mjs';
test('unverified and failed checks are never presented as consistent', () => {
  assert.equal(consistencyStatus(null).label, 'PENDIENTE / NO VERIFICADO');
  assert.equal(consistencyStatus({estado:'consistente'}, '', true).tone, 'warning');
  assert.equal(consistencyStatus({estado:'consistente'}, 'Network failure').label, 'ERROR DE VERIFICACIÓN');
  assert.equal(consistencyStatus({estado:'integridad_fallida'}).tone, 'danger');
  assert.equal(consistencyStatus({estado:'divergente'}).label, 'DIVERGENTE');
  assert.equal(consistencyStatus({estado:'consistente'}).label, 'CONSISTENTE');
});
