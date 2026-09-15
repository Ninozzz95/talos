import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { leggiAlberoWorkspace, WorkspaceTreeError } from '../src/workspace-tree.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

// ⭐ Nessun mock per la struttura base: una cartella VERA su disco, come
// workspace-context.test.mjs fa per il branch git — stesso principio, "il
// codice non deve sapere se è stato provato".
function alberoVero() {
  const radice = mkdtempSync(join(tmpdir(), 'talos-tree-'));
  writeFileSync(join(radice, 'b.txt'), 'b');
  writeFileSync(join(radice, 'a.txt'), 'a');
  mkdirSync(join(radice, 'sub'));
  writeFileSync(join(radice, 'sub', 'c.txt'), 'c');
  return radice;
}

test('⭐ alla radice: cartelle PRIMA dei file, alfabetico dentro ogni gruppo — nessun mock, disco vero', async () => {
  const radice = alberoVero();
  try {
    const voci = await leggiAlberoWorkspace({ cartella: radice });
    assert.deepEqual(voci, [
      { nome: 'sub', cartella: true },
      { nome: 'a.txt', cartella: false },
      { nome: 'b.txt', cartella: false },
    ]);
  } finally {
    rimuoviCartellaDiProva(radice);
  }
});

test('⭐⭐ un sottopercorso VERO elenca il suo contenuto — il verso che deve funzionare', async () => {
  const radice = alberoVero();
  try {
    const voci = await leggiAlberoWorkspace({ cartella: radice, percorso: 'sub' });
    assert.deepEqual(voci, [{ nome: 'c.txt', cartella: false }]);
  } finally {
    rimuoviCartellaDiProva(radice);
  }
});

test('⛔⛔ percorso con ".." che risale fuori dalla radice: WorkspaceTreeError, MAI il contenuto del genitore', async () => {
  const radice = alberoVero();
  try {
    await assert.rejects(
      () => leggiAlberoWorkspace({ cartella: radice, percorso: '../' }),
      (errore) => errore instanceof WorkspaceTreeError && errore.code === 'QUERY_INVALID',
    );
    await assert.rejects(() => leggiAlberoWorkspace({ cartella: radice, percorso: '../../etc' }), WorkspaceTreeError);
    await assert.rejects(() => leggiAlberoWorkspace({ cartella: radice, percorso: 'sub/../../etc' }), WorkspaceTreeError);
  } finally {
    rimuoviCartellaDiProva(radice);
  }
});

test('⛔ percorso ASSOLUTO rifiutato, anche se punta dentro la stessa radice per caso', async () => {
  const radice = alberoVero();
  try {
    await assert.rejects(() => leggiAlberoWorkspace({ cartella: radice, percorso: radice }), WorkspaceTreeError);
  } finally {
    rimuoviCartellaDiProva(radice);
  }
});

test('⛔ un percorso che non esiste: WorkspaceTreeError pulito, mai un ENOENT grezzo', async () => {
  const radice = alberoVero();
  try {
    await assert.rejects(() => leggiAlberoWorkspace({ cartella: radice, percorso: 'mai-esistito' }), WorkspaceTreeError);
  } finally {
    rimuoviCartellaDiProva(radice);
  }
});

test('⭐ con discoNodeFn iniettato su una radice VERA, riceve { radice: cartella } esatta e torna la sua lista', async () => {
  const radice = alberoVero();
  try {
    let radiceCatturata = null;
    let percorsoCatturato = null;
    const discoNodeFn = ({ radice: r }) => {
      radiceCatturata = r;
      return {
        elenca: async (p) => {
          percorsoCatturato = p;
          return [{ nome: 'finto.txt', cartella: false }];
        },
      };
    };

    const voci = await leggiAlberoWorkspace({ cartella: radice, percorso: 'sub' }, { discoNodeFn });

    assert.equal(radiceCatturata, radice);
    assert.equal(percorsoCatturato, 'sub');
    assert.deepEqual(voci, [{ nome: 'finto.txt', cartella: false }]);
  } finally {
    rimuoviCartellaDiProva(radice);
  }
});
