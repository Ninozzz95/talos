import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { senzaCommentiJs } from '../../scripts/cancello/riferimenti-morti.mjs';

/*
 * ⭐⭐⭐ I QUATTRO RESIDUI DELL'11/09/2026, e il cancello che impedisce che tornino.
 *
 * Tutti e quattro erano difetti SILENZIOSI: nessun errore, nessun test rosso, niente in console.
 * Un cancello che li guarda dal testo dei sorgenti costa millisecondi e li avrebbe presi tutti.
 *
 * ⛔ Ogni prova ha la sua metà AL CONTRARIO su una fixture col difetto dentro: un controllo mai
 *   messo alla prova contro il difetto che dice di cercare non si sa se lo prende davvero — è la
 *   lezione del cancello semantico che per mesi non aveva respinto niente.
 */

const radice = fileURLToPath(new URL('../../', import.meta.url));
const leggi = (relativo) => readFileSync(`${radice}${relativo}`, 'utf8');

/** Le soglie di viewport scritte a mano nel JavaScript: `window.innerWidth <= 1040` e simili. */
export function soglieScritteAMano(js) {
  const codice = senzaCommentiJs(js);
  return [...codice.matchAll(/innerWidth\s*(?:<=|>=|<|>)\s*(\d{3,4})/g)].map((m) => Number(m[1]));
}

test('1 · nessuna soglia di viewport scritta a mano in app.js: la decide il foglio', () => {
  /*
   * La colonna dei dettagli sparisce a 1240 e la barra delle sessioni a 860 (`styles/index.css`,
   * sezione 14). Il JavaScript ne aveva UNA sola, 1040, in tredici punti: fra 1041 e 1240 px il
   * pulsante Dettagli collassava una colonna già invisibile e SALVAVA quello stato. Adesso legge
   * `--talos-inspector-flottante` / `--talos-sidebar-flottante`, che le due media query accendono.
   */
  assert.deepEqual(soglieScritteAMano(leggi('src/legacy/app.js')), []);
});

test('1 · AL CONTRARIO — il controllo riconosce una soglia rimessa a mano', () => {
  assert.deepEqual(soglieScritteAMano('if (window.innerWidth <= 1040) apri();'), [1040]);
  assert.deepEqual(soglieScritteAMano('const a = window.innerWidth > 1240;'), [1240]);
  /* e NON accusa chi è sano: un commento che cita la vecchia soglia, e i conti sulla larghezza */
  assert.deepEqual(soglieScritteAMano('/* qui c\'era window.innerWidth <= 1040 */'), []);
  assert.deepEqual(soglieScritteAMano('const max = window.innerWidth - sidebar - 520;'), []);
});

test('1 · le due bandierine esistono nel foglio, spente fuori e accese dentro la loro media query', () => {
  const css = leggi('src/styles/index.css');
  /* Il valore di riposo, fuori da qualunque media query. */
  assert.match(css, /:root\{--talos-inspector-flottante:0; --talos-sidebar-flottante:0\}/);
  /* E l'accensione DENTRO la media query che fa il lavoro: il numero vive lì, e in un posto solo. */
  const dentro = (larghezza, bandierina) => {
    const blocco = css.match(new RegExp(`@media \\(max-width:${larghezza}px\\)\\{([^@]*?)\\n`, 's'));
    assert.ok(blocco, `manca la media query a ${larghezza}px`);
    assert.ok(blocco[1].includes(`--${bandierina}:1`), `la media query a ${larghezza}px non accende --${bandierina}`);
  };
  dentro(1240, 'talos-inspector-flottante');
  dentro(860, 'talos-sidebar-flottante');
});

test('2 · la colonna destra non ha più intestazione, e le vie di chiusura restano cablate', () => {
  /*
   * ⛔⛔ 18/09/2026 — QUESTA PROVA HA CAMBIATO SOGGETTO, NON SI È ALLENTATA.
   * Fino a ieri pretendeva il CONTRARIO: che `#chiudiDettagli` esistesse nel template con
   * `data-close-panel`, perché era l'unico pulsante di chiusura e senza quell'attributo non faceva
   * niente (11/09). L'owner ha tolto l'intestazione intera della colonna destra — sopracciglio
   * «Sessione», titolo della sessione e X — e con lei il pulsante. Il verso che conta adesso è che
   * quell'intestazione **non torni** per sbaglio, e che le vie di chiusura rimaste siano davvero
   * cablate: il pulsante «Dettagli» della testata della chat (la delega su
   * `.talos-topbar__actions [data-azione]`), il velo ed Esc.
   */
  const html = leggi('index.template.html');
  assert.ok(!/talos-inspector__head/.test(html), "l'intestazione della colonna destra è tornata nel template");
  assert.ok(!/id="chiudiDettagli"/.test(html), 'la X della colonna destra è tornata nel template');
  assert.match(html, /data-azione="dettagli"/, 'manca il pulsante «Dettagli» della testata della chat: la colonna non si chiuderebbe più da lì');
  assert.match(leggi('src/legacy/app.js'), /\.talos-topbar__actions \[data-azione\]/, 'la delega che fa funzionare il pulsante «Dettagli» non c\'è più');
});

