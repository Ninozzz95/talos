/**
 * git-messaggio-commit.test.mjs — F6-1 ✨ «Genera messaggio» (26/09/2026): la parte pura (`messaggio-commit.mjs`) e il diff
 * che il servizio git le passa (`diffPerMessaggio`). Decisioni dell'owner su F6, punti 4 e 9: su clic, modello della sessione,
 * diff preparato (o dei file) tagliato a 20.000 byte come Zed (`git_ui/src/git_panel.rs:3929-3953`, 4062-4068).
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { creaServizioGit } from '../src/git-service.mjs';
import { comprimiDiffPerMessaggio, promptMessaggioCommit, pulisciMessaggioGenerato, RIGA_MASSIMA, TETTO_DIFF_MESSAGGIO } from '../src/messaggio-commit.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

/* ═══════════════════════ 1. LA PARTE PURA ═══════════════════════ */

test('F6-1 ✨ — un diff sotto il tetto passa intero; sopra, prima si accorciano le righe lunghe, poi si taglia E lo si dice', () => {
  assert.deepEqual(comprimiDiffPerMessaggio('+a\n-b\n'), { testo: '+a\n-b\n', troncato: false });
  const lunga = `+${'x'.repeat(5000)}`;
  const conLunghe = Array.from({ length: 6 }, () => lunga).join('\n');
  const accorciato = comprimiDiffPerMessaggio(conLunghe);
  assert.equal(accorciato.troncato, true);
  assert.ok(accorciato.testo.split('\n').every((r) => r.length <= RIGA_MASSIMA + '…[riga accorciata]'.length));
  const enorme = Array.from({ length: 3000 }, (_, i) => `+riga ${i} con testo à è ì`).join('\n');
  const tagliato = comprimiDiffPerMessaggio(enorme);
  assert.equal(tagliato.troncato, true);
  assert.ok(Buffer.byteLength(tagliato.testo, 'utf8') <= TETTO_DIFF_MESSAGGIO, `${Buffer.byteLength(tagliato.testo, 'utf8')} byte`);
  assert.match(tagliato.testo, /il resto del diff è stato tagliato/u);
  assert.ok(tagliato.testo.startsWith('+riga 0 '), 'si tiene l\'inizio, non un pezzo a caso');
});

test('F6-1 ✨ — la richiesta: stile di Zed, i soggetti recenti per la lingua, la bozza della persona, la nota del taglio', () => {
  const p = promptMessaggioCommit({ diff: '+nuova riga', soggetti: ['feat(ui): add the tab', 'fix(git): stash from a subfolder'], bozza: 'Aggiungi la scheda\ncorpo ignorato', troncato: true });
  assert.match(p, /imperative mood/u);
  assert.match(p, /- feat\(ui\): add the tab/u);
  assert.match(p, /keep its meaning.*: Aggiungi la scheda$/mu);
  assert.doesNotMatch(p, /corpo ignorato/u, 'della bozza conta la prima riga');
  assert.match(p, /shortened to fit/u);
  assert.match(p, /```diff\n\+nuova riga\n```$/u);
  // senza commit precedenti, decide la lingua dell'interfaccia
  assert.match(promptMessaggioCommit({ diff: 'd', lingua: 'en' }), /write the message in English/u);
  assert.match(promptMessaggioCommit({ diff: 'd' }), /write the message in Italian/u);
  assert.doesNotMatch(promptMessaggioCommit({ diff: 'd' }), /shortened/u);
});

test('F6-1 ✨ — la risposta del modello si ripulisce: recinti di codice, virgolette, spazi, righe vuote in fila', () => {
  assert.equal(pulisciMessaggioGenerato('```\nAdd the tab\n\nBody line\n```'), 'Add the tab\n\nBody line');
  assert.equal(pulisciMessaggioGenerato('```text\nFix it\n```'), 'Fix it');
  assert.equal(pulisciMessaggioGenerato('"Fix the stash"'), 'Fix the stash');
  assert.equal(pulisciMessaggioGenerato('Subject  \r\n\r\n\r\n\r\nBody   '), 'Subject\n\nBody');
  assert.equal(pulisciMessaggioGenerato('   '), '');
});

/* ═══════════════════════ 2. IL DIFF CHE IL SERVIZIO PASSA ═══════════════════════ */

function repoConSessione(t) {
  const base = mkdtempSync(join(tmpdir(), 'talos-git-messaggio-'));
  t.after(() => rimuoviCartellaDiProva(base));
  const g = (...args) => execFileSync('git', args, { cwd: base, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  g('init', '-q');
  g('config', 'user.email', 'prova@example.invalid');
  g('config', 'user.name', 'Prova');
  g('config', 'core.autocrlf', 'false');
  const sessione = join(base, 's');
  mkdirSync(sessione);
  writeFileSync(join(sessione, 'mio.txt'), 'uno\n');
  writeFileSync(join(base, 'fuori.txt'), 'f\n');
  g('add', '-A');
  g('commit', '-q', '-m', 'feat: first');
  return { base, g, sessione, git: creaServizioGit({ cartellaDiSessione: (id) => (id === 's' ? sessione : null) }) };
}

test('F6-1 ✨ — il diff è quello PREPARATO se c\'è, altrimenti quello dei file; solo la cartella della sessione; con i soggetti', async (t) => {
  const { base, g, sessione, git } = repoConSessione(t);
  writeFileSync(join(sessione, 'mio.txt'), 'uno\ndue\n');
  writeFileSync(join(base, 'fuori.txt'), 'f\nfuori\n');
  const lavoro = await git.diffPerMessaggio({ sessionId: 's' });
  assert.equal(lavoro.area, 'lavoro');
  assert.match(lavoro.testo, /^\+due$/mu);
  assert.doesNotMatch(lavoro.testo, /fuori/u, 'un file fuori dalla sessione non entra nel messaggio della sessione');
  assert.deepEqual(lavoro.soggetti, ['feat: first']);
  writeFileSync(join(sessione, 'altro.txt'), 'nuovo\n');
  g('add', '--', 's/altro.txt');
  const preparato = await git.diffPerMessaggio({ sessionId: 's' });
  assert.equal(preparato.area, 'preparato');
  assert.match(preparato.testo, /altro\.txt/u);
  assert.doesNotMatch(preparato.testo, /^\+due$/mu, 'con qualcosa di preparato, il messaggio descrive QUELLO');
});

test('F6-1 ✨ — niente da descrivere è un rifiuto per nome, non una richiesta vuota al modello', async (t) => {
  const { git } = repoConSessione(t);
  assert.equal((await git.diffPerMessaggio({ sessionId: 's' })).code, 'GIT_NOTHING_TO_COMMIT');
});
