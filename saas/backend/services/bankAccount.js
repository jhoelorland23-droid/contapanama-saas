const { createHash } = require('node:crypto');
const { fail } = require('./paymentLedger');
const { uuid } = require('./bankMovement');

function prepareBankAccount(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) fail('Cuenta bancaria invalida.');
  if (!uuid(body.cliente_id)) fail('Seleccione el cliente propietario de la cuenta.');
  const nombre = typeof body.nombre === 'string' ? body.nombre.trim() : '';
  const banco = typeof body.banco === 'string' ? body.banco.trim().replace(/\s+/g, ' ') : '';
  const numero = typeof body.numero === 'string' ? body.numero.replace(/[ -]/g, '').toUpperCase() : '';
  if (!nombre || nombre.length > 100 || !banco || banco.length > 100 || !/^[A-Z0-9]{4,40}$/.test(numero)) {
    fail('Indique nombre, banco y numero de cuenta validos.');
  }
  if (!['corriente', 'ahorros'].includes(body.tipo)) fail('Seleccione cuenta corriente o de ahorros.');
  if (body.moneda !== 'USD') fail('El libro actual admite cuentas en USD; no realiza conversion de monedas.');
  return { cliente_id: body.cliente_id, nombre, banco, numero, tipo: body.tipo, moneda: 'USD' };
}

function assertAccountOwner(account, row, active = true) {
  if (!account) fail('Cuenta bancaria no encontrada.', 404);
  if (!row.cliente_id || account.cliente_id !== row.cliente_id) fail('La cuenta bancaria pertenece a otro cliente.', 409);
  if (account.banco !== row.banco) fail('El banco no coincide con la cuenta seleccionada.', 409);
  if (active && !account.activa) fail('La cuenta bancaria esta archivada.', 409);
}

function assertAccountMatch(payment, bank) {
  if (!payment.cuenta_bancaria_id || !bank.cuenta_bancaria_id) fail('Asigne la cuenta exacta al pago y al movimiento antes de conciliar.', 409);
  if (payment.cuenta_bancaria_id !== bank.cuenta_bancaria_id) fail('El movimiento pertenece a otra cuenta bancaria.', 409);
}

function documentAccountId(tx) {
  const id = tx.cuenta_bancaria_id || null;
  if (tx.metodo_pago === 'efectivo' && id) fail('Un pago en efectivo no puede tener cuenta bancaria.');
  if (id && !uuid(id)) fail('Cuenta bancaria invalida.');
  if (tx.estado_pago === 'pagado' && tx.metodo_pago !== 'efectivo' && !id) fail('Seleccione la cuenta exacta antes de registrar un documento pagado.');
  return id;
}

const accountLabel = account => account ? `${account.nombre} - ${account.tipo} ***${account.numero.slice(-4)} (${account.moneda})` : 'Sin cuenta asignada';
function operationKey(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{16,100}$/.test(value)) fail('Identificador de operacion bancaria invalido.');
  return value;
}
async function bankOperation(db, key, kind, payload, action) {
  const hash = createHash('sha256').update(JSON.stringify({ kind, payload })).digest('hex');
  const previous = await db.getOperation(key);
  if (previous) {
    if (previous.tipo !== kind || previous.contenido_hash !== hash) fail('Ese identificador ya corresponde a otra operacion bancaria. Revise el lote guardado.', 409);
    return { result: previous.resultado_json, replay: true };
  }
  const result = await action();
  await db.saveOperation(key, kind, hash, result);
  return { result, replay: false };
}
module.exports = { prepareBankAccount, assertAccountOwner, assertAccountMatch, documentAccountId, accountLabel, operationKey, bankOperation };
