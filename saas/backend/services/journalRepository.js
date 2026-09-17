const { query } = require('../db');
const { CHART_OF_ACCOUNTS, buildJournal } = require('./accountingEngine');
const { isRegisteredTransaction } = require('./transactionStatus');
const { verifyEntry, journalPlan, incorporationPreview, publicJournal, hash } = require('./journalLedger');
const { fail } = require('./paymentLedger');
const { registryPreview, planRegistry, attachFolios } = require('./entityBooks');
const { planBankDimensions, verifyBankDimensions } = require('./bankPosting');
const { ledgerConsistency } = require('./ledgerConsistency');

async function sourceTransactions(db, uid) {
  const { rows } = await db.query('SELECT * FROM transacciones WHERE usuario_id=$1 ORDER BY fecha, created_at, id', [uid]);
  const payments = await db.query('SELECT * FROM pagos_transacciones WHERE usuario_id=$1 ORDER BY fecha, created_at, id', [uid]);
  const grouped = new Map();
  for (const payment of payments.rows) {
    if (!grouped.has(payment.transaccion_id)) grouped.set(payment.transaccion_id, []);
    grouped.get(payment.transaccion_id).push(payment);
  }
  return rows.map(tx => grouped.has(tx.id) ? { ...tx, pagos: grouped.get(tx.id) } : tx);
}

async function journalSnapshot(db, uid) {
  const { rows: [snapshot] } = await db.query(`WITH entry_rows AS (SELECT a.*,
    COALESCE(jsonb_agg(jsonb_build_object(
      'cuenta_codigo',l.cuenta_codigo,'cuenta_nombre',l.cuenta_nombre,'tipo_cuenta',l.tipo_cuenta,
      'descripcion',l.descripcion,'debe',l.debe,'haber',l.haber)
      ORDER BY l.orden, l.id) FILTER (WHERE l.id IS NOT NULL), '[]'::jsonb) AS lineas
    FROM asientos_contables a LEFT JOIN asiento_lineas l ON l.asiento_id=a.id
    WHERE a.usuario_id=$1 GROUP BY a.id)
    SELECT COALESCE((SELECT jsonb_agg(to_jsonb(e) ORDER BY e.numero,e.id) FROM entry_rows e),'[]'::jsonb) AS entries,
      COALESCE((SELECT jsonb_agg(to_jsonb(b) ORDER BY b.id) FROM libros_entidad b WHERE b.usuario_id=$1),'[]'::jsonb) AS books,
      COALESCE((SELECT jsonb_agg(to_jsonb(f) ORDER BY f.libro_entidad_id,f.numero) FROM folios_libro f WHERE f.usuario_id=$1),'[]'::jsonb) AS folios,
      COALESCE((SELECT jsonb_agg(to_jsonb(d) ORDER BY d.asiento_id,d.orden) FROM dimensiones_bancarias d WHERE d.usuario_id=$1),'[]'::jsonb) AS bank_dimensions,
      COALESCE((SELECT jsonb_agg(to_jsonb(a)) FROM cuentas_bancarias a WHERE a.usuario_id=$1),'[]'::jsonb) AS bank_accounts`, [uid]);
  return { ...snapshot, entries: snapshot.entries.map(entry => ({ ...entry, numero: Number(entry.numero), revision: Number(entry.revision) })),
    folios: snapshot.folios.map(folio => ({ ...folio, numero: Number(folio.numero) })) };
}

const rawStoredEntries = async (db, uid) => (await journalSnapshot(db, uid)).entries;

async function entityState(db, uid) {
  const books = (await db.query('SELECT * FROM libros_entidad WHERE usuario_id=$1 ORDER BY id', [uid])).rows;
  const folios = (await db.query('SELECT * FROM folios_libro WHERE usuario_id=$1 ORDER BY libro_entidad_id,numero', [uid])).rows
    .map(folio => ({ ...folio, numero: Number(folio.numero) }));
  return { books, folios };
}

async function storedEntries(db, uid) {
  const { entries, books, folios, bank_dimensions, bank_accounts } = await journalSnapshot(db, uid);
  verifyBankDimensions(uid, entries, bank_dimensions, bank_accounts);
  return attachFolios(uid, entries, books, folios);
}

async function previewEntityBooks(uid, db = { query }) {
  const book = await bookStatus(db, uid);
  if (!book) return { estado: 'pendiente_incorporacion', data: [], pendientes: 0, total_libros: 0 };
  const { entries, books, folios } = await journalSnapshot(db, uid);
  const clients = (await db.query('SELECT id,nombre FROM clientes WHERE usuario_id=$1', [uid])).rows;
  return registryPreview(uid, entries, books, folios, clients);
}

