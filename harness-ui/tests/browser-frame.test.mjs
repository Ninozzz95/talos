import test from 'node:test';
import assert from 'node:assert/strict';
import { valutaIntestazioni, verificaIncorniciabile, urlAmmesso, classificaGuasto, siRitenta, eUnGuasto } from '../src/browser-frame.mjs';

// K-I (06/09) — la cornice del Browser: si decide dalle intestazioni, con le regole di MDN.

const intestazioni = (obj) => ({ get: (k) => obj[k.toLowerCase()] ?? null });
const NOSTRA = 'http://127.0.0.1:4174';

test('FRAME-XFO: DENY e SAMEORIGIN vietano; senza intestazioni si può', () => {
  assert.equal(valutaIntestazioni(intestazioni({ 'x-frame-options': 'DENY' }), NOSTRA).incorniciabile, false);
  assert.equal(valutaIntestazioni(intestazioni({ 'x-frame-options': 'sameorigin' }), NOSTRA).incorniciabile, false);
  assert.equal(valutaIntestazioni(intestazioni({}), NOSTRA).incorniciabile, true);
});

test('FRAME-CSP: frame-ancestors prevale su X-Frame-Options; * e la nostra origine ammettono, self e none no', () => {
  assert.equal(valutaIntestazioni(intestazioni({ 'content-security-policy': "frame-ancestors 'none'", 'x-frame-options': 'ALLOWALL' }), NOSTRA).incorniciabile, false);
  assert.equal(valutaIntestazioni(intestazioni({ 'content-security-policy': "default-src 'self'; frame-ancestors *" }), NOSTRA).incorniciabile, true);
  assert.equal(valutaIntestazioni(intestazioni({ 'content-security-policy': 'frame-ancestors http://127.0.0.1:4174' }), NOSTRA).incorniciabile, true);
  assert.equal(valutaIntestazioni(intestazioni({ 'content-security-policy': "frame-ancestors 'self'" }), NOSTRA).incorniciabile, false);
  // AL CONTRARIO: una CSP senza frame-ancestors lascia decidere X-Frame-Options
  assert.equal(valutaIntestazioni(intestazioni({ 'content-security-policy': "default-src 'self'", 'x-frame-options': 'DENY' }), NOSTRA).incorniciabile, false);
});

test('FRAME-URL: solo http/https, niente credenziali', () => {
  assert.equal(urlAmmesso(new URL('file:///C:/x')).ok, false);
  assert.equal(urlAmmesso(new URL('http://user:pw@example.org/')).ok, false);
  assert.equal(urlAmmesso(new URL('http://localhost:5173/')).ok, true);
});

test('FRAME-VERIFICA: legge intestazioni e titolo con un fetch finto, e non scarica la pagina intera', async () => {
  let cancellato = false;
  // il titolo sta nel primo pezzo; il resto della pagina non arriva mai chiuso: se il lettore non annulla, il test resta appeso
  const corpo = new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode('<html><head><title>  Dev  server </title></head><body>' + 'x'.repeat(5_000))); }, cancel() { cancellato = true; } });
  const fetchFn = async () => ({ url: 'http://localhost:5173/', status: 200, headers: intestazioni({ 'content-type': 'text/html; charset=utf-8' }), body: corpo });
  const esito = await verificaIncorniciabile('localhost:5173'.replace(/^/, 'http://'), { fetchFn, origineNostra: NOSTRA });
  // ⭐ 16/09 — la risposta porta anche `genere` e `dettagli`: null/vuoto quando non c'è niente da nominare.
  assert.deepEqual(esito, { url: 'http://localhost:5173/', incorniciabile: true, motivo: null, stato: 200, titolo: 'Dev server', genere: null, dettagli: {} });
  assert.equal(cancellato, true);
  const negato = await verificaIncorniciabile('https://example.org/x', { fetchFn: async () => ({ url: 'https://example.org/x', status: 200, headers: intestazioni({ 'x-frame-options': 'DENY' }), body: { cancel: async () => {} } }), origineNostra: NOSTRA });
  assert.equal(negato.incorniciabile, false);
  assert.match(negato.motivo, /DENY/);
  const morto = await verificaIncorniciabile('http://localhost:1/', { fetchFn: async () => { throw new TypeError('fetch failed'); }, origineNostra: NOSTRA });
  assert.deepEqual([morto.incorniciabile, morto.motivo], [false, 'Non sono riuscito a raggiungere il sito']);
  const nonUrl = await verificaIncorniciabile('non è un url', { fetchFn: async () => { throw new Error('mai chiamato'); }, origineNostra: NOSTRA });
  assert.equal(nonUrl.motivo, 'URL non valido');
});

