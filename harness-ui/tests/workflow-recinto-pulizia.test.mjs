/*
 * Handle discipline of the Workflow sandbox (decision 234, block 1). The 05/11 prototype ended with
 * «Assertion failed: list_empty(&rt->gc_obj_list)», which aborts the whole process; measured on 05/11: a 512 KB guest stack
 * overflows the HOST (V8) stack before QuickJS's own check, and disposing that runtime aborts. Thirteen scenarios x 20 runs in a
 * child process: exit code 0, empty stderr, every scenario with its expected outcome every time.
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const CHILD = fileURLToPath(new URL('./aiuto/recinto-figlio.mjs', import.meta.url));
// 17/11/2026 (PR 96): a rebuilt child env carries the explicit test mark (SHELL-KEYRING-MARK-REBUILD).
const childEnv = () => ({ ...Object.fromEntries(Object.entries(process.env).filter(([k]) => !/API_KEY|_TOKEN/iu.test(k))), TALOS_PROVA_ISOLATA: '1' });

test('thirteen scenarios x 20 runs: no QuickJS assertion, exit 0, empty stderr, the expected outcome every time', () => {
  const r = spawnSync(process.execPath, [CHILD, 'pulizia', '20'], { encoding: 'utf8', env: childEnv(), timeout: 240_000 });
  assert.equal(r.stderr, '', r.stderr.slice(0, 2000));
  assert.equal(r.status, 0);
  // outcome:cleanup. A regex stuck in native code is terminated from outside; a host stack overflow is never disposed.
  assert.deepEqual(JSON.parse(r.stdout), {
    'ok:ok:disposed': 20, 'guestError:error:disposed': 20, 'cpu:cpu_limit:disposed': 20, 'memory:memory_limit:disposed': 20,
    'stack:stack_limit:disposed': 20, 'agentCap:agent_cap:disposed': 20, 'inFlightAtEnd:ok:disposed': 20,
    'syntaxError:error:disposed': 20, 'failingAgent:ok:disposed': 20, 'regex:cpu_limit:terminated': 20,
    'memorySmall:memory_limit:disposed': 20, 'poisoned:stack_limit:poisoned': 20, 'stopped:stopped:disposed': 20,
  });
});

test('the sandbox runs with native addons disabled (Wasm only) and its packages ship no .node binary', () => {
  const r = spawnSync(process.execPath, ['--no-addons', CHILD, 'semplice'], { encoding: 'utf8', env: childEnv(), timeout: 60_000 });
  assert.equal(r.stderr, '', r.stderr.slice(0, 2000));
  assert.equal(r.status, 0);
  assert.deepEqual(JSON.parse(r.stdout), { outcome: 'ok', value: ['pong', 42] });

  // The packages do not export ./package.json: find each one the way Node does, walking node_modules folders upwards.
  const packageRoot = (name) => {
    for (let dir = fileURLToPath(new URL('..', import.meta.url)); ; dir = dirname(dir)) {
      const candidate = join(dir, 'node_modules', ...name.split('/'));
      if (existsSync(join(candidate, 'package.json'))) return candidate;
      if (dirname(dir) === dir) throw new Error(`${name} is not installed`);
    }
  };
  const roots = ['quickjs-emscripten', 'quickjs-emscripten-core', '@jitl/quickjs-wasmfile-release-sync'].map(packageRoot);
  const files = [];
  const walk = (dir) => { for (const entry of readdirSync(dir)) { const p = join(dir, entry); if (statSync(p).isDirectory()) walk(p); else files.push(p); } };
  roots.forEach(walk);
  assert.deepEqual(files.filter((f) => f.endsWith('.node')), []);
  assert.ok(files.some((f) => f.endsWith('.wasm')));
});
