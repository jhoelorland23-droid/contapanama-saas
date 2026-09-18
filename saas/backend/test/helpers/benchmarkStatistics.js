const assert = require('node:assert/strict');

function percentile(values, probability) {
  assert(values.length && values.every(Number.isFinite), 'Expected finite samples');
  assert(probability >= 0 && probability <= 1, 'Invalid percentile');
  const sorted = [...values].sort((a, b) => a - b);
  const index = (sorted.length - 1) * probability;
  const low = Math.floor(index), high = Math.ceil(index);
  return sorted[low] + (sorted[high] - sorted[low]) * (index - low);
}

function latencies(values) {
  return { count: values.length, p50_ms: percentile(values, 0.5),
    p95_ms: percentile(values, 0.95), p99_ms: percentile(values, 0.99) };
}

// Integrate the Student-t density after t = sqrt(df) * tan(theta).
// Normalization cancels, avoiding a dependency on a gamma-function library.
function tCritical95(df) {
  assert(Number.isInteger(df) && df > 0);
  const integrate = limit => {
    const n = 1024, step = limit / n;
    let sum = 0;
    for (let i = 0; i <= n; i++) {
      sum += (i === 0 || i === n ? 1 : i % 2 ? 4 : 2) * Math.cos(i * step) ** (df - 1);
    }
    return sum * step / 3;
  };
  const target = integrate(Math.PI / 2) * 0.95;
  let low = 0, high = Math.PI / 2;
  for (let i = 0; i < 50; i++) {
    const mid = (low + high) / 2;
    if (integrate(mid) < target) low = mid; else high = mid;
  }
  return Math.sqrt(df) * Math.tan((low + high) / 2);
}

function ols(points) {
  assert(points.length >= 3, 'OLS CI needs at least three measured windows');
  assert(points.every(({ x, y }) => Number.isFinite(x) && Number.isFinite(y)));
  const n = points.length;
  const xMean = points.reduce((sum, p) => sum + p.x, 0) / n;
  const yMean = points.reduce((sum, p) => sum + p.y, 0) / n;
  const sxx = points.reduce((sum, p) => sum + (p.x - xMean) ** 2, 0);
  assert(sxx > 0, 'OLS requires varying document counts');
  const slope = points.reduce((sum, p) => sum + (p.x - xMean) * (p.y - yMean), 0) / sxx;
  const intercept = yMean - slope * xMean;
  const sse = points.reduce((sum, p) => sum + (p.y - intercept - slope * p.x) ** 2, 0);
  const sst = points.reduce((sum, p) => sum + (p.y - yMean) ** 2, 0);
  const se = Math.sqrt(sse / (n - 2) / sxx);
  const margin = tCritical95(n - 2) * se;
  return { n, df: n - 2, slope_ms_per_document: slope, intercept_ms: intercept,
    r2: sst === 0 ? null : Math.max(0, Math.min(1, 1 - sse / sst)),
    slope_standard_error: se, slope_ci95: [slope - margin, slope + margin],
    ci_method: 'two-sided Student-t; independent homoskedastic window residuals assumed' };
}

function summarize(samples, windowCount = 6) {
  assert(Number.isInteger(windowCount) && windowCount >= 4);
  assert(samples.length >= windowCount, 'Need at least one sample per window');
  assert(samples.every(s => Number.isFinite(s.ms) && s.ms >= 0 && Number.isFinite(s.document)));
  assert(samples.every((s, i) => !i || s.document > samples[i - 1].document));
  const windows = Array.from({ length: windowCount }, (_, slot) => {
    const rows = samples.slice(Math.floor(slot * samples.length / windowCount), Math.floor((slot + 1) * samples.length / windowCount));
    return { warmup: slot === 0, first_document: rows[0].document, last_document: rows.at(-1).document,
      midpoint_document: (rows[0].document + rows.at(-1).document) / 2, ...latencies(rows.map(s => s.ms)) };
  });
  const measured = samples.slice(windows[0].count);
  return { method: 'OLS of unrounded window p50 on document midpoint; first window excluded',
    percentile_method: 'linear interpolation (R type 7)', windows,
    measured: latencies(measured.map(s => s.ms)),
    regression: ols(windows.slice(1).map(w => ({ x: w.midpoint_document, y: w.p50_ms }))) };
}

function summarizeSlopes(slopes, threshold = 0.05) {
  assert(slopes.length >= 3 && slopes.every(Number.isFinite));
  const mean = slopes.reduce((sum, value) => sum + value, 0) / slopes.length;
  const variance = slopes.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (slopes.length - 1);
  const margin = tCritical95(slopes.length - 1) * Math.sqrt(variance / slopes.length);
  const growth = Math.max(0, mean);
  return { runs: slopes.length, df: slopes.length - 1, mean_slope_ms_per_document: mean,
    between_run_slope_ci95: [mean - margin, mean + margin],
    conservative_growth_ms_per_document: growth, threshold_ms_per_document: threshold,
    pass_point_estimate: growth < threshold,
    pass_confidence_upper_bound: Math.max(0, mean + margin) < threshold,
    interpretation: mean <= 0 ? 'no positive growth detected' : 'positive growth estimated',
    ci_method: 'two-sided Student-t of independent fresh-cluster run slopes' };
}

module.exports = { percentile, latencies, tCritical95, ols, summarize, summarizeSlopes };
