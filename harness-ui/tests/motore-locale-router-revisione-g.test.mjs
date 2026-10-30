/*
 * Router mode of the local engine — the six reservations of the block 10 adversarial review, section G (27/10/2026, report
 * `REVISIONE-BLOCCO-10-2026-10-27.md`; the reviewer's own proofs are `G-router-b10.test.mjs` (G5, G6, G7), `G-dll-cartella-router.mjs`,
 * `G-taskkill-cura.test.mjs`, `G-frase-j-r2.mjs`). Each one was red on `c5ce4e453` before its cure.
 *   RG-1  G-R1 the router (and so its children) runs in the BINARY's folder, never in the data folder: ggml loads every
 *         `ggml-<backend>-*.dll` of the current folder (`ggml/src/ggml-backend-reg.cpp:486-499`, clone f849095)
 *   RG-2  G-R2 the reviewer's G5: a router that answers the first GET /models and then stops answering mid-unload (mutant MG10-2)
 *   RG-3  G-R3 a router that comes up and dies at once, with no model to load again, stops being restarted
 *   RG-4  G-R4 a restarted router alive but silent on /health is stopped, counts as a failed start, and the status says so
 *   RG-5  G-R5 powershell.exe and wsl.exe of the server modules by their full path under SystemRoot
 *   RG-6  G-R6 the J-R2 sentence has its own code (RUNTIME_ROUTER_NOT_STOPPED) and says what the person can do
 * Fake router and fake standalone engine (`tests/aiuto/router-finto.mjs`), today's supervisor VERO inside; RG-1-VERO runs the shipped
 * binary when `TALOS_PROVA_ROUTER_BINARIO` and `TALOS_PROVA_ROUTER_GGUF` are set and a `gcc` is on PATH (to build the harmless DLL).
 */
