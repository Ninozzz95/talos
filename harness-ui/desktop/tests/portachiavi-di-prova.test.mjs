import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { creaAvvioFiglio } from '../runtime.mjs';
import { preparaRuntime, root, lineeDelGancio, figlioColGancio } from './support.mjs';

/*
 * 10/11/2026 (owner, 21:36: «first an agent puts the guard in place, then it runs»). Measured on b449e91df: `preparaRuntime`
 * filtered every `TALOS_` variable out of the test environment, `TALOS_HARNESS_UI_KEYRING=memoria` included, and added back only
 * the data folder, the harness folder and the intro switch. `creaAvvioFiglio` (runtime.mjs:63-110) then gave the child server the
 * `desktop` keyring scope, the namespace of the INSTALLED app, and with no test keyring `server.mjs:220` ran the legacy key copy
 * and `:261` armed the ChatGPT renewal lock: every shell test run opened the owner's real Windows Credential Manager.
 *
 * Pure test, no window and no child process: the REAL `preparaRuntime`, the REAL `creaAvvioFiglio`, and the keyring reader of the
 * runtime COPY the child server would load (`<runtime>/src/adattatore-keyring.mjs`), not a copy of their logic.
 * The ambient value is hostile on purpose (a valid `modulo:` choice): the test environment must say `memoria` by itself, never
 * inherit whatever the machine or the CI happens to carry. Nothing is deleted: the folder stays in `.prove/` like every other.
 */
test('SHELL-KEYRING — the shell test environment carries the in-memory keyring down to the child server', async () => {
  const NOME = 'TALOS_HARNESS_UI_KEYRING';
  const prima = process.env[NOME];
  process.env[NOME] = 'modulo:' + fileURLToPath(import.meta.url);
  let prova;
  try { prova = preparaRuntime('portachiavi'); } finally {
    if (prima === undefined) delete process.env[NOME]; else process.env[NOME] = prima;
  }
  const { dataDir, runtime, env } = prova;

  // Same call shape as `backend.spec.mjs:24`; `main.mjs:263` passes no `env`, so the shell hands its own environment (this one) over.
  const avvio = creaAvvioFiglio({ execPath: process.execPath, percorsi: { root: runtime, server: join(runtime, 'server.mjs'), bootstrap: join(root, 'child-bootstrap.mjs') },
    port: 49152, token: 'a'.repeat(64), reportFile: join(dataDir, 'handshake.json'), dataDir, env });
  const figlio = avvio.options.env;
  const { leggiPortachiaviDiProva, leggiScopePortachiavi } = await import(pathToFileURL(join(runtime, 'src', 'adattatore-keyring.mjs')).href);
  // The pair `server.mjs:220` reads: scope `desktop` AND no test keyring = the copy from the owner's real keyring. It must be false.
  assert.equal(leggiScopePortachiavi(figlio), 'desktop', 'the launcher still gives the child the scope of the installed app');
  assert.equal(leggiPortachiaviDiProva(figlio), true, 'the child server must read the in-memory test keyring, not the system one');

  assert.equal(env[NOME], 'memoria', 'preparaRuntime must set the test keyring itself, after its own filter');
  /* On Windows a child receives only the first spelling in lexicographic order (nodejs.org/docs/latest-v24.x/api/child_process.html,
     `options.env`): a second spelling left in the copy could win over the right one. */
  assert.deepEqual(Object.keys(figlio).filter(k => k.toUpperCase() === NOME), [NOME], 'one spelling only');
  /* 11/11/2026 (round 2, judge v1364 B3): two lines here copied the `oldEnv` logic of `preferences-restart.spec.mjs:128-129` and
     could not fail when the spec changed. The spec's own lines are now lifted and run by `lanci-col-portachiavi-di-prova.test.mjs`. */
});

/*
 * 11/11/2026 (round 2, judge v1364 B4): the controller's three probes of 10/11 (`C:/T/ctrl-guscio-portachiavi/sonda`), now in the
 * branch. They closed two holes the test above left open: the variable ABSENT from the ambient (the owner's own launch condition:
 * above it is hostile, never absent), and a REAL child process that goes through the real `child-bootstrap.mjs` (above the test
 * stops at `avvio.options.env`, so a bootstrap that deleted the variable inside the child stayed alive).
 */
function conAmbiente(valore, fn) {
  const NOME = 'TALOS_HARNESS_UI_KEYRING';
  const prima = process.env[NOME];
  if (valore === undefined) delete process.env[NOME]; else process.env[NOME] = valore;
  try { return fn(); } finally { if (prima === undefined) delete process.env[NOME]; else process.env[NOME] = prima; }
}
function avvioDi(prova, extra = {}) {
  return creaAvvioFiglio({ execPath: process.execPath, percorsi: { root: prova.runtime, server: join(prova.runtime, 'server.mjs'), bootstrap: join(root, 'child-bootstrap.mjs') },
    port: 49152, token: 'a'.repeat(64), reportFile: join(prova.dataDir, 'handshake.json'), dataDir: prova.dataDir, env: prova.env, ...extra });
}
const lettoreDi = prova => import(pathToFileURL(join(prova.runtime, 'src', 'adattatore-keyring.mjs')).href);

