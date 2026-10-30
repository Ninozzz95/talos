/*
 * Router mode of the desktop local engine (owner 26/10/2026 night; brief 27/10/2026). Fake router and fake standalone engine
 * (`tests/aiuto/router-finto.mjs`), today's supervisor VERO inside the router supervisor: the per-model choices are the real ones.
 *   RT-01 spawn arguments, offline variable, no key/token/secret in the environment
 *   RT-02 the preset: one section per installed model, the SAME arguments today's engine passes, written atomically
 *   RT-03 decision 1: models loaded together computed from memory
 *   RT-04 load progress from /models/sse, through status() and the listeners
 *   RT-05 restart after a crash: 1, 5, 15, 60, 60 s, and the model loaded again
 *   RT-06..08 decision 2: fallback to today's engine (router failure, stuck child #27351, path the INI cannot hold)
 *   RT-09..10 stop and cancellation as today (A-6, A-7, A-R4)
 *   RT-11 requests go to the current model; RT-12 the switch keeps the old model loaded; RT-13 shutdown kills the tree
 */
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';

import { createLlamaServerSupervisor } from '../src/llama-server-supervisor.mjs';
import {
  ATTESE_DI_RIAVVIO_MS, chiaviDagliArgomenti, createLlamaRouterSupervisor, creaLettoreSse, improntaDelModello, modelliInsieme,
  percentualeDiCaricamento, sezioneDelModello,
} from '../src/llama-router-supervisor.mjs';
import { creaRouterFinto, leggiIni } from './aiuto/router-finto.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

const BIN = 'C:\\talos\\llama-server.exe';

async function finche(condizione, { ms = 3_000, passo = 2 } = {}) {
  const scadenza = Date.now() + ms;
  while (Date.now() < scadenza) {
    if (await condizione()) return true;
    await new Promise((r) => setTimeout(r, passo));
  }
  throw new Error('condition not reached in time');
}

function prepara(t, {
  gpuLayers = 0, aiuto = '', fitter = '', installati = null, memoria = null, healthTimeoutMs = 2_000, attendi, leggiIntestazione,
  dormiDopoSecondi, attesaChiusuraMs = 500, ...finto
} = {}) {
  const cartella = mkdtempSync(join(tmpdir(), 'router-'));
  t.after(() => rimuoviCartellaDiProva(cartella));
  const a = join(cartella, 'a.gguf');
  const b = join(cartella, 'b.gguf');
  writeFileSync(a, 'GGUF-finto-a');
  writeFileSync(b, 'GGUF-finto-b');
  const banco = creaRouterFinto(finto);
  const sonda = (_eseguibile, args) => (args.includes('--help') ? aiuto : fitter);
  const opzioniDiOggi = { binaryPath: BIN, spawnImpl: banco.spawnImpl, fetchImpl: banco.fetchImpl, portAllocator: banco.portAllocator, pollIntervalMs: 1, gpuLayers, sondaBinario: sonda, attesaChiusuraMs };
  const standalone = createLlamaServerSupervisor(opzioniDiOggi);
  const registro = [];
  const eventi = [];
  const presetFile = join(cartella, 'router', 'presets.ini');
  const alberiUccisi = [];
  const router = createLlamaRouterSupervisor({
    binaryPath: BIN, standalone, presetFile, spawnImpl: banco.spawnImpl, fetchImpl: banco.fetchImpl, portAllocator: banco.portAllocator,
    pollIntervalMs: 1, healthTimeoutMs, attesaChiusuraMs,
    modelliInstallati: async () => installati ?? [{ modelId: 'mod-a', modelPath: a, opzioni: { contextLength: 8_192 } }, { modelId: 'mod-b', modelPath: b, opzioni: { contextLength: 16_384 } }],
    memoriaUtilizzabile: async () => memoria,
    registro: (testo) => registro.push(testo),
    uccidiAlbero: async (figlio) => { alberiUccisi.push(figlio); figlio.kill('SIGTERM'); },
    ...(attendi ? { attendi } : {}),
    ...(leggiIntestazione ? { leggiIntestazione } : {}),
    ...(dormiDopoSecondi !== undefined ? { dormiDopoSecondi } : {}),
  });
  router.subscribeLogs((voce) => eventi.push(voce));
  t.after(() => router.chiudi());
  return { cartella, a, b, banco, standalone, router, registro, eventi, presetFile, alberiUccisi, opzioniDiOggi };
}