test('2 · AL CONTRARIO — un template con l\'intestazione viene riconosciuto', () => {
  const finto = '<div class="talos-inspector__head"><span class="talos-eyebrow">Sessione</span></div>';
  assert.ok(/talos-inspector__head/.test(finto), 'la fixture con la testata deve risultare con la testata');
});

test('3 · in app.js non restano stili in linea che il foglio dice già', () => {
  /*
   * Uno stile in linea pesa 1-0-0-0 e batte qualunque regola del foglio: finché c'erano, le regole
   * scritte nel foglio erano inerti — scritte e senza effetto. Misurato prima di toglierli: la
   * geometria non cambia di un pixel (stessa `x/y/w/h` per tutte e cinque le schede, 1440 e 1024,
   * tema chiaro e scuro), e dopo la rimozione una regola nuova del foglio MORDE.
   */
  const codice = senzaCommentiJs(leggi('src/legacy/app.js'));
  for (const doppione of [
    /\.style\.flexWrap\s*=/, /\.style\.flexShrink\s*=/, /\.style\.rowGap\s*=/,
    /bottone\.style\.flex\s*=/, /footerNote\.style\./, /policyGate\.style\./,
  ]) assert.ok(!doppione.test(codice), `stile in linea rimasto: ${doppione}`);
  /* e le regole corrispondenti ci sono davvero nel foglio, altrimenti la rimozione toglie e basta */
  const foglio = leggi('src/styles/foglio-monolite.css');
  assert.match(foglio, /\.model-picker-sources\{[^}]*flex-wrap:\s*wrap/);
  assert.match(foglio, /\.model-picker-sources\{[^}]*flex-shrink:\s*0/);
  assert.match(foglio, /\.model-picker-sources\{[^}]*row-gap:\s*2px/);
  assert.match(foglio, /\.model-picker-source\{[^}]*flex:\s*0 0 auto/);
  assert.match(foglio, /\.workspace-chooser-help\.talos-grow\{[^}]*margin-top:\s*0/);
  assert.match(foglio, /\.workspace-chooser-help\{[^}]*color:\s*var\(--text-2\)/);
  assert.match(foglio, /\.workspace-chooser-policy-gate\{[^}]*color:\s*var\(--text-2\)/);
});

test('4 · BC-19 — il velo d\'avvio prende i colori dai token, e il ponte stampa il tema col timbro', () => {
  /*
   * Il velo conosceva due cose su quattordici (chiaro/scuro): con `terminal` salvato dipingeva
   * l'oro di calm su un fondo di calm, e la app dietro è verde su quasi-nero — cioè il velo che
   * esiste per non far vedere un lampo ne produceva uno suo allo scoprirsi.
   */
  const html = leggi('index.template.html');
  assert.match(html, /#talosAvvio\{[^}]*background-color:var\(--talos-background, #1e1f22\)/);
  assert.match(html, /:root\[data-theme="light"\] #talosAvvio\{background-color:var\(--talos-background, #ece9e2\)/);
  assert.match(html, /:root\[data-theme="light"\] #talosAvvio \.avvio-parola\{color:var\(--talos-text, #2b2a27\)\}/);
  const avvio = leggi('src/avvio.js');
  assert.match(avvio, /setAttribute\('data-talos-theme', tema\)/);
  /* ⛔ Il timbro: senza, il velo dipingerebbe un tema che la app poi butta (residuo dormiente). */
  assert.match(avvio, /themePresetVersione === VERSIONE_SCELTA/);
  assert.match(avvio, /var VERSIONE_SCELTA = 2;/);
  /* e i quattordici id devono restare gli stessi di app.js: un tema fuori lista non ha semi in CSS */
  const daAvvio = (avvio.match(/var TEMI = \[([^\]]*)\]/) || [, ''])[1].match(/'([a-z]+)'/g) || [];
  const daApp = (leggi('src/legacy/app.js').match(/const TALOS_THEME_IDS = \[([^\]]*)\]/) || [, ''])[1].match(/'([a-z]+)'/g) || [];
  assert.deepEqual(daAvvio, daApp, 'i temi del ponte d\'avvio e quelli della app devono coincidere');
});
