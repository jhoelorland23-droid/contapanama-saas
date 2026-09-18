#!/usr/bin/env node
// Single QA entry point: runs every suite and reports PASS / FAIL / SKIPPED without
// hiding anything. A suite is SKIPPED only when a documented prerequisite is missing
// (and the reason is printed); it is never skipped because it fails.
//
//   npm run qa                 everything available on this machine
//   npm run qa -- --only=unit,postgres
//   npm run qa -- --skip=postgres,frontend-build
//   CONTAPANAMA_QA_LOG_DIR=<dir> keeps the full log of every suite
const { runCaptured, positiveInteger } = require('../test/helpers/processHarness');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const backend = path.resolve(__dirname, '..');
const frontend = path.resolve(backend, '..', 'frontend');
const args = Object.fromEntries(process.argv.slice(2).map(arg => { const [key, value = 'true'] = arg.replace(/^--/, '').split('='); return [key, value]; }));
const only = args.only ? new Set(args.only.split(',')) : null;
const skip = new Set((args.skip || '').split(',').filter(Boolean));
const pgBin = process.env.CONTAPANAMA_PG_BIN;
const exe = name => pgBin && path.join(pgBin, `${name}${process.platform === 'win32' ? '.exe' : ''}`);
const nodeTest = files => [process.execPath, ['--test', ...files]];
const nodeRun = file => [process.execPath, [file]];

const suites = [
  { id: 'unit-harness', group: 'unit', cwd: backend, run: nodeTest(['test/benchmarkStatistics.test.js', 'test/processHarness.test.js', 'test/benchmarkRunner.test.js', 'test/securityConfiguration.test.js', 'test/demoCredentials.test.js', 'test/credentialScanner.test.js', 'test/harnessStartupTiming.test.js']) },
  { id: 'unit-journal', group: 'ledger', cwd: backend, run: nodeTest(['test/journalLedger.test.js', 'test/journalReport.test.js', 'test/ledgerConsistency.test.js']) },
  { id: 'unit-sync-contract', group: 'ledger', cwd: backend, run: nodeTest(['test/journalSyncContract.test.js', 'test/journalShadow.test.js']) },
  { id: 'unit-corrections', group: 'ledger', cwd: backend, run: nodeTest(['test/documentCorrection.test.js', 'test/entityBooks.test.js']) },
  { id: 'unit-local-store', group: 'unit', cwd: backend, run: nodeTest(['test/localStateStore.test.js']) },
  { id: 'unit-local-import', group: 'unit', cwd: backend, run: nodeTest(['test/importLocalState.test.js']) },
  { id: 'unit-bank', group: 'unit', cwd: backend, run: nodeTest(['test/bankAccount.test.js', 'test/bankEvidence.test.js', 'test/bankPosting.test.js',
    'test/bankReconciliation.test.js', 'test/bankStatement.test.js', 'test/bankSubledger.test.js']) },
  { id: 'payments', group: 'payments', cwd: backend, run: nodeRun('test/paymentLedger.test.js') },
  { id: 'accounting', group: 'accounting', cwd: backend, run: [process.execPath, ['test/accountingEngine.test.js']] },
  { id: 'accounting-periods', group: 'accounting', cwd: backend, run: nodeRun('test/accountingPeriods.test.js') },
  { id: 'accounting-pdf', group: 'accounting', cwd: backend, run: nodeRun('test/accountingPdf.test.js') },
  { id: 'journal-pdf-layout', group: 'ledger', cwd: backend, run: nodeRun('test/journalPdfLayout.test.js'),
    requires: () => pythonWithPypdf() || 'Python con pypdf (CONTAPANAMA_PYTHON) no disponible' },
  { id: 'auth-security', group: 'security', cwd: backend, run: nodeRun('test/authSecurity.test.js') },
  { id: 'env-validation', group: 'security', cwd: backend, run: nodeRun('test/envValidation.test.js') },
  { id: 'fiscal', group: 'fiscal', cwd: backend, run: nodeRun('test/fiscalEngine.test.js') },
  { id: 'schema-contract', group: 'schema', cwd: backend, run: nodeRun('test/schemaContract.test.js') },
  { id: 'integration-local', group: 'integration', cwd: backend, run: nodeRun('test/integrationLocal.test.js') },
  { id: 'journal-local', group: 'integration', cwd: backend, run: nodeRun('test/localJournalIntegration.test.js'),
    requires: () => pythonWithPypdf() || 'Python con pypdf (CONTAPANAMA_PYTHON) no disponible' },
  { id: 'postgres', group: 'postgres', cwd: backend, run: nodeRun('test/postgresIntegration.test.js'), timeoutMs: 15 * 60_000,
    requires: () => (pgBin && ['initdb', 'pg_ctl', 'pg_dump', 'pg_restore'].every(name => fs.existsSync(exe(name)))) ||
      'CONTAPANAMA_PG_BIN no apunta a binarios PostgreSQL (initdb, pg_ctl, pg_dump, pg_restore)' },
  { id: 'frontend-unit', group: 'frontend', cwd: frontend, run: [process.execPath, ['--test', 'test/api.test.mjs', 'test/bankAccounts.test.mjs',
    'test/bankCsv.test.mjs', 'test/bankStatements.test.mjs', 'test/bankSubledger.test.mjs', 'test/ledgerConsistency.test.mjs', 'test/readQueue.test.mjs']],
    requires: () => fs.existsSync(path.join(frontend, 'node_modules')) || 'frontend/node_modules ausente (npm ci en frontend)' },
  // vite is invoked directly: spawning npm.cmd needs a shell, which Node warns is unsafe.
  { id: 'frontend-build', group: 'frontend', cwd: frontend, run: [process.execPath, [path.join('node_modules', 'vite', 'bin', 'vite.js'), 'build']],
    requires: () => fs.existsSync(path.join(frontend, 'node_modules')) || 'frontend/node_modules ausente (npm ci en frontend)' },
  { id: 'frontend-browser', group: 'frontend', cwd: backend, run: nodeRun('scripts/sqlBrowserQa.js'), timeoutMs: 15 * 60_000,
    requires: () => Boolean(process.env.CONTAPANAMA_PLAYWRIGHT) || 'CONTAPANAMA_PLAYWRIGHT no configurado (pruebas de navegador)' },
];

