/*
 * ⛔ CLI (15/10/2026), misurato dal vivo sul piano ChatGPT (kernel r4 962a78772, chatgpt:gpt-5.6-luna): DENTRO un giro la seconda
 *   richiesta prende 9.728 token in cache su 10.652 (91%); FRA un giro e l'altro (`--resume` della stessa sessione) `cached_tokens`
 *   resta 0, e lo dice il servizio stesso. Indizio: `chiaveDellaCacheDelPiano` (`chatgpt-richiesta.mjs:58-63`) è l'impronta di
 *   modello, istruzioni, attrezzi e input fino al PRIMO messaggio della persona.
 * MISURA: due giri della stessa conversazione sul registro vero, con l'agent-service vero e il kernel vero; un fetch finto registra
 *   il corpo di ogni richiesta, e lo stesso corpo passa dall'adattatore e dall'SDK veri del piano per leggere la chiave che partirebbe.
 *   - CACHE-01: niente cambia fra i giri ⇒ la chiave è la stessa (verde anche prima della cura).
 *   - CACHE-02: il preambolo del progetto cambia fra i giri (la mappa dei file dopo una scrittura, un AGENTS.md). L'agent-service lo
 *     APPENDE in coda come messaggio di sistema, apposta per non toccare il prefisso (`agent-service.mjs`, «IL CONTESTO SI APPENDE, NON
 *     SI RISCRIVE») — ma l'adattatore nativo porta TUTTI i messaggi di sistema in `instructions` (`native-provider-adapter.mjs:137-138`),
 *     cioè in testa: per il piano il prefisso cambia, e con lui la chiave.
 *   - CACHE-03: due conversazioni diverse non condividono la chiave.
 */
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { createSessionRegistry } from '../src/session-registry.mjs';
import { avviaSessione } from '../src/agent-service.mjs';
import { talosLavora } from '../src/kernel/talosHarness.mjs';
import { attendiScritture } from '../src/session-store.mjs';
import { creaFetchDelPiano } from '../src/chatgpt-richiesta.mjs';
import { nativeProviderResponse } from '../src/native-provider-adapter.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