import assert from 'node:assert/strict';
import { copyFileSync, existsSync, linkSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import test from 'node:test';

import { createLlamaServerSupervisor } from '../src/llama-server-supervisor.mjs';
import { createLlamaRouterSupervisor } from '../src/llama-router-supervisor.mjs';
import { creaRouterFinto } from './aiuto/router-finto.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

const suWindows = process.platform === 'win32';
const attesa = (ms) => new Promise((r) => setTimeout(r, ms));
async function finche(condizione, { ms = 3_000, passo = 2 } = {}) {
  const scadenza = Date.now() + ms;
  while (Date.now() < scadenza) {
    if (await condizione()) return true;
    await attesa(passo);
  }
  throw new Error('condition not reached in time');
}

/**
 * `binario` and `dati` are folders RELATIVE to a fresh temporary folder: where the (fake) llama-server lives and where the data folder
 * is. The fake binary is never run: only its folder matters (the router's current folder, and the reserve place for the preset).
 */
function prepara(t, { binario = 'bin', dati = 'dati', healthTimeoutMs = 2_000, attesaChiusuraMs = 200, uccidiAlbero, spawnImpl, fetchImpl,
  atteseDiRiavvioMs, attendi, vitaSanaMs, ...finto } = {}) {
  const cartella = mkdtempSync(join(tmpdir(), 'router-g-'));
  t.after(() => rimuoviCartellaDiProva(cartella));
  const a = join(cartella, 'a.gguf');
  const b = join(cartella, 'b.gguf');
  writeFileSync(a, 'GGUF-finto-a');
  writeFileSync(b, 'GGUF-finto-b');
  const BIN = join(cartella, binario, 'llama-server.exe');
  mkdirSync(dirname(BIN), { recursive: true });
  const banco = creaRouterFinto(finto);
  const lancia = spawnImpl ? (...x) => spawnImpl(banco, ...x) : banco.spawnImpl;
  const chiama = fetchImpl ? (...x) => fetchImpl(banco, ...x) : (...x) => banco.fetchImpl(...x);
  const presetFile = join(cartella, dati, '.local-runtime-router', 'presets-4242.ini');
  const registro = [];
  const eventi = [];
  const alberiUccisi = [];
  const quandoNasceIlMotoreDiOggi = [];
  const lanciaConMisura = (bin, args, opz) => {
    if (!args.includes('--models-preset')) {
      const r = banco.routers.at(-1);
      quandoNasceIlMotoreDiOggi.push({ routerVivo: r?.vivo ?? false, statoModA: r?.stati?.get('mod-a')?.value ?? null });
    }
    return lancia(bin, args, opz);
  };
  const standalone = createLlamaServerSupervisor({ binaryPath: BIN, spawnImpl: lanciaConMisura, fetchImpl: chiama, portAllocator: banco.portAllocator,
    pollIntervalMs: 1, gpuLayers: 0, sondaBinario: () => '', attesaChiusuraMs });
  const router = createLlamaRouterSupervisor({
    binaryPath: BIN, standalone, presetFile, spawnImpl: lanciaConMisura, fetchImpl: chiama, portAllocator: banco.portAllocator,
    pollIntervalMs: 1, healthTimeoutMs, attesaChiusuraMs, registro: (testo) => registro.push(testo),
    modelliInstallati: async () => [{ modelId: 'mod-a', modelPath: a, opzioni: { contextLength: 8_192 } }, { modelId: 'mod-b', modelPath: b, opzioni: { contextLength: 8_192 } }],
    memoriaUtilizzabile: async () => 64 * 2 ** 30,
    ...(uccidiAlbero === null ? {} : { uccidiAlbero: uccidiAlbero ?? (async (figlio) => { alberiUccisi.push(figlio); figlio.kill('SIGTERM'); }) }),
    ...(atteseDiRiavvioMs ? { atteseDiRiavvioMs } : {}),
    ...(attendi ? { attendi } : {}),
    ...(vitaSanaMs !== undefined ? { vitaSanaMs } : {}),
  });
  router.subscribeLogs((voce) => eventi.push(voce));
  t.after(() => router.chiudi());
  return { cartella, a, b, BIN, banco, standalone, router, registro, eventi, presetFile, alberiUccisi, quandoNasceIlMotoreDiOggi };
}

/* ── G-R1 ──────────────────────────────────────────────────────────────────────────────────────────────── */

test('RG-1a G-R1 the router runs in the BINARY\'s folder (as today\'s engine and Hermes), never in the data folder; an ASCII preset goes by its full path', async (t) => {
  const p = prepara(t);
  const esito = await p.router.start({ modelId: 'mod-a', modelPath: p.a, contextLength: 8_192 });
  assert.equal(esito.ripiegoRouter, undefined, JSON.stringify(esito.ripiegoRouter));
  const { args, opzioni } = p.banco.spawn[0];
  assert.equal(opzioni.cwd, dirname(p.BIN), `the router's current folder is ${opzioni.cwd}: ggml would load any ggml-*.dll found there`);
  assert.notEqual(opzioni.cwd, dirname(p.presetFile));
  assert.equal(args[args.indexOf('--models-preset') + 1], p.presetFile, 'an ASCII path goes as it is');
  assert.equal(opzioni.env.LLAMA_ARG_API_KEY_FILE, p.presetFile.replace(/\.ini$/u, '.key'));
  assert.equal(p.banco.routers[0].preset, p.presetFile);
  assert.equal(p.router.status().state, 'ready');
});

test('RG-1b G-R1 a non-ASCII user folder (Jörg Müller) with the data in AppData\\Roaming: the preset stays in the data folder, named by its ASCII path from the binary\'s folder', async (t) => {
  const p = prepara(t, { binario: join('Jörg Müller', 'AppData', 'Local', 'Programs', 'TALOS', 'resources', 'local-runtime', 'cpu'), dati: join('Jörg Müller', 'AppData', 'Roaming', 'TALOS') });
  const esito = await p.router.start({ modelId: 'mod-a', modelPath: p.a, contextLength: 8_192 });
  assert.equal(esito.ripiegoRouter, undefined, JSON.stringify(esito.ripiegoRouter));
  const { args, opzioni } = p.banco.spawn[0];
  assert.equal(opzioni.cwd, dirname(p.BIN));
  const atteso = relative(dirname(p.BIN), p.presetFile);
  assert.match(atteso, /^[\x20-\x7e]+$/u, 'premise: the relative path is ASCII');
  assert.equal(args[args.indexOf('--models-preset') + 1], atteso);
  assert.equal(opzioni.env.LLAMA_ARG_API_KEY_FILE, atteso.replace(/\.ini$/u, '.key'));
  assert.equal(p.banco.routers[0].preset, p.presetFile, 'the file the router read is the one in the data folder');
  assert.ok(existsSync(p.presetFile));
});

test('RG-1c G-R1 a data folder with no ASCII path at all (Jörg Müller\\モデル): preset and key go to talos-router\\ beside the binary, removed at shutdown', async (t) => {
  const p = prepara(t, { binario: join('Jörg Müller', 'bin'), dati: join('Jörg Müller', 'モデル') });
  const esito = await p.router.start({ modelId: 'mod-a', modelPath: p.a, contextLength: 8_192 });
  assert.equal(esito.ripiegoRouter, undefined, JSON.stringify(esito.ripiegoRouter));
  assert.equal(p.banco.standalone.length, 0, 'today\'s engine never started');
  const { args, opzioni } = p.banco.spawn[0];
  assert.equal(opzioni.cwd, dirname(p.BIN));
  assert.equal(args[args.indexOf('--models-preset') + 1], join('talos-router', 'presets-4242.ini'));
  assert.equal(opzioni.env.LLAMA_ARG_API_KEY_FILE, join('talos-router', 'presets-4242.key'));
  const riserva = join(dirname(p.BIN), 'talos-router');
  assert.equal(p.banco.routers[0].preset, join(riserva, 'presets-4242.ini'));
  assert.match(readFileSync(join(riserva, 'presets-4242.ini'), 'utf8'), /\[mod-a\]/u);
  assert.equal(existsSync(p.presetFile), false, 'nothing of the router is written in the data folder');
  await p.router.chiudi();
  assert.equal(existsSync(riserva), false, 'the reserve folder goes at shutdown');
});

test('RG-1d G-R1 the reserve place cannot be written: the router is not started and today\'s engine takes the model (decision 2), with the reason', async (t) => {
  const p = prepara(t, { binario: join('Jörg Müller', 'bin'), dati: join('Jörg Müller', 'モデル') });
  writeFileSync(join(dirname(p.BIN), 'talos-router'), 'a file where the folder would go');
  const esito = await p.router.start({ modelId: 'mod-a', modelPath: p.a, contextLength: 8_192 });
  assert.equal(esito.state, 'ready');
  assert.equal(p.banco.routers.length, 0, 'no router was started');
  assert.equal(esito.ripiegoRouter?.codice, 'ROUTER_PRESET_UNWRITABLE', JSON.stringify(esito.ripiegoRouter));
  assert.match(esito.ripiegoRouter.motivo, /preset/u);
});

/*
 * RG-1-VERO: the shipped binary, mirrored by hard links into «<tmp>\Jörg Müller\bin» (so the owner's installed app is never written),
 * data folder «<tmp>\Jörg Müller\モデル», model «piccolo-ü.gguf». A HARMLESS `ggml-cpu-segnalino.dll` (its DllMain only appends the pid to
 * a file beside itself; built here with gcc) is planted in the data folder's `.local-runtime-router\` AND in the reserve `talos-router\`.
 * Neither may be loaded. Control: the same DLL in the binary's own folder IS loaded (the marker works). Port 4189.
 */
const BINARIO = process.env.TALOS_PROVA_ROUTER_BINARIO ?? '';
const GGUF = process.env.TALOS_PROVA_ROUTER_GGUF ?? '';
const GPU = process.env.TALOS_PROVA_ROUTER_GPU === '1';
const conGcc = suWindows && spawnSync('gcc', ['--version'], { windowsHide: true }).status === 0;
const veroDisponibile = suWindows && BINARIO !== '' && GGUF !== '' && existsSync(BINARIO) && existsSync(GGUF) && conGcc;
const SEGNALINO_C = `#include <windows.h>
#include <stdio.h>
#include <wchar.h>
BOOL WINAPI DllMain(HINSTANCE h, DWORD motivo, LPVOID r) {
  (void) r;
  if (motivo == DLL_PROCESS_ATTACH) {
    wchar_t p[MAX_PATH]; DWORD n = GetModuleFileNameW(h, p, MAX_PATH);
    if (n > 0 && n < MAX_PATH - 20) { wcscat(p, L".CARICATA.txt"); FILE *f = _wfopen(p, L"a"); if (f) { fprintf(f, "pid=%lu\\n", GetCurrentProcessId()); fclose(f); } }
  }
  return TRUE;
}
`;
const vivoPid = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };

