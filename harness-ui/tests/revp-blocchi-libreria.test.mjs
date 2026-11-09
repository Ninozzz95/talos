/*
 * Review P (04/11/2026) of the review J cures on "Save to Library" for live blocks (D5).
 * REVP-02: an OLD version that cannot be read (EACCES, EPERM, EBUSY: antivirus, OneDrive lock) must not block every later save of
 *   the same block. Before D5 only the last version was read and the save went through; voceDelBlocco (D7) already skips it.
 * REVP-06: the same text in two versions (a restore, an artifact_update repeating a text): the MOST RECENT one wins, as on the PC.
 */
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { impronta } from '../src/blocchi/impronta.mjs';
import { salvaBloccoInLibreria, voceDelBlocco } from '../src/blocchi/in-libreria.mjs';
import { aggiungiVersione } from '../src/library-store.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

const FIXTURE = (nome) => readFileSync(new URL(`./fixtures/blocchi/${nome}`, import.meta.url), 'utf8').trimEnd();
const TABELLA = FIXTURE('01-tabella.txt');
const TABELLA_2 = TABELLA.replace('["Marzo"]', '["Marzo", 1500]');
const TABELLA_3 = TABELLA.replace('980.5', '981');

function cartella(t) {
  const dati = mkdtempSync(join(tmpdir(), 'talos-rev-p-'));
  t.after(() => rimuoviCartellaDiProva(dati));
  return dati;
}

for (const code of ['EACCES', 'EPERM', 'EBUSY']) {
  test(`REVP-02 (D5, regression) — an OLD unreadable version (${code}) does not stop a new text of the same block from being saved`, async (t) => {
    const dati = cartella(t);
    const v1 = await salvaBloccoInLibreria({ cartella: dati, testo: TABELLA, sessionId: 'sess-1' });
    await salvaBloccoInLibreria({ cartella: dati, testo: TABELLA_2, sessionId: 'sess-1' });
    const vecchia = /[\\/]versioni[\\/]1$/u;
    const readFileFn = async (percorso, ...resto) => {
      if (vecchia.test(String(percorso))) throw Object.assign(new Error(`fake ${code}`), { code });
      return readFile(percorso, ...resto);
    };
    const esito = await salvaBloccoInLibreria({ cartella: dati, testo: TABELLA_3, sessionId: 'sess-1' }, { readFileFn });
    assert.equal(esito.id, v1.id);
    assert.equal(esito.versione, 3);
    assert.equal(esito.totale, 3);
    assert.equal(esito.nuova, true);
    /* the readable version with the same text is still found: v2 is not written twice */
    const di = await salvaBloccoInLibreria({ cartella: dati, testo: TABELLA_2, sessionId: 'sess-1' }, { readFileFn });
    assert.deepEqual([di.versione, di.totale, di.nuova], [2, 3, false], JSON.stringify(di));
  });
}

test('REVP-06 (D5, mutant QB1) — the same text in two versions (a restore, an artifact_update): the MOST RECENT wins, as on the PC', async (t) => {
  const dati = cartella(t);
  const v1 = await salvaBloccoInLibreria({ cartella: dati, testo: TABELLA, sessionId: 'sess-1' });
  await salvaBloccoInLibreria({ cartella: dati, testo: TABELLA_2, sessionId: 'sess-1' });
  /* restoring v1 (or an artifact_update with the earlier text) makes v3 with the same text as v1 */
  await aggiungiVersione({ cartella: dati, id: v1.id, testo: TABELLA, ripristinoDi: 1 });
  const di = await salvaBloccoInLibreria({ cartella: dati, testo: TABELLA, sessionId: 'sess-1' });
  assert.deepEqual([di.versione, di.totale, di.nuova], [3, 3, false], JSON.stringify(di));
  const voce = await voceDelBlocco({ cartella: dati, sessionId: 'sess-1', idBlocco: 'vendite' });
  assert.equal(voce.versioni.filter((v) => v.impronta === impronta(TABELLA)).at(-1).n, di.versione, 'server and PC say the same version');
});
