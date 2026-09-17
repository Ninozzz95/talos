/*
 * OSS-3 — un errore lanciato da una pagina che OSPITIAMO non è un errore NOSTRO.
 *
 * ⛔ Il fatto misurato il 17/09 (giro vero + sonda Playwright, vedi il blocco lungo in
 *   `components/browser.js`): due `pageerror` «the document is sandboxed and lacks the
 *   'allow-same-origin' flag» nascono da una cornice ANNIDATA dentro la pagina terza, che quella
 *   pagina ha sandboxato per conto suo. La nostra cornice quel permesso ce l'ha.
 * ⛔ E la guardia si prova nei DUE VERSI: deve dire «terzo» quando lo è, e deve dire di NO quando
 *   la stessa frase arriva senza nessuna cornice estranea — altrimenti sarebbe un tappo, non un
 *   filtro, e coprirebbe i nostri errori esattamente come quelli degli altri.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { erroreDiUnaPaginaTerza } from '../../src/components/browser.js';

const NOSTRA = 'http://127.0.0.1:4179';
const MESSAGGIO = "Failed to read the 'localStorage' property from 'Window': The document is sandboxed and lacks the 'allow-same-origin' flag.";

test('OSS-3 · con una cornice di un’altra origine viva, l’errore del sandbox è della pagina ospitata', () => {
  const r = erroreDiUnaPaginaTerza(MESSAGGIO, [NOSTRA + '/', 'https://terza-parte.example/pagina'], NOSTRA);
  assert.equal(r.terzo, true);
  assert.match(r.perche, /terza-parte\.example/u, 'il motivo NOMINA la cornice: un filtro muto è indistinguibile da uno rotto');
});

test('OSS-3 · AL CONTRARIO: senza cornici estranee la stessa frase resta NOSTRA', () => {
  const r = erroreDiUnaPaginaTerza(MESSAGGIO, [NOSTRA + '/', NOSTRA + '/api/v1/artifacts/a1'], NOSTRA);
  assert.equal(r.terzo, false, 'un artefatto sandboxato è roba nostra: quell’errore lo dobbiamo vedere');
  assert.match(r.perche, /nessuna cornice/u);
});

test('OSS-3 · AL CONTRARIO: un errore NOSTRO non viene scartato solo perché c’è una pagina ospitata', () => {
  const r = erroreDiUnaPaginaTerza('fermaMotore is not defined', [NOSTRA + '/', 'https://terza-parte.example/'], NOSTRA);
  assert.equal(r.terzo, false, 'il filtro è stretto sui messaggi del sandbox, non su tutto ciò che passa');
  assert.match(r.perche, /non è un errore del sandbox/u);
});

test('OSS-3 · `about:blank` e una cornice senza indirizzo non contano come «altra origine»', () => {
  assert.equal(erroreDiUnaPaginaTerza(MESSAGGIO, [NOSTRA + '/', 'about:blank'], NOSTRA).terzo, false);
  assert.equal(erroreDiUnaPaginaTerza(MESSAGGIO, [NOSTRA + '/', ''], NOSTRA).terzo, false);
});

test('OSS-3 · anche il messaggio gemello su `allow-scripts` è riconosciuto', () => {
  const messaggio = "Blocked script execution because the document is sandboxed and lacks the 'allow-scripts' flag.";
  assert.equal(erroreDiUnaPaginaTerza(messaggio, ['https://terza-parte.example/'], NOSTRA).terzo, true);
});

/*
 * ⛔⛔ N1, 17/09 sera — IL FILTRO DEVE DIFENDERE LA PROPRIA STRETTEZZA, e finora non lo faceva.
 *   Il controllore ha misurato che allargando la regex a `/SecurityError|sandbox|localStorage|
 *   Failed to read/` la suite restava 1202/1202: cioè nessun test si accorgeva della differenza fra
 *   un filtro chirurgico e un tappo. Un cancello la cui strettezza non è provata è un cancello che
 *   qualcuno allargherà «per far passare quell'altro caso», e nessun rosso lo fermerà.
 * ⇒ Questi due casi mordono esattamente lì: parole che COMPAIONO nei messaggi del sandbox, dentro
 *   errori che sono NOSTRI, con una cornice terza viva accanto. Devono restare rossi per noi.
 */
test('OSS-3/N1 · un NOSTRO errore che nomina «localStorage» resta nostro, anche con una pagina ospitata viva', () => {
  const r = erroreDiUnaPaginaTerza(
    "Cannot read properties of null (reading 'localStorage')",
    [NOSTRA + '/', 'https://terza-parte.example/doc'], NOSTRA,
  );
  assert.equal(r.terzo, false, 'una parola in comune non fa di un nostro guasto un guasto altrui');
  assert.match(r.perche, /non è un errore del sandbox/u);
});

test('OSS-3/N1 · un NOSTRO `SecurityError` che NON parla del sandbox resta nostro', () => {
  const r = erroreDiUnaPaginaTerza(
    "SecurityError: Failed to read the 'cookie' property from 'Document': Access is denied for this document.",
    [NOSTRA + '/', 'https://terza-parte.example/doc'], NOSTRA,
  );
  assert.equal(r.terzo, false, 'il filtro guarda la CAUSA dichiarata (il flag mancante), non il nome della classe');
});

test('OSS-3/N2 · senza la nostra origine il cancello NEGA invece di lasciar passare', () => {
  for (const origine of ['', '   ', null, undefined, 42]) {
    const r = erroreDiUnaPaginaTerza(MESSAGGIO, ['https://terza-parte.example/'], origine);
    assert.equal(r.terzo, false, `con origine ${JSON.stringify(origine)} il filtro deve negare`);
    assert.match(r.perche, /origine della app non dichiarata/u);
  }
});

test('OSS-3 · un indirizzo illeggibile è trattato come estraneo, non come nostro', () => {
  /* ⛔ Il verso prudente: davanti a un dato che non so leggere non concludo «è mio e va bene». */
  assert.equal(erroreDiUnaPaginaTerza(MESSAGGIO, ['non-e-un-indirizzo'], NOSTRA).terzo, true);
});
