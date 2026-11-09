/*
 * Git sicuro nei POSTI dove TALOS lancia Git da solo (PROPOSTA-GIT-SICURO-2026-10-31.md, rev. 4). Con Git vero e un file-spia: lo stato
 * della cartella a ogni giro (`workspace-info`), le guardie del lavoro della persona (`guardie-attese-e-lavoro`), lo stato della scheda
 * Git (`git-service`) non eseguono niente; AL CONTRARIO un'azione della persona (aggiungi dalla scheda Git) fa girare il suo filtro
 * come in ogni IDE. Ogni prova ha il suo CONTROLLO: lo stesso `git status` senza cura esegue il comando.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { statoGit } from '../src/workspace-info.mjs';
import { statoDelRepository } from '../src/kernel/guardie-attese-e-lavoro.mjs';
import { creaServizioGit } from '../src/git-service.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

const IDENTITA = ['-c', 'user.name=t', '-c', 'user.email=t@t'];
const git = (cwd, args) => execFileSync('git', [...IDENTITA, ...args], { cwd, stdio: ['ignore', 'pipe', 'pipe'] }).toString();
const gitTollera = (cwd, args) => { try { return git(cwd, args); } catch { return null; } };

/** Un repo copiato con TUTTI i vettori di `status`: fsmonitor, filtro clean, gancio post-index-change. */
function repoCopiato(t) {
  const radice = fs.mkdtempSync(path.join(os.tmpdir(), 'talos-git-posti-'));
  t.after(() => rimuoviCartellaDiProva(radice));
  const dir = path.join(radice, 'progetto');
  fs.mkdirSync(dir);
  const spia = path.join(radice, 'SPIA.txt');
  const aggancio = path.join(radice, 'aggancio.cjs');
  /* lo stdin si legge SOLO da filtro: un gancio o un fsmonitor che aspettasse lo stdin resterebbe appeso fino al tempo massimo (61 s) */
  fs.writeFileSync(aggancio, `require('fs').writeFileSync(${JSON.stringify(spia)}, 'x'); if (process.argv.includes('--filtro')) process.stdin.pipe(process.stdout);\n`);
  const comando = `node "${aggancio.split(path.sep).join('/')}"`;
  git(dir, ['init', '-q']);
  fs.writeFileSync(path.join(dir, 'a.txt'), 'uno\n');
  git(dir, ['add', 'a.txt']);
  git(dir, ['commit', '-qm', 'x']);
  fs.writeFileSync(path.join(dir, '.gitattributes'), 'a.txt filter=x\n');
  git(dir, ['config', 'filter.x.clean', `${comando} --filtro`]);
  git(dir, ['config', 'core.fsmonitor', comando]);
  const gancio = path.join(dir, '.git', 'hooks', 'post-index-change');
  fs.writeFileSync(gancio, `#!/bin/sh\n${comando}\n`);
  fs.chmodSync(gancio, 0o755);
  fs.writeFileSync(path.join(dir, 'a.txt'), 'due\n');
  const scattata = () => { const s = fs.existsSync(spia); fs.rmSync(spia, { force: true }); return s; };
  gitTollera(dir, ['status', '--porcelain']);
  assert.equal(scattata(), true, 'CONTROLLO: the copied repo runs its command on a plain git status');
  return { dir, scattata };
}

test('GIT-POSTI-01 the folder state read at every turn (workspace-info) runs nothing and still reads the changes', async (t) => {
  const r = repoCopiato(t);
  const stato = await statoGit(r.dir, { profondita: 0 });
  assert.equal(r.scattata(), false);
  assert.ok(stato.nonSalvate >= 1, 'the changes are still counted');
});

test('GIT-POSTI-02 the guard of the person\'s work (kernel) runs nothing and still lists the changed file', async (t) => {
  const r = repoCopiato(t);
  const stato = await statoDelRepository(r.dir);
  assert.equal(r.scattata(), false);
  assert.equal(stato.repository, true);
  assert.ok(stato.voci.some((v) => String(v.percorso ?? v.percorsoRepo ?? '').includes('a.txt')), JSON.stringify(stato.voci));
});

test('GIT-POSTI-03 the Git tab status runs nothing; AL CONTRARIO the person\'s own «stage» still runs the filter, like in any IDE', async (t) => {
  const r = repoCopiato(t);
  const servizio = creaServizioGit({ cartellaDiSessione: () => r.dir });
  const stato = await servizio.stato({ sessionId: 's1' });
  assert.equal(r.scattata(), false, 'an automatic read runs nothing');
  assert.ok(stato.voci.some((v) => v.percorso === 'a.txt'));
  await servizio.stage({ sessionId: 's1', percorsi: ['a.txt'] });
  assert.equal(r.scattata(), true, 'an action of the person runs the project filter as it always did');
});

test('GIT-POSTI-04 the Git tab status still shows a dirty submodule (it neutralizes its keys instead of not looking)', async (t) => {
  const r = repoCopiato(t);
  const sorgente = path.join(path.dirname(r.dir), 'sorgente');
  fs.mkdirSync(sorgente);
  git(sorgente, ['init', '-q']);
  fs.writeFileSync(path.join(sorgente, 'f.txt'), 'f\n');
  git(sorgente, ['add', 'f.txt']);
  git(sorgente, ['commit', '-qm', 'f']);
  git(r.dir, ['-c', 'protocol.file.allow=always', 'submodule', 'add', '-q', sorgente.split(path.sep).join('/'), 'sm']);
  git(r.dir, ['commit', '-qm', 'sottomodulo']);
  fs.writeFileSync(path.join(r.dir, 'sm', 'f.txt'), 'sporco\n');
  r.scattata();
  const stato = await creaServizioGit({ cartellaDiSessione: () => r.dir }).stato({ sessionId: 's1' });
  assert.equal(r.scattata(), false);
  assert.ok(stato.voci.some((v) => v.percorso === 'sm'), `the dirty submodule is listed: ${stato.voci.map((v) => v.percorso).join(', ')}`);
});
