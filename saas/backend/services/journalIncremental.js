const { journalPlan } = require('./journalLedger');
const { paymentsFor } = require('./paymentLedger');

// The same planner on a verified document subset. SQL integration is gated by
// CONTAPANAMA_JOURNAL_SYNC; the full planner remains the default and shadow oracle.

// Every origen_clave a document can own in the book.
function affectedKeys(tx) {
  const keys = new Set([`tx-${tx.id}`, `pago-${tx.id}`]); // legacy single payment uses the document id
  for (const payment of paymentsFor(tx)) {
    keys.add(`pago-${payment.id}`);
    keys.add(`pago-reversa-${payment.id}`);
  }
  return keys;
}

const ownedBy = (entry, ids) => ids.has(entry.transaccion_id);

// Plans the book for the touched documents only. `existing` must contain every entry
// (originals, reversals and replacements) that belongs to those documents.
function planIncremental(touched, existing, options = {}) {
  const ids = new Set(touched.map(tx => tx.id));
  const foreign = existing.find(entry => !ownedBy(entry, ids));
  if (foreign) throw Object.assign(new Error(`El asiento ${foreign.id} no pertenece a los documentos afectados.`), { status: 500 });
  return journalPlan(touched, existing, options);
}

// What the full algorithm would publish for the same documents: the oracle used by the tests.
function referencePlan(transactions, existing, touchedIds, options = {}) {
  const ids = new Set(touchedIds);
  return journalPlan(transactions, existing, options).filter(entry => ownedBy(entry, ids));
}

module.exports = { affectedKeys, planIncremental, referencePlan };
