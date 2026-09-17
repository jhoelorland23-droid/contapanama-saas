const { dateKey } = require('./accountingPeriod');
const { cents } = require('./paymentLedger');

// Same rules as payments: the client keeps one key per attempt until the API acknowledges it.
const IDEMPOTENCY_KEY = /^[a-zA-Z0-9_-]{16,100}$/;
const validIdempotencyKey = value => typeof value === 'string' && IDEMPOTENCY_KEY.test(value);

// A replayed key must describe the very same document; anything else is a different operation.
function sameDocument(row, body) {
  return (row.cliente_id || null) === (body.cliente_id || null) &&
    dateKey(row.fecha) === dateKey(body.fecha) &&
    String(row.descripcion || '').trim() === String(body.descripcion || '').trim() &&
    row.tipo === body.tipo &&
    cents(row.monto) === cents(body.monto) &&
    (body.itbms === undefined || cents(row.itbms) === cents(body.itbms));
}

module.exports = { IDEMPOTENCY_KEY, validIdempotencyKey, sameDocument };
