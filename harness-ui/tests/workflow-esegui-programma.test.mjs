/*
 * Program runner = sandbox + keyed journal (decision 234, block 1). Replay serves ANY unchanged call, not only a prefix:
 * a program edited in the middle reuses the untouched calls, across a restart (a new journal object on the same root).
 */
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { eseguiProgramma } from '../src/workflow/esegui-programma.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

const WF = '0d7c4c1e-90a8-4b77-8e6f-4fb8a3a4c2d9';
function rootFor(t) {
  const root = mkdtempSync(join(tmpdir(), 'talos-esegui-programma-'));
  t.after(() => rimuoviCartellaDiProva(root));
  return root;
}
function fakeHost({ fail = new Set(), cost = 0.01 } = {}) {
  const calls = [];
  return {
    calls,
    agent: async (prompt, options, ctx) => {
      calls.push(prompt);
      if (fail.has(prompt)) throw new Error(`agent failed on ${prompt}`);
      return { value: `R(${prompt})`, costUsd: cost };
    },
  };
}
const program = (steps) => "export const meta = { name: 'three', description: 'three steps', maxAgents: 10 }\n"
  + `const a = await agent(${JSON.stringify(steps[0])});\n`
  + `const b = await agent(${JSON.stringify(steps[1])});\n`
  + `const c = await agent(${JSON.stringify(steps[2])});\n`
  + 'return [a, b, c]';
const run = (root, source, host, extra = {}) => eseguiProgramma({ source, workflowDataRoot: root, workflowId: WF, runId: extra.runId ?? 'run', host, caps: { maxUsd: 1, estimateUsd: 0.01 }, ...extra });

test('a second run (new process: new journal objects) calls no agent and returns the same value', async (t) => {
  const root = rootFor(t);
  const h1 = fakeHost();
  const first = await run(root, program(['one', 'two', 'three']), h1, { runId: 'r1' });
  assert.equal(first.outcome, 'ok', JSON.stringify(first.error));
  assert.equal(h1.calls.length, 3);
  assert.deepEqual(first.usage.journal, { replayed: 0, live: 3, recordFailures: 0, shared: 0 });
  const h2 = fakeHost();
  const second = await run(root, program(['one', 'two', 'three']), h2, { runId: 'r2' });
  assert.deepEqual(second.value, first.value);
  assert.equal(h2.calls.length, 0);
  assert.equal(second.usage.journal.replayed, 3);
  assert.equal(second.usage.costUsd, 0, 'a replayed call costs nothing');
});

test('a program edited IN THE MIDDLE reuses the untouched calls before AND after the edit', async (t) => {
  const root = rootFor(t);
  await run(root, program(['one', 'two', 'three']), fakeHost(), { runId: 'r1' });
  const h = fakeHost();
  const edited = await run(root, program(['one', 'TWO EDITED', 'three']), h, { runId: 'r2' });
  assert.equal(edited.outcome, 'ok');
  assert.deepEqual(h.calls, ['TWO EDITED'], 'only the edited call goes live; the third is served although a call before it changed');
  assert.deepEqual(edited.value, ['R(one)', 'R(TWO EDITED)', 'R(three)']);
});

test('a downstream call whose prompt embeds a changed result goes live; label/phase edits do not', async (t) => {
  const root = rootFor(t);
  const src = (mid, label) => "export const meta = { name: 'chain', description: 'd', maxAgents: 10 }\n"
    + `const a = await agent('first', { label: ${JSON.stringify(label)} });\nconst b = await agent(${JSON.stringify(mid)});\nreturn await agent('merge ' + b)`;
  await run(root, src('mid', 'L1'), fakeHost(), { runId: 'r1' });
  const h = fakeHost();
  const out = await run(root, src('mid v2', 'renamed label'), h, { runId: 'r2' });
  assert.deepEqual(h.calls, ['mid v2', 'merge R(mid v2)']);
  assert.equal(out.usage.journal.replayed, 1);
});

