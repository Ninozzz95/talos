/*
 * Git senza i comandi della configurazione del repository (`src/kernel/git-sicuro.mjs`, PROPOSTA-GIT-SICURO-2026-10-31.md rev. 3).
 * Ogni vettore si prova con Git VERO e un file-spia, e ognuno ha il suo CONTROLLO: senza la cura la spia deve scattare, o la prova
 * non sta provando niente (una spia che non scatta mai passa per costruzione).
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  ARGOMENTI_DIFF_SICURI, SEMPRE_NELLE_LETTURE, aggiunteConChiaviSpente, ambienteGitSicuro, argomentiGitSicuri, cartellaGitDelComando,
  chiaviEseguibiliLocali, leggiChiaviConAmbito,
} from '../src/kernel/git-sicuro.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

const MODULO = fileURLToPath(new URL('../src/kernel/git-sicuro.mjs', import.meta.url));
const IDENTITA = ['-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'protocol.file.allow=always'];
const git = (cwd, args, env = {}) => execFileSync('git', [...IDENTITA, ...args], { cwd, env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] }).toString();
const gitTollera = (cwd, args, env = {}) => { try { return git(cwd, args, env); } catch { return null; } };

/** Una cartella temporanea con un repo, un file committato e poi modificato, e un aggancio che scrive la spia. */
function scena(t) {
  /* `.native`: il percorso vero, come lo vedono il prodotto e Git. Sul runner di GitHub TEMP ha il nome corto 8.3 (`RUNNER~1`), e `realpathSync` di JavaScript lo lascia (ROSSO 4 della PR 91) */
  const radice = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'talos-git-sicuro-')));
  t.after(() => rimuoviCartellaDiProva(radice));
  const dir = path.join(radice, 'progetto');
  fs.mkdirSync(dir);
  const spia = path.join(radice, 'SPIA.txt');
  const aggancio = path.join(radice, 'aggancio.cjs');
  fs.writeFileSync(aggancio, `require('fs').writeFileSync(${JSON.stringify(spia)}, 'x'); process.stdin.pipe(process.stdout);\n`);
  git(dir, ['init', '-q']);
  fs.writeFileSync(path.join(dir, 'a.txt'), 'uno\n');
  git(dir, ['add', 'a.txt']);
  git(dir, ['commit', '-qm', 'x']);
  fs.writeFileSync(path.join(dir, 'a.txt'), 'due\n');
  const comando = `node "${aggancio.replace(/\\/g, '/')}"`;
  return { radice, dir, spia, comando, scattata: () => { const s = fs.existsSync(spia); fs.rmSync(spia, { force: true }); return s; } };
}

/** Prima il CONTROLLO (senza cura scatta), poi con la cura (non scatta). */
async function provaVettore(s, args, cartella = s.dir) {
  gitTollera(cartella, args);
  assert.equal(s.scattata(), true, `CONTROLLO: without the cure \`git ${args.join(' ')}\` must run the command`);
  const aggiunte = await ambienteGitSicuro(s.dir);
  assert.ok(aggiunte, 'Git answered');
  gitTollera(cartella, args, aggiunte);
  assert.equal(s.scattata(), false, `with the cure \`git ${args.join(' ')}\` runs nothing`);
  return aggiunte;
}

test('GIT-SICURO-01 core.fsmonitor of the folder: git status runs it without the cure, never with it', async (t) => {
  const s = scena(t);
  git(s.dir, ['config', 'core.fsmonitor', s.comando]);
  assert.deepEqual(await chiaviEseguibiliLocali(s.dir), ['core.fsmonitor']);
  const aggiunte = await provaVettore(s, ['status', '--porcelain']);
  assert.match(git(s.dir, ['status', '--porcelain'], aggiunte), /a\.txt/u, 'the output of Git stays right');
});

test('GIT-SICURO-02 a key brought by include.path or includeIf is still the folder\'s (never read with --local alone)', async (t) => {
  const s = scena(t);
  fs.writeFileSync(path.join(s.dir, '.git', 'incluso.cfg'), `[core]\n\tfsmonitor = ${s.comando}\n`);
  git(s.dir, ['config', 'include.path', 'incluso.cfg']);
  assert.equal(gitTollera(s.dir, ['config', '--local', '--get-regexp', '^core\\.fsmonitor$']), null, 'CONTROLLO: --local alone does not see the included key');
  assert.deepEqual(await chiaviEseguibiliLocali(s.dir), ['core.fsmonitor']);
  await provaVettore(s, ['status', '--porcelain']);
  git(s.dir, ['config', '--unset', 'include.path']);
  fs.writeFileSync(path.join(s.dir, '.git', 'condizionale.cfg'), `[core]\n\tfsmonitor = ${s.comando}\n`);
  git(s.dir, ['config', `includeIf.gitdir:${s.dir.replace(/\\/g, '/')}/.path`, 'condizionale.cfg']);
  assert.deepEqual(await chiaviEseguibiliLocali(s.dir), ['core.fsmonitor']);
  await provaVettore(s, ['status', '--porcelain']);
});

