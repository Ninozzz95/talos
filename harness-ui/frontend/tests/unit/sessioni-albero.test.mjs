import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ordinaSessioniAdAlbero } from '../../src/components/session-item.js';

/*
 * ⛔ 08/09/2026 — la barra a sinistra mostrava le figlie di una delega SCIOLTE accanto alla madre.
 *   Il legame ora esce dal server (`padreId`, `profonditaDelega` in `GET /api/v1/sessions`); qui si
 *   prova la parte pura: che l'ordine e il rientro escano giusti, senza toccare il DOM.
 */
const riga = (sessionId, padreId = null, avviataAlle = '2026-09-08T10:00:00.000Z') => ({ sessionId, padreId, avviataAlle });

test('ALBERO: ogni figlia esce SUBITO SOTTO la sua madre, e rientrata di uno', () => {
  const fuori = ordinaSessioniAdAlbero([
    riga('madre-B'),
    riga('figlia-2', 'madre-A', '2026-09-08T11:05:00.000Z'),
    riga('madre-A'),
    riga('figlia-1', 'madre-A', '2026-09-08T11:00:00.000Z'),
  ]);
  assert.deepEqual(fuori.map((v) => [v.sessione.sessionId, v.profondita]), [
    ['madre-B', 0],
    ['madre-A', 0],
    ['figlia-1', 1], // ⭐ le figlie in ordine di AVVIO: prima quella delegata per prima
    ['figlia-2', 1],
  ]);
});

test('ALBERO: nessuna sessione sparisce — una figlia senza la sua madre resta al primo livello', () => {
  const fuori = ordinaSessioniAdAlbero([riga('orfana', 'madre-cancellata'), riga('madre-B')]);
  assert.deepEqual(fuori.map((v) => [v.sessione.sessionId, v.profondita]), [['orfana', 0], ['madre-B', 0]]);
});

test('ALBERO, AL CONTRARIO: un ciclo di padri non appende la barra e non perde righe', () => {
  const fuori = ordinaSessioniAdAlbero([riga('a', 'b'), riga('b', 'a')]);
  assert.equal(fuori.length, 2, 'due righe entrano, due escono: nessuna persa dentro il ciclo');
  assert.deepEqual(new Set(fuori.map((v) => v.sessione.sessionId)), new Set(['a', 'b']));
});

test('ALBERO: due livelli — una nipote rientra di due (il limite di delega è 2)', () => {
  const fuori = ordinaSessioniAdAlbero([riga('nonna'), riga('figlia', 'nonna'), riga('nipote', 'figlia')]);
  assert.deepEqual(fuori.map((v) => v.profondita), [0, 1, 2]);
});

test('ALBERO: un elenco senza deleghe esce IDENTICO, nell\'ordine in cui è arrivato', () => {
  const dentro = [riga('uno'), riga('due'), riga('tre')];
  assert.deepEqual(ordinaSessioniAdAlbero(dentro).map((v) => v.sessione.sessionId), ['uno', 'due', 'tre']);
  assert.deepEqual(ordinaSessioniAdAlbero(dentro).map((v) => v.profondita), [0, 0, 0]);
  assert.deepEqual(ordinaSessioniAdAlbero(null), [], 'un elenco assente non è un errore: è una barra vuota');
});

/*
 * ⛔ 08/09, owner: «facciano capire con una linea tree che sono correlate a quella sessione padre».
 *   La linea la disegna il CSS; quale riga sia l'ULTIMA del suo gruppo è invece una domanda
 *   sull'albero — e senza risposta il tronco verticale prosegue nel vuoto sotto l'ultima figlia.
 */
test('LINEA: l’ultima figlia di un gruppo è marcata, le altre no', () => {
  const fuori = ordinaSessioniAdAlbero([
    riga('madre'), riga('f1', 'madre', '2026-09-08T10:00:00.000Z'), riga('f2', 'madre', '2026-09-08T10:05:00.000Z'),
    riga('altra-madre'),
  ]);
  assert.deepEqual(fuori.map((v) => [v.sessione.sessionId, v.ultima]), [
    ['madre', false],       // sotto di lei c'è la sua discendenza, poi un'altra madre
    ['f1', false],
    ['f2', true],           // ⭐ l'ultima del gruppo: qui il tronco si ferma
    ['altra-madre', true],
  ]);
});

test('LINEA, il caso che inganna: una figlia con una NIPOTE sotto non è l’ultima del suo livello', () => {
  const fuori = ordinaSessioniAdAlbero([
    riga('nonna'), riga('figlia-a', 'nonna', '2026-09-08T10:00:00.000Z'),
    riga('nipote', 'figlia-a'), riga('figlia-b', 'nonna', '2026-09-08T10:05:00.000Z'),
  ]);
  const per = Object.fromEntries(fuori.map((v) => [v.sessione.sessionId, v.ultima]));
  assert.equal(per['figlia-a'], false, 'dopo di lei, oltre alla nipote, c’è ancora figlia-b: il tronco continua');
  assert.equal(per['nipote'], true, 'la nipote è sola nel suo gruppo');
  assert.equal(per['figlia-b'], true, 'l’ultima figlia della nonna chiude il tronco');
});
