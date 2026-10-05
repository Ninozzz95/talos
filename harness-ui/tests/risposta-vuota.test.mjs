/*
 * ⛔⛔ 25/09/2026 notte — LA RISPOSTA VUOTA (sessione vera dell'owner `c15ba17c…`, google/gemini-3.8-flash).
 * Otto attrezzi riusciti, poi una risposta di SOLO ragionamento e nient'altro: il kernel lanciava «flusso SSE senza contenuto
 * ne tool_calls», l'adapter lo chiamava «La risposta del fornitore si è interrotta.» (falso), il fornitore finiva in panchina,
 * la ricevuta restava senza token, e gli otto attrezzi sparivano dalla memoria del modello: i due «continua» ripartivano da zero
 * e fallivano uguali. Difetto noto di Gemini 3.x: HTTP 200, ragionamento, poi `MALFORMED_FUNCTION_CALL`
 * (pi-oauth-antigravity #2, 20/09/2026; googleapis/js-genai #1619).
 * Decisioni owner (stessa notte): «come Hermes, in piccolo» — motivo vero del fornitore, costo contato, una spinta dopo gli
 * attrezzi, al massimo due ritentativi fermati se il vuoto si ripete identico, poi una carta onesta; e «il lavoro fatto resta
 * sempre nella conversazione». Hermes `agent/turn_empty_response.py`, `agent/empty_response_guard.py:207-226`,
 * `agent/conversation_loop.py:889-892` (clone 65ad529); Cline `retry-empty-response.ts`.
 * Ricerca: `.claude/RICERCA-RISPOSTA-VUOTA-GEMINI-2026-09-25.md`.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import * as kernel from '../src/kernel/talosHarness.mjs';
import { cartellaDiProva } from './aiuto/cartelle-di-prova.mjs';

const { talosLavora, consumaFlussoSSE, chiamaConRitenta } = kernel;
const enc = new TextEncoder();

function flussoIntero(fotogrammi) {
  return new Response(new ReadableStream({
    start(c) {
      for (const f of fotogrammi) c.enqueue(enc.encode(`data: ${JSON.stringify(f)}\n\n`));
      c.enqueue(enc.encode('data: [DONE]\n\n'));
      c.close();
    },
  }));
}
const testo = (t) => ({ choices: [{ delta: { content: t } }] });
const ragionamento = (t) => ({ choices: [{ delta: { reasoning: t } }] });
const uso = (prompt, completion) => ({ choices: [], usage: { prompt_tokens: prompt, completion_tokens: completion, total_tokens: prompt + completion } });
const fine = { choices: [{ delta: {}, finish_reason: 'stop' }] };
const chiamaElenca = { choices: [{ delta: { tool_calls: [{ index: 0, id: 'call_e', type: 'function', function: { name: 'elenca', arguments: '{}' } }] } }] };
const fineAttrezzi = { choices: [{ delta: {}, finish_reason: 'tool_calls' }] };
/** Quello che OpenRouter manda quando Gemini chiude con MALFORMED_FUNCTION_CALL: ragionamento, poi l'errore DENTRO il flusso. */
const erroreNelFlusso = {
  error: { code: 502, message: 'Provider returned error', metadata: { error_type: 'provider_error' } },
  choices: [{ index: 0, delta: { content: '' }, finish_reason: 'error', native_finish_reason: 'MALFORMED_FUNCTION_CALL' }],
};
const vuotaGemini = () => flussoIntero([ragionamento('Developing Tokenization Visualizations'), erroreNelFlusso, uso(100, 7)]);
// RETRY04: a successful empty answer is distinct from finish_reason:error.
const vuotaRagionata = () => flussoIntero([ragionamento('Sto pensando'), fine, uso(100, 7)]);
/** Il vuoto muto: nessun ragionamento, nessuna uscita (i due «continua» della sessione vera, 4-6 s e niente). */
const vuotaMuta = () => flussoIntero([{ choices: [{ index: 0, delta: { content: '' }, finish_reason: 'stop' }] }, uso(100, 0)]);

function rete(...risposte) {
  const corpi = [];
  return {
    corpi,
    fetch: async (_url, opzioni) => {
      corpi.push(JSON.parse(opzioni.body));
      const r = risposte[corpi.length - 1];
      return typeof r === 'function' ? r() : r;
    },
  };
}
const base = (extra) => ({
  cartella: cartellaDiProva('talos-risposta-vuota-'), task: { consegna: 'fai un html interattivo sui tokenizer' }, modello: 'x', chiave: 'y',
  onDelta: () => {}, ...extra,
});
const rifiuto = (promessa) => promessa.then(() => { throw new Error('doveva rifiutare'); }, (e) => e);

