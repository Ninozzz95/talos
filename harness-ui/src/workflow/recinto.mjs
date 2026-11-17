/*
 * 05/11/2026 — WORKFLOW PROGRAM SANDBOX («recinto»), BLOCK 1 of decision 234 («one engine, two doors»).
 *
 * The model writes a PROGRAM with the API of a Claude Code workflow (agent, parallel, pipeline, phase, log, args, budget,
 * meta); it runs inside QuickJS compiled to Wasm (quickjs-emscripten 0.31.0, release-sync variant: no native binary), in a
 * worker thread of its own (recinto-lavoratore.mjs). `node:vm` is NOT a sandbox: measured 05/11,
 * `this.constructor.constructor('return process')().pid` returned the real PID.
 *
 * WHY THE SYNC VARIANT + A PROMISE PUMP, NOT ASYNCIFY (quickjs-emscripten-core dist/index.d.ts:354-372): asyncify suspends ONE
 * stack at a time, so parallel() could not keep many agents in flight. In the worker __agent returns a guest promise
 * (ctx.newPromise, index.d.ts:1105-1116); the call itself runs HERE, and its answer settles the deferred over there.
 *
 * WHY A WORKER (review of 05/11, reproduced): the regex engine and BigInt arithmetic of QuickJS never poll the interrupt
 * handler, so /(a+)+b/.test('a'.repeat(28)) ran 45 s under a 300 ms CPU cap and froze this event loop. Wasm cannot be
 * pre-empted from inside; a worker can be terminated from outside (Node worker.terminate()). Cloudflare's workerd and
 * Deno's isolates stop runaway guests the same way: a watchdog thread, not the guest's cooperation.
 *
 * CAPS, each one a typed outcome, never an exception that escapes:
 *   - CPU time of the GUEST only: the clock runs only inside the worker's slices (evalCode, executePendingJobs, deferred
 *     settle). Waiting for a 40 s agent is not CPU. Inside the guest, the interrupt handler stops plain JS (cause 'cpu');
 *     here a watchdog reads the slice clock from shared memory and terminates the worker when a native operation runs past
 *     the cap + WATCHDOG_GRACE_MS. A slice that ends past the cap without being interrupted is cpu_limit too.
 *   - Memory: the Wasm memory of the guest has a hard maximum (recinto-lavoratore.mjs, MEMORY): rt.setMemoryLimit is not
 *     used, it counted 0 bytes per allocation under Emscripten (review: 1.5 GB of RSS under a 4 MB cap). A refused heap
 *     growth ends the run as memory_limit even when the program catches the error.
 *   - Stack: 256 KB at most (QuickJS stack). MEASURED 05/11 (Node 24.18, Windows): with 512 KB the HOST V8 stack overflows
 *     first and disposing that runtime aborts the process («Assertion failed: list_empty(&rt->gc_obj_list)»). If the host
 *     stack still overflows, the runtime is POISONED: the outcome is stack_limit and the runtime is never disposed (the
 *     worker, and its Wasm module, are dropped with it). caps.hostStackMb sets the worker's V8 stack (tests prove that path).
 *   - meta.maxAgents (mandatory, recinto-meta.mjs): EVERY agent() counts, journal hits included; above it the run ends.
 *   - Spend: every live call must reserve before it starts ({reserve, settle}, the shape of budget.mjs reserveBudget/
 *     settleBudget, so block 2 can plug the run budget in). caps.estimateUsd is REQUIRED and > 0 (review: with the old
 *     default 0, 40 parallel agents under maxUsd 1 spent 17 USD: no reservation ever blocked). A live result without a
 *     reservation is a host contract error; reserve() called twice reserves once.
 *   - Bytes: 256 KB per agent result (that call fails, never truncated), 4 MB for all agent results of a run together,
 *     and 4 MB for the value the program returns. What the program SENDS is capped too (review 2, MEDIUM: 200 agents x 5 MB
 *     of prompt put this heap at 886 MB): 1 MB of prompt + options JSON per call (that call fails, catchable), 16 MB for
 *     all calls of a run (input_limit ends the run). Bytes are UTF-8.
 *   - Depth: agent options and the returned value at most 128 levels of objects and arrays (review 2, HIGH: structured
 *     clone drops a message nested about 1000-1500 deep as a 'messageerror', and the run waited for its wall-clock cap).
 *     A 'messageerror' still ends the run (WORKFLOW_PROGRAM_MESSAGE_INVALID), whatever its cause.
 *   - Wall clock of the whole run: caps.maxWallMs (default 4 h): a host that never answers cannot hold a run forever.
 *   - At most 16 agents in flight; the rest wait their turn in call order.
 * After the end, the calls still in flight are aborted through ctx.signal and waited for up to caps.settleGraceMs, so their
 * cost lands in usage.costUsd before the result is returned (usage.unsettled counts the ones that did not answer in time);
 * the usage returned is a copy, never changed afterwards.
 *
 * HANDLE DISCIPLINE: values cross the boundary as JSON text, so the host never holds a guest object; every handle is
 * disposed where it is created; at the end the open deferreds go first, then the context, then the runtime. usage.cleanup
 * says what happened: 'disposed', 'poisoned' (never disposed on purpose), 'terminated' (the worker was stopped from here),
 * 'crashed' (the worker died before it reported: a QuickJS assertion while disposing lands here).
 * Proven by tests/workflow-recinto-pulizia.test.mjs (scenarios x 20 runs in a child process: exit 0, empty stderr).
 *
 * Temporal's workflow sandbox fails a workflow task that blocks the event loop too long (sdk-typescript
 * packages/worker/src/workflow/vm-shared.ts:46-55, TMPRL1101): here the same idea is the guest CPU cap; and a program awaiting a
 * promise nobody can settle is reported as STALLED instead of hanging.
 */
