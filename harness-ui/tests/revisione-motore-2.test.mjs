/* Adversarial review of block 2 of the local engine (01/11/2026), commit 9bb5205a6. Every test states what the code SHOULD do: red = defect.
   The tests named «tiene» are attempts that did not break the code. Copy into harness-ui/tests/ to run. */
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { createLlamaServerSupervisor } from '../src/llama-server-supervisor.mjs';
import { createLlamaRouterSupervisor } from '../src/llama-router-supervisor.mjs';
import { creaAperturaCondivisa } from '../src/apertura-condivisa.mjs';
import { creaCambioDiModello } from '../src/attesa-turno.mjs';
import { creaAttesaScheda, creaLettoreScheda, creaMemoriaScheda } from '../src/attesa-scheda.mjs';
import { creaFinestraCheCresce } from '../src/finestra-che-cresce.mjs';
import { giroSulModelloLocale } from '../src/session-registry.mjs';
import { FILTRO_CARICAMENTO } from '../src/remoto/lista-bianca.mjs';
import { creaRouterFinto } from './aiuto/router-finto.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

const ms = (n) => new Promise((r) => setTimeout(r, n));
const MODELLO = 'C:\\models\\a.gguf';
async function finche(c, tetto = 2_000) { const fine = Date.now() + tetto; while (Date.now() < fine) { if (await c()) return true; await ms(2); } return false; }

/** Real supervisor, fake processes that leave at once. `salute.ok = false` keeps an opening in `loading`. */
function supervisoreVero() {
  const salute = { ok: true };
  const figli = [];
  const spawnImpl = () => {
    const c = new EventEmitter();
    c.stdout = new EventEmitter(); c.stderr = new EventEmitter();
    c.kill = () => { setImmediate(() => c.emit('close', 0, 'SIGTERM')); return true; };
    figli.push(c);
    return c;
  };
  const fetchImpl = async (url) => {
    const u = String(url);
    if (u.includes('/health')) return new Response('{}', { status: salute.ok ? 200 : 503 });
    if (u.includes('/props')) return new Response(JSON.stringify({ default_generation_settings: { n_ctx: 8192 } }), { status: 200 });
    if (u.includes('/slots')) return new Response('[]', { status: 200 });
    return new Response('{}', { status: 200 });
  };
  const s = createLlamaServerSupervisor({ binaryPath: 'llama-server.exe', spawnImpl, portAllocator: async () => 18080, pollIntervalMs: 1, attesaChiusuraMs: 500, fetchImpl, sondaBinario: async () => '' });
  return { s, salute, figli };
}

test('R-01 the window grows at the end of the turn while another chat waits to change: the chat is not refused', async (t) => {
  const { s, salute } = supervisoreVero();
  t.after(() => s.stop().catch(() => {}));
  await s.start({ modelId: 'a', modelPath: MODELLO, contextLength: 8192 });
  const cartella = mkdtempSync(join(tmpdir(), 'rev2-'));
  t.after(() => rimuoviCartellaDiProva(cartella));
  const finestra = creaFinestraCheCresce({ supervisor: s, motore: { load: (o) => s.start(o), unload: () => s.stop() },
    modello: async () => ({ modelPath: MODELLO, nome: 'a' }), leggiIntestazione: async () => ({ trainedContext: 1_000_000, kvCacheBytesPerToken: 100 }),
    misuraMacchina: async () => ({ memory: { freeBytes: 1e12 } }), gpuLayers: 1, cartella });
  let giri = ['altra']; // the other conversation is still in its turn
  const cambio = creaCambioDiModello({ stato: () => s.status(), scarica: () => s.stop(), giriInCorso: () => giri, motoreOccupato: async () => false, ogniMs: 5 });
  const apertura = creaAperturaCondivisa({ apri: (m, o) => s.start({ modelId: m, modelPath: MODELLO, contextLength: 8192, signal: o.signal }) });
  const stop = new AbortController();
  const b = apertura.apri('b', { signal: stop.signal, coda: true, prima: (segnale) => cambio.prepara('b', segnale) });
  b.catch(() => {});
  await ms(20);
  /* end of the turn: the growth of the old model starts (`allarga` with `proattiva`) and the turn is over */
  salute.ok = false;
  const allarga = finestra.allarga({ modelId: 'a', servono: 7_000, proattiva: true, forza: true });
  assert.ok(await finche(() => s.status().state === 'loading'), 'the growth is reopening the old model');
  giri = [];
  let esito = 'in attesa';
  b.then((v) => { esito = `aperto:${v.modelId}`; }, (e) => { esito = e.code ?? e.message; });
  await ms(60);
  salute.ok = true;
  await allarga.catch(() => {});
  await finche(() => esito !== 'in attesa', 500);
  assert.notEqual(esito, 'RUNTIME_ALREADY_RUNNING', 'the chat that waited for the other one dies of the growth of the other one');
});

