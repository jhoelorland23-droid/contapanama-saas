const { hash } = require('./journalLedger');
const { isRegisteredTransaction } = require('./transactionStatus');
const { isSettlementOnlyUpdate, isReconciliationReversal } = require('./paymentValidation');
const { fail } = require('./paymentLedger');
const { dateKey } = require('./accountingPeriod');

const materialFields = ['cliente_id', 'cliente_nombre', 'fecha', 'descripcion', 'tipo', 'categoria_contable',
  'monto', 'tasa_itbms', 'categoria_itbms', 'itbms', 'deducible', 'banco', 'referencia', 'tipo_documento',
  'estado_pago', 'fecha_vencimiento', 'fecha_pago', 'metodo_pago', 'referencia_pago'];
const editableFields = [...materialFields, 'conciliado', 'fecha_conciliacion', 'notas'];
const numeric = new Set(['monto', 'itbms', 'tasa_itbms']);
const normalized = (field, value) => value instanceof Date ? value.toISOString() :
  numeric.has(field) ? Number(value || 0) : value === null || value === undefined ? '' : value;
const values = row => Object.fromEntries([...editableFields, 'id', 'usuario_id', 'estado_contable', 'updated_at']
  .map(field => [field, normalized(field, row[field])]));
const documentRevision = row => hash(values(row));
const changesFrom = body => Object.fromEntries(editableFields.filter(field => body[field] !== undefined).map(field => [field, body[field]]));

function correctionFields(current, body) {
  const changes = changesFrom(body);
  if (!isRegisteredTransaction(current) || isSettlementOnlyUpdate(current, changes) || isReconciliationReversal(current, changes)) return [];
  return materialFields.filter(field => changes[field] !== undefined &&
    normalized(field, current[field]) !== normalized(field, changes[field]));
}

const requestHash = body => hash({ revision: body.revision_esperada, motivo: typeof body.motivo_ajuste === 'string' ? body.motivo_ajuste.trim() : body.motivo_ajuste,
  cambios: Object.entries(changesFrom(body)).map(([field, value]) => [field, normalized(field, value)]) });

function authorizeCorrection(current, body, actor) {
  const fields = correctionFields(current, body);
  if (fields.length && !['admin', 'contador'].includes(actor.rol)) fail('Solo un contador o administrador puede corregir documentos contabilizados.', 403);
  if (body.revision_esperada !== undefined && (typeof body.revision_esperada !== 'string' || !/^[a-f0-9]{64}$/.test(body.revision_esperada))) {
    fail('Revise la version actual del documento antes de corregirlo.', 428);
  }
  if (body.revision_esperada !== undefined && body.revision_esperada !== documentRevision(current)) {
    fail('El documento cambio desde su revision. Actualicelo antes de confirmar.', 409);
  }
  if (!fields.length) return null;
  if (typeof body.motivo_ajuste !== 'string' || body.motivo_ajuste.trim().length < 10 || body.motivo_ajuste.trim().length > 1000) {
    fail('Indique el motivo de la correccion (entre 10 y 1000 caracteres).', 422);
  }
  if (typeof body.revision_esperada !== 'string' || !/^[a-f0-9]{64}$/.test(body.revision_esperada)) {
    fail('Revise la version actual del documento antes de corregirlo.', 428);
  }
  if (body.revision_esperada !== documentRevision(current)) fail('El documento cambio desde su revision. Actualicelo antes de confirmar.', 409);
  for (const field of ['monto', 'itbms']) {
    if (body[field] !== undefined && (!/^\d+(\.\d{1,2})?$/.test(String(body[field])) ||
        !Number.isSafeInteger(Math.round(Number(body[field]) * 100)) || (field === 'monto' && Number(body[field]) <= 0))) {
      fail('Indique importes validos con un maximo de dos decimales.', 422);
    }
  }
  for (const field of ['fecha', 'fecha_pago', 'fecha_vencimiento']) {
    if (body[field] !== undefined && !(field !== 'fecha' && body[field] === null) &&
        (!body[field] || dateKey(body[field]) !== body[field])) fail('Fecha de correccion invalida.', 422);
  }
  if (body.descripcion !== undefined && (typeof body.descripcion !== 'string' || !body.descripcion.trim())) fail('Descripcion requerida.', 422);
  if (body.deducible !== undefined && typeof body.deducible !== 'boolean') fail('El estado deducible debe ser verdadero o falso.', 422);
  if (body.tipo !== undefined && !['ingreso', 'gasto'].includes(body.tipo)) fail('Tipo contable invalido.', 422);
  if (body.tasa_itbms !== undefined && (body.tasa_itbms === '' || !Number.isFinite(Number(body.tasa_itbms)) || Number(body.tasa_itbms) < 0 || Number(body.tasa_itbms) > 0.15)) fail('Tasa ITBMS invalida.', 422);
  return { documentId: current.id, reason: body.motivo_ajuste.trim(), campos: fields,
    revision_anterior: body.revision_esperada, request_hash: requestHash(body),
    actor: { id: actor.id, nombre: actor.nombre, rol: actor.rol } };
}

function correctionAudit(correction, updated) {
  if (!correction) return updated;
  return { ...updated, ajuste: { motivo: correction.reason, campos: correction.campos,
    revision_anterior: correction.revision_anterior, revision_posterior: documentRevision(updated),
    request_hash: correction.request_hash, actor: correction.actor } };
}

function isCorrectionReplay(current, body, event, actor) {
  const adjustment = event?.despues_json?.ajuste;
  return Boolean(adjustment && ['admin', 'contador'].includes(actor.rol) && adjustment.actor?.id === actor.id &&
    adjustment.revision_anterior === body.revision_esperada && adjustment.revision_posterior === documentRevision(current) &&
    adjustment.request_hash === requestHash(body));
}

module.exports = { materialFields, changesFrom, correctionFields, documentRevision, authorizeCorrection, correctionAudit, isCorrectionReplay };
