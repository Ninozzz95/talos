/*
 * ⛔ NIENTE NOMI TECNICI NELLA UI (regola owner 04/09) — e il difetto (10) visto nelle foto del 24/09: il piede del
 *   dettaglio di una nota diceva «Le note vivono in .notes-store/». Lo stesso nelle Attività e nell'Officina. Una cartella
 *   DATI interna non è qualcosa che la persona usa: si dice cosa vale (per tutti i progetti), non dove sta.
 * ⛔ Resta nominabile un file di configurazione che la persona MODIFICA (`.harness-ui-mcp.json`, `.harness-ui-hooks.json`):
 *   lì il nome è l'istruzione. Questa guardia guarda solo le cartelle dei magazzini.
 * Guarda il TESTO a schermo del modello (commenti e script tolti) e le stringhe delle sezioni.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const CARTELLE_DATI = /\.(?:notes|tasks|memory|sessions|tool-forge|research)-store\b|\.harness-ui-(?:library|research)\b/u;

test('UI-NO-DATA-FOLDER-01 — il modello HTML non mostra il nome di una cartella dati interna', () => {
  const html = readFileSync(new URL('../../index.template.html', import.meta.url), 'utf8')
    .replace(/<!--[\s\S]*?-->/gu, '')
    .replace(/<script[\s\S]*?<\/script>/giu, '');
  const testo = html.replace(/<[^>]+>/gu, ' ');
  const trovate = testo.match(new RegExp(CARTELLE_DATI.source, 'gu')) ?? [];
  assert.deepEqual(trovate, [], `a schermo: ${trovate.join(', ')}`);
});

test('UI-NO-DATA-FOLDER-02 — le stringhe delle sezioni (piede e stato vuoto) non nominano una cartella dati', () => {
  const sorgente = readFileSync(new URL('../../src/components/sezioni-adattatori.js', import.meta.url), 'utf8');
  /* Solo le stringhe fra apici, fuori dai commenti: i commenti che raccontano il difetto restano. */
  const senzaCommenti = sorgente.replace(/\/\*[\s\S]*?\*\//gu, '').replace(/(^|[^:])\/\/.*$/gmu, '$1');
  const stringhe = senzaCommenti.match(/'(?:[^'\\\n]|\\.)*'|`(?:[^`\\]|\\.)*`/gu) ?? [];
  const cattive = stringhe.filter((s) => CARTELLE_DATI.test(s));
  assert.deepEqual(cattive, []);
});

test('UI-NO-DATA-FOLDER-03 — AL CONTRARIO: la guardia riconosce la frase di prima', () => {
  assert.equal(CARTELLE_DATI.test('Le note vivono in .notes-store/'), true);
  assert.equal(CARTELLE_DATI.test('Gli attrezzi forgiati vivono in .tool-forge-store/.'), true);
  assert.equal(CARTELLE_DATI.test('Server dichiarati in .harness-ui-mcp.json'), false, 'un file di configurazione resta nominabile');
});
