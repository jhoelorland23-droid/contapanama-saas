function dateKey(value) {
  const text = value instanceof Date ? value.toISOString().slice(0, 10) : String(value || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return '';
  const date = new Date(`${text}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === text ? text : '';
}

function periodRange({ periodo, anio, desde, hasta } = {}) {
  const starts = [dateKey(desde)].filter(Boolean);
  const ends = [dateKey(hasta)].filter(Boolean);
  if (periodo) {
    const first = dateKey(`${periodo}-01`);
    if (!first) throw new Error('Periodo contable invalido');
    const last = new Date(`${first}T00:00:00Z`);
    last.setUTCMonth(last.getUTCMonth() + 1, 0);
    starts.push(first);
    ends.push(dateKey(last));
  }
  if (anio) {
    if (!/^\d{4}$/.test(String(anio))) throw new Error('Anio contable invalido');
    starts.push(`${anio}-01-01`);
    ends.push(`${anio}-12-31`);
  }
  return { desde: starts.sort().at(-1) || null, hasta: ends.sort()[0] || null };
}

const inRange = (date, range) => Boolean(date) && (!range.desde || date >= range.desde) && (!range.hasta || date <= range.hasta);
const cutoffDate = scope => dateKey(scope?.fechaCorte || scope?.fecha_corte) || periodRange(scope).hasta || new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Panama', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

// Retrieve prior documents too; journal movements are filtered only after posting.
const historyParams = (scope = {}) => ({
  cliente_id: scope.cliente_id || scope.clienteId || null,
  hasta: scope.fecha_corte || scope.fechaCorte ? cutoffDate(scope) : periodRange(scope).hasta,
});

function formalClosingScope(params = {}) {
  if ((params.periodo && params.anio) || ['desde', 'hasta', 'fecha_corte', 'fechaCorte'].some(key => params[key] !== undefined)) {
    throw Object.assign(new Error('El cierre requiere un mes o anio completo, sin filtros parciales de fecha.'), { status: 422 });
  }
  return params.anio ? { anio: String(params.anio), cliente_id: params.cliente_id || null } :
    { periodo: params.periodo || cutoffDate({}).slice(0, 7), cliente_id: params.cliente_id || null };
}

function validatePeriodQuery(req, res, next) {
  const q = req.query;
  if ((q.periodo !== undefined && !/^\d{4}-(0[1-9]|1[0-2])$/.test(q.periodo)) ||
      (q.anio !== undefined && !/^\d{4}$/.test(q.anio))) return res.status(422).json({ error: 'Periodo o anio contable invalido.' });
  for (const field of ['desde', 'hasta', 'fecha_corte']) {
    if (q[field] !== undefined && (typeof q[field] !== 'string' || dateKey(q[field]) !== q[field])) return res.status(422).json({ error: `Fecha ${field} invalida.` });
  }
  if (q.desde && q.hasta && q.desde > q.hasta) return res.status(422).json({ error: 'La fecha inicial no puede ser posterior a la final.' });
  next();
}
module.exports = { dateKey, periodRange, inRange, cutoffDate, historyParams, validatePeriodQuery, formalClosingScope };