import { Worker } from 'node:worker_threads';

import { MAX_STABLE_DEPTH, jsonStabile } from './json-stabile.mjs';
import { MAX_AGENTS_CEILING, WorkflowProgramError, estraiMeta } from './recinto-meta.mjs';

export { WorkflowProgramError } from './recinto-meta.mjs';

export const LIMITI_RECINTO = Object.freeze({
  maxCpuMs: 5_000,
  memBytes: 32 * 1024 * 1024,
  stackBytes: 256 * 1024,
  maxResultBytes: 256 * 1024,
  maxTotalBytes: 4 * 1024 * 1024,
  maxPromptBytes: 1024 * 1024,
  maxTotalPromptBytes: 16 * 1024 * 1024,
  maxValueDepth: 128,
  // Review 3, note 3: a program error message is cut to this many UTF-8 bytes (+ a truncation mark) before it leaves the worker.
  maxErrorBytes: 4 * 1024,
  maxConcurrency: 16,
  maxLogLines: 200,
  maxLogChars: 2_000,
  maxWallMs: 4 * 60 * 60 * 1000,
  settleGraceMs: 2_000,
});

/** How far past the CPU cap a slice may run before the worker is terminated from outside (native regex, BigInt). */
export const WATCHDOG_GRACE_MS = 200;
const WATCHDOG_TICK_MS = 20;
/** How long the worker gets to release its handles after the end before it is terminated. */
const DISPOSE_WAIT_MS = 1_000;
const PROGRAM_FILE = 'workflow.js';
const WORKER_URL = new URL('./recinto-lavoratore.mjs', import.meta.url);

function capsError(message) {
  return new WorkflowProgramError('WORKFLOW_PROGRAM_INVALID_CAPS', message);
}

