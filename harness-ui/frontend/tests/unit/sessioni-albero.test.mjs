import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ordinaSessioniAdAlbero, prefissoComuneDiParole, nomiDistintiFraSorelle } from '../../src/components/session-item.js';

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

/*
 * ⛔ 09/09 — dalla FOTO del giro vero con delega (D2): le due figlie erano «crea un file chiamato
 * parte1.md con tre righe sul registro dei processi» e «crea un file chiamato parte2.md con tre righe
 * sugli allarmi». Nella riga della barra ne entrano ~28 caratteri, e a schermo erano due righe
 * IDENTICHE: «crea un file chiamato par…». Il nome era già quello giusto: mancava ciò che distingue.
 */
test('SORELLE-DISTINTE: le parole che tutte le sorelle hanno in comune spariscono, e resta ci\u00f2 che distingue', () => {
  const nomi = nomiDistintiFraSorelle([
    'crea un file chiamato parte1.md con tre righe sul registro dei processi',
    'crea un file chiamato parte2.md con tre righe sugli allarmi',
  ]);
  assert.deepEqual(nomi, [
    '\u2026parte1.md con tre righe sul registro dei processi',
    '\u2026parte2.md con tre righe sugli allarmi',
  ]);
  // ci\u00f2 che conta \u00e8 il TRONCAMENTO a schermo: i primi 28 caratteri devono differire
  assert.notEqual(nomi[0].slice(0, 28), nomi[1].slice(0, 28), 'a schermo le due righe restano diverse');
});

test('SORELLE-DISTINTE: il prefisso si taglia su un confine di PAROLA, mai a met\u00e0', () => {
  assert.equal(prefissoComuneDiParole(['scrivi il file alfa', 'scrivi il file beta']), 'scrivi il file ');
  // \u26d4 «parte» \u00e8 comune ma \u00e8 mezza parola: non \u00e8 un prefisso, \u00e8 un troncamento
  assert.equal(prefissoComuneDiParole(['parte1 del lavoro', 'parte2 del lavoro']), '');
  assert.equal(prefissoComuneDiParole(['uno', 'due']), '', 'senza niente in comune non si taglia niente');
  assert.equal(prefissoComuneDiParole(['solo io']), '', 'una sorella sola non ha nessuno da cui distinguersi');
});

/*
 * ⛔ AL CONTRARIO — le tre guardie. Una cura che migliora il caso brutto e peggiora quello normale non
 * è una cura: qui si prova che nei casi in cui NON serve i nomi tornano intatti, carattere per carattere.
 */
test('SORELLE-DISTINTE, AL CONTRARIO: quando la cura non serve i nomi restano INTATTI', () => {
  const gia_diversi = ['leggi il registro degli errori', 'scrivi il riassunto della giornata'];
  assert.deepEqual(nomiDistintiFraSorelle(gia_diversi), gia_diversi, 'niente in comune: niente da togliere');

  const prefisso_corto = ['crea alfa e poi fermati', 'crea beta e poi fermati'];
  assert.deepEqual(nomiDistintiFraSorelle(prefisso_corto), prefisso_corto,
    '\u00abcrea \u00bb sono 5 caratteri: toglierlo fa perdere l\u2019inizio della frase e non aiuta nessuno');

  const resto_troppo_corto = ['scrivi il file di configurazione a', 'scrivi il file di configurazione b'];
  assert.deepEqual(nomiDistintiFraSorelle(resto_troppo_corto), resto_troppo_corto,
    'dopo il taglio resterebbe \u00aba\u00bb: un nome di un carattere \u00e8 peggio di uno troncato');

  const una_sola = ['crea un file chiamato parte1.md con tre righe'];
  assert.deepEqual(nomiDistintiFraSorelle(una_sola), una_sola);
  assert.deepEqual(nomiDistintiFraSorelle([]), []);
  assert.deepEqual(nomiDistintiFraSorelle(['crea un file chiamato alfa', '']), ['crea un file chiamato alfa', ''],
    'una figlia senza compito non fa perdere il nome alle altre');
});

test('SORELLE-DISTINTE: l\u2019albero porta il nome distintivo accanto alla riga, senza toccare la sessione', () => {
  const madre = { sessionId: 'm', taskId: 'libero' };
  const f1 = { sessionId: 'f1', padreId: 'm', avviataAlle: '2026-09-09T20:31:00Z', taskDelega: 'crea un file chiamato parte1.md con tre righe sul registro dei processi' };
  const f2 = { sessionId: 'f2', padreId: 'm', avviataAlle: '2026-09-09T20:32:00Z', taskDelega: 'crea un file chiamato parte2.md con tre righe sugli allarmi' };
  const righe = ordinaSessioniAdAlbero([madre, f1, f2]);

  assert.equal(righe[0].nomeDistintivo, null, 'una madre non ha sorelle: nessun nome distintivo');
  assert.equal(righe[1].nomeDistintivo, '\u2026parte1.md con tre righe sul registro dei processi');
  assert.equal(righe[2].nomeDistintivo, '\u2026parte2.md con tre righe sugli allarmi');
  assert.equal(f1.taskDelega, 'crea un file chiamato parte1.md con tre righe sul registro dei processi',
    '\u26d4 la sessione NON viene toccata: \u00e8 il dato del server, il nome viaggia accanto');
});


