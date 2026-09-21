import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { createWorkspaceDisk, WorkspaceDiskError } from '../src/workspace-disk.mjs';
import { rimuoviCartellaDiProvaAttesa } from './aiuto/rimuovi-cartella-di-prova.mjs';

test('workspace disk lists one directory level with stable folder-first order', async () => {
  const root = await mkdtemp(join(tmpdir(), 'talos-disk-'));
  try {
    await writeFile(join(root, 'b.txt'), 'b');
    await writeFile(join(root, 'a.txt'), 'a');
    await mkdir(join(root, 'sub'));
    const disk = createWorkspaceDisk({ root });
    assert.deepEqual(await disk.elenca(''), [
      { nome: 'sub', cartella: true },
      { nome: 'a.txt', cartella: false },
      { nome: 'b.txt', cartella: false },
    ]);
  } finally {
    await rimuoviCartellaDiProvaAttesa(root);
  }
});

test('workspace disk rejects traversal and absolute paths before reading', async () => {
  const root = await mkdtemp(join(tmpdir(), 'talos-disk-'));
  try {
    const disk = createWorkspaceDisk({ root });
    await assert.rejects(() => disk.elenca('../'), (error) => error instanceof WorkspaceDiskError && error.code === 'QUERY_INVALID');
    await assert.rejects(() => disk.elenca(root), (error) => error instanceof WorkspaceDiskError && error.code === 'QUERY_INVALID');
  } finally {
    await rimuoviCartellaDiProvaAttesa(root);
  }
});

test('workspace disk wraps filesystem failures in a natural, stable error', async () => {
  const disk = createWorkspaceDisk({ root: join(tmpdir(), 'talos-disk-does-not-exist') });
  await assert.rejects(() => disk.elenca(''), (error) => error instanceof WorkspaceDiskError && error.code === 'DIRECTORY_UNREADABLE');
});
