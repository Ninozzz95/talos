import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/*
 * ⭐⭐⭐ BC-13, 11/09/2026 — I MODELLI LOCALI NON ASPETTANO LA RETE.
 *
 * Misurato nella app vera, banco mio su porta privata (mai il 4174), col catalogo OpenRouter
 * intercettato da Playwright. Quando compare il conteggio della scheda «Locali»:
 *
 *   | catalogo OpenRouter  | prima      | dopo   |
 *   | -------------------- | ---------- | ------ |
 *   | caldo                | 123 ms     | 23 ms  |
 *   | lento (2 s simulati) | 2.034 ms   | 22 ms  |
 *   | IRRAGGIUNGIBILE      | **mai**    | 24 ms  |
 *
 * Nel terzo caso, prima, la striscia delle schede restava perfino VUOTA: si entrava nel `catch`
 * di `carica()` e `renderFonti()` non veniva chiamata mai. Cioè i modelli che girano su questo
 * computer — gli unici che non hanno bisogno di rete — sparivano proprio quando la rete manca.
 *
 * ⛔ Provato anche AL VERSO CONTRARIO (disco illeggibile, catalogo sano): la scheda «Locali»
 *   resta senza conteggio e dice «Non riesco a leggere i modelli installati: …», mentre
 *   OpenRouter continua a mostrare i suoi 443. Prima diceva «Nessun modello installato», cioè
 *   dichiarava un fatto che nessuno aveva accertato.
 *
 * Si legge il sorgente: `creaModelPicker` vuole tutto il DOM del selettore e queste unit non
 * caricano jsdom (stessa scelta di `browser-torna-alla-pagina` e `bc18-scheda-agenti-non-diverge`).
 */

const APP = readFileSync(new URL('../../src/legacy/app.js', import.meta.url), 'utf8');
const NUDO = APP.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
/** Il corpo di `carica()` del selettore modelli, dall'intestazione alla riga `function apri()`. */
const CARICA = NUDO.slice(NUDO.indexOf('async function carica({ forza = false } = {}) {'), NUDO.indexOf('    function apri() {'));

/*
 * ⛔ 13/09/2026, secondo giro — LE DUE DOMANDE VIVONO QUI, IN UNA FUNZIONE SOLA.
 *   Il giro di stamattina aveva già corretto un nome più largo della misura (BC13-MORDE
 *   controllava una proprietà SUA invece di rieseguire le guardie), ma la cura ne teneva una
 *   COPIA privata: misurato oggi sul sorgente SANO, svuotando le due guardie di sopra
 *   (`assert.ok(true)`) la prova che si intitola «le due guardie di sopra diventano rosse»
 *   restava VERDE — cioè il titolo era ancora più largo della cosa misurata, di un passo.
 *   Adesso è la STESSA funzione a essere chiamata dalle due prove e dalla prova che le mette
 *   alla frusta: chi svuota la domanda fa diventare rossa anche BC13-MORDE.
 */

/** BC13-PARALLELO come domanda su un testo qualunque: LANCIA se i locali aspettano la rete. */
function guardiaParallelo(testo) {
  const iLocali = testo.indexOf('caricaLocali()');
  const iDiretti = testo.indexOf('caricaDiretti()');
  const iCatalogo = testo.indexOf("await apiGet(`/api/v1/models");
  assert.ok(iLocali >= 0 && iDiretti >= 0 && iCatalogo >= 0, 'le tre chiamate devono esserci tutte');
  assert.ok(iLocali < iCatalogo, 'i locali partono prima di aspettare OpenRouter');
  assert.ok(iDiretti < iCatalogo, 'i fornitori diretti partono prima di aspettare OpenRouter');
}

/** BC13-STRISCIA, idem: LANCIA se le schede si disegnano solo dopo la risposta del catalogo. */
function guardiaStriscia(testo) {
  const iRender = testo.indexOf('renderFonti();');
  const iCatalogo = testo.indexOf("await apiGet(`/api/v1/models");
  assert.ok(iRender >= 0 && iRender < iCatalogo, 'renderFonti() prima dell’await: cinque schede senza numero sono onestà, una striscia vuota è un guasto');
}

test('BC13-PARALLELO: disco e fornitori diretti partono PRIMA dell’await del catalogo', () => {
  guardiaParallelo(CARICA);
});

test('BC13-STRISCIA: le schede si disegnano prima di qualunque risposta', () => {
  guardiaStriscia(CARICA);
});

test('BC13-CATCH: il guasto del catalogo resta dentro la scheda OpenRouter', () => {
  const catch_ = CARICA.slice(CARICA.indexOf('} catch (error) {'));
  assert.match(catch_, /renderFonti\(\);/, 'anche fallendo, la striscia deve esistere');
  assert.match(catch_, /if \(fonteScelta === 'openrouter'\)/, 'l’errore si scrive solo nella scheda che l’ha subito');
});

test('BC13-TRE-STATI: disco illeggibile non è «nessun modello installato»', () => {
  assert.match(NUDO, /catch\(\(e\) => \{ modelliLocali = null; erroreLocali = e\?\.message/);
  assert.match(NUDO, /if \(erroreLocali\) \{[\s\S]{0,200}Non riesco a leggere i modelli installati/);
});

test('BC13-MORDE: rimesse le chiamate dopo l’await, LE STESSE due guardie di sopra diventano rosse', () => {
  const iCatalogo = CARICA.indexOf("await apiGet(`/api/v1/models");
  const mutato = CARICA.slice(0, CARICA.indexOf('const localiInVolo = caricaLocali();')) + CARICA.slice(iCatalogo);

  /* ⛔ Prima di leggere un rosso come una prova, si dichiara che la MUTAZIONE È AVVENUTA:
     un testo non mutato farebbe fallire gli `assert.throws` qui sotto per il motivo sbagliato. */
  assert.ok(mutato.includes("await apiGet(`/api/v1/models"), 'il testo mutato deve contenere ancora l’await del catalogo');
  assert.ok(!mutato.includes('const localiInVolo = caricaLocali();'), 'la mutazione deve aver tolto DAVVERO la partenza anticipata dei locali');
  assert.ok(mutato.length < CARICA.length, 'il testo mutato deve essere diverso dal sorgente vero');

  /* Sul sorgente VERO devono TACERE: se lanciassero anche qui, il rosso qui sotto non proverebbe
     niente — sarebbe una guardia che accusa sempre, non una che distingue. */
  guardiaParallelo(CARICA);
  guardiaStriscia(CARICA);

  /* E col difetto rimesso dentro devono LANCIARE tutte e due. Sono le stesse funzioni che le due
     prove di sopra eseguono: svuotarne una fa diventare rossa questa. */
  assert.throws(() => guardiaParallelo(mutato), /devono esserci tutte|prima di aspettare OpenRouter/,
    '⛔ con le chiamate spostate dopo l’await, BC13-PARALLELO deve diventare rossa');
  assert.throws(() => guardiaStriscia(mutato), /renderFonti/,
    '⛔ con le schede disegnate solo dopo la risposta, BC13-STRISCIA deve diventare rossa');
});
