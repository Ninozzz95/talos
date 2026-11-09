/*
 * 01/11/2026, «Memoria delle conversazioni»: l'aggancio al giro, con registro e adattatore veri e un motore finto HTTP. Prima di ogni
 * richiesta al motore di questo PC la foto della conversazione torna (`primaDellaRichiestaLocale`); a fine giro la scheda va su disco
 * (`dopoIlGiro`), PRIMA del riassunto di fine giro che sullo stesso motore la sovrascriverebbe.
 */
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createSessionRegistry } from '../src/session-registry.mjs';
import { createOwnerRuntimeAdapter } from '../src/runtime-owner-adapter.mjs';
import { avviaSessione } from '../src/agent-service.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

const sse = (frames) => frames.map((f) => `data: ${JSON.stringify(f)}\n\n`).join('') + 'data: [DONE]\n\n';

async function prepara(t, { foto = true, salva = null } = {}) {
  const server = createServer((req, res) => {
    req.resume();
    req.on('end', () => { res.writeHead(200, { 'Content-Type': 'text/event-stream' }); res.end(sse([{ choices: [{ delta: { content: 'ciao' } }] }])); });
  });
  await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
  t.after(() => new Promise((ok) => server.close(ok)));
  const cartella = mkdtempSync(join(tmpdir(), 'foto-giro-'));
  t.after(() => rimuoviCartellaDiProva(cartella));
  const chiamate = [];
  const fotoConversazioni = { dopoIlGiro: async (s, o) => { chiamate.push(['dopo', s, o?.modello]); if (salva) await salva; return { esito: 'salvata' }; },
    dimentica: async (s) => { chiamate.push(['dimentica', s]); return 1; } };
  const destinazioneModelloDeps = { leggiChiave: () => null, leggiRuntime: () => ({ endpoint: null }), localePronto: () => true, avviaLocale: async () => {},
    chiamaLocale: (percorso, opzioni) => { chiamate.push(['richiesta']); return fetch(`http://127.0.0.1:${server.address().port}${percorso}`, opzioni); },
    primaDellaRichiestaLocale: async (s, o) => { chiamate.push(['prima', s, o?.modello]); } };
  const ownerRuntime = createOwnerRuntimeAdapter({ destinazioneModelloDeps });
  const r = createSessionRegistry({
    avviaSessioneFn: (input) => avviaSessione({ ...input, talosLavoraFn: (ri) => ownerRuntime.talosLavora(ri) }),
    modello: 'vendor/modello', chiave: 'k', chiaveFn: () => 'k',
    localRuntimes: { 'llama.cpp': { detect: async () => ({ state: 'observed' }), load: async () => {}, async *generateStream() { yield { type: 'done' }; } } },
    cartelleProgetto: [{ id: '0', percorso: cartella, nome: 'prova' }],
    preparaEsecuzioneFn: (taskId) => ({ taskId, cartella, task: { consegna: 'ciao' }, comandoProva: null }),
    fetchModelloFn: () => fetch,
    ...(foto ? { fotoConversazioni } : {}),
  });
  t.after(() => { for (const s of r.elenca()) r.ferma(s.sessionId); });
  return { r, chiamate };
}
const attendiFine = async (r, sessionId) => {
  const scadenza = Date.now() + 20_000;
  while (Date.now() < scadenza) {
    const eventi = r.esporta(sessionId)?.eventi ?? [];
    if (eventi.some((e) => e.type === 'RunFinished' || e.type === 'RunError')) return eventi;
    await new Promise((res) => setTimeout(res, 20));
  }
  throw new Error('the session did not close');
};

test('FCG-1 a local turn: the snapshot is asked for before the request, with the conversation and the model; saved at the end of the turn', async (t) => {
  const { r, chiamate } = await prepara(t);
  const { sessionId } = r.avvia('task-vero', { provider: 'local', runtimeId: 'llama.cpp', modelId: 'un-gguf.gguf' });
  const ultimo = (await attendiFine(r, sessionId)).at(-1);
  assert.equal(ultimo.type, 'RunFinished', JSON.stringify(ultimo));
  const scadenza = Date.now() + 5000;
  while (!chiamate.some((c) => c[0] === 'dopo') && Date.now() < scadenza) await new Promise((res) => setTimeout(res, 20));
  assert.deepEqual(chiamate[0], ['prima', sessionId, 'un-gguf.gguf']);
  assert.equal(chiamate[1][0], 'richiesta', 'asked BEFORE the request leaves');
  assert.deepEqual(chiamate.find((c) => c[0] === 'dopo'), ['dopo', sessionId, 'un-gguf.gguf']);
});