test('SHELL-KEYRING-ABSENT — with the variable absent from the ambient the test environment still says memoria', async () => {
  const prova = conAmbiente(undefined, () => preparaRuntime('portachiavi-assente'));
  const { leggiPortachiaviDiProva } = await lettoreDi(prova);
  assert.equal(prova.env.TALOS_HARNESS_UI_KEYRING, 'memoria');
  assert.equal(leggiPortachiaviDiProva(avvioDi(prova).options.env), true);
  // The installed flag and the preview scope do not strip it either.
  assert.equal(leggiPortachiaviDiProva(avvioDi(prova, { installata: true }).options.env), true);
  assert.equal(leggiPortachiaviDiProva(avvioDi(prova, { keyringScope: 'desktop-preview' }).options.env), true);
});

test('SHELL-KEYRING-CHILD — a real child through the real child-bootstrap sees memoria in its own process.env', async () => {
  const prova = conAmbiente('modulo:' + fileURLToPath(import.meta.url), () => preparaRuntime('portachiavi-figlio'));
  const avvio = avvioDi(prova);
  const finto = join(prova.dataDir, 'finto-server.mjs');
  const lettoreUrl = pathToFileURL(join(prova.runtime, 'src', 'adattatore-keyring.mjs')).href;
  writeFileSync(finto, [
    'const m = await import(' + JSON.stringify(lettoreUrl) + ');',
    'const grafie = Object.keys(process.env).filter(k => k.toUpperCase() === "TALOS_HARNESS_UI_KEYRING");',
    'process.stdout.write(JSON.stringify({ prova: m.leggiPortachiaviDiProva(process.env), scope: m.leggiScopePortachiavi(process.env), grafie, runAsNode: process.env.ELECTRON_RUN_AS_NODE ?? null, appdata: process.env.APPDATA ?? null }));',
    '',
  ].join('\n'));
  // Same command shape as the launcher (`--import <bootstrap> <server>`), plain Node, a stub in place of the server, no IPC channel.
  assert.equal(avvio.args[0], '--import');
  const primaDelLancio = lineeDelGancio();
  const r = spawnSync(avvio.command, [avvio.args[0], avvio.args[1], finto], { cwd: prova.dataDir, env: avvio.options.env, encoding: 'utf8', windowsHide: true, shell: false, timeout: 20000 });
  assert.equal(r.status, 0, 'stub exit: ' + r.status + ' ' + String(r.stderr).slice(0, 400));
  /* 11/11/2026 (round 3, K1): `creaAvvioFiglio` drops NODE_OPTIONS, yet the child must carry the keyring hook: the spawn wrapper of
     the hook that `tests/support.mjs` loads puts it back. The child itself wrote the line, so this is the positive check. */
  assert.ok(figlioColGancio(r.pid, primaDelLancio), 'the stub child must have loaded the keyring hook (tests/gancio-portachiavi.mjs)');
  const visto = JSON.parse(r.stdout);
  assert.deepEqual({ prova: visto.prova, scope: visto.scope, grafie: visto.grafie, runAsNode: visto.runAsNode },
    { prova: true, scope: 'desktop', grafie: ['TALOS_HARNESS_UI_KEYRING'], runAsNode: null });
  assert.equal(visto.appdata, process.env.APPDATA ?? null, 'the stub child lives in the profile of the test runner, nothing else');
});

/*
 * 11/11/2026 (round 3, judge v1401 K2): invented provider keys planted in the runner's environment never reach the test environment,
 * neither by name nor by value under another name. The values are made up here; the real keys are never read.
 */
test('SHELL-KEYRING-NOKEYS (K2) — invented keys in the ambient stay out of the environment the shell tests hand down', () => {
  const finte = { GEMINI_API_KEY: 'finto-k2-0001', OPENAI_API_KEY: 'finto-k2-0002', OPENROUTER_API_KEY: 'finto-k2-0003', ANTHROPIC_API_KEY: 'finto-k2-0004', HF_TOKEN: 'finto-k2-0005', FINTO_PROVA_API_KEY: 'finto-k2-0006' };
  const prima = Object.fromEntries(Object.keys(finte).map(k => [k, process.env[k]]));
  Object.assign(process.env, finte);
  let prova;
  try { prova = conAmbiente(undefined, () => preparaRuntime('portachiavi-chiavi')); }
  finally { for (const [k, v] of Object.entries(prima)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; } }
  const valori = new Set(Object.values(finte));
  for (const env of [prova.env, avvioDi(prova).options.env]) {
    assert.deepEqual(Object.keys(env).filter(k => k.toUpperCase() in finte), [], 'provider key names reach the child');
    assert.deepEqual(Object.keys(env).filter(k => valori.has(String(env[k]))), [], 'a planted value reaches the child under another name');
  }
});
