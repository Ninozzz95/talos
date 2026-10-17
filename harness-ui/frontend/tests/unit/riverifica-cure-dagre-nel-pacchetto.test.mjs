/*
 * RIVERIFICA DELLE CURE DELLA TERZA PASSATA (14/10/2026) — `ffabcbad4` toglie `@dagrejs/dagre`. Il brief chiede di attaccare che
 * non resti niente che la cerca, «una copia di licenza nel pacchetto» compresa. Il build non la produce più (`copy-vendored-assets`);
 * ma il pacchetto dell'app non prende il build: prende `harness-ui/public/` (`desktop/scripts/prepara-pacchetto.mjs:269`,
 * `for (const nome of ['src', 'public'])`), e `public/` è TRACCIATO e porta ancora `vendor/dagre/LICENSE-dagre` e `LICENSE-graphlib`.
 * La consegna lo aggiorna copiandoci sopra il build (`scripts/aggiorna-4174.ps1:115`, `Copy-Item -Path $Da -Destination $A
 * -Recurse -Force`): aggiunge e sovrascrive, non toglie ⇒ dopo la consegna le due licenze restano, e vanno nell'installatore.
 * Senza etichetta = ROSSA (rapporto: `handoff …/bugfixer/RAPPORTO-RIVERIFICA-CURE-2026-10-14.md`).
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { copyVendoredAssets } from '../../scripts/copy-vendored-assets.mjs';
import { rimuoviCartellaDiProvaAttesa } from '../../../tests/aiuto/rimuovi-cartella-di-prova.mjs';

const frontendRoot = path.resolve(import.meta.dirname, '../..');
const harness = path.resolve(frontendRoot, '..');

test('RIV-DAGRE-01 — dopo la consegna (il build copiato SOPRA `public/`, che è ciò che il pacchetto dell’app prende) non resta nessuna licenza di dagre: la libreria non c’è più — AL CONTRARIO, il build di oggi non le produce', async () => {
  const output = await mkdtemp(path.join(tmpdir(), 'talos-riv-dagre-'));
  try {
    const prodotti = (await copyVendoredAssets({ frontendRoot, outputDir: output })).map((f) => f.path);
    assert.ok(prodotti.length > 40, `la premessa: il build copia le sue risorse (${prodotti.length})`);
    assert.deepEqual(prodotti.filter((p) => p.startsWith('vendor/dagre/')), [], 'la premessa: il build di oggi non produce licenze di dagre');
    // ciò che `public/` porta oggi (tracciato), visto come lo vede il pacchetto
    const tracciati = execFileSync('git', ['ls-files', '--', 'public/vendor'], { cwd: harness, encoding: 'utf8' })
      .split(/\r?\n/u).filter(Boolean).map((p) => p.replace(/^public\//u, ''));
    assert.ok(tracciati.length > 0, 'la premessa: `public/vendor` è tracciato');
    // la consegna: Copy-Item -Recurse -Force aggiunge e sovrascrive, non toglie
    const dopoLaConsegna = [...new Set([...tracciati, ...prodotti])];
    assert.deepEqual(dopoLaConsegna.filter((p) => p.startsWith('vendor/dagre/')).sort(), [],
      'dopo la consegna `public/` (e quindi il pacchetto) porta ancora le licenze di una libreria tolta');
  } finally {
    await rimuoviCartellaDiProvaAttesa(output);
  }
});