test('R-02 a turn of a chat started as the chat page starts it counts as a turn on the model', () => {
  /* the voce as `POST /api/v1/sessions/custom` { modello: 'local:mod-a' } leaves it: read live from GET /api/v1/sessions, `giro2.mjs conta` */
  const voce = { provider: 'cloud', modello: 'local:mod-a', modelId: 'local:mod-a', conclusa: false };
  assert.equal(giroSulModelloLocale(voce, 'mod-a'), true);
});

test('R-03 a model that is not installed does not cost the open one', async () => {
  const s = { state: 'ready', modelId: 'a' };
  const scarichi = [];
  const cambio = creaCambioDiModello({ stato: () => s, scarica: async () => { scarichi.push(s.modelId); s.state = 'unavailable'; s.modelId = null; }, giriInCorso: () => [], motoreOccupato: async () => false, ogniMs: 1 });
  const apertura = creaAperturaCondivisa({ apri: async () => assert.fail('the engine is not asked') });
  const nomeDelModello = async () => { throw Object.assign(new Error('Modello locale non pronto'), { code: 'MODEL_NOT_FOUND' }); }; // as `server.mjs`
  await assert.rejects(apertura.apri('fantasma', { coda: true, prima: (segnale) => cambio.prepara('fantasma', segnale, { alVia: nomeDelModello }) }), { code: 'MODEL_NOT_FOUND' });
  assert.deepEqual(scarichi, [], 'the old model stays open');
});

test('R-04 router: the growth of one model does not unload the other one that another chat is using', async (t) => {
  const cartella = mkdtempSync(join(tmpdir(), 'rev2-router-'));
  t.after(() => rimuoviCartellaDiProva(cartella));
  const a = join(cartella, 'a.gguf'); const b = join(cartella, 'b.gguf');
  writeFileSync(a, 'GGUF-finto-a'); writeFileSync(b, 'GGUF-finto-b');
  const banco = creaRouterFinto({});
  const BIN = 'C:\\talos\\llama-server.exe';
  const opzioni = { binaryPath: BIN, spawnImpl: banco.spawnImpl, fetchImpl: banco.fetchImpl, portAllocator: banco.portAllocator, pollIntervalMs: 1, gpuLayers: 0, sondaBinario: () => '', attesaChiusuraMs: 500 };
  const standalone = createLlamaServerSupervisor(opzioni);
  const router = createLlamaRouterSupervisor({ binaryPath: BIN, standalone, presetFile: join(cartella, 'router', 'presets.ini'), spawnImpl: banco.spawnImpl, fetchImpl: banco.fetchImpl,
    portAllocator: banco.portAllocator, pollIntervalMs: 1, healthTimeoutMs: 2_000, attesaChiusuraMs: 500,
    modelliInstallati: async () => [{ modelId: 'mod-a', modelPath: a, opzioni: { contextLength: 8_192 } }, { modelId: 'mod-b', modelPath: b, opzioni: { contextLength: 16_384 } }],
    memoriaUtilizzabile: async () => 1e12, registro: () => {}, uccidiAlbero: async (f) => { f.kill('SIGTERM'); } });
  t.after(() => router.chiudi());
  await router.start({ modelId: 'mod-a', modelPath: a, contextLength: 8_192 });
  await router.start({ modelId: 'mod-b', modelPath: b, contextLength: 16_384 });
  const cartellaF = mkdtempSync(join(tmpdir(), 'rev2-f-'));
  t.after(() => rimuoviCartellaDiProva(cartellaF));
  const finestra = creaFinestraCheCresce({ supervisor: router, motore: { load: (o) => router.start(o), unload: () => router.stop() },
    modello: async () => ({ modelPath: b, nome: 'mod-b' }), leggiIntestazione: async () => ({ trainedContext: 1_000_000, kvCacheBytesPerToken: 100 }),
    misuraMacchina: async () => ({ memory: { freeBytes: 1e12 } }), gpuLayers: 1, cartella: cartellaF });
  const esito = await finestra.allarga({ modelId: 'mod-b', servono: 64_000, forza: true });
  const scaricati = banco.routers[0].scaricati.map((v) => v.nome);
  assert.equal(esito.ok, true, JSON.stringify(esito));
  assert.equal(scaricati.includes('mod-a'), false, `mod-a was serving another chat: ${JSON.stringify(scaricati)}`);
});

