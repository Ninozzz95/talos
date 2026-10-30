/*
 * Router mode of the local engine — the five reservations of the block 9 adversarial review, section J (27/10/2026, report
 * `REVISIONE-BLOCCO-9-2026-10-27.md`; the reviewer's own proofs are `J-router-revisione.test.mjs`, `J-taskkill-piantato.test.mjs`,
 * `J-preset-non-ascii.mjs`). Each one was red on `5e01391af` before its cure.
 *   RJ-1  J-R1 a data folder with non-ASCII letters: the router starts (preset and key passed by name, from the router's own folder)
 *   RJ-2  J-R2 a router alive that stops answering: the model is never loaded twice; the router is stopped, or nothing loads
 *   RJ-3  J-R3 a router that cannot start stops being restarted after a few tries, with the reason in status and log
 *   RJ-4  J-R4 taskkill by its full path: a planted taskkill.exe in the current folder or in PATH is never run
 *   RJ-5  J-R5 `.local-runtime-router/` is ignored by git
 * Fake router and fake standalone engine (`tests/aiuto/router-finto.mjs`), today's supervisor VERO inside, as `motore-locale-router.test.mjs`.
 */
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { copyFileSync, linkSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { createLlamaServerSupervisor } from '../src/llama-server-supervisor.mjs';
import { createLlamaRouterSupervisor } from '../src/llama-router-supervisor.mjs';
import { creaRouterFinto } from './aiuto/router-finto.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

const BIN = 'C:\\talos\\llama-server.exe';
const QUI = dirname(fileURLToPath(import.meta.url));

async function finche(condizione, { ms = 3_000, passo = 2 } = {}) {
  const scadenza = Date.now() + ms;
  while (Date.now() < scadenza) {
    if (await condizione()) return true;
    await new Promise((r) => setTimeout(r, passo));
  }
  throw new Error('condition not reached in time');
}

function prepara(t, { sottocartella = 'router', healthTimeoutMs = 2_000, attesaChiusuraMs = 200, uccidiAlbero, spawnImpl, fetchImpl, atteseDiRiavvioMs, attendi, vitaSanaMs, ...finto } = {}) {
  const cartella = mkdtempSync(join(tmpdir(), 'router-j-'));
  t.after(() => rimuoviCartellaDiProva(cartella));
  /* G-R1 (block 10 review): the router runs in the binary's folder, and a preset with no ASCII path goes beside it: inside the test folder */
  const BIN = join(cartella, 'bin', 'llama-server.exe');
  const a = join(cartella, 'a.gguf');
  const b = join(cartella, 'b.gguf');
  writeFileSync(a, 'GGUF-finto-a');
  writeFileSync(b, 'GGUF-finto-b');
  const banco = creaRouterFinto(finto);
  const lancia = spawnImpl ? (...x) => spawnImpl(banco, ...x) : banco.spawnImpl;
  const chiama = fetchImpl ? (...x) => fetchImpl(banco, ...x) : banco.fetchImpl;
  const standalone = createLlamaServerSupervisor({ binaryPath: BIN, spawnImpl: lancia, fetchImpl: chiama, portAllocator: banco.portAllocator,
    pollIntervalMs: 1, gpuLayers: 0, sondaBinario: () => '', attesaChiusuraMs });
  const presetFile = join(cartella, sottocartella, 'presets-4242.ini');
  const registro = [];
  const eventi = [];
  const alberiUccisi = [];
  const router = createLlamaRouterSupervisor({
    binaryPath: BIN, standalone, presetFile, spawnImpl: lancia, fetchImpl: chiama, portAllocator: banco.portAllocator,
    pollIntervalMs: 1, healthTimeoutMs, attesaChiusuraMs, registro: (testo) => registro.push(testo),
    modelliInstallati: async () => [{ modelId: 'mod-a', modelPath: a, opzioni: { contextLength: 8_192 } }, { modelId: 'mod-b', modelPath: b, opzioni: { contextLength: 8_192 } }],
    memoriaUtilizzabile: async () => null,
    /* null: the supervisor's own (the real taskkill), for J-R4 */
    ...(uccidiAlbero === null ? {} : { uccidiAlbero: uccidiAlbero ?? (async (figlio) => { alberiUccisi.push(figlio); figlio.kill('SIGTERM'); }) }),
    ...(atteseDiRiavvioMs ? { atteseDiRiavvioMs } : {}),
    ...(attendi ? { attendi } : {}),
    ...(vitaSanaMs !== undefined ? { vitaSanaMs } : {}),
  });
  router.subscribeLogs((voce) => eventi.push(voce));
  t.after(() => router.chiudi());
  return { cartella, a, b, BIN, banco, standalone, router, registro, eventi, presetFile, alberiUccisi };
}

const RESIDENTE = ['loading', 'loaded', 'sleeping'];

/* ── J-R1 ──────────────────────────────────────────────────────────────────────────────────────────────── */

test('RJ-1 J-R1 a data folder with non-ASCII letters (Jörg Müller\\モデル): the router reads its preset and key and loads the model', async (t) => {
  const p = prepara(t, { sottocartella: join('Jörg Müller', 'モデル', '.local-runtime-router') });
  const esito = await p.router.start({ modelId: 'mod-a', modelPath: p.a, contextLength: 8_192 });
  const r = p.banco.routers[0];
  assert.equal(esito.ripiegoRouter, undefined, `the router could not start: ${JSON.stringify(esito.ripiegoRouter)}`);
  assert.equal(esito.state, 'ready');
  assert.equal(p.banco.standalone.length, 0, 'today\'s engine never started');
  assert.equal(r.stati.get('mod-a').value, 'loaded');
  const { args, opzioni } = p.banco.spawn[0];
  /* what crosses the narrow-string boundary is ASCII. ⛔ G-R1 (block 10 review): the current folder is the BINARY's (UTF-16), never the
     data folder; with no ASCII path to the data folder, preset and key go to talos-router\ beside the binary */
  assert.equal(opzioni.cwd, dirname(p.BIN));
  assert.equal(args[args.indexOf('--models-preset') + 1], join('talos-router', 'presets-4242.ini'));
  assert.equal(opzioni.env.LLAMA_ARG_API_KEY_FILE, join('talos-router', 'presets-4242.key'));
  assert.equal(r.preset, join(dirname(p.BIN), 'talos-router', 'presets-4242.ini'));
});

test('RJ-1b J-R1 a preset file whose own name is not ASCII is refused at once, never handed to the router', () => {
  const standalone = createLlamaServerSupervisor({ binaryPath: BIN, sondaBinario: () => '' });
  assert.throws(() => createLlamaRouterSupervisor({ binaryPath: BIN, standalone, presetFile: join(tmpdir(), 'presèts.ini') }),
    (e) => e.code === 'RUNTIME_MISCONFIGURED');
});

/* ── J-R2 ──────────────────────────────────────────────────────────────────────────────────────────────── */

test('RJ-2 J-R2 a router alive that stops answering while it loads the model: it is stopped (proven by its exit) before today\'s engine loads the same model', async (t) => {
  const p = prepara(t, { ritardoMs: 5 });
  await p.router.start({ modelId: 'mod-a', modelPath: p.a, contextLength: 8_192 });
  const r = p.banco.routers[0];
  await p.router.stop();
  const avvio = p.router.start({ modelId: 'mod-a', modelPath: p.a, contextLength: 8_192 });
  await finche(() => r.caricati.filter((c) => c.nome === 'mod-a').length === 2);
  p.banco.reteRotta = (percorso) => percorso.startsWith('/models');
  const esito = await avvio;
  assert.equal(esito.ripiegoRouter?.codice, 'ROUTER_UNREACHABLE');
  assert.equal(esito.state, 'ready');
  assert.equal(p.banco.standalone.filter((s) => s.vivo).length, 1, 'today\'s engine holds mod-a');
  assert.ok(!(r.vivo && RESIDENTE.includes(r.stati.get('mod-a').value)), `mod-a is loaded twice: the router is alive and holds it «${r.stati.get('mod-a').value}»`);
  assert.deepEqual(p.alberiUccisi, [r], 'the router\'s tree was stopped');
  assert.equal(r.vivo, false);
  assert.match(p.registro.join(''), /the router did not let go of its models: its process tree was stopped/u);
});

test('RJ-2b J-R2 a router that answers but whose models do not leave the memory in time: stopped too, before today\'s engine loads', async (t) => {
  const p = prepara(t, { esito: () => 'bloccato', scaricoMs: 60_000, healthTimeoutMs: 80 });
  const esito = await p.router.start({ modelId: 'mod-a', modelPath: p.a, contextLength: 8_192 });
  const r = p.banco.routers[0];
  assert.equal(esito.ripiegoRouter?.codice, 'ROUTER_LOAD_STUCK');
  assert.equal(esito.state, 'ready');
  assert.ok(!(r.vivo && RESIDENTE.includes(r.stati.get('mod-a').value)), `mod-a is loaded twice: the router holds it «${r.stati.get('mod-a').value}»`);
  assert.deepEqual(p.alberiUccisi, [r]);
});

test('RJ-2c J-R2 a router that answers nothing and cannot be stopped: today\'s engine does NOT load, and the person is told why', async (t) => {
  const p = prepara(t, { ritardoMs: 5, uccidiAlbero: async () => { /* taskkill failed: the router stays alive */ } });
  await p.router.start({ modelId: 'mod-a', modelPath: p.a, contextLength: 8_192 });
  const r = p.banco.routers[0];
  await p.router.stop();
  const avvio = p.router.start({ modelId: 'mod-a', modelPath: p.a, contextLength: 8_192 });
  await finche(() => r.caricati.filter((c) => c.nome === 'mod-a').length === 2);
  p.banco.reteRotta = (percorso) => percorso.startsWith('/models');
  const errore = await avvio.catch((e) => e);
  assert.ok(errore instanceof Error, 'the load is refused');
  /* G-R6 (block 10 review): its own code, with its own card in the chat (CONDIZIONI_PRIMA_DELLA_RETE passes it as it is) */
  assert.equal(errore.code, 'RUNTIME_ROUTER_NOT_STOPPED');
  assert.match(errore.message, /could not be stopped/u);
  assert.match(errore.message, /mod-a/u);
  assert.equal(errore.ripiegoRouter?.codice, 'ROUTER_UNREACHABLE');
  assert.equal(p.banco.standalone.length, 0, 'today\'s engine never started: no second copy of the model');
  assert.equal(p.router.status().state, 'failed');
  assert.match(p.registro.join(''), /could not be stopped/u);
});

/* ── J-R3 ──────────────────────────────────────────────────────────────────────────────────────────────── */

test('RJ-3 J-R3 a router that can never start: a few restarts, then none until a router comes up, with the reason in status and log', async (t) => {
  let rotto = true;
  const spawnImpl = (banco, bin, args, opz) => {
    const c = banco.spawnImpl(bin, args, opz);
    if (rotto && args.includes('--models-preset')) {
      c.vivo = false;
      setTimeout(() => { c.stderr.emit('data', 'E srv  llama_server: failed to initialize router models: preset file does not exist\n'); c.emit('close', 1); }, 1);
    }
    return c;
  };
  const attendi = async (ms, signal) => { await new Promise((r) => setTimeout(r, ms === 3_000 ? 50 : 5)); if (signal?.aborted) throw new Error('aborted'); };
  const p = prepara(t, { spawnImpl, attendi, healthTimeoutMs: 200 });
  const esito = await p.router.start({ modelId: 'mod-a', modelPath: p.a, contextLength: 8_192 });
  assert.equal(esito.state, 'ready', 'today\'s engine took the model');
  await finche(() => p.router.status().router.fermo !== null, { ms: 3_000 });
  const nati = p.banco.routers.length;
  await new Promise((r) => setTimeout(r, 300));
  assert.equal(p.banco.routers.length, nati, `still restarting: ${p.banco.routers.length - nati} more routers in 300 ms`);
  assert.equal(nati, 5, 'the first start and four restarts (Hermes\' backoff table, once each)');
  const fermo = p.router.status().router.fermo;
  assert.equal(fermo.tentativi, 5);
  assert.match(fermo.motivo, /preset file does not exist/u);
  assert.match(p.registro.join(''), /failed to start 5 times in a row: no more restarts until the next load/u);

  /* a load the person asks for still tries the router once; one that comes up healthy clears the stop, and restarts work again */
  rotto = false;
  await p.router.stop();
  const dopo = await p.router.start({ modelId: 'mod-b', modelPath: p.b, contextLength: 8_192 });
  assert.equal(dopo.ripiegoRouter, undefined);
  assert.equal(p.router.status().router.fermo, null);
  const prima = p.banco.routers.length;
  p.banco.routerVivo().cade();
  await finche(() => p.banco.routers.length === prima + 1 && p.router.status().state === 'ready', { ms: 3_000 });
});

test('RJ-3b J-R3 the count is of failures IN A ROW: a restart that works clears it, and four failures after it do not stop the restarts', async (t) => {
  /* per router spawn: false = exits at once, true = healthy. 3 failures, a healthy restart, then (after a crash) 4 failures and a healthy one */
  const piano = [false, false, false, true, false, false, false, false, true];
  let nati = 0;
  const spawnImpl = (banco, bin, args, opz) => {
    const c = banco.spawnImpl(bin, args, opz);
    if (args.includes('--models-preset') && piano[nati++] === false) {
      c.vivo = false;
      setTimeout(() => { c.stderr.emit('data', 'E srv  llama_server: failed to initialize router models\n'); c.emit('close', 1); }, 1);
    }
    return c;
  };
  const attendi = async (ms, signal) => { await new Promise((r) => setTimeout(r, ms === 3_000 ? 50 : 5)); if (signal?.aborted) throw new Error('aborted'); };
  /* ⛔ G-R3 (block 10 review): a restart «works» only once its router has STAYED up for the last backoff step (`vitaSanaMs`): a router
     that dies right after it came up is a failed start. Here the healthy restart stays up longer than that before it dies. */
  const p = prepara(t, { spawnImpl, attendi, healthTimeoutMs: 200, vitaSanaMs: 50 });
  await p.router.start({ modelId: 'mod-a', modelPath: p.a, contextLength: 8_192 });
  await finche(() => p.banco.routers.length === 4 && p.banco.routerVivo() !== null, { ms: 3_000 });
  await new Promise((r) => setTimeout(r, 120));
  p.banco.routerVivo().cade();
  await finche(() => p.banco.routers.length === 9 && p.banco.routerVivo() !== null, { ms: 3_000 });
  assert.equal(p.router.status().router.fermo, null);
});

test('RJ-3c J-R3 a router that comes up but dies every time it loads the model again: the restarts stop too', async (t) => {
  let cadeAlCarico = false;
  /* the router dies as it starts loading: its exit is seen before the next poll (with the real binary either can come first) */
  const fetchImpl = async (banco, indirizzo, init) => {
    const r = banco.routerVivo();
    const risposta = await banco.fetchImpl(indirizzo, init);
    if (cadeAlCarico && r && String(indirizzo).endsWith('/models/load')) {
      r.vivo = false;
      for (const f of r.flussi) { try { f.close(); } catch { /* closed */ } }
      r.stderr.emit('data', 'srv  main: fatal crash while loading\n');
      r.emit('close', 3);
    }
    return risposta;
  };
  const attendi = async (ms, signal) => { await new Promise((r) => setTimeout(r, ms === 3_000 ? 50 : 5)); if (signal?.aborted) throw new Error('aborted'); };
  const p = prepara(t, { fetchImpl, attendi, ritardoMs: 20 });
  await p.router.start({ modelId: 'mod-a', modelPath: p.a, contextLength: 8_192 });
  cadeAlCarico = true;
  p.banco.routerVivo().cade();
  await finche(() => p.router.status().router.fermo !== null, { ms: 3_000 });
  const nati = p.banco.routers.length;
  await new Promise((r) => setTimeout(r, 300));
  assert.equal(p.banco.routers.length, nati, 'still restarting');
  assert.equal(nati, 1 + 5, 'the first router, then five restarts that came up and died loading the model');
  assert.match(p.router.status().router.fermo.motivo, /the router exited during the load/u);
});

/* ── J-R4 ──────────────────────────────────────────────────────────────────────────────────────────────── */

const suWindows = process.platform === 'win32';
/*
 * The planted `taskkill.exe` is a hard link (or copy) of node.exe: run as `taskkill /PID n /T /F` it looks for a script named `/PID` and
 * exits 1 having killed nothing. So «the victim is still alive» means the planted one ran, «the victim is gone» means the system's did.
 * ⛔ The reviewer's lesson: with `NoDefaultCurrentDirectoryInExePath` in the environment Windows skips the current folder and the old code
 *   looks safe for the wrong reason. The variable is removed for these tests, and its absence is asserted.
 */
function piantaTaskkill(t) {
  const cartella = mkdtempSync(join(tmpdir(), 'router-j-piantato-'));
  t.after(() => rimuoviCartellaDiProva(cartella));
  const finto = join(cartella, 'taskkill.exe');
  try { linkSync(process.execPath, finto); } catch { copyFileSync(process.execPath, finto); }
  return cartella;
}
function senzaNoDefault(t) {
  const prima = process.env.NoDefaultCurrentDirectoryInExePath;
  delete process.env.NoDefaultCurrentDirectoryInExePath;
  t.after(() => { if (prima !== undefined) process.env.NoDefaultCurrentDirectoryInExePath = prima; });
  assert.equal(process.env.NoDefaultCurrentDirectoryInExePath, undefined);
}
function vittima(t) {
  const v = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 60000)'], { stdio: 'ignore', windowsHide: true });
  t.after(() => { try { v.kill(); } catch { /* gone */ } });
  return v;
}
const viva = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };
async function conCartellaCorrente(cartella, fn) {
  const prima = process.cwd();
  process.chdir(cartella);
  try { return await fn(); } finally { process.chdir(prima); }
}