function validateCaps(caps, spend) {
  if (caps === null || typeof caps !== 'object') throw capsError('caps must be an object');
  const out = { ...LIMITI_RECINTO };
  const int = (name, min, max) => {
    if (caps[name] === undefined) return;
    if (!Number.isSafeInteger(caps[name]) || caps[name] < min || caps[name] > max) throw capsError(`caps.${name} must be an integer from ${min} to ${max}`);
    out[name] = caps[name];
  };
  int('maxCpuMs', 1, 600_000);
  int('stackBytes', 16 * 1024, LIMITI_RECINTO.stackBytes);
  int('maxResultBytes', 1, 16 * 1024 * 1024);
  int('maxTotalBytes', 1, 64 * 1024 * 1024);
  int('maxPromptBytes', 1, 16 * 1024 * 1024);
  int('maxTotalPromptBytes', 1, 256 * 1024 * 1024);
  // Review 3, note 6: a value deeper than MAX_STABLE_DEPTH can never be recorded (json-stabile.mjs), so the cap stops there.
  // -1 = no cap, tests only (as memBytes): it is how the 'messageerror' defence is still reached.
  if (caps.maxValueDepth !== undefined) {
    if (caps.maxValueDepth !== -1 && (!Number.isSafeInteger(caps.maxValueDepth) || caps.maxValueDepth < 1 || caps.maxValueDepth > MAX_STABLE_DEPTH)) {
      throw capsError(`caps.maxValueDepth must be -1 (no cap, tests only) or an integer from 1 to ${MAX_STABLE_DEPTH}`);
    }
    out.maxValueDepth = caps.maxValueDepth;
  }
  int('maxConcurrency', 1, LIMITI_RECINTO.maxConcurrency);
  int('maxWallMs', 1, 7 * 24 * 60 * 60 * 1000);
  int('settleGraceMs', 0, 60_000);
  if (caps.memBytes !== undefined) {
    if (caps.memBytes !== -1 && (!Number.isSafeInteger(caps.memBytes) || caps.memBytes < 1024 * 1024 || caps.memBytes > 512 * 1024 * 1024)) {
      throw capsError('caps.memBytes must be -1 (no cap, tests only) or an integer from 1 MB to 512 MB');
    }
    out.memBytes = caps.memBytes;
  }
  if (caps.hostStackMb !== undefined) {
    if (typeof caps.hostStackMb !== 'number' || !Number.isFinite(caps.hostStackMb) || caps.hostStackMb < 0.25 || caps.hostStackMb > 64) {
      throw capsError('caps.hostStackMb must be a number from 0.25 to 64');
    }
    out.hostStackMb = caps.hostStackMb;
  }
  if (spend !== undefined) {
    if (!spend || typeof spend.reserve !== 'function' || typeof spend.settle !== 'function') throw capsError('spend must provide reserve() and settle()');
    out.spend = spend;
    out.maxUsd = typeof spend.snapshot === 'function' ? spend.snapshot().maxUsd ?? null : null;
  } else {
    if (typeof caps.maxUsd !== 'number' || !Number.isFinite(caps.maxUsd) || caps.maxUsd < 0) {
      throw capsError('caps.maxUsd is required (a finite number >= 0) unless a spend controller is given');
    }
    out.maxUsd = caps.maxUsd;
    out.spend = createSpendCap({ maxUsd: caps.maxUsd });
  }
  // Required: with an estimate of 0 a reservation never blocks anything, so the spend cap only acted after it was crossed.
  if (typeof caps.estimateUsd !== 'number' || !Number.isFinite(caps.estimateUsd) || caps.estimateUsd <= 0) {
    throw capsError('caps.estimateUsd is required: the estimated cost of one live agent call, a finite number > 0');
  }
  out.estimateUsd = caps.estimateUsd;
  return out;
}

/** The default spend controller: refuses a live call whose estimate would cross maxUsd. Same shape block 2 plugs in. */
export function createSpendCap({ maxUsd }) {
  let spentUsd = 0;
  let reservedUsd = 0;
  return {
    reserve({ estimateUsd }) {
      if (spentUsd + reservedUsd + estimateUsd > maxUsd + 1e-12) {
        throw new WorkflowProgramError('WORKFLOW_PROGRAM_SPEND_CAP',
          `the spend cap of ${maxUsd} USD would be crossed: ${spentUsd.toFixed(4)} spent, ${reservedUsd.toFixed(4)} reserved, ${estimateUsd.toFixed(4)} more estimated`,
          'Raise the run budget on the card, or let the program start fewer or cheaper agents.');
      }
      reservedUsd += estimateUsd;
      return { estimateUsd };
    },
    settle(reservation, { actualUsd }) {
      reservedUsd = Math.max(0, reservedUsd - reservation.estimateUsd);
      spentUsd += actualUsd;
    },
    snapshot() { return { spentUsd, maxUsd }; },
  };
}

