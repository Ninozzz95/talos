/*
 * ⛔ REVISIONE AVVERSARIA del portachiavi di un modulo dell'ospite (bugfixer, 14/10/2026 sera) — `feat/portachiavi-modulo`,
 * commit `e8101f91b`.
 *
 * Prova ROSSA apposta. Il contratto dice «sincrono», ma lo si controlla solo su `creaPortachiavi` (una promessa ⇒
 * KEYRING_MODULE_INVALID), non sui TRE METODI. Un modulo i cui `get/set/remove` sono `async` — la forma naturale di un ponte verso
 * il lato Kotlin di Android — passa il controllo all'avvio, e poi: `get` torna una promessa ⇒ «non è una stringa» ⇒ `null`, cioè
 * NESSUNA chiave, in silenzio; `set` non è atteso ⇒ un rifiuto della scrittura diventa un `unhandledRejection` e la persona legge
 * «salvata». Non è «chiuso per difetto»: è l'apertura più silenziosa possibile.
 * Rapporto: `handoff-talos-2026-09-27/bugfixer/RAPPORTO-REVISIONE-GOAL-G3-2026-10-14.md`, sezione «Portachiavi da modulo».
 */
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { creaAdattatorePortachiaviDaModulo } from '../src/adattatore-keyring.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

test('MODULO-REV-01 (S3) — a module whose get/set/remove are ASYNC is accepted at startup, and then every key reads as ABSENT', async (t) => {
  const cartella = mkdtempSync(join(tmpdir(), 'talos-portachiavi-modulo-rev-'));
  t.after(() => rimuoviCartellaDiProva(cartella));
  const percorso = join(cartella, 'ponte-android.mjs');
  writeFileSync(percorso, [
    'const valori = new Map();',
    'export function creaPortachiavi() {',
    '  return {',
    '    async get(s, a) { return valori.get(`${s}:${a}`) ?? null; },',
    '    async set(s, a, v) { valori.set(`${s}:${a}`, v); },',
    '    async remove(s, a) { valori.delete(`${s}:${a}`); },',
    '  };',
    '}',
  ].join('\n'), 'utf8');
  let adattatore = null;
  let rifiuto = null;
  try { adattatore = await creaAdattatorePortachiaviDaModulo(percorso, {}); } catch (errore) { rifiuto = errore; }
  if (rifiuto) return; // ⇐ ciò che ci si aspetta da «chiuso per difetto»: rifiutato all'avvio col suo codice
  adattatore.set('talos-harness-provider', 'zai', 'chiave-salvata-dalla-persona');
  await new Promise((r) => setImmediate(r));
  const letta = adattatore.get('talos-harness-provider', 'zai');
  assert.equal(letta, 'chiave-salvata-dalla-persona', `the module was accepted, the key was «saved», and reading it gives ${JSON.stringify(letta)}`);
});