/*
 * ⛔⛔⛔ 16/09/2026, P0 corsia B punto 4 — UN TIMEOUT NON È UN RIFIUTO, E NESSUNO DEI DUE È UN
 *   NOME CHE NON ESISTE.
 *
 * Root cause misurata sul file prima della cura: il `catch` di `verificaIncorniciabile` (righe
 * 92-94) schiacciava OGNI guasto su due frasi sole — «Nessuna risposta entro 6 secondi» per
 * l'abort, «La pagina non risponde» per tutto il resto. Dall'altra parte, in
 * `frontend/src/components/browser.js`, `rimedioPerIlMotivo` sceglie il consiglio LEGGENDO quel
 * motivo: cerca /non esiste|ERR_NAME/, /certificato|SSL|TLS/, /non ha risposto in tempo/,
 * /Nessuno risponde/. Nessuna delle due frasi del server incrocia nessuna di quelle quattro
 * ⇒ chi sbagliava a scrivere l'indirizzo si sentiva rispondere «chiedi all'agente di leggerla»,
 * che per un nome inesistente è un consiglio FALSO: non può leggerla nemmeno lui.
 *
 * Ricerca 16/09/2026: nodejs/undici #1603 e #2362 (il codice vero del guasto sta in
 * `errore.cause.code` — ENOTFOUND, ECONNREFUSED, UND_ERR_CONNECT_TIMEOUT) e MDN «AbortSignal:
 * AbortError vs TimeoutError» — un annullamento volontario e una scadenza non sono lo stesso
 * fatto e non si raccontano con la stessa frase.
 */
test('GUASTO-CLASSIFICATO: timeout, nome inesistente, porta chiusa e certificato sono QUATTRO fatti diversi', async () => {
  const conCausa = (code) => { const e = new TypeError('fetch failed'); e.cause = Object.assign(new Error(code), { code }); return e; };
  const chiedi = (errore) => verificaIncorniciabile('https://esempio.test/x', { fetchFn: async () => { throw errore; }, origineNostra: NOSTRA, millisecondi: 6000 });

  const dns = await chiedi(conCausa('ENOTFOUND'));
  assert.equal(dns.genere, 'dns');
  assert.match(dns.motivo, /non esiste/i, 'il rimedio giusto è «controlla l’indirizzo», e lo sceglie il motivo');

  const rifiuto = await chiedi(conCausa('ECONNREFUSED'));
  assert.equal(rifiuto.genere, 'rifiuto');
  assert.match(rifiuto.motivo, /Nessuno risponde/i, 'porta chiusa: il rimedio è «controlla che il servizio sia acceso»');

  const scaduto = await chiedi(conCausa('UND_ERR_CONNECT_TIMEOUT'));
  assert.equal(scaduto.genere, 'timeout');
  assert.match(scaduto.motivo, /non ha risposto in tempo/i);

  const certificato = await chiedi(conCausa('CERT_HAS_EXPIRED'));
  assert.equal(certificato.genere, 'certificato');
  assert.match(certificato.motivo, /certificato/i);

  const abortito = Object.assign(new Error('The operation was aborted'), { name: 'AbortError' });
  const perTempo = await chiedi(abortito);
  assert.equal(perTempo.genere, 'timeout');
  assert.match(perTempo.motivo, /non ha risposto in tempo/i, 'anche la scadenza nostra si racconta come scadenza, non come «non risponde»');

  // e la classificazione è una funzione a sé, provabile senza passare dalla rete
  assert.equal(classificaGuasto(conCausa('EAI_AGAIN')).genere, 'dns');
  assert.equal(classificaGuasto(conCausa('ECONNRESET')).genere, 'rete');
  assert.equal(classificaGuasto(conCausa('DEPTH_ZERO_SELF_SIGNED_CERT')).genere, 'certificato');
});

/*
 * ⛔ AL CONTRARIO — la classificazione dice anche CHI SI PUÒ RITENTARE. Un nome che non esiste e un
 *   certificato scaduto non cambiano riprovando: ritentarli è solo tempo tolto a chi guarda.
 *   Un timeout, una connessione caduta o una porta che in questo istante non risponde sì.
 *   Fonte 16/09/2026: AWS Architecture Blog «Exponential Backoff And Jitter» — si ritenta ciò che
 *   è TRANSITORIO, e ogni ritentativo aspetta un tempo dichiarato.
 */
test('GUASTO-CLASSIFICATO, al contrario: DNS e certificato NON si ritentano, timeout e rete sì', () => {
  assert.equal(siRitenta('dns'), false);
  assert.equal(siRitenta('certificato'), false);
  assert.equal(siRitenta('timeout'), true);
  assert.equal(siRitenta('rete'), true);
  assert.equal(siRitenta('rifiuto'), true);
  assert.equal(siRitenta(null), false, 'un guasto che non so nominare non si ritenta a oltranza');
});

