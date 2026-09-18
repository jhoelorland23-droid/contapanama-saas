# QA and Benchmark Helpers

Run only the lightweight helper tests from `saas/backend`:

```powershell
node --test test/benchmarkStatistics.test.js test/processHarness.test.js test/benchmarkRunner.test.js
```

After coordination, explicitly launch the benchmark (not part of ordinary QA):

```powershell
$env:CONTAPANAMA_JOURNAL_SYNC='incremental'
$env:CONTAPANAMA_BENCH_RUNS='3'
$env:CONTAPANAMA_PG_BENCH='300'
node scripts/benchmarkRunner.js
```

Requires `CONTAPANAMA_PG_BIN` pointing to PostgreSQL binaries. Each sequential run
creates a fresh disposable cluster, migrates it, runs the same synthetic fixture,
and stops/removes that cluster. No local-data contents are read; only an `lstat`
metadata comparison is made, which is not a content-integrity fingerprint.

Raw logs and reports go under a unique `saas/outputs/benchmark-*` directory.
`benchmark-curated.json` contains only allowlisted numeric measurements and fixed
methodology text. The final evidence owner can incorporate that object into
`saas/docs/evidence/ledger-premerge-2026-09-17.json`; this runner never overwrites
that shared artifact. No timings are fabricated before the coordinated runs.

Six disjoint windows retain every observation, including an uneven final window.
Window one is excluded from OLS and pooled p50/p95/p99. OLS uses unrounded window
medians against document-count midpoints, with R2 and Student-t slope CI95 (n-2
df). Constant response has undefined R2 (`null`). Between-run mean slope CI95 uses
n-1 df. The growth estimate is max(0, mean), passing only when less than 0.05
ms/document; the confidence-upper-bound decision is reported separately. These
CIs are descriptive: sequential residuals may be autocorrelated and three runs
provide limited evidence. Negative slopes are not claimed as speedups.

## Process API

`startService({ command, args, options, probe, onChild, onOutput, timeoutMs,
attempts, probeTimeoutMs, intervalMs })` returns a ready ChildProcess. `probe`
receives an AbortSignal and must honor it; return true only after validating the
expected health payload. Failed startup attempts stop the owned child before a
retry. Only startup is retried; no test suite or application write is replayed.
`onOutput(text, stream)` receives stdout/stderr throughout the child's lifetime,
including failed attempts. `onChild(child)` enables cleanup before readiness.
`stop(child)` gracefully terminates, then escalates after two seconds.

`runCaptured(command, args, options)` waits for pipe close, returns code, stdout,
stderr, combined output, timedOut and error. Optional `onOutput` enables durable
streaming logs. `ipc: true` and `onChild` support the browser restart protocol.
Only pg_ctl uses `inheritedPipeGraceMs: 1000`, since its daemon may inherit pipes.

Harness environment settings (positive integer milliseconds unless noted):

| Setting | Default |
| --- | --- |
| CONTAPANAMA_QA_STARTUP_TIMEOUT_MS | 60000 per attempt |
| CONTAPANAMA_QA_STARTUP_ATTEMPTS | 3 attempts |
| CONTAPANAMA_QA_PROBE_TIMEOUT_MS | 5000, bounded by remaining attempt time |
| CONTAPANAMA_QA_CHILD_TIMEOUT_MS | 90000 commands / 600000 browser |
| CONTAPANAMA_QA_TIMEOUT_MS | suite-specific (PostgreSQL/browser: 900000) |
| CONTAPANAMA_BENCH_TIMEOUT_MS | 1800000 per fresh-cluster run |

When increasing startup budgets, increase enclosing child/suite deadlines too.
The SQL health probe requires HTTP success, the expected database, and test env.
Shadow coverage counts committed sync audit events, not requests or owners; its
denominator is total normal-owner coverage events at the existing summary point.