async function appendEntityFolios(db, uid, entries) {
  const { books, folios } = await entityState(db, uid);
  const plan = planRegistry(uid, entries, books, folios, (await bookStatus(db, uid)).id);
  for (const book of plan.books) {
    await db.query('INSERT INTO libros_entidad(id,usuario_id,cliente_id,incorporacion_id,created_at) VALUES($1,$2,$3,$4,$5)',
      [book.id, uid, book.cliente_id, book.incorporacion_id, book.created_at]);
    await db.query(`INSERT INTO audit_events(usuario_id,cliente_id,accion,objeto_tipo,objeto_id,despues_json)
      VALUES($1,$2,'libro_entidad_creado','libro_entidad',$3,$4)`, [uid, book.cliente_id, book.id, book]);
  }
  for (const folio of plan.folios) {
    await db.query('INSERT INTO folios_libro(asiento_id,usuario_id,libro_entidad_id,numero,folio_hash,created_at) VALUES($1,$2,$3,$4,$5,$6)',
      [folio.asiento_id, uid, folio.libro_entidad_id, folio.numero, folio.folio_hash, folio.created_at]);
  }
}

async function incorporateEntityBooks(db, uid, fingerprint) {
  const preview = await previewEntityBooks(uid, db);
  if (!preview.pendientes) {
    const previous = await db.query(`SELECT id FROM audit_events WHERE usuario_id=$1 AND accion='folios_cliente_incorporados'
      AND despues_json->>'fingerprint'=$2 LIMIT 1`, [uid, fingerprint]);
    if (previous.rows.length) return preview;
    fail('No hay una asignacion pendiente que corresponda a esta revision.', 409);
  }
  if (preview.fingerprint !== fingerprint) fail('Los libros cambiaron. Revise los folios antes de confirmar.', 409);
  await appendEntityFolios(db, uid, await rawStoredEntries(db, uid));
  await db.query(`INSERT INTO audit_events(usuario_id,accion,objeto_tipo,objeto_id,despues_json)
    VALUES($1,'folios_cliente_incorporados','libro_contable',$2,$3)`,
  [uid, (await bookStatus(db, uid)).id, { fingerprint, asientos: preview.pendientes }]);
  return previewEntityBooks(uid, db);
}

async function bookStatus(db, uid) {
  return (await db.query('SELECT * FROM libros_contables WHERE usuario_id=$1', [uid])).rows[0] || null;
}

async function createBook(db, uid, method, fingerprint) {
  const { rows: [book] } = await db.query(`INSERT INTO libros_contables
    (usuario_id,metodo_incorporacion,fingerprint) VALUES ($1,$2,$3) RETURNING *`, [uid, method, fingerprint]);
  for (const account of CHART_OF_ACCOUNTS) {
    await db.query(`INSERT INTO plan_cuentas(usuario_id,codigo,nombre,tipo,naturaleza) VALUES($1,$2,$3,$4,$5)
      ON CONFLICT(usuario_id,codigo) DO NOTHING`, [uid, account.codigo, account.nombre, account.tipo, account.naturaleza]);
  }
  await db.query(`INSERT INTO audit_events(usuario_id,accion,objeto_tipo,objeto_id,despues_json)
    VALUES($1,'libro_incorporado','libro_contable',$2,$3)`, [uid, book.id, book]);
  return book;
}

// Called under the owner's accounting lock, before the first financial write.
async function prepareJournalWrite(db, uid) {
  if (await bookStatus(db, uid)) return;
  const transactions = await sourceTransactions(db, uid);
  const entries = await storedEntries(db, uid);
  if (!transactions.some(isRegisteredTransaction) && !entries.length) {
    await createBook(db, uid, 'libro_nuevo', hash([]));
  }
}

