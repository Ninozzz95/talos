/*
 * 05/11/2026 — THE GUEST SIDE OF THE WORKFLOW SANDBOX, run in its own worker thread (decision 234, block 1, review cures).
 *
 * WHY A WORKER (review 1, reproduced): QuickJS's regex engine and BigInt arithmetic never call the interrupt handler.
 * /(a+)+b/.test('a'.repeat(28)) ran 45 s under a 300 ms CPU cap and froze the host event loop; 7n**9000000n ran 8.3 s and was
 * reported 'ok'. Here the guest runs on this thread; the main thread reads the slice clock from a SharedArrayBuffer and
 * terminates the worker when a slice runs past the cap (recinto.mjs, watchdog). A worker gets its own native stack too, so a
 * deep caller on the main thread no longer decides when the guest overflows the host stack.
 *
 * MEMORY (review 1, reproduced): QuickJS counts malloc_usable_size(), which is 0 under Emscripten (quickjs.c
 * js_def_malloc_usable_size: `#elif defined(EMSCRIPTEN) return 0;`), so rt.setMemoryLimit stopped only SINGLE large
 * allocations: push(new Array(5000).fill(i)) in a loop reached 1.5 GB of RSS under a 4 MB cap. Here the Wasm memory is OURS
 * (quickjs-emscripten CustomizeVariantOptions.wasmMemory, index.d.ts:1797): maximum = 16 MB initial + memBytes. Emscripten's
 * heap resize catches a refused grow and malloc returns NULL (emscripten-module.mjs, import `m`: try { t.grow(e) } catch {}),
 * so QuickJS throws «out of memory». A refused grow is ALSO recorded on our side (the grow wrapper below): the run ends as
 * memory_limit even when the program catches the error (review 3: `try { bomb } catch { return 'x' }` gave 'ok').
 * Emscripten first tries to grow 20% beyond the request: a refusal therefore ends the run once the heap is at about 83-100%
 * of the cap, never above it.
 *
 * TIME ZONE (review 1): QuickJS takes the local offset from tm_gmtoff, filled by Emscripten from the HOST
 * Date.prototype.getTimezoneOffset. On this thread only, it returns 0: the guest's local time is UTC on every machine, so a
 * resumed run elsewhere takes the same path (measured: getHours of new Date(0) was 1 in Rome, 0 here).
 *
 * DEPTH (review 2, HIGH, reproduced): structured clone rebuilds nested objects recursively on the receiving thread; at about
 * 1000-1500 levels (measured 06/11, Node 24.18: 1000 ok, 1500 'messageerror: Maximum call stack size exceeded') the message
 * is dropped as a 'messageerror' and the run waited for its wall-clock cap. Agent options and the returned value are checked
 * here, iteratively, against limits.maxValueDepth (128) before they are posted; recinto.mjs also listens to 'messageerror'.
 * Objects instead of JSON text are kept: the text would only move the recursion to JSON.stringify in the journal.
 *
 * TRUST (review 2, LOW 3): the guest can throw any object. A WORKFLOW_PROGRAM_ code and its hint count only when THIS side
 * issued that exact (code, message) pair: errors of agent calls (errorHandle) and the prelude's own errors (__issue, captured
 * before the program runs and deleted from the global object). memory_limit comes only from a refused heap growth.
 *
 * The protocol with recinto.mjs: workerData carries the program; this side posts batches ({t:'batch', items}) once per guest
 * slice (calls, log lines, phases: calls made in the slice where the run ended are dropped, never started), {t:'final'} once,
 * then {t:'disposed'} after the handles are released; the main side posts {t:'done'} for each settled call and {t:'end'} when
 * it ends the run (stop, spend cap, deadline, host contract).
 */
import { parentPort, workerData } from 'node:worker_threads';

import { RELEASE_SYNC, newQuickJSWASMModule, newVariant } from 'quickjs-emscripten';

import { PRELUDE } from './recinto-prelude.mjs';

Object.defineProperty(Date.prototype, 'getTimezoneOffset', { value: function getTimezoneOffset() { return 0; }, writable: false, configurable: false });

