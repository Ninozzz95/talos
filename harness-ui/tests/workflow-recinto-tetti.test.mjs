/*
 * Workflow program sandbox, review cures of 05/11/2026 (decision 234, block 1). Each test was RED on commit b735b0dbe or kills
 * a mutant the review found alive:
 *   - native operations (regex, BigInt) that never poll the interrupt handler: the worker is terminated from outside;
 *   - the memory cap held only single large allocations (malloc_usable_size is 0 under Emscripten): now the Wasm memory
 *     itself has a maximum, and a caught «out of memory» still ends the run;
 *   - estimateUsd required; reserve() memoized; the cost of a failed call counted; reserve after the end refused;
 *   - wall-clock cap, settle grace, local time = UTC, the default caps, the host-call details.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { LIMITI_RECINTO, WATCHDOG_GRACE_MS, eseguiNelRecinto } from '../src/workflow/recinto.mjs';

const META = "export const meta = { name: 'probe', description: 'sandbox probe', maxAgents: 50 }\n";
const CAPS = { maxUsd: 1, estimateUsd: 0.01 };
const echo = async (prompt, options, ctx) => { await ctx.reserve(); return { value: `echo:${prompt}`, costUsd: 0 }; };
const run = (body, extra = {}) => eseguiNelRecinto({ source: META + body, agent: echo, ...extra, caps: { ...CAPS, ...(extra.caps ?? {}) } });
const BASE_HEAP = 16 * 1024 * 1024;

test('a catastrophic regex is stopped near the CPU cap and the host event loop keeps running', async () => {
  let ticks = 0;
  const timer = setInterval(() => { ticks += 1; }, 10);
  const t0 = performance.now();
  const out = await run("return /(a+)+b/.test('a'.repeat(28))", { caps: { maxCpuMs: 300 } });
  const ms = performance.now() - t0;
  clearInterval(timer);
  assert.equal(out.outcome, 'cpu_limit', JSON.stringify(out));
  assert.equal(out.error.code, 'WORKFLOW_PROGRAM_CPU_LIMIT');
  assert.equal(out.usage.interruptCause, 'cpu');
  assert.equal(out.usage.cleanup, 'terminated', 'the worker stuck in the regex engine is terminated from outside');
  assert.ok(ms < 5_000, `ended in ${Math.round(ms)} ms (45 s before the cure)`);
  assert.ok(out.usage.cpuMs >= 300 && out.usage.cpuMs < 300 + WATCHDOG_GRACE_MS + 1_000, String(out.usage.cpuMs));
  assert.ok(ticks >= 10, `the host event loop ran ${ticks} timer ticks during the run`);
});

test('a long BigInt operation that never polls the interrupt handler ends as cpu_limit, never ok', async () => {
  const out = await run('return String(7n ** 300000n).length', { caps: { maxCpuMs: 20 } });
  assert.equal(out.outcome, 'cpu_limit', JSON.stringify(out));
  assert.ok(out.usage.cpuMs > 20);
});

test('MEMORY: many small allocations stop at the cap, the Wasm heap never grows past it', async () => {
  const memBytes = 8 * 1024 * 1024;
  for (const body of ['const k = []; for (let i = 0; ; i++) k.push(new Array(5000).fill(i))', "const k = []; for (let i = 0; ; i++) k.push('y'.repeat(20000) + i)"]) {
    const out = await run(body, { caps: { memBytes, maxCpuMs: 1_500 } });
    assert.equal(out.outcome, 'memory_limit', `${body}: ${JSON.stringify(out)}`);
    assert.notEqual(out.usage.interruptCause, 'cpu');
    assert.ok(out.usage.heapBytes > BASE_HEAP && out.usage.heapBytes <= BASE_HEAP + memBytes, String(out.usage.heapBytes));
    assert.equal(out.usage.cleanup, 'disposed');
  }
});

test('MEMORY: a program that catches «out of memory» still ends as memory_limit', async () => {
  const out = await run("try { const k = []; for (let i = 0; ; i++) k.push(new Array(5000).fill(i)) } catch (e) { return 'swallowed' }",
    { caps: { memBytes: 8 * 1024 * 1024, maxCpuMs: 1_500 } });
  assert.equal(out.outcome, 'memory_limit', JSON.stringify(out));
  assert.equal(out.error.code, 'WORKFLOW_PROGRAM_MEMORY_LIMIT');
});

test('DEFAULT caps: 32 MB of memory, 5 s of CPU, 200 log lines of 2000 characters, 4 MB of results', async () => {
  assert.equal(LIMITI_RECINTO.memBytes, 32 * 1024 * 1024);
  const mem = await run('const k = []; for (let i = 0; ; i++) k.push(new Array(5000).fill(i))');
  assert.equal(mem.outcome, 'memory_limit');
  assert.ok(mem.usage.heapBytes <= BASE_HEAP + LIMITI_RECINTO.memBytes && mem.usage.heapBytes > BASE_HEAP + LIMITI_RECINTO.memBytes / 2, String(mem.usage.heapBytes));

  const cpu = await run('while (true) {}');
  assert.equal(cpu.outcome, 'cpu_limit');
  assert.equal(LIMITI_RECINTO.maxCpuMs, 5_000);
  assert.ok(cpu.usage.cpuMs >= 5_000 && cpu.usage.cpuMs < 5_000 + WATCHDOG_GRACE_MS + 300, String(cpu.usage.cpuMs));

  const logs = await run("for (let i = 0; i < 201; i++) log('line ' + i); log('z'.repeat(3000)); return 1");
  assert.equal(logs.outcome, 'ok');
  assert.equal(logs.logs.length, 200);
  assert.equal(logs.logs[199], 'line 199');

  const long = await run("log('z'.repeat(3000)); return 1");
  assert.equal(long.logs[0].length, 2_000);

  const chunk = async (p, o, ctx) => { await ctx.reserve(); return { value: 'w'.repeat(200 * 1024), costUsd: 0 }; };
  const results = await run('for (let i = 0; i < 25; i++) await agent(String(i)); return 1', { agent: chunk });
  assert.equal(results.outcome, 'output_limit');
  assert.ok(results.usage.resultBytes > 4 * 1024 * 1024 && results.usage.resultBytes < 4.3 * 1024 * 1024, String(results.usage.resultBytes));
});

test('CPU: the interrupt counts the CPU of earlier slices, not only the current one', async () => {
  // Two slices of ~180 ms each (1.5 M loop steps; Date.now is blocked in a program), then a loop: only a CUMULATIVE count stops
  // it near 400 ms from inside. A per-slice count would let the loop run 400 ms more, past the watchdog (400 + WATCHDOG_GRACE_MS),
  // and the worker would be terminated instead.
  const body = "for (let k = 0; k < 2; k++) { await agent('w' + k); let s = 0; for (let i = 0; i < 1500000; i++) s += i; }\nwhile (true) {}";
  const out = await run(body, { caps: { maxCpuMs: 400 } });
  assert.equal(out.outcome, 'cpu_limit');
  assert.equal(out.usage.interruptCause, 'cpu');
  assert.equal(out.usage.cleanup, 'disposed', 'stopped by the interrupt, not by the watchdog');
  assert.ok(out.usage.cpuMs < 400 + 150, `stopped at ${out.usage.cpuMs} ms of CPU`);
});

test('CPU: a native operation that ends past the cap is caught when its slice ends, even if the program then waits', async () => {
  // 7n ** 2000000n takes ~70 ms in one native call: the interrupt handler is never polled and it ends inside the watchdog grace.
  // Only the check after the slice sees the CPU spent; without it the run would end as «stalled» on the pending promise.
  const out = await run('const x = 7n ** 2000000n; await new Promise(() => {})', { caps: { maxCpuMs: 20 } });
  assert.equal(out.outcome, 'cpu_limit', JSON.stringify(out));
  assert.equal(out.usage.interruptCause, null, 'not stopped by the interrupt handler');
  assert.equal(out.usage.cleanup, 'disposed', 'not stopped by the watchdog');
  assert.ok(out.usage.cpuMs > 20 && out.usage.cpuMs < 20 + WATCHDOG_GRACE_MS, String(out.usage.cpuMs));
});

test('STOP: a stop during a pure loop is seen by the interrupt handler, well before a high CPU cap', async () => {
  const controller = new AbortController();
  setTimeout(() => controller.abort(), 100);
  const out = await run('while (true) {}', { caps: { maxCpuMs: 5_000 }, signal: controller.signal });
  assert.equal(out.outcome, 'stopped', JSON.stringify(out));
  assert.equal(out.usage.interruptCause, 'abort');
  assert.equal(out.usage.cleanup, 'disposed', 'the worker left the loop by itself, it was not terminated');
  assert.ok(out.usage.cpuMs < 1_000, String(out.usage.cpuMs));
});

test('MEMORY: a refused grow caught by the program stops the next loop from the interrupt handler, not at the CPU cap', async () => {
  const body = 'try { const k = []; for (let i = 0; ; i++) k.push(new Array(5000).fill(i)); } catch {} while (true) {}';
  const out = await run(body, { caps: { maxCpuMs: 3_000, memBytes: 8 * 1024 * 1024 } });
  assert.equal(out.outcome, 'memory_limit', JSON.stringify(out));
  assert.equal(out.usage.interruptCause, 'memory');
  assert.ok(out.usage.cpuMs < 1_000, String(out.usage.cpuMs));
});

test('STACK: the stack cap is the one asked for (32 KB is far shallower than 256 KB)', async () => {
  const body = 'let d = 0; function f(n) { d = n; return f(n + 1) + 1 } try { f(0) } catch (e) { return [d, e.name] }';
  const small = await run(body, { caps: { stackBytes: 32 * 1024 } });
  const large = await run(body);
  assert.equal(small.value[1], 'InternalError');
  assert.ok(small.value[0] > 50 && small.value[0] < 700, `32 KB: depth ${small.value[0]}`);
  assert.ok(large.value[0] > 1_000, `256 KB: depth ${large.value[0]}`);
});

test('STACK: a host stack overflow poisons the runtime: stack_limit, never disposed, the process lives', async () => {
  const out = await run('function f(n) { return f(n + 1) + 1 } return f(0)', { caps: { hostStackMb: 0.25 } });
  assert.equal(out.outcome, 'stack_limit', JSON.stringify(out));
  assert.equal(out.usage.cleanup, 'poisoned');
  const after = await run('return 6 * 7');
  assert.equal(after.value, 42);
  await assert.rejects(run('return 1', { caps: { hostStackMb: 0.1 } }), (e) => e.code === 'WORKFLOW_PROGRAM_INVALID_CAPS');
});

test('SPEND: estimateUsd is required and > 0; with it, 40 parallel agents at 1 USD each under 1 USD start ONE live call', async () => {
  for (const caps of [{ maxUsd: 1 }, { maxUsd: 1, estimateUsd: 0 }, { maxUsd: 1, estimateUsd: -1 }, { maxUsd: 1, estimateUsd: Infinity }]) {
    await assert.rejects(eseguiNelRecinto({ source: META + 'return 1', agent: echo, caps }), (e) => e.code === 'WORKFLOW_PROGRAM_INVALID_CAPS' && /estimateUsd/u.test(e.message), JSON.stringify(caps));
  }
  let live = 0;
  const paid = async (p, o, ctx) => { await ctx.reserve(); live += 1; await new Promise((r) => setTimeout(r, 10)); return { value: p, costUsd: 1 }; };
  const out = await eseguiNelRecinto({ source: META + "return await parallel(Array.from({ length: 40 }, (_, i) => () => agent('p' + i)))", agent: paid, caps: { maxUsd: 1, estimateUsd: 1 } });
  assert.equal(out.outcome, 'spend_cap');
  assert.equal(live, 1);
  assert.equal(out.usage.costUsd, 1);
});

test('SPEND: a spend controller must provide reserve() and settle()', async () => {
  for (const spend of [{}, { reserve() {} }, null]) {
    await assert.rejects(eseguiNelRecinto({ source: META + 'return 1', agent: echo, spend, caps: { estimateUsd: 0.1 } }), (e) => e.code === 'WORKFLOW_PROGRAM_INVALID_CAPS');
  }
});

test('SPEND: reserve() twice at once reserves once; a failed call counts the cost it reports', async () => {
  const seen = { reserve: 0, settle: [] };
  const spend = { reserve: async ({ estimateUsd }) => { seen.reserve += 1; await new Promise((r) => setTimeout(r, 5)); return { estimateUsd }; }, settle: (r, { actualUsd }) => seen.settle.push(actualUsd) };
  const twice = async (p, o, ctx) => { const [a, b] = await Promise.all([ctx.reserve(), ctx.reserve()]); assert.equal(a, b); return { value: p, costUsd: 0.2 }; };
  const out = await eseguiNelRecinto({ source: META + "return await agent('x')", agent: twice, spend, caps: { estimateUsd: 0.1 } });
  assert.equal(out.outcome, 'ok', JSON.stringify(out.error));
  assert.equal(seen.reserve, 1);
  assert.deepEqual(seen.settle, [0.2]);

  const failing = async (p, o, ctx) => { await ctx.reserve(); throw Object.assign(new Error('model refused'), { costUsd: 0.3 }); };
  const failed = await run("try { await agent('x') } catch (e) { return e.message }", { agent: failing });
  assert.equal(failed.value, 'model refused');
  assert.equal(failed.usage.costUsd, 0.3);
  const noCost = await run("try { await agent('x') } catch (e) { return 1 }", { agent: async (p, o, ctx) => { await ctx.reserve(); throw new Error('x'); } });
  assert.equal(noCost.usage.costUsd, CAPS.estimateUsd, 'without a reported cost, the estimate is counted');
});

test('STOP: a signal already aborted never starts the sandbox nor calls the host; reserve() after the end is refused', async () => {
  let calls = 0;
  const controller = new AbortController();
  controller.abort();
  const out = await run("await agent('x'); return 1", { agent: async () => { calls += 1; return { value: 1 }; }, signal: controller.signal });
  assert.equal(out.outcome, 'stopped');
  assert.equal(calls, 0);

  const stop = new AbortController();
  let late;
  const lateReserve = (p, o, ctx) => new Promise((resolve) => {
    ctx.signal.addEventListener('abort', () => { late = ctx.reserve(); late.catch(() => {}); resolve({ value: 1, costUsd: 0, replayed: true }); });
    setTimeout(() => stop.abort(), 10);
  });
  const stopped = await run("return await agent('x')", { agent: lateReserve, signal: stop.signal });
  assert.equal(stopped.outcome, 'stopped');
  await assert.rejects(late, (e) => e.code === 'WORKFLOW_PROGRAM_STOPPED');
});

test('WALL CLOCK: a host that never answers ends the run as deadline; calls in flight get the settle grace', async () => {
  const t0 = Date.now();
  // A guard stop at 5 s: without the deadline the run ends as 'stopped' and this test fails in seconds, not at the runner timeout.
  const guard = new AbortController();
  const guardTimer = setTimeout(() => guard.abort(), 5_000);
  const out = await run("return await agent('x')", { agent: () => new Promise(() => {}), signal: guard.signal, caps: { maxWallMs: 200, settleGraceMs: 50 } });
  clearTimeout(guardTimer);
  assert.ok(Date.now() - t0 < 5_000, `the 200 ms wall cap ended the run after ${Date.now() - t0} ms`);
  assert.equal(out.outcome, 'deadline');
  assert.equal(out.error.code, 'WORKFLOW_PROGRAM_DEADLINE');
  assert.equal(out.usage.unsettled, 1);

  const stop = new AbortController();
  const answersOnAbort = async (p, o, ctx) => {
    await ctx.reserve();
    setTimeout(() => stop.abort(), 10);
    await new Promise((resolve) => ctx.signal.addEventListener('abort', resolve));
    await new Promise((r) => setTimeout(r, 30));
    return { value: p, costUsd: 0.25 };
  };
  const stopped = await run("return await agent('x')", { agent: answersOnAbort, signal: stop.signal });
  assert.equal(stopped.outcome, 'stopped');
  assert.equal(stopped.usage.costUsd, 0.25, 'the cost of the call aborted at the stop is counted before returning');
  assert.equal(stopped.usage.unsettled, 0);
  const frozen = stopped.usage.costUsd;
  await new Promise((r) => setTimeout(r, 50));
  assert.equal(stopped.usage.costUsd, frozen);
});

test('HOST CALLS: error code and hint reach the program; options.phase wins; replayed is counted; a throwing observer is ignored', async () => {
  const coded = async (p, o, ctx) => { await ctx.reserve(); throw Object.assign(new Error('no'), { code: 'X_CODE', hint: 'try Y' }); };
  const err = await run("try { await agent('x') } catch (e) { return [e.name, e.message, e.code, e.hint] }", { agent: coded });
  assert.deepEqual(err.value, ['WorkflowAgentError', 'no', 'X_CODE', 'try Y']);

  const phases = [];
  const host = async (p, o, ctx) => { phases.push([ctx.phase, ctx.label, ctx.index]); return { value: p, costUsd: 0, replayed: true }; };
  const events = [];
  const out = await run("phase('Global'); await agent('a', { phase: 'Own', label: 'L' }); await agent('b'); return 1",
    { agent: host, onEvent: (e) => { events.push(e.type); throw new Error('observer broke'); } });
  assert.equal(out.outcome, 'ok', JSON.stringify(out.error));
  assert.deepEqual(phases, [['Own', 'L', 0], ['Global', null, 1]]);
  assert.equal(out.usage.replayed, 2);
  assert.equal(out.usage.live, 0);
  assert.ok(events.includes('phase') && events.includes('agent_end'));
});

test('HOST CALLS: the guest receives a live value with its keys sorted, as the journal will serve it', async () => {
  const host = async (p, o, ctx) => { await ctx.reserve(); return { value: { z: 1, a: { y: 2, b: 3 } }, costUsd: 0 }; };
  const out = await run("const v = await agent('x'); return [Object.keys(v), Object.keys(v.a)]", { agent: host });
  assert.deepEqual(out.value, [['a', 'z'], ['b', 'y']]);
});

test('ARGS above the byte cap are refused before the run', async () => {
  await assert.rejects(run('return 1', { args: { big: 'a'.repeat(2_000) }, caps: { maxTotalBytes: 1_000 } }), (e) => e.code === 'WORKFLOW_PROGRAM_INVALID_ARGS');
});

test('LOCAL TIME is UTC inside the sandbox on every machine', async () => {
  // The host is moved to UTC+14 first, so the test also kills the cure's mutants on a host that runs in UTC.
  const before = process.env.TZ;
  process.env.TZ = 'Etc/GMT-14';
  try {
    assert.equal(new Date(0).getTimezoneOffset(), -840, 'the host itself is at UTC+14');
    const out = await run('const d = new Date(0); return [d.getHours(), d.getTimezoneOffset(), new Date(2020, 0, 1).getTime(), d.toString().includes("1970")]');
    assert.deepEqual(out.value, [0, 0, Date.UTC(2020, 0, 1), true]);
  } finally {
    if (before === undefined) delete process.env.TZ; else process.env.TZ = before;
  }
});
