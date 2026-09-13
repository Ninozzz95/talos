import assert from 'node:assert/strict';
import { mkdtemp, mkdir, open, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';

import { ePercorsoDiControllo, FILE_DI_CONTROLLO, PathPolicyError, isPathInside, openContainedFile, resolveContainedRealPath } from '../src/path-policy.mjs';

/*
 * ⛔⛔⛔ 30/8 — questo file testava `createPathPolicy()` (5 test, tutti su
 * campagne TALOS-BANCO) — rimossa insieme al resto della lettura delle
 * campagne (piano "Board — da campagne TALOS-BANCO a cruscotto sessioni").
 * `isPathInside`/`PathPolicyError` restano vive (usate da
 * workspace-files.mjs/workspace-tree.mjs per il containment del
 * workspace) ma non avevano MAI un test proprio, solo indiretto via
 * createPathPolicy — questi test lo colmano, non solo lo spostano.
 */

test('isPathInside: un discendente reale è dentro la radice', () => {
  const root = resolve('/tmp/talos-radice');
  assert.equal(isPathInside(root, join(root, 'sotto', 'file.txt')), true);
});

test('isPathInside: la radice stessa è dentro se stessa', () => {
  const root = resolve('/tmp/talos-radice');
  assert.equal(isPathInside(root, root), true);
});

test('isPathInside AL CONTRARIO: ".." fuori dalla radice è rifiutato', () => {
  const root = resolve('/tmp/talos-radice');
  assert.equal(isPathInside(root, resolve(root, '..', 'fuori.txt')), false);
});

test('isPathInside AL CONTRARIO: un fratello con lo stesso prefisso testuale non è "dentro"', () => {
  // ⛔ il bug classico del containment ingenuo: confrontare le stringhe
  // farebbe passare "/tmp/talos-radice-evil" come "dentro"
  // "/tmp/talos-radice" perché il prefisso combacia — isPathInside usa
  // `relative()`, non un prefisso di stringa, e deve rifiutarlo.
  const root = resolve('/tmp/talos-radice');
  const sibling = resolve('/tmp/talos-radice-evil/file.txt');
  assert.equal(isPathInside(root, sibling), false);
});

test('PathPolicyError: nome e codice di default corretti', () => {
  const errore = new PathPolicyError('percorso non ammesso');
  assert.equal(errore.name, 'PathPolicyError');
  assert.equal(errore.code, 'PATH_NOT_ALLOWED');
  assert.ok(errore instanceof Error);
});

test('PathPolicyError: un codice esplicito sovrascrive il default', () => {
  const errore = new PathPolicyError('non inizializzata', 'CONFIG_INVALID');
  assert.equal(errore.code, 'CONFIG_INVALID');
});

test('resolveContainedRealPath: risolve un file reale dentro la radice e rifiuta traversal', async (t) => {
  // 13/09: sui runner GitHub `tmpdir()` è nella forma corta 8.3 (`C:\Users\RUNNER~1\…`) e la
  // funzione risponde col percorso vero (`runneradmin`): la radice si confronta già risolta.
  const root = await realpath(await mkdtemp(join(tmpdir(), 'talos-path-policy-')));
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(join(root, 'ok.txt'), 'ok');
  assert.equal(await resolveContainedRealPath(root, 'ok.txt'), resolve(root, 'ok.txt'));
  await assert.rejects(() => resolveContainedRealPath(root, '../fuori.txt'), { code: 'PATH_NOT_ALLOWED' });
  await assert.rejects(() => resolveContainedRealPath(root, resolve(root, 'ok.txt')), { code: 'PATH_NOT_ALLOWED' });
});

test('resolveContainedRealPath: un link simbolico che esce dalla radice viene rifiutato', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'talos-path-policy-'));
  const outside = await mkdtemp(join(tmpdir(), 'talos-path-policy-outside-'));
  t.after(async () => { await rm(root, { recursive: true, force: true }); await rm(outside, { recursive: true, force: true }); });
  await writeFile(join(outside, 'segreto.txt'), 'segreto');
  try {
    await symlink(outside, join(root, 'link'), 'junction');
  } catch (error) {
    t.skip(`il sistema non consente di creare una junction: ${error.code || error.message}`);
    return;
  }
  await assert.rejects(() => resolveContainedRealPath(root, 'link/segreto.txt'), { code: 'PATH_NOT_ALLOWED' });
});

