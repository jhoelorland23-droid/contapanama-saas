const { dateKey, cutoffDate, periodRange, inRange } = require('./accountingPeriod');
const { isRegisteredTransaction } = require('./transactionStatus');
const { cents, paymentsFor } = require('./paymentLedger');

// Both closing and reconciliation must validate the same dated, unique link.
function paymentBankLinks(transactions, movements, accounts, corte) {
  const accountMap = new Map(accounts.map(account => [account.id, account]));
  const bankHistory = movements.filter(m => dateKey(m.fecha) && dateKey(m.fecha) <= corte);
  const byId = new Map(bankHistory.map(m => [m.id, m]));
  const byDocument = new Map();
  for (const m of bankHistory) {
    if (!byDocument.has(m.transaccion_id)) byDocument.set(m.transaccion_id, []);
    byDocument.get(m.transaccion_id).push(m);
  }
  const candidates = new Map(), claims = new Map();
  const key = (tx, p) => JSON.stringify([tx.id, p.id]);
  for (const tx of transactions.filter(isRegisteredTransaction)) {
    if (!dateKey(tx.fecha) || dateKey(tx.fecha) > corte) continue;
    for (const p of paymentsFor(tx)) {
      if (!dateKey(p.fecha) || dateKey(p.fecha) < dateKey(tx.fecha) || dateKey(p.fecha) > corte ||
          (p.anulado_fecha && dateKey(p.anulado_fecha) <= corte) || p.metodo_pago === 'efectivo') continue;
      const account = accountMap.get(p.cuenta_bancaria_id);
      if (!p.conciliado || !tx.cliente_id || !account || account.cliente_id !== tx.cliente_id ||
          account.banco !== p.banco || (tx.usuario_id && account.usuario_id && tx.usuario_id !== account.usuario_id)) continue;
      const pool = p.legacy ? byDocument.get(tx.id) || [] : [byId.get(p.movimiento_bancario_id)];
      const matches = pool.filter(m => m && m.conciliado && m.transaccion_id === tx.id &&
        m.cliente_id === tx.cliente_id && m.cuenta_bancaria_id === p.cuenta_bancaria_id && m.banco === p.banco &&
        (!tx.usuario_id || !m.usuario_id || tx.usuario_id === m.usuario_id) &&
        cents(p.importe) > 0 && cents(m.monto) === cents(p.importe) &&
        m.tipo === (tx.tipo === 'ingreso' ? 'credito' : 'debito'));
      if (matches.length !== 1) continue;
      const m = matches[0];
      candidates.set(key(tx, p), m);
      claims.set(m.id, (claims.get(m.id) || 0) + 1);
    }
  }
  return (tx, p) => {
    const m = candidates.get(key(tx, p));
    return m && claims.get(m.id) === 1 ? m : null;
  };
}

function bankClosingReview(transactions, scope = {}, evidence = null) {
  const corte = cutoffDate(scope), range = periodRange(scope);
  const belongs = row => scope.cliente_id ? row.cliente_id === scope.cliente_id :
    scope.sin_cliente ? !row.cliente_id : true;
  const rows = transactions.filter(isRegisteredTransaction).filter(tx =>
    belongs(tx) && dateKey(tx.fecha) && dateKey(tx.fecha) <= corte);
  const loaded = Array.isArray(evidence?.movements) && Array.isArray(evidence?.accounts);
  const movements = (evidence?.movements || []).filter(m =>
    belongs(m) && dateKey(m.fecha) && dateKey(m.fecha) <= corte);
  const link = paymentBankLinks(rows, movements, evidence?.accounts || [], corte);
  const verified = new Set(), pending = [], matched = [];
  for (const tx of rows) for (const p of paymentsFor(tx)) {
    if (p.metodo_pago === 'efectivo' || !dateKey(p.fecha) || dateKey(p.fecha) > corte ||
        (p.anulado_fecha && dateKey(p.anulado_fecha) <= corte)) continue;
    const m = link(tx, p);
    const item = { transaccion_id: tx.id, pago_id: p.legacy ? null : p.id, cliente_id: tx.cliente_id || null,
      cuenta_bancaria_id: p.cuenta_bancaria_id || null, fecha: dateKey(p.fecha),
      anterior_al_periodo: Boolean(range.desde && dateKey(p.fecha) < range.desde), importe: Number(p.importe),
      requiere_revision: Boolean(p.conciliado), en_periodo: inRange(dateKey(p.fecha), range) };
    if (m) { verified.add(m.id); matched.push(item); }
    else pending.push(item);
  }
  const bankPending = movements.filter(m => !verified.has(m.id)).map(m => ({
    movimiento_id: m.id, cliente_id: m.cliente_id || null, cuenta_bancaria_id: m.cuenta_bancaria_id || null,
    fecha: dateKey(m.fecha), anterior_al_periodo: Boolean(range.desde && dateKey(m.fecha) < range.desde),
    requiere_revision: Boolean(m.conciliado), importe: Number(m.monto),
  }));
  const invalid = pending.filter(p => p.requiere_revision).length + bankPending.filter(m => m.requiere_revision).length;
  const activity = pending.length + matched.length + bankPending.length > 0;
  const clear = !pending.length && !bankPending.length && (loaded || !activity);
  return { version: 'vinculos_bancarios_al_corte_v1', fecha_corte: corte, evidencia_cargada: loaded,
    estado: !loaded && activity ? 'no_verificado' : !activity ? 'sin_movimientos' : clear ? 'movimientos_vinculados' : 'pendiente',
    movimientos_verificados: loaded && activity && clear, sin_pendientes: clear,
    saldo_verificado: false, pagos_pendientes: pending.length, movimientos_pendientes: bankPending.length,
    vinculos_invalidos: invalid, pagos_vinculados_periodo: matched.filter(p => p.en_periodo).length,
    pendientes_anteriores: pending.filter(p => p.anterior_al_periodo).length + bankPending.filter(m => m.anterior_al_periodo).length,
    detalle_pagos: pending, detalle_movimientos: bankPending };
}

async function readBankEvidence(uid, db = require('../db')) {
  const movements = (await db.query('SELECT * FROM movimientos_bancarios WHERE usuario_id=$1', [uid])).rows;
  const accounts = (await db.query('SELECT * FROM cuentas_bancarias WHERE usuario_id=$1', [uid])).rows;
  return { movements, accounts };
}

module.exports = { paymentBankLinks, bankClosingReview, readBankEvidence };
