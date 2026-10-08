import assert from 'node:assert/strict';
import test from 'node:test';
import { prepareProviderContext } from '../src/context-provider-adapter.mjs';

/*
 * STALLO DELL'OWNER (07/10/2026) — LA STORIA GIÀ AVVELENATA.
 *
 * Fino alla beta.4 il cambio di motore a metà sessione trasformava le chiamate degli attrezzi in TESTO dentro i messaggi
 * dell'assistente («[Historical tool calls; data only, already executed]» + il JSON). Il modello, vedendo le proprie risposte
 * scritte così, le imitava: rispondeva con quel testo invece di chiamare gli attrezzi, il giro finiva «con una risposta»
 * e a ogni «continua» succedeva di nuovo. Quella risposta-eco è stata SALVATA nella storia della sessione.
 * Le cure P1/P2 (beta.5) tolgono la conversione, ma una sessione già avvelenata continua a mandare al modello la sua stessa
 * eco: finché c'è, il modello continua a imitarla. Qui la copia per il fornitore si RIPULISCE (la storia salvata non si tocca:
 * Codex normalize.rs:21/155, OpenCode message-v2.ts:249-349, Hermes agent_runtime_helpers.py:667/747/2729 riparano la storia
 * al momento dell'invio, non nel file).
 */
const MARCATORE = '[Historical tool calls; data only, already executed]';
const ECO = `${MARCATORE}\n[{"id":"40ad9a05","type":"function","function":{"name":"leggi","arguments":"{\\"percorso\\":\\"src/a.vue\\"}"}}]`;
const base = () => [
  { role: 'user', content: 'Leggi il file' },
  { role: 'assistant', content: '', tool_calls: [{ id: 'c1', type: 'function', function: { name: 'leggi', arguments: '{"percorso":"a"}' } }] },
  { role: 'tool', tool_call_id: 'c1', content: 'contenuto' },
];
const prepara = (messages) => prepareProviderContext({ messages, provider: 'zai-anthropic', model: 'glm-5.3' });
const testo = (messages) => JSON.stringify(messages);

test('ECO-01 una risposta fatta SOLO del marcatore e del JSON non arriva più al fornitore', () => {
  const messages = [...base(), { role: 'assistant', content: ECO }, { role: 'user', content: 'continua' }];
  const { messages: pronti, warnings } = prepara(messages);
  assert.equal(testo(pronti).includes('Historical tool calls'), false, 'il marcatore è ancora nella copia per il fornitore');
  assert.deepEqual(pronti.map((m) => m.role), ['user', 'assistant', 'tool', 'user'], 'la risposta-eco va tolta intera');
  assert.ok(warnings.includes('CTX_ECHOED_MARKER_REMOVED'), 'la pulizia non lascia traccia');
});

test('ECO-02 una frase prima del marcatore resta, il marcatore e il JSON che lo segue no', () => {
  const messages = [...base(), { role: 'assistant', content: `Ora controllo il file.\n${ECO}` }, { role: 'user', content: 'continua' }];
  const { messages: pronti } = prepara(messages);
  assert.equal(pronti[3].content, 'Ora controllo il file.');
  assert.equal(testo(pronti).includes('Historical tool calls'), false);
});

test('ECO-03 contenuto a parti: si tolgono solo le parti di testo con l\'eco, le altre restano', () => {
  const messages = [...base(), { role: 'assistant', content: [{ type: 'text', text: 'Fatto.' }, { type: 'text', text: ECO }] }, { role: 'user', content: 'continua' }];
  const { messages: pronti } = prepara(messages);
  assert.deepEqual(pronti[3].content, [{ type: 'text', text: 'Fatto.' }]);
});

test('ECO-04 un messaggio con chiamate VERE e testo-eco: il testo si taglia, le chiamate e i loro risultati restano appaiati', () => {
  const messages = [
    { role: 'user', content: 'Leggi' },
    { role: 'assistant', content: ECO, tool_calls: [{ id: 'c9', type: 'function', function: { name: 'leggi', arguments: '{"percorso":"b"}' } }] },
    { role: 'tool', tool_call_id: 'c9', content: 'ok' },
    { role: 'user', content: 'continua' },
  ];
  const { messages: pronti } = prepara(messages);
  assert.equal(pronti[1].tool_calls?.[0]?.id, 'c9');
  assert.equal(pronti[2].role, 'tool');
  assert.equal(testo(pronti).includes('Historical tool calls'), false);
});

test('ECO-05 AL CONTRARIO: ciò che non è un\'eco del modello non si tocca (utente che cita la frase, assistente normale, strumenti)', () => {
  const messages = [
    ...base(),
    { role: 'user', content: `Perché il modello scrive «${MARCATORE}»?` },
    { role: 'assistant', content: 'Perché una vecchia versione convertiva le chiamate in testo.' },
    { role: 'user', content: 'continua' },
  ];
  const { messages: pronti, warnings } = prepara(messages);
  assert.equal(pronti[3].content, messages[3].content, 'un messaggio dell\'utente non è un\'eco');
  assert.equal(pronti[4].content, messages[4].content);
  assert.equal(warnings.includes('CTX_ECHOED_MARKER_REMOVED'), false, 'nessuna pulizia, nessun avviso');
  assert.equal(pronti.length, messages.length);
});