const HINTS = {
  WORKFLOW_PROGRAM_CPU_LIMIT: 'The program computes too much between agents: move heavy work into an agent, or raise the CPU cap.',
  WORKFLOW_PROGRAM_MEMORY_LIMIT: 'The program holds too much data: keep only what the next step needs, or pass large inputs by reference in args.',
  WORKFLOW_PROGRAM_STACK_LIMIT: 'A recursion does not stop: use a loop or add a base case.',
  WORKFLOW_PROGRAM_STALLED: 'Await only agent(), parallel(), pipeline() or promises built from them; there are no timers in a workflow program.',
  WORKFLOW_PROGRAM_OUTPUT_LIMIT: 'Return a summary instead of every result; results above the cap are never truncated.',
  WORKFLOW_PROGRAM_FAILED: 'Fix the line named in the error and run again: calls that already succeeded are served from the journal.',
  WORKFLOW_PROGRAM_DEADLINE: 'An agent did not answer in time: run again (finished calls come from the journal), or raise the wall-clock cap.',
  WORKFLOW_PROGRAM_SANDBOX_CRASHED: 'The sandbox stopped unexpectedly: run again; if it happens again, report the program.',
  WORKFLOW_PROGRAM_VALUE_TOO_DEEP: 'Keep agent options and the returned value flat: a few levels of objects and arrays, not a chain.',
  WORKFLOW_PROGRAM_PROMPT_TOO_LARGE: 'Send a shorter prompt: pass large inputs by reference (a path in args) and let the agent read them.',
  WORKFLOW_PROGRAM_INPUT_LIMIT: 'The program sent too much text to agents in total: send references instead of whole contents.',
  WORKFLOW_PROGRAM_MESSAGE_INVALID: 'Keep agent options and the returned value flat and plain JSON.',
};

function failure(outcome, code, message) {
  return { outcome, error: { code, message, hint: HINTS[code] ?? null } };
}

/**
 * Runs one program in a fresh sandbox: one worker, Wasm module, runtime and context per run, never reused.
 * `agent(prompt, options, ctx)` is the only door to the outside: it resolves to { value, costUsd, replayed }, and must call
 * `await ctx.reserve()` before any live work (a journal hit returns replayed: true without reserving).
 */