const caricatiDi = (router, nome) => router.caricati.filter((c) => c.nome === nome);

test('RT-01 the router starts with the brief\'s arguments, the offline variable, and no key, token or secret in its environment', async (t) => {
  process.env.TALOS_PROVA_ROUTER_API_KEY = 'segreto';
  process.env.TALOS_PROVA_ROUTER_TOKEN = 'segreto';
  process.env.TALOS_PROVA_ROUTER_SECRET = 'segreto';
  t.after(() => { delete process.env.TALOS_PROVA_ROUTER_API_KEY; delete process.env.TALOS_PROVA_ROUTER_TOKEN; delete process.env.TALOS_PROVA_ROUTER_SECRET; });
  const p = prepara(t);
  const esito = await p.router.start({ modelId: 'mod-a', modelPath: p.a, contextLength: 8_192 });
  assert.deepEqual({ state: esito.state, modelId: esito.modelId, windowTokens: esito.windowTokens }, { state: 'ready', modelId: 'mod-a', windowTokens: 8_192 });
  assert.equal(p.banco.spawn.length, 1, 'one process: the router (no standalone engine)');
  const { args, opzioni } = p.banco.spawn[0];
  /* J-R1 (block 9 review): preset and key by an ASCII string (b11669 reads both paths as ANSI strings). G-R1 (block 10 review): the
     router runs in the BINARY's folder, never in the data folder, where ggml would load any ggml-*.dll; an ASCII path goes as it is */
  assert.deepEqual(args, ['--models-preset', join(p.cartella, 'router', 'presets.ini'), '--models-max', '1', '--models-autoload', '--metrics', '--jinja',
    '--host', '127.0.0.1', '--port', '18200']);
  assert.equal(opzioni.cwd, dirname(BIN));
  assert.equal(opzioni.shell, false);
  assert.deepEqual(opzioni.stdio, ['ignore', 'pipe', 'pipe']);
  assert.equal(opzioni.env.LLAMA_ARG_OFFLINE, '1');
  /* the key is in a file named by the environment, so the router's children have it too (b11669 drops `--api-key` for them) */
  assert.equal(opzioni.env.LLAMA_ARG_API_KEY_FILE, join(p.cartella, 'router', 'presets.key'));
  assert.match(readFileSync(opzioni.env.LLAMA_ARG_API_KEY_FILE, 'utf8'), /^[a-f0-9]{64}\n$/u);
  assert.equal(args.some((a) => /^[a-f0-9]{64}$/u.test(a)), false, 'no key on the command line');
  assert.deepEqual(Object.keys(opzioni.env).filter((k) => /(_API_KEY|_TOKEN|_SECRET)$/iu.test(k)), []);
  assert.equal(Object.hasOwn(esito, 'apiKey'), false);
  assert.equal(caricatiDi(p.banco.routers[0], 'mod-a').length, 1, 'POST /models/load once');
});

test('RT-02 the preset: one section per installed model, with EXACTLY the arguments today\'s engine passes, written atomically', async (t) => {
  const opzioni = { gpuLayers: 99, aiuto: '--spec-type none,ngram-mod', fitter: '-c 32768 -ngl -1' };
  const p = prepara(t, { ...opzioni, installati: null });
  await p.router.start({ modelId: 'mod-a', modelPath: p.a, contextLength: 32_768 });
  const testo = readFileSync(p.presetFile, 'utf8');
  const sezioni = leggiIni(testo);
  assert.deepEqual([...sezioni.keys()], ['mod-a', 'mod-b']);

  /* today's engine, alone, for the same model and options: its arguments from `-c` to `-np 1` ARE the section */
  const oggi = prepara(t, opzioni);
  await oggi.standalone.start({ modelId: 'mod-a', modelPath: oggi.a, contextLength: 32_768 });
  const argv = oggi.banco.spawn.at(-1).args;
  const perModello = argv.slice(argv.indexOf('-c'), argv.indexOf('-np') + 2);
  assert.deepEqual(perModello, ['-c', '32768', '-ngl', '99', '-fa', '1', '--cache-type-k', 'f16', '--cache-type-v', 'f16', '--spec-type', 'ngram-mod', '-np', '1']);
  const attese = [['model', p.a], ...chiaviDagliArgomenti(perModello), ['props', 'true'], ['sleep-idle-seconds', '900']];
  assert.deepEqual([...sezioni.get('mod-a')], attese);
  assert.equal(testo, ['; TALOS — router mode of the local engine. Written by TALOS before every load: changes made here do not last.', 'version = 1', '',
    `[mod-a]\n${attese.map(([k, v]) => `${k} = ${v}`).join('\n')}\n`,
    `[mod-b]\nmodel = ${p.b}\nctx-size = 16384\nn-gpu-layers = 99\nflash-attn = 1\ncache-type-k = f16\ncache-type-v = f16\nspec-type = ngram-mod\nparallel = 1\nprops = true\nsleep-idle-seconds = 900\n`].join('\n'));
  assert.deepEqual(readdirSync(join(p.cartella, 'router')).sort(), ['presets.ini', 'presets.key'], 'no temporary file left behind');
  assert.match(p.eventi.map((e) => e.text).join(''), /KV cache f16 — with f16 KV the binary fitter declares that ALL layers fit/u, 'the choices are declared, as today');
});