test('GIT-SICURO-03 a clean filter and a diff textconv of the folder: status, diff and add run them without the cure, never with it', async (t) => {
  const s = scena(t);
  fs.writeFileSync(path.join(s.dir, '.gitattributes'), 'a.txt filter=x diff=y\n');
  git(s.dir, ['config', 'filter.x.clean', s.comando]);
  git(s.dir, ['config', 'diff.y.textconv', s.comando]);
  assert.deepEqual((await chiaviEseguibiliLocali(s.dir)).sort(), ['diff.y.textconv', 'filter.x.clean']);
  await provaVettore(s, ['status', '--porcelain']);
  await provaVettore(s, ['diff', ...ARGOMENTI_DIFF_SICURI]);
  await provaVettore(s, ['add', 'a.txt']);
});

test('GIT-SICURO-04 the hooks copied with the folder (no key at all): status and add run them without the cure, never with it', async (t) => {
  const s = scena(t);
  const gancio = path.join(s.dir, '.git', 'hooks', 'post-index-change');
  fs.writeFileSync(gancio, `#!/bin/sh\n${s.comando}\n`);
  fs.chmodSync(gancio, 0o755);
  // `status` riscrive l'indice (e fa scattare l'aggancio) solo se c'è una voce da rinfrescare. a.txt è modificato nel contenuto, quindi
  // toccarlo non bastava: l'indice si riscriveva solo quando gli orari capitavano «di misura» (racy git), e sotto carico non capitava
  // (sesta suite del 04/11). c.txt è salvato e identico: con un orario nuovo Git deve rinfrescarlo, quindi riscrive l'indice ogni volta.
  fs.writeFileSync(path.join(s.dir, 'c.txt'), 'fermo\n');
  git(s.dir, ['add', 'c.txt']);
  git(s.dir, ['commit', '-qm', 'c']);
  s.scattata();
  let avanti = 0;
  const tocca = () => { avanti += 5; const d = new Date(Date.now() + avanti * 1000); fs.utimesSync(path.join(s.dir, 'c.txt'), d, d); };
  tocca();
  gitTollera(s.dir, ['status', '--porcelain']);
  assert.equal(s.scattata(), true, 'CONTROLLO: without the cure `git status --porcelain` must run the command');
  const aggiunte = await ambienteGitSicuro(s.dir);
  assert.ok(aggiunte, 'Git answered');
  tocca();
  gitTollera(s.dir, ['status', '--porcelain'], aggiunte);
  assert.equal(s.scattata(), false, 'with the cure `git status --porcelain` runs nothing');
  tocca();
  gitTollera(s.dir, ['status', '--porcelain']);
  assert.equal(s.scattata(), true, 'CONTROLLO: the same touch, without the cure, runs it again (so the line above proves something)');
  fs.writeFileSync(path.join(s.dir, 'b.txt'), 'nuovo\n');
  await provaVettore(s, ['add', 'b.txt']);
});

test('GIT-SICURO-05 a submodule\'s own fsmonitor is not run by the parent\'s status', async (t) => {
  const s = scena(t);
  const sorgente = path.join(s.radice, 'sorgente');
  fs.mkdirSync(sorgente);
  git(sorgente, ['init', '-q']);
  fs.writeFileSync(path.join(sorgente, 'f.txt'), 'f\n');
  git(sorgente, ['add', 'f.txt']);
  git(sorgente, ['commit', '-qm', 'f']);
  git(s.dir, ['submodule', 'add', '-q', sorgente.replace(/\\/g, '/'), 'sm']);
  git(path.join(s.dir, 'sm'), ['config', 'core.fsmonitor', s.comando]);
  assert.deepEqual(await chiaviEseguibiliLocali(s.dir), [], 'the parent has no key of its own');
  await provaVettore(s, ['status', '--porcelain']);
});

test('GIT-SICURO-06 the person\'s keys stay theirs: system and global scopes are never neutralized', async () => {
  const uscita = ['system', 'filter.lfs.clean', 'system', 'diff.astextplain.textconv', 'global', 'core.fsmonitor',
    'local', 'core.fsmonitor', 'worktree', 'filter.x.smudge', ''].join('\0');
  assert.deepEqual(leggiChiaviConAmbito(uscita).map((r) => `${r.ambito}:${r.chiave}`),
    ['system:filter.lfs.clean', 'system:diff.astextplain.textconv', 'global:core.fsmonitor', 'local:core.fsmonitor', 'worktree:filter.x.smudge']);
  assert.deepEqual(await chiaviEseguibiliLocali('C:/x', { eseguiGit: async () => uscita }), ['core.fsmonitor', 'filter.x.smudge']);
});

