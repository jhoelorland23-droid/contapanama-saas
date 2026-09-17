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
  assert.throws(() => authorize(p, options, { NODE_ENV: 'production' }), /produccion bloqueada/);
  delete p.source.metadata;
  assert.throws(() => authorize(p, options, { NODE_ENV: 'test' }), /no es sintetica/);
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