test('R-11 router on, a model on today\'s engine (the fallback): a chat on another model waits and changes, it is not refused', async (t) => {
  const cartella = mkdtempSync(join(tmpdir(), 'rev2-r11-'));
  t.after(() => rimuoviCartellaDiProva(cartella));
  const a = join(cartella, 'a.gguf'); const b = join(cartella, 'b.gguf');
  writeFileSync(a, 'GGUF-finto-a'); writeFileSync(b, 'GGUF-finto-b');
  const banco = creaRouterFinto({ esito: () => 'fallisce' });
  const BIN = 'C:\\talos\\llama-server.exe';
  const opzioni = { binaryPath: BIN, spawnImpl: banco.spawnImpl, fetchImpl: banco.fetchImpl, portAllocator: banco.portAllocator, pollIntervalMs: 1, gpuLayers: 0, sondaBinario: () => '', attesaChiusuraMs: 500 };
  const standalone = createLlamaServerSupervisor(opzioni);
  const router = createLlamaRouterSupervisor({ binaryPath: BIN, standalone, presetFile: join(cartella, 'router', 'presets.ini'), spawnImpl: banco.spawnImpl, fetchImpl: banco.fetchImpl,
    portAllocator: banco.portAllocator, pollIntervalMs: 1, healthTimeoutMs: 2_000, attesaChiusuraMs: 500,
    modelliInstallati: async () => [{ modelId: 'mod-a', modelPath: a, opzioni: { contextLength: 8_192 } }, { modelId: 'mod-b', modelPath: b, opzioni: { contextLength: 16_384 } }],
    memoriaUtilizzabile: async () => 1e12, registro: () => {}, uccidiAlbero: async (f) => { f.kill('SIGTERM'); } });
  t.after(() => router.chiudi());
  const uno = await router.start({ modelId: 'mod-a', modelPath: a, contextLength: 8_192 });
  assert.equal(uno.state, 'ready');
  /* `conRouter` as `server.mjs` gives it */
  const cambio = creaCambioDiModello({ stato: () => router.status(), scarica: () => router.stop(), giriInCorso: () => [], motoreOccupato: async () => false, conRouter: () => router.status().router?.proprietario !== 'standalone', ogniMs: 1 });
  const apertura = creaAperturaCondivisa({ apri: (m, o) => router.start({ modelId: m, modelPath: b, contextLength: 16_384, signal: o.signal }) });
  const esito = await apertura.apri('mod-b', { coda: true, prima: (segnale) => cambio.prepara('mod-b', segnale) }).then((v) => v.modelId, (e) => e.code);
  assert.equal(esito, 'mod-b');
});

