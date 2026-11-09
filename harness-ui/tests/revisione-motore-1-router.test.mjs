/* Adversarial review of block 1: the router and the bridge. Red = defect; the tests named «tiene» are attempts that did not break the code. */
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { createLlamaServerSupervisor } from '../src/llama-server-supervisor.mjs';
import { createLlamaRouterSupervisor } from '../src/llama-router-supervisor.mjs';
import { fotoDelCaricamento } from '../src/apertura-condivisa.mjs';
import { createHttpApp } from '../src/http-app.mjs';
import { creaChiamataInterna } from '../src/remoto/chiamata-interna.mjs';
import { creaOperazioni } from '../src/remoto/operazioni.mjs';
import { iscriviConRigiocata } from '../src/iscrizione-sessione.mjs';
import { creaRouterFinto } from './aiuto/router-finto.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

const BIN = 'C:\\talos\\llama-server.exe';
const ms = (n) => new Promise((r) => setTimeout(r, n));
async function finche(c, tetto = 3_000) { const fine = Date.now() + tetto; while (Date.now() < fine) { if (await c()) return true; await ms(2); } throw new Error('condition not reached in time'); }
const caricatiDi = (router, nome) => router.caricati.filter((c) => c.nome === nome);

function prepara(t, { suSpawn = null, attesaChiusuraMs = 500, memoria = null, ...finto } = {}) {
  const cartella = mkdtempSync(join(tmpdir(), 'rev-router-'));
  t.after(() => rimuoviCartellaDiProva(cartella));
  const a = join(cartella, 'a.gguf'); const b = join(cartella, 'b.gguf');
  writeFileSync(a, 'GGUF-finto-a'); writeFileSync(b, 'GGUF-finto-b');
  const banco = creaRouterFinto(finto);
  const spawnImpl = (...args) => { const c = banco.spawnImpl(...args); suSpawn?.(args); return c; };
  const opzioni = { binaryPath: BIN, spawnImpl, fetchImpl: banco.fetchImpl, portAllocator: banco.portAllocator, pollIntervalMs: 1, gpuLayers: 0, sondaBinario: () => '', attesaChiusuraMs };
  const standalone = createLlamaServerSupervisor(opzioni);
  const eventi = [];
  const router = createLlamaRouterSupervisor({ binaryPath: BIN, standalone, presetFile: join(cartella, 'router', 'presets.ini'), spawnImpl, fetchImpl: banco.fetchImpl,
    portAllocator: banco.portAllocator, pollIntervalMs: 1, healthTimeoutMs: 2_000, attesaChiusuraMs,
    modelliInstallati: async () => [{ modelId: 'mod-a', modelPath: a, opzioni: { contextLength: 8_192 } }, { modelId: 'mod-b', modelPath: b, opzioni: { contextLength: 16_384 } }],
    memoriaUtilizzabile: async () => memoria, registro: () => {}, uccidiAlbero: async (f) => { f.kill('SIGTERM'); } });
  router.subscribeLogs((v) => eventi.push(v));
  t.after(() => router.chiudi());
  return { a, b, banco, standalone, router, eventi };
}

test('tiene: cancelled in the middle of the fallback, the owner goes back to the router and nothing is remembered', async (t) => {
  const stop = new AbortController();
  const p = prepara(t, { esito: () => 'fallisce' });
  p.router.subscribeLogs((v) => { if (v.ripiegoRouter) stop.abort(); });
  await assert.rejects(p.router.start({ modelId: 'mod-a', modelPath: p.a, contextLength: 8_192, signal: stop.signal }), { code: 'RUNTIME_START_CANCELLED' });
  assert.equal(p.router.status().state, 'unavailable');
  assert.equal(p.router.status().router.ripiegoInCorso, undefined);
  assert.deepEqual(p.router.status().router.ripieghi, [], 'a stop is not a failure: nothing remembered');
  /* the next load is allowed, and tries the router again */
  const prima = caricatiDi(p.banco.routers[0], 'mod-a').length;
  const esito = await p.router.start({ modelId: 'mod-a', modelPath: p.a, contextLength: 8_192 });
  assert.equal(esito.state, 'ready');
  assert.equal(caricatiDi(p.banco.routers.at(-1), 'mod-a').length > (p.banco.routers.length === 1 ? prima : 0), true, 'the router was asked again');
  assert.equal(esito.ripiegoRouter?.modelId, 'mod-a', 'the fallback is told, once');
});

