const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { runCaptured, positiveInteger } = require('./helpers/processHarness');
const { latencies } = require('./helpers/benchmarkStatistics');

test('measure actual child-ready latency, separate from the execution timeout', async () => {
  const samples = [];
  const count = positiveInteger(process.env.CONTAPANAMA_STARTUP_SAMPLES, 20, 'samples');
  for (let i = 0; i < count; i++) {
    const r = await runCaptured(process.execPath, ['-e', 'console.log("ready")'], {
      readyWhen: state => state.stdout.includes('ready'),
      startupTimeoutMs: positiveInteger(process.env.CONTAPANAMA_QA_STARTUP_TIMEOUT_MS, 30000, 'startup budget'),
      timeoutMs: 500,
    });
    assert.equal(r.code, 0); assert.equal(r.ready, true); assert.equal(typeof r.startupMs, 'number');
    samples.push(r.startupMs);
  }
  const result = { scope: 'Node child spawn to stdout readiness on this host; not application SLA', ...latencies(samples), samples_ms: samples };
  const dir = path.resolve(__dirname, '../../outputs/security-blockers');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'startup-latency.json'), JSON.stringify(result, null, 2));
  console.log('Child startup measurements: ' + JSON.stringify(latencies(samples)));
});

test('a deliberately slow startup does not consume the post-ready 500ms timeout', async () => {
  const r = await runCaptured(process.execPath, ['-e', 'setTimeout(()=>{console.log("ready");setInterval(()=>{},1000)},800)'], {
    readyWhen: state => state.stdout.includes('ready'), startupTimeoutMs: 30000, timeoutMs: 500,
  });
  assert.equal(r.timeoutPhase, 'execution'); assert.equal(r.timedOut, true);
  assert(r.startupMs >= 800);
});
