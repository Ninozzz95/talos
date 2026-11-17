/*
 * ⛔ Decisione 374, giro 8 (giudice v1621, punto c): l'unione con la candidata edba3aee8 ha avuto due conflitti VERI negli elenchi dei
 *   codici d'errore (`http-app.mjs` tre blocchi, `frontend/src/i18n/testi/errori.js` due blocchi), risolti tenendo tutti e due i lati.
 *   Una chiave ripetuta in un oggetto JavaScript non dà errore: l'ultima vince in silenzio, e un codice ripetuto in un `Set` sparisce.
 *   Questa prova legge il SORGENTE (non l'oggetto già costruito, dove il doppione non si vede più) e vuole ogni codice una volta sola
 *   in ognuno dei cinque elenchi, più i codici della 374 e della candidata presenti dappertutto.
 * Concorrenti: codex codex-rs/app-server/src/error_code.rs:3-6 (ogni codice è una costante con nome, scritta una volta sola).
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const sorgente = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8');
const app = sorgente('../src/http-app.mjs');
const dizionario = sorgente('../frontend/src/i18n/testi/errori.js');

/** Il testo fra `inizio` e la prima chiusura `fine` dopo di lui. */
function blocco(testo, inizio, fine) {
  const i = testo.indexOf(inizio);
  assert.ok(i >= 0, `manca ${inizio}`);
  const j = testo.indexOf(fine, i + inizio.length);
  assert.ok(j > i, `manca la chiusura di ${inizio}`);
  return testo.slice(i + inizio.length, j);
}
const senzaCommenti = (t) => t.split('\n').map((r) => r.replace(/\s\/\/.*$/u, '')).join('\n');
const doppioni = (elenco) => [...new Set(elenco.filter((c, i) => elenco.indexOf(c) !== i))];

const insieme = [...senzaCommenti(blocco(app, 'const API_ERROR_CODES = new Set([', '\n]);')).matchAll(/'([A-Z][A-Z0-9_]*)'/gu)].map((m) => m[1]);
const stati = [...senzaCommenti(blocco(app, 'const STATUS_BY_CODE = Object.freeze({', '\n});')).matchAll(/^\s*([A-Z][A-Z0-9_]*)\s*:/gmu)].map((m) => m[1]);
const messaggi = [...senzaCommenti(blocco(app, 'export const MESSAGE_BY_CODE = Object.freeze({', '\n});')).matchAll(/^\s*([A-Z][A-Z0-9_]*)\s*:/gmu)].map((m) => m[1]);
const it = [...blocco(dizionario, '\n  it: {', '\n  en: {').matchAll(/^\s*'([A-Z][A-Z0-9_]*)\.message'\s*:/gmu)].map((m) => m[1]);
const en = [...blocco(dizionario, '\n  en: {', '\n};').matchAll(/^\s*'([A-Z][A-Z0-9_]*)\.message'\s*:/gmu)].map((m) => m[1]);
const NUOVI = ['COMPUTER_USE_FILE_NOT_SET_ASIDE', 'PUBLIC_CATALOG_SETTINGS_UNAVAILABLE', 'PUBLIC_CATALOG_LOCKED'];

for (const [nome, elenco] of [['API_ERROR_CODES', insieme], ['STATUS_BY_CODE', stati], ['MESSAGE_BY_CODE', messaggi], ['errori.js it', it], ['errori.js en', en]]) {
  test(`374 g8 (c): ogni codice d'errore compare una volta sola in ${nome}`, () => {
    assert.ok(elenco.length > 50, `${nome}: letti solo ${elenco.length} codici, la lettura del sorgente non regge`);
    assert.deepEqual(doppioni(elenco), [], `${nome}: codici ripetuti`);
  });
}

test('374 g8 (c): i codici dei due lati dell unione ci sono in tutti e cinque gli elenchi', () => {
  for (const c of NUOVI) {
    assert.ok(insieme.includes(c), `${c} in API_ERROR_CODES`);
    assert.ok(stati.includes(c), `${c} in STATUS_BY_CODE`);
    assert.ok(messaggi.includes(c), `${c} in MESSAGE_BY_CODE`);
    assert.ok(it.includes(c), `${c} nel dizionario italiano`);
    assert.ok(en.includes(c), `${c} nel dizionario inglese`);
  }
});