test('tiene: after a cancelled load the same model loads again only when the old child has left', async (t) => {
  const p = prepara(t, { ritardoMs: 200, scaricoMs: 60 });
  const stop = new AbortController();
  const uno = p.router.start({ modelId: 'mod-a', modelPath: p.a, contextLength: 8_192, signal: stop.signal });
  await finche(() => p.banco.routers[0] && caricatiDi(p.banco.routers[0], 'mod-a').length === 1);
  stop.abort();
  await assert.rejects(uno, { code: 'RUNTIME_START_CANCELLED' });
  const t0 = Date.now();
  const esito = await p.router.start({ modelId: 'mod-a', modelPath: p.a, contextLength: 8_192 });
  assert.equal(esito.state, 'ready');
  assert.equal(caricatiDi(p.banco.routers[0], 'mod-a').length, 2, 'a real second load');
  assert.ok(Date.now() - t0 >= 50, 'it waited for the unload');
});

test('REV-8 a Stop during the very first start of the router does not leave a router without its progress stream', async (t) => {
  const stop = new AbortController();
  let abortito = false;
  const p = prepara(t, { suSpawn: () => { if (!abortito) { abortito = true; stop.abort(); } } });
  await assert.rejects(p.router.start({ modelId: 'mod-a', modelPath: p.a, contextLength: 8_192, signal: stop.signal }), { code: 'RUNTIME_START_CANCELLED' });
  assert.equal(p.banco.routers.filter((r) => r.vivo).length, 1, 'the router stayed up, with nobody having seen it healthy');
  await p.router.start({ modelId: 'mod-a', modelPath: p.a, contextLength: 8_192 });
  await ms(20);
  assert.ok(p.banco.richieste.some((r) => r.percorso === '/models/sse'), 'the live row has no percent without this stream, for the whole life of this router');
});

test('REV-9 a cancelled change of model does not leave the old model in the memory with nobody able to free it', async (t) => {
  const p = prepara(t, { ritardoMs: 150, memoria: 100e9, leggiIntestazione: async () => ({}) });
  await p.router.start({ modelId: 'mod-a', modelPath: p.a, contextLength: 8_192 });
  const stop = new AbortController();
  const due = p.router.start({ modelId: 'mod-b', modelPath: p.b, contextLength: 16_384, signal: stop.signal });
  await finche(() => caricatiDi(p.banco.routers[0], 'mod-b').length === 1);
  stop.abort();
  await assert.rejects(due, { code: 'RUNTIME_START_CANCELLED' });
  await p.router.stop({ tutti: true }); // the «free the memory» button
  await ms(20);
  const statoDiA = p.banco.routers[0].stati.get('mod-a')?.value;
  assert.equal(statoDiA, 'unloaded', 'mod-a still in the memory after «free the memory»');
});

test('tiene: the bridge reaches the route for real: internal call, filter, list of operations', async () => {
  const sessionRegistry = { elenca: () => [], esiste: () => false };
  const stato = { state: 'loading', modelId: 'mod-a', startedAt: '2026-11-01T10:00:00.000Z', router: { caricamento: { modelId: 'mod-a', fase: 'text_model', percentuale: 41 }, ripiegoInCorso: 'mod-a' } };
  let attuale = stato;
  const localRuntimes = { 'llama.cpp': { caricamento: () => ({ caricamento: fotoDelCaricamento(attuale, { nome: 'Gemma' }), observedAt: 'ora' }) } };
  const httpApp = createHttpApp({ senzaGettone: 'prove', staticHandler: async () => null, sessionRegistry, localRuntimes });
  const chiama = creaChiamataInterna({ httpApp, porta: 4999 });
  const operazioni = creaOperazioni({ chiama, sessionRegistry, iscriviConRigiocata });
  const contesto = { dispositivo: { id: 'd', nome: 'Pad' }, iscrizioni: new Map(), iscrivi: () => async () => {} };
  assert.ok(operazioni.elenco().includes('engine.loading'));
  assert.deepEqual(await operazioni.esegui('engine.loading', {}, contesto), { caricamento: { nome: 'Gemma', fase: 'text_model', percentuale: 41, motivo: 'apertura', altroMotore: true, iniziatoIl: '2026-11-01T10:00:00.000Z' }, observedAt: 'ora' });
  attuale = { state: 'ready' };
  assert.deepEqual(await operazioni.esegui('engine.loading', {}, contesto), { caricamento: null, observedAt: 'ora' });
});
