/*
 * The wait for the graphics card inside the two real supervisors (A2-1, form of 01/11/2026), with the fake engine of the router tests.
 * What is proved here is the ORDER: the old engine leaves, then the wait, then the new engine; the reading at ready never holds up an opening.
 */
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { fotoDelCaricamento } from '../src/apertura-condivisa.mjs';
import { createLlamaRouterSupervisor } from '../src/llama-router-supervisor.mjs';
import { createLlamaServerSupervisor } from '../src/llama-server-supervisor.mjs';
import { creaRouterFinto } from './aiuto/router-finto.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

const BIN = 'C:\\talos\\llama-server.exe';

function schedaFinta(alPrima = async () => null) {
  const chiamate = [];
  const s = {
    chiamate, inAttesa: false,
    liberando: () => s.inAttesa,
    ultima: () => null,
    primaDiAprire: async (opzioni) => { chiamate.push({ cosa: 'prima', liberato: opzioni?.liberato, signal: opzioni?.signal }); return alPrima(opzioni); },
    aperto: () => { chiamate.push({ cosa: 'aperto' }); },
    dimentica: () => { chiamate.push({ cosa: 'dimentica' }); },
  };
  return s;
}

function prepara(t, { scheda = null, motore = { variante: 'vulkan', dispositivi: [] }, memoria = null, modelStore = null, now, alSpawn, ...finto } = {}) {
  const cartella = mkdtempSync(join(tmpdir(), 'scheda-'));
  t.after(() => rimuoviCartellaDiProva(cartella));
  const a = join(cartella, 'a.gguf');
  const b = join(cartella, 'b.gguf');
  writeFileSync(a, 'GGUF-finto-a');
  writeFileSync(b, 'GGUF-finto-b');
  const banco = creaRouterFinto(finto);
  const usciti = [];
  const spawnImpl = (...argomenti) => { const figlio = banco.spawnImpl(...argomenti); figlio.once('close', () => usciti.push(figlio)); alSpawn?.(); return figlio; };
  const registro = [];
  const opzioni = { binaryPath: BIN, spawnImpl, fetchImpl: banco.fetchImpl, portAllocator: banco.portAllocator, pollIntervalMs: 1, gpuLayers: 0, sondaBinario: () => '', attesaChiusuraMs: 500, motore, registro: (riga) => registro.push(riga), ...(now ? { now } : {}) };
  const oggi = createLlamaServerSupervisor({ ...opzioni, scheda });
  const senzaScheda = createLlamaServerSupervisor(opzioni);
  const router = createLlamaRouterSupervisor({
    binaryPath: BIN, standalone: senzaScheda, modelStore, presetFile: join(cartella, 'router', 'presets.ini'), spawnImpl, fetchImpl: banco.fetchImpl, portAllocator: banco.portAllocator,
    pollIntervalMs: 1, healthTimeoutMs: 2_000, attesaChiusuraMs: 500, scheda,
    modelliInstallati: async () => [{ modelId: 'mod-a', modelPath: a, opzioni: { contextLength: 8_192 } }, { modelId: 'mod-b', modelPath: b, opzioni: { contextLength: 16_384 } }],
    memoriaUtilizzabile: async () => memoria, leggiIntestazione: async () => ({ kvCacheBytesPerToken: 10 }), registro: (riga) => registro.push(riga),
    uccidiAlbero: async (figlio) => { figlio.kill('SIGTERM'); },
  });
  t.after(() => router.chiudi());
  return { a, b, banco, oggi, router, usciti, registro };
}

async function finche(condizione) {
  const scadenza = Date.now() + 3_000;
  while (Date.now() < scadenza) {
    if (await condizione()) return;
    await new Promise((r) => { setTimeout(r, 2); });
  }
  throw new Error('condition not reached in time');
}