test('loops with identical prompts are told apart by the repetition index and replay all of them', async (t) => {
  const root = rootFor(t);
  const src = "export const meta = { name: 'loop', description: 'd', maxAgents: 10 }\nconst r = []; for (let i = 0; i < 3; i++) r.push(await agent('same')); return r";
  let n = 0;
  const counting = { agent: async () => { n += 1; return { value: `v${n}`, costUsd: 0 }; } };
  const first = await run(root, src, counting, { runId: 'r1' });
  assert.deepEqual(first.value, ['v1', 'v2', 'v3']);
  const h = fakeHost();
  const second = await run(root, src, h, { runId: 'r2' });
  assert.deepEqual(second.value, ['v1', 'v2', 'v3']);
  assert.equal(h.calls.length, 0);
});

test('failures are never recorded: the failed call goes live again next time, the others are served', async (t) => {
  const root = rootFor(t);
  const src = "export const meta = { name: 'f', description: 'd', maxAgents: 10 }\nreturn await parallel([() => agent('ok1'), () => agent('flaky'), () => agent('ok2')])";
  const first = await run(root, src, fakeHost({ fail: new Set(['flaky']) }), { runId: 'r1' });
  assert.deepEqual(first.value, ['R(ok1)', null, 'R(ok2)']);
  const h = fakeHost();
  const second = await run(root, src, h, { runId: 'r2' });
  assert.deepEqual(h.calls, ['flaky']);
  assert.deepEqual(second.value, ['R(ok1)', 'R(flaky)', 'R(ok2)']);
});

test('calls served from the journal still count against meta.maxAgents', async (t) => {
  const root = rootFor(t);
  const body = "\nconst r = []; for (let i = 0; i < 3; i++) r.push(await agent('p' + i)); return r";
  await run(root, "export const meta = { name: 'n', description: 'd', maxAgents: 3 }" + body, fakeHost(), { runId: 'r1' });
  const h = fakeHost();
  const out = await run(root, "export const meta = { name: 'n', description: 'd', maxAgents: 2 }" + body, h, { runId: 'r2' });
  assert.equal(out.outcome, 'agent_cap');
  assert.equal(h.calls.length, 0);
});

test('a resumed run under a spend cap that forbids live calls still finishes from the journal', async (t) => {
  const root = rootFor(t);
  await run(root, program(['a', 'b', 'c']), fakeHost({ cost: 0.4 }), { runId: 'r1', caps: { maxUsd: 2, estimateUsd: 0.4 } });
  const h = fakeHost();
  const out = await run(root, program(['a', 'b', 'c']), h, { runId: 'r2', caps: { maxUsd: 0.01, estimateUsd: 0.4 } });
  assert.equal(out.outcome, 'ok', JSON.stringify(out.error));
  const live = await run(root, program(['a', 'NEW', 'c']), h, { runId: 'r3', caps: { maxUsd: 0.01, estimateUsd: 0.4 } });
  assert.equal(live.outcome, 'spend_cap');
  assert.equal(h.calls.length, 0);
});

test('the host receives the key and an abort signal; a host without agent() is refused', async (t) => {
  const root = rootFor(t);
  let seen;
  const host = { agent: async (p, o, ctx) => { seen = ctx; return { value: 1, costUsd: 0 }; } };
  const src = "export const meta = { name: 'k', description: 'd', maxAgents: 1 }\nreturn await agent('k', { label: 'x' })";
  const out = await run(root, src, host);
  assert.equal(out.outcome, 'ok');
  assert.match(seen.key, /^sha256:[0-9a-f]{64}$/u);
  assert.equal(typeof seen.signal.aborted, 'boolean');
  await assert.rejects(run(root, src, {}), (e) => e.code === 'WORKFLOW_PROGRAM_INVALID_HOST');
});

/* ---- Review cures of 05/11/2026 (WF-BLOCCO1-REVISIONE-GIORNALE): each test was RED on b735b0dbe or kills a live mutant. ---- */