test('RT-02b a flag the preset has no key for is not dropped in silence; the idle unload is per section and changeable', () => {
  assert.throws(() => chiaviDagliArgomenti(['-c', '4096', '--nuova-opzione', '1']), /no preset key for the argument --nuova-opzione/u);
  assert.match(sezioneDelModello({ modelId: 'm', modelPath: 'C:\\m.gguf', argomenti: ['-np', '1'], dormiDopoSecondi: 120 }).testo, /sleep-idle-seconds = 120\n$/u);
  assert.doesNotMatch(sezioneDelModello({ modelId: 'm', modelPath: 'C:\\m.gguf', argomenti: ['-np', '1'], dormiDopoSecondi: 0 }).testo, /sleep-idle-seconds/u);
  assert.equal(sezioneDelModello({ modelId: 'm', modelPath: 'C:\\a#b\\m.gguf', argomenti: [] }), null, 'a value ends at # (common/preset.cpp:200-202)');
  assert.equal(sezioneDelModello({ modelId: 'm', modelPath: 'C:\\a;b\\m.gguf', argomenti: [] }), null);
  assert.equal(sezioneDelModello({ modelId: 'a:b', modelPath: 'C:\\m.gguf', argomenti: [] }), null, 'a : in a section name is rewritten as a tag by llama.cpp');
});

test('RT-03 decision 1: more than one model together only if the biggest fits twice, at least one, never above 4', async (t) => {
  assert.equal(modelliInsieme({ impronte: [12e9, 4e9], utilizzabile: 32e9 }), 2);
  assert.equal(modelliInsieme({ impronte: [12e9, 4e9], utilizzabile: 20e9 }), 1, 'the biggest does not fit twice');
  assert.equal(modelliInsieme({ impronte: [1e9], utilizzabile: 100e9 }), 4, 'Hermes\' ceiling');
  assert.equal(modelliInsieme({ impronte: [], utilizzabile: 100e9 }), 1, 'nothing priced: today, one model');
  assert.equal(modelliInsieme({ impronte: [1e9], utilizzabile: null }), 1, 'memory unknown: today, one model');
  assert.equal(improntaDelModello({ byteFile: 1e9, kvPerToken: 100, finestra: 1_000 }), 1e9 + 100_000 + 1.5 * 2 ** 30);
  assert.equal(improntaDelModello({ byteFile: 1e9, kvPerToken: null, finestra: 1_000 }), null);

  const intestazione = async () => ({ kvCacheBytesPerToken: 100_000 }); // 8.192 → 0,82 GB; 16.384 → 1,64 GB; + 1,5 GiB each
  const due = prepara(t, { memoria: 7e9, leggiIntestazione: intestazione });
  await due.router.start({ modelId: 'mod-a', modelPath: due.a, contextLength: 8_192 });
  assert.equal(due.banco.spawn[0].args[3], '2', 'biggest ≈ 3,25 GB, 7 GB usable ⇒ 2');
  const uno = prepara(t, { memoria: 6e9, leggiIntestazione: intestazione });
  await uno.router.start({ modelId: 'mod-a', modelPath: uno.a, contextLength: 8_192 });
  assert.equal(uno.banco.spawn[0].args[3], '1', 'biggest ≈ 3,25 GB, 6 GB usable ⇒ 1');
});

