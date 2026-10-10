/*
 * C1, metodo approvato dall'owner il 09/10/2026 sera («Sì, questo metodo», ricerca in
 *   `Downloads/handoff-talos-2026-09-27/RICERCA-C1-CONTEXT-ENGINEERING-2026-10-09.md`) — IL RECUPERO. Dopo una compattazione il
 *   modello può cercare e rileggere la parte già riassunta di QUESTA conversazione, uscite degli attrezzi comprese: è dove stanno
 *   gli «aghi» (percorsi, impronte, errori) che un riassunto perde.
 * Hermes lo fa col suo `session_search`: la sua compattazione apre una sessione figlia, e la parte archiviata resta cercabile nella
 *   madre. La sua scorecard (`evals/compaction/results/SCORECARD-2026-08-15.md`) misura «lean + recovery» a 68,3% contro 40,0% a
 *   libro chiuso. Da noi la compattazione resta nella STESSA conversazione: `conversation_search` prende la forma
 *   `this_conversation: true`.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { cercaConversazioni, leggiConversazione } from '../src/conversazioni-per-il-modello.mjs';

const SHA = '9f2c4e7a1b3d';
const eventiCorrenti = [
  { type: 'RunStarted', input: { consegna: 'Controlla il pacchetto e dimmi la sua impronta' } },
  { type: 'ToolCallStart', toolCallId: 'c1', toolCallName: 'shell' },
  { type: 'ToolCallArgs', toolCallId: 'c1', delta: '{"comando":"sha256sum dist/pacchetto.zip"}' },
  { type: 'ToolCallResult', toolCallId: 'c1', content: `${SHA}  dist/pacchetto.zip` },
  { type: 'TextMessageStart', messageId: 'm1', role: 'assistant' },
  { type: 'TextMessageContent', messageId: 'm1', delta: 'Fatto: ho calcolato l\'impronta del pacchetto.' },
  { type: 'TextMessageEnd', messageId: 'm1' },
  { type: 'RunFinished' },
];
const corrente = { riga: { sessionId: 'corrente', nome: 'Pacchetto', conclusa: true }, eventi: eventiCorrenti };
const altra = { riga: { sessionId: 'altra', nome: 'Altra chat', conclusa: true }, eventi: [{ type: 'RunStarted', input: { consegna: 'pacchetto altro' } }] };

test('C1-REC-01: this_conversation + query finds the needle INSIDE a tool output of the current conversation, with the message number', () => {
  const testo = cercaConversazioni([corrente, altra], { query: SHA, this_conversation: true, correnteId: 'corrente' });
  assert.equal(typeof testo, 'string');
  assert.match(testo, new RegExp(SHA, 'u'), 'the excerpt carries the exact value');
  assert.match(testo, /message #\d+ \(tool\)/u, 'it says which message, so the model can read around it');
  assert.doesNotMatch(testo, /Altra chat/u, 'only this conversation');
});

test('C1-REC-02: this_conversation + around_message reads the current conversation (before, it answered «already in front of you»)', () => {
  const testo = leggiConversazione(corrente, { conversation_id: 'corrente', around_message: 2, this_conversation: true, correnteId: 'corrente' });
  assert.match(testo, new RegExp(SHA, 'u'));
  assert.doesNotMatch(testo, /already in front of you/u);
});

test('C1-REC-03: the other way — without this_conversation the current conversation stays out of search and read, as before', () => {
  const cerca = cercaConversazioni([corrente, altra], { query: SHA, correnteId: 'corrente' });
  assert.match(String(cerca), /^No conversation contains/u, 'no hit: the current conversation is not searched');
  assert.match(leggiConversazione(corrente, { conversation_id: 'corrente', correnteId: 'corrente' }), /already in front of you/u);
});

test('C1-REC-04: no hit in this conversation says so and how to widen, never an empty answer', () => {
  const testo = cercaConversazioni([corrente], { query: 'inesistente-xyz', this_conversation: true, correnteId: 'corrente' });
  assert.match(testo, /this conversation/iu);
  assert.match(testo, /no message/iu);
});

/* Il PUNTATORE (Hermes: il «recovery footer» del riassunto): chi legge il riassunto deve sapere che il resto si recupera, e come. */
import { costruisciProiezione, RIGA_RECUPERO } from '../src/kernel/compattazione-desktop.mjs';
import { composeActiveContext } from '../../context-engine/src/summary.mjs';
import { ATTREZZI_ESTESI_OPENAI } from '../src/kernel/talosHarness.mjs';

test('C1-REC-05: the legacy summary message ends with the recovery pointer (conversation_search, this_conversation)', () => {
  const proiezione = costruisciProiezione({ testa: [{ role: 'system', content: 's' }], riassunto: 'riassunto', indice: 'indice', coda: [{ role: 'user', content: 'ora' }] });
  const riassunto = proiezione.find((m) => m.role === 'user' && String(m.content).includes('riassunto'));
  assert.ok(String(riassunto.content).trimEnd().endsWith(RIGA_RECUPERO));
  assert.match(RIGA_RECUPERO, /conversation_search/u);
  assert.match(RIGA_RECUPERO, /this_conversation/u);
});

test('C1-REC-06: the engine composition carries the recovery hint it is given — and none when it is not given (the shared engine stays generic)', () => {
  // C1 (09/10, 59cdfdcba): il puntatore sta in TESTO, ultima riga dopo il JSON della memoria (che resta la prima riga)
  const con = composeActiveContext({ summary: { goal: 'x' }, tailMessages: [], recoveryHint: 'RECUPERA COSI' });
  assert.equal(JSON.parse(con.at(-1).content.split('\n')[0]).kind, 'talos-context-memory');
  assert.ok(con.at(-1).content.endsWith('\n\nRECUPERA COSI'));
  const senza = composeActiveContext({ summary: { goal: 'x' }, tailMessages: [] });
  assert.equal(senza.at(-1).content.includes('RECUPERA'), false);
  assert.equal(senza.at(-1).content.includes('\n'), false, 'without hint, index or register: the JSON alone');
});

test('C1-REC-07: the model is told the shape — conversation_search has the this_conversation boolean', () => {
  const attrezzo = ATTREZZI_ESTESI_OPENAI.find((t) => t.function?.name === 'conversation_search')?.function;
  assert.equal(attrezzo.parameters.properties.this_conversation.type, 'boolean');
  assert.match(attrezzo.description, /this_conversation/u);
});
