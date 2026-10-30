import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { analizzaNumstat, creaServizioGit } from '../src/git-service.mjs';

/*
 * ⭐ G-05 (pannello v2, owner 29/10/2026) — i +/− di ogni file contro HEAD nella lettura dello stato. Forma di `git diff --numstat -z`
 *   (git-scm «diff-format», letto il 29/10/2026). Si prova sul parser e sul dato VERO di un repository temporaneo, anche al contrario.
 */
test('G05-01 — numstat -z: file normali, binari senza numeri, rinomini col nome nuovo, righe rotte', () => {
  const testo = '3\t1\tsrc/a.js\x00-\t-\timmagine.png\x00' + '2\t0\t\x00vecchio.md\x00nuovo.md\x00' + 'rotta\x00' + '0\t5\tvia.txt\x00';
  const c = analizzaNumstat(testo);
  assert.deepEqual(c.get('src/a.js'), { aggiunte: 3, rimozioni: 1 });
  assert.deepEqual(c.get('immagine.png'), { aggiunte: null, rimozioni: null }, 'un binario non porta numeri, mai «+0»');
  assert.deepEqual(c.get('nuovo.md'), { aggiunte: 2, rimozioni: 0 });
  assert.equal(c.has('vecchio.md'), false);
  assert.deepEqual(c.get('via.txt'), { aggiunte: 0, rimozioni: 5 });
  assert.equal(analizzaNumstat('').size, 0);
  assert.equal(analizzaNumstat(undefined).size, 0);
});

const git = (cartella, ...a) => execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...a], { cwd: cartella, encoding: 'utf8' });

test('G05-02 — sul dato VERO: un file modificato porta i suoi +/−; un file nuovo e un repository senza commit NO', { timeout: 60_000 }, async (t) => {
  const cartella = mkdtempSync(join(tmpdir(), 'talos-g05-'));
  t.after(() => rimuoviCartellaDiProva(cartella));
  git(cartella, 'init', '-q');
  writeFileSync(join(cartella, 'a.txt'), 'uno\ndue\ntre\n');
  const servizio = creaServizioGit({ cartellaDiSessione: (id) => (id === 's' ? cartella : null) });
  /* AL CONTRARIO: senza commit non c'è HEAD, e niente numeri (nessuna eccezione) */
  const primo = await servizio.stato({ sessionId: 's' });
  assert.ok(primo.voci.every((v) => v.aggiunte === undefined), JSON.stringify(primo.voci));
  git(cartella, 'add', 'a.txt');
  /* preparato ma senza commit: `git diff HEAD` fallisce (HEAD non c'è) e la lettura dello stato riesce lo stesso, senza numeri */
  const preparato = await servizio.stato({ sessionId: 's' });
  assert.equal(preparato.voci.find((v) => v.percorso === 'a.txt')?.aggiunte, undefined);
  git(cartella, 'commit', '-q', '-m', 'primo');
  writeFileSync(join(cartella, 'a.txt'), 'uno\nDUE\ntre\nquattro\n');
  writeFileSync(join(cartella, 'nuovo.txt'), 'x\n');
  const dopo = await servizio.stato({ sessionId: 's' });
  const a = dopo.voci.find((v) => v.percorso === 'a.txt');
  assert.deepEqual([a.aggiunte, a.rimozioni], [2, 1]);
  const nuovo = dopo.voci.find((v) => v.percorso === 'nuovo.txt');
  assert.equal(nuovo.aggiunte, undefined, 'un file nuovo (??) resta senza numeri: contarli vorrebbe leggerlo');
});
