import assert from 'node:assert/strict';
import { mkdir, mkdtemp, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { createWorkspaceBrowser, elencaDischi } from '../src/workspace-browser.mjs';
import { rimuoviCartellaDiProvaAttesa } from './aiuto/rimuovi-cartella-di-prova.mjs';

/*
 * DISCHI-01..05 (owner 29/10/2026: «prevedi anche computer con più dischi non solo il C»). Il browser delle cartelle aveva una radice
 * sola, il disco del server: una cartella su D: non si poteva scegliere. Qui due cartelle fanno da «dischi», e l'elenco delle lettere di
 * Windows si prova con un `stat` finto (un lettore vuoto, un disco di rete lento).
 */
async function dueDischi(t) {
  const base = await realpath(await mkdtemp(join(tmpdir(), 'talos-dischi-')));
  const c = join(base, 'C'); const d = join(base, 'D');
  await mkdir(join(c, 'Users', 'persona'), { recursive: true });
  await mkdir(join(d, 'Progetti', 'sito'), { recursive: true });
  t.after(() => rimuoviCartellaDiProvaAttesa(base));
  return { base, c, d };
}

test('DISCHI-01 il browser apre il primo disco e dice tutti i dischi, e si può sfogliare il secondo', async (t) => {
  const { c, d } = await dueDischi(t);
  const browser = createWorkspaceBrowser({ rootsFn: async () => [c, d] });
  const primo = await browser.browse();
  assert.equal(primo.root, c);
  assert.deepEqual(primo.roots.map((r) => r.path), [c, d]);
  const secondo = await browser.browse(join(d, 'Progetti'));
  assert.equal(secondo.root, d);
  assert.deepEqual(secondo.items.map((i) => i.name), ['sito']);
});

test('DISCHI-02 al contrario: un percorso fuori da tutti i dischi si rifiuta, e una cartella si crea solo dentro un disco', async (t) => {
  const { base, c, d } = await dueDischi(t);
  const browser = createWorkspaceBrowser({ rootsFn: async () => [c, d] });
  await assert.rejects(browser.browse(base), (e) => e.code === 'QUERY_INVALID');
  const fatta = await browser.createFolder(join(d, 'Progetti'), 'nuovo');
  assert.equal(fatta.path, join(d, 'Progetti', 'nuovo'));
  await assert.rejects(browser.createFolder(base, 'fuori'), (e) => e.code === 'QUERY_INVALID');
});

test('DISCHI-03 un consigliato sul secondo disco resta fra i consigliati', async (t) => {
  const { c, d } = await dueDischi(t);
  const browser = createWorkspaceBrowser({ rootsFn: async () => [c, d], recommendedDirectoriesFn: () => [{ etichetta: 'sito', percorso: join(d, 'Progetti', 'sito'), tipo: 'recent' }] });
  const esito = await browser.browse();
  assert.deepEqual(esito.recommended.map((r) => r.label), ['sito']);
});

test('DISCHI-04 su Windows le lettere presenti, il disco di sistema per primo; un lettore vuoto e un disco lento non entrano e non fermano gli altri', async () => {
  const presenti = new Set(['C:\\', 'D:\\', 'E:\\']);
  const statFn = async (radice) => {
    if (radice === 'E:\\') return new Promise(() => {}); // disco di rete che non risponde
    if (radice === 'F:\\') throw Object.assign(new Error('no media'), { code: 'ENOENT' }); // lettore vuoto
    if (!presenti.has(radice)) throw Object.assign(new Error('missing'), { code: 'ENOENT' });
    return { isDirectory: () => true };
  };
  const inizio = Date.now();
  const dischi = await elencaDischi({ piattaforma: 'win32', statFn, sistema: 'D:\\', tettoMs: 200 });
  assert.deepEqual(dischi, ['D:\\', 'C:\\']);
  assert.ok(Date.now() - inizio < 2000, 'il disco lento non ferma l\'elenco oltre il suo tetto');
});

test('DISCHI-05 fuori da Windows la radice è una sola, «/»', async () => {
  assert.deepEqual(await elencaDischi({ piattaforma: 'linux' }), ['/']);
});
