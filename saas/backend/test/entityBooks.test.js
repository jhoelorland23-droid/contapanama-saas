const assert = require('node:assert/strict');
const { test } = require('node:test');
const { randomUUID } = require('node:crypto');
const { journalPlan } = require('../services/journalLedger');
const { planRegistry, allocateFolios, registryPreview, attachFolios, folioHash } = require('../services/entityBooks');
const { appendFolios } = require('../services/journalIncrementalSql');
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

function freeze(value) {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}

// Only models the adapter's SQL boundary; rejects unexpected queries and non-append writes.
function folioDb(books = [], folios = []) {
  const state = { books: [...books], folios: [...folios], audits: [], reads: [] };
  return { state, async query(sql, values) {
    if (sql.startsWith('SELECT * FROM libros_entidad')) {
      state.reads.push(values);
      return { rows: state.books.filter(book => book.usuario_id === values[0] && book.cliente_id === values[1]) };
    }
    if (sql.startsWith('SELECT numero FROM folios_libro')) {
      const numbers = state.folios.filter(f => f.libro_entidad_id === values[0]).map(f => f.numero);
      return { rows: numbers.length ? [{ numero: String(Math.max(...numbers)) }] : [] };
    }
    if (sql.startsWith('INSERT INTO libros_entidad')) {
      const [id, usuario_id, cliente_id, incorporacion_id, created_at] = values;
      assert(!state.books.some(book => book.id === id || (book.usuario_id === usuario_id && book.cliente_id === cliente_id)));
      state.books.push({ id, usuario_id, cliente_id, incorporacion_id, created_at });
    } else if (sql.startsWith('INSERT INTO audit_events')) {
      state.audits.push(values);
    } else if (sql.startsWith('INSERT INTO folios_libro')) {
      const [asiento_id, usuario_id, libro_entidad_id, numero, folio_hash] = values;
      const book = state.books.find(book => book.id === libro_entidad_id);
      assert.equal(book?.usuario_id, usuario_id);
      assert(!state.folios.some(f => f.asiento_id === asiento_id));
      const last = Math.max(0, ...state.folios.filter(f => f.libro_entidad_id === libro_entidad_id).map(f => f.numero));
      assert.equal(numero, last + 1);
      state.folios.push({ asiento_id, usuario_id, libro_entidad_id, numero, folio_hash });
    } else {
      assert.fail(`Unexpected SQL: ${sql}`);
    }
    return { rows: [], rowCount: 1 };
  } };
}

