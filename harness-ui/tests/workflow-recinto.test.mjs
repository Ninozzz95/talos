/*
 * Workflow program sandbox (decision 234, block 1): QuickJS Wasm with time, memory and stack caps, blocked
 * non-deterministic globals, and every agent() through an injected host. Each cap is proven SEPARATELY: the memory bomb runs
 * under a huge CPU cap and must not be stopped by the CPU cap (usage.interruptCause), the time bomb runs without a memory cap.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { LIMITI_RECINTO, eseguiNelRecinto } from '../src/workflow/recinto.mjs';
import { estraiMeta } from '../src/workflow/recinto-meta.mjs';

const META = "export const meta = { name: 'probe', description: 'sandbox probe', maxAgents: 20 }\n";
const echo = async (prompt, options, ctx) => { await ctx.reserve(); return { value: `echo:${prompt}`, costUsd: 0 }; };
const run = (body, extra = {}) => eseguiNelRecinto({ source: META + body, agent: echo, caps: { maxUsd: 1, estimateUsd: 0.01 }, ...extra });

test('meta must be the first statement, a pure literal, with name, description and maxAgents 1..200', () => {
  assert.throws(() => estraiMeta("return 1"), (e) => e.code === 'WORKFLOW_PROGRAM_INVALID' && /export const meta/.test(e.hint));
  assert.throws(() => estraiMeta("export const meta = { name: 'a', description: 'b', maxAgents: n }"), (e) => e.code === 'WORKFLOW_PROGRAM_INVALID' && /literal/.test(e.message));
  assert.throws(() => estraiMeta("export const meta = { name: 'a' + 'b', description: 'b', maxAgents: 2 }"), /literal/);
  assert.throws(() => estraiMeta("export const meta = { name: `a${1}`, description: 'b', maxAgents: 2 }"), /literal/);
  for (const bad of ['0', '201', '1.5', "'3'", '-1']) {
    assert.throws(() => estraiMeta(`export const meta = { name: 'a', description: 'b', maxAgents: ${bad} }`), (e) => /maxAgents/.test(e.message), bad);
  }
  assert.throws(() => estraiMeta("export const meta = { description: 'b', maxAgents: 2 }"), /name/);
  assert.throws(() => estraiMeta("export const meta = { name: 'a', maxAgents: 2 }"), /description/);
  assert.throws(() => estraiMeta("export const meta = { name: 'a', description: 'b', maxAgents: 2, __proto__: { x: 1 } }"), /__proto__/);
  const { meta, body } = estraiMeta("// lead\n/* c */ export const meta = {\n name: \"a\", description: 'b\\n', maxAgents: 200, phases: [{ title: `Find` },],\n};\nreturn 7\n");
  assert.deepEqual(meta, { name: 'a', description: 'b\n', maxAgents: 200, phases: [{ title: 'Find' }] });
  assert.equal(body.split('\n').length, 6, 'line numbers of the body are preserved');
  assert.match(body, /^\s*return 7\s*$/u);
});

test('a program returns a JSON value; args and meta are visible and frozen', async () => {
  const out = await run("args.x = 9; meta.name = 'changed'; return { a: args.x, n: meta.name, m: meta.maxAgents, frozen: Object.isFrozen(args) && Object.isFrozen(meta) }", { args: { x: 1 } });
  assert.equal(out.outcome, 'ok', JSON.stringify(out.error));
  assert.deepEqual(out.value, { a: 1, n: 'probe', m: 20, frozen: true });
  assert.deepEqual(out.meta, { name: 'probe', description: 'sandbox probe', maxAgents: 20 });
});

test('Date.now, argless new Date, Date() and Math.random throw a clear error; new Date(0) works and the constructor cannot be recovered', async () => {
  for (const expr of ['Date.now()', 'new Date()', 'Date()', 'Math.random()', 'new (new Date(0).constructor)()', 'Reflect.construct(Date, [])']) {
    const out = await run(`return ${expr}`);
    assert.equal(out.outcome, 'error', expr);
    assert.equal(out.error.code, 'WORKFLOW_PROGRAM_NONDETERMINISTIC', expr);
    assert.match(out.error.message, /blocked/u, expr);
    assert.match(out.error.hint, /args/u, expr);
  }
  const ok = await run('return [new Date(0).toISOString(), Date.UTC(2020, 0, 1), new Date(0) instanceof Date]');
  assert.deepEqual(ok.value, ['1970-01-01T00:00:00.000Z', 1577836800000, true]);
  const swallowed = await run('return await parallel([() => Date.now()])');
  assert.equal(swallowed.error?.code, 'WORKFLOW_PROGRAM_NONDETERMINISTIC', 'parallel() does not hide a blocked clock as null');
});

