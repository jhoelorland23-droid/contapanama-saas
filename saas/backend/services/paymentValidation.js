const { dateKey } = require('./accountingPeriod');
const paymentFields = ['estado_pago', 'fecha_pago', 'metodo_pago', 'referencia_pago', 'banco'];

function validatePayment(tx) {
  const status = tx.estado_pago || 'pendiente';
  if (status === 'parcial') return 'Los abonos parciales requieren importe y registro individual; no se puede marcar el documento como pagado.';
  if (!['pendiente', 'pagado'].includes(status)) return 'Estado de pago invalido.';
  if (status === 'pendiente') return tx.fecha_pago ? 'Un documento pendiente no puede tener fecha de pago.' : null;
  const fecha = dateKey(tx.fecha_pago);
  if (!fecha || !dateKey(tx.fecha) || fecha < dateKey(tx.fecha)) return 'Indique la fecha real del pago, igual o posterior a la fecha del documento.';
  if (!String(tx.metodo_pago || '').trim()) return 'Seleccione el metodo de pago.';
  if (tx.metodo_pago !== 'efectivo' && !String(tx.banco || '').trim()) return 'Seleccione el banco del pago o cobro.';
  return null;
}

function isSettlementOnlyUpdate(current, changes) {
  const keys = Object.keys(changes);
  return keys.length > 0 && keys.every(key => paymentFields.includes(key)) &&
    !current.fecha_pago && (!current.estado_pago || current.estado_pago === 'pendiente') && changes.estado_pago === 'pagado';
}

const isReconciliationReversal = (current, changes) => current.conciliado && changes.conciliado === false && Object.keys(changes).every(key => ['conciliado', 'fecha_conciliacion'].includes(key));
function bankPeriodSql(anio) {
  const start = anio ? '$2::date' : "($2::text || '-01')::date";
  const end = `(${start} + INTERVAL '${anio ? '1 year' : '1 month'}')`;
  const bank = "COALESCE(metodo_pago,'') <> 'efectivo'";
  return {
    paid: `estado_pago = 'pagado' AND fecha_pago >= fecha AND fecha_pago >= ${start} AND fecha_pago < ${end} AND ${bank}`,
    pending: `fecha < ${end} AND (fecha_pago IS NULL OR fecha_pago < ${end}) AND estado_pago <> 'parcial' AND ${bank}`,
  };
}
module.exports = { paymentFields, validatePayment, isSettlementOnlyUpdate, isReconciliationReversal, bankPeriodSql };
