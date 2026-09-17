const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { legacyEntityFixture } = require('./legacyEntityFixture');

module.exports = async function legacyEntityBooksScenario({ request, requestRaw, install, snapshot, setRole, withSaveFailure, check }) {
  const signup = await request('/api/auth/register', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nombre: 'QA historial folios', email: 'qa-legacy-entity-' + randomUUID() + '@example.com', password: process.env.CONTAPANAMA_QA_PASSWORD }) });
  const uid = signup.user.id;
  const fixture = legacyEntityFixture(uid);
  await install(fixture);
  const headers = { 'Content-Type': 'application/json', Authorization: 'Bearer ' + signup.token };
  const read = url => request(url, { headers });
  const send = (url, body) => request(url, { method: 'POST', headers, body: JSON.stringify(body) });
  const endpoint = '/api/contabilidad/libros-entidad';
  const before = await snapshot(uid);
  const initial = await read(endpoint);
  assert.equal(initial.estado, 'pendiente_revision');
  assert.equal(initial.pendientes, 3);
  assert.equal(initial.data.length, 2);
  const oldJournal = await read('/api/contabilidad/asientos?anio=2070');
  assert.deepEqual(oldJournal.data.map(entry => entry.numero), [10, 20]);
  assert(oldJournal.data.every(entry => entry.numero_libro === null && entry.persistido));
  const balanceUrls = fixture.clientes.flatMap(client => [
    '/api/contabilidad/balance-comprobacion?anio=2070&cliente_id=' + client.id,
    '/api/contabilidad/resumen-mensual?anio=2070&cliente_id=' + client.id,
  ]);
  const balancesBefore = await Promise.all(balanceUrls.map(read));
  const newDoc = { cliente_id: fixture.clientes[0].id, fecha: '2071-02-02', tipo: 'ingreso',
    descripcion: 'QA operacion posterior al historial', monto: 25, itbms: 0, tasa_itbms: 0, estado_pago: 'pendiente' };
  await assert.rejects(send('/api/transacciones', newDoc), /409.*libros por cliente/);
  await assert.rejects(requestRaw('/api/reportes/libro-diario?anio=2070', { headers }), /409.*libros por cliente/);
  await assert.rejects(send(endpoint + '/incorporar', { fingerprint: initial.fingerprint }), /422/);
  const approval = { fingerprint: initial.fingerprint, confirmacion: 'ASIGNAR LIBROS POR CLIENTE' };
  await assert.rejects(send(endpoint + '/incorporar', { ...approval, fingerprint: '0'.repeat(64) }), /409.*cambiaron/);
  await setRole(uid, 'cliente');
  await assert.rejects(send(endpoint + '/incorporar', approval), /403/);
  await setRole(uid, 'contador');
  assert.deepEqual(await snapshot(uid), before);
  check('published legacy history is readable but cannot post or export unassigned folios; invalid, stale and unauthorized approvals change no accounting rows');

  await withSaveFailure(async () => {
    await assert.rejects(send(endpoint + '/incorporar', approval), /50[03]/);
  });
  assert.deepEqual(await snapshot(uid), before);
  assert.equal((await read(endpoint)).pendientes, 3);
  check('failed legacy folio assignment rolls back books, folios and audit without changing original entries');

  const approvals = await Promise.all(Array.from({ length: 8 }, () => send(endpoint + '/incorporar', approval)));
  assert(approvals.every(result => result.estado === 'asignado' && result.pendientes === 0));
  assert(approvals.every(result => result.fingerprint === approvals[0].fingerprint));
  const assigned = await snapshot(uid);
  for (const collection of ['transacciones', 'asientos_contables', 'asiento_lineas', 'libros_contables', 'cierres_periodo']) {
    assert.deepEqual(assigned[collection], before[collection], 'Legacy assignment altered ' + collection);
  }
  assert.equal(assigned.libros_entidad.length, 2);
  assert.equal(assigned.folios_libro.length, 3);
  assert.equal(assigned.audit_events.filter(event => event.accion === 'folios_cliente_incorporados').length, 1);
  assert.deepEqual(await Promise.all(balanceUrls.map(read)), balancesBefore);
  assert.equal(assigned.cierres_periodo[0].estado, 'cerrado');
  check('eight identical CPA approvals allocate once, preserve all originals and closed periods, and leave both clients annual balances and 12-month summaries unchanged');

  await send('/api/transacciones', newDoc);
  const final = await read(endpoint);
  assert.equal(final.data.find(book => book.cliente_id === fixture.clientes[0].id).ultimo_folio, 3);
  const afterNew = await snapshot(uid);
  for (const folio of assigned.folios_libro) assert.deepEqual(afterNew.folios_libro.find(row => row.asiento_id === folio.asiento_id), folio);
  const other = await request('/api/auth/register', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nombre: 'QA externo', email: 'qa-entity-outsider-' + randomUUID() + '@example.com', password: process.env.CONTAPANAMA_QA_PASSWORD }) });
  const otherHeaders = { ...headers, Authorization: 'Bearer ' + other.token };
  assert.equal((await request(endpoint, { headers: otherHeaders })).total_libros, 0);
  await assert.rejects(request(endpoint + '/incorporar', { method: 'POST', headers: otherHeaders, body: JSON.stringify(approval) }), /409/);
  check('post-migration entries continue the correct client sequence across years and another account cannot reuse the approval');
  return { endpoint, headers, expected: final };
};
