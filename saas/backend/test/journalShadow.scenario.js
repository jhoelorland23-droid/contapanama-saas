const assert = require('node:assert/strict');
const {randomUUID} = require('node:crypto');
const repository = require('../services/journalRepository');
const incrementalSql = require('../services/journalIncrementalSql');
module.exports = async ({db,check}) => {
  const uid=randomUUID(),id=randomUUID();
  await db.query(`INSERT INTO usuarios(id,nombre,email,password_hash,rol) VALUES($1,'QA Shadow',$2,'unused','contador')`,[uid,`qa-shadow-${uid}@example.test`]);
  const previousMode=process.env.CONTAPANAMA_JOURNAL_SYNC, originalRead=incrementalSql.readSubset;
  process.env.CONTAPANAMA_JOURNAL_SYNC='shadow';
  try {
    await db.query('BEGIN');
    await db.query('SELECT pg_advisory_xact_lock(1129333070,hashtext($1))',[uid]);
    await repository.prepareJournalWrite(db,uid);
    await db.query(`INSERT INTO transacciones(id,usuario_id,fecha,descripcion,tipo,monto,itbms,periodo)
      VALUES($1,$2,'2040-01-01','QA shadow injected mismatch','ingreso',100,0,'2040-01')`,[id,uid]);
    incrementalSql.readSubset=async (...args)=>({...await originalRead(...args),max:10});
    await repository.syncJournal(db,uid,null,null,[id]);
    await db.query('COMMIT');
    const entries=(await db.query('SELECT numero FROM asientos_contables WHERE usuario_id=$1',[uid])).rows;
    assert.deepEqual(entries.map(e=>Number(e.numero)),[1]);
    const audit=(await db.query(`SELECT despues_json FROM audit_events WHERE usuario_id=$1 AND accion='journal_shadow_divergence'`,[uid])).rows;
    assert.equal(audit.length,1);assert.notEqual(audit[0].despues_json.full_hash,audit[0].despues_json.incremental_hash);
    check('injected shadow numbering divergence is audited while only the proven full plan reaches the book');
    await db.query('UPDATE transacciones SET monto=101 WHERE id=$1',[id]);
    const revision=(await db.query('SELECT version FROM journal_pending_sources WHERE usuario_id=$1 AND transaccion_id=$2',[uid,id])).rows[0].version;
    await db.query('UPDATE transacciones SET monto=102 WHERE id=$1',[id]);
    assert.equal((await db.query('DELETE FROM journal_pending_sources WHERE usuario_id=$1 AND transaccion_id=$2 AND version=$3',[uid,id,revision])).rowCount,0);
    await db.query('UPDATE transacciones SET monto=100 WHERE id=$1',[id]);
    check('a stale verification cannot discard a newer dirty-source version');
  } catch(e) { await db.query('ROLLBACK');throw e; }
  finally { incrementalSql.readSubset=originalRead;if(previousMode===undefined)delete process.env.CONTAPANAMA_JOURNAL_SYNC;else process.env.CONTAPANAMA_JOURNAL_SYNC=previousMode; }
};
