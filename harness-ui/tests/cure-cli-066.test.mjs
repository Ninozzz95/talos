/*
 * CLI 0.6.6 (bugfixer, 15/10/2026) — le cure dei punti dell'indagine `RAPPORTO-INDAGINE-CLI-066-2026-10-15.md`, nei due versi.
 * Le due prove rosse dell'indagine stanno in `indagine-cli-066.test.mjs` (F-Y-001 senza delta, F-Y-004 sulla parte pura).
 *  - F-Y-001: un `tool-call` senza pezzi passati porta l'input intero UNA volta; con i pezzi già passati, niente (nessun doppio).
 *  - F-Y-004 (R54 della CLI: tre o più copie identiche ⇒ ne gira UNA): della valanga gira solo la prima copia, la seconda e le
 *    successive sono annullate e annunciate; due sole copie identiche girano tutte e due (lavoro vero: prima e dopo una scrittura).
 *  - F-Y-002: la nota delle copie ha il prefisso della nota dei giri in tondo, col numero vero.
 *  - Cache del piano: `session-id` e `thread-id` = la chiave della cache; un'intestazione di chi chiama resta sua.
 */
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { nativeProviderResponse } from '../src/native-provider-adapter.mjs';
import { consumaFlussoSSE, notaCopieScartate, notaGiriInTondo, talosLavora, RIPETIZIONI_IDENTICHE_MASSIME } from '../src/kernel/talosHarness.mjs';
import { creaFetchDelPiano } from '../src/chatgpt-richiesta.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

/* ---------- F-Y-001: il filo Responses ---------- */
const sseResponses = (eventi) => eventi.map((e) => `event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`).join('');
function flussoResponses(chiamate, { conDelta }) {
  const uso = { input_tokens: 1, output_tokens: 1, input_tokens_details: { cached_tokens: 0 }, output_tokens_details: { reasoning_tokens: 0 } };
  const eventi = [{ type: 'response.created', sequence_number: 0, response: { id: 'r', created_at: 1, model: 'gpt-x', status: 'in_progress', output: [] } }];
  const fatte = [];
  chiamate.forEach(([nome, argomenti], i) => {
    const voce = { type: 'function_call', id: `fc_${i}`, call_id: `call_${i}`, name: nome, arguments: '', status: 'in_progress' };
    eventi.push({ type: 'response.output_item.added', sequence_number: eventi.length, output_index: i, item: voce });
    if (conDelta) eventi.push({ type: 'response.function_call_arguments.delta', sequence_number: eventi.length, output_index: i, item_id: `fc_${i}`, delta: argomenti });
    const fatta = { ...voce, arguments: argomenti, status: 'completed' };
    fatte.push(fatta);
    eventi.push({ type: 'response.output_item.done', sequence_number: eventi.length, output_index: i, item: fatta });
  });
  eventi.push({ type: 'response.completed', sequence_number: eventi.length, response: { id: 'r', created_at: 1, model: 'gpt-x', status: 'completed', output: fatte, usage: uso } });
  return sseResponses(eventi);
}
async function argomentiDalFilo(chiamate, opzioni) {
  const risposta = await nativeProviderResponse({
    provider: 'chatgpt', model: 'gpt-x', apiKey: 'token-del-piano',
    body: { stream: true, messages: [{ role: 'user', content: 'go' }],
      tools: chiamate.map(([nome]) => ({ type: 'function', function: { name: nome, description: nome, parameters: { type: 'object', properties: { action: { type: 'string' }, percorso: { type: 'string' } } } } })) },
    fetchFn: async () => new Response(flussoResponses(chiamate, opzioni), { status: 200, headers: { 'content-type': 'text/event-stream' } }),
  });
  const perIndice = [];
  for (const riga of (await risposta.text()).split('\n')) {
    if (!riga.startsWith('data: ') || riga === 'data: [DONE]') continue;
    for (const c of JSON.parse(riga.slice(6)).choices?.[0]?.delta?.tool_calls ?? []) {
      if (c.function?.arguments !== undefined) perIndice[c.index] = (perIndice[c.index] ?? '') + c.function.arguments;
    }
  }
  return perIndice;
}

