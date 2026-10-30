/*
 * The growing window (L1 1.3) in ROUTER mode (27/10/2026, brief point 5): the router-mode equivalents of the main supervisor tests
 * (`finestra-che-cresce-supervisore.test.mjs` FC-SUP-01..03). Growth calls `motore.unload()` then `motore.load({ contextLength })`, as
 * today; in router mode that is: the model leaves the router, its section is rewritten with the new `ctx-size`, `GET /models?reload=1`,
 * and only that model is loaded again. Going back (`riapri`) puts back the old section, byte for byte.
 * The card is the one of FC-SUP: a MoE that never fits whole (fitter `-ngl 41`), `-ngl 99` at 64K or more dies, `--fit` fits up to
 * `fitFinoA`. Today's engine (the fallback) lives on the same card, so it fails exactly when the router's child does.
 */
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { createLlamaServerSupervisor } from '../src/llama-server-supervisor.mjs';
import { createLlamaRouterSupervisor } from '../src/llama-router-supervisor.mjs';
import { createLlamaServerRuntime } from '../src/local-runtime-llama-server.mjs';
import { creaFinestraCheCresce } from '../src/finestra-che-cresce.mjs';
import { readGgufHeader } from '../src/gguf-header.mjs';
import { creaRouterFinto, leggiIni } from './aiuto/router-finto.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

function gguf(cartella, nome, { addestrata, esperti } = {}) {
  const parti = [];
  const u32 = (n) => { const b = Buffer.alloc(4); b.writeUInt32LE(n); parti.push(b); };
  const u64 = (n) => { const b = Buffer.alloc(8); b.writeBigUInt64LE(BigInt(n)); parti.push(b); };
  const str = (s) => { const b = Buffer.from(s, 'utf8'); u64(b.length); parti.push(b); };
  const kv = [['general.architecture', 8, 'prova'], ['prova.context_length', 4, addestrata], ['prova.embedding_length', 4, 2048], ['prova.block_count', 4, 24]];
  if (esperti) kv.push(['prova.expert_count', 4, esperti]);
  parti.push(Buffer.from('GGUF', 'ascii')); u32(3); u64(0); u64(kv.length);
  for (const [chiave, tipo, valore] of kv) { str(chiave); u32(tipo); if (tipo === 8) str(valore); else u32(valore); }
  const percorso = join(cartella, nome);
  writeFileSync(percorso, Buffer.concat(parti));
  return percorso;
}

const muore = (ngl, ctx, fitFinoA) => (ngl === '99' && ctx >= 65_536) || (ngl === null && ctx > fitFinoA);

function banco(t, { fitFinoA = 262_144 } = {}) {
  const cartella = mkdtempSync(join(tmpdir(), 'fc-router-'));
  t.after(() => rimuoviCartellaDiProva(cartella));
  const moe = gguf(cartella, 'moe.gguf', { addestrata: 262_144, esperti: 64 });
  const altro = gguf(cartella, 'altro.gguf', { addestrata: 262_144, esperti: 64 });
  const finto = creaRouterFinto({
    esito: (_nome, sezione) => (muore(sezione.get('n-gpu-layers') ?? null, Number(sezione.get('ctx-size')), fitFinoA) ? 'fallisce' : 'ok'),
    esitoStandalone: (args) => (muore(args.includes('-ngl') ? args[args.indexOf('-ngl') + 1] : null, Number(args[args.indexOf('-c') + 1]), fitFinoA) ? 'fallisce' : 'ok'),
  });
  const fitter = (_eseguibile, a) => (a.includes('--help') ? '' : '-c 65536 -ngl 41 -ot "blk\\.38=CPU"');
  const standalone = createLlamaServerSupervisor({
    binaryPath: 'C:\\talos\\llama-server.exe', motore: { variante: 'vulkan', dispositivi: [] }, spawnImpl: finto.spawnImpl, fetchImpl: finto.fetchImpl,
    portAllocator: finto.portAllocator, pollIntervalMs: 1, gpuLayers: 99, sondaBinario: fitter, attesaChiusuraMs: 500,
  });
  const presetFile = join(cartella, 'router', 'presets.ini');
  const supervisor = createLlamaRouterSupervisor({
    binaryPath: 'C:\\talos\\llama-server.exe', standalone, presetFile, spawnImpl: finto.spawnImpl, fetchImpl: finto.fetchImpl,
    portAllocator: finto.portAllocator, pollIntervalMs: 1, attesaChiusuraMs: 500, registro: () => {},
    modelliInstallati: async () => [{ modelId: 'm1', modelPath: moe, opzioni: { finestraDiRiserva: 16_384 } }, { modelId: 'm2', modelPath: altro, opzioni: { finestraDiRiserva: 16_384 } }],
    memoriaUtilizzabile: async () => 100e9, leggiIntestazione: async () => ({ kvCacheBytesPerToken: 10 }), uccidiAlbero: async (c) => c.kill('SIGTERM'),
  });
  t.after(() => supervisor.chiudi());
  const llama = createLlamaServerRuntime({ supervisor });
  const percorsi = { m1: moe, m2: altro };
  /* `riapri` as server.mjs: today's load, no window asked (the loader's reserve, then the default window with the fitter) */
  const avvioDiSempre = (id) => llama.load({ modelId: id, modelPath: percorsi[id], finestraDiRiserva: 16_384 });
  const f = creaFinestraCheCresce({
    supervisor, motore: { load: (o) => llama.load(o), unload: () => llama.unload(), riapri: avvioDiSempre },
    modello: async (id) => ({ modelPath: percorsi[id], nome: id }), leggiIntestazione: (p) => readGgufHeader(p),
    misuraMacchina: async () => ({ memory: { freeBytes: 64e9 } }), gpuLayers: 99, cartella,
  });
  return { f, supervisor, finto, presetFile, avvioDiSempre, percorsi };
}