test('EMPTY-SSE-PROVIDER-REASON: il lettore del flusso tiene il motivo che il fornitore manda dentro il flusso', async () => {
  const esito = await consumaFlussoSSE(vuotaGemini(), () => {});
  assert.equal(esito.finishReason, 'error');
  assert.equal(esito.nativeFinishReason, 'MALFORMED_FUNCTION_CALL');
  assert.deepEqual(esito.erroreFornitore, { messaggio: 'Provider returned error', codice: 502, tipo: 'provider_error' });
  assert.equal(esito.usage.completion_tokens, 7, 'e l\'uso della chiamata vuota, che si paga');
  // al contrario: un flusso normale non porta campi nuovi (additivo)
  const normale = await consumaFlussoSSE(flussoIntero([testo('ciao'), fine]), () => {});
  assert.equal(Object.hasOwn(normale, 'nativeFinishReason'), false);
  assert.equal(Object.hasOwn(normale, 'erroreFornitore'), false);
});

test('EMPTY-OPT-IN: senza `accettaVuota` una risposta vuota lancia come prima; con, torna marcata e con il suo uso', async () => {
  const opzioni = { modello: 'x', chiave: 'y', messaggi: [{ role: 'user', content: 'ciao' }], attrezzi: [], onDelta: () => {} };
  await assert.rejects(chiamaConRitenta({ ...opzioni, fetchDiRete: async () => vuotaRagionata() }), /SSE stream with neither content nor tool_calls/u);
  const esito = await chiamaConRitenta({ ...opzioni, fetchDiRete: async () => vuotaRagionata(), accettaVuota: true });
  assert.equal(esito.vuota?.finishReason, 'stop');
  assert.equal(esito.vuota?.ragionamento, true);
  assert.equal(esito.usage.completion_tokens, 7);
});

test('EMPTY-AFTER-TOOLS-NUDGE: vuota dopo gli attrezzi ⇒ una spinta a continuare, e il giro si chiude col testo', async () => {
  const r = rete(
    () => flussoIntero([chiamaElenca, fineAttrezzi, uso(90, 5)]),
    vuotaRagionata,
    () => flussoIntero([testo('Ecco la cartella.'), fine, uso(110, 4)]),
  );
  const esito = await talosLavora(base({ fetchDiRete: r.fetch }));
  assert.equal(esito.comeFinita, 'concluso');
  assert.equal(r.corpi.length, 3);
  const terza = r.corpi[2].messages;
  assert.equal(terza.at(-3).role, 'tool', 'l\'esito dell\'attrezzo è ancora lì');
  assert.deepEqual(terza.at(-2), { role: 'assistant', content: kernel.SEGNAPOSTO_RISPOSTA_VUOTA });
  assert.deepEqual(terza.at(-1), { role: 'user', content: kernel.NOTA_RISPOSTA_VUOTA });
  assert.equal(esito.usage.prompt_tokens, 300, 'anche la chiamata vuota è nel conto (90 + 100 + 110)');
  assert.equal(esito.usage.completion_tokens, 16);
});

test('EMPTY-CEILING: veri vuoti conclusi, spinta più due ritentativi, poi errore e lavoro preservato', async () => {
  const r = rete(() => flussoIntero([chiamaElenca, fineAttrezzi]), vuotaRagionata, vuotaRagionata, vuotaRagionata, vuotaRagionata, () => flussoIntero([testo('mai'), fine]));
  const t0 = Date.now();
  const errore = await rifiuto(talosLavora(base({ fetchDiRete: r.fetch })));
  assert.equal(r.corpi.length, 5, 'attrezzo, vuota, dopo la spinta, due ritentativi');
  assert.ok(Date.now() - t0 >= 1_500, `le due attese (0,5 + 1 s): ${Date.now() - t0} ms`);
  assert.equal(errore.code, 'PROVIDER_EMPTY_RESPONSE');
  assert.equal(errore.classe, 'risposta-vuota');
  assert.equal(errore.transitorio, false);
  assert.match(errore.message, /neither text nor tools/u);
  assert.doesNotMatch(errore.message, /interrott/u, 'mai «interrotta»: la risposta è arrivata, vuota');
  const storia = errore.messaggiDelGiro;
  assert.ok(Array.isArray(storia), 'il lavoro del giro viaggia con l\'errore');
  assert.ok(storia.some((m) => m.tool_calls?.[0]?.id === 'call_e'), 'la chiamata all\'attrezzo resta');
  assert.equal(storia.at(-2).role, 'tool', 'e il suo esito');
  assert.equal(storia.at(-1).role, 'assistant');
  assert.match(storia.at(-1).content, /The turn stopped here because of an error/u);
  assert.equal(storia.some((m) => m.content === kernel.NOTA_RISPOSTA_VUOTA || m.content === kernel.SEGNAPOSTO_RISPOSTA_VUOTA), false,
    'l\'impalcatura della spinta non resta nella storia');
});

