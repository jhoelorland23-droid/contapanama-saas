const assert = require('node:assert/strict');
const { test } = require('node:test');
const { randomUUID } = require('node:crypto');
const { journalPlan } = require('../services/journalLedger');
const { planRegistry, registryPreview, attachFolios } = require('../services/entityBooks');
const { journalReport } = require('../services/journalReport');

const uid = randomUUID(), a = randomUUID(), b = randomUUID(), parent = randomUUID();
const clients = [{ id: a, nombre: 'Empresa A' }, { id: b, nombre: 'Empresa B' }];
const tx = (cliente_id, fecha = '2072-01-02') => ({ id: randomUUID(), cliente_id, cliente_nombre: cliente_id === a ? 'Empresa A' : 'Empresa B',
  fecha, tipo: 'ingreso', monto: 100, itbms: 0, estado_pago: 'pendiente', descripcion: 'QA empresa' });
const entries = journalPlan([tx(a), tx(b, '2072-01-03'), tx(a, '2072-02-01')]).map((entry, i) => ({ ...entry, usuario_id: uid, numero: (i + 1) * 10 }));

test('each entity gets an independent book and continuous folios without renumbering originals', () => {
  const before = JSON.stringify(entries);
  const plan = planRegistry(uid, entries, [], [], parent);
  assert.equal(plan.books.length, 2);
  const numbered = attachFolios(uid, entries, plan.books, plan.folios);
  assert.deepEqual(numbered.map(entry => entry.numero_libro), [1, 1, 2]);
  assert.equal(numbered[0].libro_entidad_id, numbered[2].libro_entidad_id);
  assert.notEqual(numbered[0].libro_entidad_id, numbered[1].libro_entidad_id);
  assert.deepEqual(numbered.map(entry => entry.numero), [10, 20, 30]);
  assert.equal(JSON.stringify(entries), before);
  assert.deepEqual(planRegistry(uid, entries, plan.books, plan.folios, parent), { books: [], folios: [] });
});

test('year changes and backdated postings retain allocated folios', () => {
  const initial = planRegistry(uid, entries, [], [], parent);
  const next = journalPlan([tx(a, '2073-01-01')]).map(entry => ({ ...entry, usuario_id: uid, numero: 31 }));
  const additional = planRegistry(uid, [...entries, ...next], initial.books, initial.folios, parent);
  assert.equal(additional.books.length, 0);
  assert.equal(additional.folios[0].numero, 3);
  const late = journalPlan([tx(b, '2071-01-01')]).map(entry => ({ ...entry, usuario_id: uid, numero: 32 }));
  const final = planRegistry(uid, [...entries, ...next, ...late], initial.books, [...initial.folios, ...additional.folios], parent);
  assert.equal(final.folios[0].numero, 2);
});

test('legacy entries remain pending and are not mutated by preview or reads', () => {
  const preview = registryPreview(uid, entries, [], [], clients);
  assert.equal(preview.estado, 'pendiente_revision');
  assert.equal(preview.pendientes, 3);
  assert.equal(preview.data.length, 2);
  assert(attachFolios(uid, entries, [], []).every(entry => entry.numero_libro === null));
  assert.throws(() => journalReport({ book: { id: parent, usuario_id: uid }, entries, clients,
    scope: { anio: '2072' }, requireEntityBooks: true }), error => error.status === 409);
});

test('cross-client, cross-owner, duplicate, missing and altered folios are rejected', () => {
  const plan = planRegistry(uid, entries, [], [], parent);
  const rejects = (books, folios) => assert.throws(() => attachFolios(uid, entries, books, folios), error => error.status === 409);
  rejects(plan.books.map(book => ({ ...book, usuario_id: randomUUID() })), plan.folios);
  rejects([plan.books[0], plan.books[0]], plan.folios);
  rejects(plan.books, [...plan.folios, plan.folios[0]]);
  rejects(plan.books, plan.folios.map((folio, i) => i ? folio : { ...folio, numero: 5 }));
  rejects(plan.books, plan.folios.map((folio, i) => i ? folio : { ...folio, libro_entidad_id: plan.folios[1].libro_entidad_id }));
  rejects(plan.books, plan.folios.filter(folio => folio.asiento_id !== entries[0].id));
  const required = entries.map(entry => ({ ...entry, requiere_folio: true }));
  assert.throws(() => attachFolios(uid, required, [], []), error => error.status === 409);
  assert.throws(() => registryPreview(uid, required, [], []), error => error.status === 409);
});

test('unassigned entries use a separate explicitly provisional series', () => {
  const all = [...entries, ...journalPlan([tx(null)]).map(entry => ({ ...entry, usuario_id: uid, numero: 31 }))];
  const plan = planRegistry(uid, all, [], [], parent);
  const result = registryPreview(uid, all, plan.books, plan.folios, clients);
  assert.equal(result.total_libros, 3);
  assert.equal(result.data.find(book => book.provisional).ultimo_folio, 1);
  const numbered = attachFolios(uid, all, plan.books, plan.folios);
  assert.equal(numbered.at(-1).libro_provisional, true);
});

test('client report retains its own book identifier and excludes other entity folios', () => {
  const plan = planRegistry(uid, entries, [], [], parent);
  const numbered = attachFolios(uid, entries, plan.books, plan.folios);
  const report = journalReport({ book: { id: parent, usuario_id: uid }, entries: numbered, clients,
    entityBooks: plan.books, scope: { anio: '2072', cliente_id: a }, requireEntityBooks: true });
  assert.equal(report.libro_id, numbered[0].libro_entidad_id);
  assert.equal(report.incorporacion_id, parent);
  assert.deepEqual(report.secciones[0].asientos.map(entry => entry.numero_libro), [1, 2]);
  assert.equal(report.total_asientos, 2);
  assert.equal(report.total_debe, 200);
});

test('local reads reject a foreign incorporation and missing folios after reviewed legacy assignment', () => {
  const local = require('../services/localJournalRepository');
  const plan = planRegistry(uid, entries, [], [], parent);
  const state = { libros_contables: [{ id: parent, usuario_id: uid }], asientos_contables: entries,
    libros_entidad: plan.books, folios_libro: plan.folios, audit_events: [], clientes: clients };
  assert.equal(local.entityEntries(state, uid).length, 3);
  const badParent = structuredClone(state);
  badParent.libros_entidad[0].incorporacion_id = randomUUID();
  assert.throws(() => local.entityPreview(badParent, uid), error => error.status === 409);
  assert.throws(() => local.entityEntries(badParent, uid), error => error.status === 409);
  const missing = structuredClone(state);
  missing.audit_events.push({ usuario_id: uid, accion: 'folios_cliente_incorporados' });
  missing.folios_libro = [];
  assert.throws(() => local.entityPreview(missing, uid), error => error.status === 409);
  assert.throws(() => local.entityEntries(missing, uid), error => error.status === 409);
});
