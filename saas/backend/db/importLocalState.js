const fs = require('node:fs');
const { createHash } = require('node:crypto');
const { dateKey } = require('../services/accountingPeriod');
const { incorporationPreview } = require('../services/journalLedger');
const { paymentsFor, paymentSummary, validateTimeline, unresolvedPayment } = require('../services/paymentLedger');
const digest = value => createHash('sha256').update(value).digest('hex');
const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value);
const money = value => /^(0|[1-9]\d*)(\.\d{1,2})?$/.test(String(value)) && Number.isSafeInteger(Math.round(Number(value) * 100));
const columns = {
  clientes: ['nombre','ruc','nit','tipo','contribuyente_itbms','regimen_fiscal','periodo_fiscal','cierre_fiscal_mes','actividad','estado','telefono','email','direccion'],
  transacciones: ['cliente_nombre','fecha','descripcion','categoria_contable','tipo','monto','tasa_itbms','categoria_itbms','itbms','deducible','banco','referencia','tipo_documento','estado_pago','fecha_vencimiento','fecha_pago','metodo_pago','referencia_pago','conciliado','fecha_conciliacion','periodo','notas','estado_contable'],
  pagos_transacciones: ['importe','fecha','metodo_pago','banco','referencia','idempotencia','conciliado','anulado_fecha','anulado_motivo'],
};
function inspectSource(bytes, sourceOwner) {
  const source = JSON.parse(bytes.toString('utf8'));
  if (!uuid(sourceOwner)) throw new Error('Indique source-owner UUID explicitamente.');
  if (!Array.isArray(source.clientes) || !Array.isArray(source.transacciones)) throw new Error('Fuente local invalida.');
  const own = rows => (rows || []).filter(row => row.usuario_id === sourceOwner);
  const clients = own(source.clientes), docs = own(source.transacciones).map(row => ({ ...row }));
  const errors = [], warnings = [], payments = [];
  if (!clients.length && !docs.length) errors.push('El propietario seleccionado no tiene registros en la fuente.');
  const clientIds = new Set(clients.map(c => c.id)), docIds = new Set(docs.map(d => d.id));
  if (clientIds.size !== clients.length || docIds.size !== docs.length) errors.push('Identificadores duplicados.');
  for (const c of clients) {
    if (!uuid(c.id) || !c.nombre || !c.ruc) errors.push(`Cliente ${c.id}: identidad incompleta.`);
    if (!['natural','jurídica'].includes(c.tipo)) errors.push(`Cliente ${c.id}: tipo fiscal ausente o invalido.`);
    if (typeof c.contribuyente_itbms !== 'boolean' || !['general','ampyme','no_contribuyente_itbms','exento'].includes(c.regimen_fiscal) ||
      !['calendario','especial'].includes(c.periodo_fiscal) || !Number.isInteger(c.cierre_fiscal_mes) || c.cierre_fiscal_mes < 1 || c.cierre_fiscal_mes > 12) errors.push(`Cliente ${c.id}: perfil fiscal incompleto; no se asignaran obligaciones por defecto.`);
  }
  for (const key of ['asientos_contables','libros_contables','libros_entidad','folios_libro','cuentas_bancarias','movimientos_bancarios','extractos_bancarios','cierres_periodo']) {
    if (own(source[key]).length) errors.push(`${key}: requiere una migracion especializada; no se importara ni descartara silenciosamente.`);
  }
  const detached = own(source.pagos_transacciones);
  for (const p of detached) if (!docIds.has(p.transaccion_id)) errors.push(`Pago ${p.id}: documento ausente.`);
  for (const tx of docs) {
    if (!uuid(tx.id) || (tx.cliente_id && !clientIds.has(tx.cliente_id))) errors.push(`Documento ${tx.id}: identidad o cliente invalido.`);
    if (!dateKey(tx.fecha) || dateKey(tx.fecha) !== tx.fecha || (tx.periodo && tx.periodo !== tx.fecha.slice(0, 7))) errors.push(`Documento ${tx.id}: fecha/periodo incompatible.`);
    if (!money(tx.monto) || !money(tx.itbms ?? 0) || !['ingreso','gasto'].includes(tx.tipo)) errors.push(`Documento ${tx.id}: importe o tipo invalido.`);
    if (tx.conciliado || tx.cuenta_bancaria_id || tx.origen_propuesta_id) errors.push(`Documento ${tx.id}: enlace o conciliacion sin soporte migrable.`);
    for (const field of ['fecha_pago','fecha_vencimiento','fecha_conciliacion']) if (tx[field] && dateKey(tx[field]) !== tx[field]) errors.push(`Documento ${tx.id}: ${field} invalida.`);
    const external = detached.filter(p => p.transaccion_id === tx.id);
    if (external.length && tx.pagos?.length) errors.push(`Documento ${tx.id}: pagos duplicados en dos colecciones.`);
    if (external.length) tx.pagos = external;
    if (unresolvedPayment(tx)) errors.push(`Documento ${tx.id}: pago sin fecha/importe verificable.`);
    const ledger = paymentsFor(tx);
    for (const p of ledger) {
      if (!uuid(p.id) || !money(p.importe) || Number(p.importe) <= 0 || dateKey(p.fecha) !== p.fecha || p.fecha < tx.fecha ||
        (p.usuario_id && p.usuario_id !== sourceOwner) || (p.transaccion_id && p.transaccion_id !== tx.id)) errors.push(`Pago ${p.id}: identidad, importe o fecha invalida.`);
      if (p.conciliado || p.movimiento_bancario_id || p.cuenta_bancaria_id) errors.push(`Pago ${p.id}: conciliacion/cuenta requiere migracion con evidencia.`);
      if (!['efectivo','transferencia','cheque','tarjeta','otro'].includes(p.metodo_pago) || (p.metodo_pago !== 'efectivo' && !p.banco)) errors.push(`Pago ${p.id}: metodo o banco incompleto.`);
      if (p.anulado_fecha && (dateKey(p.anulado_fecha) !== p.anulado_fecha || p.anulado_fecha < p.fecha || !p.anulado_motivo?.trim())) errors.push(`Pago ${p.id}: anulacion incompleta.`);
      payments.push({ ...p, transaccion_id: tx.id });
    }
    try { validateTimeline(tx, ledger); } catch (e) { errors.push(`Documento ${tx.id}: ${e.message}`); }
    const summary = paymentSummary(tx);
    if (summary.estado_pago !== tx.estado_pago && tx.estado_pago) errors.push(`Documento ${tx.id}: estado de pago distinto del historial.`);
  }
  if (new Set(payments.map(p => p.id)).size !== payments.length) errors.push('Pagos con identificadores duplicados.');
  if (source.usuarios?.length) warnings.push('No se importan usuarios, contrasenas ni sesiones. El propietario destino debe existir.');
  if (own(source.audit_events).length) warnings.push('Auditoria local conservada en la fuente original, no mezclada con eventos SQL.');
  let expected;
  try { expected = incorporationPreview(docs); } catch (e) { errors.push(e.message); }
  if (expected?.errores?.length) errors.push(...expected.errores);
  const balances = docs.map(tx => ({ documento_id: tx.id, cliente_id: tx.cliente_id || null,
    tipo: tx.tipo, ...Object.fromEntries(Object.entries(paymentSummary(tx)).filter(([k]) => ['importe_documento','total_pagado','saldo_pendiente'].includes(k))) }));
  return { source, clients, docs, payments, report: {
    mode: 'dry-run', fingerprint: digest(bytes), source_owner: sourceOwner, clientes: clients.length, documentos: docs.length, pagos: payments.length,
    periodos: [...new Set([...docs, ...payments].flatMap(t => [t.fecha,t.anulado_fecha].filter(Boolean).map(f => String(f).slice(0,7))))].sort(), saldos: balances,
    inconsistencias: errors, advertencias: warnings, incorporacion_esperada: expected || null,
    aprobacion_cpa_requerida: true, puede_importar: !errors.length,
  } };
}

