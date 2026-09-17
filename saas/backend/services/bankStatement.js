const { createHash } = require('node:crypto');
const { isDeepStrictEqual } = require('node:util');
const { fail } = require('./paymentLedger');
const { uuid } = require('./bankMovement');

const MAX_PDF_BYTES = 4 * 1024 * 1024;
const amounts = ['saldo_inicial', 'creditos', 'debitos', 'saldo_final'];
const fields = ['id', 'usuario_id', 'cliente_id', 'cuenta_bancaria_id', 'periodo', 'revision', 'anterior_id',
  ...amounts, 'cantidad_creditos', 'cantidad_debitos', 'soporte_nombre', 'soporte_hash', 'soporte_bytes', 'motivo'];
const digest = value => createHash('sha256').update(value).digest('hex');
const validMonth = value => typeof value === 'string' && /^(20\d{2}|2100)-(0[1-9]|1[0-2])$/.test(value);

function cents(value, name = 'Importe') {
  if (!['string', 'number'].includes(typeof value) || !/^-?\d{1,12}(\.\d{1,2})?$/.test(String(value))) {
    fail(name + ': use un importe con hasta dos decimales.');
  }
  return Math.round(Number(value) * 100);
}
function validateTotals(row) {
  const money = Object.fromEntries(amounts.map(name => [name, cents(row[name], name)]));
  for (const key of ['creditos', 'debitos']) {
    if (money[key] < 0) fail('Creditos y debitos no pueden ser negativos.');
    const count = row['cantidad_' + key];
    if (!Number.isInteger(count) || count < 0 || count > 1000000 || (money[key] === 0) !== (count === 0)) {
      fail('Cantidad de ' + key + ' incompatible con el total.');
    }
  }
  if (money.saldo_inicial + money.creditos - money.debitos !== money.saldo_final) {
    fail('El saldo inicial mas creditos menos debitos no coincide con el saldo final del extracto.');
  }
  return Object.fromEntries(amounts.map(name => [name, (money[name] / 100).toFixed(2)]));
}
function pdfBytes(value) {
  if (typeof value !== 'string' || !value.length || value.length > Math.ceil(MAX_PDF_BYTES / 3) * 4 ||
    !/^[A-Za-z0-9+/]*={0,2}$/.test(value)) fail('Adjunte un PDF valido de hasta 4 MiB.');
  const bytes = Buffer.from(value, 'base64');
  if (bytes.length > MAX_PDF_BYTES || bytes.toString('base64') !== value ||
    !/^%PDF-1\.[0-9]|^%PDF-2\.0/.test(bytes.subarray(0, 8).toString('ascii')) ||
    !/%%EOF\s*$/.test(bytes.subarray(-1024).toString('latin1'))) fail('El soporte no tiene un formato PDF valido.');
  return bytes;
}
function prepareStatement(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) fail('Extracto invalido.');
  if (!uuid(body.cliente_id) || !uuid(body.cuenta_bancaria_id)) fail('Seleccione cliente y cuenta bancaria.');
  if (!validMonth(body.periodo)) fail('Periodo del extracto invalido.');
  const anterior_id = body.anterior_id || null;
  if (anterior_id && !uuid(anterior_id)) fail('Version anterior invalida.');
  const motivo = typeof body.motivo === 'string' ? body.motivo.trim() : '';
  if (motivo.length > 1000 || (anterior_id && motivo.length < 10)) fail('La correccion requiere un motivo de 10 a 1000 caracteres.');
  const name = body.soporte_nombre;
  if (typeof name !== 'string' || name.length > 180 || !name.trim() ||
    /[\\/\x00-\x1f\x7f]/.test(name) || !/\.pdf$/i.test(name)) fail('Nombre del PDF invalido.');
  const bytes = pdfBytes(body.soporte_base64);
  return { cliente_id: body.cliente_id, cuenta_bancaria_id: body.cuenta_bancaria_id, periodo: body.periodo,
    anterior_id, ...validateTotals(body), cantidad_creditos: body.cantidad_creditos, cantidad_debitos: body.cantidad_debitos,
    motivo, soporte_nombre: name.trim(), soporte_hash: digest(bytes), soporte_bytes: bytes.length,
    soporte_base64: bytes.toString('base64') };
}
function statementHash(row) {
  const normalized = { ...row, ...validateTotals(row) };
  return digest(JSON.stringify(fields.map(key => normalized[key])));
}
function statementMeta(row) {
  return Object.fromEntries([...fields, 'contenido_hash', 'created_at'].map(key => [key, row[key]]));
}
function assertStatement(row, withPdf = false) {
  if (statementHash(row) !== row.contenido_hash) fail('La integridad del extracto no coincide. Requiere revision del respaldo.', 409);
  if (withPdf) {
    const bytes = pdfBytes(row.soporte_base64);
    if (digest(bytes) !== row.soporte_hash || bytes.length !== row.soporte_bytes) fail('El PDF del extracto fue alterado.', 409);
  }
}
function assertStatementHistory(rows, accounts) {
  const latest = new Map(), ids = new Set();
  for (const row of [...rows].sort((a, b) => a.revision - b.revision)) {
    assertStatement(row);
    const account = accounts.find(a => a.id === row.cuenta_bancaria_id && a.usuario_id === row.usuario_id && a.cliente_id === row.cliente_id);
    if (!account || !validMonth(row.periodo) || ids.has(row.id)) fail('Historial de extractos incompatible con la cuenta.', 409);
    const key = row.cuenta_bancaria_id + ':' + row.periodo, prev = latest.get(key);
    if (row.revision !== (prev?.revision || 0) + 1 || row.anterior_id !== (prev?.id || null) ||
      (prev && row.motivo.length < 10)) fail('La secuencia de versiones del extracto fue alterada.', 409);
    ids.add(row.id); latest.set(key, row);
  }
}
function assertLocalStatements(state, before) {
  const rows = state.extractos_bancarios || [], byId = new Map(rows.map(row => [row.id, row]));
  for (const old of before.extractos_bancarios || []) {
    if (!isDeepStrictEqual(old, byId.get(old.id))) fail('Los extractos originales no se modifican ni eliminan.', 409);
  }
  assertStatementHistory(rows, state.cuentas_bancarias || []);
  for (const row of rows) assertStatement(row, true);
}
function statementScope(query) {
  if (['desde','hasta','fecha_corte'].some(key=>query[key]!==undefined)) fail('El extracto requiere un mes o anio completo.');
  if (query.periodo && query.anio) fail('Seleccione mes o anio, no ambos.');
  for (const key of ['cliente_id', 'cuenta_bancaria_id']) if (query[key] && !uuid(query[key])) fail('Filtro invalido: ' + key);
  if (query.periodo && !validMonth(query.periodo)) fail('Periodo invalido.');
  if (query.anio && !/^(20\d{2}|2100)$/.test(query.anio)) fail('Anio invalido.');
  if (!query.periodo && !query.anio) fail('Seleccione un mes o anio.');
  return { periodo: query.periodo, anio: query.anio, cliente_id: query.cliente_id, cuenta_bancaria_id: query.cuenta_bancaria_id };
}
function previousMonth(periodo) {
  const [year, month] = periodo.split('-').map(Number);
  return month === 1 ? (year - 1) + '-12' : year + '-' + String(month - 1).padStart(2, '0');
}
function statementDirectory(rows, accounts, movements, scope) {
  assertStatementHistory(rows, accounts);
  const periods = scope.periodo ? [scope.periodo] : Array.from({ length: 12 }, (_, i) => scope.anio + '-' + String(i + 1).padStart(2, '0'));
  const selected = accounts.filter(a => (!scope.cliente_id || a.cliente_id === scope.cliente_id) &&
    (!scope.cuenta_bancaria_id || a.id === scope.cuenta_bancaria_id));
  if (scope.cuenta_bancaria_id && !selected.length) fail('Cuenta no encontrada para el cliente.', 404);
  const data = [];
  for (const account of selected) for (const periodo of periods) {
    const versions = rows.filter(r => r.cuenta_bancaria_id === account.id && r.periodo === periodo).sort((a,b) => b.revision-a.revision);
    const current = versions[0];
    const bank = movements.filter(m => m.usuario_id === account.usuario_id && m.cliente_id === account.cliente_id &&
      m.cuenta_bancaria_id === account.id && String(m.fecha).slice(0, 7) === periodo);
    const totals = { creditos: 0, debitos: 0, cantidad_creditos: 0, cantidad_debitos: 0 };
    for (const m of bank) {
      const key = m.tipo === 'credito' ? 'creditos' : 'debitos';
      totals[key] += cents(m.monto); totals['cantidad_' + key]++;
    }
    const prior = rows.filter(r => r.cuenta_bancaria_id === account.id && r.periodo === previousMonth(periodo)).sort((a,b) => b.revision-a.revision)[0];
    const differences = current ? { creditos: (totals.creditos-cents(current.creditos))/100,
      debitos: (totals.debitos-cents(current.debitos))/100,
      cantidad_creditos: totals.cantidad_creditos-current.cantidad_creditos,
      cantidad_debitos: totals.cantidad_debitos-current.cantidad_debitos,
      saldo_final: (cents(current.saldo_inicial)+totals.creditos-totals.debitos-cents(current.saldo_final))/100 } : null;
    const continuity = current && prior ? (cents(current.saldo_inicial)-cents(prior.saldo_final))/100 : null;
    data.push({ periodo, cliente_id: account.cliente_id, cliente_nombre: account.cliente_nombre || '',
      cuenta_bancaria_id: account.id, cuenta_nombre: account.banco + ' - ' + account.nombre + ' ***' + account.numero.slice(-4),
      cuenta_activa: account.activa, moneda: account.moneda, actual: current ? statementMeta(current) : null,
      versiones: versions.map(statementMeta), importado: { ...totals, creditos: totals.creditos/100, debitos: totals.debitos/100 },
      diferencias: differences, estado: !current ? 'sin_extracto' : Object.values(differences).some(v => v !== 0) ? 'diferencias' : 'coincidencia_aritmetica',
      continuidad: !current ? 'sin_extracto' : !prior ? 'sin_extracto_anterior' : continuity ? 'diferencia' : 'coincide',
      diferencia_continuidad: continuity, extracto_anterior_id: prior?.id || null, saldo_verificado: false, revision_cpa: 'pendiente' });
  }
  return { data, alcance: 'extractos_declarados_vs_importacion', saldo_verificado: false };
}
module.exports = { MAX_PDF_BYTES, cents, digest, pdfBytes, prepareStatement, statementHash, statementMeta, assertStatement,
  assertStatementHistory, assertLocalStatements, statementScope, previousMonth, statementDirectory };