test('EMPTY-DETERMINISTIC: due vuoti identici e senza uscita ⇒ il terzo non si paga', async () => {
  const r = rete(vuotaMuta, vuotaMuta, vuotaMuta, () => flussoIntero([testo('mai'), fine]));
  const errore = await rifiuto(talosLavora(base({ fetchDiRete: r.fetch })));
  assert.equal(errore.code, 'PROVIDER_EMPTY_RESPONSE');
  assert.equal(r.corpi.length, 2);
  assert.equal(errore.messaggiDelGiro.at(-1).role, 'user', 'fallito alla prima chiamata: la storia finisce con la consegna, niente sentinella');
});

test('EMPTY-THEN-TEXT: un vuoto isolato si ritenta, e se la seconda va bene nessuno se ne accorge', async () => {
  const r = rete(vuotaRagionata, () => flussoIntero([testo('Risposta.'), fine, uso(100, 3)]));
  const esito = await talosLavora(base({ fetchDiRete: r.fetch }));
  assert.equal(esito.comeFinita, 'concluso');
  assert.equal(esito.detto, 'Risposta.');
  assert.deepEqual(r.corpi[1].messages, r.corpi[0].messages, 'senza attrezzi prima, nessuna spinta: la stessa richiesta');
});

test('EMPTY-ERROR-AFTER-TOOLS: errore SSE non entra nella scala dei vuoti, lavoro conservato', async () => {
  const r = rete(() => flussoIntero([chiamaElenca, fineAttrezzi]), vuotaGemini, vuotaGemini);
  const errore = await rifiuto(talosLavora(base({ fetchDiRete: r.fetch })));
  assert.equal(errore.code, 'PROVIDER_OUTCOME_UNKNOWN');
  assert.equal(errore.causaDiTrasporto, 'PROVIDER_STREAM_ERROR');
  assert.equal(r.corpi.length, 2);
  assert.ok(errore.messaggiDelGiro.some(m => m.role === 'tool' && m.tool_call_id === 'call_e'));
  assert.equal(errore.messaggiDelGiro.some(m => m.content === kernel.NOTA_RISPOSTA_VUOTA), false);
});

test('EMPTY-ERROR-NO-EFFECTS: errore SSE a ZERO effetti ⇒ nessun reinvio a livello giro (la corsia di trasporto è già passata di qui)', async () => {
  const r = rete(vuotaGemini, vuotaGemini);
  const errore = await rifiuto(talosLavora(base({ fetchDiRete: r.fetch, attesaRitentaMassimaMs: 1 })));
  assert.equal(errore.code, 'PROVIDER_OUTCOME_UNKNOWN');
  assert.equal(errore.causaDiTrasporto, 'PROVIDER_STREAM_ERROR');
  assert.equal(r.corpi.length, 1, 'un frame di errore esplicito è un esito NOTO: nessun reinvio del giro, nemmeno a zero effetti');
});

test('WORK-KEPT-ANY-ERROR: un errore qualunque dopo gli attrezzi porta con sé la storia coerente del giro', async () => {
  const credenziale = Object.assign(new Error('Credenziale rifiutata dal fornitore.'), { code: 'PROVIDER_REQUEST_ERROR', classe: 'credenziale', transitorio: false });
  const r = rete(() => flussoIntero([chiamaElenca, fineAttrezzi]), () => { throw credenziale; });
  const errore = await rifiuto(talosLavora(base({ fetchDiRete: r.fetch })));
  assert.equal(errore, credenziale, 'lo stesso errore, non uno nuovo');
  assert.equal(errore.messaggiDelGiro.at(-2).role, 'tool');
  assert.match(errore.messaggiDelGiro.at(-1).content, /Credenziale rifiutata dal fornitore/u);
});

test('WORK-KEPT-COHERENT: una chiamata senza tutti i suoi esiti non entra, mai un attrezzo orfano', () => {
  const sistema = { role: 'system', content: 's' };
  const utente = { role: 'user', content: 'u' };
  const due = { role: 'assistant', content: null, tool_calls: [{ id: 'a' }, { id: 'b' }] };
  const esitoA = { role: 'tool', tool_call_id: 'a', content: 'ok' };
  assert.deepEqual(kernel.storiaDelGiroFallito([sistema, utente, due, esitoA], 'x'), [sistema, utente], 'b senza esito: si torna a prima della chiamata');
  const una = { role: 'assistant', content: null, tool_calls: [{ id: 'a' }] };
  const storia = kernel.storiaDelGiroFallito([sistema, utente, una, esitoA], 'Rete giù.');
  assert.deepEqual(storia.slice(0, 4), [sistema, utente, una, esitoA]);
  assert.equal(storia.length, 5);
  assert.match(storia[4].content, /Rete giù\./u);
  assert.deepEqual(kernel.storiaDelGiroFallito([sistema, utente], 'x'), [sistema, utente], 'niente attrezzi: nessuna sentinella');
  assert.equal(kernel.storiaDelGiroFallito(null, 'x'), null);
});
