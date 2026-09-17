const { canonical, verifyEntry, hash } = require('./journalLedger');
const { periodRange, inRange } = require('./accountingPeriod');
const { fail } = require('./paymentLedger');

function validateJournalScope(scope) {
  if (Object.keys(scope).some(key => !['periodo', 'anio', 'cliente_id'].includes(key))) {
    fail('El libro diario admite periodo o anio y cliente, sin filtros que oculten lineas.', 422);
  }
  if (Boolean(scope.periodo) === Boolean(scope.anio) ||
      (scope.periodo !== undefined && (typeof scope.periodo !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(scope.periodo))) ||
      (scope.anio !== undefined && (typeof scope.anio !== 'string' || !/^\d{4}$/.test(scope.anio))) ||
      (scope.cliente_id !== undefined && (typeof scope.cliente_id !== 'string' ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(scope.cliente_id)))) {
    fail('Seleccione un mes o un anio y un cliente valido.', 422);
  }
}

function journalReport({ book, entries, clients, scope, entityBooks = [], requireEntityBooks = false, generatedAt = new Date().toISOString() }) {
  validateJournalScope(scope);
  if (!book) fail('Revise e incorpore el libro contable antes de exportar el diario publicado.', 409);
  const clientMap = new Map(clients.map(client => [client.id, client]));
  if (scope.cliente_id && !clientMap.has(scope.cliente_id)) fail('Cliente no encontrado.', 404);
  const numbers = new Set(), ids = new Map();
  for (const entry of entries) {
    verifyEntry(entry);
    if (entry.usuario_id !== book.usuario_id || !Number.isSafeInteger(entry.numero) || entry.numero < 1 ||
        numbers.has(entry.numero) || ids.has(entry.id)) fail('La numeracion o el propietario del libro no coincide.', 409);
    numbers.add(entry.numero); ids.set(entry.id, entry);
  }
  const range = periodRange(scope);
  const selected = entries.filter(entry => inRange(entry.fecha, range) &&
    (!scope.cliente_id || entry.cliente_id === scope.cliente_id))
    .sort((a, b) => a.fecha.localeCompare(b.fecha) || a.numero - b.numero);
  if (requireEntityBooks && selected.some(entry => !entry.libro_entidad_id || !entry.numero_libro)) {
    fail('Revise y asigne los libros por cliente antes de exportar el diario.', 409);
  }
  const groups = new Map();
  for (const entry of selected) {
    if (entry.rectifica_id && !ids.has(entry.rectifica_id)) fail('Falta el asiento original de una correccion.', 409);
    const key = entry.cliente_id || '';
    if (!groups.has(key)) groups.set(key, { cliente_id: key || null,
      cliente_nombre: clientMap.get(key)?.nombre || entry.cliente_nombre || 'Sin cliente asignado',
      ruc: clientMap.get(key)?.ruc || null, libro_entidad_id: entry.libro_entidad_id || null, provisional: !entry.cliente_id, asientos: [] });
    groups.get(key).asientos.push({ ...entry, ...canonical(entry),
      rectifica_numero: entry.rectifica_id ? ids.get(entry.rectifica_id).numero : null });
  }
  if (!selected.length && scope.cliente_id) {
    const client = clientMap.get(scope.cliente_id);
    groups.set(client.id, { cliente_id: client.id, cliente_nombre: client.nombre, ruc: client.ruc || null,
      libro_entidad_id: entityBooks.find(entity => entity.cliente_id === client.id)?.id || null, provisional: false, asientos: [] });
  }
  const sum = (rows, field) => {
    const cents = rows.flatMap(entry => entry.lineas).reduce((total, line) => total + Math.round(line[field] * 100), 0);
    if (!Number.isSafeInteger(cents)) fail('El total del reporte supera la precision admitida.', 422);
    return cents / 100;
  };
  const sections = [...groups.values()].sort((a, b) => a.cliente_nombre.localeCompare(b.cliente_nombre) ||
    String(a.cliente_id).localeCompare(String(b.cliente_id))).map(group => ({ ...group,
    total_debe: sum(group.asientos, 'debe'), total_haber: sum(group.asientos, 'haber') }));
  const content = { libro_id: (scope.cliente_id && entityBooks.find(entity => entity.cliente_id === scope.cliente_id)?.id) || book.id,
    incorporacion_id: book.id, alcance: scope.cliente_id ? 'cliente' : 'cartera',
    periodo: scope.periodo || scope.anio, ...range, total_asientos: selected.length,
    total_debe: sum(selected, 'debe'), total_haber: sum(selected, 'haber'), secciones: sections };
  return { ...content, generado_at: generatedAt, fingerprint: hash(content) };
}

module.exports = { journalReport, validateJournalScope };