const { body, metaJson, argsJson, limits, maxAgents, sab, epoch, programFile, hints } = workerData;
// [0] slice start (ms since epoch) + 1, 0 = no slice; [1] CPU ms before it; [2] heap KB; [3] 1 = the main thread ended the run
const shared = new Int32Array(sab);
const sinceEpoch = () => performance.timeOrigin + performance.now() - epoch;

const PAGE = 64 * 1024;
const INITIAL_PAGES = 256; // 16 MB, the size the release-sync module asks for (emscripten-module.mjs: INITIAL_MEMORY 16777216)
const memory = new WebAssembly.Memory({
  initial: INITIAL_PAGES,
  maximum: limits.memBytes === -1 ? 32768 : INITIAL_PAGES + Math.ceil(limits.memBytes / PAGE),
});
let heapRefused = false;
const realGrow = WebAssembly.Memory.prototype.grow;
Object.defineProperty(memory, 'grow', {
  value: (pages) => {
    try { return realGrow.call(memory, pages); } catch (error) { heapRefused = true; throw error; }
  },
});

const usage = { agents: 0, cpuMs: 0, interruptCause: null, heapBytes: 0 };
let spentUsd = 0;
let outbox = [];
let final = null;
let closing = false;
let poisoned = false;
let lastJobError = null;
let sliceStart = null;
let pendingCalls = 0;
let currentPhase = null;
let logLines = 0;
let promptBytes = 0;
// (code NUL message) -> hint of every coded error this side handed to the guest: the only codes classify() believes.
const issued = new Map();
const issue = (code, message, hint) => { if (typeof code === 'string' && issued.size < 10_000) issued.set(`${code}\u0000${message}`, typeof hint === 'string' ? hint : ''); };
let markFinished;
const finished = new Promise((resolve) => { markFinished = resolve; });

function failure(outcome, code, message, extra = {}) {
  return { outcome, error: { code, message, hint: extra.hint ?? hints[code] ?? null, ...(extra.where ? { where: extra.where } : {}) } };
}
const memoryFailure = () => failure('memory_limit', 'WORKFLOW_PROGRAM_MEMORY_LIMIT', `the program used more than ${limits.memBytes} bytes of memory`);
const cpuFailure = () => failure('cpu_limit', 'WORKFLOW_PROGRAM_CPU_LIMIT', `the program used more than ${limits.maxCpuMs} ms of CPU time`);
const cpuNow = () => usage.cpuMs + (sliceStart === null ? 0 : performance.now() - sliceStart);

function whereIn(stack) {
  const m = new RegExp(`${programFile.replace('.', '\\.')}:(\\d+)(?::(\\d+))?`, 'u').exec(stack ?? '');
  return m ? `${programFile}:${m[1]}${m[2] ? `:${m[2]}` : ''}` : null;
}

/** True when a JSON value has more than `cap` levels of objects and arrays (the value itself is level 1). Iterative. */
function tooDeep(value, cap) {
  const stack = [value, 1];
  while (stack.length > 0) {
    const depth = stack.pop();
    const v = stack.pop();
    if (v === null || typeof v !== 'object') continue;
    if (depth > cap) return true;
    for (const child of Object.values(v)) stack.push(child, depth + 1);
  }
  return false;
}

/**
 * Review 3, note 3: a guest error message had no cap (`throw new Error('x'.repeat(15e6))` put 15 MB in the result, for block 2
 * to hand to the model). Cut to `cap` UTF-8 bytes, never inside a character (TextEncoder.encodeInto writes whole characters
 * only), with a mark that says how much was dropped, as Hermes does for code output (tools/code_execution_tool.py:56-80, byte
 * cap + explicit «TRUNCATED - n bytes omitted out of total»). Head only: the cause of an error is at its start.
 */
function capBytes(text, cap) {
  const total = Buffer.byteLength(text, 'utf8');
  if (total <= cap) return text;
  const { read, written } = new TextEncoder().encodeInto(text, new Uint8Array(cap));
  return `${text.slice(0, read)}… [truncated: ${total - written} of ${total} bytes omitted]`;
}

