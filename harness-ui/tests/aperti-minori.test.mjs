import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const app = await readFile(join(root, 'frontend/src/legacy/app.js'), 'utf8');

/**
 * Estrae una funzione del monolite (IIFE senza export) e la istanzia con uno
 * `state` finto: si prova il COMPORTAMENTO, non solo il testo.
 * `deps`: nomi di altre funzioni del monolite che il corpo chiama — il loro
 * sorgente viene incluso PRIMA, altrimenti `new Function` le vedrebbe come
 * `ReferenceError` (nessuno scope esterno oltre `state`/`Date`).
 */
function funzioneDalMonolite(nome, { state = {}, Date: DateFinto = Date, deps = [] } = {}) {
  const estrai = (n) => {
    const inizio = app.indexOf(`  function ${n}(`);
    assert.ok(inizio > 0, `${n} deve esistere in app.js`);
    const fine = app.indexOf('\n  }\n', inizio);
    return app.slice(inizio, fine + 4);
  };
  const sorgente = deps.map(estrai).join('\n') + estrai(nome);
  // eslint-disable-next-line no-new-func
  return new Function('state', 'Date', `${sorgente}\nreturn ${nome};`)(state, DateFinto);
}

/*
 * ⭐ 04/9 — W1-12, gli «aperti minori» della mappa: sottotitolo del titolo
 * sessione, riga pendente evidenziata, meta della nota impostazioni, nomi
 * unici fra sessioni vive, ripresa con età e stima.
 */
test('W1-12 — nomeUnicoSessione: suffisso -2/-3 solo contro sessioni VIVE con quel nome; le concluse non contano; se stessa esclusa', () => {
  const state = { sessionSelection: { available: new Map([
    ['a', { sessionId: 'a', nome: 'refactor', conclusa: false }],
    ['b', { sessionId: 'b', nome: 'refactor-2', conclusa: false }],
    ['c', { sessionId: 'c', nome: 'vecchia', conclusa: true }],
  ]) } };
  const nomeUnicoSessione = funzioneDalMonolite('nomeUnicoSessione', { state });
  assert.deepEqual(nomeUnicoSessione('refactor', 'nuova'), { nome: 'refactor-3', cambiato: true });
  assert.deepEqual(nomeUnicoSessione('vecchia', 'nuova'), { nome: 'vecchia', cambiato: false }, 'AL CONTRARIO: un nome di una sessione conclusa può tornare');
  assert.deepEqual(nomeUnicoSessione('refactor', 'a'), { nome: 'refactor', cambiato: false }, 'AL CONTRARIO: rinominare se stessa con il proprio nome non è un doppione');
  assert.deepEqual(nomeUnicoSessione('   ', 'x'), { nome: '', cambiato: false });
});

test('W1-12 — formattaEta e stimaTokenRipresa: numeri veri o «non registrato», mai uno zero inventato', () => {
  const adesso = Date.parse('2026-09-04T10:00:00Z');
  class DateFinto extends Date { static now() { return adesso; } static parse(s) { return Date.parse(s); } }
  const formattaEta = funzioneDalMonolite('formattaEta', { Date: DateFinto });
  assert.equal(formattaEta('2026-09-04T09:59:20Z'), '40 s');
  assert.equal(formattaEta('2026-09-04T09:15:00Z'), '45 min');
  assert.equal(formattaEta('2026-09-04T07:00:00Z'), '3 h');
  assert.equal(formattaEta('2026-08-30T10:00:00Z'), '5 g');
  assert.equal(formattaEta(undefined), null, 'AL CONTRARIO: senza data niente età');
  const stimaTokenRipresa = funzioneDalMonolite('stimaTokenRipresa');
  assert.equal(stimaTokenRipresa(null), 'consumo non registrato');
  assert.equal(stimaTokenRipresa({ prompt_tokens: 0, completion_tokens: 0 }), 'consumo non registrato');
  assert.equal(stimaTokenRipresa({ prompt_tokens: 8000, completion_tokens: 400 }), 'circa 8.4k token (stima)');
  assert.equal(stimaTokenRipresa({ prompt_tokens: 512 }), 'circa 512 token (stima)');
});