test('AP-01 today\'s engine: the old one has left, then the wait, then the new one, and the reading at ready comes last', async (t) => {
  const visti = [];
  let p = null;
  const scheda = schedaFinta(async () => { visti.push({ processi: p.banco.spawn.length, usciti: p.usciti.length }); return null; });
  p = prepara(t, { scheda });
  await p.oggi.start({ modelId: 'mod-a', modelPath: p.a, contextLength: 8_192 });
  assert.deepEqual(scheda.chiamate.map((c) => c.cosa), ['prima', 'aperto']);
  assert.deepEqual(visti, [{ processi: 0, usciti: 0 }], 'before the first process');
  await p.oggi.stop();
  await p.oggi.start({ modelId: 'mod-a', modelPath: p.a, contextLength: 16_384 });
  assert.deepEqual(scheda.chiamate.map((c) => c.cosa), ['prima', 'aperto', 'prima', 'aperto']);
  assert.deepEqual(visti[1], { processi: 1, usciti: 1 }, 'the old process has really gone and the new one has not started');
  assert.equal(scheda.chiamate[2].liberato, undefined, 'one engine at a time: its memory is always coming back');
});

test('AP-02 today\'s engine: while it waits the state says which model and why; the Stop ends it and no process starts', async (t) => {
  let rilascia;
  const scheda = schedaFinta(({ signal }) => new Promise((fatto) => { rilascia = fatto; signal.addEventListener('abort', () => fatto({ esito: 'annullata', ms: 1, liberaMiB: null }), { once: true }); }));
  const p = prepara(t, { scheda });
  const fermo = new AbortController();
  const avvio = p.oggi.start({ modelId: 'mod-a', modelPath: p.a, contextLength: 8_192, signal: fermo.signal });
  await finche(() => typeof rilascia === 'function');
  scheda.inAttesa = true;
  const stato = p.oggi.status();
  assert.deepEqual([stato.state, stato.fase, stato.modelId], ['loading', 'freeing', 'mod-a']);
  assert.ok(stato.startedAt, 'the seconds of the row count from here');
  assert.ok(scheda.chiamate[0].signal instanceof AbortSignal, 'the wait hears the Stop');
  assert.deepEqual([fotoDelCaricamento(stato).fase, fotoDelCaricamento(stato).modelId], ['freeing', 'mod-a']);
  scheda.inAttesa = false;
  fermo.abort();
  await assert.rejects(avvio, (e) => e.code === 'RUNTIME_START_CANCELLED');
  assert.equal(p.banco.spawn.length, 0);
});

test('AP-03 the log says the wait with its time, only when there was one', async (t) => {
  const esiti = [{ esito: 'tornata', ms: 750, liberaMiB: 15_000 }, { esito: 'scaduta', ms: 5_000, liberaMiB: 9_000 }, { esito: 'saltata', ms: 0, liberaMiB: null }, null];
  const p = prepara(t, { scheda: schedaFinta(async () => esiti.shift()) });
  for (let i = 0; i < 4; i += 1) {
    await p.oggi.start({ modelId: 'mod-a', modelPath: p.a, contextLength: 8_192 });
    await p.oggi.stop();
  }
  assert.deepEqual(p.registro.filter((riga) => riga.includes('graphics card')), ['[talos] graphics card: tornata after 750 ms\n', '[talos] graphics card: scaduta after 5000 ms\n']);
});

test('AP-04 a CPU fallback or engine has no card memory to measure at ready', async (t) => {
  const scheda = schedaFinta();
  const p = prepara(t, { scheda, motore: { variante: 'cpu', dispositivi: [] } });
  await p.oggi.start({ modelId: 'mod-a', modelPath: p.a, contextLength: 8_192 });
  assert.deepEqual(scheda.chiamate.map((c) => c.cosa), ['prima', 'dimentica']);
});

test('M12 the seconds of the row start with the opening, not with each process: a retry is the same opening', async (t) => {
  let ore = 0;
  const now = () => new Date(Date.UTC(2026, 10, 1, 12, 0, ore++));
  let visto;
  let p = null;
  p = prepara(t, { now, alSpawn: () => { visto = p.oggi.status().startedAt; } });
  const primoIstante = new Date(Date.UTC(2026, 10, 1, 12, 0, ore)).toISOString();
  await p.oggi.start({ modelId: 'mod-a', modelPath: p.a, contextLength: 8_192 });
  assert.equal(visto, primoIstante, 'the first instant of the opening');
});

