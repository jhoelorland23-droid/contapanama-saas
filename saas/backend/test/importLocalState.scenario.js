const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { importState } = require('../db/importLocalState');
const { owner, bytes } = require('./importLocalFixture');
module.exports = async ({ db, connect, check }) => {
  const input = bytes(), targetOwner = randomUUID();
  await db.query(`INSERT INTO usuarios(id,nombre,email,password_hash,rol) VALUES($1,'QA Importacion',$2,'unused','contador')`, [targetOwner,`qa-import-${targetOwner}@example.test`]);
  const preview = await importState(input, { sourceOwner: owner });
  const options = { sourceOwner: owner, targetOwner, targetDatabase: 'contapanama_qa', apply: true,
    expectedHash: preview.fingerprint, authorizeSourceHash: preview.fingerprint, confirmation: 'IMPORTAR DOCUMENTOS SIN PUBLICAR' };
  await assert.rejects(importState(input, { ...options, authorizeSourceHash: undefined }, db, { NODE_ENV: 'test' }), /autorizacion explicita/);
  assert.equal((await importState(input, { ...options, apply: 'true' }, db)).mode, 'dry-run');
  for (const table of ['clientes','transacciones','pagos_transacciones','audit_events']) assert.equal((await db.query(`SELECT 1 FROM ${table} WHERE usuario_id=$1`,[targetOwner])).rowCount,0);
  check('forged synthetic metadata and string apply cannot write to PostgreSQL');
  await db.query(`CREATE FUNCTION qa_import_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
    IF NEW.accion='importacion_local_preparada' THEN RAISE EXCEPTION 'QA importer rollback'; END IF; RETURN NEW; END $$;
    CREATE TRIGGER qa_import_fail BEFORE INSERT ON audit_events FOR EACH ROW EXECUTE FUNCTION qa_import_fail()`);
  try { await assert.rejects(importState(input, options, db, { NODE_ENV: 'test' }), /QA importer rollback/); }
  finally { await db.query('DROP TRIGGER qa_import_fail ON audit_events; DROP FUNCTION qa_import_fail()'); }
  for (const table of ['clientes','transacciones','pagos_transacciones','journal_pending_sources']) assert.equal((await db.query(`SELECT 1 FROM ${table} WHERE usuario_id=$1`,[targetOwner])).rowCount,0);
  check('synthetic importer failure rolls back clients, documents, payments, dirty queue and audit');
  const results = await Promise.all(Array.from({length:8}, async (_,index) => {
    const client = await connect();
    try { return await importState(input,{...options,targetOwner:index%2?targetOwner.toUpperCase():targetOwner},client,{NODE_ENV:'test'}); } finally { await client.end(); }
  }));
  assert.equal(results.filter(r=>!r.repetido).length,1);
  const firstReplay = await importState(input, options, db, { NODE_ENV: 'test' });
  const secondReplay = await importState(input, options, db, { NODE_ENV: 'test' });
  assert.equal(firstReplay.repetido, true); assert.deepEqual(secondReplay, firstReplay);
  for (const table of ['clientes','transacciones','pagos_transacciones']) assert.equal((await db.query(`SELECT 1 FROM ${table} WHERE usuario_id=$1`,[targetOwner])).rowCount,1);
  for (const table of ['libros_contables','asientos_contables','folios_libro']) assert.equal((await db.query(`SELECT 1 FROM ${table} WHERE usuario_id=$1`,[targetOwner])).rowCount,0);
  assert.equal((await db.query(`SELECT 1 FROM audit_events WHERE usuario_id=$1 AND accion='importacion_local_preparada'`,[targetOwner])).rowCount,1);
  const changed = Buffer.from(input.toString().replace('QA Sintetico','QA Otra copia'));
  const next = await importState(changed,{sourceOwner:owner});
  await assert.rejects(importState(changed,options,db,{NODE_ENV:'test'}),/fingerprint/);
  await assert.rejects(importState(changed,{...options,expectedHash:next.fingerprint},db,{NODE_ENV:'test'}),/autorizacion explicita/);
  await assert.rejects(importState(changed,{...options,expectedHash:next.fingerprint,authorizeSourceHash:next.fingerprint},db,{NODE_ENV:'test'}),/no esta vacio/);
  check('altered source is rejected and two sequential replays preserve the original import');
  check('eight synthetic import retries commit exactly once, preserve partial payment and do not publish without CPA approval');
};