test('no process, require, fetch, timers or host modules inside', async () => {
  const out = await run("return [typeof process, typeof require, typeof fetch, typeof setTimeout, typeof std, typeof os, typeof __agent, typeof __start]");
  assert.deepEqual(out.value, Array(8).fill('undefined'));
});

test('MEMORY cap alone stops a memory bomb (CPU cap 60 s never fires)', async () => {
  const t0 = performance.now();
  const out = await run("let s = 'x'; const keep = []; for (;;) { s = s + s; keep.push(s) }", { caps: { maxUsd: 1, estimateUsd: 0.01, memBytes: 8 * 1024 * 1024, maxCpuMs: 60_000 } });
  assert.equal(out.outcome, 'memory_limit', JSON.stringify(out.error));
  assert.equal(out.error.code, 'WORKFLOW_PROGRAM_MEMORY_LIMIT');
  assert.notEqual(out.usage.interruptCause, 'cpu', 'the CPU interrupt never fired');
  assert.ok(performance.now() - t0 < 30_000);
});

test('memory bomb inside parallel() is not swallowed as null', async () => {
  const out = await run("return await parallel([async () => { let s = 'x'; const k = []; for (;;) { s = s + s; k.push(s) } }])", { caps: { maxUsd: 1, estimateUsd: 0.01, memBytes: 8 * 1024 * 1024, maxCpuMs: 60_000 } });
  assert.equal(out.outcome, 'memory_limit');
});

test('TIME cap alone stops a CPU bomb (no memory cap)', async () => {
  const out = await run('while (true) {}', { caps: { maxUsd: 1, estimateUsd: 0.01, memBytes: -1, maxCpuMs: 200 } });
  assert.equal(out.outcome, 'cpu_limit');
  assert.equal(out.error.code, 'WORKFLOW_PROGRAM_CPU_LIMIT');
  assert.equal(out.usage.interruptCause, 'cpu');
  assert.ok(out.usage.cpuMs >= 200 && out.usage.cpuMs < 2000, String(out.usage.cpuMs));
  const caught = await run('try { while (true) {} } catch (e) { return "escaped" }', { caps: { maxUsd: 1, estimateUsd: 0.01, maxCpuMs: 150 } });
  assert.equal(caught.outcome, 'cpu_limit', 'the interrupt cannot be caught by the program');
});

test('STACK cap stops runaway recursion and the process lives; a stack above 256 KB is refused', async () => {
  const out = await run('function f(n) { return f(n + 1) + 1 } return f(0)');
  assert.equal(out.outcome, 'stack_limit');
  assert.equal(out.error.code, 'WORKFLOW_PROGRAM_STACK_LIMIT');
  await assert.rejects(run('return 1', { caps: { maxUsd: 1, estimateUsd: 0.01, stackBytes: 512 * 1024 } }), (e) => e.code === 'WORKFLOW_PROGRAM_INVALID_CAPS');
  assert.equal(LIMITI_RECINTO.stackBytes, 256 * 1024);
});

test('waiting on an agent is not CPU: a 1.5 s agent passes under a 200 ms CPU cap', async () => {
  const slow = async (prompt, o, ctx) => { await ctx.reserve(); await new Promise((r) => setTimeout(r, 1500)); return { value: prompt, costUsd: 0 }; };
  // Some work AFTER the wait, so the interrupt handler is polled once the agent is back (a wall clock would fire there).
  const out = await run("const v = await agent('slow'); let s = 0; for (let i = 0; i < 300000; i++) s += i; return [v, s > 0]",
    { agent: slow, caps: { maxUsd: 1, estimateUsd: 0.01, maxCpuMs: 200 } });
  assert.equal(out.outcome, 'ok', JSON.stringify(out.error));
  assert.deepEqual(out.value, ['slow', true]);
  assert.ok(out.usage.cpuMs < 200);
});