async function appendEntries(db, uid, entries, existing, assertOpen) {
  if (existing.some(entry => !entry.numero_libro)) fail('Revise y asigne los libros por cliente antes de publicar mas asientos.', 409);
  let number = Math.max(0, ...existing.map(e => e.numero));
  const posted = [];
  for (const entry of entries) {
    if (assertOpen) await assertOpen(db, uid, entry.periodo, entry.cliente_id);
    await db.query(`INSERT INTO asientos_contables
      (id,usuario_id,transaccion_id,cliente_id,cliente_nombre,pago_id,fecha,periodo,descripcion,
       origen,origen_clave,revision,rectifica_id,numero,contenido_hash,tipo_asiento,motivo)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`, [
      entry.id, uid, entry.transaccion_id, entry.cliente_id, entry.cliente_nombre, entry.pago_id,
      entry.fecha, entry.periodo, entry.descripcion, entry.origen, entry.origen_clave, entry.revision,
      entry.rectifica_id, ++number, entry.contenido_hash, entry.tipo_asiento, entry.motivo,
    ]);
    for (const [index, line] of entry.lineas.entries()) {
      await db.query(`INSERT INTO asiento_lineas
        (asiento_id,usuario_id,orden,cuenta_codigo,cuenta_nombre,tipo_cuenta,descripcion,debe,haber)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`, [entry.id, uid, index + 1, line.cuenta_codigo,
        line.cuenta_nombre, line.tipo_cuenta, line.descripcion, line.debe, line.haber]);
    }
    posted.push({ ...entry, usuario_id: uid, numero: number, requiere_folio: true, requiere_dimension_bancaria: true });
  }
  if (posted.length) await appendEntityFolios(db, uid, [...existing, ...posted]);
  if (posted.length) {
    const previous=(await db.query('SELECT * FROM dimensiones_bancarias WHERE usuario_id=$1',[uid])).rows;
    const accounts=(await db.query('SELECT * FROM cuentas_bancarias WHERE usuario_id=$1',[uid])).rows;
    const dimensions=planBankDimensions(uid,posted,existing,previous,await sourceTransactions(db,uid),accounts);
    for(const row of dimensions)await db.query(`INSERT INTO dimensiones_bancarias
      (id,usuario_id,cliente_id,asiento_id,orden,cuenta_bancaria_id,asiento_hash,fuente,dimension_hash,created_at,asiento_origen_id)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,[row.id,uid,row.cliente_id,row.asiento_id,row.orden,row.cuenta_bancaria_id,
        row.asiento_hash,row.fuente,row.dimension_hash,row.created_at,row.asiento_origen_id]);
  }
}

async function syncJournal(db, uid, assertOpen, correction) {
  if (!await bookStatus(db, uid)) return;
  const transactions = await sourceTransactions(db, uid);
  const existing = await storedEntries(db, uid);
  const entries = journalPlan(transactions, existing, { reasons: correction ? { [correction.documentId]: correction.reason } : {} });
  if (entries.some(entry => entry.rectifica_id && (!correction?.reason || entry.transaccion_id !== correction.documentId))) {
    fail('Hay cambios del libro sin una correccion revisada. Revise el documento y su motivo.', 409);
  }
  await appendEntries(db, uid, entries, existing, assertOpen);
}

async function previewBook(uid, db = { query }) {
  const book = await bookStatus(db, uid);
  const existing = await storedEntries(db, uid);
  if (book) {
    existing.forEach(verifyEntry);
    return { estado: 'incorporado', data: book, total_asientos: existing.length };
  }
  return { estado: 'pendiente_revision', data: null,
    revision: incorporationPreview(await sourceTransactions(db, uid), existing) };
}

async function incorporateBook(db, uid, fingerprint) {
  const current = await previewBook(uid, db);
  if (current.estado === 'incorporado') {
    if (current.data.fingerprint !== fingerprint) fail('El libro ya fue incorporado con otra revision.', 409);
    return current;
  }
  if (!current.revision.puede_incorporar) fail(current.revision.errores.join(' ') || 'El libro no esta balanceado.', 409);
  if (current.revision.fingerprint !== fingerprint) fail('Los registros cambiaron. Revise los saldos nuevamente antes de confirmar.', 409);
  const transactions = await sourceTransactions(db, uid);
  await createBook(db, uid, 'revision_cpa', fingerprint);
  await appendEntries(db, uid, journalPlan(transactions, [], {
    origin: 'incorporacion', reason: 'Historial revisado e incorporado por CPA',
  }), []);
  return previewBook(uid, db);
}

// Read-only: reports where documentos, libro and report-style totals disagree.
async function readConsistency(uid, scope = {}, db = { query }) {
  if (!await bookStatus(db, uid)) return { estado: 'pendiente_incorporacion', pendientes: [], cuentas_divergentes: [], errores: [] };
  return ledgerConsistency(await sourceTransactions(db, uid), await storedEntries(db, uid), scope);
}

async function readJournal(uid, transactions, scope = {}, history = false, db = { query }) {
  if (!await bookStatus(db, uid)) {
    return buildJournal(transactions, history ? {} : scope).map(e => ({ ...e, persistido: false }));
  }
  return publicJournal(await storedEntries(db, uid), transactions, scope, history);
}

module.exports = { prepareJournalWrite, syncJournal, readJournal, readConsistency, previewBook, incorporateBook,
  sourceTransactions, storedEntries, bookStatus, previewEntityBooks, incorporateEntityBooks, entityState, journalSnapshot };