test('openContainedFile: apre il file dentro la radice e non lascia handle su errore', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'talos-path-policy-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(join(root, 'ok.txt'), 'contenuto');
  const handle = await openContainedFile(root, 'ok.txt', 'r');
  assert.equal(await handle.readFile({ encoding: 'utf8' }), 'contenuto');
  await handle.close();
  await assert.rejects(() => openContainedFile(root, '../fuori.txt', 'r'), { code: 'PATH_NOT_ALLOWED' });
});

/*
 * ⭐⭐⭐ 04/9 — W1-13, `ePercorsoDiControllo`. Tutte su una cartella VERA
 * (mkdtemp), mai finta: la funzione risolve il percorso REALE sul
 * filesystem (esisteSync/realpathSync), quindi un test con percorsi solo
 * immaginati proverebbe un ramo diverso da quello che gira in produzione.
 */

test('ePercorsoDiControllo: veri per NOME, a qualunque profondità — anche un file che non esiste ancora', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'talos-controllo-nome-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const nome of FILE_DI_CONTROLLO.file) {
    assert.equal(ePercorsoDiControllo(root, nome), true, `${nome} alla radice`);
    assert.equal(ePercorsoDiControllo(root, `sotto/annidato/${nome}`), true, `${nome} annidato`);
  }
});

test('ePercorsoDiControllo AL CONTRARIO: un file del progetto normale (src/a.js) è falso', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'talos-controllo-nome-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  assert.equal(ePercorsoDiControllo(root, 'src/a.js'), false);
  assert.equal(ePercorsoDiControllo(root, 'a.js'), false);
});

test('ePercorsoDiControllo: vero per le CARTELLE OVUNQUE (.harness-ui-plugins, .hooks-trust, .claude, .memory-store), a qualunque profondità', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'talos-controllo-cartella-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const cartella of FILE_DI_CONTROLLO.cartelleOvunque) {
    assert.equal(ePercorsoDiControllo(root, `${cartella}/qualsiasi`), true, `${cartella}/qualsiasi alla radice`);
    assert.equal(ePercorsoDiControllo(root, `molto/annidato/${cartella}/x`), true, `${cartella}/x annidato`);
  }
});

test('ePercorsoDiControllo AL CONTRARIO: un nome di cartella SIMILE ma diverso non è protetto — match esatto sul segmento, non un prefisso', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'talos-controllo-cartella-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  // ⛔ il bug classico "STRINGERE la guardia": un confronto per prefisso
  // farebbe passare ".claude-backup"/".hooks-trust-vecchio" come protetti.
  assert.equal(ePercorsoDiControllo(root, '.claude-backup/x'), false);
  assert.equal(ePercorsoDiControllo(root, '.hooks-trust-vecchio/x'), false);
  assert.equal(ePercorsoDiControllo(root, 'mie-skills/x'), false);
});

test('ePercorsoDiControllo: vero per skills/** SOLO alla radice del workspace', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'talos-controllo-skills-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  assert.equal(ePercorsoDiControllo(root, 'skills/x.md'), true);
  assert.equal(ePercorsoDiControllo(root, 'skills/sotto/y.md'), true);
});

test('ePercorsoDiControllo AL CONTRARIO: skills annidata sotto un\'altra cartella NON è protetta — un progetto che si chiama così non diventa tutto intoccabile', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'talos-controllo-skills-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  assert.equal(ePercorsoDiControllo(root, 'progetto/skills/x.md'), false);
});

test('ePercorsoDiControllo: vero anche passando da "../" — un file di controllo del genitore non si aggira uscendo dalla radice', async (t) => {
  const genitore = await mkdtemp(join(tmpdir(), 'talos-controllo-dotdot-'));
  t.after(() => rm(genitore, { recursive: true, force: true }));
  const workspace = join(genitore, 'workspace');
  await mkdir(workspace);
  await writeFile(join(genitore, 'CLAUDE.md'), '# regole vere');
  assert.equal(ePercorsoDiControllo(workspace, '../CLAUDE.md'), true);
});