export async function eseguiNelRecinto({ source, args = null, agent, spend, caps = {}, signal, onEvent } = {}) {
  const limits = validateCaps(caps, spend);
  if (typeof agent !== 'function') throw new WorkflowProgramError('WORKFLOW_PROGRAM_INVALID_HOST', 'an agent(prompt, options, ctx) host function is required');
  const usage = {
    agents: 0, replayed: 0, live: 0, costUsd: 0, cpuMs: 0, interruptCause: null, resultBytes: 0, heapBytes: 0, unsettled: 0, cleanup: null,
  };
  const logs = [];
  const snapshot = () => ({ ...usage });
  let meta;
  let body;
  try { ({ meta, body } = estraiMeta(source)); } catch (error) {
    if (!(error instanceof WorkflowProgramError)) throw error;
    return { outcome: 'invalid_program', error: { code: error.code, message: error.message, hint: error.hint }, meta: null, logs, usage: snapshot() };
  }
  let argsJson;
  try { argsJson = JSON.stringify(args ?? null); } catch (error) {
    throw new WorkflowProgramError('WORKFLOW_PROGRAM_INVALID_ARGS', `args must be JSON: ${error.message}`);
  }
  if (Buffer.byteLength(argsJson) > limits.maxTotalBytes) throw new WorkflowProgramError('WORKFLOW_PROGRAM_INVALID_ARGS', 'args are larger than the byte cap');
  // A run stopped before it started never spawns a worker and never calls the host.
  if (signal?.aborted) return { ...failure('stopped', 'WORKFLOW_PROGRAM_STOPPED', 'the run was stopped'), meta, logs, usage: snapshot() };
  const emit = (event) => { try { onEvent?.(event); } catch { /* an observer never breaks the run */ } };

  const sab = new SharedArrayBuffer(4 * Int32Array.BYTES_PER_ELEMENT);
  const shared = new Int32Array(sab);
  const epoch = Math.floor(performance.timeOrigin + performance.now());
  const worker = new Worker(WORKER_URL, {
    workerData: {
      body, metaJson: JSON.stringify(meta), argsJson, maxAgents: meta.maxAgents, sab, epoch, programFile: PROGRAM_FILE, hints: HINTS,
      limits: {
        maxCpuMs: limits.maxCpuMs, memBytes: limits.memBytes, stackBytes: limits.stackBytes, maxTotalBytes: limits.maxTotalBytes,
        maxLogLines: limits.maxLogLines, maxLogChars: limits.maxLogChars, maxUsd: limits.maxUsd, maxAgentsCeiling: MAX_AGENTS_CEILING,
        maxPromptBytes: limits.maxPromptBytes, maxTotalPromptBytes: limits.maxTotalPromptBytes, maxValueDepth: limits.maxValueDepth === -1 ? Number.MAX_SAFE_INTEGER : limits.maxValueDepth,
        maxErrorBytes: limits.maxErrorBytes,
      },
    },
    // The worker's stdout and stderr reach this process's own: a QuickJS assertion stays visible.
    resourceLimits: { ...(limits.hostStackMb ? { stackSizeMb: limits.hostStackMb } : {}), maxOldGenerationSizeMb: 256 },
  });

  let final = null;
  let workerUsage = null;
  let workerGone = false;
  let markFinished;
  const finished = new Promise((resolve) => { markFinished = resolve; });
  let markDisposed;
  const disposed = new Promise((resolve) => { markDisposed = resolve; });
  const internalAbort = new AbortController();
  const capError = (code, message, hint) => new WorkflowProgramError(code, message, hint);

  const end = (result, { fromWorker = false } = {}) => {
    if (final) return;
    final = result;
    Atomics.store(shared, 3, 1);
    internalAbort.abort();
    waiting.length = 0;
    if (!fromWorker && !workerGone) worker.postMessage({ t: 'end', result });
    markFinished();
  };
  const abortWith = (outcome, error) => end({ outcome, error: { code: error.code, message: error.message, hint: error.hint ?? null } });

  // ---- the agent door -----------------------------------------------------------------------------------------------------
  const waiting = [];
  let running = 0;
  let markIdle = null;

  const answer = (id, ok, payload) => {
    if (final || workerGone) return;
    const error = ok ? null : { message: String(payload?.message ?? payload), code: typeof payload?.code === 'string' ? payload.code : null, hint: typeof payload?.hint === 'string' ? payload.hint : null };
    worker.postMessage({ t: 'done', id, ok, text: ok ? payload : null, error, spentUsd: usage.costUsd });
  };

  const startNext = () => {
    // A run that ended (cap, stop, error) never starts the calls still waiting for a slot.
    if (final) { waiting.length = 0; return; }
    while (running < limits.maxConcurrency && waiting.length > 0) launch(waiting.shift());
  };

  const launch = async (entry) => {
    running += 1;
    let reservation = null;
    let reserving = null;
    const callCtx = {
      signal: internalAbort.signal,
      index: entry.index,
      phase: entry.phase,
      label: entry.label,
      // Memoized as a promise: two concurrent reserve() calls make ONE reservation.
      reserve: () => {
        if (reserving) return reserving;
        if (final) return Promise.reject(capError('WORKFLOW_PROGRAM_STOPPED', 'the run has ended'));
        reserving = (async () => {
          try { reservation = await limits.spend.reserve({ estimateUsd: limits.estimateUsd }); } catch (error) {
            if (error?.code === 'WORKFLOW_PROGRAM_SPEND_CAP') abortWith('spend_cap', error);
            throw error;
          }
          reservation ??= { estimateUsd: limits.estimateUsd };
          return reservation;
        })();
        return reserving;
      },
    };
    emit({ type: 'agent_start', index: entry.index, phase: entry.phase, label: entry.label });
    let result;
    let failed = null;
    try { result = await agent(entry.prompt, entry.options, callCtx); } catch (error) { failed = error; }
    running -= 1;
    if (running === 0) markIdle?.();
    if (reservation) {
      // A failed call may still have cost money: its reported cost counts, else the estimate.
      const reported = failed ? failed?.costUsd : result?.costUsd;
      const actualUsd = typeof reported === 'number' && Number.isFinite(reported) && reported >= 0 ? reported : reservation.estimateUsd;
      try { limits.spend.settle(reservation, { actualUsd }); } catch { /* the controller keeps its own record */ }
      usage.costUsd += actualUsd;
    }
    startNext();
    if (!failed) {
      if (!result || typeof result !== 'object') {
        failed = capError('WORKFLOW_PROGRAM_HOST_CONTRACT', 'the agent host must resolve to { value, costUsd, replayed }');
      } else if (result.replayed !== true && !reservation) {
        abortWith('error', capError('WORKFLOW_PROGRAM_HOST_CONTRACT', 'a live agent result arrived without a spend reservation'));
      }
    }
    emit({ type: 'agent_end', index: entry.index, ok: !failed, replayed: result?.replayed === true });
    if (failed) { answer(entry.id, false, failed); return; }
    if (result.replayed === true) usage.replayed += 1; else usage.live += 1;
    let text;
    // The stable text: a live result and the same result served by the journal reach the guest with the same key order.
    try { text = jsonStabile(result.value); } catch (error) {
      answer(entry.id, false, capError('WORKFLOW_PROGRAM_AGENT_FAILED', `the agent result is not JSON: ${error.message}`));
      return;
    }
    const bytes = Buffer.byteLength(text);
    if (bytes > limits.maxResultBytes) {
      answer(entry.id, false, capError('WORKFLOW_PROGRAM_RESULT_TOO_LARGE', `the agent result is ${bytes} bytes, above the cap of ${limits.maxResultBytes}`,
        'Ask the agent for a shorter answer or a summary; results are never truncated.'));
      return;
    }
    usage.resultBytes += bytes;
    if (usage.resultBytes > limits.maxTotalBytes) {
      abortWith('output_limit', capError('WORKFLOW_PROGRAM_OUTPUT_LIMIT', `agent results passed ${limits.maxTotalBytes} bytes in total`, HINTS.WORKFLOW_PROGRAM_OUTPUT_LIMIT));
    }
    answer(entry.id, true, text);
  };

  const onBatch = (items) => {
    for (const item of items) {
      if (item.t === 'call') {
        usage.agents = Math.max(usage.agents, item.index + 1);
        waiting.push(item);
      } else if (item.t === 'log') {
        if (logs.length < limits.maxLogLines) logs.push(item.text);
        emit({ type: 'log', text: item.text });
      } else if (item.t === 'phase') {
        emit({ type: 'phase', title: item.title });
      }
    }
    startNext();
  };

  // The CPU clock of the current guest slice, read from the worker without its cooperation.
  const sliceCpuMs = () => {
    const start = Atomics.load(shared, 0);
    const before = Atomics.load(shared, 1);
    if (start === 0) return before;
    return before + Math.max(0, performance.timeOrigin + performance.now() - epoch - (start - 1));
  };

  const terminate = (cleanup) => {
    if (workerGone) return;
    usage.cleanup ??= cleanup;
    worker.terminate().catch(() => {});
  };

  worker.on('message', (m) => {
    if (m.t === 'batch') onBatch(m.items);
    else if (m.t === 'final') { workerUsage = m.usage; end(m.result, { fromWorker: true }); }
    else if (m.t === 'disposed') { usage.cleanup ??= m.cleanup === 'disposed' ? 'disposed' : m.cleanup; markDisposed(); }
  });
  worker.on('error', (error) => {
    if (error?.code === 'ERR_WORKER_OUT_OF_MEMORY') {
      end(failure('memory_limit', 'WORKFLOW_PROGRAM_MEMORY_LIMIT', `the program used more than ${limits.memBytes} bytes of memory`));
    } else {
      end(failure('error', 'WORKFLOW_PROGRAM_SANDBOX_CRASHED', `the sandbox stopped: ${error?.message ?? error}`));
    }
  });
  // Node docs (worker_threads, Event 'messageerror'): "emitted when deserializing a message failed". Without this listener
  // the message is lost and the run waits for its wall-clock cap (review 2, HIGH). The worker's depth cap makes it rare.
  worker.on('messageerror', (error) => {
    end(failure('error', 'WORKFLOW_PROGRAM_MESSAGE_INVALID', `a message from the sandbox could not be read: ${error?.message ?? error}`));
  });
  worker.on('exit', () => {
    workerGone = true;
    usage.cleanup ??= 'crashed';
    end(failure('error', 'WORKFLOW_PROGRAM_SANDBOX_CRASHED', 'the sandbox exited before the program finished'));
    markDisposed();
  });

  const watchdog = setInterval(() => {
    if (final) return;
    const cpu = sliceCpuMs();
    if (cpu > limits.maxCpuMs + WATCHDOG_GRACE_MS) {
      usage.interruptCause = 'cpu';
      usage.cpuMs = cpu;
      end(failure('cpu_limit', 'WORKFLOW_PROGRAM_CPU_LIMIT', `the program used more than ${limits.maxCpuMs} ms of CPU time`));
      terminate('terminated');
    }
  }, WATCHDOG_TICK_MS);
  const deadline = setTimeout(() => {
    abortWith('deadline', capError('WORKFLOW_PROGRAM_DEADLINE', `the run passed its wall-clock cap of ${limits.maxWallMs} ms`, HINTS.WORKFLOW_PROGRAM_DEADLINE));
  }, limits.maxWallMs);
  const onStop = () => abortWith('stopped', capError('WORKFLOW_PROGRAM_STOPPED', 'the run was stopped'));
  signal?.addEventListener('abort', onStop, { once: true });

  try {
    await finished;
  } finally {
    signal?.removeEventListener('abort', onStop);
    clearInterval(watchdog);
    clearTimeout(deadline);
    internalAbort.abort();
    // The worker releases its handles; one stuck in a native operation is terminated.
    let waitTimer;
    const gaveUp = await Promise.race([
      disposed.then(() => false),
      new Promise((resolve) => { waitTimer = setTimeout(() => resolve(true), DISPOSE_WAIT_MS); }),
    ]);
    clearTimeout(waitTimer);
    if (gaveUp) terminate('terminated');
    if (!workerGone) worker.terminate().catch(() => {});
    // The calls in flight were aborted: wait a little for their answers, so their cost is counted before returning.
    if (running > 0 && limits.settleGraceMs > 0) {
      let graceTimer;
      await Promise.race([
        new Promise((resolve) => { markIdle = resolve; }),
        new Promise((resolve) => { graceTimer = setTimeout(resolve, limits.settleGraceMs); }),
      ]);
      clearTimeout(graceTimer);
    }
    usage.unsettled = running;
  }
  if (workerUsage) {
    usage.cpuMs = workerUsage.cpuMs;
    usage.interruptCause = usage.interruptCause ?? workerUsage.interruptCause;
    usage.heapBytes = workerUsage.heapBytes;
    usage.agents = Math.max(usage.agents, workerUsage.agents);
  } else {
    usage.cpuMs = Math.max(usage.cpuMs, Atomics.load(shared, 1));
    usage.heapBytes = Atomics.load(shared, 2) * 1024;
  }
  usage.cpuMs = Math.round(usage.cpuMs * 10) / 10;
  return { ...final, meta, logs: logs.slice(), usage: snapshot() };
}
