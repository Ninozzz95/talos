/*
 * 01/11/2026, vista locale, misura 1 (`MISURE-VISTA-LOCALE-2026-11-01.md`): llama-server b11960 risponde 500 «image input is not supported
 * - hint: … mmproj» a un'immagine per un modello aperto senza la sua parte per le immagini. Desktop: deve diventare un 400 con una frase
 * leggibile. Motore finto ma HTTP vero su 127.0.0.1, adattatore e registro veri (stessa intelaiatura di BC79).
 * La frase è la stessa nei due motori (Performance 1): `tools/server/server-common.cpp:1275` nel clone del 21/10 (motore distribuito) e
 * `:1279` nel clone della v0.8.0, `throw std::runtime_error("image input is not supported - hint: …mmproj")`. Il corpo qui sotto è quello
 * misurato dal vivo su b11960. Ad ogni aggiornamento del motore, `scripts/misure-vista-locale.mjs` scrive `conforme` (Mobile 1).
 */
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createSessionRegistry } from '../src/session-registry.mjs';
import { createOwnerRuntimeAdapter, motoreLocaleNonVede } from '../src/runtime-owner-adapter.mjs';
import { avviaSessione } from '../src/agent-service.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

/** Il corpo VERO di b11960, misurato il 01/11 alle 20:03 */
const GREZZO_SENZA_PROIETTORE = JSON.stringify({ error: { code: 500, message: 'image input is not supported - hint: if this is unexpected, you may need to provide the mmproj', type: 'server_error' } });
const GREZZO_ALTRO_500 = JSON.stringify({ error: { code: 500, message: 'Failed to allocate compute buffer', type: 'server_error' } });