test('R-12 a new turn on the old model does not pass ahead of the chat already waiting for its turn (Ollama: one pending request at a time, `server/sched.go:391-396`)', async () => {
  const s = { state: 'ready', modelId: 'a' };
  const giri = new Map([['a', ['aperta']]]);
  const cambio = creaCambioDiModello({ stato: () => s, scarica: async () => { s.state = 'unavailable'; s.modelId = null; }, giriInCorso: (m) => giri.get(m) ?? [], motoreOccupato: async () => false, ogniMs: 1 });
  const apertura = creaAperturaCondivisa({ apri: async (m) => { s.state = 'ready'; s.modelId = m; return s; } });
  const b = apertura.apri('b', { coda: true, prima: (segnale) => cambio.prepara('b', segnale) });
  await ms(5);
  /* a third chat on the old model: `localePronto` as `server.mjs` writes it. Only a turn already open needs the next step; this one is new. */
  const pronto = !cambio.portaChiusa() && !cambio.staDietro('terza') && s.state === 'ready' && s.modelId === 'a';
  giri.set('a', []);
  await b;
  assert.equal(pronto, false, 'the new turn found the model ready while another chat was waiting');
});

test('R-05 a read of the card whose process does not die still ends at its ceiling («non blocca mai a vuoto»)', async () => {
  const spawnImpl = () => {
    const c = new EventEmitter();
    c.stdout = new EventEmitter(); c.stderr = new EventEmitter();
    c.kill = () => true; // stuck in the driver: killed, not gone
    return c;
  };
  const leggi = creaLettoreScheda({ binaryPath: 'x', spawnImpl, tettoMs: 30, attesaUscitaMs: 30 });
  const esito = await Promise.race([leggi(), ms(400).then(() => 'appesa')]);
  assert.equal(esito, null);
});

test('R-06 an engine that never read the card (fell on the processor, or the router handing over) does not wait for memory it never took', async () => {
  let libera = 15_000;
  const letture = [];
  const leggi = async () => { letture.push(libera); return libera; };
  let adesso = 0;
  const attesa = creaAttesaScheda({ leggiLibera: leggi, now: () => adesso, dormi: async (n) => { adesso += n; }, tettoMs: 5_000 });
  const memoria = creaMemoriaScheda({ leggi, attesa });
  await memoria.primaDiAprire({}); // the opening reads the card, then falls on the processor
  memoria.dimentica(); // as the supervisor does on the processor, and the router handing over
  libera = 13_000; // a browser took 2 GB meanwhile
  const esito = await memoria.primaDiAprire({});
  assert.notEqual(esito?.esito, 'scaduta', `waited ${esito?.ms} ms and ${letture.length} reads for memory the engine never had`);
});

test('R-07 Stop during a card wait does not lose the measures: the next opening still waits', async () => {
  let libera = 5_000;
  const leggi = async () => libera;
  let adesso = 0;
  const stop = new AbortController();
  const attesa = creaAttesaScheda({ leggiLibera: leggi, now: () => adesso, dormi: async (n) => { adesso += n; stop.abort(); }, tettoMs: 5_000 });
  const memoria = creaMemoriaScheda({ leggi, attesa });
  libera = 15_000; await memoria.primaDiAprire({});
  libera = 5_000; memoria.aperto(); await ms(5); // engine open, 10 GB used
  libera = 6_000; // stopped: the memory is still coming back
  const uno = await memoria.primaDiAprire({ signal: stop.signal });
  assert.equal(uno.esito, 'annullata');
  const due = await memoria.primaDiAprire({});
  assert.notEqual(due, null, 'the wait is still owed: the card has not given the memory back');
});

test('tiene R-08 the bridge filter drops `inCoda` and `modelId`, keeps `waiting` and `freeing`', () => {
  for (const fase of ['waiting', 'freeing']) {
    const uscita = FILTRO_CARICAMENTO({ caricamento: { modelId: 'C:\\m\\a.gguf', nome: 'Beta', fase, percentuale: null, motivo: 'cambio', altroMotore: false, iniziatoIl: '2026-11-01T12:00:00.000Z', inCoda: ['mod-c'] }, observedAt: '2026-11-01T12:00:00.000Z' });
    assert.equal(uscita.caricamento.fase, fase);
    assert.equal('inCoda' in uscita.caricamento, false);
    assert.equal('modelId' in uscita.caricamento, false);
  }
});

