const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');

module.exports = async function journalScenario({ request, requestRaw, authHeaders, db, check }) {
  const read = url => request(url, { headers: authHeaders });
  const send = (method, url, body) => request(url, { method, headers: authHeaders, body: JSON.stringify(body) });
  const user = await read('/api/auth/me');
  const client = await send('POST', '/api/clientes', { nombre: 'QA libro permanente', tipo: 'natural', ruc: 'QA-LIBRO' });
  const scope = `anio=2050&cliente_id=${client.id}`;
  const journalUrl = `/api/contabilidad/asientos?${scope}`;
  const payload = { cliente_id: client.id, fecha: '2050-01-02', tipo: 'ingreso', descripcion: 'QA libro original',
    monto: 100, itbms: 0, tasa_itbms: 0, categoria_itbms: 'exento', estado_pago: 'pendiente' };
  const invoice = await send('POST', '/api/transacciones', payload);
  assert.equal((await read('/api/contabilidad/libro')).data.metodo_incorporacion, 'libro_nuevo');
  const original = (await read(journalUrl)).data;
  assert.equal(original.length, 1);
  assert.equal(original[0].persistido, true);
  assert(Number.isInteger(original[0].numero));
  assert.equal((await db.query('SELECT count(*) FROM asiento_lineas WHERE asiento_id=$1', [original[0].id])).rows[0].count, '2');
  await send('PUT', `/api/transacciones/${invoice.id}`, { monto: 200,
    revision_esperada: (await read(`/api/transacciones/${invoice.id}/revision`)).revision, motivo_ajuste: 'QA importe revisado contra soporte' });
  const corrected = (await read(journalUrl)).data;
  assert.equal(corrected.length, 3);
  assert.deepEqual(corrected.find(e => e.id === original[0].id), original[0]);
  assert.equal(corrected.filter(e => e.rectifica_id === original[0].id).length, 1);
  assert.equal(corrected.find(e => e.revision === 2).lineas.find(l => l.cuenta_codigo === '1030').debe, 200);
  const balance = await read(`/api/contabilidad/balance-comprobacion?${scope}`);
  assert.equal(balance.cuentas.find(c => c.cuenta_codigo === '1030').saldo, 200);
  const summary = await read(`/api/contabilidad/resumen-mensual?${scope}`);
  assert.equal(summary.data[0].total_asientos, 3);
  await send('PUT', `/api/transacciones/${invoice.id}`, { notas: 'QA soporte adicional' });
  assert.deepEqual((await read(journalUrl)).data, corrected, 'Notes must not publish new money or edit old entries');
  await assert.rejects(send('DELETE', `/api/transacciones/${invoice.id}`), /409.*asientos publicados/);
  assert.deepEqual((await read(journalUrl)).data, corrected);
  check('SQL journal persists numbers, preserves originals, appends exact corrections and feeds annual balances');

  assert.equal((await read('/api/contabilidad/libro')).consistencia.estado, 'consistente');
  assert.equal((await read(`/api/contabilidad/consistencia?${scope}`)).estado, 'consistente');
  // A read must use stored entries, not silently rebuild from changed source fields.
  await db.query('UPDATE transacciones SET monto=300 WHERE id=$1', [invoice.id]);
  try {
    assert.deepEqual((await read(journalUrl)).data, corrected);
    // documentos (300) != libro (200) != dashboard (300): the drift must be visible, not silent.
    const drift = await read(`/api/contabilidad/consistencia?${scope}`);
    assert.equal(drift.estado, 'divergente');
    assert.deepEqual(drift.pendientes.map(p => p.tipo_asiento), ['reversa_ajuste', 'documento']);
    assert.deepEqual(drift.cuentas_divergentes.map(row => [row.cuenta_codigo, row.diferencia]), [['1030', -100], ['4010', 100]]);
    assert.equal(drift.totales.documentos.ingresos, 300);
    assert.equal(drift.totales.libro.ingresos, 200);
    assert.equal(drift.totales.reportes_vs_libro.ingresos, 100);
    assert.equal(Number((await read('/api/dashboard?periodo=2050-01')).financiero.ingresos), 300, 'dashboard still reads documents');
    assert.equal((await read(`/api/contabilidad/balance-comprobacion?${scope}`)).cuentas.find(c => c.cuenta_codigo === '1030').saldo, 200, 'balance reads the book');
    assert.equal((await read('/api/contabilidad/libro')).consistencia.estado, 'divergente');
    await assert.rejects(send('POST', '/api/transacciones', { ...payload, descripcion: 'QA no incorporar alteracion externa' }), /409.*sin una correccion/);
    assert.equal((await db.query('SELECT count(*) FROM transacciones WHERE descripcion=$1', ['QA no incorporar alteracion externa'])).rows[0].count, '0');
    assert.deepEqual((await read(journalUrl)).data, corrected);
  }
  finally { await db.query('UPDATE transacciones SET monto=200 WHERE id=$1', [invoice.id]); }
  assert.equal((await read(`/api/contabilidad/consistencia?${scope}`)).estado, 'consistente');
  check('unreviewed source alterations cannot be silently published by an unrelated SQL write and are reported as documentos != libro != dashboard');

  const eid = original[0].id;
  for (const statement of [
    ['UPDATE asientos_contables SET descripcion=$1 WHERE id=$2', ['alterado', eid]],
    ['DELETE FROM asientos_contables WHERE id=$1', [eid]],
    ['UPDATE asiento_lineas SET debe=debe+1 WHERE asiento_id=$1 AND debe>0', [eid]],
    ['DELETE FROM asiento_lineas WHERE asiento_id=$1', [eid]],
    [`INSERT INTO asiento_lineas(asiento_id,usuario_id,orden,cuenta_codigo,cuenta_nombre,tipo_cuenta,debe,haber)
      VALUES($1,$2,10,'1010','Caja','activo',1,0)`, [eid, user.id]],
    ['DELETE FROM libros_contables WHERE usuario_id=$1', [user.id]],
    ['TRUNCATE asiento_lineas', []],
  ]) {
    await assert.rejects(db.query(...statement), error => error.code === '23514');
  }
  assert.deepEqual((await read(journalUrl)).data, corrected);
  check('database rejects posted entry/line edits, deletes, late line additions and truncate');

  async function invalidEntry(lines, withFolio = true) {
    await db.query('BEGIN');
    try {
      const id = randomUUID();
      const { rows: [entry] } = await db.query(`INSERT INTO asientos_contables
        (id,usuario_id,transaccion_id,cliente_id,fecha,periodo,descripcion,origen_clave,revision,numero,
         contenido_hash,tipo_asiento,motivo)
        VALUES($1::uuid,$2,$3,$4,'2050-01-03','2050-01','QA constraint',$1::uuid::text,1,
          (SELECT COALESCE(MAX(numero),0)+1 FROM asientos_contables WHERE usuario_id=$2),$5,'documento','QA') RETURNING id`,
      [id, user.id, invoice.id, client.id, 'a'.repeat(64)]);
      for (const [index, amount] of lines.entries()) {
        await db.query(`INSERT INTO asiento_lineas(asiento_id,usuario_id,orden,cuenta_codigo,cuenta_nombre,tipo_cuenta,debe,haber)
          VALUES($1,$2,$3,'1010','Caja','activo',$4,$5)`, [entry.id, user.id, index + 1, amount[0], amount[1]]);
      }
      if (withFolio) await db.query(`INSERT INTO folios_libro(asiento_id,usuario_id,libro_entidad_id,numero,folio_hash)
        SELECT $1,$2,id,(SELECT COALESCE(MAX(numero),0)+1 FROM folios_libro WHERE libro_entidad_id=b.id),$4
        FROM libros_entidad b WHERE usuario_id=$2 AND cliente_id=$3`, [id, user.id, client.id, 'a'.repeat(64)]);
      await assert.rejects(db.query('COMMIT'), error => error.code === '23514' &&
        (withFolio ? /vacio o desbalanceado/.test(error.message) : /requiere un folio/.test(error.message)));
    } finally { await db.query('ROLLBACK'); }
  }
  await invalidEntry([]);
  await invalidEntry([[100, 0], [0, 90]]);
  await invalidEntry([[100, 0], [0, 100]], false);
  assert.deepEqual((await read(journalUrl)).data, corrected);
  check('deferred SQL checks independently reject empty/unbalanced entries and balanced entries missing their folio');

  const countOwner = async () => (await db.query(`SELECT
    (SELECT count(*) FROM transacciones WHERE usuario_id=$1)::int AS documentos,
    (SELECT count(*) FROM asientos_contables WHERE usuario_id=$1)::int AS asientos,
    (SELECT count(*) FROM asiento_lineas WHERE usuario_id=$1)::int AS lineas,
    (SELECT count(*) FROM audit_events WHERE usuario_id=$1)::int AS auditoria`, [user.id])).rows[0];
  const beforeFailure = await countOwner();
  await db.query(`CREATE FUNCTION qa_fail_journal() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN IF NEW.descripcion='QA fallo libro' THEN RAISE EXCEPTION 'QA fail journal'; END IF; RETURN NEW; END $$;
    CREATE TRIGGER qa_fail_journal BEFORE INSERT ON asientos_contables FOR EACH ROW EXECUTE FUNCTION qa_fail_journal()`);
  try { await assert.rejects(send('POST', '/api/transacciones', { ...payload, descripcion: 'QA fallo libro' }), /500.*QA fail journal/); }
  finally { await db.query('DROP TRIGGER qa_fail_journal ON asientos_contables; DROP FUNCTION qa_fail_journal()'); }
  assert.deepEqual(await countOwner(), beforeFailure);
  check('journal failure rolls back source document, journal lines and audit together');

  const signup = await send('POST', '/api/auth/register', { nombre: 'QA historial', email: 'qa-historial@example.com', password: process.env.CONTAPANAMA_QA_PASSWORD });
  const legacyHeaders = { 'Content-Type': 'application/json', Authorization: `Bearer ${signup.token}` };
  const legacyRead = url => request(url, { headers: legacyHeaders });
  const incorporate = body => request('/api/contabilidad/libro/incorporar', { method: 'POST', headers: legacyHeaders, body: JSON.stringify(body) });
  const id = randomUUID();
  await db.query(`INSERT INTO transacciones(id,usuario_id,fecha,periodo,tipo,descripcion,monto,itbms,estado_pago)
    VALUES($1,$2,'2020-01-01','2020-01','ingreso','QA historial heredado',100,0,'pendiente')`, [id, signup.user.id]);
  const preview = await legacyRead('/api/contabilidad/libro');
  assert.equal(preview.estado, 'pendiente_revision');
  await assert.rejects(requestRaw('/api/reportes/libro-diario?anio=2020', { headers: legacyHeaders }), /409.*incorpore/);
  assert.equal(preview.revision.puede_incorporar, true);
  assert.equal((await legacyRead('/api/contabilidad/asientos?anio=2020')).data[0].persistido, false);
  assert.equal((await db.query('SELECT count(*) FROM asientos_contables WHERE usuario_id=$1', [signup.user.id])).rows[0].count, '0');
  await assert.rejects(incorporate({ fingerprint: preview.revision.fingerprint }), /422/);
  await db.query('UPDATE transacciones SET monto=110 WHERE id=$1', [id]);
  await assert.rejects(incorporate({ fingerprint: preview.revision.fingerprint, confirmacion: 'INCORPORAR LIBRO' }), /409.*cambiaron/);
  const fresh = await legacyRead('/api/contabilidad/libro');
  const confirmed = { fingerprint: fresh.revision.fingerprint, confirmacion: 'INCORPORAR LIBRO' };
  await db.query("UPDATE usuarios SET rol='cliente' WHERE id=$1", [signup.user.id]);
  await assert.rejects(incorporate(confirmed), /403/);
  await db.query("UPDATE usuarios SET rol='contador' WHERE id=$1", [signup.user.id]);
  const results = await Promise.all([incorporate(confirmed), incorporate(confirmed)]);
  assert.equal(results[0].data.id, results[1].data.id);
  assert.equal(results[0].total_asientos, 1);
  assert.equal(results[0].data.metodo_incorporacion, 'revision_cpa');
  const imported = await legacyRead('/api/contabilidad/asientos?anio=2020');
  assert.equal(imported.data[0].persistido, true);
  assert.equal(imported.data[0].origen, 'incorporacion');
  assert.equal(imported.data[0].total_debe, 110);
  assert.equal((await legacyRead(journalUrl)).total_asientos, 0);
  check('legacy history requires CPA confirmation, detects stale preview and handles duplicate approvals without reposting');
  return { endpoint: journalUrl, expected: await read(journalUrl) };
};