test('GIT-SICURO-07 GIT_CONFIG_COUNT of the person is added to, never overwritten; the always-on keys and optional locks are there', () => {
  const base = { GIT_CONFIG_COUNT: '2', GIT_CONFIG_KEY_0: 'a.b', GIT_CONFIG_VALUE_0: '1', GIT_CONFIG_KEY_1: 'c.d', GIT_CONFIG_VALUE_1: '2' };
  const aggiunte = aggiunteConChiaviSpente(base, ['core.fsmonitor', 'filter.x.clean']);
  assert.equal(aggiunte.GIT_CONFIG_KEY_0, undefined, 'the person\'s entries are not touched');
  assert.equal(aggiunte.GIT_CONFIG_COUNT, String(2 + SEMPRE_NELLE_LETTURE.length + 2));
  const coppie = Object.fromEntries(Array.from({ length: Number(aggiunte.GIT_CONFIG_COUNT) - 2 }, (_, i) => [aggiunte[`GIT_CONFIG_KEY_${i + 2}`], aggiunte[`GIT_CONFIG_VALUE_${i + 2}`]]));
  assert.deepEqual(coppie, { 'core.hooksPath': '', 'safe.bareRepository': 'explicit', 'diff.ignoreSubmodules': 'all', 'log.showSignature': 'false', 'core.fsmonitor': 'false', 'filter.x.clean': '' });
  assert.equal(aggiunte.GIT_OPTIONAL_LOCKS, '0');
  assert.equal(aggiunteConChiaviSpente({ GIT_CONFIG_COUNT: 'storto' }, []).GIT_CONFIG_KEY_0, 'core.hooksPath', 'a broken count counts as 0');
});

