/*
 * «Segnala un problema» dal menu nativo (owner 29/10/2026): l'etichetta nella lingua del sistema e il copione che la voce manda alla
 *   pagina. Il menu vero si prova con Electron nella prova del guscio; qui le due parti pure, e che `main.mjs` le usi davvero.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { EVENTO_SEGNALA, copioneSegnala, etichettaSegnala } from '../segnalazione.mjs';

test('SEGNALA-MENU-01 — inglese di serie, italiano col sistema in italiano', () => {
  assert.equal(etichettaSegnala('it-IT'), 'Segnala un problema…');
  assert.equal(etichettaSegnala('it'), 'Segnala un problema…');
  assert.equal(etichettaSegnala('en-US'), 'Report a problem…');
  assert.equal(etichettaSegnala('itx'), 'Report a problem…');
  assert.equal(etichettaSegnala(undefined), 'Report a problem…');
});

test('SEGNALA-MENU-02 — il copione lancia l\'evento che la pagina ascolta, e la voce sta nel menu della finestra', () => {
  assert.equal(EVENTO_SEGNALA, 'talos:segnala-problema');
  const lanciati = [];
  const window = { dispatchEvent: (e) => lanciati.push(e.type) };
  new Function('window', 'CustomEvent', copioneSegnala())(window, class { constructor(type) { this.type = type; } });
  assert.deepEqual(lanciati, ['talos:segnala-problema']);
  const main = readFileSync(new URL('../main.mjs', import.meta.url), 'utf8');
  assert.match(main, /label: etichettaSegnala\(app\.getLocale\(\)\)/u);
  assert.match(main, /executeJavaScript\(copioneSegnala\(\)/u);
});

test('SEGNALA-MENU-03 — il modulo entra nel pacchetto (senza, l\'app installata non partirebbe: `main.mjs` lo importa)', () => {
  const pacchetto = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  assert.ok(pacchetto.build.files.includes('segnalazione.mjs'));
});