function pythonWithPypdf() {
  const { spawnSync } = require('node:child_process');
  const result = spawnSync(process.env.CONTAPANAMA_PYTHON || 'python', ['-c', 'import pypdf'], { windowsHide: true });
  return result.status === 0;
}

function runSuite(suite) {
  const [command, commandArgs] = suite.run;
  return runCaptured(command, commandArgs, { cwd: suite.cwd, env: process.env,
    timeoutMs: positiveInteger(process.env.CONTAPANAMA_QA_TIMEOUT_MS, suite.timeoutMs || 5 * 60_000, 'CONTAPANAMA_QA_TIMEOUT_MS') });
}

(async () => {
  const logDir = process.env.CONTAPANAMA_QA_LOG_DIR ? path.resolve(process.env.CONTAPANAMA_QA_LOG_DIR) : fs.mkdtempSync(path.join(os.tmpdir(), 'contapanama-qa-'));
  fs.mkdirSync(logDir, { recursive: true });
  const results = [];
  for (const suite of suites) {
    if ((only && !only.has(suite.id) && !only.has(suite.group)) || skip.has(suite.id) || skip.has(suite.group)) continue;
    const prerequisite = suite.requires ? suite.requires() : true;
    if (prerequisite !== true) { results.push({ suite: suite.id, grupo: suite.group, estado: 'SKIPPED', detalle: prerequisite }); console.log(`SKIPPED ${suite.id}: ${prerequisite}`); continue; }
    process.stdout.write(`RUN     ${suite.id} ... `);
    const started = Date.now();
    const result = await runSuite(suite);
    const { code } = result;
    const output = result.output + (result.timedOut ? '\n[qa] timeout' : '') + (result.error ? `\n${result.error.stack}` : '');
    fs.writeFileSync(path.join(logDir, `${suite.id}.log`), output);
    fs.writeFileSync(path.join(logDir, `${suite.id}.stdout.log`), result.stdout);
    fs.writeFileSync(path.join(logDir, `${suite.id}.stderr.log`), result.stderr);
    const seconds = ((Date.now() - started) / 1000).toFixed(1);
    const passLines = (output.match(/^PASS /gm) || []).length;
    const nodeTestPass = /^ℹ pass (\d+)/m.exec(output)?.[1];
    const detalle = nodeTestPass ? `${nodeTestPass} pruebas` : passLines ? `${passLines} grupos` : (output.trim().split('\n').filter(line => /passed|aprobad/i.test(line)).at(-1) || '').trim().slice(0, 80);
    const estado = code === 0 ? 'PASS' : 'FAIL';
    results.push({ suite: suite.id, grupo: suite.group, estado, segundos: Number(seconds), detalle });
    console.log(`${estado} (${seconds}s) ${detalle}`);
    if (estado === 'FAIL') console.log(output.split('\n').filter(line => !/^\[0m(GET|POST|PUT|DELETE|PATCH)/.test(line)).slice(-25).join('\n'));
  }
  console.log('\nResumen QA');
  console.table(results);
  const counts = { PASS: 0, FAIL: 0, SKIPPED: 0 };
  for (const row of results) counts[row.estado]++;
  console.log(`PASS ${counts.PASS}  FAIL ${counts.FAIL}  SKIPPED ${counts.SKIPPED}  (logs: ${logDir})`);
  fs.writeFileSync(path.join(logDir, 'summary.json'), JSON.stringify({ generado: new Date().toISOString(), node: process.version, results, counts }, null, 2));
  process.exitCode = counts.FAIL ? 1 : 0;
})();
