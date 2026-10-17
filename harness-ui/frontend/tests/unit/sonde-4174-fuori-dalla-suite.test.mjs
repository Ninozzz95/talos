/*
 * L3-11 (D13, 13/10/2026) — le sonde scritte per il 4174 stanno fuori dalla suite di serie: configurazione + etichetta.
 * Il contratto è in `tests/browser/sonde-4174.mjs`; qui si tiene vero, compreso il verso che morde: una sonda NUOVA che si salta
 * senza il baseURL esterno ma non si chiama `_…-4174.spec.mjs` sfuggirebbe alla configurazione, e la prova lo dice.
 * La corsa vera di `playwright test --list` (con e senza `TALOS_SONDE_4174=1`) è nel rapporto del lotto 3: non sta qui perché la
 * configurazione pretende la `dist` costruita.
 */
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import test from 'node:test';
import { ETICHETTA_SONDA_4174, FILE_SONDE_4174, ignoraSonde4174 } from '../browser/sonde-4174.mjs';

const BROWSER = resolve(import.meta.dirname, '../browser');
const CONFIG = resolve(import.meta.dirname, '../../playwright.config.mjs');
const spec = readdirSync(BROWSER).filter((f) => f.endsWith('.spec.mjs'));
const sonde = spec.filter((f) => FILE_SONDE_4174.test(join(BROWSER, f)));

test('SONDE-4174-01 — i file delle sonde si riconoscono dal nome, e la configurazione li ignora salvo TALOS_SONDE_4174=1', () => {
  assert.deepEqual(sonde.sort(), ['_blocco1-footer-4174.spec.mjs', '_blocco2-resetta-4174.spec.mjs', '_foto-processi-4174.spec.mjs', '_sonda-streaming-4174.spec.mjs']);
  assert.deepEqual(ignoraSonde4174({}), [FILE_SONDE_4174]);
  assert.deepEqual(ignoraSonde4174({ TALOS_SONDE_4174: '1' }), []);
  for (const v of ['0', 'true', 'si', '']) assert.deepEqual(ignoraSonde4174({ TALOS_SONDE_4174: v }), [FILE_SONDE_4174], `«${v}» non è una richiesta esplicita`);
  /* AL CONTRARIO: una prova normale con 4174 nel nome del FILE ma senza il trattino basso davanti non è una sonda */
  assert.equal(FILE_SONDE_4174.test(join(BROWSER, 'piede-4174.spec.mjs')), false);
  assert.equal(FILE_SONDE_4174.test('C:\\x\\tests\\browser\\_nuova-4174.spec.mjs'), true, 'anche coi separatori di Windows');
  const config = readFileSync(CONFIG, 'utf8');
  assert.match(config, /testIgnore:\s*\[[^\]]*\.\.\.ignoraSonde4174\(\)\]/u, 'la configurazione usa il contratto in testIgnore (non in grepInvert, che la riga di comando sostituisce)');
});

test('SONDE-4174-02 — ogni prova di una sonda porta l’etichetta nel titolo', () => {
  for (const f of sonde) {
    const testo = readFileSync(join(BROWSER, f), 'utf8');
    const titoli = [...testo.matchAll(/^\s*test\(\s*(['`])(.*?)\1/gmu)].map((m) => m[2]);
    assert.ok(titoli.length > 0, `${f}: nessuna prova trovata`);
    for (const t of titoli) assert.ok(t.startsWith(`${ETICHETTA_SONDA_4174} `), `${f}: «${t}» senza ${ETICHETTA_SONDA_4174}`);
  }
});

test('SONDE-4174-03 — AL CONTRARIO: nessuna prova che si salta senza il baseURL esterno vive fuori dai file delle sonde', () => {
  const sfuggite = spec.filter((f) => !sonde.includes(f)
    && /test\.skip\(\s*!process\.env\.TALOS_HARNESS_UI_BASE_URL/u.test(readFileSync(join(BROWSER, f), 'utf8')));
  assert.deepEqual(sfuggite, [], 'una sonda dell’ambiente esterno con un altro nome: rinominala `_<nome>-4174.spec.mjs`');
});