test('RG-1-VERO G-R1 the real router with «Jörg Müller\\モデル»: it starts, loads, answers, and no ggml-*.dll of the data folder (or of talos-router\\) is loaded', { skip: !veroDisponibile && 'TALOS_PROVA_ROUTER_BINARIO / TALOS_PROVA_ROUTER_GGUF not set, or no gcc', timeout: 240_000 }, async (t) => {
  const cartella = mkdtempSync(join(tmpdir(), 'router-g-vero-'));
  t.after(() => rimuoviCartellaDiProva(cartella));
  const sorgenteDll = join(cartella, 'segnalino.c');
  const dll = join(cartella, 'ggml-cpu-segnalino.dll');
  writeFileSync(sorgenteDll, SEGNALINO_C);
  const gcc = spawnSync('gcc', ['-shared', '-O2', '-o', dll, sorgenteDll], { windowsHide: true, encoding: 'utf8' });
  assert.equal(gcc.status, 0, `gcc: ${gcc.stderr}`);
  const utente = join(cartella, 'Jörg Müller');
  const binDir = join(utente, 'bin');
  mkdirSync(binDir, { recursive: true });
  for (const nome of readdirSync(dirname(BINARIO))) {
    const s = join(dirname(BINARIO), nome);
    if (statSync(s).isDirectory()) continue;
    try { linkSync(s, join(binDir, nome)); } catch { copyFileSync(s, join(binDir, nome)); }
  }
  const dati = join(utente, 'モデル');
  mkdirSync(join(dati, 'modelli'), { recursive: true });
  const modello = join(dati, 'modelli', 'piccolo-ü.gguf');
  copyFileSync(GGUF, modello);
  const presetFile = join(dati, '.local-runtime-router', `presets-${process.pid}.ini`);
  const riserva = join(binDir, 'talos-router');
  const piantate = [join(dirname(presetFile), 'ggml-cpu-segnalino.dll'), join(riserva, 'ggml-cpu-segnalino.dll')];
  for (const f of piantate) { mkdirSync(dirname(f), { recursive: true }); copyFileSync(dll, f); }
  const caricataDa = (f) => (existsSync(`${f}.CARICATA.txt`) ? readFileSync(`${f}.CARICATA.txt`, 'utf8').trim().split(/\r?\n/u) : []);

  const avvia = async () => {
    let processoRouter = null;
    const spawnImpl = (comando, args, opzioni) => { const f = spawn(comando, args, opzioni); if (args.includes('--models-preset')) processoRouter = f; return f; };
    const binario = join(binDir, 'llama-server.exe');
    const standalone = createLlamaServerSupervisor({ binaryPath: binario, gpuLayers: GPU ? 99 : 0, spawnImpl });
    const router = createLlamaRouterSupervisor({ binaryPath: binario, standalone, presetFile, spawnImpl, healthTimeoutMs: 30_000, registro: () => {},
      portAllocator: async () => 4189, modelliInstallati: async () => [{ modelId: 'piccolo', modelPath: modello, opzioni: { contextLength: 2_048 } }] });
    return { router, processo: () => processoRouter };
  };

  const { router, processo } = await avvia();
  let presetAccantoAlBinario = false;
  try {
    const pronto = await router.start({ modelId: 'piccolo', modelPath: modello, contextLength: 2_048 });
    assert.equal(pronto.ripiegoRouter, undefined, `the router did not take the model: ${pronto.ripiegoRouter?.motivo}`);
    assert.equal(pronto.state, 'ready');
    assert.equal(pronto.windowTokens, 2_048, 'the child loaded the non-ASCII model path');
    presetAccantoAlBinario = existsSync(join(riserva, `presets-${process.pid}.ini`)); // asserted after the DLLs: they are the point
    assert.equal((await fetch('http://127.0.0.1:4189/v1/models')).status, 401, 'the router read its key file');
    const risposta = await router.request('/v1/chat/completions', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: [{ role: 'user', content: 'Hello' }], max_tokens: 8, temperature: 0 }) });
    assert.equal(risposta.status, 200, await risposta.clone().text());
    t.diagnostic(`router pid ${processo().pid}`);
  } finally {
    const pid = processo()?.pid;
    await router.chiudi();
    if (pid) await finche(() => !vivoPid(pid), { ms: 10_000, passo: 100 }).catch(() => {});
  }
  for (const f of piantate) assert.deepEqual(caricataDa(f), [], `${f} was loaded by ${caricataDa(f).join(', ')}`);
  assert.equal(presetAccantoAlBinario, true, 'the preset was in talos-router\\ beside the binary');

  /* control: the same DLL in the binary's own folder is loaded (by the router and its child): the marker works */
  const controllo = join(binDir, 'ggml-cpu-segnalino.dll');
  copyFileSync(dll, controllo);
  const secondo = await avvia();
  try {
    await secondo.router.start({ modelId: 'piccolo', modelPath: modello, contextLength: 2_048 });
  } finally {
    const pid = secondo.processo()?.pid;
    await secondo.router.chiudi();
    if (pid) await finche(() => !vivoPid(pid), { ms: 10_000, passo: 100 }).catch(() => {});
  }
  t.diagnostic(`control: loaded by ${caricataDa(controllo).join(', ')}`);
  assert.ok(caricataDa(controllo).length >= 2, 'control: the DLL in the binary\'s folder is loaded by the router and its child');
  /* the mirrored binary was the processes' image and current folder: Windows lets go of it a moment after they exit */
  const via = await finche(() => { try { rimuoviCartellaDiProva(binDir); return true; } catch { return false; } }, { ms: 20_000, passo: 100 }).catch(() => false);
  assert.equal(via, true, 'something still holds the binary\'s folder 20 s after the tree was stopped');
});

