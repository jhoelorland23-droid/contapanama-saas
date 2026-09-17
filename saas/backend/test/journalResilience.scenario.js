const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

// Failure modes around the persistent book: double clicks and retries on document
// creation, hung statements, a PostgreSQL outage, and direct SQL attacks on
// published documents and reversals.
module.exports = async function journalResilienceScenario({ request, requestRaw, authHeaders, db, check, restartApi, stopCluster, startCluster }) {
  const read = url => request(url, { headers: authHeaders });
  const send = (method, url, body) => request(url, { method, headers: authHeaders, body: JSON.stringify(body) });
  const post = body => requestRaw('/api/transacciones', { method: 'POST', headers: authHeaders, body: JSON.stringify(body) });
  const user = await read('/api/auth/me');
  const client = await send('POST', '/api/clientes', { nombre: 'QA resiliencia libro', tipo: 'natural', ruc: 'QA-RESILIENCIA' });
  const journalUrl = `/api/contabilidad/asientos?anio=2080&cliente_id=${client.id}`;
  const payload = { cliente_id: client.id, fecha: '2080-01-05', tipo: 'ingreso', descripcion: 'QA doble clic',
    monto: 100, itbms: 0, tasa_itbms: 0, categoria_itbms: 'exento', estado_pago: 'pendiente' };
  const countOwner = async () => (await db.query(`SELECT
    (SELECT count(*) FROM transacciones WHERE usuario_id=$1 AND cliente_id=$2)::int AS documentos,
    (SELECT count(*) FROM asientos_contables WHERE usuario_id=$1 AND cliente_id=$2)::int AS asientos,
    (SELECT count(*) FROM audit_events WHERE usuario_id=$1 AND cliente_id=$2 AND accion='transaccion_creada')::int AS creaciones`,
  [user.id, client.id])).rows[0];

  const key = randomUUID();
  const responses = await Promise.all(Array.from({ length: 8 }, () => post({ ...payload, idempotencia: key })));
  const bodies = await Promise.all(responses.map(response => response.json()));
  assert.equal(responses.filter(response => response.status === 201).length, 1, 'exactly one creation');
  assert.equal(responses.filter(response => response.status === 200).length, 7, 'seven acknowledged replays');
  assert.equal(new Set(bodies.map(body => body.id)).size, 1);
  assert.equal(bodies.filter(body => body.repetido).length, 7);
  assert.deepEqual(await countOwner(), { documentos: 1, asientos: 1, creaciones: 1 });
  const retry = await post({ ...payload, idempotencia: key });
  assert.equal(retry.status, 200);
  assert.equal((await retry.json()).id, bodies[0].id);
  await assert.rejects(send('POST', '/api/transacciones', { ...payload, idempotencia: key, monto: 999 }), /409.*otro documento/);
  await assert.rejects(send('POST', '/api/transacciones', { ...payload, idempotencia: 'corta' }), /422/);
  await assert.rejects(db.query(`INSERT INTO transacciones(usuario_id,cliente_id,fecha,periodo,tipo,descripcion,monto,itbms,idempotencia)
    VALUES($1,$2,'2080-01-05','2080-01','ingreso','QA backstop',1,0,$3)`, [user.id, client.id, key]), error => error.code === '23505');
  assert.deepEqual(await countOwner(), { documentos: 1, asientos: 1, creaciones: 1 });
  assert.equal((await read(journalUrl)).data.length, 1);
  check('eight simultaneous creations, a late retry and a direct SQL insert with one key publish a single document and entry; mismatched content and invalid keys are rejected');

  const [original] = (await read(journalUrl)).data;
  await assert.rejects(db.query('DELETE FROM transacciones WHERE id=$1', [original.transaccion_id]), error => error.code === '23514');
  const revision = (await read(`/api/transacciones/${original.transaccion_id}/revision`)).revision;
  const correction = { monto: 200, revision_esperada: revision, motivo_ajuste: 'QA reverso unico verificado' };
  await send('PUT', `/api/transacciones/${original.transaccion_id}`, correction);
  const corrected = await read(journalUrl);
  assert.equal(corrected.data.length, 3);
  const reversal = corrected.data.find(entry => entry.rectifica_id === original.id);
  assert(reversal, 'correction posts one reversal of the original');
  await db.query('BEGIN');
  try {
    await assert.rejects(db.query(`INSERT INTO asientos_contables
      (id,usuario_id,transaccion_id,cliente_id,fecha,periodo,descripcion,origen_clave,revision,rectifica_id,numero,contenido_hash,tipo_asiento,motivo)
      VALUES($1,$2,$3,$4,'2080-01-05','2080-01','QA reverso duplicado',$5,1,$6,
        (SELECT COALESCE(MAX(numero),0)+1 FROM asientos_contables WHERE usuario_id=$2),$7,'reversa_ajuste','QA')`,
    [randomUUID(), user.id, original.transaccion_id, client.id, `rectifica-${original.id}-dup`, original.id, 'b'.repeat(64)]),
    error => error.code === '23505', 'the database must refuse a second reversal of the same original');
  } finally { await db.query('ROLLBACK'); }
  await send('PUT', `/api/transacciones/${original.transaccion_id}`, correction);
  assert.deepEqual(await read(journalUrl), corrected, 'a replayed correction must not add another reversal or replacement');
  await assert.rejects(db.query('DELETE FROM transacciones WHERE id=$1', [original.transaccion_id]), error => error.code === '23514');
  check('a published document survives direct SQL deletion; an original can be reversed only once and a replayed correction adds nothing');

  await restartApi({ CONTAPANAMA_STATEMENT_TIMEOUT_MS: '1500' });
  await db.query(`CREATE FUNCTION qa_hang_document() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN IF NEW.descripcion='QA sentencia colgada' THEN PERFORM pg_sleep(6); END IF; RETURN NEW; END $$;
    CREATE TRIGGER qa_hang_document BEFORE INSERT ON transacciones FOR EACH ROW EXECUTE FUNCTION qa_hang_document()`);
  try {
    const started = Date.now();
    await assert.rejects(send('POST', '/api/transacciones', { ...payload, descripcion: 'QA sentencia colgada' }), /500.*statement timeout/);
    assert(Date.now() - started < 5000, 'the hung statement must be cancelled by statement_timeout, not run to completion');
    assert.equal((await db.query('SELECT count(*) FROM transacciones WHERE descripcion=$1', ['QA sentencia colgada'])).rows[0].count, '0');
    const next = await post({ ...payload, descripcion: 'QA escritura posterior al timeout' });
    assert.equal(next.status, 201, 'the owner lock is released after the cancelled statement');
  } finally {
    await db.query('DROP TRIGGER qa_hang_document ON transacciones; DROP FUNCTION qa_hang_document()');
    await restartApi({});
  }
  assert.deepEqual(await countOwner(), { documentos: 2, asientos: 4, creaciones: 2 });
  check('a hung statement is cancelled by statement_timeout, commits nothing and releases the owner lock for the next write');

  const beforeOutage = await read(journalUrl);
  await stopCluster();
  await assert.rejects(requestRaw('/health'), /503/);
  // An outage must never look like an expired session: the UI signs the user out on 401.
  await assert.rejects(send('POST', '/api/transacciones', { ...payload, descripcion: 'QA base de datos caida' }), /-> 503:/);
  await assert.rejects(requestRaw(journalUrl, { headers: authHeaders }), /-> 503:/);
  await assert.rejects(requestRaw('/api/auth/me', { headers: authHeaders }), /-> 503:/);
  await startCluster();
  const deadline = Date.now() + 20000;
  let healthy = false;
  while (!healthy && Date.now() < deadline) {
    try { healthy = (await request('/health')).status === 'ok'; } catch (_) { await delay(250); }
  }
  assert(healthy, 'API must recover its pool once PostgreSQL is back');
  assert.deepEqual(await read(journalUrl), beforeOutage, 'nothing from the outage window was committed');
  const afterOutage = await post({ ...payload, descripcion: 'QA escritura tras reinicio' });
  assert.equal(afterOutage.status, 201);
  const reads = await Promise.all(Array.from({ length: 6 }, () => read(journalUrl)));
  assert(reads.every(result => result.data.length === beforeOutage.data.length + 1));
  check('while PostgreSQL is down the API reports 503/500 and commits nothing; after restart the published book is intact and writes resume');
  return { endpoint: journalUrl, expected: await read(journalUrl) };
};
