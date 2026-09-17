const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');

// Measures how document creation and book reads scale with the owner's history.
// Every write replans the whole book (see journalRepository.syncJournal), so the
// interesting number is the slope, not the absolute latency of this machine.
const percentile = (values, p) => [...values].sort((a, b) => a - b)[Math.min(values.length - 1, Math.floor(values.length * p))];
const stats = values => ({ p50: percentile(values, 0.5), p90: percentile(values, 0.9), max: Math.max(...values) });

module.exports = async function journalBenchScenario({ request, check, documents }) {
  const signup = await request('/api/auth/register', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nombre: 'QA rendimiento libro', email: `qa-bench-${randomUUID()}@example.com`, password: process.env.CONTAPANAMA_QA_PASSWORD }) });
  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${signup.token}` };
  const send = (method, url, body) => request(url, { method, headers, body: JSON.stringify(body) });
  const timed = async action => { const started = process.hrtime.bigint(); const value = await action(); return { value, ms: Number(process.hrtime.bigint() - started) / 1e6 }; };
  const clients = [];
  for (let index = 0; index < 4; index++) clients.push(await send('POST', '/api/clientes', { nombre: `QA bench ${index}`, tipo: 'natural', ruc: `QA-BENCH-${index}` }));
  const windows = new Map();
  const window = index => Math.floor(index / Math.max(1, Math.round(documents / 6)));
  const readTimes = [];
  for (let index = 0; index < documents; index++) {
    const month = String(1 + (index % 12)).padStart(2, '0');
    const { ms } = await timed(() => send('POST', '/api/transacciones', { cliente_id: clients[index % clients.length].id,
      fecha: `2090-${month}-15`, tipo: index % 3 ? 'ingreso' : 'gasto', descripcion: `QA bench ${index}`, monto: 100 + index,
      itbms: 7, tasa_itbms: 0.07, categoria_itbms: 'general', estado_pago: 'pendiente', idempotencia: randomUUID() }));
    if (!windows.has(window(index))) windows.set(window(index), []);
    windows.get(window(index)).push(ms);
    if ((index + 1) % Math.max(1, Math.round(documents / 6)) === 0 || index === documents - 1) {
      const read = await timed(() => request(`/api/contabilidad/asientos?anio=2090&cliente_id=${clients[0].id}`, { headers }));
      const balance = await timed(() => request('/api/contabilidad/balance-comprobacion?anio=2090', { headers }));
      readTimes.push({ documentos: index + 1, asientos_ms: Math.round(read.ms), balance_ms: Math.round(balance.ms) });
    }
  }
  const series = [...windows.entries()].map(([slot, values]) => ({ desde: slot * Math.round(documents / 6) + 1, ...stats(values) }))
    .map(row => ({ desde: row.desde, p50_ms: Math.round(row.p50), p90_ms: Math.round(row.p90), max_ms: Math.round(row.max) }));
  const first = series[0], last = series.at(-1);
  const evidence = { documentos: documents, escritura_por_ventana: series, lecturas: readTimes,
    pendiente_ms_por_documento: Number(((last.p50_ms - first.p50_ms) / Math.max(1, last.desde - first.desde)).toFixed(3)) };
  console.log(JSON.stringify(evidence, null, 2));
  assert.equal((await request(`/api/contabilidad/asientos?anio=2090`, { headers })).data.length, documents);
  check(`write latency measured over ${documents} documents: first window p50 ${first.p50_ms} ms, last window p50 ${last.p50_ms} ms`, evidence);
  return evidence;
};
