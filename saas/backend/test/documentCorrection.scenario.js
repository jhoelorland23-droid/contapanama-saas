const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { pdfText } = require('./journalPdf.scenario');

module.exports = async function correctionScenario({ request, requestRaw, authHeaders, check, db, outputDirectory, withSaveFailure }) {
  const read = url => request(url, { headers: authHeaders });
  const send = (method, url, body) => request(url, { method, headers: authHeaders, body: JSON.stringify(body) });
  const client = await send('POST', '/api/clientes', { nombre: 'QA Correcciones CPA', tipo: 'natural', ruc: 'QA-CORRECCIONES' });
  const doc = await send('POST', '/api/transacciones', { cliente_id: client.id, fecha: '2070-01-02', tipo: 'ingreso',
    descripcion: 'QA soporte original', monto: 100, itbms: 0, tasa_itbms: 0, categoria_itbms: 'exento', estado_pago: 'pendiente' });
  const url = '/api/transacciones/' + doc.id;
  const journal = year => `/api/contabilidad/asientos?anio=${year}&cliente_id=${client.id}`;
  const snapshot = async () => ({ document: await read(url), audit: await read(url + '/auditoria'),
    oldYear: await read(journal(2070)), newYear: await read(journal(2071)) });
  const before = await snapshot();
  const preview = await read(url + '/revision');
  assert.deepEqual(await snapshot(), before, 'Review must be read-only');
  const reason = 'QA base ajustada contra soporte aprobado';
  const correction = { monto: 200, revision_esperada: preview.revision, motivo_ajuste: reason };
  for (const [body, status] of [
    [{ monto: 200 }, 422], [{ monto: 200, motivo_ajuste: reason }, 428],
    [{ ...correction, revision_esperada: 'f'.repeat(64) }, 409],
    [{ ...correction, motivo_ajuste: 'corto' }, 422], [{ ...correction, itbms: -1 }, 422],
    [{ ...correction, fecha: null }, 422], [{ ...correction, monto: 20.001 }, 422],
  ]) {
    await assert.rejects(send('PUT', url, body), new RegExp(String(status)));
    assert.deepEqual(await snapshot(), before, 'Rejected correction changed accounting state');
  }
  check('correction review is read-only; reason, revision, amount and date failures leave source, journal and audit unchanged');

  const responses = await Promise.all(Array.from({ length: 8 }, () => send('PUT', url, correction)));
  responses.forEach(row => assert.equal(Number(row.monto), 200));
  const corrected = await snapshot();
  assert.equal(corrected.oldYear.data.length, 3);
  assert.deepEqual(corrected.oldYear.data[0], before.oldYear.data[0]);
  const changes = corrected.oldYear.data.filter(e => e.id !== before.oldYear.data[0].id);
  assert.equal(changes.length, 2);
  assert(changes.every(e => e.motivo === reason));
  const original = before.oldYear.data[0];
  const reverse = changes.find(e => e.rectifica_id === original.id);
  assert.deepEqual(reverse.lineas, original.lineas.map(l => ({ ...l, debe: l.haber, haber: l.debe })));
  const events = corrected.audit.data.filter(e => e.accion === 'documento_corregido');
  assert.equal(events.length, 1);
  assert.equal(events[0].despues_json.ajuste.motivo, reason);
  assert.deepEqual(events[0].despues_json.ajuste.campos, ['monto']);
  assert.equal(events[0].despues_json.ajuste.actor.id, doc.usuario_id);
  assert.equal(events[0].despues_json.ajuste.revision_posterior, (await read(url + '/revision')).revision);
  await assert.rejects(send('PUT', url, { ...correction, motivo_ajuste: 'QA otro motivo no aprobado' }), /409/);
  assert.deepEqual(await snapshot(), corrected);
  check('eight concurrent identical corrections produce one audited approval and one exact reversal/replacement pair');

  const reviewed = await read(url + '/revision');
  await send('PUT', url, { notas: 'Soporte recibido despues de la revision' });
  const noted = await snapshot();
  assert.deepEqual(noted.oldYear, corrected.oldYear);
  await assert.rejects(send('PUT', url, { ...correction, monto: 210, revision_esperada: reviewed.revision }), /409/);
  assert.deepEqual(await snapshot(), noted);
  check('a subsequent document edit invalidates the old review without changing published entries');

  const failing = { descripcion: 'QA fallo correccion', motivo_ajuste: 'QA prueba atomica de correccion',
    revision_esperada: (await read(url + '/revision')).revision };
  if (db) {
    await db.query(`CREATE FUNCTION qa_fail_correction() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN IF NEW.descripcion='QA fallo correccion' THEN RAISE EXCEPTION 'QA correction failure'; END IF; RETURN NEW; END $$;
      CREATE TRIGGER qa_fail_correction BEFORE INSERT ON asientos_contables FOR EACH ROW EXECUTE FUNCTION qa_fail_correction()`);
    try { await assert.rejects(send('PUT', url, failing), /500.*QA correction failure/); }
    finally { await db.query('DROP TRIGGER qa_fail_correction ON asientos_contables; DROP FUNCTION qa_fail_correction()'); }
  } else {
    assert(withSaveFailure, 'Local scenario must exercise a real save failure');
    await withSaveFailure(async () => assert.rejects(send('PUT', url, failing), /503.*guardar/));
  }
  assert.deepEqual(await snapshot(), noted);
  check('failed correction commit rolls back document, audit, reason, reversal and replacement atomically');

  const newReason = 'QA fecha trasladada al ejercicio correcto';
  await send('PUT', url, { fecha: '2071-01-02', monto: 225, revision_esperada: (await read(url + '/revision')).revision, motivo_ajuste: newReason });
  const moved = await snapshot();
  assert.equal(moved.oldYear.data.length, 4);
  assert.equal(moved.newYear.data.length, 1);
  assert.equal(moved.newYear.data[0].revision, 3);
  assert.equal(moved.newYear.data[0].motivo, newReason);
  assert.deepEqual(moved.oldYear.data.slice(0, 3), corrected.oldYear.data);
  for (const [year, expected] of [[2070, 0], [2071, 225]]) {
    const balance = await read(`/api/contabilidad/balance-comprobacion?anio=${year}&cliente_id=${client.id}`);
    assert.equal(balance.cuentas.find(c => c.cuenta_codigo === '1030')?.saldo || 0, expected);
    const months = await read(`/api/contabilidad/resumen-mensual?anio=${year}&cliente_id=${client.id}`);
    assert.equal(months.data[0].total_asientos, year === 2070 ? 4 : 1);
    const response = await requestRaw(`/api/reportes/libro-diario?anio=${year}&cliente_id=${client.id}`, { headers: authHeaders });
    const buffer = Buffer.from(await response.arrayBuffer());
    const text = pdfText(buffer);
    assert(text.includes(newReason) && text.includes(doc.id));
    if (year === 2070) assert(text.includes(reason) && text.includes('Reversa del #'));
    if (outputDirectory) { fs.mkdirSync(outputDirectory, { recursive: true }); fs.writeFileSync(path.join(outputDirectory, `correccion-${year}.pdf`), buffer); }
  }
  check('cross-year correction preserves the old-year originals, clears old receivable, publishes new-year balance and carries reasons into both PDFs');

  const closeReview = await read(url + '/revision');
  await send('PUT', `/api/contabilidad/cierre-estado?periodo=2071-01&cliente_id=${client.id}`, { estado: 'cerrado' });
  await assert.rejects(read(url + '/revision'), /409/);
  await assert.rejects(send('PUT', url, { monto: 250, revision_esperada: closeReview.revision, motivo_ajuste: reason }), /409/);
  assert.deepEqual(await snapshot(), moved);
  const paidDoc = await send('POST', '/api/transacciones', { cliente_id: client.id, fecha: '2071-02-01', tipo: 'ingreso',
    descripcion: 'QA documento con abono', monto: 100, itbms: 0, tasa_itbms: 0, estado_pago: 'pendiente' });
  const paidUrl = '/api/transacciones/' + paidDoc.id;
  const paidReview = await read(paidUrl + '/revision');
  await send('POST', paidUrl + '/pagos', { importe: 10, fecha: '2071-02-03', metodo_pago: 'efectivo', idempotencia: randomUUID() });
  await assert.rejects(read(paidUrl + '/revision'), /409/);
  await assert.rejects(send('PUT', paidUrl, { monto: 250, revision_esperada: paidReview.revision, motivo_ajuste: reason }), /409/);
  assert.equal(Number((await read(paidUrl)).monto), 100);
  check('closures and a payment posted after review prevent financial corrections');

  const other = await send('POST', '/api/auth/register', { nombre: 'QA correcciones ajenas', email: `qa-corrections-${randomUUID()}@example.com`, password: process.env.CONTAPANAMA_QA_PASSWORD });
  const otherHeaders = { ...authHeaders, Authorization: `Bearer ${other.token}` };
  for (const suffix of ['/revision', '/auditoria']) await assert.rejects(request(url + suffix, { headers: otherHeaders }), /404/);
  await assert.rejects(request(url, { method: 'PUT', headers: otherHeaders, body: JSON.stringify(correction) }), /404/);
  if (db) {
    // Foreign events may reference an owned object; the owner predicate must still apply.
    await db.query(`INSERT INTO audit_events(usuario_id,accion,objeto_tipo,objeto_id,despues_json)
      VALUES($1,'qa_foreign','transaccion',$2,$3)`, [other.user.id, doc.id, { transaccion_id: doc.id }]);
    assert(!(await read(url + '/auditoria')).data.some(e => e.accion === 'qa_foreign'));
    const restricted = await request('/api/transacciones', { method: 'POST', headers: otherHeaders,
      body: JSON.stringify({ fecha: '2070-01-02', tipo: 'ingreso', descripcion: 'QA rol restringido', monto: 100, itbms: 0, estado_pago: 'pendiente' }) });
    const rev = await request(`/api/transacciones/${restricted.id}/revision`, { headers: otherHeaders });
    await db.query("UPDATE usuarios SET rol='cliente' WHERE id=$1", [other.user.id]);
    await assert.rejects(request(`/api/transacciones/${restricted.id}/revision`, { headers: otherHeaders }), /403/);
    await assert.rejects(request(`/api/transacciones/${restricted.id}`, { method: 'PUT', headers: otherHeaders,
      body: JSON.stringify({ ...correction, revision_esperada: rev.revision }) }), /403/);
  }
  check('another account cannot review, correct or read the audit of an owned document');
  return { endpoint: url + '/auditoria', expected: await read(url + '/auditoria') };
};