test('RT-04 load progress from /models/sse: phase and percent through status() and the listeners, then cleared', async (t) => {
  const pezzi = [];
  const leggi = creaLettoreSse((e) => pezzi.push(e));
  leggi('data: {"model":"m","event":"status_change","da');
  leggi('ta":{"status":"loading","progress":{"stages":["text_model"],"current":"text_model","value":0.25}}}\n\n: ping\n');
  assert.deepEqual(pezzi, [{ model: 'm', event: 'status_change', data: { status: 'loading', progress: { stages: ['text_model'], current: 'text_model', value: 0.25 } } }]);
  assert.equal(percentualeDiCaricamento({ stages: ['text_model', 'mmproj_model'], current: 'mmproj_model', value: 0.5 }), 93, 'text 85%, then the projector');
  assert.equal(percentualeDiCaricamento({ stages: ['text_model', 'mmproj_model'], current: 'text_model', value: 0.5 }), 43);

  const p = prepara(t, { ritardoMs: 40, sseSpezzato: true });
  const visti = [];
  p.router.subscribeLogs((voce) => { if (voce.caricamento) visti.push({ evento: voce.caricamento, stato: p.router.status().router.caricamento }); });
  await p.router.start({ modelId: 'mod-a', modelPath: p.a, contextLength: 8_192 });
  assert.ok(visti.some((v) => v.evento.fase === 'text_model' && v.evento.percentuale === 50 && v.stato?.percentuale === 50), JSON.stringify(visti));
  assert.equal(p.router.status().router.caricamento, null);
});

test('RT-05 the router that dies restarts with backoff 1, 5, 15, 60, 60 s (Hermes) and loads the model again', async (t) => {
  const attese = [];
  const attendi = async (ms, signal) => {
    if (ms !== 3_000) attese.push(ms); // 3 s is the progress stream reconnecting, not a restart
    await new Promise((r) => setImmediate(r));
    if (signal?.aborted) throw new Error('aborted');
  };
  const p = prepara(t, { attendi });
  await p.router.start({ modelId: 'mod-a', modelPath: p.a, contextLength: 8_192 });
  for (let i = 1; i <= 5; i += 1) {
    p.banco.routerVivo().cade();
    await finche(() => p.banco.routers.length === i + 1 && p.router.status().state === 'ready' && caricatiDi(p.banco.routers[i], 'mod-a').length === 1);
  }
  assert.deepEqual(attese, [...ATTESE_DI_RIAVVIO_MS, 60_000]);
  assert.equal(p.router.status().modelId, 'mod-a');
  assert.match(p.registro.join(''), /the local engine router exited \(code 3\)/u);
});

test('RT-06 decision 2: the router cannot load the model ⇒ today\'s engine takes it, one event for the chat, the reason in the log, remembered', async (t) => {
  const p = prepara(t, { esito: (nome) => (nome === 'mod-a' ? 'fallisce' : 'ok') });
  const esito = await p.router.start({ modelId: 'mod-a', modelPath: p.a, contextLength: 8_192 });
  assert.equal(esito.state, 'ready');
  assert.equal(esito.ripiegoRouter.modelId, 'mod-a');
  assert.equal(esito.ripiegoRouter.codice, 'ROUTER_LOAD_FAILED');
  assert.match(esito.ripiegoRouter.motivo, /exit code 1\): \[65281\] 0\.00\.031 E llama_model_load: error loading model: finto$/u, 'the child\'s own error line is the reason (#29225)');
  const solo = p.banco.standalone.at(-1);
  assert.deepEqual(solo.args.slice(0, 2), ['-m', p.a], 'today\'s engine, with the same model');
  assert.match(p.registro.join(''), /the router could not load mod-a: the router could not load the model \(exit code 1\)/u);
  assert.equal(p.eventi.filter((e) => e.ripiegoRouter).length, 1, 'one structured event');
  assert.deepEqual(p.router.status().router.ripieghi.map((r) => r.modelId), ['mod-a']);
  assert.equal(p.router.status().modelId, 'mod-a');
  /* the next load of the same model goes straight to today's engine: no second failed load in the router */
  await p.router.stop();
  const dopo = await p.router.start({ modelId: 'mod-a', modelPath: p.a, contextLength: 8_192 });
  assert.equal(dopo.state, 'ready');
  assert.equal(caricatiDi(p.banco.routers[0], 'mod-a').length, 1);
  assert.equal(p.banco.standalone.length, 2);
});

