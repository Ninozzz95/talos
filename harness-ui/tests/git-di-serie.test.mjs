/*
 * Blocco 9 del Git sicuro (31/10/2026, forma con l'OK di CLI, Mobile e Performance). Nato da un buco MISURATO nella revisione del
 * blocco: la scheda Git sceglieva le letture da una lista, `stash` non c'era, e `git stash list` (un `git log -g`) faceva partire il
 * `gpg.program` di una cartella copiata. Tre cose:
 * - la lista si ROVESCIA (Mobile): la cura è di serie per ogni git del servizio, fuori resta solo una lista chiusa delle AZIONI della
 *   persona; un sottocomando nuovo o dimenticato è protetto;
 * - `git log -3` della scheda di lavoro (scheda-di-lavoro.mjs), lanciato da solo all'inizio del lavoro, riceve la cura;
 * - la lettura delle chiavi si fa UNA volta per chiamata del servizio e si passa a tutti i suoi comandi (Performance), senza cache.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { creaServizioGit, eAzioneDellaPersona } from '../src/git-service.mjs';
import { ultimiCommit } from '../src/scheda-di-lavoro.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

const IDENTITA = ['-c', 'user.name=t', '-c', 'user.email=t@t'];
const git = (cwd, args, opzioni = {}) => execFileSync('git', [...IDENTITA, ...args], { cwd, stdio: ['pipe', 'pipe', 'pipe'], ...opzioni }).toString();

/** L'oggetto `commit` dato, con un'intestazione `gpgsig` vuota: basta perché `log.showSignature` chiami il programma delle firme. */
function firma(dir, rif) {
  const testo = git(dir, ['cat-file', 'commit', rif]);
  const fine = testo.indexOf('\n\n');
  const firmato = `${testo.slice(0, fine)}\ngpgsig -----BEGIN PGP SIGNATURE-----\n \n -----END PGP SIGNATURE-----${testo.slice(fine)}`;
  return git(dir, ['hash-object', '-t', 'commit', '-w', '--stdin'], { input: firmato }).trim();
}

/** Una cartella copiata con un commit e un accantonamento FIRMATI e, nella sua configurazione, `log.showSignature` + `gpg.program`. */
function cartellaFirmata(t) {
  const radice = fs.mkdtempSync(path.join(os.tmpdir(), 'talos-git-serie-'));
  t.after(() => rimuoviCartellaDiProva(radice));
  const dir = path.join(radice, 'progetto');
  fs.mkdirSync(dir);
  const spia = path.join(radice, 'SPIA.txt').split(path.sep).join('/');
  const programma = path.join(radice, 'finto-gpg.sh');
  fs.writeFileSync(programma, `#!/bin/sh\necho x >> "${spia}"\nexit 1\n`);
  fs.chmodSync(programma, 0o755);
  git(dir, ['init', '-q']);
  fs.writeFileSync(path.join(dir, 'a.txt'), 'uno\n');
  git(dir, ['add', 'a.txt']);
  fs.writeFileSync(path.join(radice, 'm.txt'), 'primo\n');
  git(dir, ['commit', '-q', '-F', path.join(radice, 'm.txt')]);
  git(dir, ['update-ref', 'HEAD', firma(dir, 'HEAD')]);
  fs.writeFileSync(path.join(dir, 'a.txt'), 'due\n');
  git(dir, ['stash', '-q']);
  git(dir, ['update-ref', 'refs/stash', firma(dir, 'refs/stash')]);
  git(dir, ['config', 'log.showSignature', 'true']);
  git(dir, ['config', 'gpg.program', programma.split(path.sep).join('/')]);
  const partenze = () => { const n = fs.existsSync(spia) ? fs.readFileSync(spia, 'utf8').split('\n').filter(Boolean).length : 0; fs.rmSync(spia, { force: true }); return n; };
  /* CONTROLLO: la cartella è davvero pericolosa — un `git log` e un `git stash list` qualunque fanno partire il programma */
  try { execFileSync('git', ['log', '-1'], { cwd: dir, stdio: 'ignore' }); } catch { /* il programma esce 1: la firma «non valida» */ }
  assert.ok(partenze() >= 1, 'CONTROLLO: a plain git log runs the folder signature program');
  try { execFileSync('git', ['stash', 'list'], { cwd: dir, stdio: 'ignore' }); } catch { /* idem */ }
  assert.ok(partenze() >= 1, 'CONTROLLO: a plain git stash list runs it too');
  return { dir, partenze };
}