test('RJ-4 J-R4 the router\'s shutdown with a taskkill.exe planted in the server\'s current folder: the system\'s taskkill ends the tree', { skip: !suWindows && 'Windows only' }, async (t) => {
  senzaNoDefault(t);
  const piantato = piantaTaskkill(t);
  const v = vittima(t);
  const p = prepara(t, {
    spawnImpl: (banco, bin, args, opz) => { const c = banco.spawnImpl(bin, args, opz); if (args.includes('--models-preset')) c.pid = v.pid; return c; },
    uccidiAlbero: null,
  });
  await p.router.start({ modelId: 'mod-a', modelPath: p.a, contextLength: 8_192 });
  await conCartellaCorrente(piantato, () => p.router.chiudi());
  await finche(() => !viva(v.pid), { ms: 5_000, passo: 50 }).catch(() => {});
  assert.equal(viva(v.pid), false, 'the router\'s tree is still alive: the planted taskkill.exe ran instead of the system\'s');
});

test('RJ-4b J-R4 the same with the planted folder at the head of the server\'s PATH (current folder clean)', { skip: !suWindows && 'Windows only' }, async (t) => {
  senzaNoDefault(t);
  const piantato = piantaTaskkill(t);
  const pulita = mkdtempSync(join(tmpdir(), 'router-j-pulita-'));
  t.after(() => rimuoviCartellaDiProva(pulita));
  const v = vittima(t);
  const p = prepara(t, {
    spawnImpl: (banco, bin, args, opz) => { const c = banco.spawnImpl(bin, args, opz); if (args.includes('--models-preset')) c.pid = v.pid; return c; },
    uccidiAlbero: null,
  });
  await p.router.start({ modelId: 'mod-a', modelPath: p.a, contextLength: 8_192 });
  const pathPrima = process.env.PATH;
  process.env.PATH = `${piantato};${pathPrima}`;
  try { await conCartellaCorrente(pulita, () => p.router.chiudi()); } finally { process.env.PATH = pathPrima; }
  await finche(() => !viva(v.pid), { ms: 5_000, passo: 50 }).catch(() => {});
  assert.equal(viva(v.pid), false, 'the planted taskkill.exe in PATH ran instead of the system\'s');
});

