const { randomUUID } = require('node:crypto');
const assert = require('node:assert/strict');
const { journalPlan, hash } = require('../services/journalLedger');

function legacyEntityFixture(uid) {
  const created_at = '2070-01-01T12:00:00.000Z';
  const clients = ['Alfa', 'Beta'].map(name => ({ id: randomUUID(), usuario_id: uid, nombre: 'QA Historial ' + name,
    ruc: 'QA-HISTORIAL-' + name, tipo: 'natural', estado: 'activo', created_at, updated_at: created_at }));
  const transactions = [[clients[0], '2070-01-02', 60], [clients[1], '2070-02-01', 90], [clients[0], '2071-01-02', 40]]
    .map(([client, fecha, monto]) => ({ id: randomUUID(), usuario_id: uid, cliente_id: client.id, cliente_nombre: client.nombre,
      fecha, periodo: fecha.slice(0, 7), tipo: 'ingreso', descripcion: 'QA historial publicado ' + fecha, monto, itbms: 0,
      tasa_itbms: 0, categoria_itbms: 'exento', estado_pago: 'pendiente', created_at, updated_at: created_at }));
  const entries = journalPlan(transactions).map((entry, index) => ({ ...entry, usuario_id: uid,
    numero: (index + 1) * 10, requiere_folio: false, created_at }));
  return { clientes: clients, transacciones: transactions,
    libros_contables: [{ id: randomUUID(), usuario_id: uid, metodo_incorporacion: 'revision_cpa', fingerprint: hash([]), created_at }],
    asientos_contables: entries, cierres_periodo: [{ id: randomUUID(), usuario_id: uid, cliente_id: clients[0].id,
      periodo: '2070-01', alcance: 'mensual', estado: 'cerrado', created_at, updated_at: created_at }] };
}

async function installLegacyEntityFixture(db, fixture) {
  const uid = fixture.libros_contables[0].usuario_id;
  assert.equal((await db.query('SELECT current_database() AS name')).rows[0].name, 'contapanama_qa');
  assert.match((await db.query('SELECT email FROM usuarios WHERE id=$1', [uid])).rows[0].email, /^qa-legacy-entity-/);
  // Only this disposable database receives historical rows that predate folio enforcement.
  // DDL and inserts share one transaction, so failure restores the original triggers.
  await db.query('BEGIN');
  try {
    await db.query('ALTER TABLE asientos_contables DISABLE TRIGGER USER; ALTER TABLE asiento_lineas DISABLE TRIGGER USER');
    for (const client of fixture.clientes) await db.query(
      'INSERT INTO clientes(id,usuario_id,nombre,ruc,tipo) VALUES($1,$2,$3,$4,$5)',
      [client.id, uid, client.nombre, client.ruc, client.tipo]);
    for (const tx of fixture.transacciones) await db.query(`INSERT INTO transacciones
      (id,usuario_id,cliente_id,cliente_nombre,fecha,periodo,tipo,descripcion,monto,itbms,tasa_itbms,categoria_itbms,estado_pago)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,0,0,'exento','pendiente')`,
    [tx.id, uid, tx.cliente_id, tx.cliente_nombre, tx.fecha, tx.periodo, tx.tipo, tx.descripcion, tx.monto]);
    const book = fixture.libros_contables[0];
    await db.query('INSERT INTO libros_contables(id,usuario_id,metodo_incorporacion,fingerprint) VALUES($1,$2,$3,$4)',
      [book.id, uid, book.metodo_incorporacion, book.fingerprint]);
    for (const entry of fixture.asientos_contables) {
      await db.query(`INSERT INTO asientos_contables
        (id,usuario_id,transaccion_id,cliente_id,cliente_nombre,fecha,periodo,descripcion,origen,origen_clave,
         revision,numero,contenido_hash,tipo_asiento,motivo,requiere_folio,registro_txid)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,false,0)`,
      [entry.id, uid, entry.transaccion_id, entry.cliente_id, entry.cliente_nombre, entry.fecha, entry.periodo,
        entry.descripcion, entry.origen, entry.origen_clave, entry.revision, entry.numero, entry.contenido_hash, entry.tipo_asiento, entry.motivo]);
      for (const [index, line] of entry.lineas.entries()) await db.query(`INSERT INTO asiento_lineas
        (asiento_id,usuario_id,orden,cuenta_codigo,cuenta_nombre,tipo_cuenta,descripcion,debe,haber)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`, [entry.id, uid, index + 1, line.cuenta_codigo,
        line.cuenta_nombre, line.tipo_cuenta, line.descripcion, line.debe, line.haber]);
    }
    for (const closure of fixture.cierres_periodo) await db.query(`INSERT INTO cierres_periodo
      (id,usuario_id,cliente_id,periodo,alcance,estado) VALUES($1,$2,$3,$4,$5,$6)`,
    [closure.id, uid, closure.cliente_id, closure.periodo, closure.alcance, closure.estado]);
    await db.query('ALTER TABLE asientos_contables ENABLE TRIGGER USER; ALTER TABLE asiento_lineas ENABLE TRIGGER USER');
    await db.query('COMMIT');
  } catch (error) { await db.query('ROLLBACK'); throw error; }
}

module.exports = { legacyEntityFixture, installLegacyEntityFixture };