test('FCG-2 the other way: without the registry option (CLI, other hosts) nothing is saved', async (t) => {
  const { r, chiamate } = await prepara(t, { foto: false });
  const { sessionId } = r.avvia('task-vero', { provider: 'local', runtimeId: 'llama.cpp', modelId: 'un-gguf.gguf' });
  assert.equal((await attendiFine(r, sessionId)).at(-1).type, 'RunFinished');
  await new Promise((res) => setTimeout(res, 200));
  assert.equal(chiamate.some((c) => c[0] === 'dopo'), false, 'no registry option, no save');
});

test('FCG-3 the end-of-turn chain (where the summary starts) waits for the save: while the save runs it is still open, then it closes (Desktop 1/11)', async (t) => {
  let finisci;
  const salva = new Promise((ok) => { finisci = ok; });
  const { r, chiamate } = await prepara(t, { salva });
  const { sessionId } = r.avvia('task-vero', { provider: 'local', runtimeId: 'llama.cpp', modelId: 'un-gguf.gguf' });
  assert.equal((await attendiFine(r, sessionId)).at(-1).type, 'RunFinished');
  const scadenza = Date.now() + 5000;
  while (!chiamate.some((c) => c[0] === 'dopo') && Date.now() < scadenza) await new Promise((res) => setTimeout(res, 20));
  let chiusa = false;
  const fine = r.attendiRiassuntoDiFineGiro(sessionId).then(() => { chiusa = true; });
  await new Promise((res) => setTimeout(res, 400));
  assert.equal(chiusa, false, 'the chain that starts the end-of-turn summary must not run while the slot is being saved');
  finisci();
  await fine;
  assert.equal(chiusa, true);
});

/* captured on 2a9e68026 with the option absent: that road runs no await of the snapshots, so it is the code of before */
const SEQUENZA_DI_PRIMA = ['RunStarted', 'TextMessageStart', 'TextMessageContent', 'TextMessageEnd', 'RunFinished'];
for (const foto of [false, true]) {
  test(`FCG-6 characterization (Mobile 1): ${foto ? 'with' : 'without'} the option the events of a local turn are the ones of before, in the same order`, async (t) => {
    const { r } = await prepara(t, { foto });
    const { sessionId } = r.avvia('task-vero', { provider: 'local', runtimeId: 'llama.cpp', modelId: 'un-gguf.gguf' });
    await attendiFine(r, sessionId);
    await r.attendiRiassuntoDiFineGiro(sessionId);
    assert.deepEqual((r.esporta(sessionId)?.eventi ?? []).map((e) => e.type), SEQUENZA_DI_PRIMA);
  });
}

test('FCG-4 a save that never ends (Mobile 2): the end-of-turn chain goes on after the cap, the turn is already finished', async (t) => {
  const { r } = await prepara(t, { salva: new Promise(() => {}) });
  const { sessionId } = r.avvia('task-vero', { provider: 'local', runtimeId: 'llama.cpp', modelId: 'un-gguf.gguf' });
  assert.equal((await attendiFine(r, sessionId)).at(-1).type, 'RunFinished');
  const t0 = Date.now();
  await r.attendiRiassuntoDiFineGiro(sessionId);
  const ms = Date.now() - t0;
  assert.ok(ms < 3_000, `the chain waited ${ms} ms, more than the cap allows`);
});

test('FCG-5 a failed save (Mobile 3) never fails the turn nor the chain', async (t) => {
  /* a thenable that fails when the save awaits it (a rejected promise made here would be an unhandled rejection of the test itself) */
  const { r } = await prepara(t, { salva: { then: (_ok, ko) => ko(Object.assign(new Error('disk'), { code: 'EIO' })) } });
  const { sessionId } = r.avvia('task-vero', { provider: 'local', runtimeId: 'llama.cpp', modelId: 'un-gguf.gguf' });
  assert.equal((await attendiFine(r, sessionId)).at(-1).type, 'RunFinished');
  await r.attendiRiassuntoDiFineGiro(sessionId);
  assert.equal((r.esporta(sessionId)?.eventi ?? []).some((e) => e.type === 'RunError'), false);
});

test('FCG-7 a deleted conversation takes its snapshot away (review 1/11, note 3: the snapshot holds the text of the conversation)', async (t) => {
  const { r, chiamate } = await prepara(t);
  const { sessionId } = r.avvia('task-vero', { provider: 'local', runtimeId: 'llama.cpp', modelId: 'un-gguf.gguf' });
  await attendiFine(r, sessionId);
  await r.attendiRiassuntoDiFineGiro(sessionId);
  assert.equal(chiamate.some((c) => c[0] === 'dimentica'), false);
  const esito = await r.elimina(sessionId);
  assert.equal(esito.ok, true, JSON.stringify(esito));
  await new Promise((res) => setTimeout(res, 20));
  assert.deepEqual(chiamate.filter((c) => c[0] === 'dimentica'), [['dimentica', sessionId]]);
});
