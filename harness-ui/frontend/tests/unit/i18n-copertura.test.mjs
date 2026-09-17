import test from 'node:test';
import assert from 'node:assert/strict';
import { traduzioniMancanti, impostaLingua, t, tn } from '../../src/components/lingua.js';
import { CAMPI_IMPOSTAZIONI, SEZIONI_IMPOSTAZIONI } from '../../src/components/impostazioni-campi.js';
import { NOMI_UMANI_ATTREZZI } from '../../src/components/nomi-attrezzi.js';
import { TESTI as TESTI_TERMINALE, ETICHETTA_STATO } from '../../src/components/terminale.js';
import { TESTI as TESTI_BROWSER } from '../../src/components/browser.js';
import { TESTI as TESTI_CONNESSIONE } from '../../src/components/connessione.js';
import { AZIONI_FILE } from '../../src/components/review.js'; // BC-63, 17/09: le voci del menu delle linguette della Revisione

// P-i18n (06/09) — la copertura dell'inglese si MISURA sulle frasi vere del codice, categoria per categoria.

const frasiImpostazioni = [
  ...SEZIONI_IMPOSTAZIONI.map((s) => s.titolo),
  ...CAMPI_IMPOSTAZIONI.map((c) => c.titolo),
  ...CAMPI_IMPOSTAZIONI.flatMap((c) => (c.opzioni || []).map(([, nome]) => nome)),
  ...CAMPI_IMPOSTAZIONI.map((c) => c.unita).filter(Boolean),
];
const frasiAttrezzi = Object.values(NOMI_UMANI_ATTREZZI);
const frasiComponenti = [
  ...Object.values(TESTI_TERMINALE).filter((v) => typeof v === 'string' && v),
  ...Object.values(ETICHETTA_STATO),
  ...Object.values(TESTI_BROWSER).filter((v) => typeof v === 'string' && v),
  ...Object.values(TESTI_CONNESSIONE).filter((v) => typeof v === 'string' && v),
  ...Object.values(AZIONI_FILE),
  'Azioni sul file', // l'etichetta del menu, che `creaMenuContestuale` passa a t()
];

test('I18N-COPERTURA: ogni frase di Impostazioni, attrezzi e componenti ha l’inglese', () => {
  assert.deepEqual(traduzioniMancanti('en', frasiImpostazioni), [], 'impostazioni');
  assert.deepEqual(traduzioniMancanti('en', frasiAttrezzi), [], 'attrezzi');
  assert.deepEqual(traduzioniMancanti('en', frasiComponenti), [], 'componenti');
  assert.ok(frasiImpostazioni.length > 100 && frasiAttrezzi.length > 40 && frasiComponenti.length > 30, 'il conteggio misura davvero qualcosa');
});

test('I18N-COPERTURA AL CONTRARIO: una frase inventata risulta mancante', () => {
  assert.deepEqual(traduzioniMancanti('en', ['Questa frase non esiste nel codice']), ['Questa frase non esiste nel codice']);
});

test('I18N-T: in italiano t() restituisce la frase; in inglese traduce, interpola e declina; senza traduzione resta l’italiano', () => {
  impostaLingua('it');
  assert.equal(t('Chiudi le altre'), 'Chiudi le altre');
  assert.equal(tn('{n} pagina aperta da te', '{n} pagine aperte da te', 1), '1 pagina aperta da te');
  impostaLingua('en');
  assert.equal(t('Chiudi le altre'), 'Close others');
  assert.equal(t('Hai già {n} schede aperte: chiudine una', { n: 8 }), 'You already have 8 tabs open: close one');
  assert.equal(tn('{n} pagina aperta da te', '{n} pagine aperte da te', 1), '1 page opened by you');
  assert.equal(tn('{n} pagina aperta da te', '{n} pagine aperte da te', 3), '3 pages opened by you');
  assert.equal(t('Frase senza traduzione'), 'Frase senza traduzione');
  assert.equal(impostaLingua('xx'), 'it'); // una lingua sconosciuta ricade sull'italiano
});
