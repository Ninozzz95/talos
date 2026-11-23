#!/usr/bin/env node
/*
 * The CLI's gate for the kernel it vendors (`harness-ui/src`, `context-engine`): `npm run test:kernel` in cli/.
 *
 * Why it exists (revision of 07/10/2026): the CLI's own gate only counted `cli/test`, never `harness-ui/tests`. The kernel merge of 03/10
 * dropped three CLI patches (a child asking the person, ASYNC7 delegation defaults, C-005 approvals) and nothing went red where
 * anyone looked: the kernel suite had 153 red tests of 3,626, and two beta releases went out without those features.
 *
 * What it runs: every `harness-ui/tests/*.test.mjs` except the files listed, WITH A REASON, in `kernel-tests-excluded.json`
 * (tests that exercise the desktop app's server or frontend, which the CLI does not ship), plus the kernel core suite
 * `harness-ui/src/kernel/talosHarness.test.mjs`. The exclusions are data, not a silent skip: the script prints them and fails
 * if a listed file no longer exists (a stale exclusion hides a test that is back to being useful).
 *
 * Isolation: TEMP/TMP point to a private folder removed afterwards, like `scripts/run-tests.mjs`.
 */
import {existsSync, mkdtempSync, readFileSync, readdirSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname, join} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {spawn} from 'node:child_process';
import {batchFiles, formatTotals, runBatch, runBatches, sumTotals} from './kernel-tests-batches.mjs';
import {ambienteConGancio} from './gancio/percorsi.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const harness = join(here, '..', '..', 'harness-ui');
const tests = join(harness, 'tests');
const exclusions = JSON.parse(readFileSync(join(here, 'kernel-tests-excluded.json'), 'utf8'));
const excluded = exclusions.files;
const skippedTests = exclusions.tests ?? {};

const stale = Object.keys(excluded).filter(name => !existsSync(join(tests, name)));
if (stale.length) {
  console.error(`kernel tests: excluded files that do not exist any more (remove them from kernel-tests-excluded.json): ${stale.join(', ')}`);
  process.exit(2);
}
const testFiles = readdirSync(tests).filter(name => name.endsWith('.test.mjs'));
const allSources = [...testFiles.map(name => join(tests, name)), join(harness, 'src', 'kernel', 'talosHarness.test.mjs')].map(file => readFileSync(file, 'utf8')).join('\n');
const staleTests = Object.keys(skippedTests).filter(name => !allSources.includes(name));
if (staleTests.length) {
  console.error(`kernel tests: skipped test names that no test file contains any more (remove them from kernel-tests-excluded.json): ${staleTests.join(', ')}`);
  process.exit(2);
}
const files = readdirSync(tests).filter(name => name.endsWith('.test.mjs') && !(name in excluded)).sort().map(name => join('tests', name));
files.push(join('src', 'kernel', 'talosHarness.test.mjs'));
console.log(`kernel tests: ${files.length} files; ${Object.keys(excluded).length} excluded with a reason:`);
for (const [name, reason] of Object.entries(excluded)) console.log(`  - ${name}: ${reason}`);
console.log(`${Object.keys(skippedTests).length} single tests skipped by name, with a reason:`);
for (const [name, reason] of Object.entries(skippedTests)) console.log(`  - ${name}: ${reason}`);
const escapeRegExp = text => text.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
const skipArguments = Object.keys(skippedTests).map(name => `--test-skip-pattern=${escapeRegExp(name)}`);

/* 0.6.13 gate (25/10/2026): the 846 files and the skip flags on ONE command line were ~35,455 characters, over the 32,767 Windows
   allows; spawnSync failed with ENAMETOOLONG, `result.error` was never read, and the gate saw «KERNEL exit=1» with nothing run.
   The files now run in batches under a limit (scripts/kernel-tests-batches.mjs), each with the same skip flags; every batch's
   output stays on screen, the exit is 0 only if every batch passed, and the last `ℹ` lines are the total over all batches. */
const concurrency = process.env.TALOS_KERNEL_TEST_CONCURRENCY ?? '2';
/* 23/11/2026 (CLI 0.7.0 public): the environment already loads the trip wire (ambienteConGancio), but the line's check
   (harness-ui SHELL-KEYRING-HOOK-EVERY-LAUNCH) reads the launch itself, and the public CI runs it once cli/ is public:
   the desktop's own hook is named here too, the same file the environment loads on the line (ESM loads it once). */
const GANCIO_DEL_DESKTOP = join(harness, 'desktop', 'tests', 'gancio-portachiavi.mjs');
const fixedArgs = ['--test', `--import=${pathToFileURL(GANCIO_DEL_DESKTOP).href}`, `--test-concurrency=${concurrency}`, ...skipArguments];
const batches = batchFiles({execPath: process.execPath, fixedArgs, files});
console.log(`kernel tests: ${batches.length} batch(es) of ${batches.map(batch => batch.length).join(' + ')} files`);

const privateTemp = mkdtempSync(join(tmpdir(), 'talos-kernel-test-run-'));
let status = 0;
let totals = [];
try {
  /* «One line», step 3 (11/11/2026, judge v1499 point 1): the kernel's tests run under the desktop's keyring trip wire, as the
     desktop runs them (`harness-ui/package.json` of branch k, `node --test --import=./desktop/tests/gancio-portachiavi.mjs`):
     the line's file once k is in, the fingerprinted copy until then (scripts/gancio/percorsi.mjs). No exemption here. */
  const env = ambienteConGancio({...process.env, TEMP: privateTemp, TMP: privateTemp, TMPDIR: privateTemp});
  const options = {cwd: harness, env, stdio: ['ignore', 'pipe', 'pipe']};
  const run = batch => runBatch({spawn, execPath: process.execPath, args: [...fixedArgs, ...batch], options, stdout: process.stdout, stderr: process.stderr});
  ({status, totals} = await runBatches({batches, run, log: line => console.log(line), logError: line => console.error(line)}));
} finally {
  try { rmSync(privateTemp, {recursive: true, force: true, maxRetries: 10, retryDelay: 200}); } catch { /* a handle still open: the folder is in the OS temp */ }
}
console.log(`kernel tests: total over ${batches.length} batch(es), ${totals.length} with a summary, exit ${status}`);
process.stdout.write(formatTotals(sumTotals(totals)));
process.exitCode = status;
