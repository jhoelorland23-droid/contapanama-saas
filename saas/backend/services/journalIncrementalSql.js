const { folioHash, allocateFolios } = require('./entityBooks');
const { verifyEntry, hash } = require('./journalLedger');
const { verifyBankDimensions } = require('./bankPosting');
const { fail } = require('./paymentLedger');

async function readSubset(db, uid, ids) {
  const transactions = (await db.query('SELECT * FROM transacciones WHERE usuario_id=$1 AND id=ANY($2::uuid[]) ORDER BY fecha,created_at,id', [uid, ids])).rows;
  const payments = (await db.query('SELECT * FROM pagos_transacciones WHERE usuario_id=$1 AND transaccion_id=ANY($2::uuid[]) ORDER BY fecha,created_at,id', [uid, ids])).rows;
  for (const tx of transactions) { const own = payments.filter(p => p.transaccion_id === tx.id); if (own.length) tx.pagos = own; }
  const entries = (await db.query(`SELECT a.*,COALESCE(jsonb_agg(jsonb_build_object(
    'cuenta_codigo',l.cuenta_codigo,'cuenta_nombre',l.cuenta_nombre,'tipo_cuenta',l.tipo_cuenta,
    'descripcion',l.descripcion,'debe',l.debe,'haber',l.haber) ORDER BY l.orden,l.id)
    FILTER (WHERE l.id IS NOT NULL),'[]'::jsonb) AS lineas FROM asientos_contables a
    LEFT JOIN asiento_lineas l ON l.asiento_id=a.id WHERE a.usuario_id=$1 AND a.transaccion_id=ANY($2::uuid[])
    GROUP BY a.id ORDER BY a.numero,a.id`, [uid, ids])).rows.map(e => ({ ...e, numero: Number(e.numero), revision: Number(e.revision) }));
  const entryIds = entries.map(e => e.id);
  const folios = (await db.query(`SELECT f.*,b.cliente_id FROM folios_libro f JOIN libros_entidad b ON b.id=f.libro_entidad_id AND b.usuario_id=f.usuario_id
    WHERE f.usuario_id=$1 AND f.asiento_id=ANY($2::uuid[])`, [uid, entryIds])).rows.map(f => ({ ...f, numero: Number(f.numero) }));
  const byEntry = new Map(folios.map(f => [f.asiento_id, f]));
  for (const entry of entries) {
    verifyEntry(entry);
    const f = byEntry.get(entry.id);
    if (entry.usuario_id !== uid || !f || f.cliente_id !== entry.cliente_id || !Number.isSafeInteger(f.numero) || f.numero < 1 || folioHash(f, entry) !== f.folio_hash) fail('La integridad o el folio del documento no coincide.', 409);
    entry.numero_libro = f.numero; entry.libro_entidad_id = f.libro_entidad_id;
    entry.rectifica_numero_libro = byEntry.get(entry.rectifica_id)?.numero || null;
  }
  const dimensions = (await db.query('SELECT * FROM dimensiones_bancarias WHERE usuario_id=$1 AND asiento_id=ANY($2::uuid[])', [uid, entryIds])).rows;
  const accountIds = [...new Set([...transactions, ...payments, ...dimensions].map(row => row.cuenta_bancaria_id).filter(Boolean))];
  const accounts = (await db.query('SELECT * FROM cuentas_bancarias WHERE usuario_id=$1 AND id=ANY($2::uuid[])', [uid, accountIds])).rows;
  verifyBankDimensions(uid, entries, dimensions, accounts);
  const max = Number((await db.query('SELECT numero FROM asientos_contables WHERE usuario_id=$1 AND numero IS NOT NULL ORDER BY numero DESC LIMIT 1', [uid])).rows[0]?.numero || 0);
  if (!Number.isSafeInteger(max)) fail('El libro supera la numeracion admitida.',409);
  const clientIds = [...new Set([...transactions,...entries].map(r=>r.cliente_id))];
  const bookRows = (await db.query(`SELECT b.cliente_id,COALESCE((SELECT numero FROM folios_libro WHERE libro_entidad_id=b.id ORDER BY numero DESC LIMIT 1),0) AS ultimo
    FROM libros_entidad b WHERE b.usuario_id=$1 AND (b.cliente_id=ANY($2::uuid[]) OR ($3 AND b.cliente_id IS NULL))`, [uid,clientIds.filter(Boolean),clientIds.includes(null)])).rows;
  const folioMax = Object.fromEntries(bookRows.map(b=>[b.cliente_id||'',Number(b.ultimo)]));
  return { transactions, existing: entries, dimensions, accounts, max, folioMax };
}
async function guardFolios(db, uid) {
  if ((await db.query(`SELECT a.id FROM asientos_contables a WHERE a.usuario_id=$1 AND NOT EXISTS
    (SELECT 1 FROM folios_libro f WHERE f.asiento_id=a.id) LIMIT 1`, [uid])).rowCount) fail('Revise y asigne los libros por cliente antes de publicar mas asientos.', 409);
}
async function appendFolios(db, uid, posted, incorporationId) {
  const books = [], counters = new Map(), clients = new Set();
  for (const entry of posted) {
    const key = entry.cliente_id || '';
    if (clients.has(key)) continue;
    clients.add(key);
    const book = (await db.query('SELECT * FROM libros_entidad WHERE usuario_id=$1 AND cliente_id IS NOT DISTINCT FROM $2::uuid', [uid, entry.cliente_id || null])).rows[0];
    if (book) {
      books.push(book);
      counters.set(book.id, Number((await db.query('SELECT numero FROM folios_libro WHERE libro_entidad_id=$1 ORDER BY numero DESC LIMIT 1', [book.id])).rows[0]?.numero || 0));
    }
  }
  const plan = allocateFolios(uid, posted, books, counters, incorporationId);
  for (const book of plan.books) {
    await db.query('INSERT INTO libros_entidad(id,usuario_id,cliente_id,incorporacion_id,created_at) VALUES($1,$2,$3,$4,$5)', [book.id,uid,book.cliente_id,incorporationId,book.created_at]);
    await db.query(`INSERT INTO audit_events(usuario_id,cliente_id,accion,objeto_tipo,objeto_id,despues_json)
      VALUES($1,$2,'libro_entidad_creado','libro_entidad',$3,$4)`, [uid,book.cliente_id,book.id,book]);
  }
  for (const f of plan.folios) {
    await db.query('INSERT INTO folios_libro(asiento_id,usuario_id,libro_entidad_id,numero,folio_hash) VALUES($1,$2,$3,$4,$5)', [f.asiento_id,uid,f.libro_entidad_id,f.numero,f.folio_hash]);
  }
}
function normalizedPlan(entries, max, folioMax = {}) {
  const counters = {...folioMax};
  return entries.map((e, i) => ({ numero: max + i + 1, numero_libro: (counters[e.cliente_id||'']=(counters[e.cliente_id||'']||0)+1), transaccion_id: e.transaccion_id, cliente_id: e.cliente_id,
    cliente_nombre: e.cliente_nombre, pago_id: e.pago_id, origen: e.origen, origen_clave: e.origen_clave,
    revision: e.revision, rectifica_id: e.rectifica_id, fecha: e.fecha, periodo: e.periodo, descripcion: e.descripcion,
    tipo_asiento: e.tipo_asiento, motivo: e.motivo, contenido_hash: e.contenido_hash, lineas: e.lineas }));
}
function comparePlans(full, incremental, fullMax, incrementalMax, fullFolios, incrementalFolios) {
  const a = normalizedPlan(full, fullMax, fullFolios), b = normalizedPlan(incremental, incrementalMax, incrementalFolios);
  return { equal: JSON.stringify(a) === JSON.stringify(b), full_hash: hash(a), incremental_hash: hash(b), full: a, incremental: b };
}
module.exports = { readSubset, guardFolios, appendFolios, comparePlans };
