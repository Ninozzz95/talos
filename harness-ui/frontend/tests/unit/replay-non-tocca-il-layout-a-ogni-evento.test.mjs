import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/*
 * ⛔⛔⛔ 11/09/2026 — LAYOUT THRASHING NELL'APERTURA DI UNA SESSIONE LUNGA.
 *
 * Misurato sul banco (porta libera, copia dello store, mai il 4174), sessione da 34.026 righe e
 * 19.482 nodi in chat, Chrome vero con i tre flag anti-throttling, mediana di 3 giri:
 *
 *   fine del replay      2.722 ms → 997 ms      main thread bloccato  2.645 ms → 882 ms
 *   primo frame stabile  2.867 ms → 1.092 ms    fotogramma peggiore   2.177 ms → 730 ms
 *
 * a schermo ESATTAMENTE lo stesso contenuto (916.907 caratteri, stessa impronta, 213 righe
 * attrezzo, 614 blocchi di codice, 43 collassabili).
 *
 * Le tre cure hanno un principio solo — «non toccare il DOM a ogni delta, non leggere il layout a
 * ogni evento: una volta per FOTOGRAMMA» (web.dev «Avoid large, complex layouts and layout
 * thrashing», agg. 07/05/2025; webperf.tips «Layout Thrashing and Forced Reflows», 11/12/2022;
 * Paul Irish «What forces layout/reflow», agg. 09/09/2026 — lette l'11/09/2026).
 *
 * ⛔ Questo file è un CANCELLO sul sorgente, e ogni prova gira anche AL CONTRARIO: la stessa
 *   asserzione viene rifatta su una copia GUASTA del sorgente (la forma di ieri, rimessa a mano) e
 *   deve fallire. Un cancello che passa sia sul codice curato sia su quello malato non è un
 *   cancello.
 */

const APP = readFileSync(new URL('../../src/legacy/app.js', import.meta.url), 'utf8');
const senzaCommenti = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
const NUDO = senzaCommenti(APP);

/** Il corpo di una funzione o di un `case`, dal segnale dato fino a `lunghezza` caratteri. */
const attorno = (sorgente, segnale, lunghezza = 2600) => {
  const i = sorgente.indexOf(segnale);
  assert.notEqual(i, -1, `segnale non trovato nel sorgente: ${segnale}`);
  return sorgente.slice(i, i + lunghezza);
};

/*
 * ⛔ `case 'ToolCallArgs'` compare DUE volte nel file: la prima è l'esportazione in markdown di
 *   una conversazione (`toolBuffer`), la seconda è `handleRealEvent`. È il secondo che ci
 *   interessa — il primo è stato preso per buono in una prima stesura di questo cancello, e
 *   diceva il falso su tutt'altra funzione.
 */
const attornoUltimo = (sorgente, segnale, lunghezza = 2600) => {
  const i = sorgente.lastIndexOf(segnale);
  assert.notEqual(i, -1, `segnale non trovato nel sorgente: ${segnale}`);
  return sorgente.slice(i, i + lunghezza);
};

/** Ogni prova gira anche sul sorgente GUASTO: lì deve fallire, o non sta guardando niente. */
const morde = (controllo, guasto) => {
  assert.throws(() => controllo(guasto), assert.AssertionError,
    'il controllo passa anche sul sorgente GUASTO: non morde');
};

test('RIPRISTINO-01: il MutationObserver MARCA, non legge-e-scrive il layout a ogni mutazione', () => {
  const controllo = (s) => {
    const corpo = attorno(s, 'function mantieniFondoDuranteRipristino');
    // la forma di ieri — reflow sincrono forzato per ogni mutazione — non deve esistere più
    assert.doesNotMatch(corpo, /new MutationObserver\(inFondo\)/);
    assert.match(corpo, /new MutationObserver\(chiediFondo\)/);
    // e il marcatore paga la coppia lettura+scrittura una volta per fotogramma
    assert.match(corpo, /chiediFondo = \(\) => \{[\s\S]*?requestAnimationFrame\(\(\) => \{[^}]*inFondo\(\);/);
  };
  controllo(NUDO);
  morde(controllo, NUDO.replace('new MutationObserver(chiediFondo)', 'new MutationObserver(inFondo)'));
});

test('RIPRISTINO-02: il fondo FINALE resta sincrono — la cura non lo affida al fotogramma', () => {
  // ⛔ il verso che conta per l'owner: «cliccando una sessione la chat deve essere già in fondo».
  const corpo = attorno(NUDO, 'function mantieniFondoDuranteRipristino');
  assert.match(corpo, /const scopri = \(\) => \{[^}]*inFondo\(\);[^}]*classList\.remove\('is-restoring'\);[^}]*inFondo\(\);/);
  assert.match(corpo, /scopri\(\); window\.requestAnimationFrame\(inFondo\); window\.setTimeout\(inFondo, 250\);/);
});

