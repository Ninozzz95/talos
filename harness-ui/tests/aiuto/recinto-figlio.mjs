/*
 * Child process for the Workflow sandbox handle-discipline test (decision 234, block 1). A leaked QuickJS handle makes
 * JS_FreeRuntime abort the WHOLE process with «Assertion failed: list_empty(&rt->gc_obj_list)» on stderr, so the parent can
 * only read the exit code and stderr. A clean run is not proof of absence for an intermittent leak: every scenario repeats.
 *   node recinto-figlio.mjs pulizia <reps>   thirteen scenarios x reps, counted by outcome and cleanup
 *   node recinto-figlio.mjs semplice         one small run (used with --no-addons: Wasm only, no native binary)
 */
import { eseguiNelRecinto } from '../../src/workflow/recinto.mjs';

const META = "export const meta = { name: 'child', description: 'child', maxAgents: 60 }\n";
const reserveThen = (value, ms = 0) => async (p, o, ctx) => { await ctx.reserve(); if (ms) await new Promise((r) => setTimeout(r, ms)); return { value, costUsd: 0 }; };

const SCENARIOS = {
  ok: () => ({ source: META + "const a = await agent('x'); return { a, n: [1, 2, 3] }", agent: reserveThen('v') }),
  guestError: () => ({ source: META + "await agent('x'); throw new TypeError('nope')", agent: reserveThen('v') }),
  cpu: () => ({ source: META + 'while (true) {}', caps: { maxCpuMs: 60 } }),
  memory: () => ({ source: META + "let s = 'x'; const k = []; for (;;) { s = s + s; k.push(s) }", caps: { memBytes: 8 * 1024 * 1024, maxCpuMs: 60_000 } }),
  stack: () => ({ source: META + 'function f(n) { return f(n + 1) + 1 } return f(0)' }),
  agentCap: () => ({ source: "export const meta = { name: 'c', description: 'c', maxAgents: 2 }\nfor (;;) await agent('x')", agent: reserveThen('v') }),
  inFlightAtEnd: () => ({ source: META + "for (let i = 0; i < 50; i++) agent('x' + i); return 'left 50 in flight'", agent: () => new Promise(() => {}) }),
  syntaxError: () => ({ source: META + 'const a = ;' }),
  failingAgent: () => ({ source: META + "try { await agent('x') } catch (e) { return e.message }", agent: async (p, o, ctx) => { await ctx.reserve(); throw new Error('host failed'); } }),
  regex: () => ({ source: META + "return /(a+)+b/.test('a'.repeat(30))", caps: { maxCpuMs: 60 } }),
  memorySmall: () => ({ source: META + 'const k = []; for (let i = 0; ; i++) k.push(new Array(5000).fill(i))', caps: { memBytes: 8 * 1024 * 1024, maxCpuMs: 60_000 } }),
  poisoned: () => ({ source: META + 'function f(n) { return f(n + 1) + 1 } return f(0)', caps: { hostStackMb: 0.25 } }),
  stopped: () => {
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 5);
    return { source: META + "await parallel(Array.from({ length: 30 }, (_, i) => () => agent('s' + i))); return 1", agent: () => new Promise(() => {}), signal: controller.signal };
  },
};

const [mode, repsArg] = process.argv.slice(2);
if (mode === 'semplice') {
  const out = await eseguiNelRecinto({ source: META + "return [await agent('ping'), 6 * 7]", agent: reserveThen('pong'), caps: { maxUsd: 1, estimateUsd: 0.01 } });
  process.stdout.write(JSON.stringify({ outcome: out.outcome, value: out.value }));
} else if (mode === 'pulizia') {
  const reps = Number(repsArg) || 20;
  const counts = {};
  for (let i = 0; i < reps; i += 1) {
    for (const [name, make] of Object.entries(SCENARIOS)) {
      const scenario = make();
      const out = await eseguiNelRecinto({ agent: reserveThen('v'), ...scenario, caps: { maxUsd: 1, estimateUsd: 0.01, ...(scenario.caps ?? {}) } });
      const id = `${name}:${out.outcome}:${out.usage.cleanup}`;
      counts[id] = (counts[id] ?? 0) + 1;
    }
  }
  process.stdout.write(JSON.stringify(counts));
} else {
  process.stderr.write(`unknown mode ${mode}\n`);
  process.exitCode = 2;
}