async function accendiMotoreFinto(t, rispondi) {
  const richieste = [];
  const server = createServer((req, res) => {
    let grezzo = '';
    req.on('data', (c) => { grezzo += c; });
    req.on('end', () => {
      richieste.push(grezzo);
      const esito = rispondi(richieste.length - 1);
      res.writeHead(esito.stato, { 'Content-Type': 'application/json' });
      res.end(esito.testo);
    });
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  t.after(() => new Promise((r) => server.close(r)));
  return { porta: server.address().port, richieste };
}
const runtimeLocaleFinto = () => ({ detect: async () => ({ state: 'observed' }), load: async () => {}, async *generateStream() { yield { type: 'done' }; } });
function registro(t, porta) {
  const cartella = mkdtempSync(join(tmpdir(), 'vista-senza-proiettore-'));
  t.after(() => rimuoviCartellaDiProva(cartella));
  const destinazioneModelloDeps = { leggiChiave: () => null, leggiRuntime: () => ({ endpoint: null }), localePronto: () => true,
    chiamaLocale: (percorso, opzioni) => fetch(`http://127.0.0.1:${porta}${percorso}`, opzioni), avviaLocale: async () => {} };
  const ownerRuntime = createOwnerRuntimeAdapter({ destinazioneModelloDeps });
  const r = createSessionRegistry({
    avviaSessioneFn: (input) => avviaSessione({ ...input, talosLavoraFn: (ri) => ownerRuntime.talosLavora(ri) }),
    modello: 'vendor/modello', chiave: 'k', chiaveFn: () => 'k',
    localRuntimes: { 'llama.cpp': runtimeLocaleFinto(), ollama: runtimeLocaleFinto() },
    cartelleProgetto: [{ id: '0', percorso: cartella, nome: 'prova' }],
    preparaEsecuzioneFn: (taskId) => ({ taskId, cartella, task: { consegna: 'guarda questa immagine' }, comandoProva: null }),
    fetchModelloFn: () => fetch,
  });
  t.after(() => { for (const s of r.elenca()) r.ferma(s.sessionId); });
  return r;
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
const localeLlama = { provider: 'local', runtimeId: 'llama.cpp', modelId: 'un-gguf.gguf' };

test('VSP-1 the 500 of the engine for an image without the projector ends the turn with its own code and a readable sentence, one request only', async (t) => {
  const motore = await accendiMotoreFinto(t, () => ({ stato: 500, testo: GREZZO_SENZA_PROIETTORE }));
  const r = registro(t, motore.porta);
  const { sessionId } = r.avvia('task-vero', localeLlama);
  const ultimo = (await attendiFine(r, sessionId)).at(-1);
  assert.equal(ultimo.type, 'RunError');
  assert.equal(ultimo.code, 'LOCAL_MODEL_NO_VISION', JSON.stringify(ultimo));
  assert.match(ultimo.message, /cannot see images/u);
  assert.doesNotMatch(ultimo.message, /mmproj|500|server_error/u, 'no engine jargon on screen');
  assert.equal(motore.richieste.length, 1, 'not retried as a transient failure, not retried without tools');
});

test('VSP-2 the other way: another 500 of the local engine is not mistaken for it, it is retried as before', async (t) => {
  const motore = await accendiMotoreFinto(t, () => ({ stato: 500, testo: GREZZO_ALTRO_500 }));
  const r = registro(t, motore.porta);
  const { sessionId } = r.avvia('task-vero', localeLlama);
  const scadenza = Date.now() + 15_000;
  while (motore.richieste.length < 2 && Date.now() < scadenza) await new Promise((res) => setTimeout(res, 20));
  assert.ok(motore.richieste.length >= 2, `retried as a transient engine failure (${motore.richieste.length} requests)`);
  assert.equal((r.esporta(sessionId)?.eventi ?? []).some((e) => e.code === 'LOCAL_MODEL_NO_VISION'), false);
});

const sse = (frames) => frames.map((f) => `data: ${JSON.stringify(f)}\n\n`).join('') + 'data: [DONE]\n\n';
const GREZZO_ATTREZZI = JSON.stringify({ error: { message: 'tools param requires --jinja flag', code: 400, type: 'invalid_request_error' } });
const GREZZO_400_IMMAGINE = JSON.stringify({ error: { code: 400, message: 'image input is not supported - hint: if this is unexpected, you may need to provide the mmproj', type: 'invalid_request_error' } });

test('VSP-4 a 400 with the same sentence while tools are on is not a refusal of the tools: its own code, no retry without tools', async (t) => {
  const motore = await accendiMotoreFinto(t, () => ({ stato: 400, testo: GREZZO_400_IMMAGINE }));
  const r = registro(t, motore.porta);
  const { sessionId } = r.avvia('task-vero', localeLlama);
  const ultimo = (await attendiFine(r, sessionId)).at(-1);
  assert.equal(ultimo.code, 'LOCAL_MODEL_NO_VISION', JSON.stringify(ultimo));
  assert.equal(motore.richieste.length, 1);
});

test('VSP-5 on the road without tools (the engine refused them earlier) the 500 for the image ends the same way', async (t) => {
  /* 1: tools refused (400) · 2: the retry without tools asks for a tool, so the kernel makes a second step · 3: without tools, the image 500 */
  const server = createServer((req, res) => {
    let grezzo = '';
    req.on('data', (c) => { grezzo += c; });
    req.on('end', () => {
      server.n = (server.n ?? 0) + 1;
      let corpo = null; try { corpo = JSON.parse(grezzo); } catch { /* malformed */ }
      const conAttrezzi = Array.isArray(corpo?.tools) && corpo.tools.length > 0;
      if (conAttrezzi) { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(GREZZO_ATTREZZI); return; }
      if (server.n === 2) {
        res.writeHead(200, { 'Content-Type': 'text/event-stream' });
        res.end(sse([{ choices: [{ delta: { tool_calls: [{ index: 0, id: 'call_elenca', type: 'function', function: { name: 'elenca', arguments: JSON.stringify({ percorso: '.' }) } }] } }] }]));
        return;
      }
      server.senza = (server.senza ?? 0) + 1;
      res.writeHead(500, { 'Content-Type': 'application/json' }); res.end(GREZZO_SENZA_PROIETTORE);
    });
  });
  await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
  t.after(() => new Promise((ok) => server.close(ok)));
  const r = registro(t, server.address().port);
  const { sessionId } = r.avvia('task-vero', localeLlama);
  const ultimo = (await attendiFine(r, sessionId)).at(-1);
  assert.equal(ultimo.code, 'LOCAL_MODEL_NO_VISION', JSON.stringify(ultimo));
  assert.equal(server.senza, 1, 'the third request, without tools, got the 500 once: not retried');
});

for (const [stato, grezzo] of [[500, GREZZO_SENZA_PROIETTORE], [400, GREZZO_400_IMMAGINE]]) {
  test(`VSP-6 with the keyring wired (the real server road) a ${stato} for the image keeps its code, not the generic provider failure`, async (t) => {
    const motore = await accendiMotoreFinto(t, () => ({ stato, testo: grezzo }));
    const cartella = mkdtempSync(join(tmpdir(), 'vista-portachiavi-'));
    t.after(() => rimuoviCartellaDiProva(cartella));
    const portachiaviFinto = { scegliChiave: () => null, hasKey: () => false, elencaPool: () => [], mettiInPanchina: () => {}, getRuntime: () => ({ timeoutSeconds: 0 }) };
    const destinazioneModelloDeps = { leggiChiave: () => null, leggiRuntime: (fonte) => ({ endpoint: fonte === 'ollama' ? `http://127.0.0.1:${motore.porta}` : null }),
      localePronto: () => true, chiamaLocale: async () => { throw new Error('not here'); }, avviaLocale: async () => {} };
    const ownerRuntime = createOwnerRuntimeAdapter({ destinazioneModelloDeps, providerStore: portachiaviFinto });
    const r = createSessionRegistry({
      avviaSessioneFn: (input) => avviaSessione({ ...input, talosLavoraFn: (ri) => ownerRuntime.talosLavora(ri) }),
      modello: 'vendor/modello', chiave: 'k', chiaveFn: () => 'k', localRuntimes: { ollama: runtimeLocaleFinto() },
      cartelleProgetto: [{ id: '0', percorso: cartella, nome: 'prova' }],
      preparaEsecuzioneFn: (taskId) => ({ taskId, cartella, task: { consegna: 'guarda questa immagine' }, comandoProva: null }),
      fetchModelloFn: () => fetch,
    });
    t.after(() => { for (const s of r.elenca()) r.ferma(s.sessionId); });
    const { sessionId } = r.avvia('task-vero', { provider: 'local', runtimeId: 'ollama', modelId: 'qwen3:8b' });
    const ultimo = (await attendiFine(r, sessionId)).at(-1);
    assert.equal(ultimo.type, 'RunError');
    assert.equal(ultimo.code, 'LOCAL_MODEL_NO_VISION', JSON.stringify(ultimo));
  });
}

test('VSP-3 the pure check: 500 and 400 with the sentence; nothing for other bodies, other codes or text that is not JSON', () => {
  assert.equal(motoreLocaleNonVede(500, GREZZO_SENZA_PROIETTORE)?.code, 'LOCAL_MODEL_NO_VISION');
  assert.equal(motoreLocaleNonVede(400, GREZZO_SENZA_PROIETTORE)?.stato, 400);
  assert.equal(motoreLocaleNonVede(500, GREZZO_ALTRO_500), null);
  assert.equal(motoreLocaleNonVede(503, GREZZO_SENZA_PROIETTORE), null);
  assert.equal(motoreLocaleNonVede(500, 'image input is not supported'), null, 'only from the JSON body of the engine');
});