test('RT-07 decision 2, the other way: today\'s engine fails too ⇒ its error goes up, and the model is NOT remembered', async (t) => {
  let fallisce = true;
  const p = prepara(t, { esito: () => (fallisce ? 'fallisce' : 'ok'), esitoStandalone: () => (fallisce ? 'fallisce' : 'ok') });
  const errore = await p.router.start({ modelId: 'mod-a', modelPath: p.a, contextLength: 8_192 }).catch((e) => e);
  assert.equal(errore.code, 'RUNTIME_PROCESS_FAILED');
  assert.equal(errore.ripiegoRouter?.modelId, 'mod-a');
  assert.deepEqual(p.router.status().router.ripieghi, []);
  fallisce = false;
  const esito = await p.router.start({ modelId: 'mod-a', modelPath: p.a, contextLength: 8_192 });
  assert.equal(esito.ripiegoRouter, undefined, 'the router tried again, and loaded it');
  assert.equal(caricatiDi(p.banco.routers[0], 'mod-a').length, 2);
});

test('RT-08 decision 2, #27351: a child still «loading» past the size-based wait is unloaded, then today\'s engine takes the model', async (t) => {
  const p = prepara(t, { esito: () => 'bloccato', healthTimeoutMs: 60 });
  const esito = await p.router.start({ modelId: 'mod-a', modelPath: p.a, contextLength: 8_192 });
  assert.equal(esito.ripiegoRouter.codice, 'ROUTER_LOAD_STUCK');
  assert.ok(p.banco.routers[0].scaricati.some((s) => s.nome === 'mod-a' && s.motivo === 'unload'), 'the stuck child was unloaded first');
  assert.equal(esito.state, 'ready');
});

test('RT-08b decision 2: a model path the preset cannot hold (# or ;) goes to today\'s engine without starting a router', async (t) => {
  const p = prepara(t);
  const strano = join(p.cartella, 'con#cancelletto.gguf');
  writeFileSync(strano, 'GGUF-finto');
  const esito = await p.router.start({ modelId: 'mod-x', modelPath: strano, contextLength: 8_192 });
  assert.equal(esito.ripiegoRouter.codice, 'ROUTER_SECTION_INVALID');
  assert.equal(p.banco.routers.length, 0);
  assert.equal(esito.state, 'ready');
});

test('RT-08c #27351 after a crash: the restarted router\'s child stays «loading» ⇒ it is unloaded (no memory held), the engine stays failed', async (t) => {
  let carichi = 0;
  const attendi = async (_ms, signal) => { await new Promise((r) => setImmediate(r)); if (signal?.aborted) throw new Error('aborted'); };
  const p = prepara(t, { attendi, healthTimeoutMs: 60, esito: () => (++carichi === 1 ? 'ok' : 'bloccato') });
  await p.router.start({ modelId: 'mod-a', modelPath: p.a, contextLength: 8_192 });
  p.banco.routerVivo().cade();
  await finche(() => p.banco.routers.length === 2 && /router restart failed: still loading/u.test(p.registro.join('')));
  assert.ok(p.banco.routers[1].scaricati.some((s) => s.nome === 'mod-a'), 'the stuck child of the restarted router was unloaded');
  assert.equal(p.router.status().state, 'failed');
});

test('RT-08d decision 2: a router that stops answering in the middle of a load is a router failure ⇒ today\'s engine takes the model', async (t) => {
  const p = prepara(t, { ritardoMs: 200 });
  const avvio = p.router.start({ modelId: 'mod-a', modelPath: p.a, contextLength: 8_192 });
  await finche(() => p.banco.routers[0] && caricatiDi(p.banco.routers[0], 'mod-a').length === 1);
  p.banco.reteRotta = (percorso) => percorso.startsWith('/models');
  const esito = await avvio;
  assert.equal(esito.ripiegoRouter?.codice, 'ROUTER_UNREACHABLE', JSON.stringify(esito.ripiegoRouter));
  assert.equal(esito.state, 'ready');
  assert.equal(p.banco.standalone.length, 1);
});

