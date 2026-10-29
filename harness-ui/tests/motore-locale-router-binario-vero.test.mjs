/*
 * Router mode with the REAL llama-server (27/10/2026, brief «a real-binary test, if a small GGUF is available locally»). Opt-in: it runs
 * only when both variables point to files, so the suite stays the same everywhere else.
 *   TALOS_PROVA_ROUTER_BINARIO = a llama-server.exe of the shipped build (b11669 on 27/10/2026)
 *   TALOS_PROVA_ROUTER_GGUF    = a small chat GGUF (llama.rn's tests/tiny-random-llama.gguf, 63 MB, on 27/10/2026)
 * Router start, load, one completion, growth reload (section rewritten + ?reload=1), the per-section idle sleep, a load the router
 * cannot do, unload, shutdown of the whole tree (the real `taskkill /T`).
 */
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, linkSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmdirSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import test from 'node:test';

import { createLlamaServerSupervisor } from '../src/llama-server-supervisor.mjs';
import { createLlamaRouterSupervisor } from '../src/llama-router-supervisor.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

const BINARIO = process.env.TALOS_PROVA_ROUTER_BINARIO ?? '';
const GGUF = process.env.TALOS_PROVA_ROUTER_GGUF ?? '';
const disponibile = BINARIO !== '' && GGUF !== '' && existsSync(BINARIO) && existsSync(GGUF);
/* TALOS_PROVA_ROUTER_GPU=1: the Vulkan build with today's GPU choices (fitter, `-ngl 99`, flash attention, KV type) in the section */
const GPU = process.env.TALOS_PROVA_ROUTER_GPU === '1';

const vivo = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };
/** The router's children (its models), read from Windows: they must go with the tree, not only the router. */
function figliDi(pid) {
  if (process.platform !== 'win32') return [];
  const r = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', `Get-CimInstance Win32_Process -Filter "ParentProcessId=${Number(pid)}" | ForEach-Object { $_.ProcessId }`], { encoding: 'utf8', windowsHide: true });
  return String(r.stdout ?? '').split(/\s+/u).map(Number).filter((n) => Number.isSafeInteger(n) && n > 0);
}

async function finche(condizione, ms) {
  const scadenza = Date.now() + ms;
  while (Date.now() < scadenza) {
    if (await condizione()) return true;
    await new Promise((r) => setTimeout(r, 250));
  }
  return false;
}

const chat = (router, contenuto, maxTokens) => router.request('/v1/chat/completions', { method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ messages: [{ role: 'user', content: contenuto }], max_tokens: maxTokens, temperature: 0 }) });

