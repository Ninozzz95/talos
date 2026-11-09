/**
 * git-service-rinomine.test.mjs — la lettura delle rinomine per il cancello del ponte (revisione delle cure 4 del Mobile, D2 e D4). Serve solo a sapere quali nomi sono legati: non esce verso il
 *   dispositivo. ⛔ Repository VERI: che cosa git riconosce come rinomina, e da dove, è un fatto di git.
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, realpathSync, renameSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';
import { creaServizioGit } from '../src/git-service.mjs';

const g = (cwd, ...a) => execFileSync('git', a, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
const TESTO = 'una riga che si riconosce\n'.repeat(8);

function repository(t) {
  const base = realpathSync.native(mkdtempSync(join(tmpdir(), 'talos-rinomine-')));
  t.after(() => rimuoviCartellaDiProva(base));
  const dir = join(base, 'r');
  mkdirSync(join(dir, 'sub'), { recursive: true }); mkdirSync(join(dir, 'fuori'));
  g(dir, 'init', '-q', '-b', 'main'); g(dir, 'config', 'user.email', 'a@example.invalid'); g(dir, 'config', 'user.name', 'A');
  writeFileSync(join(dir, 'fuori', 'k.txt'), TESTO); writeFileSync(join(dir, 'sub', 's.txt'), 'dentro\n');
  g(dir, 'add', '.'); g(dir, 'commit', '-q', '-m', 'primo');
  const cartella = join(dir, 'sub');
  return { base, cartella, dir, servizio: creaServizioGit({ cartellaDiSessione: () => cartella }) };
}
const USCITA = [{ prima: 'fuori/k.txt', percorso: 'sub/n.txt' }];

test('RINOMINE-01 dalla sottocartella legge tutto il repository, coi percorsi della radice', async (t) => {
  const { dir, servizio } = repository(t);
  g(dir, 'mv', 'fuori/k.txt', 'sub/n.txt');
  const letta = await servizio.rinomineDelRepository({ sessionId: 's' });
  assert.deepEqual(letta.coppie, USCITA);
  assert.equal(realpathSync.native(letta.radiceRepo), realpathSync.native(dir));
});

test('RINOMINE-02 anche una rinomina tutta fuori dalla cartella della sessione', async (t) => {
  const { dir, servizio } = repository(t);
  g(dir, 'mv', 'fuori/k.txt', 'fuori/n.txt');
  assert.deepEqual((await servizio.rinomineDelRepository({ sessionId: 's' })).coppie, [{ prima: 'fuori/k.txt', percorso: 'fuori/n.txt' }]);
});

test('RINOMINE-03 fra due commit, nei due versi, anche con le chiavi del repository che la spegnerebbero', async (t) => {
  const { dir, servizio } = repository(t);
  const prima = g(dir, 'rev-parse', 'HEAD').trim();
  g(dir, 'mv', 'fuori/k.txt', 'sub/n.txt'); g(dir, 'commit', '-q', '-m', 'via');
  const dopo = g(dir, 'rev-parse', 'HEAD').trim();
  g(dir, 'config', 'diff.renames', 'false'); g(dir, 'config', 'diff.relative', 'true');
  assert.deepEqual((await servizio.rinomineDelRepository({ sessionId: 's', confronto: { da: prima, a: dopo } })).coppie, USCITA);
  assert.deepEqual((await servizio.rinomineDelRepository({ sessionId: 's', confronto: { da: dopo, a: prima } })).coppie, [{ prima: 'sub/n.txt', percorso: 'fuori/k.txt' }]);
  assert.deepEqual((await servizio.rinomineDelRepository({ sessionId: 's', confronto: { a: dopo } })).coppie, USCITA, 'senza `da`, contro il padre');
});

test('RINOMINE-04 con `status.renames` spento, e con un file segnato «da aggiungere»', async (t) => {
  const { dir, servizio } = repository(t);
  g(dir, 'config', 'status.renames', 'false'); g(dir, 'config', 'diff.renames', 'false');
  g(dir, 'mv', 'fuori/k.txt', 'sub/n.txt');
  assert.deepEqual((await servizio.rinomineDelRepository({ sessionId: 's' })).coppie, USCITA);
  g(dir, 'reset', '-q');
  g(dir, 'add', '-N', 'sub/n.txt');
  assert.deepEqual((await servizio.rinomineDelRepository({ sessionId: 's' })).coppie, USCITA);
});

test('RINOMINE-05 senza commit e senza rinomine non è un guasto; fuori da un repository, e un commit storto, sì', async (t) => {
  const { base, servizio } = repository(t);
  assert.deepEqual((await servizio.rinomineDelRepository({ sessionId: 's' })).coppie, []);
  assert.equal((await servizio.rinomineDelRepository({ sessionId: 's', confronto: { a: 'non-un-commit' } })).code, 'GIT_COMMIT_INVALID');
  assert.equal((await servizio.rinomineDelRepository({ sessionId: 's', confronto: { a: 'a'.repeat(40) } })).code, 'GIT_COMMIT_UNKNOWN');
  const nuovo = join(base, 'nuovo');
  mkdirSync(nuovo);
  g(nuovo, 'init', '-q', '-b', 'main');
  writeFileSync(join(nuovo, 'x.txt'), TESTO); g(nuovo, 'add', '.');
  assert.deepEqual((await creaServizioGit({ cartellaDiSessione: () => nuovo }).rinomineDelRepository({ sessionId: 's' })).coppie, [], 'un repository senza commit');
  const vuota = join(base, 'vuota');
  mkdirSync(vuota);
  assert.equal((await creaServizioGit({ cartellaDiSessione: () => vuota }).rinomineDelRepository({ sessionId: 's' })).code, 'GIT_NOT_A_REPOSITORY');
  assert.equal((await creaServizioGit({ cartellaDiSessione: () => null }).rinomineDelRepository({ sessionId: 's' })).code, 'NOT_FOUND');
});

test('RINOMINE-06 lancia git senza pathspec, senza tetto e col riconoscimento forzato', async () => {
  const lanciati = [];
  const spia = creaServizioGit({ cartellaDiSessione: () => 'C:\\progetto', eseguiGitFn: async (_c, argomenti) => {
    lanciati.push(argomenti);
    return { codice: 0, stdout: argomenti.includes('rev-parse') ? 'C:/progetto\n\n' : '', stderr: '' };
  } });
  await spia.rinomineDelRepository({ sessionId: 's' });
  const diff = lanciati.filter((a) => a.includes('--diff-filter=R'));
  assert.equal(diff.length, 3, 'il preparato, il lavoro e HEAD (N1)');
  assert.equal(diff.filter((a) => a.includes('HEAD')).length, 1);
  assert.equal(diff.filter((a) => a.includes('--cached')).length, 1);
  for (const a of diff) {
    for (const opzione of ['--find-renames', '-l0', '--no-relative', '--name-status', '-z']) assert.ok(a.includes(opzione), `${opzione} in ${a.join(' ')}`);
    assert.equal(a.includes('--'), false, 'senza pathspec');
  }
});

test('RINOMINE-30 N1: la rinomina mezza preparata si vede solo contro HEAD, e una volta sola', async (t) => {
  const { cartella, dir, servizio } = repository(t);
  renameSync(join(dir, 'fuori', 'k.txt'), join(cartella, 'n.txt'));
  g(cartella, 'add', '.');
  assert.deepEqual((await servizio.rinomineDelRepository({ sessionId: 's' })).coppie, USCITA);
});

test('RINOMINE-31 N1: un repository senza commit non è un guasto', async (t) => {
  const base = realpathSync.native(mkdtempSync(join(tmpdir(), 'talos-rinomine-')));
  t.after(() => rimuoviCartellaDiProva(base));
  g(base, 'init', '-q', '-b', 'main');
  const letta = await creaServizioGit({ cartellaDiSessione: () => base }).rinomineDelRepository({ sessionId: 's' });
  assert.deepEqual(letta.coppie, []);
});

test('RINOMINE-32 N3: la radice tiene il suo nome, anche con uno spazio Unicode in coda', async (t) => {
  const base = realpathSync.native(mkdtempSync(join(tmpdir(), 'talos-rinomine-')));
  t.after(() => rimuoviCartellaDiProva(base));
  const dir = join(base, 'repo\u00a0');
  mkdirSync(dir);
  g(dir, 'init', '-q', '-b', 'main');
  const letta = await creaServizioGit({ cartellaDiSessione: () => dir }).rinomineDelRepository({ sessionId: 's' });
  assert.equal(letta.radiceRepo.replaceAll('\\', '/'), dir.replaceAll('\\', '/'));
});

test('RINOMINE-33 una radice che non interessa non costa le letture', async (t) => {
  const { dir, servizio } = repository(t);
  let radice = null;
  assert.deepEqual((await servizio.rinomineDelRepository({ sessionId: 's', riguarda: (r) => { radice = r; return false; } })).coppie, []);
  assert.equal(radice.replaceAll('\\', '/'), dir.replaceAll('\\', '/'));
});

test('STASH-NOMI D3: da una cartella col nome accentato la voce messa da parte si riprende', async (t) => {
  const base = realpathSync.native(mkdtempSync(join(tmpdir(), 'talos-rinomine-')));
  t.after(() => rimuoviCartellaDiProva(base));
  const cartella = join(base, 'città');
  mkdirSync(cartella);
  g(base, 'init', '-q', '-b', 'main'); g(base, 'config', 'user.email', 'a@example.invalid'); g(base, 'config', 'user.name', 'A');
  writeFileSync(join(cartella, 'x.txt'), 'uno\n'); g(base, 'add', '.'); g(base, 'commit', '-q', '-m', 'primo');
  writeFileSync(join(cartella, 'x.txt'), 'due\n'); g(base, 'stash', 'push', '-q');
  const commit = g(base, 'rev-parse', 'stash@{0}').trim();
  const esito = await creaServizioGit({ cartellaDiSessione: () => cartella }).riprendiAccantonato({ sessionId: 's', indice: 0, commit });
  assert.equal(esito.ok, true, JSON.stringify(esito).slice(0, 200));
});