test('RIPRISTINO-03: la rete di sicurezza non è più un numero fisso, e ha un tetto', () => {
  const controllo = (s) => {
    const corpo = attorno(s, 'function mantieniFondoDuranteRipristino', 4200);
    // 8 s erano tarati su «1.235 righe in ~1s»: su 34.026 righe scoprivano una cronologia a metà
    assert.doesNotMatch(corpo, /setTimeout\(\(\) => \{ if \(!smesso\) scopri\(\); \}, 8_000\)/);
    assert.match(corpo, /const reteDiSicurezza = \(\) => \{/);
    // si guarda se il replay porta ancora eventi NUOVI, e non oltre i 20 s
    assert.match(corpo, /ultimoEventoNuovo/);
    assert.match(corpo, /< 20_000/);
  };
  controllo(NUDO);
  morde(controllo, NUDO.replace(/const reteDiSicurezza[\s\S]*?window\.setTimeout\(reteDiSicurezza, 8_000\);/,
    'window.setTimeout(() => { if (!smesso) scopri(); }, 8_000);'));
});

test('ARGOMENTI-01: durante un replay `ToolCallArgs` NON disegna a ogni delta', () => {
  const controllo = (s) => {
    const corpo = attornoUltimo(s, "case 'ToolCallArgs': {", 900);
    assert.match(corpo, /info\.argomenti \+= evento\.delta;/);
    assert.match(corpo, /if \(state\.realSession\.deferHistoricalRendering\) \{ chiediDisegnoArgomentiAttrezzo\(info\); break; \}/);
    // ⛔ dentro il `case` non deve restare nessun disegno diretto: quello vive nella funzione
    assert.doesNotMatch(corpo, /renderizzaArgomentiAttrezzo\(/);
    assert.doesNotMatch(corpo, /JSON\.parse\(info\.argomenti\)/);
  };
  controllo(NUDO);
  morde(controllo, NUDO.replace('if (state.realSession.deferHistoricalRendering) { chiediDisegnoArgomentiAttrezzo(info); break; }',
    'if (info.detail) renderizzaArgomentiAttrezzo(info.detail, info.argomenti);'));
});

test('ARGOMENTI-02: dal vivo la grana delta-per-delta resta — si coalesce SOLO il passato', () => {
  // ⛔ il verso contrario: senza replay in corso si disegna subito, come prima.
  const corpo = attornoUltimo(NUDO, "case 'ToolCallArgs': {", 900);
  assert.match(corpo, /deferHistoricalRendering\) \{ chiediDisegnoArgomentiAttrezzo\(info\); break; \}\s*\n\s*aggiornaVistaArgomentiAttrezzo\(info\);/);
});

test('ARGOMENTI-03: chi scrive dentro `info.detail` salda PRIMA il disegno differito', () => {
  /*
   * ⛔ Non è un'ottimizzazione: `renderizzaArgomentiAttrezzo` fa `replaceChildren()`. Se il disegno
   *   differito arrivasse DOPO l'append dell'uscita o dell'esito, li CANCELLEREBBE — cioè la cura
   *   della velocità si mangerebbe un pezzo di conversazione, che è peggio del difetto.
   */
  const controllo = (s) => {
    for (const ramo of ["case 'ToolCallOutput': {", "case 'ToolCallResult': {"]) {
      const corpo = attornoUltimo(s, ramo, 4200);
      const salda = corpo.indexOf('disegnaArgomentiSeInAttesa(info)');
      const scrive = corpo.search(/info\??\.detail\.(appendChild|append|replaceChildren)/);
      assert.notEqual(salda, -1, `${ramo} non salda il disegno differito`);
      assert.ok(scrive === -1 || salda < scrive, `${ramo}: si scrive in detail PRIMA di saldare`);
    }
  };
  controllo(NUDO);
  morde(controllo, NUDO.replaceAll('disegnaArgomentiSeInAttesa(info);', ''));
});

test('ARGOMENTI-04: il secondo JSON.parse è sparito — l’oggetto si passa, non si riparsa', () => {
  const controllo = (s) => {
    const corpo = attorno(s, 'function renderizzaArgomentiAttrezzo(', 600);
    assert.match(corpo, /function renderizzaArgomentiAttrezzo\(contenitore, jsonGrezzo, argomentiGiaParsati = undefined\)/);
    assert.match(corpo, /if \(argomentiGiaParsati !== undefined\) argomenti = argomentiGiaParsati;/);
    // chi non ce l'ha continua a chiamare con due argomenti: nessun chiamante costretto a cambiare
    assert.match(corpo, /else \{ try \{ argomenti = JSON\.parse\(jsonGrezzo\); \}/);
  };
  controllo(NUDO);
  morde(controllo, NUDO.replace('function renderizzaArgomentiAttrezzo(contenitore, jsonGrezzo, argomentiGiaParsati = undefined)',
    'function renderizzaArgomentiAttrezzo(contenitore, jsonGrezzo)'));
});

test('FONDO-01: `fondoConversazioneInVista` legge il layout una volta per fotogramma, e scade', () => {
  /*
   * Profilo CPU dopo la prima cura: era diventata la prima voce con 1.343 ms di self-time, chiamata
   * da `aggiornaPiedeChatDaStato` ← `aggiornaRiassuntoBatch` (881 ms) e ← `aggiornaComposerUsage`
   * (363 ms), cioè UNA VOLTA PER EVENTO, su un albero appena mutato.
   */
  const controllo = (s) => {
    const corpo = attorno(s, 'function fondoConversazioneInVista()', 900);
    assert.match(corpo, /fondoInVistaRicordato !== null && performance\.now\(\) - fondoInVistaRicordatoA < 250/);
    assert.match(corpo, /requestAnimationFrame\(\(\) => \{ fondoInVistaRicordato = null; \}\)/);
    // ⛔ la scadenza a tempo non è ridondante: in una scheda in secondo piano il rAF non arriva
    assert.match(corpo, /fondoInVistaRicordatoA = performance\.now\(\);/);
  };
  controllo(NUDO);
  morde(controllo, NUDO.replace('window.requestAnimationFrame(() => { fondoInVistaRicordato = null; });', ''));
});

test('SPAZIO-CODA-01: lo spazio in coda resta una scrittura sola, con la sua uscita anticipata', () => {
  // la funzione non cambia forma: quello che è cambiato è QUANTE volte la si chiama
  const corpo = attorno(NUDO, 'function aggiornaSpazioCodaConversazione(', 700);
  assert.match(corpo, /if \(spazio === spazioCodaConversazioneUltimo\) return;/);
  assert.match(corpo, /setProperty\('--stream-follow-space'/);
});