test('GIT-SERIE-01 the Git tab lists the stashes and runs nothing (stash list is a read, not an action)', async (t) => {
  const c = cartellaFirmata(t);
  const servizio = creaServizioGit({ cartellaDiSessione: () => c.dir });
  const { accantonati } = await servizio.accantonati({ sessionId: 's1' });
  assert.equal(c.partenze(), 0, 'no signature program started');
  assert.ok(accantonati.length >= 1, 'the stash is still listed (the signed copy adds a second entry to the stash log)');
});

test('GIT-SERIE-02 the work sheet reads the last commits and runs nothing; the commits are still there', async (t) => {
  const c = cartellaFirmata(t);
  const commit = await ultimiCommit(c.dir);
  assert.equal(c.partenze(), 0, 'no signature program started');
  assert.equal(commit.length, 1);
  assert.match(commit[0], /primo/u);
});

test('GIT-SERIE-03 the history of the Git tab (git log) runs nothing either', async (t) => {
  const c = cartellaFirmata(t);
  await creaServizioGit({ cartellaDiSessione: () => c.dir }).storia({ sessionId: 's1' });
  assert.equal(c.partenze(), 0);
});

test('GIT-SERIE-04 the closed list of the person\'s actions; everything else, even a subcommand nobody listed, gets the cure', () => {
  for (const a of [['add', '--', 'a'], ['commit', '-F', 'x'], ['checkout', '-q', 'x'], ['switch', '-c', 'r'], ['reset', '-q'], ['apply', '--check', 'p'],
    ['clean', '-f'], ['pull', '--no-edit'], ['push', '--porcelain'], ['fetch', '--all'], ['init', '-q'], ['update-ref', '-d', 'HEAD', 'x'],
    ['stash'], ['stash', '-u', '--', '.'], ['stash', 'pop', 'stash@{0}'], ['stash', 'drop', '-q', 'stash@{0}'],
    ['branch', '-m', 'a', 'b'], ['branch', '-D', 'a'], ['branch', 'nuovo'], ['-c', 'init.defaultBranch=main', 'init', '-q']]) {
    assert.equal(eAzioneDellaPersona(a), true, `an action: ${a.join(' ')}`);
  }
  for (const a of [['status', '--porcelain=v1'], ['log', '-3'], ['show', 'HEAD'], ['diff', '--cached'], ['stash', 'list'], ['stash', 'show', '--name-only'],
    ['branch'], ['branch', '--show-current'], ['for-each-ref'], ['rev-parse', '--verify', 'HEAD'], ['config', '--get', 'x'],
    ['describe'], ['blame', 'a.txt'], ['grep', 'x'], ['reflog'], ['-c', 'core.quotepath=false', 'log']]) {
    assert.equal(eAzioneDellaPersona(a), false, `a read, with the cure: ${a.join(' ')}`);
  }
});

/* Revisione dei blocchi 10-12, D-14 (31/10/2026): dodici nomi della lista non li lanciava nessuno, e la regola di `branch` prendeva per azione
   anche le letture con un argomento. Un sottocomando dimenticato deve ricevere la cura; `git branch nuovo` resta l'azione che è. */
test('GIT-SERIE-08 a name the service never launches gets the cure, and a branch listing with an argument is a read', () => {
  for (const nome of ['am', 'cherry-pick', 'clone', 'merge', 'mv', 'rebase', 'restore', 'revert', 'rm', 'submodule', 'tag', 'worktree']) {
    assert.equal(eAzioneDellaPersona([nome]), false, `a read, with the cure: ${nome}`);
  }
  for (const a of [['worktree', 'list'], ['tag', '--list'], ['submodule', 'status'], ['branch', '--list', 'x'], ['branch', '-l', 'x'], ['branch', '--contains', 'abc'],
    ['branch', '--contains=abc'], ['branch', '--no-contains', 'abc'], ['branch', '--merged', 'main'], ['branch', '--no-merged', 'main'], ['branch', '--points-at', 'HEAD'],
    ['branch', '--format=%(refname)', '--merged', 'main']]) {
    assert.equal(eAzioneDellaPersona(a), false, `a read, with the cure: ${a.join(' ')}`);
  }
  for (const a of [['branch', 'nuovo'], ['branch', 'nuovo', 'main'], ['branch', '--track', 'nuovo', 'origin/main'], ['branch', '-d', 'x'], ['branch', '--set-upstream-to=origin/x', 'x'],
    ['branch', '--list', '-D', 'x']]) {
    assert.equal(eAzioneDellaPersona(a), true, `an action: ${a.join(' ')}`);
  }
});

/* Revisione dei blocchi 10-12, D-1 (31/10/2026): `includeIf "onbranch:"` fa comparire una chiave pericolosa SOLO su un ramo. La lettura unica
   per chiamata, fatta prima dello `switch`, non la conosceva, e lo stato riletto nella stessa chiamata faceva partire il comando. */
