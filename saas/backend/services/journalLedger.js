const { createHash, randomUUID } = require('node:crypto');
const { buildJournal, trialBalance } = require('./accountingEngine');
const { dateKey, inRange, periodRange } = require('./accountingPeriod');
const { paymentEvents, unresolvedPayment, fail } = require('./paymentLedger');
const { isRegisteredTransaction } = require('./transactionStatus');

const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const cents = value => {
  const result = Math.round(Number(value) * 100);
  if (!Number.isSafeInteger(result) || result < 0) fail('Importe contable invalido.');
  return result;
};

function canonical(entry) {
  if (!dateKey(entry.fecha) || dateKey(entry.fecha) !== entry.fecha) fail('Fecha del asiento invalida.');
  const lines = entry.lineas.map(item => ({ cuenta_codigo: item.cuenta_codigo, cuenta_nombre: item.cuenta_nombre,
    tipo_cuenta: item.tipo_cuenta, descripcion: item.descripcion || '', debe: cents(item.debe) / 100, haber: cents(item.haber) / 100 }));
  if (lines.length < 2 || lines.some(l => (l.debe > 0) === (l.haber > 0))) fail('Cada asiento debe tener al menos dos lineas validas.');
  if (lines.reduce((sum, l) => sum + cents(l.debe) - cents(l.haber), 0) !== 0) fail('El asiento no esta balanceado.');
  return { transaccion_id: entry.transaccion_id || null, cliente_id: entry.cliente_id || null,
    cliente_nombre: entry.cliente_nombre || '', pago_id: entry.pago_id || null,
    fecha: entry.fecha, periodo: entry.fecha.slice(0, 7), descripcion: entry.descripcion,
    tipo_asiento: entry.tipo_asiento, lineas: lines };
}

function verifyEntry(entry) {
  if (hash(canonical(entry)) !== entry.contenido_hash) fail('La integridad del libro contable no coincide. Revise el respaldo antes de continuar.', 409);
}

function journalPlan(transactions, existing = [], { origin = 'operacion', reason = 'Registro contable', reasons = {} } = {}) {
  existing.forEach(verifyEntry);
  if (transactions.filter(isRegisteredTransaction).some(unresolvedPayment)) fail('Hay pagos sin fecha o importe verificable. Complete su soporte antes de incorporar el libro.', 409);
  const originals = existing.filter(e => !e.rectifica_id);
  const reversed = new Set(existing.map(e => e.rectifica_id).filter(Boolean));
  const active = new Map(originals.filter(e => !reversed.has(e.id)).map(e => [e.origen_clave, e]));
  const wanted = new Map(buildJournal(transactions).map(e => [e.id, canonical(e)]));
  const pending = [];
  const append = (content, source, version, rectificaId = null) => pending.push({ ...content, id: randomUUID(),
    origen_clave: source, revision: version, rectifica_id: rectificaId,
    origen: rectificaId ? 'correccion' : origin, motivo: reasons[content.transaccion_id] || reason, contenido_hash: hash(content) });
  for (const [key, old] of active) {
    const next = wanted.get(key);
    if (next && hash(next) === old.contenido_hash) continue;
    append(canonical({ ...old, descripcion: `Correccion: ${old.descripcion}`, tipo_asiento: 'reversa_ajuste',
      lineas: old.lineas.map(l => ({ ...l, debe: l.haber, haber: l.debe })) }), `rectifica-${old.id}`, 1, old.id);
  }
  for (const [key, next] of wanted) {
    if (active.get(key)?.contenido_hash === hash(next)) continue;
    const version = Math.max(0, ...originals.filter(e => e.origen_clave === key).map(e => e.revision)) + 1;
    append(next, key, version);
  }
  return pending;
}

function incorporationPreview(transactions, existing = []) {
  const journal = buildJournal(transactions);
  const errors = [];
  if (existing.length) errors.push('Existen asientos sin una incorporacion registrada. Requieren revision tecnica antes de continuar.');
  for (const tx of transactions.filter(isRegisteredTransaction)) if (unresolvedPayment(tx)) errors.push(`Documento ${tx.id}: pago incompleto.`);
  const data = [];
  for (const entry of journal) {
    try { data.push(canonical(entry)); } catch (error) { errors.push(`${entry.transaccion_id}: ${error.message}`); }
  }
  const balance = trialBalance(journal);
  return { fingerprint: hash(data), documentos: new Set(journal.map(e => e.transaccion_id)).size,
    desde: journal[0]?.fecha || null, hasta: journal.at(-1)?.fecha || null,
    asientos: journal.length, total_debe: balance.total_debe, total_haber: balance.total_haber,
    balanceado: balance.balanceado, puede_incorporar: !errors.length && balance.balanceado, errores: errors, cuentas: balance.cuentas };
}

function publicJournal(entries, transactions, scope = {}, history = false) {
  const range = periodRange(scope);
  const paymentStatus = new Map(transactions.flatMap(t => paymentEvents(t).map(p => [`pago-${p.id}`, p])));
  return entries.filter(e => (!scope.cliente_id || e.cliente_id === scope.cliente_id) &&
    (history ? !range.hasta || e.fecha <= range.hasta : inRange(e.fecha, range)))
    .map(entry => {
      verifyEntry(entry);
      const total = entry.lineas.reduce((sum, l) => sum + cents(l.debe), 0) / 100;
      return { ...entry, total_debe: total, total_haber: total, diferencia: 0, balanceado: true,
        estado_pago: entry.tipo_asiento === 'documento' ? 'pendiente' : 'pagado',
        conciliado: Boolean(paymentStatus.get(entry.origen_clave)?.conciliado), persistido: true };
    }).sort((a, b) => a.fecha.localeCompare(b.fecha) || a.numero - b.numero);
}

module.exports = { canonical, verifyEntry, journalPlan, incorporationPreview, publicJournal, hash };