function authorize(plan, options, env) {
  if (plan.report.inconsistencias.length) throw new Error('La fuente tiene inconsistencias; importacion rechazada.');
  if (!uuid(options.targetOwner) || options.expectedHash !== plan.report.fingerprint || options.confirmation !== 'IMPORTAR DOCUMENTOS SIN PUBLICAR') throw new Error('Faltan propietario, fingerprint o confirmacion explicita.');
  if (!options.targetDatabase) throw new Error('Indique la base destino explicitamente.');
  const synthetic = plan.source.metadata?.kind === 'contapanama-synthetic-v1';
  if (!synthetic && options.authorizeRealCopy !== plan.report.fingerprint) throw new Error('La copia no es sintetica: requiere autorizacion separada vinculada al hash.');
  if (env.NODE_ENV === 'production' && env.CONTAPANAMA_IMPORT_PRODUCTION_AUTH !== `${options.targetDatabase}:${plan.report.fingerprint}`) throw new Error('Importacion en produccion bloqueada.');
  if (!['contapanama_qa','contapanama_review'].includes(options.targetDatabase) && env.CONTAPANAMA_IMPORT_TARGET_AUTH !== `${options.targetDatabase}:${plan.report.fingerprint}`) throw new Error('Destino no QA: requiere autorizacion separada vinculada a base y hash.');
}
async function importState(bytes, options = {}, db, env = process.env) {
  options = { ...options, targetOwner: typeof options.targetOwner === 'string' ? options.targetOwner.toLowerCase() : options.targetOwner };
  const plan = inspectSource(bytes, options.sourceOwner);
  if (!options.apply) return plan.report;
  authorize(plan, options, env);
  if (!db) throw new Error('Conexion explicita requerida para aplicar.');
  await db.query('BEGIN');
  try {
    await db.query('SELECT pg_advisory_xact_lock(1129333070,hashtext($1))', [options.targetOwner]);
    if ((await db.query('SELECT current_database() AS name')).rows[0].name !== options.targetDatabase) throw new Error('La conexion no corresponde a la base autorizada.');
    const owner = (await db.query('SELECT id,rol,activo FROM usuarios WHERE id=$1', [options.targetOwner])).rows[0];
    if (!owner?.activo || !['admin','contador'].includes(owner.rol)) throw new Error('Propietario CPA activo requerido.');
    const previous = (await db.query(`SELECT despues_json FROM audit_events WHERE usuario_id=$1 AND accion='importacion_local_preparada'
      AND despues_json->>'fingerprint'=$2`, [options.targetOwner, plan.report.fingerprint])).rows[0];
    if (previous) { await db.query('COMMIT'); return { ...previous.despues_json, repetido: true }; }
    for (const table of ['clientes','transacciones','asientos_contables','libros_contables']) {
      if ((await db.query(`SELECT 1 FROM ${table} WHERE usuario_id=$1 LIMIT 1`, [options.targetOwner])).rowCount) throw new Error('El propietario destino no esta vacio. No se mezclaran historiales.');
    }
    const mapped = (table, id) => {
      const s = digest(`${options.targetOwner}:${plan.report.fingerprint}:${table}:${id}`);
      return `${s.slice(0,8)}-${s.slice(8,12)}-4${s.slice(13,16)}-8${s.slice(17,20)}-${s.slice(20,32)}`;
    };
    const insert = async (table, source, extra = {}) => {
      const row = { id: mapped(table, source.id), usuario_id: options.targetOwner, ...Object.fromEntries(columns[table].filter(k => source[k] !== undefined).map(k => [k, source[k]])), ...extra };
      const keys = Object.keys(row);
      await db.query(`INSERT INTO ${table}(${keys.join(',')}) VALUES(${keys.map((_, i) => '$' + (i + 1)).join(',')})`, Object.values(row));
    };
    for (const c of plan.clients) await insert('clientes', c);
    for (const t of plan.docs) await insert('transacciones', t, { cliente_id: t.cliente_id ? mapped('clientes', t.cliente_id) : null, periodo: t.fecha.slice(0,7), itbms: t.itbms ?? 0 });
    for (const p of plan.payments) await insert('pagos_transacciones', p, { transaccion_id: mapped('transacciones', p.transaccion_id), idempotencia: p.idempotencia || `import-${mapped('pagos_transacciones',p.id)}`, conciliado: false });
    const result = { ...plan.report, mode: 'applied-pending-cpa', target_owner: options.targetOwner, target_database: options.targetDatabase,
      identificadores: Object.fromEntries([['clientes',plan.clients],['transacciones',plan.docs],['pagos_transacciones',plan.payments]].map(([table,rows]) =>
        [table,rows.map(row => ({ fuente:row.id,destino:mapped(table,row.id) }))])) };
    await db.query(`INSERT INTO audit_events(usuario_id,accion,objeto_tipo,objeto_id,despues_json)
      VALUES($1,'importacion_local_preparada','importacion_local',$2,$3)`, [options.targetOwner,mapped('importacion',plan.report.fingerprint),result]);
    await db.query('COMMIT'); return result;
  } catch (error) { await db.query('ROLLBACK'); throw error; }
}
async function main() {
  const args = Object.fromEntries(process.argv.slice(2).map(arg => { const i = arg.indexOf('='); return i < 0 ? [arg.replace(/^--/,''),true] : [arg.slice(2,i),arg.slice(i+1)]; }));
  if (typeof args.source !== 'string') throw new Error('Use --source=<copia-explicita.json> --source-owner=<uuid>; dry-run por defecto.');
  const bytes = fs.readFileSync(args.source);
  const options = { sourceOwner: args['source-owner'], targetOwner: args['target-owner'], expectedHash: args['expect-source-hash'], targetDatabase: args['target-database'],
    confirmation: args.confirm, authorizeRealCopy: args['authorize-real-copy'], apply: args.apply === true };
  const preview = await importState(bytes, { sourceOwner: options.sourceOwner });
  console.log(JSON.stringify(preview, null, 2));
  if (!options.apply) return;
  authorize(inspectSource(bytes, options.sourceOwner), options, process.env);
  const { Client } = require('pg');
  const { sslConfig, closePool } = require('./index');
  const db = new Client({ connectionString: process.env.DATABASE_URL, ssl: sslConfig(), connectionTimeoutMillis: 5000 });
  try { await db.connect(); console.log(JSON.stringify(await importState(bytes, options, db), null, 2)); }
  finally { await db.end(); await closePool(); }
}
if (require.main === module) main().catch(e => { console.error(e.message); process.exitCode = 1; });
module.exports = { inspectSource, importState, authorize };
