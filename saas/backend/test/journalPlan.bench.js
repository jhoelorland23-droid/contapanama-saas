// Reproducible CPU benchmark for ADR-002: cost of replanning the whole book versus
// planning only the touched document, without a database. Run: node test/journalPlan.bench.js
const { journalPlan } = require('../services/journalLedger');
const { planIncremental } = require('../services/journalIncremental');
const { history } = require('./journalHistoryFixture');

const sizes = (process.env.CONTAPANAMA_PLAN_BENCH_STEPS || '250,1000,2500').split(',').map(Number);
const time = (fn, repeats = 10) => { const t = process.hrtime.bigint(); for (let i = 0; i < repeats; i++) fn(); return Number(process.hrtime.bigint() - t) / (repeats * 1e6); };
const rows = [];
for (const steps of sizes) {
  const { docs, book } = history(20260917, steps);
  const doc = docs.find(d => book.some(e => e.transaccion_id === d.id && !e.rectifica_id) && !d.pagos.length) || docs.at(-1);
  const changed = { ...doc, monto: doc.monto + 1, itbms: Number(((doc.monto + 1) * 0.07).toFixed(2)) };
  const sources = docs.map(d => d.id === doc.id ? changed : d);
  const own = book.filter(e => e.transaccion_id === doc.id);
  const reasons = { [doc.id]: 'benchmark' };
  const full = time(() => journalPlan(sources, book, { reasons }));
  const subset = time(() => planIncremental([changed], own, { reasons }));
  rows.push({ pasos: steps, documentos: docs.length, asientos: book.length, plan_completo_ms: Number(full.toFixed(2)),
    plan_incremental_ms: Number(subset.toFixed(3)), factor: Number((full / subset).toFixed(0)), us_por_asiento_completo: Number((full * 1000 / book.length).toFixed(1)) });
}
console.table(rows);
console.log(JSON.stringify({ generado: new Date().toISOString(), node: process.version, filas: rows }));
