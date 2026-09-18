const { test } = require('node:test');
const assert = require('node:assert/strict');
const { config, curate } = require('../scripts/benchmarkRunner');
const { summarizeCoverage } = require('./helpers/shadowCoverage');
const { validIdempotencyKey } = require('../services/documentIdempotency');

test('benchmark fixture uses valid distinct document keys and collects all six windows', async () => {
  const keys = new Set();
  let clients = 0;
  const report = await require('./helpers/journalBenchmark')({ documents: 12, check: () => {},
    request: async (url, options) => {
      if (url === '/api/auth/register') return { token: 'fixture-only' };
      if (url === '/api/clientes') return { id: `fixture-client-${++clients}` };
      if (url === '/api/transacciones') {
        const body = JSON.parse(options.body);
        assert(validIdempotencyKey(body.idempotencia), 'Benchmark must obey the API key contract');
        assert(!keys.has(body.idempotencia)); keys.add(body.idempotencia);
        return { id: `fixture-document-${keys.size}` };
      }
      assert(url.startsWith('/api/contabilidad/asientos?') || url.startsWith('/api/contabilidad/balance-comprobacion?'));
      return { data: Array.from({ length: keys.size }, () => ({})) };
    },
  });
  assert.equal(clients, 4); assert.equal(keys.size, 12);
  assert.equal(report.windows.length, 6); assert.equal(report.regression.n, 5);
  assert.equal(report.measured.count, 10);
});

test('runner enforces minimum repetitions and curated whitelist excludes secrets', () => {
  assert.equal(config({}).runs, 3);
  assert.throws(() => config({ CONTAPANAMA_BENCH_RUNS: '2' }));
  assert.throws(() => config({ CONTAPANAMA_JOURNAL_SYNC: 'unknown' }));
  const settings = { documents: 12, mode: 'shadow' };
  const report = { passed: true, env: 'SECRET', args: 'SECRET', error: 'SECRET',
    benchmark: { documents: 12, samples: Array.from({ length: 12 }, (_, i) => ({ document: i + 1, ms: i + 0.1, token: 'SECRET' })) } };
  const result = curate([report, report, report], settings);
  assert.equal(result.completed_runs, 3);
  assert.doesNotMatch(JSON.stringify(result), /SECRET|token|env|args/);
  assert.throws(() => curate([report, report], settings));
  assert.throws(() => curate([report, report, { ...report, passed: false }], settings));
});
test('coverage denominator and injected 4/3/2/2/1 case', () => {
  const compared = { eligible: true, compared: true, fell_back_to_full: false, divergence_detected: false, fallback_reason: null };
  const rows = [compared, { ...compared, divergence_detected: true },
    { eligible: false, compared: false, fell_back_to_full: true, divergence_detected: false, fallback_reason: 'no_touched_documents' },
    { eligible: true, compared: false, fell_back_to_full: true, divergence_detected: false, fallback_reason: 'incremental_probe_error' }];
  const r = summarizeCoverage(rows, { normal: false });
  assert.deepEqual([r.total, r.eligible, r.compared, r.fallback, r.divergences], [4, 3, 2, 2, 1]);
  assert.equal(r.coverage_denominator, 4); assert.equal(r.coverage_ratio, 0.5);
  assert.throws(() => summarizeCoverage(rows));
  assert.equal(summarizeCoverage([compared]).coverage_ratio, 1);
  assert.throws(() => summarizeCoverage([]));
  assert.throws(() => summarizeCoverage([{ ...compared, fell_back_to_full: true }]));
  assert.throws(() => summarizeCoverage([{ ...compared, eligible: false }]));
});
