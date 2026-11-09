/*
 * E1, revisione del Desktop D6 e D7 con i testi del Frontend (04/11/2026 14:33), la parte che si prova senza browser.
 * La carta si disegna dentro `legacy/app.js`, che in Node non si importa: qui le frasi esatte nelle due lingue e i punti del
 * sorgente che le usano. Il comportamento vero (una nota sola, il piede, la ricarica) lo provano E1-CARTA-05/06/07 in
 * `tests/browser/carta-dal-testo.spec.mjs`.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { TESTI } from '../../src/i18n/testi/index.js';

const APP = readFileSync(new URL('../../src/legacy/app.js', import.meta.url), 'utf8');
const ramoEmulata = (() => {
  const i = APP.indexOf("scheda.pulsanti.sessione.textContent = tr('chat.approval.forThisToolSession');");
  assert.ok(i > -1, 'premessa: il ramo della carta emulata esiste');
  return APP.slice(i, APP.indexOf('} else scheda.pulsanti.sessione.remove();', i));
})();

test('E1-FE-01 (D6): la nota ha le frasi del Frontend, parola per parola, in italiano e in inglese', () => {
  assert.equal(TESTI.it['chat.approval.emulated.note'], 'Questo modello non ha strumenti propri: le azioni le fa TALOS, e prima di ognuna te lo chiede.');
  assert.equal(TESTI.en['chat.approval.emulated.note'], 'This model has no tools of its own: TALOS carries out its actions and asks you before each one.');
});

test('E1-FE-02 (D7): sulla carta emulata il piede dice la sessione; la frase è quella già usata dal segreto consentibile', () => {
  assert.equal(TESTI.it['app.approval.appliesSession'], 'Vale per tutta la sessione');
  assert.equal(TESTI.en['app.approval.appliesSession'], 'Applies to the whole session');
  assert.match(ramoEmulata, /\.talos-approval__foot-note'\)[^\n]*tr\('app\.approval\.appliesSession'\)/u);
  // al contrario: la carta del testo normale non passa da quel ramo e tiene «una volta» (il piede di partenza di creaApprovazione)
  assert.match(APP, /nota: cartaRicerca \? tr\('appSettings\.card\.alsoInFullAccess'\) : tr\('app\.approval\.appliesOnce'\)/u);
});

test('E1-FE-03 (D6): la nota entra prima della carta, solo per la emulata, e la guardia è la colonna (la storia), non una variabile della pagina', () => {
  const i = APP.indexOf("if (emulata && !colonnaConversazione(ROOT())?.querySelector('[data-emulata-nota]')) {");
  assert.ok(i > -1, 'la guardia guarda la colonna rifatta dagli eventi');
  const blocco = APP.slice(i, APP.indexOf('nellaChat(article);', i) + 'nellaChat(article);'.length);
  assert.match(blocco, /creaNotaSistema\(\{[^}]*titolo: tr\('chat\.approval\.emulated\.note'\)/u);
  assert.match(blocco, /notaEmulata\.dataset\.emulataNota = 'si';\s+nellaChat\(notaEmulata\);\s+\}\s+nellaChat\(article\);/u, 'prima la nota, poi la carta');
  // al contrario: nessuno stato della nota fuori dalla colonna
  assert.doesNotMatch(APP, /(?:let|var)\s+\w*[Nn]otaEmulata\w*\s*=/u);
  assert.doesNotMatch(APP, /state\.\w*[Nn]otaEmulata/u);
});