test('GIT-SICURO-08 AL CONTRARIO: without Git, or when Git cannot answer, no exception and no wait: null, and the caller skips', async () => {
  assert.equal(await ambienteGitSicuro('C:/x', {}, { eseguiGit: async () => null }), null);
  const figlio = spawnSync(process.execPath, ['--input-type=module', '-e',
    `const m = await import(${JSON.stringify(`file:///${MODULO.replace(/\\/g, '/')}`)}); const t0 = Date.now(); const r = await m.ambienteGitSicuro(process.cwd()); console.log(JSON.stringify({ r, ms: Date.now() - t0 }));`],
    { env: { SystemRoot: process.env.SystemRoot ?? '', PATH: '' }, encoding: 'utf8', timeout: 20_000 });
  assert.equal(figlio.status, 0, figlio.stderr);
  const { r, ms } = JSON.parse(figlio.stdout.trim());
  assert.equal(r, null, 'Git absent ⇒ null');
  assert.ok(ms < 2_000, `no wait (${ms} ms)`);
});

test('GIT-SICURO-09 the repo git really opens: -C (also repeated and relative), never the subcommand\'s own -C', () => {
  const base = path.resolve('/progetto');
  assert.equal(cartellaGitDelComando(['status'], base), base);
  assert.equal(cartellaGitDelComando(['-C', 'copiato', 'status'], base), path.join(base, 'copiato'));
  assert.equal(cartellaGitDelComando(['-C', 'a', '-C', 'b', 'status'], base), path.join(base, 'a', 'b'));
  assert.equal(cartellaGitDelComando(['-c', 'x.y=z', '-C', 'a', 'log'], base), path.join(base, 'a'));
  assert.equal(cartellaGitDelComando(['log', '-C', 'non-e-una-cartella'], base), base, 'after the subcommand -C is an option of log');
});

test('GIT-SICURO-10 the always-on cure stays even when the folder has no key (hooks and submodules have none to read)', async (t) => {
  const s = scena(t);
  const aggiunte = await ambienteGitSicuro(s.dir);
  assert.equal(aggiunte.GIT_CONFIG_KEY_0, 'core.hooksPath');
  assert.equal(aggiunte.GIT_CONFIG_VALUE_0, '');
});

test('GIT-SICURO-11 the Git tab status still SEES a dirty submodule, and runs neither its fsmonitor nor its filter', async (t) => {
  const s = scena(t);
  const sorgente = path.join(s.radice, 'sorgente');
  fs.mkdirSync(sorgente);
  git(sorgente, ['init', '-q']);
  fs.writeFileSync(path.join(sorgente, 'f.txt'), 'f\n');
  git(sorgente, ['add', 'f.txt']);
  git(sorgente, ['commit', '-qm', 'f']);
  git(s.dir, ['submodule', 'add', '-q', sorgente.replace(/\\/g, '/'), 'sm']);
  const sm = path.join(s.dir, 'sm');
  fs.writeFileSync(path.join(sm, '.gitattributes'), 'f.txt filter=z\n');
  git(sm, ['config', 'filter.z.clean', s.comando]);
  git(sm, ['config', 'core.fsmonitor', s.comando]); // il vettore misurato dal Mobile: lo status del PADRE lo esegue
  /* stessa lunghezza del contenuto committato e data cambiata: Git deve calcolarne il contenuto, cioè passarlo dal filtro (una
     lunghezza diversa basta a dire «modificato» senza filtro, e il controllo non proverebbe niente) */
  fs.writeFileSync(path.join(sm, 'f.txt'), 'g\n');
  const dopo = new Date(Date.now() + 5000);
  fs.utimesSync(path.join(sm, 'f.txt'), dopo, dopo);
  gitTollera(s.dir, ['status', '--porcelain']);
  assert.equal(s.scattata(), true, 'CONTROLLO: without the cure the parent status runs the command of the submodule');
  const argomenti = await argomentiGitSicuri(s.dir, { conSottomoduli: true });
  assert.ok(argomenti.includes('filter.z.clean='), 'the submodule filter is neutralized by name');
  assert.ok(!argomenti.some((a) => a.startsWith('diff.ignoreSubmodules')), 'the submodule is still looked at');
  const uscita = gitTollera(s.dir, [...argomenti, 'status', '--porcelain']);
  assert.equal(s.scattata(), false, 'with the cure nothing runs');
  assert.match(uscita, /sm/u, 'the dirty submodule is still reported');
});

/** Un repo INCORPORATO (voce 160000 nell'indice, la sua `.git` dentro, nessun `.gitmodules`), annidato `livelli` volte. */
function incorporati(s, livelli) {
  const catena = [];
  let dentro = s.dir;
  for (let i = 1; i <= livelli; i += 1) { dentro = path.join(dentro, `emb${i}`); catena.push(dentro); }
  for (let i = catena.length - 1; i >= 0; i -= 1) {
    const qui = catena[i];
    fs.mkdirSync(qui, { recursive: true });
    if (!fs.existsSync(path.join(qui, '.git'))) git(qui, ['init', '-q']);
    fs.writeFileSync(path.join(qui, `f${i}.txt`), 'f\n');
    git(qui, ['add', '-A']);
    git(qui, ['commit', '-qm', `livello ${i + 1}`]);
  }
  git(s.dir, ['add', path.basename(catena[0])]);
  git(s.dir, ['commit', '-qm', 'incorporato']);
  return catena;
}

test('GIT-SICURO-12 an EMBEDDED repo (gitlink in the index, no .gitmodules) is found from the index: its fsmonitor is off, and it is still looked at', async (t) => {
  const s = scena(t);
  const [emb] = incorporati(s, 1);
  assert.equal(fs.existsSync(path.join(s.dir, '.gitmodules')), false);
  git(emb, ['config', 'core.fsmonitor', s.comando]);
  fs.writeFileSync(path.join(emb, 'f0.txt'), 'g\n');
  gitTollera(s.dir, ['status', '--porcelain']);
  assert.equal(s.scattata(), true, 'CONTROLLO: the parent status runs the command of the embedded repo');
  const argomenti = await argomentiGitSicuri(s.dir, { conSottomoduli: true });
  assert.ok(!argomenti.some((a) => a.startsWith('diff.ignoreSubmodules')), 'complete: the person\'s own choice stays');
  const uscita = gitTollera(s.dir, [...argomenti, 'status', '--porcelain']);
  assert.equal(s.scattata(), false);
  assert.match(uscita, /emb1/u, 'the dirty embedded repo is still reported');
});

test('GIT-SICURO-13 beyond 3 levels (or a failed read) the safe fallback: diff.ignoreSubmodules=dirty, and nothing runs', async (t) => {
  const s = scena(t);
  const catena = incorporati(s, 4);
  for (const qui of catena) git(qui, ['config', 'core.fsmonitor', s.comando]);
  const argomenti = await argomentiGitSicuri(s.dir, { conSottomoduli: true });
  assert.ok(argomenti.includes('diff.ignoreSubmodules=dirty'), argomenti.join(' '));
  gitTollera(s.dir, [...argomenti, 'status', '--porcelain']);
  assert.equal(s.scattata(), false);
  const rotto = await argomentiGitSicuri(s.dir, { conSottomoduli: true, eseguiGit: async (args, cwd) => (args.includes('ls-files') ? null : (cwd === s.dir && args[0] === 'rev-parse' ? `${s.dir}\n` : '')) });
  assert.ok(rotto.includes('diff.ignoreSubmodules=dirty'), 'a failed read of the index never proceeds halfway');
});
