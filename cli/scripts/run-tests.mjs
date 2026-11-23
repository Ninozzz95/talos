#!/usr/bin/env node
/*
 * R0 (2026-09-23). The CLI suites left ~1,400 folders in the owner's TEMP (measured by the desktop session; the PC
 * crashed twice). Every test run now gets a PRIVATE temp folder: TEMP, TMP and TMPDIR point inside it for the test
 * runner and every child it spawns, and the whole folder is removed when the run ends, whatever the outcome.
 * Default concurrency is 2 (low RAM); pass your own --test-concurrency to override.
 * usage: node scripts/run-tests.mjs [node --test arguments...]   (default: "test/**\/*.test.ts")
 */
import {spawnSync} from 'node:child_process';
import {existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {GANCIO_ATTACCATO, REGISTRO_DEL_TERMINALE, ambienteConGancio} from './gancio/percorsi.mjs';

const args = process.argv.slice(2);
const files = args.filter(arg => !arg.startsWith('--'));
const flags = args.filter(arg => arg.startsWith('--'));
if (!flags.some(flag => flag.startsWith('--test-concurrency'))) flags.push('--test-concurrency=2');
/* A run killed by a crash cannot remove its folder: at start, remove earlier private temps whose NEWEST write in the
   whole subtree is older than 24 h (Hermes tests/conftest.py and hermes_constants.py measure age on the subtree, not on
   the folder date, which is wrong both ways). A folder still being written by a live run is never older than that. */
const STALE_MS = 24 * 60 * 60 * 1000;
function newestWrite(dir) {
  let newest = statSync(dir).mtimeMs;
  for (const entry of readdirSync(dir, {withFileTypes: true})) {
    const full = path.join(dir, entry.name);
    try { newest = Math.max(newest, entry.isDirectory() && !entry.isSymbolicLink() ? newestWrite(full) : lstatSync(full).mtimeMs); } catch {}
  }
  return newest;
}
for (const name of readdirSync(tmpdir())) {
  if (!name.startsWith('talos-cli-test-run-')) continue;
  const full = path.join(tmpdir(), name);
  try { if (Date.now() - newestWrite(full) > STALE_MS) rmSync(full, {recursive: true, force: true, maxRetries: 5, retryDelay: 200}); } catch {}
}
const privateTemp = mkdtempSync(path.join(tmpdir(), 'talos-cli-test-run-'));
/* R3 (2026-09-24, lane SP disclosure): tests that call main() resolve the profile from APPDATA/LOCALAPPDATA on win32
   (XDG_* elsewhere) and create folders, development logs and active-run markers there, and read the user config. The
   runner therefore gives every run a PRIVATE profile too, inside the private temp, and drops secret-looking variables
   (owner rule: tests never see a real key and never touch the real %APPDATA%\TALOS-CLI or %LOCALAPPDATA%\TALOS-CLI). */
const SECRET = /(KEY|TOKEN|SECRET|PASSW|CRED|AUTH|PRIVATE)/iu;
const profile = Object.fromEntries(['appdata', 'localappdata', 'home', 'config', 'state', 'cache'].map(name => [name, path.join(privateTemp, 'profile', name)]));
for (const dir of Object.values(profile)) mkdirSync(dir, {recursive: true});
const env = Object.fromEntries(Object.entries(process.env).filter(([name]) => !SECRET.test(name)));
Object.assign(env, {
  TEMP: privateTemp, TMP: privateTemp, TMPDIR: privateTemp,
  APPDATA: profile.appdata, LOCALAPPDATA: profile.localappdata, HOME: profile.home,
  XDG_CONFIG_HOME: profile.config, XDG_STATE_HOME: profile.state, XDG_CACHE_HOME: profile.cache,
  TALOS_TEST_RUNNER_PROFILE: path.join(privateTemp, 'profile'),
});
/* «One line», step 3 (11/11/2026, judge v1499 point 1): every test process and every child it starts carries the desktop's
   keyring trip wire (scripts/gancio/percorsi.mjs: the line's file once branch k is in, the fingerprinted copy until then), plus
   the one exemption the terminal needs: a FAKE @napi-rs/keyring inside this run's private temp (scripts/gancio/finti-portachiavi.mjs). */
const traceLines = () => { try { return readFileSync(REGISTRO_DEL_TERMINALE, 'utf8').split('\n').filter(Boolean); } catch { return []; } };
const traceBefore = traceLines().length;
const hooked = ambienteConGancio(env, {finti: true, cartellaFinti: privateTemp});
let status = 1;
try {
  const result = spawnSync(process.execPath, ['--experimental-strip-types', '--test', ...flags, ...(files.length ? files : ['test/**/*.test.ts'])], {stdio: 'inherit', env: hooked});
  status = result.status ?? 1;
} finally {
  const leftovers = existsSync(privateTemp) ? readdirSync(privateTemp).length : 0;
  try { rmSync(privateTemp, {recursive: true, force: true, maxRetries: 10, retryDelay: 200}); } catch {}
  const remains = existsSync(privateTemp);
  process.stderr.write(`talos test run: private temp ${remains ? 'NOT fully removed' : 'removed'} (${leftovers} entries created by the tests)\n`);
  const blocked = traceLines().slice(traceBefore).filter(line => line.includes('"tipo":"bloccato"')).length;
  if (!GANCIO_ATTACCATO) process.stderr.write('talos test run: keyring trip wire DETACHED until branch k is green (judge v1534; scripts/gancio/percorsi.mjs)\n');
  else process.stderr.write(`talos test run: keyring trip wire ${blocked ? `BLOCKED ${blocked} load(s) of a keyring` : 'blocked nothing'} (trace ${REGISTRO_DEL_TERMINALE})\n`);
}
process.exitCode = status;