const sezione = (presetFile, nome) => leggiIni(readFileSync(presetFile, 'utf8')).get(nome);
const testoSezione = (presetFile, nome) => (readFileSync(presetFile, 'utf8').split('\n\n').find((s) => s.startsWith(`[${nome}]`)) ?? null);

test('FC-RT-01 (≈FC-SUP-01) the MoE grows to 96K with --fit: its section is rewritten, the router reads it again, ONLY that model reloads', async (t) => {
  const b = banco(t);
  await b.avvioDiSempre('m2'); // another model, loaded in the router before
  await b.avvioDiSempre('m1');
  const router = b.finto.routers[0];
  assert.equal(sezione(b.presetFile, 'm1').get('ctx-size'), '65536', 'premise (L1D-04): 64K');
  assert.equal(sezione(b.presetFile, 'm1').has('n-gpu-layers'), false, 'premise: --fit, no -ngl 99');
  const esito = await b.f.allarga({ modelId: 'm1', servono: 49_200, proattiva: true });
  assert.equal(esito.ok, true, JSON.stringify(esito));
  assert.equal(esito.dopo, 98_304);
  assert.equal(sezione(b.presetFile, 'm1').get('ctx-size'), '98304');
  assert.equal(sezione(b.presetFile, 'm1').has('n-gpu-layers'), false, 'a told window on a MoE that does not fit whole lets --fit decide (A-2)');
  assert.equal(router.ricariche, 1, 'GET /models?reload=1, once');
  assert.deepEqual(router.scaricati.map((s) => s.nome), ['m1'], 'only m1 left the memory');
  assert.equal(router.caricati.filter((c) => c.nome === 'm1').length, 2);
  assert.equal(router.stati.get('m2').value, 'loaded', 'm2 untouched');
  assert.deepEqual({ state: b.supervisor.status().state, windowTokens: b.supervisor.status().windowTokens }, { state: 'ready', windowTokens: 98_304 });
  assert.equal(b.finto.standalone.length, 0, 'today\'s engine never started');
});

test('FC-RT-02 (≈FC-SUP-02) the bigger window does not fit: the old section comes back byte for byte, the model is loaded again, not marked as a fallback', async (t) => {
  const b = banco(t, { fitFinoA: 65_536 });
  await b.avvioDiSempre('m1');
  const prima = testoSezione(b.presetFile, 'm1');
  let errore = null;
  const esito = await b.f.allarga({ modelId: 'm1', servono: 49_200, proattiva: true }).catch((e) => { errore = e; return null; });
  assert.equal(errore, null, `allarga threw: ${errore?.code}`);
  assert.equal(esito.ok, false);
  assert.equal(testoSezione(b.presetFile, 'm1'), prima, 'the old section, byte for byte');
  assert.deepEqual({ state: b.supervisor.status().state, windowTokens: b.supervisor.status().windowTokens, modelId: b.supervisor.status().modelId },
    { state: 'ready', windowTokens: 65_536, modelId: 'm1' });
  assert.deepEqual(b.supervisor.status().router.ripieghi, [], 'today\'s engine failed too: the router was not the reason');
  assert.equal(b.finto.routers.at(-1).stati.get('m1').value, 'loaded', 'back in the router');
});

test('FC-RT-03 (≈FC-SUP-03) the other way: a DENSE model with a told window keeps -ngl 99 in its section', async (t) => {
  const b = banco(t);
  const cartella = mkdtempSync(join(tmpdir(), 'fc-router-denso-'));
  t.after(() => rimuoviCartellaDiProva(cartella));
  const denso = gguf(cartella, 'denso.gguf', { addestrata: 131_072 });
  await b.supervisor.start({ modelId: 'd1', modelPath: denso, contextLength: 32_768 });
  assert.equal(sezione(b.presetFile, 'd1').get('n-gpu-layers'), '99');
  assert.equal(sezione(b.presetFile, 'd1').get('ctx-size'), '32768');
});
