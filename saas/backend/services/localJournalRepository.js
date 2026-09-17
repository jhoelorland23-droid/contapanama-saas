const { randomUUID } = require('node:crypto');
const { buildJournal } = require('./accountingEngine');
const { localPayments } = require('./localPaymentRepository');
const { isRegisteredTransaction } = require('./transactionStatus');
const { journalPlan, incorporationPreview, publicJournal, verifyEntry, hash } = require('./journalLedger');
const { fail } = require('./paymentLedger');
const { registryPreview, planRegistry, attachFolios } = require('./entityBooks');
const { planBankDimensions, verifyBankDimensions } = require('./bankPosting');

const owned = (rows, uid) => rows.filter(row => row.usuario_id === uid);
const sources = (state, uid) => localPayments(owned(state.transacciones, uid), state, uid);
const status = (state, uid) => state.libros_contables.find(book => book.usuario_id === uid) || null;

function createBook(state, uid, method, fingerprint) {
  const book = { id: randomUUID(), usuario_id: uid, metodo_incorporacion: method, fingerprint, created_at: new Date().toISOString() };
  state.libros_contables.push(book);
  state.audit_events.push({ id: randomUUID(), usuario_id: uid, accion: 'libro_incorporado',
    objeto_tipo: 'libro_contable', objeto_id: book.id, despues_json: book, created_at: book.created_at });
  return book;
}

function append(state, uid, entries) {
  const existing = entityEntries(state, uid);
  if (existing.some(entry => !entry.numero_libro)) fail('Revise y asigne los libros por cliente antes de publicar mas asientos.', 409);
  let number = Math.max(0, ...owned(state.asientos_contables, uid).map(e => e.numero));
  const createdAt = new Date().toISOString();
  const posted=entries.map(entry => ({ ...entry, usuario_id: uid, numero: ++number, created_at: createdAt,
    requiere_folio: true, requiere_dimension_bancaria: true }));
  const dimensions=planBankDimensions(uid,posted,existing,owned(state.dimensiones_bancarias||[],uid),sources(state,uid),owned(state.cuentas_bancarias||[],uid));
  state.asientos_contables.push(...posted);
  state.dimensiones_bancarias ||= [];
  state.dimensiones_bancarias.push(...dimensions);
  if (entries.length) appendEntityFolios(state, uid);
}

function entityEntries(state, uid) {
  const { entries, books, folios } = entityState(state, uid);
  verifyBankDimensions(uid,entries,owned(state.dimensiones_bancarias||[],uid),owned(state.cuentas_bancarias||[],uid));
  return attachFolios(uid, entries, books, folios);
}

function entityState(state, uid) {
  const entries = owned(state.asientos_contables, uid), books = owned(state.libros_entidad, uid), folios = owned(state.folios_libro, uid);
  const parent = status(state, uid);
  if (books.some(book => !parent || book.incorporacion_id !== parent.id)) fail('El libro por cliente no corresponde a su incorporacion.', 409);
  const assigned = new Set(folios.map(folio => folio.asiento_id));
  if (entries.some(entry => !assigned.has(entry.id)) && owned(state.audit_events, uid).some(event => event.accion === 'folios_cliente_incorporados')) {
    fail('Faltan folios de un historial ya asignado. Revise la integridad del respaldo.', 409);
  }
  return { entries, books, folios };
}

function entityPreview(state, uid) {
  if (!status(state, uid)) return { estado: 'pendiente_incorporacion', data: [], pendientes: 0, total_libros: 0 };
  const { entries, books, folios } = entityState(state, uid);
  return registryPreview(uid, entries, books, folios, owned(state.clientes, uid));
}

function appendEntityFolios(state, uid) {
  const plan = planRegistry(uid, owned(state.asientos_contables, uid), owned(state.libros_entidad, uid),
    owned(state.folios_libro, uid), status(state, uid).id);
  state.libros_entidad.push(...plan.books);
  state.folios_libro.push(...plan.folios);
  for (const book of plan.books) state.audit_events.push({ id: randomUUID(), usuario_id: uid, cliente_id: book.cliente_id,
    accion: 'libro_entidad_creado', objeto_tipo: 'libro_entidad', objeto_id: book.id, despues_json: book, created_at: book.created_at });
}

function incorporateEntities(state, uid, fingerprint) {
  const preview = entityPreview(state, uid);
  if (!preview.pendientes) {
    if (owned(state.audit_events, uid).some(event => event.accion === 'folios_cliente_incorporados' && event.despues_json?.fingerprint === fingerprint)) return preview;
    fail('No hay una asignacion pendiente que corresponda a esta revision.', 409);
  }
  if (preview.fingerprint !== fingerprint) fail('Los libros cambiaron. Revise los folios antes de confirmar.', 409);
  appendEntityFolios(state, uid);
  state.audit_events.push({ id: randomUUID(), usuario_id: uid, accion: 'folios_cliente_incorporados', objeto_tipo: 'libro_contable',
    objeto_id: status(state, uid).id, despues_json: { fingerprint, asientos: preview.pendientes }, created_at: new Date().toISOString() });
  return entityPreview(state, uid);
}