test('RJ-4c J-R4 the other two taskkill callers (adopted background commands, the driven browser) use the system\'s too', { skip: !suWindows && 'Windows only' }, async (t) => {
  senzaNoDefault(t);
  const piantato = piantaTaskkill(t);
  const { fermaAlberoWindows } = await import('../src/impronta-processo.mjs');
  const { terminaAlberoDiSistema } = await import('../src/browser-vivo.mjs');
  const v1 = vittima(t);
  const v2 = vittima(t);
  await conCartellaCorrente(piantato, async () => {
    await fermaAlberoWindows(v1.pid);
    await terminaAlberoDiSistema({ pid: v2.pid, kill: () => true });
  });
  await finche(() => !viva(v1.pid) && !viva(v2.pid), { ms: 5_000, passo: 50 }).catch(() => {});
  assert.deepEqual({ adottato: viva(v1.pid), browser: viva(v2.pid) }, { adottato: false, browser: false }, 'a planted taskkill.exe ran');
});

test('RJ-4d J-R4 the taskkill path: SystemRoot only when it is a drive root with a letter, else C:\\Windows (the C-R2 rule)', async () => {
  const { percorsoTaskkill } = await import('../src/taskkill-di-sistema.mjs');
  assert.equal(percorsoTaskkill('C:\\Windows'), 'C:\\Windows\\System32\\taskkill.exe');
  assert.equal(percorsoTaskkill('D:\\WinNT'), 'D:\\WinNT\\System32\\taskkill.exe');
  for (const falso of [null, '','Windows', '\\Windows', '\\\\server\\share', '..\\x', 'C:Windows', '/c/Windows']) {
    assert.equal(percorsoTaskkill(falso), 'C:\\Windows\\System32\\taskkill.exe', String(falso));
  }
});

/* ── J-R5 ──────────────────────────────────────────────────────────────────────────────────────────────── */

test('RJ-5 J-R5 what the router writes beside server.mjs (preset, key, the atomic temporary) is ignored by git', (t) => {
  let radice;
  try { radice = execFileSync('git', ['-C', QUI, 'rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim(); } catch { t.skip('git not available'); return; }
  for (const file of ['presets-1234.ini', 'presets-1234.key', 'presets-1234.ini.1234.tmp']) {
    const percorso = `harness-ui/.local-runtime-router/${file}`;
    let ignorato = true;
    try { execFileSync('git', ['-C', radice, 'check-ignore', '-q', '--no-index', percorso]); } catch { ignorato = false; }
    assert.equal(ignorato, true, `${percorso} is not ignored: a git add -A would take it`);
  }
});
