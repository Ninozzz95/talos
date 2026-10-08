import assert from 'node:assert/strict';
import test from 'node:test';

import { ARGOMENTI_NESSUNO, argomentiVuoti, conArgomentiVuotiComeOggetto, normalizzaArgomentiVuoti, ripristinaArgomentiVuotiInPlace } from '../src/argomenti-vuoti.mjs';

const chiamata = (id, argomenti) => ({ id, type: 'function', function: { name: 'elenca', arguments: argomenti } });

test('argomentiVuoti: solo la stringa vuota o di soli spazi — non un JSON troncato, non un oggetto, non un valore assente', () => {
  for (const vuoto of ['', ' ', '\n', ' \t\r\n ']) assert.equal(argomentiVuoti(vuoto), true, JSON.stringify(vuoto));
  for (const no of ['{', '{}', '{"a":1}', '[', 'null', '0', 'x', undefined, null, 0, {}, []]) assert.equal(argomentiVuoti(no), false, String(no));
  assert.equal(ARGOMENTI_NESSUNO, '{}');
});

test('normalizzaArgomentiVuoti: tocca sul posto solo le chiamate vuote, ritorna quante, e tollera ingressi strani', () => {
  const chiamate = [chiamata('a', ''), chiamata('b', '{"x":1}'), chiamata('c', '  '), chiamata('d', '{')];
  assert.equal(normalizzaArgomentiVuoti(chiamate), 2);
  assert.deepEqual(chiamate.map((c) => c.function.arguments), ['{}', '{"x":1}', '{}', '{']);
  for (const strano of [undefined, null, 'x', 5, {}, [null, {}, { function: null }]]) assert.equal(normalizzaArgomentiVuoti(strano), 0);
});

test('ripristinaArgomentiVuotiInPlace: lavora su una copia già fatta, per tutti i messaggi', () => {
  const messaggi = [{ role: 'user', content: 'x' }, { role: 'assistant', content: null, tool_calls: [chiamata('a', ''), chiamata('b', '{}')] }, { role: 'assistant', content: 'y' }];
  assert.equal(ripristinaArgomentiVuotiInPlace(messaggi), 1);
  assert.equal(messaggi[1].tool_calls[0].function.arguments, '{}');
  assert.equal(ripristinaArgomentiVuotiInPlace(undefined), 0);
});

test('conArgomentiVuotiComeOggetto: la STESSA lista se non c’è nulla da fare, altrimenti una nuova che cambia solo i messaggi toccati', () => {
  const pulita = [{ role: 'user', content: 'x' }, { role: 'assistant', content: null, tool_calls: [chiamata('a', '{}')] }];
  assert.equal(conArgomentiVuotiComeOggetto(pulita), pulita, 'nessuna copia, nessun costo');

  const sporca = [{ role: 'user', content: 'x' }, { role: 'assistant', content: null, tool_calls: [chiamata('a', ''), chiamata('b', '{"k":2}')] }, { role: 'tool', tool_call_id: 'a', content: 'ok' }];
  const prima = structuredClone(sporca);
  const dopo = conArgomentiVuotiComeOggetto(sporca);
  assert.notEqual(dopo, sporca);
  assert.deepEqual(sporca, prima, 'la lista ricevuta è la storia viva: non si tocca');
  assert.equal(dopo[0], sporca[0], 'i messaggi senza nulla da fare sono gli stessi oggetti');
  assert.equal(dopo[2], sporca[2]);
  assert.notEqual(dopo[1], sporca[1]);
  assert.deepEqual(dopo[1].tool_calls.map((c) => c.function.arguments), ['{}', '{"k":2}']);
  assert.equal(dopo[1].tool_calls[1], sporca[1].tool_calls[1], 'la chiamata sana è lo stesso oggetto');
  assert.equal(conArgomentiVuotiComeOggetto('non una lista'), 'non una lista');
});

test('conArgomentiVuotiComeOggetto: un messaggio che NON è dell’assistente non si tocca nemmeno se ha un campo che somiglia', () => {
  const messaggi = [{ role: 'tool', tool_call_id: 'a', content: '', tool_calls: [chiamata('a', '')] }];
  assert.equal(conArgomentiVuotiComeOggetto(messaggi), messaggi);
});
