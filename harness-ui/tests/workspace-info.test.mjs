import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { eUnaRadice, contaFile, repoAnnidati, istruzioniPresenti, ritrattoCartella, frasiRitratto, avvisoRitratto, statoGit, TETTO_FILE } from '../src/workspace-info.mjs';

// 06/09 — decisioni F9, F10, F19, F20, F21: la modale «Nuova sessione» deve dire cosa c'è dentro
// la cartella PRIMA di darla a un agente. Erano tutte ❌ nell'audit.

test('RITRATTO-RADICE: un disco, una home, una scrivania sono radici; un progetto no', () => {
  assert.equal(eUnaRadice('C:\\'), true);
  assert.equal(eUnaRadice('/'), true);
  assert.equal(eUnaRadice('C:\\Users\\Antonino'), true);
  assert.equal(eUnaRadice('C:\\Users\\Antonino\\Desktop'), true);
  assert.equal(eUnaRadice('/home/antonino'), true);
  assert.equal(eUnaRadice('C:\\Users\\Antonino\\Documenti'), true);
  // AL CONTRARIO: un progetto vero non è una radice, e non deve essere avvisato per niente
  assert.equal(eUnaRadice('C:\\Users\\Antonino\\Desktop\\projects\\AVM-harness-desktop'), false);
  assert.equal(eUnaRadice('/home/antonino/progetti/app'), false);
  assert.equal(eUnaRadice(''), false);
  assert.equal(eUnaRadice(null), false);
});

test('RITRATTO-CONTA: conta i file veri, salta ciò che non è lavoro, e si ferma al tetto', async () => {
  const base = await mkdtemp(join(tmpdir(), 'talos-ritratto-'));
  try {
    await writeFile(join(base, 'a.mjs'), 'x');
    await writeFile(join(base, 'b.mjs'), 'x');
    await mkdir(join(base, 'src'));
    await writeFile(join(base, 'src', 'c.mjs'), 'x');
    // node_modules NON si conta: darebbe un numero vero e inutile, e costa la parte lenta
    await mkdir(join(base, 'node_modules', 'pacchetto'), { recursive: true });
    for (let i = 0; i < 50; i += 1) await writeFile(join(base, 'node_modules', 'pacchetto', `f${i}.js`), 'x');
    const c = await contaFile(base);
    assert.equal(c.file, 3);
    assert.equal(c.cartelle, 1); // solo `src`
    assert.equal(c.oltre, false);
    // col tetto a 2 si smette e lo si dichiara, invece di camminare tutto l'albero
    const conTetto = await contaFile(base, { tetto: 2 });
    assert.equal(conTetto.oltre, true);
    assert.ok(conTetto.file <= 3);
  } finally { await rm(base, { recursive: true, force: true }); }
});

test('RITRATTO-ANNIDATI: trova i repo dentro, e dentro un repo annidato non scende oltre', async () => {
  const base = await mkdtemp(join(tmpdir(), 'talos-annidati-'));
  try {
    await mkdir(join(base, 'mobile', '.git'), { recursive: true });
    await mkdir(join(base, 'mobile', 'interno', '.git'), { recursive: true });
    await mkdir(join(base, 'packages', 'uno', '.git'), { recursive: true });
    await mkdir(join(base, 'src'), { recursive: true });
    const trovati = await repoAnnidati(base);
    const nomi = trovati.map((p) => p.replace(base, '').replace(/^[\\/]/, '').replace(/\\/g, '/'));
    assert.deepEqual(nomi.sort(), ['mobile', 'packages/uno']);
    // AL CONTRARIO: una cartella senza repo dentro non ne inventa
    assert.deepEqual(await repoAnnidati(join(base, 'src')), []);
  } finally { await rm(base, { recursive: true, force: true }); }
});

test('RITRATTO-ISTRUZIONI: le istruzioni dell’agente già presenti si dichiarano', async () => {
  const base = await mkdtemp(join(tmpdir(), 'talos-istruzioni-'));
  try {
    await writeFile(join(base, 'CLAUDE.md'), '# regole');
    assert.deepEqual(await istruzioniPresenti(base), ['CLAUDE.md']);
    await writeFile(join(base, 'AGENTS.md'), '# altre');
    assert.deepEqual(await istruzioniPresenti(base), ['CLAUDE.md', 'AGENTS.md']);
  } finally { await rm(base, { recursive: true, force: true }); }
});

test('RITRATTO-GIT: senza git non si inventa niente, con git si legge ramo e modifiche', async () => {
  const base = await mkdtemp(join(tmpdir(), 'talos-git-'));
  try {
    // un finto `git` che risponde come quello vero: la funzione si prova senza dipendere dal disco
    const finto = async (argomenti) => {
      if (argomenti[0] === 'rev-parse' && argomenti[1] === '--is-inside-work-tree') return 'true\n';
      if (argomenti[0] === 'rev-parse') return 'lane/harness-desktop\n';
      if (argomenti[0] === 'status') return ' M src/app.js\n?? nuovo.md\n';
      return null;
    };
    const s = await statoGit(base, { eseguiGit: finto });
    assert.equal(s.ramo, 'lane/harness-desktop');
    assert.equal(s.nonSalvate, 2);
    assert.deepEqual(s.repoAnnidati, []);
    // AL CONTRARIO: fuori da un repo si torna null, senza rumore e senza campi finti
    const fuori = await statoGit(base, { eseguiGit: async () => null });
    assert.equal(fuori, null);
  } finally { await rm(base, { recursive: true, force: true }); }
});

test('RITRATTO-FRASI: la riga della modale e l’avviso, coi numeri veri', () => {
  const ritratto = { leggibile: true, radice: false, file: 1234, cartelle: 56, oltreIlTetto: false, tetto: TETTO_FILE, git: { ramo: 'main', nonSalvate: 3, repoAnnidati: ['/a/mobile'] }, istruzioni: ['CLAUDE.md'] };
  const frase = frasiRitratto(ritratto);
  assert.match(frase, /1\.234 file/);
  assert.match(frase, /ramo main/);
  assert.match(frase, /3 modifiche non salvate/);
  assert.match(frase, /1 repo annidati/);
  assert.match(frase, /CLAUDE\.md/);
  assert.equal(avvisoRitratto(ritratto), '');
  // una radice si avvisa
  assert.match(avvisoRitratto({ ...ritratto, radice: true }), /cartella radice/);
  // e una cartella oltre il tetto pure
  assert.match(avvisoRitratto({ ...ritratto, oltreIlTetto: true }), /più di 20\.000 file/);
  // AL CONTRARIO: una cartella illeggibile lo dice, e non finge numeri
  assert.equal(frasiRitratto({ leggibile: false }), 'Non riesco a leggere questa cartella.');
  assert.equal(avvisoRitratto(null), '');
});

test('RITRATTO-INTERO: una cartella vera, e una che non esiste', async () => {
  const base = await mkdtemp(join(tmpdir(), 'talos-ritratto2-'));
  try {
    await writeFile(join(base, 'uno.txt'), 'x');
    const r = await ritrattoCartella(base, { eseguiGit: async () => null });
    assert.equal(r.leggibile, true);
    assert.equal(r.file, 1);
    assert.equal(r.git, null);
    // AL CONTRARIO: una cartella che non c'è non rompe la modale
    const no = await ritrattoCartella(join(base, 'non-esiste'));
    assert.equal(no.leggibile, false);
    assert.equal((await ritrattoCartella('')).leggibile, false);
  } finally { await rm(base, { recursive: true, force: true }); }
});
