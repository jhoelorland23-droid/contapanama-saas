const { query } = require('../db');
const { withAccountingWrite, assertAccountingPeriodOpen } = require('./accountingWrite');
const { paymentSummary } = require('./paymentLedger');

async function attachPayments(rows, uid, db = { query }) {
  if (!rows.length) return rows;
  const payments = await db.query('SELECT * FROM pagos_transacciones WHERE usuario_id=$1 AND transaccion_id=ANY($2::uuid[]) ORDER BY fecha, created_at, id', [uid, rows.map(t => t.id)]);
  const grouped = new Map();
  for (const p of payments.rows) { if (!grouped.has(p.transaccion_id)) grouped.set(p.transaccion_id, []); grouped.get(p.transaccion_id).push(p); }
  return rows.map(tx => grouped.has(tx.id) ? { ...tx, pagos: grouped.get(tx.id) } : tx);
}

function sqlContext(db, uid) {
  return {
    async get(id, lock = false) {
      if (lock) db.touchJournal?.(id);
      const result = await db.query(`SELECT * FROM transacciones WHERE id=$1 AND usuario_id=$2${lock ? ' FOR UPDATE' : ''}`, [id, uid]);
      return (await attachPayments(result.rows, uid, db))[0];
    },
    async assertOpen(fecha, clienteId) {
      await assertAccountingPeriodOpen(db, uid, fecha.slice(0, 7), clienteId);
    },
    async getAccount(id) { return (await db.query('SELECT * FROM cuentas_bancarias WHERE id=$1 AND usuario_id=$2', [id, uid])).rows[0]; },
    async assignAccount(tx, accountId, motivo, banco) {
      db.touchJournal?.(tx.id);
      const next = (await db.query('UPDATE transacciones SET cuenta_bancaria_id=$3,banco=$4 WHERE id=$1 AND usuario_id=$2 RETURNING *', [tx.id, uid, accountId, banco])).rows[0];
      await db.query(`INSERT INTO audit_events(usuario_id,cliente_id,accion,objeto_tipo,objeto_id,antes_json,despues_json)
        VALUES($1,$2,'documento_cuenta_asignada','transaccion',$3,$4,$5)`, [uid,tx.cliente_id,tx.id,tx,{ ...next,motivo }]);
      return { ...next, ...paymentSummary(next) };
    },
    async save(tx, pagos, accion, before, extra = null) {
      db.touchJournal?.(tx.id);
      for (const payment of pagos) {
        await db.query(`INSERT INTO pagos_transacciones
          (id,usuario_id,transaccion_id,importe,fecha,metodo_pago,banco,referencia,idempotencia,conciliado,movimiento_bancario_id,anulado_fecha,anulado_motivo,cuenta_bancaria_id)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
          ON CONFLICT (id) DO UPDATE SET conciliado=EXCLUDED.conciliado, movimiento_bancario_id=EXCLUDED.movimiento_bancario_id,
            anulado_fecha=EXCLUDED.anulado_fecha, anulado_motivo=EXCLUDED.anulado_motivo, cuenta_bancaria_id=EXCLUDED.cuenta_bancaria_id`, [
          payment.id, uid, tx.id, payment.importe, payment.fecha, payment.metodo_pago, payment.banco || '', payment.referencia || '',
          payment.idempotencia || `legacy_${payment.id}`, Boolean(payment.conciliado), payment.movimiento_bancario_id || null,
          payment.anulado_fecha || null, payment.anulado_motivo || null, payment.cuenta_bancaria_id || null,
        ]);
      }
      const next = { ...tx, pagos: pagos.map(({ legacy, ...payment }) => payment) };
      const summary = paymentSummary(next);
      await db.query('UPDATE transacciones SET estado_pago=$1, fecha_pago=$2, conciliado=$3 WHERE id=$4 AND usuario_id=$5', [summary.estado_pago, summary.fecha_pago, summary.conciliado, tx.id, uid]);
      await db.query(`INSERT INTO audit_events(usuario_id,cliente_id,accion,objeto_tipo,objeto_id,antes_json,despues_json)
        VALUES($1,$2,$3,'transaccion',$4,$5,$6)`, [uid, tx.cliente_id, accion, tx.id, before, { ...next, ...summary, detalle_pago: extra }]);
      return { ...next, ...summary };
    },
    async getBank(id) { return (await db.query('SELECT * FROM movimientos_bancarios WHERE id=$1 AND usuario_id=$2 FOR UPDATE', [id, uid])).rows[0]; },
    async setBank(id, txId) { await db.query('UPDATE movimientos_bancarios SET conciliado=$1,transaccion_id=$2 WHERE id=$3 AND usuario_id=$4', [Boolean(txId), txId, id, uid]); },
  };
}

const paymentRepository = {
  read: (uid, id) => sqlContext({ query }, uid).get(id),
  transaction: (uid, fn) => withAccountingWrite(uid, db => fn(sqlContext(db, uid))),
};
module.exports = { attachPayments, paymentRepository };