function classify({ name, message, code, hint, stack }) {
  if (usage.interruptCause === 'cpu' || cpuNow() > limits.maxCpuMs) return cpuFailure();
  // Only a grow refused by OUR memory (see MEMORY): a thrown InternalError('out of memory') can be built by the guest.
  if (heapRefused) return memoryFailure();
  if (name === 'InternalError' && /stack overflow/u.test(message)) {
    return failure('stack_limit', 'WORKFLOW_PROGRAM_STACK_LIMIT', `the program used more than ${limits.stackBytes} bytes of stack`);
  }
  const key = `${code}\u0000${message}`;
  const trusted = typeof code === 'string' && issued.has(key);
  const known = trusted && code.startsWith('WORKFLOW_PROGRAM_') ? code : 'WORKFLOW_PROGRAM_FAILED';
  return failure('error', known, capBytes(`${name}: ${message}`, limits.maxErrorBytes), { hint: trusted ? issued.get(key) || undefined : undefined, where: whereIn(stack) });
}

function end(result) {
  if (final) return;
  final = result;
  closing = true;
  // Calls made in the slice where the run ended never reach the host; log lines and phases still do.
  outbox = outbox.filter((item) => item.t !== 'call');
  flush();
  parentPort.postMessage({ t: 'final', result, usage: snapshotUsage() });
  markFinished();
}

function snapshotUsage() {
  usage.heapBytes = memory.buffer.byteLength;
  return { ...usage, cpuMs: Math.round(cpuNow() * 10) / 10 };
}

function flush() {
  if (outbox.length === 0) return;
  parentPort.postMessage({ t: 'batch', items: outbox });
  outbox = [];
}

const QJS = await newQuickJSWASMModule(newVariant(RELEASE_SYNC, { wasmMemory: memory }));
if (QJS.getWasmMemory() !== memory) throw new Error('the QuickJS variant ignored the capped Wasm memory');
const rt = QJS.newRuntime();
rt.setMaxStackSize(limits.stackBytes);
rt.setInterruptHandler(() => {
  if (closing || Atomics.load(shared, 3) === 1) { usage.interruptCause ??= 'abort'; return true; }
  if (heapRefused) { usage.interruptCause ??= 'memory'; return true; }
  if (sliceStart !== null && cpuNow() > limits.maxCpuMs) { usage.interruptCause = 'cpu'; return true; }
  return false;
});
const ctx = rt.newContext();

const dumpError = (handle) => {
  try {
    const v = ctx.dump(handle);
    if (v && typeof v === 'object') return { name: String(v.name ?? 'Error'), message: String(v.message ?? ''), code: v.code, hint: v.hint, stack: String(v.stack ?? '') };
    return { name: 'Error', message: String(v), stack: '' };
  } catch { return { name: 'InternalError', message: 'the error could not be read', stack: '' }; }
};

// Every entry into guest code goes through a slice: the CPU clock runs only here, and the main thread watches it.
const slice = (fn) => {
  if (poisoned || final) return null;
  sliceStart = performance.now();
  Atomics.store(shared, 1, Math.floor(usage.cpuMs));
  Atomics.store(shared, 0, Math.floor(sinceEpoch()) + 1);
  try { return fn(); } catch (error) {
    // The HOST (V8) stack of this thread overflowed inside the Wasm call: the runtime cannot be trusted or disposed.
    if (error instanceof RangeError || error instanceof WebAssembly.RuntimeError) { poisoned = true; return null; }
    throw error;
  } finally {
    usage.cpuMs += performance.now() - sliceStart;
    sliceStart = null;
    Atomics.store(shared, 0, 0);
    Atomics.store(shared, 1, Math.floor(usage.cpuMs));
    Atomics.store(shared, 2, Math.ceil(memory.buffer.byteLength / 1024));
  }
};

const afterSlice = () => {
  if (final) return;
  if (poisoned) { end(failure('stack_limit', 'WORKFLOW_PROGRAM_STACK_LIMIT', 'the program overflowed the host stack')); return; }
  // A native operation (BigInt, regex) may finish a slice past the cap without ever polling the interrupt handler.
  if (usage.interruptCause === 'cpu' || usage.cpuMs > limits.maxCpuMs) { end(cpuFailure()); return; }
  if (heapRefused) { end(memoryFailure()); return; }
  if (lastJobError) { end(classify(lastJobError)); return; }
  if (pendingCalls === 0 && !rt.hasPendingJob()) {
    end(failure('error', 'WORKFLOW_PROGRAM_STALLED', 'the program is waiting on a promise that nothing can settle'));
    return;
  }
  flush();
};

