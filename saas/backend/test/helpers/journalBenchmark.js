const assert = require('node:assert/strict');
const { summarize } = require('./benchmarkStatistics');

module.exports = async function journalBenchmark({ request, check, documents }) {
  assert(Number.isSafeInteger(documents) && documents >= 6, 'Benchmark needs at least six documents');
  const signup = await request('/api/auth/register', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nombre: 'QA rendimiento libro', email: 'qa-benchmark@example.com', password: process.env.CONTAPANAMA_QA_PASSWORD }) });
  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${signup.token}` };
  const send = (url, body) => request(url, { method: 'POST', headers, body: JSON.stringify(body) });
  const timed = async action => { const start = process.hrtime.bigint(); await action(); return Number(process.hrtime.bigint() - start) / 1e6; };
  const clients = [];
  for (let i = 0; i < 4; i++) clients.push(await send('/api/clientes', { nombre: `QA bench ${i}`, tipo: 'natural', ruc: `QA-BENCH-${i}` }));
  const boundaries = new Set(Array.from({ length: 6 }, (_, i) => Math.floor((i + 1) * documents / 6)));
  const samples = [], reads = [];
  for (let i = 0; i < documents; i++) {
    const ms = await timed(() => send('/api/transacciones', { cliente_id: clients[i % 4].id,
      fecha: `2090-${String(1 + i % 12).padStart(2, '0')}-15`, tipo: i % 3 ? 'ingreso' : 'gasto',
      descripcion: `QA bench ${i}`, monto: 100 + i, itbms: 7, tasa_itbms: 0.07,
      categoria_itbms: 'general', estado_pago: 'pendiente', idempotencia: `qa-benchmark-document-${String(i).padStart(6, '0')}` }));
    samples.push({ document: i + 1, ms });
    if (boundaries.has(i + 1)) reads.push({ document: i + 1,
      asientos_ms: await timed(() => request(`/api/contabilidad/asientos?anio=2090&cliente_id=${clients[0].id}`, { headers })),
      balance_ms: await timed(() => request('/api/contabilidad/balance-comprobacion?anio=2090', { headers })) });
  }
  assert.equal((await request('/api/contabilidad/asientos?anio=2090', { headers })).data.length, documents);
  const evidence = { benchmark_schema: 1, documents, fixture: 'deterministic-v1-four-clients-2090',
    ...summarize(samples), samples, reads };
  check(`benchmark: ${documents} documents, warmup excluded OLS`, evidence);
  return evidence;
};