/* ══════════════ Le sessioni in corso salgono in cima (owner, 11/09/2026) ══════════════ */

/*
 * ⛔ Owner: «una cosa importantissima: nella barra laterale fare salire automaticamente in cima le
 *   sessioni in corso»; e poi: «se ne ho tre e quelle più in basso mandano un messaggio, dopo un
 *   attimo sale in cima e viene segnalato».
 *
 * Qui si prova che l'ordine dice la verità in tutti i casi che contano, compreso quello che rende
 * la funzione pericolosa: che NON si rimescoli da sola. Ricerca 11/09/2026 — ChatGPT riordina per
 * `updated_at` e «una chat di sei mesi fa salta in cima appena scrivi»; sul forum di Cursor c'è una
 * richiesta esplicita di un ordine che non si riordini sull'attività. Un elenco che salta mentre lo
 * leggi è un difetto, non una funzione.
 */
test('le sessioni in corso salgono sopra quelle concluse', () => {
  const ordine = ordinaSessioniAdAlbero([
    { sessionId: 'ferma-1', conclusa: true },
    { sessionId: 'viva', conclusa: false },
    { sessionId: 'ferma-2', conclusa: true },
  ]).map((v) => v.sessione.sessionId);
  assert.equal(ordine[0], 'viva', `la sessione in corso deve stare in cima. Ordine: ${ordine.join(' · ')}`);
});

test('fra due sessioni in corso, comanda quella che ha parlato per ULTIMA', () => {
  const ordine = ordinaSessioniAdAlbero([
    { sessionId: 'vecchia', conclusa: false, ultimaRispostaAlle: '2026-09-11T10:00:00.000Z' },
    { sessionId: 'appena-parlata', conclusa: false, ultimaRispostaAlle: '2026-09-11T12:00:00.000Z' },
    { sessionId: 'muta', conclusa: false, ultimaRispostaAlle: null },
  ]).map((v) => v.sessione.sessionId);
  assert.equal(ordine[0], 'appena-parlata', `Ordine: ${ordine.join(' · ')}`);
  assert.equal(ordine.at(-1), 'muta', 'chi non ha mai risposto non scavalca chi ha risposto');
});

test('una madre conclusa con una FIGLIA in corso conta come viva: l’albero sta parlando', () => {
  const ordine = ordinaSessioniAdAlbero([
    { sessionId: 'altra-ferma', conclusa: true },
    { sessionId: 'madre', conclusa: true },
    { sessionId: 'figlia', conclusa: false, padreId: 'madre' },
  ]).map((v) => v.sessione.sessionId);
  assert.equal(ordine[0], 'madre', `la madre di una figlia viva sale, e la figlia resta sotto di lei. Ordine: ${ordine.join(' · ')}`);
  assert.equal(ordine[1], 'figlia', 'la figlia NON si stacca dalla madre per anzianità: l’albero resta leggibile');
});

test('⛔ AL CONTRARIO: fra sessioni FERME l’ordine non cambia — la barra non si rimescola da sola', () => {
  const ferme = [
    { sessionId: 'a', conclusa: true, ultimaRispostaAlle: '2026-09-11T08:00:00.000Z' },
    { sessionId: 'b', conclusa: true, ultimaRispostaAlle: '2026-09-11T20:00:00.000Z' },
    { sessionId: 'c', conclusa: true, ultimaRispostaAlle: '2026-09-11T14:00:00.000Z' },
  ];
  const ordine = ordinaSessioniAdAlbero(ferme).map((v) => v.sessione.sessionId);
  assert.deepEqual(ordine, ['a', 'b', 'c'],
    `⛔ nessuna sessione ferma deve saltare per un orario: l'ordine deve restare quello ricevuto. Trovato: ${ordine.join(' · ')}`);
});

test('⛔ AL CONTRARIO: senza nessuna sessione viva l’ordine resta esattamente quello ricevuto', () => {
  const righe = [{ sessionId: 'x', conclusa: true }, { sessionId: 'y', conclusa: true }];
  assert.deepEqual(ordinaSessioniAdAlbero(righe).map((v) => v.sessione.sessionId), ['x', 'y']);
});