test('RT-VERO router mode on the real binary: start, load, completion, growth reload, idle sleep, a failed load, unload, shutdown', { skip: !disponibile && 'TALOS_PROVA_ROUTER_BINARIO / TALOS_PROVA_ROUTER_GGUF not set', timeout: 300_000 }, async (t) => {
  const cartella = mkdtempSync(join(tmpdir(), 'router-vero-'));
  t.after(() => rimuoviCartellaDiProva(cartella));
  const rotto = join(cartella, 'rotto.gguf');
  writeFileSync(rotto, 'this is not a GGUF file');
  const righe = [];
  let processoRouter = null;
  const spawnImpl = (comando, args, opzioni) => {
    const figlio = spawn(comando, args, opzioni);
    if (args.includes('--models-preset')) processoRouter = figlio;
    return figlio;
  };
  const standalone = createLlamaServerSupervisor({ binaryPath: BINARIO, gpuLayers: GPU ? 99 : 0, spawnImpl });
  const presetFile = join(cartella, 'router', 'presets.ini');
  const router = createLlamaRouterSupervisor({
    binaryPath: BINARIO, standalone, presetFile, spawnImpl, healthTimeoutMs: 30_000, dormiDopoSecondi: 3, registro: (testo) => righe.push(testo),
    modelliInstallati: async () => [{ modelId: 'piccolo', modelPath: GGUF, opzioni: { contextLength: 2_048 } }],
  });
  router.subscribeLogs((voce) => { if (voce.caricamento !== undefined || voce.ripiegoRouter) righe.push(voce.text); });
  t.after(() => router.chiudi());

  const pronto = await router.start({ modelId: 'piccolo', modelPath: GGUF, contextLength: 2_048 });
  assert.equal(pronto.state, 'ready');
  assert.equal(pronto.windowTokens, 2_048, 'the window read from the child\'s own /props');
  t.diagnostic(`preset:\n${readFileSync(presetFile, 'utf8')}`);
  assert.match(readFileSync(presetFile, 'utf8'), /\[piccolo\]\nmodel = .+\nctx-size = 2048\n/u);
  if (GPU) assert.match(readFileSync(presetFile, 'utf8'), /n-gpu-layers = 99\nflash-attn = 1\ncache-type-k = (f16|q8_0)\ncache-type-v = (f16|q8_0)\n/u);
  t.diagnostic(`router arguments: ${processoRouter.spawnargs.slice(1).map((a) => (/^[a-f0-9]{64}$/u.test(a) ? '<key>' : a)).join(' ')}`);

  /* the child has the key too: straight to its port, without the key, it refuses (with `--api-key` on the router it would not) */
  const elencoPronto = await (await router.request('/models')).json();
  const argomentiDelFiglio = elencoPronto.data?.[0]?.status?.args ?? [];
  const portaDelFiglio = argomentiDelFiglio[argomentiDelFiglio.indexOf('--port') + 1];
  assert.ok(portaDelFiglio, JSON.stringify(elencoPronto).slice(0, 300));
  assert.equal((await fetch(`http://127.0.0.1:${portaDelFiglio}/v1/models`)).status, 401, 'the child refuses a request without the key');
  assert.equal((await fetch(`${router.status().baseUrl}/v1/models`)).status, 401, 'the router refuses a request without the key');

  /* one completion through the router, to the current model */
  const risposta = await chat(router, 'Hello', 8);
  assert.equal(risposta.status, 200, await risposta.clone().text());
  const corpo = await risposta.json();
  assert.equal(corpo.choices?.length, 1, JSON.stringify(corpo).slice(0, 300));

  /* the growth path: stop (the model leaves), start with a bigger window ⇒ section rewritten, ?reload=1, loaded again */
  await router.stop();
  const cresciuto = await router.start({ modelId: 'piccolo', modelPath: GGUF, contextLength: 4_096 });
  assert.equal(cresciuto.windowTokens, 4_096);
  assert.match(readFileSync(presetFile, 'utf8'), /ctx-size = 4096/u);

  /* `sleep-idle-seconds` in the section reaches that child: after 3 idle seconds it sleeps, and a request wakes it */
  let valore = null;
  const dormito = await finche(async () => {
    const elenco = await (await router.request('/models')).json();
    valore = elenco.data?.[0]?.status?.value ?? null;
    return valore === 'sleeping';
  }, 20_000);
  assert.equal(dormito, true, `the child never slept (last status ${valore})`);
  assert.equal((await router.health()).ok, true, 'a sleeping model is still the ready model');
  const sveglia = await chat(router, 'Again', 4);
  assert.equal(sveglia.status, 200, 'a request wakes the sleeping child');

  /* a load the router cannot do: a file that is not a GGUF. Today's engine fails too ⇒ the error goes up, nothing remembered */
  await router.stop();
  const errore = await router.start({ modelId: 'rotto', modelPath: rotto, contextLength: 1_024 }).catch((e) => e);
  assert.ok(errore instanceof Error, 'the broken file does not load');
  assert.equal(errore.ripiegoRouter?.codice, 'ROUTER_LOAD_FAILED', `the router said it failed: ${JSON.stringify(errore.ripiegoRouter)}`);
  assert.deepEqual(router.status().router.ripieghi, []);
  t.diagnostic(`router failure reason: ${errore.ripiegoRouter?.motivo}`);
  t.diagnostic(`today's engine error: ${errore.code} ${String(errore.message).slice(0, 200)}`);

  /* the router again, then shutdown: the whole tree goes */
  const ancora = await router.start({ modelId: 'piccolo', modelPath: GGUF, contextLength: 2_048 });
  assert.equal(ancora.state, 'ready');
  const pid = processoRouter.pid;
  const figli = figliDi(pid);
  await router.chiudi();
  assert.equal(await finche(() => !vivo(pid), 10_000), true, 'the router process is gone');
  assert.equal(await finche(() => figli.every((f) => !vivo(f)), 15_000), true, `the router's children are still alive: ${figli.filter(vivo)}`);
  assert.equal(existsSync(presetFile), false);
  /* G-R1: the router runs in the binary's folder now, so nothing of it holds the data folder; the wait stays (Vulkan held it ~250 ms
     when it was the router's current folder, J-R1, measured 27/10/2026) */
  assert.equal(await finche(() => { try { rmdirSync(dirname(presetFile)); return true; } catch { return false; } }, 20_000), true, 'something still holds the router\'s folder');
  t.diagnostic(`load progress lines seen: ${righe.filter((r) => /loading piccolo/u.test(r)).length}; log lines: ${righe.length}`);
});

/*
 * J-R1 (block 9 review, 27/10/2026): `percorsoDatiDesktop` puts the preset and the key file under the person's profile, and b11669 reads
 * both paths as narrow ANSI strings (`common/preset.cpp:170-177`, `common/arg.cpp` `--api-key-file`): with «Jörg» in the folder the real
 * router exited 1 at every start. The model path goes INSIDE the preset as UTF-8 and reaches the child through `CreateProcessW`
 * (`vendor/sheredom/subprocess.h`, `MultiByteToWideChar(CP_UTF8, …)`): it is non-ASCII here too, to prove that side as well.
 * ⛔ G-R1 (block 10 review): the router now runs in the BINARY's folder, and a data folder with no ASCII path sends preset and key to
 * `talos-router\` beside the binary. The binary is mirrored by hard links into «Jörg Müller\bin», so the installed app is never written
 * and the binary's own folder is non-ASCII too (as for a person named Jörg).
 * The router listens on 4189 (the brief's port for test servers); its children take free ports of their own.
 */
