const { withTransaction } = require('../db');
const { prepareJournalWrite, syncJournal } = require('./journalRepository');

function withAccountingWrite(uid, action, context = {}) {
  return withTransaction(async db => {
    const touched = new Set();
    db.touchJournal = id => touched.add(id);
    // Take this lock before document/bank row locks. It also covers annual and
    // firm-wide closures, which can overlap any of this owner's client periods.
    await db.query('SELECT pg_advisory_xact_lock(1129333070, hashtext($1))', [uid]);
    await prepareJournalWrite(db, uid);
    const result = await action(db);
    await syncJournal(db, uid, assertAccountingPeriodOpen, context.correction, [...touched]);
    return result;
  });
}

async function assertAccountingPeriodOpen(db, uid, periodo, clienteId) {
  const { rows } = await db.query(`SELECT id FROM cierres_periodo WHERE usuario_id=$1 AND estado='cerrado'
    AND ((alcance='mensual' AND periodo=$2) OR (alcance='anual' AND anio=$3))
    AND (cliente_id IS NULL OR cliente_id=$4::uuid) LIMIT 1`, [uid, periodo, Number(periodo.slice(0, 4)), clienteId || null]);
  if (rows.length) throw Object.assign(new Error(`El periodo ${periodo} esta cerrado.`), { status: 409 });
}

module.exports = { withAccountingWrite, assertAccountingPeriodOpen };
