import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';

import { createWorkspaceBrowser, WorkspaceBrowserError } from '../src/workspace-browser.mjs';

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'talos-workspace-browser-'));
  const project = join(root, 'Users', 'Antonino', 'AVM');
  await mkdir(project, { recursive: true });
  await mkdir(join(root, 'Windows'));
  await writeFile(join(root, 'leggimi.txt'), 'non deve entrare nel chooser');
  t.after(() => rm(root, { recursive: true, force: true }));
  return { root, project };
}

test('WORKSPACE-CHOOSER-ROOT-01 — parte dalla radice, legge un livello e restituisce soltanto directory', async (t) => {
  const { root, project } = await fixture(t);
  const browser = createWorkspaceBrowser({
    rootDir: root,
    projectDirectories: [{ id: 'default', nome: 'AVM', percorso: project }],
    recommendedDirectoriesFn: () => [{ etichetta: 'AVM', percorso: project, tipo: 'recent' }],
  });
  const result = await browser.browse();
  assert.equal(result.root, root);
  assert.equal(result.path, root);
  assert.equal(result.parent, null);
  assert.deepEqual(result.items.map((item) => item.name), ['Users', 'Windows']);
  assert.equal(result.items.some((item) => item.name === 'leggimi.txt'), false);
  assert.deepEqual(result.recommended, [{ label: 'AVM', path: project, kind: 'project', projectId: 'default' }]);
});

test('WORKSPACE-CHOOSER-LAZY-02 — non legge le figlie finché non sono richieste', async (t) => {
  const { root } = await fixture(t);
  const calls = [];
  const browser = createWorkspaceBrowser({
    rootDir: root,
    readdirFn: async (path, options) => {
      calls.push(path);
      const { readdir } = await import('node:fs/promises');
      return readdir(path, options);
    },
  });
  await browser.browse();
  assert.deepEqual(calls, [root]);
  await browser.browse(join(root, 'Users'));
  assert.deepEqual(calls, [root, join(root, 'Users')]);
});

test('WORKSPACE-CHOOSER-TRAVERSAL-03 — rifiuta relativo, traversal, NUL, fuori radice e path oltre budget prima della lettura', async (t) => {
  const { root } = await fixture(t);
  let reads = 0;
  const browser = createWorkspaceBrowser({ rootDir: root, readdirFn: async () => { reads += 1; return []; } });
  const invalid = ['Users', join(root, '..', 'outside'), `${root}\0bad`, `${root}${'x'.repeat(1100)}`];
  for (const path of invalid) {
    await assert.rejects(() => browser.browse(path), (error) => error instanceof WorkspaceBrowserError && error.code === 'QUERY_INVALID');
  }
  assert.equal(reads, 0);
});

test('WORKSPACE-CHOOSER-REPARSE-04 — non offre symlink o junction come cartelle navigabili', async () => {
  const root = 'C:\\';
  const browser = createWorkspaceBrowser({
    rootDir: root,
    realpathFn: async (path) => path,
    readdirFn: async () => [
      { name: 'Cartella', isDirectory: () => true, isSymbolicLink: () => false },
      { name: 'Junction', isDirectory: () => true, isSymbolicLink: () => true },
      { name: 'file.txt', isDirectory: () => false, isSymbolicLink: () => false },
    ],
  });
  const result = await browser.browse(root);
  assert.deepEqual(result.items.map((item) => item.name), ['Cartella']);
});

test('WORKSPACE-CHOOSER-REPARSE-DIRECT-26 — rifiuta una junction in qualunque segmento del percorso diretto', async () => {
  const root = 'C:\\';
  const link = 'C:\\link';
  const reads = [];
  const browser = createWorkspaceBrowser({
    rootDir: root,
    lstatFn: async (path) => ({ isSymbolicLink: () => path === link }),
    realpathFn: async (path) => path,
    readdirFn: async (path) => { reads.push(path); return []; },
  });

  await assert.rejects(
    () => browser.browse('C:\\link\\child'),
    (error) => error instanceof WorkspaceBrowserError && error.code === 'QUERY_INVALID',
  );
  assert.deepEqual(reads, []);
});

test('WORKSPACE-CHOOSER-PERMISSION-05 — una directory non leggibile espone un errore stabile e naturale', async (t) => {
  const { root } = await fixture(t);
  const browser = createWorkspaceBrowser({ rootDir: root, readdirFn: async () => { throw new Error('EACCES stack tecnica'); } });
  await assert.rejects(
    () => browser.browse(),
    (error) => error instanceof WorkspaceBrowserError
      && error.code === 'WORKSPACE_NOT_AVAILABLE'
      && error.message === 'Questa cartella non è disponibile. Scegline un’altra oppure controlla Doctor.',
  );
});

test('WORKSPACE-CHOOSER-EMPTY-20 — una cartella vuota è uno stato valido, non un errore', async (t) => {
  const { root } = await fixture(t);
  const empty = join(root, 'Empty');
  await mkdir(empty);
  const browser = createWorkspaceBrowser({ rootDir: root });
  const result = await browser.browse(empty);
  assert.deepEqual(result.items, []);
  assert.equal(result.parent, dirname(empty));
});

test('WORKSPACE-NEW-FOLDER-07 — crea una sola cartella reale e la rende subito navigabile', async (t) => {
  const { root } = await fixture(t);
  const parent = join(root, 'Users');
  const browser = createWorkspaceBrowser({ rootDir: root });

  const created = await browser.createFolder(parent, 'Nuovo progetto');

  assert.deepEqual(created, { name: 'Nuovo progetto', path: join(parent, 'Nuovo progetto') });
  const refreshed = await browser.browse(parent);
  assert.equal(refreshed.items.some((item) => item.name === 'Nuovo progetto'), true);
});

test('WORKSPACE-NEW-FOLDER-INVERSE-08 — rifiuta traversal, separatori, riservati Windows ed esistenti', async (t) => {
  const { root } = await fixture(t);
  const parent = join(root, 'Users');
  const browser = createWorkspaceBrowser({ rootDir: root });

  for (const name of ['..', 'foo/bar', 'foo\\bar', 'CON', 'NUL.txt', 'cartella.', 'cartella ']) {
    await assert.rejects(
      () => browser.createFolder(parent, name),
      (error) => error instanceof WorkspaceBrowserError && error.code === 'QUERY_INVALID',
      name,
    );
  }
  await mkdir(join(parent, 'Esistente'));
  await assert.rejects(
    () => browser.createFolder(parent, 'Esistente'),
    (error) => error instanceof WorkspaceBrowserError && error.code === 'WORKSPACE_ALREADY_EXISTS',
  );
});