/* ── G-R2 ──────────────────────────────────────────────────────────────────────────────────────────────── */

test('RG-2 G-R2 (the reviewer\'s G5) the router answers the first GET /models, gets the unloads, THEN stops answering: today\'s engine is not born beside the router\'s copy', async (t) => {
  const p = prepara(t, { esito: (nome) => (nome === 'mod-b' ? 'bloccato' : 'ok'), scaricoMs: 60_000, healthTimeoutMs: 150 });
  await p.router.start({ modelId: 'mod-a', modelPath: p.a, contextLength: 8_192 });
  const r = p.banco.routers[0];
  assert.equal(r.stati.get('mod-a').value, 'loaded', 'premise: mod-a is in the router');
  /* the FIRST unload is the stuck child's (mod-b, the fallback asks it itself); from the SECOND (scaricaTuttoNelRouter's, after a GET
     /models that worked) the router, alive, no longer answers /models */
  const fetchVero = p.banco.fetchImpl;
  let rotto = false;
  let scarichi = 0;
  p.banco.fetchImpl = async (indirizzo, init = {}) => {
    const u = new URL(String(indirizzo));
    if (u.pathname === '/models/unload') { const risposta = await fetchVero(indirizzo, init); scarichi += 1; if (scarichi >= 2) rotto = true; return risposta; }
    if (rotto && u.pathname.startsWith('/models')) throw new TypeError('fetch failed');
    return fetchVero(indirizzo, init);
  };
  await p.router.start({ modelId: 'mod-b', modelPath: p.b, contextLength: 8_192 }).catch((e) => e);
  assert.equal(rotto, true, 'premise: an unload was asked, then the router stopped answering');
  const nascita = p.quandoNasceIlMotoreDiOggi.at(-1);
  assert.ok(nascita, 'premise: today\'s engine was born');
  assert.ok(!(nascita.routerVivo && ['loading', 'loaded', 'sleeping'].includes(nascita.statoModA)),
    `today's engine was born while the router (alive) still held mod-a «${nascita.statoModA}»: the memory was not proven free`);
  assert.equal(p.alberiUccisi.length, 1, 'the router\'s tree was stopped');
});

