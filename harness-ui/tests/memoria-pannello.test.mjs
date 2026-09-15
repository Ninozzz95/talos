import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const source = (file) => readFile(join(root, file), 'utf8');

/*
 * ⭐⭐⭐ 02/9 — pannello memoria (owner: «pulsanti che liberano la RAM dai
 * processi non critici»). La ricerca ha spostato il progetto rispetto alla
 * richiesta letterale, e questi test tengono fermo lo spostamento.
 */

test('MEMORIA-PANNELLO-08 — il corpo della richiesta di scarico è quello che la rotta accetta', async () => {
  /*
   * ⛔⛔⛔ 02/9 — il pulsante mandava `{}` e la rotta risponde
   * QUERY_INVALID senza `runtimeId`: non avrebbe MAI funzionato. Invisibile
   * nella prova dal vivo perché era disabilitato per un altro difetto.
   * ⛔ `modelId` NON si manda: il server non espone quale modello sia
   * caricato e l'implementazione lo ignora (rotta corretta di conseguenza).
   */
  const app = await source('frontend/src/legacy/app.js');
  assert.match(app, /apiPost\('\/api\/v1\/runtime\/unload', \{ runtimeId: 'llama\.cpp' \}\)/);
});
