const { randomUUID } = require('node:crypto');
const { hash, verifyEntry } = require('./journalLedger');
const { fail } = require('./paymentLedger');

const key = clientId => clientId || '';
const folioHash = (folio, entry) => hash({ asiento_id: entry.id, usuario_id: entry.usuario_id,
  cliente_id: entry.cliente_id || null, libro_entidad_id: folio.libro_entidad_id,
  numero: folio.numero, contenido_hash: entry.contenido_hash });

function inspectRegistry(uid, entries, books, folios) {
  const byClient = new Map(), byBook = new Map(), byEntry = new Map(), numbered = new Set();
  for (const book of books) {
    if (book.usuario_id !== uid || byClient.has(key(book.cliente_id)) || byBook.has(book.id)) fail('Los libros por cliente no coinciden con su propietario.', 409);
    byClient.set(key(book.cliente_id), book); byBook.set(book.id, book);
  }
  const source = new Map();
  for (const entry of entries) {
    verifyEntry(entry);
    if (entry.usuario_id !== uid || source.has(entry.id)) fail('Asiento ajeno o duplicado en los libros por cliente.', 409);
    source.set(entry.id, entry);
  }
  for (const folio of folios) {
    const book = byBook.get(folio.libro_entidad_id), entry = source.get(folio.asiento_id);
    const serial = `${folio.libro_entidad_id}:${folio.numero}`;
    if (!book || !entry || folio.usuario_id !== uid || key(book.cliente_id) !== key(entry.cliente_id) ||
        !Number.isSafeInteger(folio.numero) || folio.numero < 1 || byEntry.has(entry.id) || numbered.has(serial) ||
        folio.folio_hash !== folioHash(folio, entry)) fail('La integridad o la numeracion del libro por cliente no coincide.', 409);
    numbered.add(serial); byEntry.set(entry.id, folio);
  }
  for (const book of books) {
    const numbers = folios.filter(folio => folio.libro_entidad_id === book.id).map(folio => folio.numero).sort((a, b) => a - b);
    if (numbers.some((number, index) => number !== index + 1)) fail('Faltan folios en el libro por cliente.', 409);
  }
  return { byClient, byBook, byEntry, missing: entries.filter(entry => !byEntry.has(entry.id)) };
}

function registryPreview(uid, entries, books, folios, clients = []) {
  const index = inspectRegistry(uid, entries, books, folios);
  if (index.missing.some(entry => entry.requiere_folio)) fail('Falta el folio de un asiento publicado. Revise la integridad del respaldo.', 409);
  const clientMap = new Map(clients.map(client => [client.id, client]));
  const groups = new Map();
  for (const entry of entries) {
    const clientKey = key(entry.cliente_id);
    if (!groups.has(clientKey)) groups.set(clientKey, { cliente_id: entry.cliente_id || null,
      cliente_nombre: clientMap.get(entry.cliente_id)?.nombre || entry.cliente_nombre || 'Sin cliente asignado',
      libro_entidad_id: index.byClient.get(clientKey)?.id || null, provisional: !entry.cliente_id,
      asientos: 0, pendientes: 0, ultimo_folio: 0 });
    const group = groups.get(clientKey);
    group.asientos++;
    const folio = index.byEntry.get(entry.id);
    if (folio) group.ultimo_folio = Math.max(group.ultimo_folio, folio.numero);
    else group.pendientes++;
  }
  return { estado: index.missing.length ? 'pendiente_revision' : 'asignado', pendientes: index.missing.length,
    total_libros: books.length, data: [...groups.values()].sort((a, b) => a.cliente_nombre.localeCompare(b.cliente_nombre)),
    fingerprint: hash({ entries: entries.map(e => [e.id, e.numero, e.contenido_hash]).sort((a, b) => a[0].localeCompare(b[0])),
      folios: folios.map(f => [f.asiento_id, f.folio_hash]).sort((a, b) => a[0].localeCompare(b[0])) }) };
}

function planRegistry(uid, entries, books, folios, incorporationId) {
  const index = inspectRegistry(uid, entries, books, folios);
  const pendingBooks = [], pendingFolios = [];
  const counters = new Map(books.map(book => [book.id, folios.filter(folio => folio.libro_entidad_id === book.id).length]));
  const createdAt = new Date().toISOString();
  for (const entry of [...index.missing].sort((a, b) => a.numero - b.numero)) {
    let book = index.byClient.get(key(entry.cliente_id));
    if (!book) {
      book = { id: randomUUID(), usuario_id: uid, cliente_id: entry.cliente_id || null,
        incorporacion_id: incorporationId, created_at: createdAt };
      pendingBooks.push(book); index.byClient.set(key(entry.cliente_id), book); counters.set(book.id, 0);
    }
    const folio = { asiento_id: entry.id, usuario_id: uid, libro_entidad_id: book.id,
      numero: counters.get(book.id) + 1, created_at: createdAt };
    if (!Number.isSafeInteger(folio.numero)) fail('El libro supera la numeracion admitida.', 409);
    folio.folio_hash = folioHash(folio, entry);
    counters.set(book.id, folio.numero); pendingFolios.push(folio);
  }
  return { books: pendingBooks, folios: pendingFolios };
}

function attachFolios(uid, entries, books, folios) {
  const { byEntry, missing } = inspectRegistry(uid, entries, books, folios);
  if (missing.some(entry => entry.requiere_folio)) fail('Falta el folio de un asiento publicado.', 409);
  return entries.map(entry => {
    const folio = byEntry.get(entry.id), original = byEntry.get(entry.rectifica_id);
    return { ...entry, libro_entidad_id: folio?.libro_entidad_id || null, numero_libro: folio?.numero || null,
      rectifica_numero_libro: original?.numero || null, libro_provisional: !entry.cliente_id };
  });
}

module.exports = { inspectRegistry, registryPreview, planRegistry, attachFolios, folioHash };