/*
 * ⛔⛔⛔ 16/09/2026, GIRO DI RIPARAZIONE — le due prove che il controllore ha preteso, e perché.
 *
 * La consegna precedente diceva riparata la lingua del pannello; le foto mostravano il titolo in
 * inglese sopra il motivo in italiano. La causa era che il MOTIVO è una frase composta con un
 * numero dentro, e il client la passava a un dizionario a chiavi fisse: una chiave con «6» dentro
 * non ci sarà mai. ⇒ Qui si tiene fermo il contratto NUOVO: il server manda un genere stabile e i
 * suoi parametri, e li manda per OGNI esito che non sia «va bene» — guasti e rifiuti insieme.
 *
 * Fonte 16/09/2026: api-craft, «Shall REST API error messages be internationalized?» — errori
 * neutri rispetto alla lingua, con valori ben definiti, così che sia il consumatore a localizzare.
 */
test('GUASTO-PARAMETRI: i secondi viaggiano come DATO, non solo dentro la frase', () => {
  const scaduto = classificaGuasto(Object.assign(new Error('x'), { name: 'AbortError' }), { millisecondi: 6000 });
  assert.equal(scaduto.dettagli.secondi, 6, 'senza il numero come dato, il client non può scrivere la frase nella sua lingua');
  const lungo = classificaGuasto(Object.assign(new Error('x'), { name: 'TimeoutError' }), { millisecondi: 11_000 });
  assert.equal(lungo.dettagli.secondi, 11, 'e il numero è quello VERO, non una costante scritta a mano');
  // al contrario: un guasto senza parametri non inventa un numero
  const conCausa = (code) => { const e = new TypeError('fetch failed'); e.cause = Object.assign(new Error(code), { code }); return e; };
  assert.deepEqual(classificaGuasto(conCausa('ENOTFOUND')).dettagli, {});
});

test('RIFIUTO-NOMINATO: anche un «no» del sito ha il suo genere, non solo i guasti di rete', () => {
  assert.equal(valutaIntestazioni(intestazioni({ 'x-frame-options': 'DENY' }), NOSTRA).genere, 'xfo-deny');
  assert.equal(valutaIntestazioni(intestazioni({ 'x-frame-options': 'sameorigin' }), NOSTRA).genere, 'xfo-sameorigin');
  assert.equal(valutaIntestazioni(intestazioni({ 'content-security-policy': "frame-ancestors 'none'" }), NOSTRA).genere, 'frame-ancestors');
  // AL CONTRARIO: una pagina che si lascia incorniciare non porta nessun genere — non c'è niente da nominare
  assert.equal(valutaIntestazioni(intestazioni({}), NOSTRA).genere, null);
  assert.equal(valutaIntestazioni(intestazioni({ 'content-security-policy': 'frame-ancestors *' }), NOSTRA).genere, null);
});

/*
 * ⛔⛔⛔ 16/09/2026, GIRO DI RIPARAZIONE — la distinzione che mi stavo per perdere.
 * Da quando anche i RIFIUTI del sito portano un genere (per poterli dire in due lingue), leggere
 * la PRESENZA del genere come «guasto» classifica un sito vivo come irraggiungibile. La prova
 * tiene ferme le DUE famiglie, e chi ne aggiunge una terza deve passare di qui.
 */
test('GUASTO-O-RIFIUTO: «non ci sono arrivato» e «il sito dice di no» sono due cose diverse', () => {
  for (const g of ['timeout', 'dns', 'rifiuto', 'certificato', 'rete', 'indirizzo']) {
    assert.equal(eUnGuasto(g), true, g + ' è un guasto: la scheda si ferma e si può riprovare');
  }
  // AL CONTRARIO — un sito che risponde e dice di no NON è un guasto: si ripiega sul testo
  for (const g of ['xfo-deny', 'xfo-sameorigin', 'frame-ancestors', null, undefined, '']) {
    assert.equal(eUnGuasto(g), false, String(g) + ' non è un guasto: riprovare non cambierebbe niente');
  }
  // e ogni genere che il server sa produrre deve stare in UNA delle due famiglie, mai fuori
  const dalServer = ['timeout', 'dns', 'rifiuto', 'certificato', 'rete', 'indirizzo', 'xfo-deny', 'xfo-sameorigin', 'frame-ancestors'];
  for (const g of dalServer) assert.equal(typeof eUnGuasto(g), 'boolean', g);
  // i ritentabili sono un SOTTOINSIEME dei guasti: non si ritenta ciò che non è un guasto
  for (const g of dalServer) if (siRitenta(g)) assert.equal(eUnGuasto(g), true, g + ': si ritenta solo un guasto');
});