const sse = (pezzi) => `${pezzi.map((p) => `data: ${JSON.stringify(p)}\n\n`).join('')}data: [DONE]\n\n`;
function rispostaChat(corpo) {
  const testo = 'fatto';
  if (corpo?.stream) {
    return new Response(sse([{ choices: [{ index: 0, delta: { role: 'assistant', content: testo } }] },
      { choices: [{ index: 0, delta: {}, finish_reason: 'stop' }], usage: { prompt_tokens: 10, completion_tokens: 1 } }]), { status: 200, headers: { 'content-type': 'text/event-stream' } });
  }
  return Response.json({ choices: [{ index: 0, message: { role: 'assistant', content: testo }, finish_reason: 'stop' }], usage: { prompt_tokens: 10, completion_tokens: 1 } });
}
const COMPLETA = [{ type: 'response.completed', response: { id: 'r', status: 'completed', output: [{ type: 'message', id: 'm', role: 'assistant', content: [{ type: 'output_text', text: 'ok', annotations: [] }] }], usage: { input_tokens: 1, output_tokens: 1 } } }];
/** La chiave che il trasporto del piano metterebbe su QUESTO corpo del kernel (adattatore + SDK veri). */
let ultimoCorpoDelPiano = null;
async function chiaveDelPiano(corpoDelKernel) {
  let chiave = null;
  const rete = async (_url, opzioni) => { ultimoCorpoDelPiano = JSON.parse(opzioni.body); chiave = ultimoCorpoDelPiano.prompt_cache_key ?? null;
    return new Response(sse(COMPLETA), { status: 200, headers: { 'content-type': 'text/event-stream' } }); };
  const r = await nativeProviderResponse({ provider: 'chatgpt', model: 'gpt-6-sol', apiKey: 'T', baseURL: 'https://api.openai.com/v1', fetchFn: creaFetchDelPiano(rete), body: corpoDelKernel });
  await r.text();
  return chiave;
}
async function attendi(condizione, cosa) {
  const fino = Date.now() + 15000;
  while (Date.now() < fino) { if (condizione()) return; await new Promise((r) => setTimeout(r, 10)); }
  assert.fail(`mai successo: ${cosa}`);
}
function banco(t, { consegna = 'Read README and summarise it.' } = {}) {
  const cartellaStore = mkdtempSync(join(tmpdir(), 'talos-cache-store-'));
  const cartella = mkdtempSync(join(tmpdir(), 'talos-cache-prog-'));
  const corpi = [];
  const mappa = { versione: 1 };
  const registro = createSessionRegistry({
    cartellaStore, modello: 'vendor/modello', chiave: 'k', chiaveFn: () => 'k', cartellaEsisteFn: () => true,
    guardaWorkspaceFn: () => () => {},
    preparaEsecuzioneFn: (taskId) => ({ taskId, cartella, task: { id: taskId, consegna }, comandoProva: null }),
    /* ⛔ il kernel vero, con la rete FINTA: nessuna richiesta esce dalla macchina (fetchModelloFn non copre il giro principale) */
    avviaSessioneFn: (input) => avviaSessione({ ...input,
      /* il preambolo del progetto: la mappa dei file, che cambia quando il progetto cambia (qui: `mappa.versione`) */
      contestoDelProgettoFn: async ({ permesso }) => ({ testo: `Working sheet — project map v${mappa.versione}\nTurn permission: ${permesso}.\n${'src/a.js\n'.repeat(40)}` }),
      talosLavoraFn: (ri) => talosLavora({ ...ri,
        fetchDiRete: async (_url, opzioni) => { const corpo = JSON.parse(opzioni.body); corpi.push(corpo); return rispostaChat(corpo); } }) }),
  });
  t.after(async () => { try { await registro.chiudi?.(); } catch { /* già chiuso */ } try { await attendiScritture({ cartellaStore }); } catch { /* pulizia */ }
    rimuoviCartellaDiProva(cartellaStore); rimuoviCartellaDiProva(cartella); });
  return { registro, corpi, mappa };
}
const finito = (registro, sessionId, n) => (registro.esporta(sessionId)?.eventi ?? []).filter((e) => e.type === 'RunFinished' || e.type === 'RunError').length >= n;
const prefisso = (corpo) => { const i = corpo.messages.findIndex((m) => m.role === 'user'); return corpo.messages.slice(0, i + 1); };
async function dueGiri(t, { traIGiri = () => {}, consegna } = {}) {
  const b = banco(t, consegna ? { consegna } : {});
  const { sessionId } = b.registro.avvia('task-vero');
  await attendi(() => finito(b.registro, sessionId, 1), 'il primo giro');
  const primo = b.corpi.length;
  assert.ok(primo >= 1, 'premessa: il primo giro ha chiamato il modello (rete finta)');
  traIGiri(b);
  b.registro.resume(sessionId, 'Now list the files too.');
  await attendi(() => finito(b.registro, sessionId, 2), 'il secondo giro');
  assert.ok(b.corpi.length > primo, 'premessa: il secondo giro ha chiamato il modello');
  return { ...b, sessionId, a: b.corpi[0], b2: b.corpi[primo] };
}

test('CACHE-01 — due giri della STESSA conversazione, niente cambia fra i due: la stessa chiave della cache', async (t) => {
  const { a, b2 } = await dueGiri(t);
  assert.equal(await chiaveDelPiano(b2), await chiaveDelPiano(a));
});

