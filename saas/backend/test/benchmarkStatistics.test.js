const { test } = require('node:test');
const assert = require('node:assert/strict');
const { percentile, tCritical95, ols, summarize, summarizeSlopes } = require('./helpers/benchmarkStatistics');

test('type 7 percentiles interpolate without mutating samples', () => {
  const values = [100, 0];
  assert.equal(percentile(values, 0.5), 50);
  assert.equal(percentile(values, 0.95), 95);
  assert.equal(percentile(values, 0.99), 99);
  assert.deepEqual(values, [100, 0]);
  assert.throws(() => percentile([], 0.5));
  assert.throws(() => percentile([NaN], 0.5));
});
test('Student-t critical values and independently calculated noisy OLS', () => {
  assert(Math.abs(tCritical95(1) - 12.706204736) < 1e-7);
  assert(Math.abs(tCritical95(3) - 3.182446305) < 1e-7);
  assert(Math.abs(tCritical95(30) - 2.042272456) < 1e-7);
  const result = ols([1, 2, 3, 4, 5].map((x, i) => ({ x, y: [2, 4, 5, 4, 5][i] })));
  assert(Math.abs(result.slope_ms_per_document - 0.6) < 1e-12);
  assert(Math.abs(result.r2 - 0.6) < 1e-12);
  assert(Math.abs(result.slope_ci95[0] - (0.6 - 3.182446305 * Math.sqrt(0.08))) < 1e-8);
});
test('first window excluded from OLS and aggregate latency, uneven windows retain all points', () => {
  const samples = Array.from({ length: 61 }, (_, i) => ({ document: i + 1, ms: i < 10 ? 10000 : 2 * (i + 1) + 0.123 }));
  const result = summarize(samples);
  assert.equal(result.measured.count, 51);
  assert.equal(result.windows.reduce((n, w) => n + w.count, 0), 61);
  assert.equal(result.regression.n, 5);
  assert(Math.abs(result.regression.slope_ms_per_document - 2) < 1e-12);
  assert(Math.abs(result.regression.intercept_ms - 0.123) < 1e-12);
  assert.equal(result.regression.r2, 1);
  assert.throws(() => summarize(samples.slice(0, 5)));
});
test('constant response and degenerate predictors are explicit', () => {
  const result = ols([1, 2, 3].map(x => ({ x, y: 5 })));
  assert.equal(result.r2, null);
  assert.deepEqual(result.slope_ci95, [0, 0]);
  assert.throws(() => ols([1, 2, 3].map(y => ({ x: 1, y }))));
});
test('between-run mean CI uses n-1 df; negative means never claim speedup', () => {
  const r = summarizeSlopes([-0.02, 0, 0.02]);
  assert.equal(r.mean_slope_ms_per_document, 0);
  assert.equal(r.df, 2);
  assert(Math.abs(r.between_run_slope_ci95[1] - 4.30265273 * 0.02 / Math.sqrt(3)) < 1e-8);
  assert.equal(r.pass_point_estimate, true);
  const negative = summarizeSlopes([-0.3, -0.2, -0.1]);
  assert.equal(negative.conservative_growth_ms_per_document, 0);
  assert.equal(negative.interpretation, 'no positive growth detected');
  assert.equal(summarizeSlopes([0.05, 0.05, 0.05]).pass_point_estimate, false);
  const uncertain = summarizeSlopes([-0.2, 0, 0.2]);
  assert.equal(uncertain.pass_point_estimate, true);
  assert.equal(uncertain.pass_confidence_upper_bound, false);
});