test('CURA-066-01 — Responses without argument deltas: each call gets its whole input once, in its own slot', async () => {
  assert.deepEqual(await argomentiDalFilo([['chatgpt_account', '{"action":"status"}'], ['elenca', '{"percorso":"harness"}']], { conDelta: false }),
    ['{"action":"status"}', '{"percorso":"harness"}']);
});

test('CURA-066-02 AL CONTRARIO — with argument deltas the whole input is NOT added again (no doubled arguments)', async () => {
  assert.deepEqual(await argomentiDalFilo([['chatgpt_account', '{"action":"disconnect"}'], ['elenca', '{"percorso":"harness"}']], { conDelta: true }),
    ['{"action":"disconnect"}', '{"percorso":"harness"}']);
});

/* ---------- F-Y-004 e F-Y-002: le copie identiche ---------- */
const sseChat = (pezzi) => new Response(`${pezzi.map((p) => `data: ${JSON.stringify(p)}\n\n`).join('')}data: [DONE]\n\n`, { status: 200, headers: { 'content-type': 'text/event-stream' } });
function flussoChat(chiamate) {
  const pezzi = chiamate.map(([nome, argomenti], i) => ({ choices: [{ index: 0, delta: { tool_calls: [{ index: i, id: `call_${i}`, type: 'function', function: { name: nome, arguments: argomenti } }] } }] }));
  pezzi.push({ choices: [{ index: 0, delta: {}, finish_reason: 'tool_calls' }], usage: { prompt_tokens: 1, completion_tokens: 1 } });
  return sseChat(pezzi);
}

test('CURA-066-03 — three identical calls in one streamed answer (R54): ONE runs; copies 2 and 3 are discarded, each with its own «this is call N»', async () => {
  const delta = [];
  const esito = await consumaFlussoSSE(flussoChat([['leggi', '{"percorso":"a.txt"}'], ['elenca', '{}'], ['leggi', '{"percorso":"a.txt"}'], ['leggi', '{"percorso":"a.txt"}']]), (d) => delta.push(d));
  assert.deepEqual(esito.scelta.tool_calls.map((c) => [c.id, c.function.name]), [['call_0', 'leggi'], ['call_1', 'elenca']]);
  assert.equal(esito.ripetizione?.viste, RIPETIZIONI_IDENTICHE_MASSIME, 'la soglia della valanga resta quella di prima');
  const annullate = delta.filter((d) => d.tipo === 'tool-annullato');
  assert.deepEqual(annullate.map((d) => d.toolCallId).sort(), ['call_2', 'call_3']);
  for (const [id, n] of [['call_2', 2], ['call_3', 3]]) {
    const motivo = annullate.find((d) => d.toolCallId === id).motivo;
    assert.ok(motivo.startsWith(`[TALOS: this is call ${n} of "leggi" with the same arguments`), motivo);
    assert.match(motivo, /This tool did not run\./u, 'la frase che il classificatore delle deleghe legge come «non eseguito»');
  }
});

test('CURA-066-04 AL CONTRARIO — two identical calls (below R54) both run; different calls all run; five copies still run ONE', async () => {
  const due = await consumaFlussoSSE(flussoChat([['leggi', '{"percorso":"a.txt"}'], ['leggi', '{"percorso":"a.txt"}']]), () => {});
  assert.equal(due.scelta.tool_calls.length, 2, 'due letture uguali possono essere lavoro vero (prima e dopo una scrittura)');
  assert.equal(due.ripetizione, undefined);
  const diverse = await consumaFlussoSSE(flussoChat([['leggi', '{"percorso":"a.txt"}'], ['leggi', '{"percorso":"b.txt"}']]), () => {});
  assert.equal(diverse.scelta.tool_calls.length, 2);
  const valanga = await consumaFlussoSSE(flussoChat(Array.from({ length: 5 }, () => ['scrivi', '{"percorso":"out1.txt","contenuto":"v"}'])), () => {});
  assert.deepEqual(valanga.scelta.tool_calls.map((c) => c.id), ['call_0'], 'della valanga gira solo la prima copia (lo scenario R54 della CLI)');
});

