const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { pdfText } = require('./journalPdf.scenario');

module.exports = async function entityBooksScenario({ request, requestRaw, authHeaders, check, db, outputDirectory }) {
  const read = url => request(url, { headers: authHeaders });
  const send = (method, url, body) => request(url, { method, headers: authHeaders, body: JSON.stringify(body) });
  const a = await send('POST', '/api/clientes', { nombre: 'QA Libro Empresa Alfa', tipo: 'natural', ruc: 'QA-LIBRO-ALFA' });
  const b = await send('POST', '/api/clientes', { nombre: 'QA Libro Empresa Beta', tipo: 'jur\u00eddica', ruc: 'QA-LIBRO-BETA' });
  const payload = { fecha: '2074-01-02', tipo: 'ingreso', descripcion: 'QA folio por empresa',
    monto: 200, itbms: 0, tasa_itbms: 0, categoria_itbms: 'exento', estado_pago: 'pendiente' };
  const originalA = await send('POST', '/api/transacciones', { ...payload, cliente_id: a.id });
  const originalB = await send('POST', '/api/transacciones', { ...payload, cliente_id: b.id, monto: 300 });
  await send('POST', '/api/transacciones', { ...payload, cliente_id: a.id, fecha: '2074-02-01', monto: 50 });
  const journal = clientId => `/api/contabilidad/asientos?anio=2074&cliente_id=${clientId}`;
  const firstA = (await read(journal(a.id))).data;
  const firstB = (await read(journal(b.id))).data;
  assert.deepEqual(firstA.map(entry => entry.numero_libro), [1, 2]);
  assert.equal(firstB[0].numero_libro, 1);
  assert.notEqual(firstA[0].libro_entidad_id, firstB[0].libro_entidad_id);
  assert.notEqual(firstA[0].numero, firstB[0].numero, 'Historical owner-wide identifiers must remain unique');
  const registry = await read('/api/contabilidad/libros-entidad');
  assert.equal(registry.estado, 'asignado');
  assert.equal(registry.data.find(book => book.cliente_id === a.id).ultimo_folio, 2);
  check('two clients start at folio one in different persistent books while historical identifiers remain unique');

  const correct = async (id, changes) => send('PUT', '/api/transacciones/' + id, { ...changes,
    revision_esperada: (await read(`/api/transacciones/${id}/revision`)).revision, motivo_ajuste: 'QA soporte revisado de libro por cliente' });
  await correct(originalA.id, { monto: 250 });
  await send('POST', `/api/transacciones/${originalA.id}/pagos`, { importe: 60, fecha: '2074-03-01', metodo_pago: 'efectivo', idempotencia: randomUUID() });
  await correct(originalB.id, { cliente_id: a.id });
  const moved = await read('/api/transacciones/' + originalB.id);
  assert.equal(moved.cliente_nombre, a.nombre, 'A linked client name must be resolved by the server');
  const afterA = (await read(journal(a.id))).data;
  const afterB = (await read(journal(b.id))).data;
  assert.deepEqual(afterA.map(entry => entry.numero_libro).sort((x, y) => x - y), [1, 2, 3, 4, 5, 6]);
  assert.deepEqual(afterB.map(entry => entry.numero_libro), [1, 2]);
  assert.deepEqual(afterA.find(entry => entry.id === firstA[0].id), firstA[0]);
  assert.deepEqual(afterB[0], firstB[0]);
  assert.equal(afterB[1].rectifica_numero_libro, 1);
  assert(afterA.every(entry => entry.libro_entidad_id === firstA[0].libro_entidad_id));
  assert(afterB.every(entry => entry.libro_entidad_id === firstB[0].libro_entidad_id));
  const balanceA = await read(`/api/contabilidad/balance-comprobacion?anio=2074&cliente_id=${a.id}`);
  const balanceB = await read(`/api/contabilidad/balance-comprobacion?anio=2074&cliente_id=${b.id}`);
  assert.equal(balanceA.cuentas.find(account => account.cuenta_codigo === '1030').saldo, 540);
  assert.equal(balanceB.cuentas.find(account => account.cuenta_codigo === '1030').saldo, 0);
  check('correction, receipt and reassignment preserve both originals, reverse in the old entity and post only to the destination book');

  for (const client of [a, b]) {
    const response = await requestRaw(`/api/reportes/libro-diario?anio=2074&cliente_id=${client.id}`, { headers: authHeaders });
    const buffer = Buffer.from(await response.arrayBuffer());
    const text = pdfText(buffer);
    assert(text.includes('Folio #000001'));
    const ownId = client.id === a.id ? firstA[0].libro_entidad_id : firstB[0].libro_entidad_id;
    const otherId = client.id === a.id ? firstB[0].libro_entidad_id : firstA[0].libro_entidad_id;
    assert(text.includes(ownId) && !text.includes(otherId));
    if (outputDirectory) { fs.mkdirSync(outputDirectory, { recursive: true }); fs.writeFileSync(path.join(outputDirectory, `libro-entidad-${client.id === a.id ? 'alfa' : 'beta'}.pdf`), buffer); }
  }
  check('each annual PDF carries its own book UUID and folios without another entity book identifier');

  const requests = Array.from({ length: 8 }, (_, i) => send('POST', '/api/transacciones', {
    ...payload, cliente_id: i % 2 ? a.id : b.id, fecha: '2074-04-01', descripcion: `QA concurrente por libro ${i}` }));
  const reads = Array.from({ length: 16 }, () => read('/api/contabilidad/libros-entidad'));
  await Promise.all([...requests, ...reads]);
  for (const [client, expected] of [[a, 10], [b, 6]]) {
    const entries = (await read(journal(client.id))).data;
    assert.deepEqual(entries.map(entry => entry.numero_libro).sort((x, y) => x - y), Array.from({ length: expected }, (_, i) => i + 1));
  }
  check('concurrent reads and writes preserve independent gap-free sequences without mixed-snapshot integrity errors');

  if (db) {
    for (const [sql, params] of [
      ['UPDATE folios_libro SET numero=99 WHERE asiento_id=$1', [firstA[0].id]],
      ['DELETE FROM folios_libro WHERE asiento_id=$1', [firstA[0].id]],
      ['UPDATE libros_entidad SET cliente_id=$1 WHERE id=$2', [b.id, firstA[0].libro_entidad_id]],
      ['DELETE FROM libros_entidad WHERE id=$1', [firstA[0].libro_entidad_id]],
      ['TRUNCATE folios_libro', []],
    ]) await assert.rejects(db.query(sql, params), error => error.code === '23514');
    const before = await read(journal(a.id));
    await db.query(`CREATE FUNCTION qa_fail_folio() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'QA folio failure'; END $$;
      CREATE TRIGGER qa_fail_folio BEFORE INSERT ON folios_libro FOR EACH ROW EXECUTE FUNCTION qa_fail_folio()`);
    try { await assert.rejects(send('POST', '/api/transacciones', { ...payload, cliente_id: a.id, descripcion: 'QA fallo de folio' }), /500.*QA folio failure/); }
    finally { await db.query('DROP TRIGGER qa_fail_folio ON folios_libro; DROP FUNCTION qa_fail_folio()'); }
    assert.deepEqual(await read(journal(a.id)), before);
    assert.equal((await db.query('SELECT count(*) FROM transacciones WHERE descripcion=$1', ['QA fallo de folio'])).rows[0].count, '0');
    check('SQL rejects folio/book edits, deletes and truncate; failed folio insertion rolls back the financial document');
  }
  return { endpoint: journal(a.id), expected: await read(journal(a.id)) };
};