test('CACHE-02 (S3, 17/10) — sul PIANO l’aggiornamento del preambolo va in `instructions`: nessun `developer` dopo il messaggio della persona (il piano lo rifiuta)', async (t) => {
  const { a, b2 } = await dueGiri(t, { traIGiri: (b) => { b.mappa.versione = 2; } });
  const sistemiInCoda = b2.messages.slice(prefisso(b2).length).filter((m) => m.role === 'system');
  assert.equal(sistemiInCoda.length, 1, 'premessa: l’aggiornamento del preambolo è UN messaggio di sistema in coda, dopo la storia');
  assert.equal(JSON.stringify(prefisso(b2)), JSON.stringify(prefisso(a)), 'premessa: nel corpo del kernel il prefisso fino al primo messaggio è identico');
  assert.match(await chiaveDelPiano(a) ?? '', /^talos-/u, 'premessa: la chiave parte');
  await chiaveDelPiano(b2);
  const { input, instructions } = ultimoCorpoDelPiano;
  const primaPersona = input.findIndex((v) => v.role === 'user');
  assert.ok(primaPersona >= 0, 'premessa: nella richiesta del piano c’è il messaggio della persona');
  assert.equal(input.slice(primaPersona).some((v) => v.role === 'developer' || v.role === 'system'), false,
    'a developer/system item after the person’s message reaches the ChatGPT plan, which rejects it ("did not complete", CLI 17/10)');
  /* l'SDK porta le `instructions` in testa all'input come `developer` (e il trasporto del piano lascia vuoto il campo `instructions`):
     l'aggiornamento deve stare PRIMA del primo messaggio della persona */
  assert.match(JSON.stringify(input.slice(0, primaPersona)) + JSON.stringify(instructions ?? ''), /project map v2/u, 'the appended update is not at the head of the plan request');
});

test('CACHE-02b CONTROLLO — con una chiave API OpenAI resta com’era: l’aggiornamento è un `developer` DOPO la storia, il prefisso non cambia', async () => {
  let corpo = null;
  const r = await nativeProviderResponse({
    provider: 'openai', model: 'gpt-5-mini', apiKey: 'test-only-key', baseURL: 'https://api.openai.com/v1',
    body: { stream: true, messages: [{ role: 'system', content: 'Base.' }, { role: 'user', content: 'Ciao.' }, { role: 'assistant', content: 'Ciao!' }, { role: 'system', content: 'Project context update: x' }, { role: 'user', content: 'E poi?' }] },
    fetchFn: async (_url, init) => { corpo = JSON.parse(init.body); return new Response(sse(COMPLETA), { status: 200, headers: { 'content-type': 'text/event-stream' } }); },
  });
  await r.text();
  const primaPersona = corpo.input.findIndex((v) => v.role === 'user');
  assert.ok(corpo.input.slice(primaPersona).some((v) => v.role === 'developer' && /Project context update/u.test(JSON.stringify(v))), 'on an OpenAI API key the update should stay in place after the history');
  assert.doesNotMatch(JSON.stringify(corpo.instructions ?? ''), /Project context update/u, 'on an OpenAI API key the update was hoisted to the head');
});

test('CACHE-03 AL CONTRARIO — due conversazioni con un primo messaggio diverso non condividono la chiave', async (t) => {
  const uno = await dueGiri(t);
  const due = await dueGiri(t, { consegna: 'Fix the failing test in src/a.js.' });
  assert.notEqual(await chiaveDelPiano(due.a), await chiaveDelPiano(uno.a), 'two different conversations share the plan cache key');
});

test('CACHE-04 CONTROLLO — su Anthropic nativo resta com\'era: tutti i messaggi di sistema in `system`, nessuno fra i messaggi (Anthropic non li accetta separati)', async () => {
  let corpo = null;
  const model = 'claude-opus-5-5';
  await nativeProviderResponse({
    provider: 'anthropic', model, apiKey: 'test-only-key',
    body: { messages: [{ role: 'system', content: 'Base.' }, { role: 'user', content: 'Ciao.' }, { role: 'assistant', content: 'Ciao!' }, { role: 'system', content: 'Project context update: x' }, { role: 'user', content: 'E poi?' }] },
    fetchFn: async (_url, init) => { corpo = JSON.parse(init.body); return new Response(JSON.stringify({ id: 'msg', type: 'message', role: 'assistant', model, content: [{ type: 'text', text: 'ok' }], stop_reason: 'end_turn', stop_sequence: null, usage: { input_tokens: 5, output_tokens: 2 } }), { headers: { 'content-type': 'application/json' } }); },
  });
  assert.match(JSON.stringify(corpo.system), /Project context update/u, 'the update is still in `system` on Anthropic');
  assert.ok(corpo.messages.every((m) => m.role !== 'system'), 'no system message among the Anthropic messages');
});