test('RT-VERO-NA J-R1 the real router with a non-ASCII data folder and a non-ASCII model path: it starts, loads, answers, and goes', { skip: !disponibile && 'TALOS_PROVA_ROUTER_BINARIO / TALOS_PROVA_ROUTER_GGUF not set', timeout: 180_000 }, async (t) => {
  const cartella = mkdtempSync(join(tmpdir(), 'router-vero-na-'));
  t.after(() => rimuoviCartellaDiProva(cartella));
  const binDir = join(cartella, 'Jörg Müller', 'bin');
  mkdirSync(binDir, { recursive: true });
  for (const nome of readdirSync(dirname(BINARIO))) {
    const sorgente = join(dirname(BINARIO), nome);
    if (statSync(sorgente).isDirectory()) continue;
    try { linkSync(sorgente, join(binDir, nome)); } catch { copyFileSync(sorgente, join(binDir, nome)); }
  }
  const binario = join(binDir, basename(BINARIO));
  const dati = join(cartella, 'Jörg Müller', 'モデル');
  mkdirSync(join(dati, 'modelli'), { recursive: true });
  const modello = join(dati, 'modelli', 'piccolo-ü.gguf');
  copyFileSync(GGUF, modello);
  let processoRouter = null;
  const spawnImpl = (comando, args, opzioni) => {
    const figlio = spawn(comando, args, opzioni);
    if (args.includes('--models-preset')) processoRouter = figlio;
    return figlio;
  };
  const righe = [];
  const standalone = createLlamaServerSupervisor({ binaryPath: binario, gpuLayers: GPU ? 99 : 0, spawnImpl });
  const presetFile = join(dati, '.local-runtime-router', `presets-${process.pid}.ini`);
  const riserva = join(binDir, 'talos-router');
  const fileChiave = join(riserva, `presets-${process.pid}.key`);
  const router = createLlamaRouterSupervisor({
    binaryPath: binario, standalone, presetFile, spawnImpl, healthTimeoutMs: 30_000, registro: (testo) => righe.push(testo), portAllocator: async () => 4189,
    modelliInstallati: async () => [{ modelId: 'piccolo', modelPath: modello, opzioni: { contextLength: 2_048 } }],
  });
  router.subscribeLogs((voce) => { if (voce.stream === 'stderr') righe.push(voce.text); });
  t.after(() => router.chiudi());

  const pronto = await router.start({ modelId: 'piccolo', modelPath: modello, contextLength: 2_048 });
  t.diagnostic(`router: ${JSON.stringify(pronto.router)}; ripiego: ${JSON.stringify(pronto.ripiegoRouter ?? null)}`);
  assert.equal(pronto.ripiegoRouter, undefined, `the router did not take the model: ${pronto.ripiegoRouter?.motivo}\n${righe.slice(-8).join('')}`);
  assert.equal(pronto.state, 'ready');
  assert.equal(pronto.port, 4189);
  assert.equal(pronto.windowTokens, 2_048, 'the child loaded the non-ASCII model path and answers /props');
  assert.ok(existsSync(fileChiave), 'the key file is where the router was told to look (talos-router\ beside the binary)');
  assert.equal(existsSync(presetFile), false, 'nothing of the router in the data folder');
  assert.equal((await fetch('http://127.0.0.1:4189/v1/models')).status, 401, 'the router read its key file: without it, 401');
  const risposta = await chat(router, 'Hello', 8);
  assert.equal(risposta.status, 200, await risposta.clone().text());
  assert.equal((await risposta.json()).choices?.length, 1);

  const pid = processoRouter.pid;
  const figli = figliDi(pid);
  t.diagnostic(`router pid ${pid}, children ${JSON.stringify(figli)}`);
  assert.ok(figli.length >= 1, 'the model runs in a child of the router');
  const t0 = Date.now();
  await router.chiudi();
  assert.equal(await finche(() => !vivo(pid), 10_000), true, 'the router process is gone');
  assert.equal(await finche(() => figli.every((f) => !vivo(f)), 15_000), true, `the router's children are still alive: ${figli.filter(vivo)}`);
  t.diagnostic(`whole tree gone ${Date.now() - t0} ms after chiudi() was called`);
  assert.equal(existsSync(fileChiave), false);
  assert.equal(existsSync(riserva), false, 'the reserve folder goes at shutdown');
  /* the mirrored binary was the processes' image and current folder: Windows lets go of it a moment after they exit (Vulkan, measured
     27/10/2026: the test folder's removal failed with EPERM right after the tree was gone). Measured here, not assumed. */
  const t1 = Date.now();
  const via = await finche(() => { try { rimuoviCartellaDiProva(binDir); return true; } catch { return false; } }, 20_000);
  t.diagnostic(`the mirrored binary folder could be removed ${Date.now() - t1} ms after the tree was gone`);
  assert.equal(via, true, 'something still holds the binary\'s folder 20 s after the tree was stopped');
});