test('tiene R-09 line: order of arrival over three models, Stop of the one in line leaves nothing behind, failure of the first frees the rest', async () => {
  const passi = [];
  let falliscePrimo = true;
  const apertura = creaAperturaCondivisa({ apri: async (m) => { passi.push(`apri:${m}`); await ms(10); if (falliscePrimo) { falliscePrimo = false; throw new Error('guasto'); } return { modelId: m }; } });
  const uno = apertura.apri('b', { coda: true, prima: async () => null });
  const stop = new AbortController();
  const due = apertura.apri('c', { coda: true, prima: async () => null, signal: stop.signal });
  const tre = apertura.apri('d', { coda: true, prima: async () => null });
  await ms(1);
  assert.deepEqual(apertura.inCoda().sort(), ['c', 'd']);
  stop.abort(new Error('fermato'));
  await assert.rejects(due, /fermato/u);
  assert.deepEqual(apertura.inCoda(), ['d']);
  await assert.rejects(uno, /guasto/u);
  assert.equal((await tre).modelId, 'd');
  assert.deepEqual(apertura.inCoda(), []);
  assert.deepEqual(passi, ['apri:b', 'apri:d']);
});

test('tiene R-13 B2 on a normal failure: a process that exited by itself leaves nothing to wait for, the next start goes at once', async (t) => {
  const figli = [];
  const spawnImpl = () => {
    const c = new EventEmitter();
    c.stdout = new EventEmitter(); c.stderr = new EventEmitter();
    c.kill = () => true;
    figli.push(c);
    if (figli.length === 1) setImmediate(() => { c.emit('exit', 1, null); c.emit('close', 1, null); });
    return c;
  };
  const fetchImpl = async (url) => (String(url).includes('/health') ? new Response('{}', { status: figli.length > 1 ? 200 : 503 }) : new Response(JSON.stringify({ default_generation_settings: { n_ctx: 8192 } }), { status: 200 }));
  const s = createLlamaServerSupervisor({ binaryPath: 'llama-server.exe', spawnImpl, portAllocator: async () => 18080, pollIntervalMs: 1, attesaChiusuraMs: 3_000, fetchImpl, sondaBinario: async () => '' });
  await assert.rejects(s.start({ modelId: 'a', modelPath: MODELLO, contextLength: 8192 }), { code: 'RUNTIME_PROCESS_FAILED' });
  const t0 = Date.now();
  const due = s.start({ modelId: 'a', modelPath: MODELLO, contextLength: 8192 });
  t.after(() => { for (const f of figli) f.emit('close', 0, null); return s.stop().catch(() => {}); });
  assert.equal((await due).state, 'ready');
  assert.ok(Date.now() - t0 < 1_000, `no wait for a process already gone: ${Date.now() - t0} ms`);
});

test('R-10 the Model Lab waiting on a chat change: the Stop of the chat stops the change', async () => {
  const s = { state: 'ready', modelId: 'a' };
  const scarichi = [];
  let occupato = true;
  const cambio = creaCambioDiModello({ stato: () => s, scarica: async () => { scarichi.push(s.modelId); s.state = 'unavailable'; s.modelId = null; }, giriInCorso: () => [], motoreOccupato: async () => occupato, ogniMs: 1 });
  const apertura = creaAperturaCondivisa({ apri: async (m) => { s.state = 'ready'; s.modelId = m; return s; } });
  const stop = new AbortController();
  const chat = apertura.apri('b', { signal: stop.signal, coda: true, prima: (segnale) => cambio.prepara('b', segnale) });
  chat.catch(() => {});
  await ms(5);
  const lab = apertura.apri('b', {}); // `POST /api/v1/runtime/load`: no signal, no window. FORMA punto 6: «resta com'è, con "libera prima il modello"»
  lab.catch(() => {});
  stop.abort(new Error('fermato'));
  await assert.rejects(chat, /fermato/u);
  occupato = false;
  await ms(30);
  assert.deepEqual(scarichi, [], 'after the only person watching pressed Stop, the old model stays open');
});
