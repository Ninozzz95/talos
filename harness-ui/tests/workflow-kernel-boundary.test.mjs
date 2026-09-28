import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('KERNEL-BOUNDARY — Workflow Phase 1 stays server-side and outside shared kernel/Ask', async () => {
  const [kernel, ask] = await Promise.all([
    readFile(new URL('../src/kernel/talosHarness.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../src/user-question-contract.mjs', import.meta.url), 'utf8'),
  ]);
  assert.doesNotMatch(kernel, /(?:from|import\()\s*['"][^'"]*workflow\//u);
  assert.doesNotMatch(ask, /(?:from|import\()\s*['"][^'"]*workflow\//u);
  const modules = await Promise.all([
    import('../src/workflow/canonical-json.mjs'),
    import('../src/workflow/contract.mjs'),
    import('../src/workflow/indexes.mjs'),
    import('../src/workflow/run.mjs'),
  ]);
  assert.equal(modules.every((entry) => typeof entry === 'object'), true);
});