test('CURA-066-05 — through the kernel: three identical writes run ONCE, and the model reads the note with the shared prefix', async (t) => {
  const c = mkdtempSync(join(tmpdir(), 'talos-cura-066-'));
  t.after(() => rimuoviCartellaDiProva(c));
  const corpi = [];
  let n = 0;
  const fetchDiRete = async (_url, init) => {
    corpi.push(JSON.parse(init.body));
    n += 1;
    if (n === 1) return flussoChat(Array.from({ length: 3 }, () => ['scrivi', '{"percorso":"out1.txt","contenuto":"v1"}']));
    return sseChat([{ choices: [{ index: 0, delta: { content: 'fatto' } }] }, { choices: [{ index: 0, delta: {}, finish_reason: 'stop' }], usage: { prompt_tokens: 1, completion_tokens: 1 } }]);
  };
  const r = await talosLavora({ cartella: c, task: { consegna: 'scrivi out1.txt' }, modello: 'x', chiave: 'y', _giriMassimiInterno: 3, fetchDiRete, onDelta: () => {} });
  const esiti = r.messaggiFinali.filter((m) => m.role === 'tool');
  assert.equal(esiti.length, 1, `${esiti.length} tool results for three identical writes`);
  const nota = corpi[1].messages.map((m) => (typeof m.content === 'string' ? m.content : '')).find((testo) => testo.includes('Only the first copy was run'));
  assert.ok(nota, 'la nota arriva al modello');
  assert.ok(nota.startsWith('[TALOS: this is call 3 of "scrivi" with the same arguments'), nota);
});

test('CURA-066-06 — the copies note and the round-loop note share the prefix «[TALOS: this is call N of "<name>" with the same arguments»', () => {
  const prefisso = /^\[TALOS: this is call (\d+) of "leggi" with the same arguments/u;
  assert.equal(notaCopieScartate({ nome: 'leggi', viste: 3 }).match(prefisso)?.[1], '3');
  assert.equal(notaGiriInTondo('leggi', 2, 'x').match(prefisso)?.[1], '2');
});

/* ---------- Cache del piano: l'intestazione di sessione ---------- */
async function intestazioniInviate(intestazioniDiChiChiama) {
  let viste = null;
  const fetchDelPiano = creaFetchDelPiano(async (_u, o) => { viste = new Headers(o.headers); return new Response('{}', { status: 400 }); });
  const corpo = { model: 'gpt-x', input: [{ role: 'developer', content: 'regole' }, { role: 'user', content: 'compito' }], stream: true };
  await fetchDelPiano('https://api.openai.com/v1/responses', { method: 'POST', headers: intestazioniDiChiChiama, body: JSON.stringify(corpo) });
  return viste;
}

test('CURA-066-07 — every plan request carries session-id and thread-id, equal to the prompt cache key (Codex client.rs:591-599)', async () => {
  const viste = await intestazioniInviate({ authorization: 'Bearer t' });
  assert.match(viste.get('session-id') ?? '', /^talos-[0-9a-f]{58}$/u);
  assert.equal(viste.get('thread-id'), viste.get('session-id'));
  assert.equal(viste.get('authorization'), 'Bearer t', 'le altre intestazioni restano');
});

test('CURA-066-08 AL CONTRARIO — a session-id set by the caller stays the caller\'s', async () => {
  const viste = await intestazioniInviate({ 'session-id': '0199e8a0-0000-7000-8000-000000000001' });
  assert.equal(viste.get('session-id'), '0199e8a0-0000-7000-8000-000000000001');
});
