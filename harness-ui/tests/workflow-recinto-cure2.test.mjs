/*
 * Workflow program sandbox, second review cures of 06/11/2026 (decision 234, block 1,
 * REVISIONE-API-WF-BLOCCO1-CURE-2026-11-05.md). Each test was RED on commit 3ef553515:
 *   - HIGH: a value too deep for structured clone was lost as a 'messageerror' nobody listened to: the run hung until the
 *     wall-clock cap (4 h by default). Now a depth cap in the worker refuses it, and a 'messageerror' still ends the run;
 *   - MEDIUM: agent prompts and options had no byte cap (200 agents x 5 MB put the host heap at 886 MB);
 *   - LOW 3: a guest could forge the outcome (memory_limit by name, a WORKFLOW_PROGRAM_ code of its own);
 *   - LOW 4: a guest that redefined JSON.stringify, JSON.parse, String or Promise.prototype.then made the outcome STALLED.
 * Every test ends in seconds: the wall cap is set to 20 s and the elapsed time is asserted well below it.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { LIMITI_RECINTO, eseguiNelRecinto } from '../src/workflow/recinto.mjs';

const META = "export const meta = { name: 'probe', description: 'sandbox probe', maxAgents: 50 }\n";
const CAPS = { maxUsd: 1, estimateUsd: 0.01, maxWallMs: 20_000 };
const counting = () => {
  const calls = [];
  const agent = async (prompt, options, ctx) => { calls.push(prompt); await ctx.reserve(); return { value: `echo:${prompt}`, costUsd: 0 }; };
  return { calls, agent };
};
const run = (body, extra = {}) => eseguiNelRecinto({ source: META + body, agent: counting().agent, ...extra, caps: { ...CAPS, ...(extra.caps ?? {}) } });
const timed = async (fn) => { const t0 = Date.now(); const out = await fn(); return { out, ms: Date.now() - t0 }; };
const NEST = (n) => `let o = {}; for (let i = 0; i < ${n}; i++) o = { o };`;

// ---- 1. HIGH: values too deep to cross the thread boundary ------------------------------------------------------------------

test('DEEP: agent options nested 2000 deep fail with a typed error in seconds; the host is never called', async () => {
  const host = counting();
  const { out, ms } = await timed(() => run(`${NEST(2000)} return await agent('p', o)`, { agent: host.agent }));
  assert.ok(ms < 10_000, `ended after ${ms} ms`);
  assert.equal(out.outcome, 'error', JSON.stringify(out.error));
  assert.equal(out.error.code, 'WORKFLOW_PROGRAM_VALUE_TOO_DEEP');
  assert.match(out.error.hint, /flat/u);
  assert.equal(host.calls.length, 0);
  assert.equal(out.usage.agents, 0, 'a refused call is not counted as an agent');
});

test('DEEP: a returned value nested 3000 deep ends as a typed error in seconds, never at the deadline', async () => {
  const { out, ms } = await timed(() => run(`${NEST(3000)} return o`));
  assert.ok(ms < 10_000, `ended after ${ms} ms`);
  assert.equal(out.outcome, 'error', JSON.stringify(out.error));
  assert.equal(out.error.code, 'WORKFLOW_PROGRAM_VALUE_TOO_DEEP');
});

test('DEEP: the cap is exact (depth = levels of objects and arrays, the options object is level 1) and the program can catch it', async () => {
  const host = counting();
  const caps = { maxValueDepth: 4 };
  const ok = await run("return await agent('a', { x: { y: [ {} ] } })", { agent: host.agent, caps });
  assert.equal(ok.outcome, 'ok', JSON.stringify(ok.error));
  const deep = await run("try { await agent('b', { x: { y: [ [ {} ] ] } }) } catch (e) { return e.code }", { agent: host.agent, caps });
  assert.equal(deep.value, 'WORKFLOW_PROGRAM_VALUE_TOO_DEEP');
  assert.deepEqual(host.calls, ['a']);
  const ret = await run('return { x: { y: [ [ 1 ] ] } }', { caps });
  assert.equal(ret.outcome, 'ok', 'a returned value of depth 4 passes');
  const retDeep = await run('return { x: { y: [ [ {} ] ] } }', { caps });
  assert.equal(retDeep.error?.code, 'WORKFLOW_PROGRAM_VALUE_TOO_DEEP', 'depth 5 is refused');
  assert.equal(LIMITI_RECINTO.maxValueDepth, 128);
});

test('DEEP: a message the main thread cannot read still ends the run with a typed error, in seconds', async () => {
  // No depth cap (-1, tests only: since review 3 note 6 a real cap stops at 256), so structured clone fails at about
  // 1000-1500 levels (measured): the 'messageerror' path.
  const { out, ms } = await timed(() => run(`${NEST(3000)} return o`, { caps: { maxValueDepth: -1 } }));
  assert.ok(ms < 10_000, `ended after ${ms} ms`);
  assert.equal(out.outcome, 'error', JSON.stringify(out.error));
  assert.equal(out.error.code, 'WORKFLOW_PROGRAM_MESSAGE_INVALID');
  const calls = await timed(() => run(`${NEST(2000)} return await agent('p', o)`, { caps: { maxValueDepth: -1 } }));
  assert.ok(calls.ms < 10_000, `ended after ${calls.ms} ms`);
  assert.equal(calls.out.error?.code, 'WORKFLOW_PROGRAM_MESSAGE_INVALID');
});

// ---- 2. MEDIUM: byte caps on what the program sends to agents -----------------------------------------------------------

test('PROMPT BYTES: prompt + options JSON above the per-call cap fail that call only; exactly at the cap passes', async () => {
  const host = counting();
  const caps = { maxPromptBytes: 1_000 };
  // 998 bytes of prompt + '{}' = 1000 bytes.
  const at = await run("return await agent('x'.repeat(998))", { agent: host.agent, caps });
  assert.equal(at.outcome, 'ok', JSON.stringify(at.error));
  const over = await run("try { await agent('x'.repeat(999)) } catch (e) { return [e.code, typeof e.hint] }", { agent: host.agent, caps });
  assert.deepEqual(over.value, ['WORKFLOW_PROGRAM_PROMPT_TOO_LARGE', 'string']);
  const opts = await run("try { await agent('x', { pad: 'y'.repeat(1000) }) } catch (e) { return e.code }", { agent: host.agent, caps });
  assert.equal(opts.value, 'WORKFLOW_PROGRAM_PROMPT_TOO_LARGE', 'the options count too');
  const utf8 = await run("try { await agent('é'.repeat(500)) } catch (e) { return e.code }", { agent: host.agent, caps });
  assert.equal(utf8.value, 'WORKFLOW_PROGRAM_PROMPT_TOO_LARGE', 'bytes, not characters: 500 x 2 bytes + 2 > 1000');
  assert.equal(host.calls.length, 1);
});

test('PROMPT BYTES: the total sent to agents has a cap: input_limit ends the run, the next call never starts', async () => {
  const host = counting();
  const out = await run("for (let i = 0; i < 10; i++) await agent(String(i % 10) + 'x'.repeat(2_999)); return 1",
    { agent: host.agent, caps: { maxPromptBytes: 4_000, maxTotalPromptBytes: 10_000 } });
  assert.equal(out.outcome, 'input_limit', JSON.stringify(out));
  assert.equal(out.error.code, 'WORKFLOW_PROGRAM_INPUT_LIMIT');
  assert.equal(host.calls.length, 3, '3 x 3002 bytes pass, the 4th passes 10000');
});

test('PROMPT BYTES: defaults are 1 MB per call and 16 MB per run; the review case (5 MB prompts) never reaches the host', async () => {
  assert.equal(LIMITI_RECINTO.maxPromptBytes, 1024 * 1024);
  assert.equal(LIMITI_RECINTO.maxTotalPromptBytes, 16 * 1024 * 1024);
  const host = counting();
  const out = await run("const p = 'x'.repeat(5 * 1024 * 1024); return await parallel([1, 2, 3].map(() => () => agent(p)))", { agent: host.agent });
  assert.equal(out.outcome, 'ok', JSON.stringify(out.error));
  assert.deepEqual(out.value, [null, null, null]);
  assert.equal(host.calls.length, 0);
  for (const bad of [{ maxPromptBytes: 0 }, { maxTotalPromptBytes: 0 }, { maxValueDepth: 0 }, { maxPromptBytes: 1.5 }]) {
    await assert.rejects(run('return 1', { caps: bad }), (e) => e.code === 'WORKFLOW_PROGRAM_INVALID_CAPS', JSON.stringify(bad));
  }
});

// ---- 3. LOW: the outcome cannot be forged by the guest -----------------------------------------------------------------

test('FORGERY: a thrown look-alike of «out of memory» is a program error, not memory_limit', async () => {
  for (const body of ["throw { name: 'InternalError', message: 'out of memory' }", "throw new InternalError('out of memory')"]) {
    const out = await run(body);
    assert.equal(out.outcome, 'error', body);
    assert.equal(out.error.code, 'WORKFLOW_PROGRAM_FAILED', body);
  }
});

test('FORGERY: a code and a hint written by the guest do not pass; the ones issued by the host and the engine still do', async () => {
  for (const body of [
    "throw { name: 'Error', message: 'x', code: 'WORKFLOW_PROGRAM_AGENT_CAP', hint: 'forged' }",
    "const e = new Error('blocked'); e.code = 'WORKFLOW_PROGRAM_NONDETERMINISTIC'; e.hint = 'forged'; throw e",
    "try { Date.now() } catch (e) { e.message = 'changed'; throw e }",
  ]) {
    const out = await run(body);
    assert.equal(out.outcome, 'error', body);
    assert.equal(out.error.code, 'WORKFLOW_PROGRAM_FAILED', body);
    assert.notEqual(out.error.hint, 'forged', body);
  }
  const big = async (p, o, ctx) => { await ctx.reserve(); return { value: 'w'.repeat(300 * 1024), costUsd: 0 }; };
  const genuine = await run("return await agent('x')", { agent: big });
  assert.equal(genuine.error.code, 'WORKFLOW_PROGRAM_RESULT_TOO_LARGE', 'a host error re-thrown by the program keeps its code');
  assert.match(genuine.error.hint, /shorter/u);
  const clock = await run('try { Date.now() } catch (e) { throw e }');
  assert.equal(clock.error.code, 'WORKFLOW_PROGRAM_NONDETERMINISTIC');
});

// ---- 4. LOW: guest overrides of built-ins never turn the outcome into STALLED ---------------------------------------------

test('OVERRIDES: JSON.stringify, JSON.parse, String and Promise.prototype.then redefined by the program do not change the outcome', async () => {
  const cases = [
    ["JSON.stringify = () => 'x{'; return { a: 1 }", { a: 1 }],
    ["JSON.stringify = () => { throw new Error('boom') }; return { a: 1 }", { a: 1 }],
    ["JSON.parse = () => 7; return await agent('x')", 'echo:x'],
    ['Promise.prototype.then = function () { return this }; return 1', 1],
    ["Promise.prototype.then = function () { return this }; return await agent('x')", 'echo:x'],
    ["JSON.stringify = () => 'x{'; log({ a: 1 }); return 2", 2],
  ];
  for (const [body, value] of cases) {
    const out = await run(body);
    assert.equal(out.outcome, 'ok', `${body}: ${JSON.stringify(out.error)}`);
    assert.deepEqual(out.value, value, body);
  }
  const str = await run("String = () => { throw 1 }; throw new Error('e')");
  assert.equal(str.outcome, 'error');
  assert.match(str.error.message, /Error: e/u);
  const getter = await run('throw { get name() { throw 1 }, message: 1 }');
  assert.equal(getter.outcome, 'error', JSON.stringify(getter.error));
  assert.equal(getter.error.code, 'WORKFLOW_PROGRAM_FAILED');
});
