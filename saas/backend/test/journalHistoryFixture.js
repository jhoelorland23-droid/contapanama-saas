const { journalPlan } = require('../services/journalLedger');

// Seeded random accounting histories shared by the contract tests and the benchmark.
function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
const pick = (random, list) => list[Math.floor(random() * list.length)];
const day = (random, year) => `${year}-${String(1 + Math.floor(random() * 12)).padStart(2, '0')}-${String(1 + Math.floor(random() * 28)).padStart(2, '0')}`;
const numbered = (entries, from = 0) => entries.map((e, i) => ({ ...e, numero: from + i + 1 }));
const comparable = entry => ({ origen_clave: entry.origen_clave, revision: entry.revision, rectifica: entry.rectifica_id, fecha: entry.fecha,
  tipo_asiento: entry.tipo_asiento, transaccion_id: entry.transaccion_id, cliente_id: entry.cliente_id, lineas: entry.lineas, hash: entry.contenido_hash });
// Reversal ids are random per plan; compare them through the reversed entry's key instead.
const normalize = (plan, existing) => plan.map(entry => ({ ...comparable(entry),
  rectifica: entry.rectifica_id ? existing.find(e => e.id === entry.rectifica_id)?.origen_clave : null,
  origen_clave: entry.rectifica_id ? `rectifica:${existing.find(e => e.id === entry.rectifica_id)?.origen_clave}` : entry.origen_clave }));

function makeDocument(random, index) {
  const tipo = random() < 0.6 ? 'ingreso' : 'gasto';
  const monto = 10 + Math.floor(random() * 5000);
  return { id: `doc-${index}`, cliente_id: pick(random, ['c1', 'c2', 'c3', null]), cliente_nombre: 'QA', fecha: day(random, 2040),
    periodo: null, descripcion: `Documento ${index}`, tipo, categoria_contable: pick(random, ['honorarios', 'ventas_servicios', 'alquiler', 'gastos_operativos']),
    monto, itbms: Number((monto * 0.07).toFixed(2)), deducible: random() < 0.5, estado_pago: 'pendiente', pagos: [] };
}

// One random mutation of the source documents, as the API would apply it.
function mutate(random, docs, step) {
  const action = random();
  if (action < 0.35 || !docs.length) { const doc = makeDocument(random, docs.length); docs.push(doc); return [doc.id]; }
  const doc = pick(random, docs);
  if (action < 0.6) {
    const cents = value => Math.round(Number(value) * 100);
    const paid = doc.pagos.filter(p => !p.anulado_fecha).reduce((sum, p) => sum + cents(p.importe), 0);
    const total = cents(doc.monto) + cents(doc.itbms);
    if (paid >= total) return [];
    const importe = (random() < 0.5 ? total - paid : Math.max(1, Math.floor((total - paid) / 2))) / 100;
    doc.pagos.push({ id: `pago-${doc.id}-${step}`, transaccion_id: doc.id, importe, fecha: day(random, 2041), metodo_pago: pick(random, ['efectivo', 'transferencia']),
      banco: 'Banco General', conciliado: false, anulado_fecha: null });
    return [doc.id];
  }
  if (action < 0.75 && doc.pagos.some(p => !p.anulado_fecha)) {
    const payment = pick(random, doc.pagos.filter(p => !p.anulado_fecha));
    payment.anulado_fecha = day(random, 2042); payment.anulado_motivo = 'QA';
    return [doc.id];
  }
  if (action < 0.85) { doc.notas = `nota ${step}`; return [doc.id]; }
  if (doc.pagos.length) return [];
  doc.monto = 10 + Math.floor(random() * 5000); doc.itbms = Number((doc.monto * 0.07).toFixed(2));
  if (random() < 0.3) doc.fecha = day(random, 2040);
  return [doc.id];
}

function history(seed, steps) {
  const random = rng(seed);
  const docs = [];
  let book = [];
  const log = [];
  for (let step = 0; step < steps; step++) {
    const touched = mutate(random, docs, step);
    const reasons = Object.fromEntries(touched.map(id => [id, `correccion ${step}`]));
    const plan = journalPlan(docs, book, { reasons });
    log.push({ step, touched, plan });
    book = [...book, ...numbered(plan, book.length)];
  }
  return { docs, book, log };
}


module.exports = { rng, pick, day, numbered, normalize, makeDocument, mutate, history };
