/**
 * git-service-f6-pezzi.test.mjs — F6-1 (26/09/2026): preparare, togliere e annullare UN pezzo del diff di un file. Decisione
 * dell'owner su F6 (memoria `decisioni-owner-f6-github-26-09`): «prepara/togli/annulla per file, gruppo e pezzo». Ledger
 * `.claude/LEDGER-F6-GITHUB-2026-09-26.md`, scelta 3.
 *
 * ⛔ Repository VERI, e i casi che la misura del 26/09 ha dichiarato: la sessione in una SOTTOCARTELLA (i percorsi del diff
 *   partono dalla radice), un file CRLF sotto `core.autocrlf=true` (il caso di Windows: annullare rimette i byte, CRLF
 *   compresi), `apply.whitespace=error` con spazi in coda (senza `--whitespace=nowarn` git si ferma).
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { creaServizioGit } from '../src/git-service.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

const RIGHE = ['uno', 'due', 'tre', 'quattro', 'cinque', 'sei', 'sette', 'otto', 'nove', 'dieci', 'undici', 'dodici'];

/** Un repository con `s/f.txt` di dodici righe committato, e la sessione nella sottocartella `s`. */
function repoConFile(t, { autocrlf = 'false', eol = '\n' } = {}) {
  const base = mkdtempSync(join(tmpdir(), 'talos-git-pezzi-'));
  t.after(() => rimuoviCartellaDiProva(base));
  const g = (...args) => execFileSync('git', args, { cwd: base, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  g('init', '-q');
  g('config', 'user.email', 'prova@example.invalid');
  g('config', 'user.name', 'Prova');
  g('config', 'core.autocrlf', autocrlf);
  const sessione = join(base, 's');
  mkdirSync(sessione);
  const scrivi = (righe) => writeFileSync(join(sessione, 'f.txt'), righe.join(eol) + eol);
  scrivi(RIGHE);
  g('add', '-A');
  g('commit', '-q', '-m', 'base');
  // due pezzi lontani: la prima riga e l'ultima (con due spazi in coda)
  scrivi(['UNO', ...RIGHE.slice(1, 11), 'DODICI  ']);
  return { base, g, sessione, scrivi, git: creaServizioGit({ cartellaDiSessione: (id) => (id === 's' ? sessione : null) }) };
}

const ok = (esito) => { assert.ok(!('erroreAvvio' in esito), `${esito.code}: ${esito.erroreAvvio}`); return esito; };

test('F6-1 pezzi — preparare il PRIMO pezzo da una sottocartella: l\'indice prende quello solo, l\'albero non si tocca', async (t) => {
  const { g, sessione, git } = repoConFile(t);
  const prima = readFileSync(join(sessione, 'f.txt'));
  const d = ok(await git.diff({ sessionId: 's', percorso: 'f.txt', area: 'lavoro' }));
  assert.equal(d.testo.split('\n').filter((r) => r.startsWith('@@ ')).length, 2, 'la prova vuole due pezzi');
  ok(await git.pezzo({ sessionId: 's', percorso: 'f.txt', area: 'lavoro', indice: 0, impronta: d.impronta, azione: 'prepara' }));
  const indice = g('show', ':s/f.txt').split('\n');
  assert.equal(indice[0], 'UNO');
  assert.equal(indice[11], 'dodici', 'il secondo pezzo non è stato preparato');
  assert.ok(readFileSync(join(sessione, 'f.txt')).equals(prima), 'l\'albero è rimasto com\'era');
  // e resta un solo pezzo da preparare: l'ultimo
  const resto = ok(await git.diff({ sessionId: 's', percorso: 'f.txt', area: 'lavoro' }));
  assert.equal(resto.testo.split('\n').filter((r) => r.startsWith('@@ ')).length, 1);
  assert.match(resto.testo, /^\+DODICI {2}$/mu);
});

test('F6-1 pezzi — con apply.whitespace=error il pezzo con spazi in coda si prepara lo stesso (--whitespace=nowarn)', async (t) => {
  const { g, git } = repoConFile(t);
  g('config', 'apply.whitespace', 'error');
  const d = ok(await git.diff({ sessionId: 's', percorso: 'f.txt', area: 'lavoro' }));
  ok(await git.pezzo({ sessionId: 's', percorso: 'f.txt', area: 'lavoro', indice: 1, impronta: d.impronta, azione: 'prepara' }));
  assert.equal(g('show', ':s/f.txt').split('\n')[11], 'DODICI  ');
});

test('F6-1 pezzi — togliere un pezzo preparato lo rimette fra i da preparare, e non tocca un cambio di MODO del file', async (t) => {
  const { g, git } = repoConFile(t);
  g('add', '--', 's/f.txt');
  g('update-index', '--chmod=+x', 's/f.txt'); // l'indice dice 100755: un cambio di modo preparato, insieme ai due pezzi
  const d = ok(await git.diff({ sessionId: 's', percorso: 'f.txt', area: 'preparato' }));
  assert.match(d.testo, /^new mode 100755$/mu, 'la prova vuole un cambio di modo nel diff');
  ok(await git.pezzo({ sessionId: 's', percorso: 'f.txt', area: 'preparato', indice: 0, impronta: d.impronta, azione: 'togli' }));
  const indice = g('show', ':s/f.txt').split('\n');
  assert.equal(indice[0], 'uno', 'il primo pezzo è tornato fuori dall\'indice');
  assert.equal(indice[11], 'DODICI  ', 'il secondo è rimasto preparato');
  assert.match(g('ls-files', '-s', '--', 's/f.txt'), /^100755 /u, 'il modo non l\'ha scelto nessuno: resta com\'era');
});

test('F6-1 pezzi — annullare un pezzo nell\'albero con CRLF e autocrlf=true rimette i byte, CRLF compresi', async (t) => {
  const { sessione, git } = repoConFile(t, { autocrlf: 'true', eol: '\r\n' });
  const d = ok(await git.diff({ sessionId: 's', percorso: 'f.txt', area: 'lavoro' }));
  ok(await git.pezzo({ sessionId: 's', percorso: 'f.txt', area: 'lavoro', indice: 1, impronta: d.impronta, azione: 'annulla' }));
  const atteso = Buffer.from(['UNO', ...RIGHE.slice(1)].join('\r\n') + '\r\n');
  assert.ok(readFileSync(join(sessione, 'f.txt')).equals(atteso), 'il file non è tornato byte per byte');
});

test('F6-1 pezzi — i rifiuti per NOME: diff cambiato, pezzo o azione o area che non esistono, file nuovo', async (t) => {
  const { sessione, scrivi, git, g } = repoConFile(t);
  const d = ok(await git.diff({ sessionId: 's', percorso: 'f.txt', area: 'lavoro' }));
  scrivi(['UNO', ...RIGHE.slice(1, 11), 'DODICI  ', 'tredici']);
  assert.equal((await git.pezzo({ sessionId: 's', percorso: 'f.txt', area: 'lavoro', indice: 0, impronta: d.impronta, azione: 'prepara' })).code, 'GIT_DIFF_CHANGED');
  const d2 = ok(await git.diff({ sessionId: 's', percorso: 'f.txt', area: 'lavoro' }));
  for (const [indice, area, azione] of [[2, 'lavoro', 'prepara'], [5, 'lavoro', 'prepara'], [-1, 'lavoro', 'prepara'], ['0', 'lavoro', 'prepara'], [0, 'preparato', 'prepara'], [0, 'lavoro', 'togli'], [0, 'lavoro', 'cancella']]) {
    const esito = await git.pezzo({ sessionId: 's', percorso: 'f.txt', area, indice, impronta: d2.impronta, azione });
    assert.ok(['GIT_HUNK_INVALID', 'GIT_PATH_UNCHANGED'].includes(esito.code), `${JSON.stringify([indice, area, azione])} → ${esito.code}`);
  }
  assert.equal(g('diff', '--cached', '--name-only').trim(), '', 'nessuna di queste ha preparato niente');
  writeFileSync(join(sessione, 'nuovo.txt'), 'a\nb\n');
  const dn = ok(await git.diff({ sessionId: 's', percorso: 'nuovo.txt', area: 'lavoro' }));
  assert.equal((await git.pezzo({ sessionId: 's', percorso: 'nuovo.txt', area: 'lavoro', indice: 0, impronta: dn.impronta, azione: 'prepara' })).code, 'GIT_HUNK_UNSUPPORTED');
});

test('F6-1 pezzi — l\'impronta del diff cambia col testo e resta uguale altrimenti', async (t) => {
  const { scrivi, git } = repoConFile(t);
  const a = ok(await git.diff({ sessionId: 's', percorso: 'f.txt', area: 'lavoro' })).impronta;
  const b = ok(await git.diff({ sessionId: 's', percorso: 'f.txt', area: 'lavoro' })).impronta;
  assert.equal(a, b);
  scrivi(['UNO', ...RIGHE.slice(1, 11), 'DODICI']);
  assert.notEqual(ok(await git.diff({ sessionId: 's', percorso: 'f.txt', area: 'lavoro' })).impronta, a);
});
