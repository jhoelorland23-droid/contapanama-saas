const { test } = require('node:test');
const assert = require('node:assert/strict');
const { inspectSource, importState, authorize } = require('../db/importLocalState');
const { owner, fixture, bytes } = require('./importLocalFixture');
test('dry-run is default, does not connect and previews balances, periods and CPA approval', async () => {
  const report = await importState(bytes(), { sourceOwner: owner }, { query: () => { throw new Error('SQL called by dry-run'); } });
  assert.equal(report.mode, 'dry-run'); assert.equal(report.pagos, 1); assert.equal(report.clientes, 1);
  assert.equal(report.documentos, 1); assert.equal(report.saldos[0].saldo_pendiente, 67);
  assert.equal(report.aprobacion_cpa_requerida, true); assert.equal(report.puede_importar, true);
  assert.equal(report.incorporacion_esperada.asientos, 2); assert.match(report.fingerprint, /^[a-f0-9]{64}$/);
});
test('apply requires source fingerprint, explicit destination, production and real-copy authorizations', () => {
  const p = inspectSource(bytes(), owner);
  const options = { targetOwner: owner, expectedHash: p.report.fingerprint, confirmation: 'IMPORTAR DOCUMENTOS SIN PUBLICAR', targetDatabase: 'contapanama_qa' };
  assert.throws(() => authorize(p, {}, {}), /Faltan/);
  assert.throws(() => authorize(p, { ...options, expectedHash: 'wrong' }, {}), /fingerprint/);
  assert.throws(() => authorize(p, options, { NODE_ENV: 'test' }), /autorizacion explicita/);
  const approved = { ...options, authorizeSourceHash: p.report.fingerprint };
  assert.doesNotThrow(() => authorize(p, approved, { NODE_ENV: 'test' }));
  assert.throws(() => authorize(p, approved, { NODE_ENV: 'production' }), /produccion bloqueada/);
  assert.throws(() => authorize(p, { ...approved, targetDatabase: 'another_db' }, {}), /Destino no QA/);
  delete p.source.metadata;
  assert.throws(() => authorize(p, options, { NODE_ENV: 'test' }), /autorizacion explicita/);
});

test('truthy apply values cannot write or connect, even with complete authorizations', async () => {
  const input = bytes(), preview = inspectSource(input, owner).report;
  const db = { query: () => { throw new Error('SQL must not be called'); } };
  for (const apply of ['true', 'false', 1, {}, [], false, undefined]) {
    const report = await importState(input, { sourceOwner: owner, targetOwner: owner, apply,
      targetDatabase: 'contapanama_qa', expectedHash: preview.fingerprint,
      authorizeSourceHash: preview.fingerprint, confirmation: 'IMPORTAR DOCUMENTOS SIN PUBLICAR' }, db);
    assert.equal(report.mode, 'dry-run');
  }
});

test('forged synthetic metadata grants no authorization and is rejected before SQL', async () => {
  const input = bytes(), fingerprint = inspectSource(input, owner).report.fingerprint;
  const db = { query: () => { throw new Error('SQL must not be called'); } };
  await assert.rejects(importState(input, { sourceOwner: owner, targetOwner: owner, apply: true,
    targetDatabase: 'contapanama_qa', expectedHash: fingerprint,
    confirmation: 'IMPORTAR DOCUMENTOS SIN PUBLICAR' }, db, { NODE_ENV: 'test' }), /autorizacion explicita/);
});

test('altered source invalidates both preview fingerprint and separate source approval', async () => {
  const input = bytes(), previous = inspectSource(input, owner).report.fingerprint;
  const changed = fixture(); changed.clientes[0].nombre = 'QA altered';
  const nextBytes = Buffer.from(JSON.stringify(changed)), next = inspectSource(nextBytes, owner).report.fingerprint;
  const options = { sourceOwner: owner, targetOwner: owner, apply: true, targetDatabase: 'contapanama_qa',
    expectedHash: previous, authorizeSourceHash: previous, confirmation: 'IMPORTAR DOCUMENTOS SIN PUBLICAR' };
  const db = { query: () => { throw new Error('SQL must not be called'); } };
  await assert.rejects(importState(nextBytes, options, db), /fingerprint/);
  await assert.rejects(importState(nextBytes, { ...options, expectedHash: next }, db), /autorizacion explicita/);
});
test('unverified reconciliation, invalid dates and paid-without-evidence prevent import', () => {
  const incomplete=fixture();delete incomplete.clientes[0].tipo;
  assert.equal(inspectSource(Buffer.from(JSON.stringify(incomplete)),owner).report.puede_importar,false);
  const f = fixture(); f.transacciones[0].fecha = '2041-02-31'; f.transacciones[0].conciliado = true;
  f.transacciones[0].pagos = []; f.transacciones[0].estado_pago = 'pagado';
  const report = inspectSource(Buffer.from(JSON.stringify(f)), owner).report;
  assert.equal(report.puede_importar, false); assert(report.inconsistencias.some(e => /conciliacion/.test(e)));
  assert(report.inconsistencias.some(e => /fecha/.test(e)));
});
