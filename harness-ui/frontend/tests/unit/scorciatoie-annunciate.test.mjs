import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
  COMBO_GESTITE_ALTROVE,
  COMBO_RISERVATE_AL_BROWSER,
  SCORCIATOIE,
  combinazioniAnnunciate,
  normalizzaCombo,
  scorciatoieSenzaGestore,
} from '../../src/components/scorciatoie.js';

/*
 * ⭐⭐⭐ P0/A punto 2 — 16/09/2026. «A volte il terminale apre una scheda nuova del browser.»
 *
 * Root cause misurata: la palette dei comandi ANNUNCIA «Ctrl T» per «Apri terminale», «Ctrl B»
 * per «Apri browser» e «Ctrl R» per «Apri review», ma `riconosci()` non conosce nessuna delle tre.
 * Chi legge l'etichetta e preme i tasti li consegna al BROWSER: Ctrl+T apre una scheda, Ctrl+B i
 * preferiti, Ctrl+R ricarica la pagina.
 *
 * ⛔ Una guardia c'era già (`SCORCIATOIE-REGISTRO`, 06/09) e non poteva vedere questo: guardava il
 *   REGISTRO, cioè le combinazioni che esistono — mai quelle che l'interfaccia PROMETTE. È la
 *   forma classica «una misura ristretta non vede ciò che non ti aspetti»: la promessa sta nel
 *   markup, non nel registro, e nessuno la leggeva.
 *
 * Ricerca 16/09/2026: Chrome non consegna affatto alla pagina Ctrl+N/Ctrl+T/Ctrl+W su Windows —
 * `preventDefault()` su quelle è inerte per specifica (W3C public-webapps, «browsers MAY ignore
 * calls of preventDefault() when key combinations are important for UI»; Microsoft Learn,
 * «browser default action for Ctrl+P cannot be prevented»). ⇒ Una combinazione così non si
 * "gestisce meglio": non si annuncia.
 */

const TEMPLATE = readFileSync(fileURLToPath(new URL('../../index.template.html', import.meta.url)), 'utf8');

/** Radice finta sul template vero: le unit di questo repo non caricano un DOM. */
function radiceDalTemplate(html) {
  const nodi = [...html.matchAll(/<(kbd|span)\b[^>]*class="[^"]*\btalos-kbd\b[^"]*"[^>]*>([^<]*)<\/\1>/gu)]
    .map((m) => ({ textContent: m[2] }));
  return { nodi, querySelectorAll: () => nodi };
}

test('P0A2-COMBO-NORMALIZZA: «Ctrl T», «⌘T» e «mod T» sono la stessa cosa; senza modificatore non è una combinazione', () => {
  assert.equal(normalizzaCombo('Ctrl T'), 'mod T');
  assert.equal(normalizzaCombo('⌘T'), 'mod T');
  assert.equal(normalizzaCombo('mod T'), 'mod T');
  assert.equal(normalizzaCombo('Ctrl+Shift+M'), 'mod ⇧ M');
  assert.equal(normalizzaCombo('Ctrl ⇧ M'), 'mod ⇧ M');
  assert.equal(normalizzaCombo('Ctrl `'), 'mod `');
  // AL CONTRARIO: ciò che non ha modificatore non è una promessa globale e non va contato
  assert.equal(normalizzaCombo('Esc'), '');
  assert.equal(normalizzaCombo('↑ ↓'), '');
  assert.equal(normalizzaCombo('D'), '');
  assert.equal(normalizzaCombo(''), '');
});

test('P0A2-NESSUNA-PROMESSA-ORFANA: ogni combinazione annunciata nel template ha un gestore vero', () => {
  const orfane = scorciatoieSenzaGestore(radiceDalTemplate(TEMPLATE));
  assert.deepEqual(orfane, [], `combinazioni annunciate e non gestite: ${orfane.join(', ')}`);
});

test('P0A2-NIENTE-COMBINAZIONI-DEL-BROWSER: il template non annuncia combinazioni che il browser non consegna', () => {
  const annunciate = [...combinazioniAnnunciate(radiceDalTemplate(TEMPLATE)).keys()];
  const rubate = annunciate.filter((c) => COMBO_RISERVATE_AL_BROWSER.includes(c));
  assert.deepEqual(rubate, [], `il browser se le prende prima: ${rubate.join(', ')}`);
});

test('P0A2-REGISTRO-E-GESTORE-COINCIDONO: ogni riga del registro è riconosciuta davvero', () => {
  // Il registro DICHIARA; `riconosci` ESEGUE. Se divergono, la palette resta onesta e il tasto no.
  for (const riga of SCORCIATOIE) {
    assert.equal(typeof riga.combo, 'string');
    assert.equal(normalizzaCombo(riga.combo), riga.combo, `combinazione non normalizzata nel registro: ${riga.combo}`);
  }
  // AL CONTRARIO: una combinazione inventata non risulta gestita
  const finta = radiceDalTemplate('<kbd class="talos-kbd">Ctrl J</kbd>');
  assert.deepEqual(scorciatoieSenzaGestore(finta), ['mod J']);
});

test('P0A2-ESENZIONI-DICHIARATE: le combinazioni gestite fuori dal registro sono elencate col perché', () => {
  for (const [combo, perche] of Object.entries(COMBO_GESTITE_ALTROVE)) {
    assert.equal(normalizzaCombo(combo), combo, `esenzione non normalizzata: ${combo}`);
    assert.ok(perche.length > 20, `esenzione senza motivo leggibile: ${combo}`);
  }
});