function cartellaColComandoSulRamo(t) {
  const radice = fs.mkdtempSync(path.join(os.tmpdir(), 'talos-git-ramo-'));
  t.after(() => rimuoviCartellaDiProva(radice));
  const dir = path.join(radice, 'progetto');
  fs.mkdirSync(dir);
  const spia = path.join(radice, 'SPIA.txt').split(path.sep).join('/');
  const programma = path.join(radice, 'monitor.sh');
  fs.writeFileSync(programma, `#!/bin/sh\necho x >> "${spia}"\nexit 1\n`);
  fs.chmodSync(programma, 0o755);
  git(dir, ['init', '-q', '-b', 'main']);
  fs.writeFileSync(path.join(dir, 'a.txt'), 'uno\n');
  git(dir, ['add', 'a.txt']);
  fs.writeFileSync(path.join(radice, 'm.txt'), 'primo\n');
  git(dir, ['commit', '-q', '-F', path.join(radice, 'm.txt')]);
  git(dir, ['branch', 'altro']);
  const incluso = path.join(radice, 'incluso.cfg');
  fs.writeFileSync(incluso, `[core]\n\tfsmonitor = ${programma.split(path.sep).join('/')}\n`);
  git(dir, ['config', 'includeIf.onbranch:altro.path', incluso.split(path.sep).join('/')]);
  git(dir, ['config', 'includeIf.onbranch:nuovo.path', incluso.split(path.sep).join('/')]);
  const partenze = () => { const n = fs.existsSync(spia) ? fs.readFileSync(spia, 'utf8').split('\n').filter(Boolean).length : 0; fs.rmSync(spia, { force: true }); return n; };
  return { dir, partenze };
}

test('GIT-SERIE-06 changing branch reads the keys again: a command that exists only on the new branch does not run (D-1)', async (t) => {
  const { dir, partenze } = cartellaColComandoSulRamo(t);
  const servizio = creaServizioGit({ cartellaDiSessione: () => dir });
  const esito = await servizio.cambiaRamo({ sessionId: 's1', ramo: 'altro' });
  assert.equal(esito.ok, true, JSON.stringify(esito));
  assert.equal(partenze(), 0, 'the state read back after the switch runs nothing');
  /* CONTROLLO: sul ramo nuovo la cartella è davvero pericolosa, un `git status` qualunque fa partire il programma */
  try { execFileSync('git', ['status'], { cwd: dir, stdio: 'ignore' }); } catch { /* il programma esce 1 */ }
  assert.ok(partenze() >= 1, 'CONTROLLO: a plain git status runs the program on that branch');
});

test('GIT-SERIE-07 creating a branch reads the keys again too (D-1)', async (t) => {
  const { dir, partenze } = cartellaColComandoSulRamo(t);
  const servizio = creaServizioGit({ cartellaDiSessione: () => dir });
  const esito = await servizio.creaRamo({ sessionId: 's1', ramo: 'nuovo' });
  assert.equal(esito.ok, true, JSON.stringify(esito));
  assert.equal(partenze(), 0, 'the state read back after the new branch runs nothing');
  try { execFileSync('git', ['status'], { cwd: dir, stdio: 'ignore' }); } catch { /* il programma esce 1 */ }
  assert.ok(partenze() >= 1, 'CONTROLLO: a plain git status runs the program on that branch');
});

test('GIT-SERIE-05 one service call reads the folder keys ONCE and hands them to all its commands (Performance), and again on the next call', async (t) => {
  const letture = [];
  const comandi = [];
  const eseguiGitFn = async (cartella, argomenti) => {
    const i = argomenti.indexOf('config');
    if (i >= 0 && argomenti.includes('--show-scope')) { letture.push(cartella); return { codice: 1, stdout: '', stderr: '' }; }
    comandi.push(argomenti.filter((x) => /^[a-z][a-z-]+$/u.test(x)).slice(0, 1).join(''));
    if (argomenti.includes('--show-toplevel')) return { codice: 0, stdout: 'C:/finto\n', stderr: '' };
    return { codice: 0, stdout: '', stderr: '' };
  };
  const servizio = creaServizioGit({ cartellaDiSessione: () => 'C:/finto', eseguiGitFn });
  await servizio.stato({ sessionId: 's1' });
  const comandiDelloStato = comandi.length;
  assert.ok(comandiDelloStato >= 2, `premessa: the state runs several git commands (${comandi.join(', ')})`);
  assert.equal(letture.length, 1, `the keys of the folder are read once for ${comandiDelloStato} commands`);
  await servizio.stato({ sessionId: 's1' });
  assert.equal(letture.length, 2, 'no cache between two calls: the next opening reads them again');
});
