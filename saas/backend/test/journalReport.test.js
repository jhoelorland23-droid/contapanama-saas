const assert = require('node:assert/strict');
const test = require('node:test');
const { journalPlan } = require('../services/journalLedger');
const { journalReport, validateJournalScope } = require('../services/journalReport');

const uid = 'qa-owner';
const cid = '11111111-1111-4111-8111-111111111111';
const book = { id: 'qa-book', usuario_id: uid };
const clients = [{ id: cid, nombre: 'Cliente de prueba', ruc: 'QA-RUC' }];
const tx = { id: 'doc-1', cliente_id: cid, fecha: '2061-01-02', tipo: 'ingreso', descripcion: 'Original',
  monto: 100, itbms: 0, estado_pago: 'pendiente' };
const posted = journalPlan([tx]).map((entry, i) => ({ ...entry, numero: i + 1, usuario_id: uid }));
const corrected = [...posted, ...journalPlan([{ ...tx, monto: 200 }], posted).map((entry, i) =>
  ({ ...entry, numero: i + 2, usuario_id: uid }))];
const report = (args = {}) => journalReport({ book, entries: corrected, clients, scope: { anio: '2061' }, ...args });

test('published originals and exact reversals are all included, without mutating the book', () => {
  const before = structuredClone(corrected);
  const result = report();
  assert.equal(result.total_asientos, 3);
  assert.equal(result.total_debe, 400);
  assert.equal(result.total_haber, 400);
  assert.equal(result.secciones[0].asientos.find(e => e.rectifica_id).rectifica_numero, 1);
  assert.deepEqual(corrected, before);
  assert.equal(result.fingerprint, report({ generatedAt: '2099-01-01T00:00:00Z' }).fingerprint);
});

test('requires incorporated book, a single month/year and no partial-line filters', () => {
  assert.throws(() => report({ book: null }), { status: 409 });
  for (const scope of [{}, { anio: '2061', periodo: '2061-01' }, { periodo: '2061-13' },
    { anio: ['2061'] }, { anio: '2061', cliente_id: [] }, { anio: '2061', tipo: 'ingreso' },
    { periodo: '2061-01', desde: '2061-01-10' }]) {
    assert.throws(() => validateJournalScope(scope), { status: 422 });
  }
  assert.throws(() => report({ scope: { anio: '2061', cliente_id: '22222222-2222-4222-8222-222222222222' } }), { status: 404 });
});

test('monthly empty periods retain client identity but do not bring forward earlier entries', () => {
  const empty = report({ scope: { periodo: '2061-02', cliente_id: cid } });
  assert.equal(empty.total_asientos, 0);
  assert.equal(empty.total_debe, 0);
  assert.equal(empty.secciones[0].cliente_nombre, clients[0].nombre);
  assert.equal(empty.desde, '2061-02-01');
  assert.equal(empty.hasta, '2061-02-28');
});

test('tampering, foreign entries, duplicated numbers and missing originals stop the export', () => {
  for (const alter of [entries => { entries[0].descripcion = 'Alterado'; },
    entries => { entries[0].usuario_id = 'other'; },
    entries => { entries[1].numero = entries[0].numero; },
    entries => { entries[1].rectifica_id = 'missing'; }]) {
    const entries = structuredClone(corrected); alter(entries);
    assert.throws(() => report({ entries }), { status: 409 });
  }
});

test('each entity has its own section; filtering never includes another client', () => {
  const second = { ...tx, id: 'doc-2', cliente_id: '22222222-2222-4222-8222-222222222222', monto: 70 };
  const entries = [...corrected, ...journalPlan([second]).map(e => ({ ...e, numero: 4, usuario_id: uid }))];
  const allClients = [...clients, { id: second.cliente_id, nombre: 'Otro cliente' }];
  const result = report({ entries, clients: allClients });
  assert.equal(result.secciones.length, 2);
  assert.equal(result.total_debe, 470);
  const filtered = report({ entries, clients: allClients, scope: { anio: '2061', cliente_id: cid } });
  assert.equal(filtered.secciones.length, 1);
  assert.equal(filtered.total_debe, 400);
  assert(!JSON.stringify(filtered).includes('doc-2'));
});
