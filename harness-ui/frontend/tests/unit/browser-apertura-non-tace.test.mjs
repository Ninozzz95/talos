import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/*
 * ⭐⭐⭐ 11/09/2026 — «IL CAMPO URL DEL BROWSER NON APRE NESSUNA SCHEDA».
 *
 * ## Che cosa ho trovato riproducendo, e perché questa prova esiste
 *
 * La segnalazione diceva: si scrive `example.org` nel campo indirizzo del Browser, si preme
 * Invio, e non nasce nessuna scheda, nessuna cornice, nessun avviso. Riprodotto su un banco mio
 * (porta privata, mai il 4174) su DUE build — quella corrente e quella che il server dell'owner
 * stava servendo — con la tastiera vera e con gli eventi sintetici della sonda originale:
 *
 *   | come si preme Invio                              | schede | cornice |
 *   | ------------------------------------------------ | ------ | ------- |
 *   | press('Enter') (tastiera vera)                   | 1      | 1       |
 *   | KeyboardEvent('keydown', { key: 'Enter' })       | 1      | 1       |
 *   | KeyboardEvent('keydown') — SENZA `key`           | **0**  | **0**   |
 *
 * ⇒ Il prodotto apriva la scheda in tutti i casi in cui l'Invio era davvero un Invio. L'unica
 *   riga che riproduce il sintomo è la terza, cioè una SONDA che non dichiara il tasto.
 *
 * ## Ma il difetto che rendeva possibile quella segnalazione era vero, ed era il SILENZIO
 *
 * `azioni.apri` chiamava `void apriPaginaVivaBrowser(url)`. Con `void`, qualunque rottura fuori
 * dal `try` interno diventa una promessa rifiutata che nessuno ascolta: nessuna scheda, nessun
 * avviso, solo una riga in console che la persona non apre mai. Misurato A/B rompendo il disegno
 * della scheda (`Document.prototype.createElementNS` che lancia), stessa pagina, stesso gesto:
 *
 *   | build                          | schede | avviso a schermo                              |
 *   | ------------------------------ | ------ | --------------------------------------------- |
 *   | prima (con `void`)             | 0      | **nessuno** — l'errore restava solo in console |
 *   | dopo (con `catch` + `avvisa`)  | 0      | «guasto simulato nel disegno della scheda»     |
 *
 * Questa prova tiene ferme le condizioni che rendono impossibile il ritorno del silenzio.
 * Si legge il SORGENTE perché la regia vive dentro `creaBrowser`, che vuole tutto il DOM del
 * mockup, e queste unit non caricano jsdom (stessa scelta di `browser-torna-alla-pagina`).
 */

const BROWSER = readFileSync(new URL('../../src/components/browser.js', import.meta.url), 'utf8');
const APP = readFileSync(new URL('../../src/legacy/app.js', import.meta.url), 'utf8');
const senzaCommenti = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
const BROWSER_NUDO = senzaCommenti(BROWSER);
const APP_NUDO = senzaCommenti(APP);

test('INVIO: il campo indirizzo chiede l’apertura, e un testo che non è un indirizzo viene detto', () => {
  assert.match(BROWSER_NUDO, /e\.key === 'Enter'[\s\S]{0,200}urlApribile\(el\.url\.value\)/);
  assert.match(BROWSER_NUDO, /azioni\.apri\?\.\(u\)/);
  assert.match(BROWSER_NUDO, /mostraAvviso\(t\('Non è un indirizzo/);
});

test('AVVISA: il componente offre a chi apre un posto dove dire perché la scheda non è nata', () => {
  assert.match(BROWSER_NUDO, /avvisa\(testo\) \{ mostraAvviso\(testo\); \}/);
});

test('APRI: la promessa dell’apertura NON si butta via — si ascolta, e il motivo va a schermo', () => {
  assert.match(APP_NUDO, /apri: \(url\) => \{[\s\S]{0,260}apriPaginaVivaBrowser\(url\)\.catch\([\s\S]{0,220}browserUi\?\.avvisa\(/);
  assert.match(APP_NUDO, /rileggi: \(s\) => \{[\s\S]{0,400}apriPaginaVivaBrowser\(s\.url, s\.id\)\.catch\([\s\S]{0,220}browserUi\?\.avvisa\(/);
});

test('AL CONTRARIO: nessuna apertura del Browser riparte con «void» — è la forma che inghiottiva', () => {
  assert.equal(
    (APP_NUDO.match(/void apriPaginaVivaBrowser\(/g) || []).length,
    0,
    'una chiamata con `void` torna a scartare il motivo: il campo accetta e lo schermo tace',
  );
});

test('LA PROVA MORDE: sulle stesse righe mutate, le guardie diventano rosse', () => {
  const mutato = APP_NUDO.replace('apriPaginaVivaBrowser(url).catch(', 'void apriPaginaVivaBrowser(url); (');
  assert.doesNotMatch(mutato, /apri: \(url\) => \{[\s\S]{0,260}apriPaginaVivaBrowser\(url\)\.catch\(/);
  assert.equal((mutato.match(/void apriPaginaVivaBrowser\(/g) || []).length, 1);
  const senzaAvvisa = BROWSER_NUDO.replace('avvisa(testo) { mostraAvviso(testo); }', 'nulla(testo) { void testo; }');
  assert.doesNotMatch(senzaAvvisa, /avvisa\(testo\) \{ mostraAvviso\(testo\); \}/);
});