test('meta.maxAgents is enforced on every call, even when the program catches the refusal', async () => {
  let calls = 0;
  const counted = async (p, o, ctx) => { await ctx.reserve(); calls += 1; return { value: p, costUsd: 0 }; };
  const src = "export const meta = { name: 'cap', description: 'd', maxAgents: 2 }\n"
    + "const out = []; for (let i = 0; i < 5; i++) { try { out.push(await agent('a' + i)) } catch (e) { out.push('caught') } } return out";
  const out = await eseguiNelRecinto({ source: src, agent: counted, caps: { maxUsd: 1, estimateUsd: 0.01 } });
  assert.equal(out.outcome, 'agent_cap');
  assert.equal(out.error.code, 'WORKFLOW_PROGRAM_AGENT_CAP');
  assert.match(out.error.message, /maxAgents \(2\)/u);
  assert.match(out.error.hint, /maxAgents/u);
  assert.equal(calls, 2);
  assert.equal(out.usage.agents, 3);
});

test('after the run ends, calls still waiting for a free slot never reach the host', async () => {
  let calls = 0;
  const slow = async (p, o, ctx) => { calls += 1; await new Promise((r) => setTimeout(r, 20)); await ctx.reserve(); return { value: p, costUsd: 0 }; };
  const src = "export const meta = { name: 'q', description: 'd', maxAgents: 20 }\n"
    + "return await parallel(Array.from({ length: 40 }, (_, i) => () => agent('p' + i)))";
  const out = await eseguiNelRecinto({ source: src, agent: slow, caps: { maxUsd: 1, estimateUsd: 0.01 } });
  assert.equal(out.outcome, 'agent_cap');
  await new Promise((r) => setTimeout(r, 120));
  assert.equal(calls, 0, 'the cap hit in the same guest slice as the 20 queued calls: none of them may start');

  calls = 0;
  const controller = new AbortController();
  const twenty = "export const meta = { name: 'q', description: 'd', maxAgents: 30 }\n"
    + "return await parallel(Array.from({ length: 20 }, (_, i) => () => agent('p' + i)))";
  // Stop exactly when 16 calls are in flight and 4 wait for a slot (a timer would race the module load).
  const stopAt16 = async (p, o, ctx) => { if (calls === 15) setTimeout(() => controller.abort(), 0); return slow(p, o, ctx); };
  const stopped = await eseguiNelRecinto({ source: twenty, agent: stopAt16, caps: { maxUsd: 1, estimateUsd: 0.01 }, signal: controller.signal });
  assert.equal(stopped.outcome, 'stopped');
  await new Promise((r) => setTimeout(r, 120));
  assert.equal(calls, 16, 'the 16 calls in flight at the stop were started; the 4 waiting for a slot never are');
});

test('the spend cap is checked before every live call', async () => {
  let calls = 0;
  const paid = async (p, o, ctx) => { await ctx.reserve(); calls += 1; return { value: p, costUsd: 0.05 }; };
  const out = await run("const r = []; for (let i = 0; i < 4; i++) r.push(await agent('p' + i)); return r", { agent: paid, caps: { maxUsd: 0.1, estimateUsd: 0.05 } });
  assert.equal(out.outcome, 'spend_cap');
  assert.equal(out.error.code, 'WORKFLOW_PROGRAM_SPEND_CAP');
  assert.equal(calls, 2);
  assert.ok(Math.abs(out.usage.costUsd - 0.1) < 1e-9);
  await assert.rejects(eseguiNelRecinto({ source: META + 'return 1', agent: echo, caps: {} }), (e) => e.code === 'WORKFLOW_PROGRAM_INVALID_CAPS');
});

test('a live result without a reservation breaks the host contract', async () => {
  const out = await run("return await agent('x')", { agent: async (p) => ({ value: p, costUsd: 1 }) });
  assert.equal(out.outcome, 'error');
  assert.equal(out.error.code, 'WORKFLOW_PROGRAM_HOST_CONTRACT');
});

test('parallel(): failures become null, at most 16 agents in flight; pipeline() chains stages per item', async () => {
  let inFlight = 0; let peak = 0;
  const host = async (p, o, ctx) => { await ctx.reserve(); inFlight += 1; peak = Math.max(peak, inFlight); await new Promise((r) => setTimeout(r, 5)); inFlight -= 1; if (p === 'bad') throw new Error('boom'); return { value: p, costUsd: 0 }; };
  const src = "export const meta = { name: 'p', description: 'd', maxAgents: 60 }\n"
    + "const xs = await parallel(Array.from({ length: 40 }, (_, i) => () => agent(i === 3 ? 'bad' : 'n' + i)));\n"
    + "const ys = await pipeline(['a', 'b'], (x) => agent('s1 ' + x), (y, x, i) => agent(y + ' s2 ' + i));\n"
    + "return { nulls: xs.filter((x) => x === null).length, last: xs[39], ys }";
  const out = await eseguiNelRecinto({ source: src, agent: host, caps: { maxUsd: 1, estimateUsd: 0.01 } });
  assert.equal(out.outcome, 'ok', JSON.stringify(out.error));
  assert.deepEqual(out.value, { nulls: 1, last: 'n39', ys: ['s1 a s2 0', 's1 b s2 1'] });
  assert.ok(peak <= 16 && peak > 1, `peak ${peak}`);
});

