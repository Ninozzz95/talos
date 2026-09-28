/*
 * domanda-da-correggere.test.mjs — decisione owner 47 (27/09/2026): una `ask_user_question` respinta per la forma
 *   (QUERY_INVALID) si mostra come riga discreta col motivo in parole. Qui il riconoscimento e i motivi; i testi del
 *   kernel sono quelli VERI del contratto (`src/user-question-contract.mjs`) e della sessione 56066b64.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { motivoDomandaDaCorreggere } from '../../src/components/esito-comando.js';
import { riassuntoVoci, testoDelSegmento } from '../../src/components/attivita-segmento.js';

const vero = (motivo) => `ask_user_question failed [QUERY_INVALID]: ${motivo}`;

test('DOMANDA-DA-CORREGGERE — i motivi veri del contratto diventano frasi brevi', () => {
  assert.deepEqual(motivoDomandaDaCorreggere('ask_user_question', vero('questions[0].why è obbligatorio: una frase che dice perché la risposta conta')), { frase: 'mancava il perché' });
  assert.deepEqual(motivoDomandaDaCorreggere('ask_user_question', vero('questions[1].options deve contenere da 2 a 4 opzioni')), { frase: 'servono da {min} a {max} opzioni', parametri: { min: 2, max: 4 } });
  assert.deepEqual(motivoDomandaDaCorreggere('ask_user_question', vero('questions deve contenere da 1 a 4 domande')), { frase: 'servono da {min} a {max} domande', parametri: { min: 1, max: 4 } });
  assert.deepEqual(motivoDomandaDaCorreggere('ask_user_question', vero('questions[0] contiene opzioni duplicate')), { frase: 'c’erano scelte doppie' });
  assert.deepEqual(motivoDomandaDaCorreggere('ask_user_question', vero('id domanda duplicato: stack')), { frase: 'c’erano domande doppie' });
  assert.deepEqual(motivoDomandaDaCorreggere('ask_user_question', vero('questions[0].question supera il limite di 600 caratteri')), { frase: 'un testo era troppo lungo' });
  assert.deepEqual(motivoDomandaDaCorreggere('ask_user_question', vero('questions[0].options[0] contiene campi non riconosciuti')), { frase: 'la forma non era valida' });
});

test('DOMANDA-DA-CORREGGERE — AL CONTRARIO: altri attrezzi, altri codici, una risposta vera non sono «da correggere»', () => {
  assert.equal(motivoDomandaDaCorreggere('note_crea', vero('questions[0].why è obbligatorio')), null, 'solo la domanda');
  assert.equal(motivoDomandaDaCorreggere('ask_user_question', 'ask_user_question failed [QUESTION_ALREADY_PENDING]: c’è già una domanda aperta'), null);
  assert.equal(motivoDomandaDaCorreggere('ask_user_question', '{"status":"answered","answers":{"a":"b"}}'), null);
  assert.equal(motivoDomandaDaCorreggere('ask_user_question', 'REFUSED. A child agent cannot ask the user. Use ask_parent instead.'), null);
  assert.equal(motivoDomandaDaCorreggere('ask_user_question', ''), null);
});

test('DOMANDA-DA-CORREGGERE — il segmento non conta il tentativo respinto, e il testo copiato lo dice', () => {
  const corretta = { tipo: 'tool', stato: 'corretta', nome: 'ask_user_question', specie: 'altro:ask_user_question', argomenti: {} };
  const posta = { ...corretta, stato: 'riuscito' };
  const r = riassuntoVoci([corretta, posta]);
  assert.equal(r.parti.length, 1, 'una domanda sola: quella posta');
  assert.equal(r.nFalliti, 0);
  assert.equal(riassuntoVoci([corretta]).parti.length, 0);
  assert.match(testoDelSegmento([corretta]), /\(respinta e riformulata\)/u);
});