/* ── G-R3 ──────────────────────────────────────────────────────────────────────────────────────────────── */

test('RG-3 G-R3 a router that answers /health and dies at once, with no model to load again: the restarts stop after the cap', async (t) => {
  let cadono = false;
  const p = prepara(t, {
    atteseDiRiavvioMs: [10, 10, 10, 10],
    spawnImpl: (banco, bin, args, opz) => {
      const c = banco.spawnImpl(bin, args, opz);
      if (cadono && args.includes('--models-preset')) setTimeout(() => { if (c.vivo) c.cade(3); }, 20);
      return c;
    },
  });
  await p.router.start({ modelId: 'mod-a', modelPath: p.a, contextLength: 8_192 });
  await p.router.stop(); // the person freed the memory: no model to load again
  cadono = true;
  const prima = p.banco.routers.length;
  p.banco.routers[0].cade(3);
  await finche(() => p.router.status().router.fermo !== null, { ms: 3_000 });
  await attesa(300);
  const rilanci = p.banco.routers.length - prima;
  assert.equal(rilanci, 5, `a router that comes up and dies at once is restarted ${rilanci} times (the cap is five starts in a row)`);
  const fermo = p.router.status().router.fermo;
  assert.equal(fermo.tentativi, 5);
  assert.match(fermo.motivo, /exited \d+ ms after it came up/u);
  assert.match(p.registro.join(''), /failed to start 5 times in a row/u);
});