test('a result above the per-result byte cap rejects that call only, never truncated', async () => {
  const big = async (p, o, ctx) => { await ctx.reserve(); return { value: 'x'.repeat(300 * 1024), costUsd: 0 }; };
  const out = await run("try { await agent('big'); return 'no' } catch (e) { return e.code }", { agent: big });
  assert.equal(out.value, 'WORKFLOW_PROGRAM_RESULT_TOO_LARGE');
});

test('the total of agent results and the returned value each have a byte cap: output_limit, never a silent cut', async () => {
  const half = async (p, o, ctx) => { await ctx.reserve(); return { value: 'y'.repeat(500), costUsd: 0 }; };
  const caps = { maxUsd: 1, estimateUsd: 0.01, maxResultBytes: 600, maxTotalBytes: 1000 };
  const many = await run("const a = await agent('1'); const b = await agent('2'); return 'unreachable'", { agent: half, caps });
  assert.equal(many.outcome, 'output_limit');
  assert.equal(many.error.code, 'WORKFLOW_PROGRAM_OUTPUT_LIMIT');
  assert.match(many.error.hint, /summary/u);
  const one = await run("await agent('1'); return 'z'.repeat(990)", { agent: half, caps });
  assert.equal(one.outcome, 'ok', 'the returned value is not added to the agent results');
  const huge = await run("return 'z'.repeat(2000)", { caps });
  assert.equal(huge.outcome, 'output_limit');
  assert.match(huge.error.message, /above the cap of 1000/u);
});

test('Stop ends the run while an agent is in flight and aborts the host signal', async () => {
  const controller = new AbortController();
  let hostSignal;
  const hang = (p, o, ctx) => { hostSignal = ctx.signal; setTimeout(() => controller.abort(), 20); return new Promise(() => {}); };
  const out = await run("return await agent('forever')", { agent: hang, signal: controller.signal });
  assert.equal(out.outcome, 'stopped');
  assert.equal(hostSignal.aborted, true);
});

test('a program waiting on a promise that can never settle is reported, not left hanging', async () => {
  const out = await run('await new Promise(() => {}); return 1');
  assert.equal(out.outcome, 'error');
  assert.equal(out.error.code, 'WORKFLOW_PROGRAM_STALLED');
});

test('log, phase and budget: phase is passed to the host, log lines are bounded, budget is a read-only snapshot', async () => {
  const seen = [];
  const host = async (p, o, ctx) => { await ctx.reserve(); seen.push({ p, o, phase: ctx.phase }); return { value: p, costUsd: 0.02 }; };
  const events = [];
  const src = "phase('Find'); log('start', { n: 1 }); await agent('a', { label: 'L' }); const b = budget(); b.spentUsd = 99; return [b.agents, b.maxAgents, budget().spentUsd]";
  const out = await run(src, { agent: host, onEvent: (e) => events.push(e) });
  assert.equal(out.outcome, 'ok', JSON.stringify(out.error));
  assert.deepEqual(out.value, [1, 20, 0.02]);
  assert.equal(seen[0].phase, 'Find');
  assert.deepEqual(seen[0].o, { label: 'L' });
  assert.deepEqual(out.logs, ['start {"n":1}']);
  assert.ok(events.some((e) => e.type === 'phase' && e.title === 'Find'));
});

test('a syntax error is reported with the line of the original source', async () => {
  const out = await run('const a = 1\nconst b = ;\nreturn a');
  assert.equal(out.outcome, 'error');
  assert.equal(out.error.code, 'WORKFLOW_PROGRAM_FAILED');
  assert.match(out.error.message, /SyntaxError/u);
  assert.match(out.error.where ?? '', /:3/u, JSON.stringify(out.error));
});

test('an invalid meta is an invalid_program outcome before any agent runs', async () => {
  let calls = 0;
  const out = await eseguiNelRecinto({ source: "agent('x')", agent: async () => { calls += 1; return { value: 1 }; }, caps: { maxUsd: 1, estimateUsd: 0.01 } });
  assert.equal(out.outcome, 'invalid_program');
  assert.equal(calls, 0);
});