test('ePercorsoDiControllo AL CONTRARIO: "../" da sola, verso un file NORMALE del genitore, resta falso', async (t) => {
  const genitore = await mkdtemp(join(tmpdir(), 'talos-controllo-dotdot-'));
  t.after(() => rm(genitore, { recursive: true, force: true }));
  const workspace = join(genitore, 'workspace');
  await mkdir(workspace);
  await writeFile(join(genitore, 'altro.txt'), 'niente di speciale');
  assert.equal(ePercorsoDiControllo(workspace, '../altro.txt'), false);
});

test('ePercorsoDiControllo: vero anche attraverso un link/junction che punta a un file di controllo VERO, pure con un nome di link innocuo', async (t) => {
  const radice = await mkdtemp(join(tmpdir(), 'talos-controllo-link-'));
  t.after(() => rm(radice, { recursive: true, force: true }));
  const workspace = join(radice, 'workspace');
  const vero = join(radice, 'vero');
  await mkdir(workspace);
  await mkdir(vero);
  await writeFile(join(vero, 'CLAUDE.md'), '# regole vere');
  await writeFile(join(vero, 'normale.txt'), 'niente di speciale');
  try {
    await symlink(vero, join(workspace, 'collegamento'), 'junction');
  } catch (error) {
    t.skip(`il sistema non consente di creare una junction: ${error.code || error.message}`);
    return;
  }
  assert.equal(ePercorsoDiControllo(workspace, 'collegamento/CLAUDE.md'), true, 'il link punta a un file di controllo VERO: il nome del link non lo nasconde');
  // AL CONTRARIO, stesso link: un file normale raggiunto dallo stesso collegamento resta falso — non è il link a scattare, è la destinazione.
  assert.equal(ePercorsoDiControllo(workspace, 'collegamento/normale.txt'), false);
});

test('ePercorsoDiControllo: vero attraverso un link/junction che punta DENTRO una cartella OVUNQUE reale (fuori dal workspace)', async (t) => {
  const radice = await mkdtemp(join(tmpdir(), 'talos-controllo-link-cartella-'));
  t.after(() => rm(radice, { recursive: true, force: true }));
  const workspace = join(radice, 'workspace');
  const claudeVera = join(radice, '.claude');
  await mkdir(workspace);
  await mkdir(claudeVera);
  await writeFile(join(claudeVera, 'nota.txt'), 'segreto');
  try {
    await symlink(claudeVera, join(workspace, 'segreto'), 'junction');
  } catch (error) {
    t.skip(`il sistema non consente di creare una junction: ${error.code || error.message}`);
    return;
  }
  assert.equal(ePercorsoDiControllo(workspace, 'segreto/nota.txt'), true, 'il link porta dentro ".claude" reale, anche se il segmento visibile nel percorso è "segreto"');
});

test('ePercorsoDiControllo: fallisce CHIUSO — un realpathFn che lancia torna sempre true, mai un\'eccezione propagata', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'talos-controllo-fallisce-chiuso-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const realpathCheGetta = () => { throw new Error('disco non leggibile'); };
  // AL CONTRARIO del test "src/a.js è falso" sopra: stesso percorso, stesso file, MA il canale di risoluzione è rotto — qui deve tornare true, non false.
  assert.equal(ePercorsoDiControllo(root, 'src/a.js', { realpathFn: realpathCheGetta }), true);
});

test('ePercorsoDiControllo AL CONTRARIO: input degeneri (non stringa, vuoti) tornano falso, mai un\'eccezione', () => {
  assert.equal(ePercorsoDiControllo(123, 'x'), false);
  assert.equal(ePercorsoDiControllo('', 'x'), false);
  assert.equal(ePercorsoDiControllo('/x', ''), false);
  assert.equal(ePercorsoDiControllo('/x', null), false);
  assert.equal(ePercorsoDiControllo(undefined, undefined), false);
});
