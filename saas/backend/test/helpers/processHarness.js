const { spawn } = require('node:child_process');
const { performance } = require('node:perf_hooks');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

function positiveInteger(value, fallback, name) {
  const result = value === undefined ? fallback : Number(value);
  if (!Number.isSafeInteger(result) || result <= 0) throw new Error(`${name} must be a positive integer`);
  return result;
}

function capture(child, onOutput = () => {}) {
  const state = { stdout: '', stderr: '', output: '', error: null };
  for (const stream of ['stdout', 'stderr']) child[stream].on('data', part => {
    const text = part.toString();
    state[stream] += text;
    state.output += text;
    onOutput(text, stream);
  });
  child.on('error', error => { state.error = error; });
  return state;
}

async function stop(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null || !child.pid) return;
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => { child.kill('SIGKILL'); }, 2000);
    const deadline = setTimeout(() => reject(new Error('Child did not stop')), 10000);
    child.once('close', () => { clearTimeout(timer); clearTimeout(deadline); resolve(); });
    child.kill();
  });
}

async function startService({ command, args, options = {}, probe, onOutput, onChild = () => {},
  timeoutMs = 60000, attempts = 3, intervalMs = 150, probeTimeoutMs = 5000 }) {
  positiveInteger(timeoutMs, 30000, 'startup timeout');
  positiveInteger(attempts, 3, 'startup attempts');
  positiveInteger(probeTimeoutMs, 5000, 'probe timeout');
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    onOutput?.(`[startup attempt ${attempt}/${attempts}]\n`, 'stderr');
    const child = spawn(command, args, { ...options, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    const state = capture(child, onOutput);
    onChild(child);
    const deadline = performance.now() + timeoutMs;
    try {
      while (performance.now() < deadline) {
        if (state.error) throw state.error;
        if (child.exitCode !== null || child.signalCode !== null) throw new Error(`Child exited (${child.exitCode}, ${child.signalCode})`);
        const remaining = Math.max(1, Math.ceil(deadline - performance.now()));
        const signal = AbortSignal.timeout(Math.min(remaining, probeTimeoutMs));
        try {
          if (await probe(signal)) return child;
          lastError = new Error('Health probe returned not ready');
        } catch (error) { lastError = error; }
        await delay(Math.min(intervalMs, Math.max(0, deadline - performance.now())));
      }
      throw new Error(`Startup timeout after ${timeoutMs}ms: ${lastError?.message}`);
    } catch (error) {
      await stop(child);
      lastError = new Error(`${error.message}\nstdout:\n${state.stdout}\nstderr:\n${state.stderr}`);
      onOutput?.(`${lastError.message}\n`, 'stderr');
    }
  }
  throw lastError;
}

function runCaptured(command, args, { timeoutMs = 300000, onOutput, onChild = () => {}, ipc = false, inheritedPipeGraceMs,
  readyWhen, startupTimeoutMs = 30000, ...options } = {}) {
  positiveInteger(timeoutMs, 300000, 'command timeout');
  positiveInteger(startupTimeoutMs, 30000, 'startup timeout');
  return new Promise(resolve => {
    const started = performance.now();
    let timedOut = false, grace, settled = false, timer, startupMs = null, ready = !readyWhen;
    const child = spawn(command, args, { ...options, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe', ...(ipc ? ['ipc'] : [])] });
    const expire = () => { timedOut = true; child.kill('SIGKILL'); };
    const state = capture(child, (text, stream) => {
      onOutput?.(text, stream);
      if (!ready && readyWhen(state)) {
        ready = true;
        startupMs = performance.now() - started;
        clearTimeout(timer);
        timer = setTimeout(expire, timeoutMs);
      }
    });
    onChild(child);
    timer = setTimeout(expire, ready ? timeoutMs : startupTimeoutMs);
    const finish = (code, signal) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer); clearTimeout(grace);
      resolve({ ...state, code: timedOut || state.error ? 1 : code, signal, timedOut, ready, startupMs,
        timeoutPhase: timedOut ? (ready ? 'execution' : 'startup') : null });
    };
    child.once('close', finish);
    // Only opt in for tools such as pg_ctl whose daemon inherits pipe handles.
    if (inheritedPipeGraceMs !== undefined) child.once('exit', (code, signal) => {
      grace = setTimeout(() => { child.stdout.destroy(); child.stderr.destroy(); finish(code, signal); }, inheritedPipeGraceMs);
    });
  });
}

module.exports = { positiveInteger, capture, stop, startService, runCaptured };