test('AP-05 no record, no reading: the start is the same as always', async (t) => {
  const p = prepara(t);
  const stato = await p.oggi.start({ modelId: 'mod-a', modelPath: p.a, contextLength: 8_192 });
  assert.equal(stato.state, 'ready');
  assert.equal(stato.fase, undefined);
});

test('AP-06 the router: a stop means the wait, after the model has left', async (t) => {
  const visti = [];
  let p = null;
  const scheda = schedaFinta(async (o) => { visti.push({ liberato: o.liberato, scaricati: p.banco.routers[0]?.scaricati.length ?? 0, stato: p.router.status().state }); return null; });
  p = prepara(t, { scheda, scaricoMs: 40 });
  await p.router.start({ modelId: 'mod-a', modelPath: p.a, contextLength: 8_192 });
  assert.deepEqual(scheda.chiamate.map((c) => c.cosa), ['prima', 'aperto']);
  await p.router.stop();
  await p.router.start({ modelId: 'mod-a', modelPath: p.a, contextLength: 8_192 });
  assert.equal(visti[1].liberato, true);
  assert.equal(visti[1].scaricati, 1, 'the wait starts when the model has left the router');
  assert.equal(visti[1].stato, 'loading');
});

test('AP-07 the router: a change of model keeps the old one loaded, so nothing is coming back', async (t) => {
  const scheda = schedaFinta();
  const p = prepara(t, { scheda, memoria: 100e9 });
  await p.router.start({ modelId: 'mod-a', modelPath: p.a, contextLength: 8_192 });
  await p.router.start({ modelId: 'mod-b', modelPath: p.b, contextLength: 16_384 });
  assert.deepEqual(scheda.chiamate.filter((c) => c.cosa === 'prima').map((c) => c.liberato), [true, false]);
  assert.equal(scheda.chiamate.filter((c) => c.cosa === 'aperto').length, 2, 'the measure takes in the second model too');
});

test('AP-08 the router: while it waits the state says which model; the Stop leaves no router and no engine behind', async (t) => {
  let rilascia;
  const scheda = schedaFinta(({ signal }) => new Promise((fatto) => { rilascia = fatto; signal.addEventListener('abort', () => fatto({ esito: 'annullata', ms: 1, liberaMiB: null }), { once: true }); }));
  const blocchi = [];
  const p = prepara(t, { scheda, modelStore: { lock: async (id) => { blocchi.push(id); }, unlock: async () => {} } });
  const fermo = new AbortController();
  const avvio = p.router.start({ modelId: 'mod-a', modelPath: p.a, contextLength: 8_192, signal: fermo.signal });
  await finche(() => typeof rilascia === 'function');
  scheda.inAttesa = true;
  const stato = p.router.status();
  assert.deepEqual([stato.state, stato.fase, stato.modelId], ['loading', 'freeing', 'mod-a']);
  assert.ok(stato.startedAt);
  scheda.inAttesa = false;
  fermo.abort();
  await assert.rejects(avvio, (e) => e.code === 'RUNTIME_START_CANCELLED');
  assert.equal(p.banco.spawn.length, 0);
  assert.deepEqual(blocchi, [], 'nothing goes on after the Stop, not even the lock of the model');
  assert.equal(p.router.status().state, 'unavailable');
});

test('AP-09 the router logs the wait too', async (t) => {
  const esiti = [null, { esito: 'tornata', ms: 500, liberaMiB: 15_000 }];
  const p = prepara(t, { scheda: schedaFinta(async () => esiti.shift()) });
  await p.router.start({ modelId: 'mod-a', modelPath: p.a, contextLength: 8_192 });
  await p.router.stop();
  await p.router.start({ modelId: 'mod-a', modelPath: p.a, contextLength: 8_192 });
  assert.deepEqual(p.registro.filter((riga) => riga.includes('graphics card')), ['[talos] graphics card: tornata after 500 ms\n']);
});
