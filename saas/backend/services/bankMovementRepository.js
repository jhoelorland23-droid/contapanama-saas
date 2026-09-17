const { randomUUID } = require('node:crypto');
const { query, withTransaction } = require('../db');
const { withAccountingWrite, assertAccountingPeriodOpen } = require('./accountingWrite');
const { fail } = require('./paymentLedger');
const statementColumns = 'id,usuario_id,cliente_id,cuenta_bancaria_id,periodo,revision,anterior_id,saldo_inicial,creditos,debitos,saldo_final,cantidad_creditos,cantidad_debitos,soporte_nombre,soporte_hash,soporte_bytes,motivo,contenido_hash,created_at';

const sqlBankMovementRepository = {
  readSubledgerData: uid => withTransaction(async db => {
    await db.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const journal=require('./journalRepository');
    return {...await journal.journalSnapshot(db,uid),book:await journal.bookStatus(db,uid),
      accounts:(await db.query('SELECT * FROM cuentas_bancarias WHERE usuario_id=$1',[uid])).rows,
      statements:(await db.query('SELECT '+statementColumns+' FROM extractos_bancarios WHERE usuario_id=$1',[uid])).rows,
      clients:(await db.query('SELECT id,nombre FROM clientes WHERE usuario_id=$1',[uid])).rows};
  }),
  readStatementData: uid => withTransaction(async db => {
    await db.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
    return {
      rows: (await db.query('SELECT ' + statementColumns + ' FROM extractos_bancarios WHERE usuario_id=$1',[uid])).rows,
      accounts: (await db.query('SELECT a.*,c.nombre AS cliente_nombre FROM cuentas_bancarias a JOIN clientes c ON c.id=a.cliente_id AND c.usuario_id=a.usuario_id WHERE a.usuario_id=$1',[uid])).rows,
      movements: (await db.query('SELECT * FROM movimientos_bancarios WHERE usuario_id=$1',[uid])).rows,
      clients: (await db.query('SELECT id FROM clientes WHERE usuario_id=$1',[uid])).rows,
    };
  }),
  async readStatementFile(uid, id) {
    const row=(await query('SELECT * FROM extractos_bancarios WHERE id=$1 AND usuario_id=$2',[id,uid])).rows[0];
    return row ? {...row,soporte_base64:row.soporte_pdf.toString('base64')} : null;
  },
  async readAccounts(uid, scope = {}) {
    return (await query(`SELECT a.*,c.nombre AS cliente_nombre FROM cuentas_bancarias a
      JOIN clientes c ON c.id=a.cliente_id AND c.usuario_id=a.usuario_id
      WHERE a.usuario_id=$1 AND ($2::uuid IS NULL OR a.cliente_id=$2) ORDER BY c.nombre,a.banco,a.nombre,a.id`,
    [uid,scope.cliente_id || null])).rows;
  },
  async read(uid, scope) {
    const { rows } = await query(`SELECT m.*, c.nombre AS cliente_nombre FROM movimientos_bancarios m
      LEFT JOIN clientes c ON c.id=m.cliente_id AND c.usuario_id=m.usuario_id
      WHERE m.usuario_id=$1 AND ($2::uuid IS NULL OR m.cliente_id=$2)
      AND ($3::text IS NULL OR to_char(m.fecha,'YYYY-MM')=$3) AND ($4::text IS NULL OR m.banco=$4)
      AND ($5::uuid IS NULL OR m.cuenta_bancaria_id=$5)
      ORDER BY m.fecha DESC,m.created_at DESC,m.id`, [uid, scope.cliente_id || null, scope.periodo || null, scope.banco || null, scope.cuenta_bancaria_id || null]);
    return rows;
  },
  transaction: (uid, action) => withAccountingWrite(uid, db => action({
    statements: async () => (await db.query('SELECT ' + statementColumns + ' FROM extractos_bancarios WHERE usuario_id=$1', [uid])).rows,
    createStatement: async row => (await db.query(`INSERT INTO extractos_bancarios
      (id,usuario_id,cliente_id,cuenta_bancaria_id,periodo,revision,anterior_id,saldo_inicial,creditos,debitos,saldo_final,
      cantidad_creditos,cantidad_debitos,soporte_nombre,soporte_hash,soporte_bytes,soporte_pdf,motivo,contenido_hash)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19) RETURNING ` + statementColumns,
      [row.id,uid,row.cliente_id,row.cuenta_bancaria_id,row.periodo,row.revision,row.anterior_id,row.saldo_inicial,row.creditos,
        row.debitos,row.saldo_final,row.cantidad_creditos,row.cantidad_debitos,row.soporte_nombre,row.soporte_hash,row.soporte_bytes,
        Buffer.from(row.soporte_base64,'base64'),row.motivo,row.contenido_hash])).rows[0],
    getOperation: async key => (await db.query('SELECT * FROM operaciones_bancarias WHERE usuario_id=$1 AND idempotencia=$2',[uid,key])).rows[0],
    saveOperation: (key, kind, hash, result) => db.query(`INSERT INTO operaciones_bancarias
      (usuario_id,idempotencia,tipo,contenido_hash,resultado_json) VALUES($1,$2,$3,$4,$5)`,[uid,key,kind,hash,JSON.stringify(result)]),
    getAccount: async id => (await db.query('SELECT * FROM cuentas_bancarias WHERE id=$1 AND usuario_id=$2',[id,uid])).rows[0],
    findAccount: async row => (await db.query('SELECT id FROM cuentas_bancarias WHERE usuario_id=$1 AND cliente_id=$2 AND lower(banco)=lower($3) AND numero=$4',
      [uid,row.cliente_id,row.banco,row.numero])).rows[0],
    createAccount: async row => (await db.query(`INSERT INTO cuentas_bancarias
      (usuario_id,cliente_id,nombre,banco,numero,tipo,moneda) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [uid,row.cliente_id,row.nombre,row.banco,row.numero,row.tipo,row.moneda])).rows[0],
    setAccountActive: async (id, active) => (await db.query('UPDATE cuentas_bancarias SET activa=$3 WHERE id=$1 AND usuario_id=$2 RETURNING *',[id,uid,active])).rows[0],
    getClient: async id => (await db.query('SELECT id FROM clientes WHERE id=$1 AND usuario_id=$2', [id, uid])).rows[0],
    get: async id => (await db.query('SELECT * FROM movimientos_bancarios WHERE id=$1 AND usuario_id=$2 FOR UPDATE', [id, uid])).rows[0],
    assertOpen: (fecha, clientId) => assertAccountingPeriodOpen(db, uid, String(fecha).slice(0, 7), clientId),
    create: async row => (await db.query(`INSERT INTO movimientos_bancarios
      (usuario_id,cliente_id,fecha,descripcion,monto,tipo,banco,referencia,cuenta_bancaria_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
    [uid, row.cliente_id, row.fecha, row.descripcion, row.monto, row.tipo, row.banco, row.referencia,row.cuenta_bancaria_id])).rows[0],
    assign: async (id, clientId) => (await db.query('UPDATE movimientos_bancarios SET cliente_id=$3 WHERE id=$1 AND usuario_id=$2 RETURNING *', [id, uid, clientId])).rows[0],
    assignAccount: async (id, account) => (await db.query('UPDATE movimientos_bancarios SET cliente_id=$3,cuenta_bancaria_id=$4 WHERE id=$1 AND usuario_id=$2 RETURNING *',
      [id,uid,account.cliente_id,account.id])).rows[0],
    audit: (row, actionName, before, after, type = 'movimiento_bancario') => db.query(`INSERT INTO audit_events
      (usuario_id,cliente_id,accion,objeto_tipo,objeto_id,antes_json,despues_json) VALUES($1,$2,$3,$4,$5,$6,$7)`,
    [uid, row.cliente_id, actionName, type, row.id, before, after]),
  })),
};

function createLocalBankMovementRepository(state, closureFor) {
  return {
    readSubledgerData: uid => {
      const owned=key=>(state[key]||[]).filter(row=>row.usuario_id===uid);
      return structuredClone({book:owned('libros_contables')[0]||null,entries:owned('asientos_contables'),books:owned('libros_entidad'),
        folios:owned('folios_libro'),bank_dimensions:owned('dimensiones_bancarias'),accounts:owned('cuentas_bancarias'),
        statements:owned('extractos_bancarios').map(require('./bankStatement').statementMeta),clients:owned('clientes').map(c=>({id:c.id,nombre:c.nombre}))});
    },
    readStatementData: uid => structuredClone({
      rows: (state.extractos_bancarios || []).filter(r=>r.usuario_id===uid).map(require('./bankStatement').statementMeta),
      accounts: state.cuentas_bancarias.filter(a=>a.usuario_id===uid).map(a=>({...a,
        cliente_nombre:state.clientes.find(c=>c.id===a.cliente_id&&c.usuario_id===uid)?.nombre || ''})),
      movements: state.movimientos_bancarios.filter(m=>m.usuario_id===uid),
      clients: state.clientes.filter(c=>c.usuario_id===uid).map(c=>({id:c.id})),
    }),
    readStatementFile: (uid,id) => structuredClone(state.extractos_bancarios.find(r=>r.id===id&&r.usuario_id===uid)),
    readAccounts: (uid, scope = {}) => (state.cuentas_bancarias || []).filter(a => a.usuario_id===uid && (!scope.cliente_id || a.cliente_id===scope.cliente_id))
      .map(a => ({...a,cliente_nombre:state.clientes.find(c=>c.id===a.cliente_id&&c.usuario_id===uid)?.nombre || ''}))
      .sort((a,b)=>a.cliente_nombre.localeCompare(b.cliente_nombre)||a.banco.localeCompare(b.banco)||a.nombre.localeCompare(b.nombre)||a.id.localeCompare(b.id)),
    read: (uid, scope) => state.movimientos_bancarios.filter(row => row.usuario_id === uid &&
      (!scope.cliente_id || row.cliente_id === scope.cliente_id) && (!scope.periodo || row.fecha.startsWith(scope.periodo)) &&
      (!scope.banco || row.banco === scope.banco) && (!scope.cuenta_bancaria_id || row.cuenta_bancaria_id === scope.cuenta_bancaria_id)).map(row => ({ ...row,
      cliente_nombre: state.clientes.find(client => client.id === row.cliente_id && client.usuario_id === uid)?.nombre || null }))
      .sort((a, b) => b.fecha.localeCompare(a.fecha) || b.created_at.localeCompare(a.created_at) || a.id.localeCompare(b.id)),
    // server.local's durable middleware serializes this whole request and its audit.
    transaction: (uid, action) => action({
      statements: () => (state.extractos_bancarios || []).filter(r=>r.usuario_id===uid).map(require('./bankStatement').statementMeta),
      createStatement: row => {
        const saved={...row,created_at:new Date().toISOString()}; state.extractos_bancarios.push(saved); return saved;
      },
      getOperation: key => state.operaciones_bancarias.find(o=>o.usuario_id===uid&&o.idempotencia===key),
      saveOperation: (key,kind,hash,result) => state.operaciones_bancarias.push({id:randomUUID(),usuario_id:uid,idempotencia:key,
        tipo:kind,contenido_hash:hash,resultado_json:structuredClone(result),created_at:new Date().toISOString()}),
      getAccount: id => structuredClone(state.cuentas_bancarias.find(a=>a.id===id&&a.usuario_id===uid)),
      findAccount: row => state.cuentas_bancarias.find(a=>a.usuario_id===uid&&a.cliente_id===row.cliente_id&&a.banco.toLowerCase()===row.banco.toLowerCase()&&a.numero===row.numero),
      createAccount: row => {
        const saved={...row,id:randomUUID(),usuario_id:uid,activa:true,created_at:new Date().toISOString()};
        state.cuentas_bancarias.push(saved);return saved;
      },
      setAccountActive: (id, active) => {
        const row=state.cuentas_bancarias.find(a=>a.id===id&&a.usuario_id===uid);row.activa=active;return {...row};
      },
      getClient: id => state.clientes.find(client => client.id === id && client.usuario_id === uid),
      get: id => {
        const row = state.movimientos_bancarios.find(row => row.id === id && row.usuario_id === uid);
        return row ? { ...row } : null;
      },
      assertOpen: (fecha, clientId) => { if (closureFor(uid, fecha.slice(0, 7), clientId)) fail('El periodo bancario esta cerrado.', 409); },
      create: value => {
        const row = { ...value, id: randomUUID(), usuario_id: uid, conciliado: false, transaccion_id: null, created_at: new Date().toISOString() };
        state.movimientos_bancarios.push(row); return row;
      },
      assign: (id, clientId) => {
        const row = state.movimientos_bancarios.find(row => row.id === id && row.usuario_id === uid);
        row.cliente_id = clientId; return { ...row };
      },
      assignAccount: (id, account) => {
        const row=state.movimientos_bancarios.find(m=>m.id===id&&m.usuario_id===uid);
        Object.assign(row,{cliente_id:account.cliente_id,cuenta_bancaria_id:account.id});return {...row};
      },
      audit: (row, actionName, before, after, type = 'movimiento_bancario') => state.audit_events.push({ id: randomUUID(), usuario_id: uid,
        cliente_id: row.cliente_id, accion: actionName, objeto_tipo: type, objeto_id: row.id,
        antes_json: before, despues_json: after, created_at: new Date().toISOString() }),
    }),
  };
}

module.exports = { sqlBankMovementRepository, createLocalBankMovementRepository };