test('a live run and a resumed run hand the program the SAME value: keys sorted both times', async (t) => {
  const root = rootFor(t);
  const src = "export const meta = { name: 'o', description: 'd', maxAgents: 1 }\nconst v = await agent('x'); return [Object.keys(v), Object.keys(v.a), JSON.stringify(v)]";
  const host = { agent: async () => ({ value: { z: 1, a: { y: 2, b: undefined, c: -0 } }, costUsd: 0 }) };
  const live = await run(root, src, host, { runId: 'r1' });
  const replay = await run(root, src, fakeHost(), { runId: 'r2' });
  assert.equal(live.usage.journal.live, 1);
  assert.equal(replay.usage.journal.replayed, 1);
  assert.deepEqual(live.value, [['a', 'z'], ['c', 'y'], '{"a":{"c":0,"y":2},"z":1}']);
  assert.deepEqual(replay.value, live.value);
});

test('two runs of this process asking the same call at once pay ONE live call; if it fails the second goes live itself', async (t) => {
  const root = rootFor(t);
  const src = "export const meta = { name: 'd', description: 'd', maxAgents: 1 }\ntry { return await agent('same') } catch (e) { return 'failed' }";
  let calls = 0;
  const slow = { agent: async (p) => { calls += 1; await new Promise((r) => setTimeout(r, 80)); return { value: `R(${p})`, costUsd: 0.1 }; } };
  const [a, b] = await Promise.all([run(root, src, slow, { runId: 'a' }), run(root, src, slow, { runId: 'b' })]);
  assert.equal(calls, 1);
  assert.deepEqual([a.value, b.value], ['R(same)', 'R(same)']);
  assert.equal(a.usage.journal.live + b.usage.journal.live, 1);
  assert.equal(a.usage.journal.shared + b.usage.journal.shared, 1);
  assert.equal(a.usage.costUsd + b.usage.costUsd, 0.1);

  const other = rootFor(t);
  let n = 0;
  const firstFails = { agent: async (p) => { n += 1; const mine = n; await new Promise((r) => setTimeout(r, 80)); if (mine === 1) throw new Error('first failed'); return { value: `R(${p})`, costUsd: 0 }; } };
  const both = await Promise.all([run(other, src, firstFails, { runId: 'a' }), run(other, src, firstFails, { runId: 'b' })]);
  assert.equal(n, 2);
  assert.deepEqual(both.map((o) => o.value).sort(), ['R(same)', 'failed']);
});

test('a failed record never fails the run: counted, written in the diagnostics, and the next run goes live', async (t) => {
  const root = rootFor(t);
  const src = "export const meta = { name: 'r', description: 'd', maxAgents: 1 }\nreturn await agent('big')";
  const host = { agent: async () => ({ value: 'x'.repeat(200), costUsd: 0 }) };
  const out = await run(root, src, host, { maxResultBytes: 64 });
  assert.equal(out.outcome, 'ok');
  assert.equal(out.value, 'x'.repeat(200));
  assert.equal(out.usage.journal.recordFailures, 1);
  assert.ok(out.diagnostics.some((d) => d.code === 'WORKFLOW_LIMIT_EXCEEDED' && /^sha256:/u.test(d.key)), JSON.stringify(out.diagnostics));
  const h = fakeHost();
  await run(root, src, h, { maxResultBytes: 64 });
  assert.deepEqual(h.calls, ['big']);
});

test('a live value JSON cannot hold fails that call, and the call still costs what the host reported', async (t) => {
  const root = rootFor(t);
  const src = "export const meta = { name: 'b', description: 'd', maxAgents: 1 }\ntry { await agent('x') } catch (e) { return e.code }";
  const out = await run(root, src, { agent: async () => ({ value: { n: 1n }, costUsd: 0.2 }) });
  assert.equal(out.value, 'WORKFLOW_STABLE_JSON_INVALID');
  assert.equal(out.usage.costUsd, 0.2);
  assert.equal(out.usage.journal.recordFailures, 0);
});

test('each run sweeps the index temporaries a crash left behind', async (t) => {
  const root = rootFor(t);
  const folder = join(root, 'temp', 'replay');
  mkdirSync(folder, { recursive: true });
  const stale = join(folder, 'crash.tmp');
  writeFileSync(stale, 'x');
  const old = (Date.now() - 2 * 60 * 60 * 1000) / 1000;
  utimesSync(stale, old, old);
  await run(root, program(['a', 'b', 'c']), fakeHost());
  assert.equal(existsSync(stale), false);
});
