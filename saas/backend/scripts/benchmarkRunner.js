// Explicit opt-in only; never launched by the ordinary QA suite.
const fs = require('node:fs');
const path = require('node:path');
const { runCaptured, positiveInteger } = require('../test/helpers/processHarness');
const { summarize, summarizeSlopes } = require('../test/helpers/benchmarkStatistics');
const backend = path.resolve(__dirname, '..');

function config(env) {
  const runs = positiveInteger(env.CONTAPANAMA_BENCH_RUNS, 3, 'CONTAPANAMA_BENCH_RUNS');
  const documents = positiveInteger(env.CONTAPANAMA_PG_BENCH, 300, 'CONTAPANAMA_PG_BENCH');
  if (runs < 3 || documents < 6) throw new Error('Require at least 3 runs and 6 documents');
  const mode = env.CONTAPANAMA_JOURNAL_SYNC || 'incremental';
  if (!['full', 'incremental', 'shadow'].includes(mode)) throw new Error('Invalid sync mode');
  return { runs, documents, mode };
}

// Whitelist numbers and recompute statistics: raw reports may contain logs or secrets.
function curate(reports, settings) {
  settings = config({ CONTAPANAMA_BENCH_RUNS: String(reports.length), CONTAPANAMA_PG_BENCH: String(settings.documents), CONTAPANAMA_JOURNAL_SYNC: settings.mode });
  if (reports.length < 3) throw new Error('Require at least 3 successful runs');
  const runs = reports.map((report, index) => {
    if (report.passed !== true || report.benchmark?.documents !== settings.documents) throw new Error('Incomplete benchmark report');
    const samples = report.benchmark.samples.map(s => ({ document: s.document, ms: s.ms }));
    if (samples.length !== settings.documents || !samples.every((s, i) => s.document === i + 1)) throw new Error('Invalid sample sequence');
    return { run: index + 1, ...summarize(samples) };
  });
  return { schema: 1, mode: settings.mode, documents: settings.documents, completed_runs: runs.length,
    fixture: 'deterministic-v1-four-clients-2090', runs,
    across_runs: summarizeSlopes(runs.map(r => r.regression.slope_ms_per_document)),
    caveat: 'Per-run CI assumes independent homoskedastic window residuals; sequential timings may be autocorrelated. No pooled independence claim.' };
}

async function main() {
  const settings = config(process.env);
  const root = path.resolve(backend, '../outputs');
  fs.mkdirSync(root, { recursive: true });
  const output = fs.mkdtempSync(path.join(root, 'benchmark-'));
  console.log(`Benchmark logs: ${output}`);
  const reports = [];
  for (let index = 0; index < settings.runs; index++) {
    const dir = path.join(output, `run-${index + 1}`);
    fs.mkdirSync(dir);
    const result = await runCaptured(process.execPath, ['test/postgresIntegration.test.js'], {
      cwd: backend, env: { ...process.env, CONTAPANAMA_PG_BENCH: String(settings.documents),
        CONTAPANAMA_JOURNAL_SYNC: settings.mode, CONTAPANAMA_PG_BENCH_ONLY: '1',
        CONTAPANAMA_POSTGRES_BROWSER: '0', CONTAPANAMA_POSTGRES_QA_OUTPUT: dir },
      timeoutMs: positiveInteger(process.env.CONTAPANAMA_BENCH_TIMEOUT_MS, 1800000, 'CONTAPANAMA_BENCH_TIMEOUT_MS'),
      onOutput: (text, stream) => fs.appendFileSync(path.join(dir, `${stream}.log`), text),
    });
    if (result.code !== 0) throw new Error(`Benchmark run ${index + 1} failed; inspect ${dir}`);
    reports.push(JSON.parse(fs.readFileSync(path.join(dir, 'results.json'), 'utf8')));
  }
  const curated = curate(reports, settings);
  fs.writeFileSync(path.join(output, 'benchmark-curated.json'), JSON.stringify(curated, null, 2));
  console.log(`Curated benchmark: ${path.join(output, 'benchmark-curated.json')}`);
}

if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { config, curate };