test('RG-3b G-R3 a restarted router that stayed up for the last backoff step clears the count: four quick deaths after it do not stop the restarts', async (t) => {
  const p = prepara(t, { atteseDiRiavvioMs: [10, 10, 10, 10], vitaSanaMs: 80 });
  await p.router.start({ modelId: 'mod-a', modelPath: p.a, contextLength: 8_192 });
  await p.router.stop();
  const muoreSubito = async () => {
    const n = p.banco.routers.length;
    p.banco.routerVivo().cade(3);
    await finche(() => p.banco.routers.length === n + 1 && p.banco.routerVivo() !== null && p.router.status().router.attivo);
  };
  await muoreSubito(); // the person's own router: not a restart
  for (let i = 0; i < 4; i += 1) await muoreSubito(); // four restarts that died at once: four failed starts in a row
  assert.equal(p.router.status().router.fermo, null, 'premise: four, under the cap');
  await attesa(150); // this restart stays up longer than vitaSanaMs: a start that worked
  await muoreSubito();
  for (let i = 0; i < 4; i += 1) await muoreSubito();
  assert.equal(p.router.status().router.fermo, null, 'the count started again after the router that stayed up');
});

/* ── G-R4 ──────────────────────────────────────────────────────────────────────────────────────────────── */

test('RG-4 G-R4 a restarted router alive but silent on /health: its tree is stopped, it counts as a failed start, and the status never says «attivo»', async (t) => {
  let muti = false;
  const p = prepara(t, { atteseDiRiavvioMs: [10, 10, 10, 10], healthTimeoutMs: 60 });
  await p.router.start({ modelId: 'mod-a', modelPath: p.a, contextLength: 8_192 });
  const fetchVero = p.banco.fetchImpl;
  p.banco.fetchImpl = async (indirizzo, init = {}) => {
    const u = new URL(String(indirizzo));
    const nuovo = p.banco.routers.length > 1 && p.banco.routers.slice(1).some((r) => r.porta === Number(u.port));
    if (muti && nuovo) throw new TypeError('fetch failed');
    return fetchVero(indirizzo, init);
  };
  muti = true;
  p.banco.routers[0].cade(3);
  await finche(() => p.router.status().router.fermo !== null, { ms: 5_000 });
  await attesa(100);
  const vivi = p.banco.routers.filter((r) => r.vivo);
  assert.deepEqual(vivi.map((r) => r.porta), [], 'a silent router was left running');
  assert.equal(p.banco.routers.length, 1 + 5, 'the first router, then five restarts whose router never answered /health');
  assert.equal(p.alberiUccisi.length, 5, 'each silent router\'s tree was stopped');
  const stato = p.router.status();
  assert.equal(stato.router.attivo, false);
  assert.equal(stato.state, 'failed');
  assert.match(stato.router.fermo.motivo, /did not answer \/health/u);
});

