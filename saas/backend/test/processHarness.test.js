const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { startService, stop, runCaptured, positiveInteger } = require('./helpers/processHarness');
const { fileMetadata } = require('./helpers/fileMetadata');

test('captures final stdout/stderr and nonzero exit, including spawn errors', async () => {
  const r = await runCaptured(process.execPath, ['-e', 'process.stdout.write("out");process.stderr.write("err");process.exitCode=7']);
  assert.equal(r.code, 7); assert.equal(r.stdout, 'out'); assert.equal(r.stderr, 'err');
  const missing = await runCaptured(path.join(os.tmpdir(), 'missing-qa-binary-111'), []);
  assert.equal(missing.code, 1); assert.equal(missing.error.code, 'ENOENT');
});
test('command timeout is failure and retains output', async () => {
  const r = await runCaptured(process.execPath, ['-e', 'console.log("started");setInterval(()=>{},1000)'], { timeoutMs: 500 });
  assert.equal(r.timedOut, true); assert.equal(r.code, 1); assert.match(r.stdout, /started/);
});
test('startup retries crashed child, polling until ready and preserving both attempts', async () => {
  let attempts = 0, output = '', child;
  try {
    child = await startService({ command: process.execPath,
      args: ['-e', 'console.log("boot");console.error("diagnostic");setInterval(()=>{},1000)'],
      timeoutMs: 1500, attempts: 2, intervalMs: 20,
      onChild: c => { attempts++; if (attempts === 1) c.kill(); },
      onOutput: text => { output += text; }, probe: async () => attempts === 2 && output.includes('boot') && output.includes('diagnostic'),
    });
    assert.equal(attempts, 2); assert.match(output, /diagnostic/); assert.match(output, /attempt 1\/2/);
  } finally { await stop(child); }
});
test('startup deadline aborts HTTP-like stalled probes and captures failure', async () => {
  let child;
  await assert.rejects(startService({ command: process.execPath,
    args: ['-e', 'console.error("stalled");setInterval(()=>{},1000)'],
    attempts: 1, timeoutMs: 500, onChild: c => { child = c; },
    probe: signal => new Promise((resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true })),
  }), /Startup timeout.*\nstdout:[\s\S]*stderr:/);
  assert(child.exitCode !== null || child.signalCode !== null);
});
test('configuration rejects invalid values; metadata helper does not open contents', () => {
  for (const value of ['0', '-1', 'no', '1.5', '']) assert.throws(() => positiveInteger(value, 1, 'setting'));
  assert.equal(positiveInteger(undefined, 12, 'setting'), 12);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'metadata-test-'));
  const file = path.join(dir, 'synthetic');
  try {
    assert.equal(fileMetadata(file), null);
    fs.writeFileSync(file, 'synthetic only');
    const original = fs.readFileSync;
    fs.readFileSync = () => { throw new Error('Content access forbidden'); };
    try { assert.equal(fileMetadata(file).size, '14'); } finally { fs.readFileSync = original; }
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
