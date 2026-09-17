const { dateKey } = require('./accountingPeriod');
const { fail } = require('./paymentLedger');

const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

function prepareBankMovement(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) fail('Movimiento bancario invalido.');
  if (!uuid(body.cliente_id)) fail('Seleccione el cliente propietario del movimiento bancario.');
  if (!uuid(body.cuenta_bancaria_id)) fail('Seleccione la cuenta bancaria exacta del movimiento.');
  const fecha = dateKey(body.fecha);
  if (!fecha || fecha !== body.fecha) fail('Fecha bancaria invalida.');
  const monto = String(body.monto ?? '');
  const cents = Math.round(Number(monto) * 100);
  if (!/^\d+(\.\d{1,2})?$/.test(monto) || !Number.isSafeInteger(cents) || cents <= 0 || cents > 99999999999999) {
    fail('Monto bancario invalido: indique un valor positivo con hasta dos decimales.');
  }
  if (!['credito', 'debito'].includes(body.tipo)) fail('Seleccione credito o debito; no se infiere la direccion.');
  const descripcion = typeof body.descripcion === 'string' ? body.descripcion.trim() : '';
  const banco = typeof body.banco === 'string' ? body.banco.trim() : '';
  const referencia = body.referencia == null ? '' : String(body.referencia).trim();
  if (!descripcion || descripcion.length > 2000 || !banco || banco.length > 100 || referencia.length > 100) {
    fail('Descripcion, banco o referencia bancaria invalidos.');
  }
  return { cliente_id: body.cliente_id, cuenta_bancaria_id: body.cuenta_bancaria_id, fecha, monto: cents / 100, tipo: body.tipo, descripcion, banco, referencia };
}

function assertBankClient(tx, bank) {
  if (!tx.cliente_id || !bank.cliente_id) fail('Asigne y revise el cliente del documento y del movimiento bancario antes de conciliar.', 409);
  if (tx.cliente_id !== bank.cliente_id) fail('El movimiento bancario pertenece a otro cliente.', 409);
}

module.exports = { uuid, prepareBankMovement, assertBankClient };
