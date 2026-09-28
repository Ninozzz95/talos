import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { rimuoviCartellaDiProvaAttesa } from './aiuto/rimuovi-cartella-di-prova.mjs';

const execFileAsync = promisify(execFile);
const hfTest = fileURLToPath(new URL('./hf-direct-transfer.test.mjs', import.meta.url));

test('DESK-TEMP-HF-DIRECT-CLEANUP — test fixtures leave no private model roots', async (t) => {
  const sandbox = await mkdtemp(join(tmpdir(), 'talos-temp-hf-gate-'));
  t.after(() => rimuoviCartellaDiProvaAttesa(sandbox));
  const env = { ...process.env, TEMP: sandbox, TMP: sandbox, TMPDIR: sandbox };
  delete env.NODE_TEST_CONTEXT;
  const { stdout: childTemp } = await execFileAsync(process.execPath, ['-e', 'process.stdout.write(require("node:os").tmpdir())'], { env });
  assert.equal(childTemp, sandbox, 'child must allocate fixtures only in the test-owned temp sandbox');
  const { stdout, stderr } = await execFileAsync(process.execPath, ['--test', hfTest], {
    env,
    maxBuffer: 2 * 1024 * 1024,
  });
  assert.match(stdout + stderr, /\btests 6\b/, 'all six HF fixture cases must execute in the child');
  const leftovers = (await readdir(sandbox)).filter((name) => name.startsWith('talos-hf-direct-'));
  assert.deepEqual(leftovers, [], `HF fixture roots survived child exit: ${leftovers.join(', ')}`);
});