test('RT-09 a stop during the load cancels it as today: RUNTIME_START_CANCELLED, and never a fallback', async (t) => {
  const p = prepara(t, { ritardoMs: 300 });
  const avvio = p.router.start({ modelId: 'mod-a', modelPath: p.a, contextLength: 8_192 });
  await finche(() => p.banco.routers[0] && caricatiDi(p.banco.routers[0], 'mod-a').length === 1);
  await p.router.stop();
  await assert.rejects(avvio, (e) => e.code === 'RUNTIME_START_CANCELLED');
  assert.equal(p.banco.standalone.length, 0);
  assert.equal(p.router.status().state, 'unavailable');
});

test('RT-10 A-6/A-7: stop() does not wait for the model to leave; the next load waits for it; A-R4: a stop during that wait does not wait', async (t) => {
  const p = prepara(t, { scaricoMs: 80, memoria: 100e9, leggiIntestazione: async () => ({ kvCacheBytesPerToken: 10 }) });
  await p.router.start({ modelId: 'mod-a', modelPath: p.a, contextLength: 8_192 });
  const t0 = Date.now();
  await p.router.stop();
  assert.ok(Date.now() - t0 < 60, 'stop returns before the child has left');
  await p.router.start({ modelId: 'mod-b', modelPath: p.b, contextLength: 16_384 });
  const carico = caricatiDi(p.banco.routers[0], 'mod-b')[0];
  assert.equal(carico.altri['mod-a'], 'unloaded', 'mod-b was loaded only after mod-a had left');

  const q = prepara(t, { scaricoMs: 60_000, attesaChiusuraMs: 5_000 });
  await q.router.start({ modelId: 'mod-a', modelPath: q.a, contextLength: 8_192 });
  await q.router.stop();
  const secondo = q.router.start({ modelId: 'mod-b', modelPath: q.b, contextLength: 16_384 });
  await new Promise((r) => setTimeout(r, 30));
  const t1 = Date.now();
  await q.router.stop();
  assert.ok(Date.now() - t1 < 1_000, 'the stop did not wait the 5 s');
  await assert.rejects(secondo, (e) => e.code === 'RUNTIME_START_CANCELLED');
});

test('RT-11 every request goes to the current model: reads get model=…&autoload=false, bodies get its model, the list shows it alone', async (t) => {
  const p = prepara(t);
  await p.router.start({ modelId: 'mod-a', modelPath: p.a, contextLength: 8_192 });
  await p.router.request('/props');
  assert.equal(p.banco.richieste.at(-1).percorso, '/props?model=mod-a&autoload=false');
  const risposta = await p.router.request('/v1/chat/completions', { method: 'POST', body: JSON.stringify({ model: 'qualunque', messages: [] }) });
  assert.equal((await risposta.json()).model, 'mod-a');
  assert.equal(JSON.parse(p.banco.richieste.at(-1).corpo).model, 'mod-a');
  const elenco = await (await p.router.request('/v1/models')).json();
  assert.deepEqual(elenco.data.map((m) => m.id), ['mod-a']);
  assert.deepEqual(await p.router.health(), { ok: true, status: 200 });
});

test('RT-12 the switch: with memory for two, the old model stays loaded and coming back to it is instant', async (t) => {
  const p = prepara(t, { memoria: 100e9, leggiIntestazione: async () => ({ kvCacheBytesPerToken: 10 }) });
  await p.router.start({ modelId: 'mod-a', modelPath: p.a, contextLength: 8_192 });
  await p.router.start({ modelId: 'mod-b', modelPath: p.b, contextLength: 16_384 });
  assert.equal(p.router.status().modelId, 'mod-b');
  assert.deepEqual(p.banco.routers[0].scaricati, [], 'nothing unloaded');
  await p.router.start({ modelId: 'mod-a', modelPath: p.a, contextLength: 8_192 });
  assert.equal(caricatiDi(p.banco.routers[0], 'mod-a').length, 1, 'mod-a was still loaded: no second load');
  assert.equal(p.router.status().windowTokens, 8_192);
});

test('RT-13 shutdown: the model, then the router\'s whole tree, and the preset file goes', async (t) => {
  const p = prepara(t);
  await p.router.start({ modelId: 'mod-a', modelPath: p.a, contextLength: 8_192 });
  await p.router.chiudi();
  assert.equal(p.alberiUccisi.length, 1);
  assert.equal(p.alberiUccisi[0], p.banco.routers[0]);
  assert.equal(existsSync(p.presetFile), false);
  assert.equal(existsSync(join(p.cartella, 'router', 'presets.key')), false, 'the key file goes too');
  assert.equal(p.router.status().state, 'unavailable');
});