const pump = () => {
  if (final) return;
  slice(() => {
    const r = rt.executePendingJobs(-1);
    try { if (r.error) lastJobError = dumpError(r.error); } finally { r.dispose(); }
  });
  afterSlice();
};

const programError = (code, message, hint) => Object.assign(new Error(message), { name: 'WorkflowProgramError', code, hint });

// ---- the agent door (the call itself runs on the main thread) ----------------------------------------------------------------
const deferreds = new Map();
let nextId = 0;

const errorHandle = (error, name = 'WorkflowAgentError') => {
  const message = String(error?.message ?? error);
  issue(error?.code, message, error?.hint);
  const h = ctx.newError({ name, message });
  if (typeof error?.code === 'string') ctx.newString(error.code).consume((c) => ctx.setProp(h, 'code', c));
  if (typeof error?.hint === 'string') ctx.newString(error.hint).consume((c) => ctx.setProp(h, 'hint', c));
  return h;
};

const settleGuest = (id, ok, payload) => {
  const deferred = deferreds.get(id);
  if (!deferred) return;
  pendingCalls -= 1;
  deferreds.delete(id);
  if (final) { deferred.dispose(); return; }
  slice(() => {
    const h = ok ? ctx.newString(payload) : errorHandle(payload);
    try { (ok ? deferred.resolve : deferred.reject)(h); } catch { /* an interrupted settle is seen by afterSlice */ } finally { h.dispose(); }
  });
  deferred.dispose();
  pump();
};

