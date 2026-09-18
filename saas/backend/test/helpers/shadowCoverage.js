const assert = require('node:assert/strict');

function summarizeCoverage(rows, { normal = true } = {}) {
  assert(rows.length > 0, 'Missing shadow coverage events');
  const result = { total: rows.length, eligible: 0, compared: 0, fallback: 0, divergences: 0,
    fallback_reasons: { no_touched_documents: 0, pending_outside_touched: 0, incremental_probe_error: 0 } };
  for (const row of rows) {
    for (const key of ['eligible', 'compared', 'fell_back_to_full', 'divergence_detected']) assert.equal(typeof row[key], 'boolean', `Invalid ${key}`);
    assert.notEqual(row.compared, row.fell_back_to_full, 'Each sync must be compared XOR fallback');
    assert(!row.compared || row.eligible, 'Compared must be eligible');
    assert(!row.divergence_detected || row.compared, 'Divergence must have been compared');
    result.eligible += Number(row.eligible);
    result.compared += Number(row.compared);
    result.fallback += Number(row.fell_back_to_full);
    result.divergences += Number(row.divergence_detected);
    if (row.fell_back_to_full) {
      assert(Object.hasOwn(result.fallback_reasons, row.fallback_reason), 'Unknown fallback reason');
      result.fallback_reasons[row.fallback_reason]++;
    } else assert.equal(row.fallback_reason, null);
  }
  assert.equal(result.total, result.compared + result.fallback);
  assert(result.eligible >= result.compared);
  if (normal) assert.equal(result.divergences, 0, 'Unexpected shadow divergence');
  return { ...result, coverage_denominator: result.total, coverage_numerator: result.compared,
    coverage_ratio: result.compared / result.total,
    eligible_coverage_denominator: result.eligible,
    eligible_coverage_ratio: result.eligible ? result.compared / result.eligible : null };
}

module.exports = { summarizeCoverage };