function preview(state, uid) {
  const book = status(state, uid);
  const entries = owned(state.asientos_contables, uid);
  verifyBankDimensions(uid,entries,owned(state.dimensiones_bancarias||[],uid),owned(state.cuentas_bancarias||[],uid));
  if (book) {
    entries.forEach(verifyEntry);
    return { estado: 'incorporado', data: book, total_asientos: entries.length };
  }
  return { estado: 'pendiente_revision', data: null, revision: incorporationPreview(sources(state, uid), entries) };
}

function incorporate(state, uid, fingerprint) {
  const current = preview(state, uid);
  if (current.estado === 'incorporado') {
    if (current.data.fingerprint !== fingerprint) fail('El libro ya fue incorporado con otra revision.', 409);
    return current;
  }
  if (!current.revision.puede_incorporar) fail(current.revision.errores.join(' ') || 'El libro no esta balanceado.', 409);
  if (current.revision.fingerprint !== fingerprint) fail('Los registros cambiaron. Revise los saldos nuevamente antes de confirmar.', 409);
  createBook(state, uid, 'revision_cpa', fingerprint);
  append(state, uid, journalPlan(sources(state, uid), [], { origin: 'incorporacion', reason: 'Historial revisado e incorporado por CPA' }));
  return preview(state, uid);
}

function read(state, uid, scope = {}, history = false) {
  const transactions = sources(state, uid);
  if (!status(state, uid)) return buildJournal(transactions, history ? { cliente_id: scope.cliente_id } : scope).map(e => ({ ...e, persistido: false }));
  return publicJournal(entityEntries(state, uid), transactions, scope, history);
}

function syncWrite(state, before, closureFor, correction) {
  for (const collection of ['libros_contables', 'asientos_contables', 'libros_entidad', 'folios_libro', 'dimensiones_bancarias']) {
    const rowKey = row => row.id || row.asiento_id;
    const current = new Map((state[collection]||[]).map(row => [rowKey(row), row]));
    for (const row of before[collection]||[]) {
      if (JSON.stringify(current.get(rowKey(row))) !== JSON.stringify(row)) fail('El libro publicado no permite modificar ni eliminar registros.', 409);
    }
  }
  const ids = new Set([...before.transacciones, ...state.transacciones].map(t => t.usuario_id));
  for (const uid of ids) {
    const previous = sources(before, uid);
    const transactions = sources(state, uid);
    if (JSON.stringify(previous) === JSON.stringify(transactions)) continue;
    const existing = owned(state.asientos_contables, uid);
    const retainedIds = new Set(transactions.map(t => t.id));
    if (existing.some(entry => entry.transaccion_id && !retainedIds.has(entry.transaccion_id))) {
      fail('El documento tiene asientos publicados y no se puede eliminar. Conserve su historial contable.', 409);
    }
    if (!status(state, uid)) {
      if (previous.some(isRegisteredTransaction) || existing.length) continue;
      createBook(state, uid, 'libro_nuevo', hash([]));
    }
    const pending = journalPlan(transactions, existing, { reasons: correction ? { [correction.documentId]: correction.reason } : {} });
    if (pending.some(entry => entry.rectifica_id && (!correction?.reason || entry.transaccion_id !== correction.documentId))) {
      fail('Hay cambios del libro sin una correccion revisada. Revise el documento y su motivo.', 409);
    }
    for (const entry of pending) {
      if (closureFor(uid, entry.periodo, entry.cliente_id)) fail(`El periodo ${entry.periodo} esta cerrado.`, 409);
      if (entry.cliente_id && !state.clientes.some(c => c.id === entry.cliente_id && c.usuario_id === uid)) fail('Cliente no encontrado.', 404);
    }
    append(state, uid, pending);
  }
  const oldEntries=new Set(before.asientos_contables.map(e=>e.id));
  const oldDimensions=new Set((before.dimensiones_bancarias||[]).map(d=>d.id));
  if ((state.dimensiones_bancarias||[]).some(d=>!oldDimensions.has(d.id)&&oldEntries.has(d.asiento_id))) {
    fail('La cuenta solo puede vincularse al publicar su linea bancaria.',409);
  }
  const owners=new Set([...state.asientos_contables,...(state.dimensiones_bancarias||[])].map(row=>row.usuario_id));
  for(const uid of owners)verifyBankDimensions(uid,owned(state.asientos_contables,uid),
    owned(state.dimensiones_bancarias||[],uid),owned(state.cuentas_bancarias||[],uid));
}

module.exports = { status, sources, preview, incorporate, read, syncWrite, entityEntries, entityPreview, incorporateEntities };
