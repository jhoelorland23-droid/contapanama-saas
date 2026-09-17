const assert = require('node:assert/strict');
const { test } = require('node:test');
const { journalPlan, verifyEntry, hash } = require('../services/journalLedger');
const { affectedKeys, planIncremental, referencePlan } = require('../services/journalIncremental');

// Contract a future incremental sync (ADR-002) must honour. Today `planIncremental`
// delegates to the full algorithm on a subset; these tests are the oracle that any
// O(k) replacement has to keep green. Histories are generated from a fixed seed so a
// failure is reproducible: rerun with the same seed and iteration number.

const SEED = Number(process.env.CONTAPANAMA_CONTRACT_SEED || 20260917);
const ROUNDS = Number(process.env.CONTAPANAMA_CONTRACT_ROUNDS || 120);
const { rng, numbered, normalize, mutate, history } = require('./journalHistoryFixture');

test('incremental plan of the touched documents equals the full plan restricted to them (seeded histories)', () => {
  for (let round = 0; round < ROUNDS; round++) {
    const seed = SEED + round;
    const random = rng(seed);
    const docs = [];
    let book = [];
    for (let step = 0; step < 25; step++) {
      const touched = mutate(random, docs, step);
      const ids = new Set(touched);
      const reasons = Object.fromEntries(touched.map(id => [id, `correccion ${step}`]));
      const subsetDocs = docs.filter(doc => ids.has(doc.id));
      const subsetBook = book.filter(entry => ids.has(entry.transaccion_id));
      const incremental = planIncremental(subsetDocs, subsetBook, { reasons });
      const reference = referencePlan(docs, book, touched, { reasons });
      assert.deepEqual(normalize(incremental, subsetBook), normalize(reference, book), `seed ${seed} step ${step}: incremental plan differs from full plan`);
      const full = journalPlan(docs, book, { reasons });
      assert.equal(full.length, reference.length, `seed ${seed} step ${step}: the full plan touched documents outside the affected set`);
      book = [...book, ...numbered(full, book.length)];
    }
  }
});

test('every pending entry of a full plan belongs to a document whose keys the incremental set would cover', () => {
  const { docs, book, log } = history(SEED, 60);
  for (const { touched, plan } of log) {
    const keys = new Set(docs.filter(doc => touched.includes(doc.id)).flatMap(doc => [...affectedKeys(doc)]));
    for (const entry of plan) {
      const key = entry.rectifica_id ? book.find(e => e.id === entry.rectifica_id)?.origen_clave || entry.origen_clave.replace(/^rectifica-.*/, null) : entry.origen_clave;
      assert(touched.includes(entry.transaccion_id), `entry ${entry.origen_clave} was planned for an untouched document`);
      if (!entry.rectifica_id) assert(keys.has(key), `key ${key} is not derivable from the touched document`);
    }
  }
  assert.deepEqual(journalPlan(docs, book), [], 'a fully applied history has nothing pending');
});

test('applying a plan is idempotent and numbering, versions and reversals stay continuous', () => {
  const { docs, book } = history(SEED + 1000, 80);
  assert.deepEqual(book.map(e => e.numero), book.map((_, i) => i + 1));
  const byKey = new Map();
  for (const entry of book.filter(e => !e.rectifica_id)) {
    const versions = byKey.get(entry.origen_clave) || [];
    versions.push(entry.revision); byKey.set(entry.origen_clave, versions);
  }
  for (const [key, versions] of byKey) assert.deepEqual(versions, versions.map((_, i) => i + 1), `versions of ${key} are not continuous`);
  const reversed = book.filter(e => e.rectifica_id).map(e => e.rectifica_id);
  assert.equal(new Set(reversed).size, reversed.length, 'an original was reversed twice');
  for (const reversal of book.filter(e => e.rectifica_id)) {
    const original = book.find(e => e.id === reversal.rectifica_id);
    assert.deepEqual(reversal.lineas.map(l => [l.cuenta_codigo, l.debe, l.haber]), original.lineas.map(l => [l.cuenta_codigo, l.haber, l.debe]));
  }
  book.forEach(verifyEntry);
  assert.deepEqual(journalPlan(docs, book), []);
});

test('the incremental plan must still reject a tampered entry of a touched document and foreign entries', () => {
  const { docs, book } = history(SEED + 2000, 30);
  const doc = docs.find(d => book.some(e => e.transaccion_id === d.id && !e.rectifica_id));
  const own = book.filter(e => e.transaccion_id === doc.id).map(e => structuredClone(e));
  own[0].lineas[0].debe = own[0].lineas[0].debe + 1;
  assert.throws(() => planIncremental([doc], own), /balanceado|integridad/);
  const other = book.find(e => e.transaccion_id !== doc.id);
  assert.throws(() => planIncremental([doc], [other]), /no pertenece/);
});

test('subset planning is unaffected by the size of the rest of the book (cost stays O(k))', () => {
  const { docs, book } = history(SEED + 3000, 400);
  const doc = docs.at(-1);
  const own = book.filter(e => e.transaccion_id === doc.id);
  const changed = { ...doc, monto: doc.monto + 1, itbms: Number(((doc.monto + 1) * 0.07).toFixed(2)), pagos: [] };
  const time = fn => { const t = process.hrtime.bigint(); for (let i = 0; i < 20; i++) fn(); return Number(process.hrtime.bigint() - t) / 20e6; };
  const subset = time(() => planIncremental([changed], own, { reasons: { [doc.id]: 'QA' } }));
  const full = time(() => journalPlan(docs.map(d => d.id === doc.id ? changed : d), book, { reasons: { [doc.id]: 'QA' } }));
  console.log(`book of ${book.length} entries: full plan ${full.toFixed(2)} ms, subset plan ${subset.toFixed(3)} ms`);
  assert(subset * 5 < full, 'planning the touched document must be far cheaper than replanning the whole book');
  assert.equal(hash(normalize(planIncremental([changed], own, { reasons: { [doc.id]: 'QA' } }), own)),
    hash(normalize(referencePlan(docs.map(d => d.id === doc.id ? changed : d), book, [doc.id], { reasons: { [doc.id]: 'QA' } }), book)));
});
