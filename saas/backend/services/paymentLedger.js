const { dateKey } = require('./accountingPeriod');
const { isRegisteredTransaction } = require('./transactionStatus');

const cents = value => Math.round(Number(value || 0) * 100);
const amount = value => value / 100;
const documentCents = tx => cents(tx.monto) + cents(tx.itbms);
const hasPaymentLedger = tx => Array.isArray(tx.pagos) && tx.pagos.some(p => !p.legacy);

function paymentsFor(tx) {
  if (Array.isArray(tx.pagos) && tx.pagos.length) return tx.pagos;
  const paid = ['pagado', 'conciliado'].includes(tx.estado_pago) || (!tx.estado_pago && tx.fecha_pago);
  const fecha = dateKey(tx.fecha_pago);
  if (!paid || !fecha || fecha < dateKey(tx.fecha)) return [];
  return [{ id: tx.id, transaccion_id: tx.id, usuario_id: tx.usuario_id, importe: amount(documentCents(tx)), fecha,
    metodo_pago: tx.metodo_pago || '', banco: tx.banco || '', referencia: tx.referencia_pago || '', cuenta_bancaria_id: tx.cuenta_bancaria_id || null,
    conciliado: Boolean(tx.conciliado), legacy: true }];
}

function paymentEvents(tx) {
  return paymentsFor(tx).flatMap(payment => {
    const entry = { ...payment, fecha: dateKey(payment.fecha), importe: Number(payment.importe), reversa: false };
    return payment.anulado_fecha ? [entry, { ...entry, id: `reversa-${payment.id}`, pago_id: payment.id,
      fecha: dateKey(payment.anulado_fecha), importe: -Number(payment.importe), reversa: true, conciliado: false }] : [entry];
  }).sort((a, b) => a.fecha.localeCompare(b.fecha) || a.id.localeCompare(b.id));
}

const paidCentsAt = (tx, corte = '9999-12-31') => paymentEvents(tx).filter(p => p.fecha <= corte).reduce((sum, p) => sum + cents(p.importe), 0);
const outstandingAt = (tx, corte) => amount(documentCents(tx) - paidCentsAt(tx, corte));
const unresolvedPayment = tx => !hasPaymentLedger(tx) && (tx.estado_pago === 'parcial' ||
  (tx.estado_pago === 'pagado' && !paymentsFor(tx).length) || (tx.estado_pago === 'pendiente' && tx.fecha_pago));

function paymentSummary(tx) {
  const pagos = paymentsFor(tx);
  const paid = paidCentsAt(tx);
  const total = documentCents(tx);
  const active = pagos.filter(p => !p.anulado_fecha);
  return {
    pagos,
    importe_documento: amount(total),
    total_pagado: amount(paid),
    saldo_pendiente: amount(total - paid),
    estado_pago: hasPaymentLedger(tx) ? (paid === 0 ? 'pendiente' : paid === total ? 'pagado' : 'parcial') : tx.estado_pago || 'pendiente',
    fecha_pago: paid === total ? paymentEvents(tx).at(-1)?.fecha || null : null,
    conciliado: hasPaymentLedger(tx) ? paid === total && active.length > 0 && active.every(p => p.metodo_pago === 'efectivo' || p.conciliado) : Boolean(tx.conciliado),
  };
}

function fail(message, status = 422) { const error = new Error(message); error.status = status; throw error; }

function validateTimeline(tx, payments) {
  let paid = 0;
  const changes = new Map();
  for (const event of paymentEvents({ ...tx, pagos: payments })) changes.set(event.fecha, (changes.get(event.fecha) || 0) + cents(event.importe));
  for (const [, delta] of [...changes].sort(([a], [b]) => a.localeCompare(b))) {
    paid += delta;
    if (paid < 0 || paid > documentCents(tx)) fail('El importe excede el saldo disponible en la fecha del pago.', 409);
  }
}

function preparePayment(tx, body, id) {
  if (!isRegisteredTransaction(tx)) fail('Registre el borrador antes de ingresar un pago o cobro.', 409);
  if (unresolvedPayment(tx)) fail('El estado anterior del pago esta incompleto. Requiere revision antes de registrar abonos.', 409);
  const importe = String(body.importe ?? '');
  if (!/^\d+(\.\d{1,2})?$/.test(importe) || cents(importe) <= 0 || !Number.isSafeInteger(cents(importe))) fail('Indique un importe positivo con un maximo de dos decimales.');
  const fecha = dateKey(body.fecha);
  if (!fecha || fecha !== body.fecha || fecha < dateKey(tx.fecha)) fail('La fecha del pago debe ser valida e igual o posterior al documento.');
  if (!['efectivo','transferencia','cheque','tarjeta','otro'].includes(body.metodo_pago)) fail('Seleccione un metodo de pago valido.');
  const banco = body.metodo_pago === 'efectivo' ? '' : String(body.banco || '').trim();
  if (body.metodo_pago !== 'efectivo' && !banco) fail('Seleccione el banco del pago.');
  const cuentaId = body.metodo_pago === 'efectivo' ? null : body.cuenta_bancaria_id;
  if (body.metodo_pago !== 'efectivo' && (typeof cuentaId !== 'string' || !/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(cuentaId))) fail('Seleccione la cuenta bancaria exacta del pago.');
  if (body.metodo_pago === 'efectivo' && body.cuenta_bancaria_id) fail('Un pago en efectivo no puede tener cuenta bancaria.');
  if (banco.length > 100 || String(body.referencia || '').length > 200) fail('Banco o referencia demasiado largos.');
  if (typeof body.idempotencia !== 'string' || !/^[a-zA-Z0-9_-]{16,100}$/.test(body.idempotencia)) fail('Identificador del pago invalido.');
  const payment = { id, transaccion_id: tx.id, usuario_id: tx.usuario_id, importe: amount(cents(importe)), fecha,
    metodo_pago: body.metodo_pago, banco, cuenta_bancaria_id: cuentaId, referencia: String(body.referencia || '').trim(), idempotencia: body.idempotencia,
    conciliado: false, movimiento_bancario_id: null, anulado_fecha: null, anulado_motivo: null };
  validateTimeline(tx, [...paymentsFor(tx), payment]);
  return payment;
}

function samePayment(payment, body) {
  return cents(payment.importe) === cents(body.importe) && dateKey(payment.fecha) === body.fecha &&
    payment.metodo_pago === body.metodo_pago && (payment.cuenta_bancaria_id || null) === (body.cuenta_bancaria_id || null) &&
    payment.banco === (body.metodo_pago === 'efectivo' ? '' : String(body.banco || '').trim()) && payment.referencia === String(body.referencia || '').trim();
}

module.exports = { cents, amount, documentCents, hasPaymentLedger, paymentsFor, paymentEvents, outstandingAt,
  unresolvedPayment, paymentSummary, preparePayment, validateTimeline, samePayment, fail };
