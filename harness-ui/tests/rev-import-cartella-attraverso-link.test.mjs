/*
 * Revisione avversaria di c44221b51 (21/10/2026). IMP-18 prova un FILE importato attraverso una giunzione verso fuori; il ramo della
 * CARTELLA importata attraverso il link (`require('./jl')`, il suo `index.js` col nome scritto) non lo provava nessuno: toglierlo
 * lasciava verdi tutte le prove (mutante misurato nel rapporto). Qui si prova quel ramo, e cambiarne l'ingresso cambia l'impronta.
 * La giunzione si crea su Windows senza privilegi ed è un symlink su Linux; dove non si crea, la prova si salta e lo dice.
 */
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { areaDelProgetto, hookCommandTokens, referencedScripts } from '../src/script-del-progetto.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

const improntaDi = async (cartella, comando) => (await referencedScripts(await areaDelProgetto(cartella), hookCommandTokens(comando), { memoria: null }))
  .map((r) => `${r.path}=${r.sha256}`).sort();

test('REV-IMP-LINK-01 una CARTELLA importata attraverso una giunzione verso fuori entra col suo ingresso, col nome scritto', async (t) => {
  const cartella = mkdtempSync(join(tmpdir(), 'rev-import-link-'));
  const fuori = mkdtempSync(join(tmpdir(), 'rev-import-link-fuori-'));
  t.after(() => { rimuoviCartellaDiProva(cartella); rimuoviCartellaDiProva(fuori); });
  mkdirSync(join(fuori, 'jl'));
  writeFileSync(join(fuori, 'jl', 'index.js'), '// V1\n');
  writeFileSync(join(cartella, 'main.js'), 'require("./jl")\n');
  try { symlinkSync(join(fuori, 'jl'), join(cartella, 'jl'), 'junction'); } catch (errore) { t.skip(`giunzione non creata (${errore.code})`); return; }
  const prima = await improntaDi(cartella, 'node main.js');
  assert.ok(prima.some((r) => r.startsWith('jl/index.js=')), `l'ingresso della cartella importata entra col nome scritto: ${JSON.stringify(prima)}`);
  assert.ok(!prima.some((r) => r.includes('rev-import-link-fuori-')), 'mai il percorso vero, che sta fuori dal progetto');
  writeFileSync(join(fuori, 'jl', 'index.js'), '// V2\n');
  assert.notDeepEqual(await improntaDi(cartella, 'node main.js'), prima, '⛔ l’ingresso importato è cambiato e l’impronta no');
});