test('full and incremental folios agree across clients, periods, versions, reversals and new books', async () => {
  let documents = [tx(a, '2071-12-31'), tx(b, '2072-02-01'), tx(a, '2072-03-01')];
  let history = journalPlan(documents).map((e, i) => ({ ...e, usuario_id: uid, numero: i + 1 }));
  const initial = freeze(planRegistry(uid, history, [], [], parent));
  const original = JSON.stringify(initial);
  const db = folioDb(initial.books, initial.folios);
  let books = [...initial.books], folios = [...initial.folios];
  const c = randomUUID();

  for (let round = 0; round < 4; round++) {
    documents = documents.map((doc, i) => i === 0 ? { ...doc, monto: 120 + round * 10,
      fecha: round % 2 ? '2070-01-01' : '2073-01-01' } : doc);
    if (round === 0) documents.push(tx(c, '2072-01-01'), tx(null, '2071-01-01'), tx(c, '2074-01-01'));
    if (round === 1) documents = documents.filter(doc => doc.cliente_id !== b);
    if (round === 2) documents.push(tx(b, '2075-01-01'), tx(null, '2070-01-01'));
    const posted = freeze(journalPlan(documents, history).map((e, i) => ({ ...e, usuario_id: uid,
      numero: history.length + i + 1 })).reverse());
    assert(posted.some(e => e.rectifica_id));
    assert(posted.some(e => e.revision === round + 2));
    const snapshot = JSON.stringify({ history, posted, books, folios });
    const full = planRegistry(uid, [...history, ...posted].reverse(), freeze(books), freeze(folios), parent);
    const beforeBooks = db.state.books.length, beforeFolios = db.state.folios.length;
    db.state.reads = [];
    await appendFolios(db, uid, posted, parent);
    assert.equal(JSON.stringify({ history, posted, books, folios }), snapshot);
    assert.equal(db.state.reads.length, new Set(posted.map(e => e.cliente_id)).size);
    const newBooks = db.state.books.slice(beforeBooks), newFolios = db.state.folios.slice(beforeFolios);
    assert.deepEqual(newBooks.map(book => book.cliente_id), full.books.map(book => book.cliente_id));
    const sqlBooks = new Map(db.state.books.map(book => [book.cliente_id, book]));
    const fullBooks = new Map([...books, ...full.books].map(book => [book.id, book]));
    // New UUIDs differ between independent runs. Rebind only those IDs and recompute their hashes.
    const expected = full.folios.map(f => {
      const sqlBook = sqlBooks.get(fullBooks.get(f.libro_entidad_id).cliente_id);
      const remapped = { asiento_id: f.asiento_id, usuario_id: f.usuario_id,
        libro_entidad_id: sqlBook.id, numero: f.numero };
      return { ...remapped, folio_hash: folioHash(remapped, posted.find(e => e.id === f.asiento_id)) };
    });
    assert.deepEqual(newFolios, expected);
    for (const f of newFolios) {
      const entry = posted.find(e => e.id === f.asiento_id);
      assert.equal(sqlBooks.get(entry.cliente_id).id, f.libro_entidad_id);
      assert.equal(f.folio_hash, folioHash(f, entry));
    }
    history = [...history, ...posted].sort((x, y) => x.numero - y.numero);
    books = [...books, ...full.books]; folios = [...folios, ...full.folios];
    const project = rows => rows.map(e => [e.id, e.numero, e.numero_libro, e.rectifica_numero_libro,
      e.contenido_hash, e.lineas, e.revision, e.libro_provisional]);
    assert.deepEqual(project(attachFolios(uid, history, books, folios)),
      project(attachFolios(uid, history, db.state.books, db.state.folios)));
    assert.deepEqual(planRegistry(uid, history, books, folios, parent), { books: [], folios: [] });
  }
  assert.equal(JSON.stringify(initial), original);
  assert.deepEqual(db.state.folios.slice(0, initial.folios.length), initial.folios);
  assert.equal(db.state.audits.length, 2);
  for (const [owner, client, id, book] of db.state.audits) {
    assert.equal(owner, uid); assert.equal(client, book.cliente_id); assert.equal(id, book.id);
    assert.equal(book.incorporacion_id, parent);
  }
  const unchanged = JSON.stringify(db.state);
  await appendFolios(db, uid, [], parent);
  assert.equal(JSON.stringify(db.state), unchanged);
});

test('shared allocator and SQL boundary preserve safe-integer limits without mutating counters', async () => {
  const book = freeze({ id: randomUUID(), usuario_id: uid, cliente_id: a, incorporacion_id: parent });
  const posted = [entries[0]];
  const counters = new Map([[book.id, Number.MAX_SAFE_INTEGER - 1]]);
  const plan = allocateFolios(uid, posted, [book], counters, parent);
  assert.equal(plan.folios[0].numero, Number.MAX_SAFE_INTEGER);
  assert.equal(counters.get(book.id), Number.MAX_SAFE_INTEGER - 1);
  const db = folioDb([book], [{ libro_entidad_id: book.id, numero: Number.MAX_SAFE_INTEGER - 1 }]);
  await appendFolios(db, uid, posted, parent);
  assert.equal(db.state.folios.at(-1).numero, Number.MAX_SAFE_INTEGER);
  assert.equal(db.state.folios.at(-1).folio_hash, plan.folios[0].folio_hash);
  for (const last of [Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER + 1, -1, 1.5, NaN]) {
    assert.throws(() => allocateFolios(uid, posted, [book], new Map([[book.id, last]]), parent), e => e.status === 409);
  }
  const overflow = folioDb([book], [{ libro_entidad_id: book.id, numero: Number.MAX_SAFE_INTEGER }]);
  await assert.rejects(appendFolios(overflow, uid, posted, parent), e => e.status === 409);
  assert.equal(overflow.state.folios.length, 1);
  assert.equal(overflow.state.audits.length, 0);
});

test('both paths reject altered, foreign and duplicate entries before allocating folios', async () => {
  for (const posted of [
    [{ ...entries[0], usuario_id: randomUUID() }],
    [{ ...entries[0], contenido_hash: 'altered' }],
    [{ ...entries[0], cliente_id: b }],
    [entries[0], entries[0]],
  ]) {
    assert.throws(() => planRegistry(uid, posted, [], [], parent), e => e.status === 409);
    const db = folioDb();
    await assert.rejects(appendFolios(db, uid, posted, parent), e => e.status === 409);
    assert.deepEqual([db.state.books, db.state.folios, db.state.audits], [[], [], []]);
  }
  const foreign = { id: randomUUID(), cliente_id: a, usuario_id: randomUUID() };
  assert.throws(() => allocateFolios(uid, [entries[0]], [foreign], new Map([[foreign.id, 0]]), parent), e => e.status === 409);
});