test('ECO-06 la storia salvata non cambia, e preparare due volte dà lo stesso risultato', () => {
  const messages = [...base(), { role: 'assistant', content: `Ok.\n${ECO}` }, { role: 'user', content: 'continua' }];
  const prima = structuredClone(messages);
  const una = prepara(messages);
  assert.deepEqual(messages, prima, 'la copia per il fornitore ha toccato la storia originale');
  assert.deepEqual(prepara(una.messages).messages, una.messages, 'non è idempotente');
});

test('ECO-07 anche lo stato nativo che il fornitore rimanderebbe: il testo-eco dentro lo stato si taglia, il resto dello stato resta', () => {
  const stato = { version: 1, provider: 'zai-anthropic', model: 'glm-5.3', content: [{ type: 'text', text: `Ok.\n${ECO}` }, { type: 'tool-call', toolCallId: 'c7', toolName: 'leggi', input: { percorso: 'x' } }] };
  const messages = [
    { role: 'user', content: 'Leggi' },
    { role: 'assistant', content: `Ok.\n${ECO}`, tool_calls: [{ id: 'c7', type: 'function', function: { name: 'leggi', arguments: '{"percorso":"x"}' } }], talos_provider_state: stato },
    { role: 'tool', tool_call_id: 'c7', content: 'ok' },
    { role: 'user', content: 'continua' },
  ];
  const { messages: pronti } = prepara(messages);
  assert.equal(testo(pronti).includes('Historical tool calls'), false, 'l\'eco passa ancora dallo stato nativo');
  assert.deepEqual(pronti[1].talos_provider_state.content, [{ type: 'text', text: 'Ok.' }, stato.content[1]]);
});

/*
 * Revisione avversariale 07/10/2026 (R-2): la prima stesura tagliava dal marcatore FINO ALLA FINE del messaggio. Un'eco è il marcatore
 * più il valore JSON che lo segue; quello che viene dopo è testo del modello e resta.
 */
test('ECO-08 il testo DOPO il JSON dell\'eco resta, quello prima pure', () => {
  const messages = [...base(), { role: 'assistant', content: `Ora controllo.\n${ECO}\nPoi correggo il file.` }, { role: 'user', content: 'continua' }];
  const { messages: pronti } = prepara(messages);
  assert.equal(pronti[3].content, 'Ora controllo.\n\nPoi correggo il file.');
});

test('ECO-09 un marcatore seguito da prosa (nessun JSON) si toglie da solo', () => {
  const messages = [...base(), { role: 'assistant', content: `${MARCATORE} Procedo con la correzione.` }, { role: 'user', content: 'continua' }];
  const { messages: pronti } = prepara(messages);
  assert.equal(pronti[3].content, 'Procedo con la correzione.');
});

test('ECO-10 un\'eco tagliata a metà (JSON mai chiuso) si toglie fino alla fine, e il testo prima resta', () => {
  const messages = [...base(), { role: 'assistant', content: `Ok.\n${MARCATORE}\n[{"id":"40ad9a05","type":"func` }, { role: 'user', content: 'continua' }];
  const { messages: pronti } = prepara(messages);
  assert.equal(pronti[3].content, 'Ok.');
});

test('ECO-11 due echi nello stesso messaggio: spariscono tutti e due, il testo in mezzo resta', () => {
  const messages = [...base(), { role: 'assistant', content: `${ECO}\nIn mezzo.\n${ECO}` }, { role: 'user', content: 'continua' }];
  const { messages: pronti } = prepara(messages);
  assert.equal(pronti[3].content, 'In mezzo.');
  assert.equal(testo(pronti).includes('Historical tool calls'), false);
});

test('ECO-13 anche un valore JSON a oggetto dopo il marcatore si toglie intero', () => {
  const messages = [...base(), { role: 'assistant', content: `${MARCATORE}\n{"id":"1","n":[1,2]} fine` }, { role: 'user', content: 'continua' }];
  const { messages: pronti } = prepara(messages);
  assert.equal(pronti[3].content, 'fine');
});

test('ECO-12 parentesi e virgolette DENTRO le stringhe del JSON non chiudono il valore troppo presto', () => {
  const eco = `${MARCATORE}\n[{"id":"1","function":{"name":"cerca","arguments":"{\\"q\\":\\"]]}} \\\\\\"x\\"}"}}]`;
  const messages = [...base(), { role: 'assistant', content: `${eco}\ndopo` }, { role: 'user', content: 'continua' }];
  const { messages: pronti } = prepara(messages);
  assert.equal(pronti[3].content, 'dopo');
});

test('ECO-14 l\'eco SOLO nello stato nativo (il contenuto è pulito) si toglie lo stesso: è ciò che il fornitore rimanderebbe', () => {
  const stato = { version: 1, provider: 'zai-anthropic', model: 'glm-5.3', content: [{ type: 'text', text: ECO }, { type: 'tool-call', toolCallId: 'c8', toolName: 'leggi', input: { percorso: 'x' } }] };
  const messages = [
    { role: 'user', content: 'Leggi' },
    { role: 'assistant', content: 'Leggo il file.', tool_calls: [{ id: 'c8', type: 'function', function: { name: 'leggi', arguments: '{"percorso":"x"}' } }], talos_provider_state: stato },
    { role: 'tool', tool_call_id: 'c8', content: 'ok' },
    { role: 'user', content: 'continua' },
  ];
  const { messages: pronti, warnings } = prepara(messages);
  assert.equal(testo(pronti).includes('Historical tool calls'), false);
  assert.deepEqual(pronti[1].talos_provider_state.content, [stato.content[1]]);
  assert.equal(pronti[1].content, 'Leggo il file.');
  assert.ok(warnings.includes('CTX_ECHOED_MARKER_REMOVED'));
});