test('RG-4b G-R4 a silent router that cannot be stopped: the status says it is there and does not answer, not «attivo»', async (t) => {
  let muti = false;
  const p = prepara(t, { atteseDiRiavvioMs: [10, 10, 10, 10], healthTimeoutMs: 60, uccidiAlbero: async () => { /* taskkill failed */ } });
  await p.router.start({ modelId: 'mod-a', modelPath: p.a, contextLength: 8_192 });
  const fetchVero = p.banco.fetchImpl;
  p.banco.fetchImpl = async (indirizzo, init = {}) => {
    const u = new URL(String(indirizzo));
    if (muti && p.banco.routers.slice(1).some((r) => r.porta === Number(u.port))) throw new TypeError('fetch failed');
    return fetchVero(indirizzo, init);
  };
  muti = true;
  p.banco.routers[0].cade(3);
  await finche(() => p.banco.routers.length === 2 && p.registro.join('').includes('restart failed'), { ms: 5_000 });
  await attesa(300);
  const stato = p.router.status().router;
  assert.equal(stato.attivo, false, 'a router that does not answer is not «attivo»');
  assert.equal(stato.nonRisponde, true);
});

/* ── G-R5 ──────────────────────────────────────────────────────────────────────────────────────────────── */

test('RG-5a G-R5 powershell.exe and wsl.exe by their full path under SystemRoot, with the same rule as taskkill', async () => {
  const m = await import('../src/taskkill-di-sistema.mjs');
  assert.equal(m.percorsoPowershell('C:\\Windows'), 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe');
  assert.equal(m.percorsoWsl('D:\\WinNT'), 'D:\\WinNT\\System32\\wsl.exe');
  for (const falso of [null, '', 'Windows', '\\Windows', '\\\\server\\share', '..\\x', 'C:Windows', '/c/Windows']) {
    assert.equal(m.percorsoPowershell(falso), 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe', String(falso));
    assert.equal(m.percorsoWsl(falso), 'C:\\Windows\\System32\\wsl.exe', String(falso));
  }
});

test('RG-5b G-R5 the resource sampler starts PowerShell and WSL by their full path', async () => {
  const { creaCampionatoreRisorse } = await import('../src/risorse-processi.mjs');
  const comandi = [];
  const spawnFn = (comando) => { comandi.push(comando); throw new Error('not started in this test'); };
  const c = creaCampionatoreRisorse({ piattaforma: 'win32', core: 2, spawnFn, attesaMassimaMs: 50 });
  await c.misura({ pid: [process.pid], wsl: [{ distro: 'Ubuntu', marcatore: 'ta1' }] }).catch(() => null);
  c.chiudi();
  const radice = /^[A-Za-z]:\\/u.test(process.env.SystemRoot ?? '') ? process.env.SystemRoot : 'C:\\Windows';
  assert.deepEqual([...new Set(comandi)].sort(), [join(radice, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'), join(radice, 'System32', 'wsl.exe')].sort());
});

/*
 * The planted `powershell.exe` is a hard link (or copy) of node.exe: run with `-NoProfile -NonInteractive -EncodedCommand …` it exits
 * with «bad option» and prints nothing, so the process table comes back EMPTY (null). The system's PowerShell gives the table.
 * Without `NoDefaultCurrentDirectoryInExePath` (the reviewer's lesson: with it the current folder is skipped for the wrong reason).
 */
test('RG-5c G-R5 the adopted-commands reader (leggiAlbero) with a powershell.exe planted in the current folder AND at the head of PATH: the system\'s runs', { skip: !suWindows && 'Windows only', timeout: 60_000 }, async (t) => {
  const prima = process.env.NoDefaultCurrentDirectoryInExePath;
  delete process.env.NoDefaultCurrentDirectoryInExePath;
  t.after(() => { if (prima !== undefined) process.env.NoDefaultCurrentDirectoryInExePath = prima; });
  const piantato = mkdtempSync(join(tmpdir(), 'router-g-piantato-'));
  t.after(() => rimuoviCartellaDiProva(piantato));
  try { linkSync(process.execPath, join(piantato, 'powershell.exe')); } catch { copyFileSync(process.execPath, join(piantato, 'powershell.exe')); }
  const { leggiAlbero } = await import('../src/impronta-processo.mjs');
  const vittima = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 60000)'], { stdio: 'ignore', windowsHide: true });
  t.after(() => { try { vittima.kill(); } catch { /* gone */ } });
  const cwdPrima = process.cwd();
  const pathPrima = process.env.PATH;
  let albero;
  process.chdir(piantato);
  process.env.PATH = `${piantato};${pathPrima}`;
  try { albero = await leggiAlbero(vittima.pid, { conImpronteDi: [vittima.pid], attesaMassimaMs: 30_000 }); } finally { process.chdir(cwdPrima); process.env.PATH = pathPrima; }
  assert.ok(albero && albero.membri?.some((m) => m.pid === vittima.pid), `the planted powershell.exe ran (no process table): ${JSON.stringify(albero)}`);
});

/* ── G-R6 ──────────────────────────────────────────────────────────────────────────────────────────────── */

test('RG-6 G-R6 a router that answers nothing and cannot be stopped: its own code, and a sentence that says how to free the memory', async (t) => {
  const p = prepara(t, { ritardoMs: 5, uccidiAlbero: async () => { /* taskkill failed: the router stays alive */ } });
  await p.router.start({ modelId: 'mod-a', modelPath: p.a, contextLength: 8_192 });
  const r = p.banco.routers[0];
  await p.router.stop();
  const avvio = p.router.start({ modelId: 'mod-a', modelPath: p.a, contextLength: 8_192 });
  await finche(() => r.caricati.filter((c) => c.nome === 'mod-a').length === 2);
  p.banco.reteRotta = (percorso) => percorso.startsWith('/models');
  const errore = await avvio.catch((e) => e);
  assert.equal(errore.code, 'RUNTIME_ROUTER_NOT_STOPPED', 'its own code: the chat card says what to do, not «retry the turn»');
  assert.match(errore.message, /mod-a/u);
  assert.match(errore.message, /graphics card/u);
  assert.match(errore.message, /llama-server/u, 'the process to end, by name');
  assert.equal(p.banco.standalone.length, 0, 'today\'s engine never started');
});
