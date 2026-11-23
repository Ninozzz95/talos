import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';

test('M4-D RED — composition applies effective reasoning effort before either first-turn path',async()=>{
  const source=await readFile(new URL('../src/main.ts',import.meta.url),'utf8');
  assert.match(source,/effective\.value\.reasoningEffort/u);
  assert.match(source,/setDefaultReasoningEffort/u);
  const setter=source.indexOf('setDefaultReasoningEffort');
  const tui=source.indexOf('await (deps.runTui??defaultRunTui)');
  const headless=source.indexOf('collectHeadlessRun(activeRuntime');
  assert.ok(setter>=0&&tui>=0&&setter<tui,'default must be applied before TUI can send an initial prompt');
  assert.ok(setter>=0&&headless>=0&&setter<headless,'default must be applied before headless first turn');
});

test('M4-D RED — unsupported configured effort is capability-gated rather than silently clamped',async()=>{
  const source=await readFile(new URL('../src/main.ts',import.meta.url),'utf8');
  assert.match(source,/reasoningEfforts/u);
  assert.match(source,/model default/i);
  assert.doesNotMatch(source,/reasoningEffort\s*=\s*['"]medium['"]/u);
});
