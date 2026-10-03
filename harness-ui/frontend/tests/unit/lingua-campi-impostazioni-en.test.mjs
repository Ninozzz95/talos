/*
 * 03/10/2026, corsia S2 della lingua: la tabella dei campi delle Impostazioni (`impostazioni-campi.js`) non scrive più le frasi.
 *   `titolo`, le etichette delle opzioni e i titoli delle sezioni sono getter sul dizionario: in italiano la frase di prima,
 *   identica (le spec e la ricerca la cercano così), in inglese la voce inglese. La ricerca trova un campo in tutte e due.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { CAMPI_IMPOSTAZIONI, SEZIONI_IMPOSTAZIONI } from '../../src/components/impostazioni-campi.js';
import { impostaLingua, t } from '../../src/components/lingua.js';
import { buildSettingsIndex } from '../../src/features/settings/schema.ts';
import { frasiItalianeNelSorgente } from '../../scripts/cancello/testi-a-schermo.mjs';

const campo = (id) => CAMPI_IMPOSTAZIONI.find((c) => c.id === id);

test('LINGUA-CAMPI-EN: titolo, opzioni e sezioni seguono la lingua; in italiano sono le frasi di prima', () => {
  const colore = campo('colorModeSelect');
  assert.equal(colore.titolo, 'Modalità colore');
  assert.deepEqual(colore.opzioni.map(([valore, nome]) => [valore, nome]), [['system', 'Segui il sistema'], ['dark', 'Scuro'], ['light', 'Chiaro']]);
  assert.equal(SEZIONI_IMPOSTAZIONI.find((s) => s.id === 'privacy').titolo, 'Sicurezza e privacy');
  impostaLingua('en');
  try {
    assert.equal(colore.titolo, 'Color mode');
    assert.deepEqual(colore.opzioni.map(([, nome]) => nome), ['Follow the system', 'Dark', 'Light']);
    assert.equal(SEZIONI_IMPOSTAZIONI[0].titolo, 'Appearance and motion');
    const voce = buildSettingsIndex(CAMPI_IMPOSTAZIONI, [], 'en', (x) => t(x)).find((e) => e.id === 'colorModeSelect');
    assert.equal(voce.label, 'Color mode');
    for (const parola of ['Modalità colore', 'Color mode', 'Segui il sistema', 'Follow the system']) assert.ok(voce.terms.includes(parola), parola);
  } finally { impostaLingua('it'); }
});

test('LINGUA-CAMPI-EN AL CONTRARIO: id, valori e limiti restano dati; ogni campo ha le due voci; il sorgente non ha frasi', () => {
  for (const c of CAMPI_IMPOSTAZIONI) {
    assert.match(c.titolo, /\S/u, `${c.id}: titolo`);
    assert.doesNotMatch(c.titolo, /^impostazioni\./u, `${c.id}: mai una chiave grezza`);
    for (const o of c.opzioni || []) assert.doesNotMatch(String(o[1]), /^impostazioni\./u, `${c.id}/${o[0]}: mai una chiave grezza`);
  }
  assert.equal(campo('colorModeSelect').chiave, 'colorMode');
  assert.equal(CAMPI_IMPOSTAZIONI.length, 40);
  const sorgente = readFileSync(new URL('../../src/components/impostazioni-campi.js', import.meta.url), 'utf8');
  assert.deepEqual(frasiItalianeNelSorgente(sorgente, 'impostazioni-campi.js'), []);
  assert.doesNotMatch(sorgente, /"titolo":/u, 'nessun titolo scritto nella tabella');
});