const hostFunctions = {
  __agent: (promptHandle, optionsHandle) => {
    const prompt = ctx.getString(promptHandle);
    const optionsText = ctx.getString(optionsHandle);
    let options;
    try { options = JSON.parse(optionsText); } catch { throw new TypeError('agent(): options must be JSON'); }
    if (options === null || typeof options !== 'object' || Array.isArray(options)) throw new TypeError('agent(): options must be an object');
    // After the run ended (a cap, a stop) the guest may still be running until the next interrupt check: refuse at once.
    if (final) throw programError('WORKFLOW_PROGRAM_STOPPED', 'the run has ended');
    // Thrown as a guest handle (quickjs-emscripten errorToHandle keeps a Lifetime as is): the code and hint survive.
    if (tooDeep(options, limits.maxValueDepth)) {
      throw errorHandle(programError('WORKFLOW_PROGRAM_VALUE_TOO_DEEP', `agent() options are nested more than ${limits.maxValueDepth} levels deep`,
        hints.WORKFLOW_PROGRAM_VALUE_TOO_DEEP), 'WorkflowProgramError');
    }
    const bytes = Buffer.byteLength(prompt) + Buffer.byteLength(optionsText);
    if (bytes > limits.maxPromptBytes) {
      throw errorHandle(programError('WORKFLOW_PROGRAM_PROMPT_TOO_LARGE', `agent() prompt and options are ${bytes} bytes, above the cap of ${limits.maxPromptBytes}`,
        hints.WORKFLOW_PROGRAM_PROMPT_TOO_LARGE), 'WorkflowProgramError');
    }
    promptBytes += bytes;
    if (promptBytes > limits.maxTotalPromptBytes) {
      const error = programError('WORKFLOW_PROGRAM_INPUT_LIMIT', `agent prompts passed ${limits.maxTotalPromptBytes} bytes in total`, hints.WORKFLOW_PROGRAM_INPUT_LIMIT);
      end({ outcome: 'input_limit', error: { code: error.code, message: error.message, hint: error.hint } });
      throw error;
    }
    usage.agents += 1;
    if (usage.agents > maxAgents) {
      const error = programError('WORKFLOW_PROGRAM_AGENT_CAP',
        `the program asked for more agents than meta.maxAgents (${maxAgents}): call #${usage.agents} was refused`,
        `Raise meta.maxAgents (at most ${limits.maxAgentsCeiling}) if the work really needs more agents, or make the loop stop earlier.`);
      end({ outcome: 'agent_cap', error: { code: error.code, message: error.message, hint: error.hint } });
      throw error;
    }
    const id = nextId;
    nextId += 1;
    const deferred = ctx.newPromise();
    deferreds.set(id, deferred);
    pendingCalls += 1;
    outbox.push({
      t: 'call', id, index: usage.agents - 1, prompt, options,
      phase: typeof options.phase === 'string' ? options.phase : currentPhase,
      label: typeof options.label === 'string' ? options.label : null,
    });
    return deferred.handle;
  },
  __log: (textHandle) => {
    const text = ctx.getString(textHandle).slice(0, limits.maxLogChars);
    logLines += 1;
    if (logLines <= limits.maxLogLines) outbox.push({ t: 'log', text });
  },
  __phase: (titleHandle) => {
    currentPhase = ctx.getString(titleHandle).slice(0, 200);
    outbox.push({ t: 'phase', title: currentPhase });
  },
  __budget: () => ctx.newString(JSON.stringify({ agents: usage.agents, maxAgents, spentUsd, maxUsd: limits.maxUsd })),
  __done: (textHandle) => {
    if (heapRefused) { end(memoryFailure()); return; }
    if (cpuNow() > limits.maxCpuMs) { end(cpuFailure()); return; }
    const text = ctx.getString(textHandle);
    const bytes = Buffer.byteLength(text);
    if (bytes > limits.maxTotalBytes) {
      end(failure('output_limit', 'WORKFLOW_PROGRAM_OUTPUT_LIMIT', `the program returned ${bytes} bytes, above the cap of ${limits.maxTotalBytes}`));
      return;
    }
    let value;
    try { value = JSON.parse(text); } catch {
      end(failure('error', 'WORKFLOW_PROGRAM_OUTPUT_INVALID', 'the program returned a value that is not JSON'));
      return;
    }
    if (tooDeep(value, limits.maxValueDepth)) {
      end(failure('error', 'WORKFLOW_PROGRAM_VALUE_TOO_DEEP', `the program returned a value nested more than ${limits.maxValueDepth} levels deep`));
      return;
    }
    end({ outcome: 'ok', value });
  },
  __issue: (codeHandle, messageHandle, hintHandle) => { issue(ctx.getString(codeHandle), ctx.getString(messageHandle), ctx.getString(hintHandle)); },
  __fail: (...handles) => {
    const [name, message, code, hint, stack] = handles.map((h) => ctx.getString(h));
    end(classify({ name, message, code, hint, stack }));
  },
};

parentPort.on('message', (m) => {
  if (m.t === 'done') {
    spentUsd = m.spentUsd;
    settleGuest(m.id, m.ok, m.ok ? m.text : m.error);
  } else if (m.t === 'end') {
    end(m.result);
  }
});

try {
  for (const [name, fn] of Object.entries(hostFunctions)) {
    ctx.newFunction(name, fn).consume((h) => ctx.setProp(ctx.global, name, h));
  }
  ctx.newString(metaJson).consume((h) => ctx.setProp(ctx.global, '__metaJson', h));
  ctx.newString(argsJson).consume((h) => ctx.setProp(ctx.global, '__argsJson', h));
  const evaluate = (code, file) => {
    let ok = false;
    slice(() => {
      const r = ctx.evalCode(code, file);
      if (r.error) { const info = dumpError(r.error); r.error.dispose(); end(classify(info)); return; }
      r.value.dispose();
      ok = true;
    });
    return ok && !final;
  };
  if (evaluate(PRELUDE, 'prelude.js')) {
    // The body starts on the same line as the wrapper, so line N of the body is line N of what the model wrote.
    evaluate(`__start(async () => {${body}\n})`, programFile);
  }
  if (!final) pump();
  if (!final && poisoned) afterSlice();
  await finished;
} finally {
  closing = true;
  let cleanup = 'poisoned';
  if (!poisoned) {
    for (const deferred of deferreds.values()) deferred.dispose();
    deferreds.clear();
    ctx.dispose();
    rt.dispose();
    cleanup = !ctx.alive && !rt.alive ? 'disposed' : 'open';
  }
  parentPort.postMessage({ t: 'disposed', cleanup });
}
