/*
 * git-service-per-la-pr.test.mjs — F6-3 (27/09/2026, decisione 25): la bozza di una PR in sola lettura. Repository VERO e un
 * remoto «bare» vero su disco: la base scritta per il ramo (`gh-merge-base`, come `gh pr create`), la base predefinita, i rami
 * del remoto e i commit che la base non ha. Al contrario: un remoto o una base che non sono del repository si rifiutano per nome.
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { creaServizioGit } from '../src/git-service.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

function mondo(t) {
  const base = mkdtempSync(join(tmpdir(), 'talos-git-per-la-pr-'));
  t.after(() => rimuoviCartellaDiProva(base));
  const esegui = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } });
  const remoto = join(base, 'remoto.git');
  execFileSync('git', ['init', '-q', '--bare', '-b', 'main', remoto], { encoding: 'utf8' });
  const dir = join(base, 'A');
  execFileSync('git', ['clone', '-q', remoto, dir], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  const g = (...args) => esegui(dir, ...args);
  g('config', 'user.email', 'a@example.invalid'); g('config', 'user.name', 'A');
  const commit = (nome, messaggio) => { writeFileSync(join(dir, nome), `${nome}\n`); g('add', nome); g('commit', '-q', '-m', messaggio); };
  commit('a.txt', 'primo');
  g('push', '-q', '-u', 'origin', 'main');
  g('remote', 'set-head', 'origin', 'main'); // `refs/remotes/origin/HEAD`, come in ogni clone di un remoto non vuoto: non è una base
  g('switch', '-q', '-c', 'rilascio'); g('push', '-q', '-u', 'origin', 'rilascio'); g('switch', '-q', 'main');
  const servizio = creaServizioGit({ cartellaDiSessione: (id) => (id === 's' ? dir : null) });
  return { dir, g, commit, servizio };
}

test('PR-BOZZA-01 — base predefinita, rami del remoto, i commit del ramo dal più recente; col corpo', async (t) => {
  const { g, commit, servizio } = mondo(t);
  g('switch', '-q', '-c', 'feat/pr-tab');
  commit('b.txt', 'aggiunge la scheda');
  writeFileSync(join(g('rev-parse', '--show-toplevel').trim(), 'c.txt'), 'c\n'); g('add', 'c.txt'); g('commit', '-q', '-m', 'le prove', '-m', 'con un corpo\nsu due righe');
  const r = await servizio.perLaPr({ sessionId: 's', remoto: 'origin', basePredefinita: 'main' });
  assert.equal(r.erroreAvvio, undefined, r.erroreAvvio);
  assert.deepEqual([r.ramo, r.remoto, r.base, r.baseConfigurata, r.baseTrovata], ['feat/pr-tab', 'origin', 'main', null, true]);
  assert.deepEqual(r.ramiRemoti, ['main', 'rilascio'], 'i rami del remoto, senza HEAD');
  assert.deepEqual(r.commit.map((c) => c.soggetto), ['le prove', 'aggiunge la scheda'], 'dal più recente, solo quelli che la base non ha');
  assert.equal(r.commit[0].corpo, 'con un corpo\nsu due righe');
  assert.match(r.commit[0].hash, /^[0-9a-f]{40}$/u);
});

test('PR-BOZZA-01b — oltre 250 commit la lista si taglia e LO DICE (`commitOltre`); a 250 esatti no', async (t) => {
  const { dir, g, servizio } = mondo(t);
  /* 251 commit vuoti in un processo solo (`git fast-import`), sopra main */
  const flusso = (quanti, ramo) => Array.from({ length: quanti }, (_, i) => `commit refs/heads/${ramo}\ncommitter A <a@example.invalid> ${1_700_000_000 + i} +0000\ndata ${String(i).length + 1}\nc${i}\n${i === 0 ? 'from refs/heads/main\n' : ''}\n`).join('');
  execFileSync('git', ['fast-import', '--quiet'], { cwd: dir, input: flusso(251, 'lungo'), stdio: ['pipe', 'pipe', 'pipe'] });
  execFileSync('git', ['fast-import', '--quiet'], { cwd: dir, input: flusso(250, 'giusto'), stdio: ['pipe', 'pipe', 'pipe'] });
  g('switch', '-q', 'lungo');
  let r = await servizio.perLaPr({ sessionId: 's', remoto: 'origin', basePredefinita: 'main' });
  assert.deepEqual([r.commit.length, r.commitOltre, r.commit[0].soggetto], [250, true, 'c250']);
  g('switch', '-q', 'giusto');
  r = await servizio.perLaPr({ sessionId: 's', remoto: 'origin', basePredefinita: 'main' });
  assert.deepEqual([r.commit.length, r.commitOltre], [250, false]);
});

test('PR-BOZZA-02 — la base scritta per il ramo vince sulla predefinita; una base chiesta vince su tutte', async (t) => {
  const { g, commit, servizio } = mondo(t);
  g('switch', '-q', '-c', 'lavoro');
  commit('b.txt', 'uno');
  g('config', 'branch.lavoro.gh-merge-base', 'rilascio');
  let r = await servizio.perLaPr({ sessionId: 's', remoto: 'origin', basePredefinita: 'main' });
  assert.deepEqual([r.base, r.baseConfigurata, r.baseTrovata, r.commit.length], ['rilascio', 'rilascio', true, 1]);
  r = await servizio.perLaPr({ sessionId: 's', remoto: 'origin', base: 'main', basePredefinita: 'main' });
  assert.equal(r.base, 'main');
});

test('PR-BOZZA-03 — al contrario: un remoto che non è del repository, una base che non è un nome di ramo, e una base che il remoto non ha', async (t) => {
  const { g, commit, servizio } = mondo(t);
  g('switch', '-q', '-c', 'lavoro');
  commit('b.txt', 'uno');
  assert.equal((await servizio.perLaPr({ sessionId: 's', remoto: 'altro' })).code, 'GIT_REMOTE_UNKNOWN');
  assert.equal((await servizio.perLaPr({ sessionId: 's', remoto: '--upload-pack=x' })).code, 'GIT_REMOTE_UNKNOWN');
  assert.equal((await servizio.perLaPr({ sessionId: 's', remoto: 'origin', base: '--all' })).code, 'GIT_BRANCH_INVALID');
  assert.equal((await servizio.perLaPr({ sessionId: 's', remoto: 'origin', base: 'a..b' })).code, 'GIT_BRANCH_INVALID');
  const assente = await servizio.perLaPr({ sessionId: 's', remoto: 'origin', base: 'non-esiste' });
  assert.deepEqual([assente.base, assente.baseTrovata, assente.commit], ['non-esiste', false, []], 'non un errore: la base non è (ancora) sul remoto');
  const senza = await servizio.perLaPr({ sessionId: 's', remoto: 'origin' });
  assert.deepEqual([senza.base, senza.baseTrovata], [null, false], 'nessuna base scritta né predefinita: nessuna base inventata');
  g('switch', '-q', '--detach');
  assert.equal((await servizio.perLaPr({ sessionId: 's', remoto: 'origin', basePredefinita: 'main' })).code, 'GIT_DETACHED');
});
