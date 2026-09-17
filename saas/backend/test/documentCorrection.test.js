const assert = require('node:assert/strict');
const { test } = require('node:test');
const { documentRevision, correctionFields, authorizeCorrection, correctionAudit, isCorrectionReplay } = require('../services/documentCorrection');

const actor = { id: 'owner', nombre: 'CPA de prueba', rol: 'contador' };
const doc = { id: 'document', usuario_id: actor.id, fecha: '2070-01-02', monto: 100, itbms: 7,
  descripcion: 'Original', estado_pago: 'pendiente', estado_contable: 'registrado', updated_at: '2070-01-02T00:00:00.000Z' };
const reason = 'Base corregida contra soporte de prueba';
const body = changes => ({ monto: 200, motivo_ajuste: reason, revision_esperada: documentRevision(doc), ...changes });
const rejects = (changes, status) => assert.throws(() => authorizeCorrection(doc, body(changes), actor), e => e.status === status);

test('revision is stable across SQL numeric strings, Dates and JSON serialization', () => {
  assert.equal(documentRevision(doc), documentRevision({ ...doc, monto: '100.00', itbms: '7.00', updated_at: new Date(doc.updated_at) }));
  assert.notEqual(documentRevision(doc), documentRevision({ ...doc, notas: 'Nuevo soporte' }));
  assert.deepEqual(correctionFields(doc, { monto: '100.00' }), []);
});
test('correction requires an authorized role, reason and current revision', () => {
  assert.throws(() => authorizeCorrection(doc, body({}), { ...actor, rol: 'cliente' }), e => e.status === 403);
  rejects({ motivo_ajuste: undefined }, 422);
  rejects({ motivo_ajuste: '   corto   ' }, 422);
  rejects({ motivo_ajuste: 'x'.repeat(1001) }, 422);
  rejects({ revision_esperada: undefined }, 428);
  rejects({ revision_esperada: 'not-a-revision' }, 428);
  rejects({ revision_esperada: 'f'.repeat(64) }, 409);
  assert.equal(authorizeCorrection(doc, body({ motivo_ajuste: '  ' + reason + '  ' }), actor).reason, reason);
});
test('invalid amounts, dates and fields are rejected before publishing', () => {
  for (const invalid of [0, -1, '', null, 1.001, 'NaN', Infinity, '9007199254740992']) rejects({ monto: invalid }, 422);
  for (const invalid of [-1, null, 1.001]) rejects({ itbms: invalid }, 422);
  for (const invalid of [null, '', '2070-02-30', '2070-01-01T00:00:00Z']) rejects({ fecha: invalid }, 422);
  rejects({ fecha_pago: 'invalid' }, 422);
  rejects({ descripcion: '   ' }, 422);
  rejects({ deducible: 'false' }, 422);
  rejects({ tipo: 'otro' }, 422);
  rejects({ tasa_itbms: 1 }, 422);
  assert(authorizeCorrection(doc, body({ fecha_vencimiento: null, itbms: '0.00' }), actor));
});
test('stale no-op cannot bypass revision check', () => {
  const changed = { ...doc, monto: 200 };
  assert.throws(() => authorizeCorrection(changed, body({}), actor), e => e.status === 409);
});
test('notes, drafts, initial settlement and reconciliation reversal remain distinct operations', () => {
  assert.equal(authorizeCorrection(doc, { notas: 'Soporte' }, actor), null);
  assert.equal(authorizeCorrection({ ...doc, estado_contable: 'borrador_ia' }, { monto: 300 }, actor), null);
  assert.equal(authorizeCorrection(doc, { estado_pago: 'pagado', fecha_pago: '2070-01-05', metodo_pago: 'efectivo' }, actor), null);
  assert.equal(authorizeCorrection({ ...doc, conciliado: true }, { conciliado: false, fecha_conciliacion: null }, actor), null);
  assert.deepEqual(correctionFields(doc, { monto: 200, estado_pago: 'pagado' }), ['monto', 'estado_pago']);
});
test('audit links reviewed revision, new revision, actor, reason and actual changed fields', () => {
  const request = body({});
  const result = { ...doc, monto: 200, updated_at: '2070-01-03T00:00:00.000Z' };
  const audit = correctionAudit(authorizeCorrection(doc, request, actor), result);
  assert.deepEqual(audit.ajuste.campos, ['monto']);
  assert.deepEqual(audit.ajuste.actor, actor);
  assert.equal(audit.ajuste.motivo, reason);
  assert.equal(audit.ajuste.revision_anterior, documentRevision(doc));
  assert.equal(audit.ajuste.revision_posterior, documentRevision(result));
  assert.equal(result.ajuste, undefined);
});
test('retries require identical reviewed changes and actor and unchanged saved version', () => {
  const request = body({});
  const result = { ...doc, monto: 200 };
  const event = { despues_json: correctionAudit(authorizeCorrection(doc, request, actor), result) };
  assert(isCorrectionReplay(result, request, event, actor));
  assert(isCorrectionReplay(result, { ...request, monto: '200.00' }, event, actor));
  assert(!isCorrectionReplay(result, { ...request, motivo_ajuste: 'Otro motivo de prueba' }, event, actor));
  assert(!isCorrectionReplay(result, { ...request, monto: 201 }, event, actor));
  assert(!isCorrectionReplay(result, request, event, { ...actor, id: 'another' }));
  assert(!isCorrectionReplay(result, request, event, { ...actor, rol: 'cliente' }));
  assert(!isCorrectionReplay({ ...result, notas: 'Cambio posterior' }, request, event, actor));
});
