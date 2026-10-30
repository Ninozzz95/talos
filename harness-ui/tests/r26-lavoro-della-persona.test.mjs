/*
 * R-26 B (Performance 29/10/2026: `git stash` 14 volte contro 2 di Claude Code; owner 29/10 notte «avvisa e fermalo», anche in
 *   Accesso pieno, e l'estensione a reset --hard, checkout --/., restore sull'albero, clean -f) — un comando git che nasconderebbe,
 *   sovrascriverebbe o cancellerebbe modifiche che NON sono dell'agente non parte, e l'esito dà le alternative; se sono tutte
 *   dell'agente, passa. Ricerca: `in-corso/RICERCA-R21-R26-ONE-UP-2026-10-29.md`.
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { talosLavora } from '../src/kernel/talosHarness.mjs';
import { azioniSulLavoro, vociDelloStato, vociToccate } from '../src/kernel/guardie-attese-e-lavoro.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

const tipi = (comando) => azioniSulLavoro(comando).map((a) => a.tipo);

test('R26-01 RICONOSCE: stash che nasconde, reset --hard, checkout --/., restore sull\'albero, clean -f — anche con -C e dentro un\'altra shell', () => {
  for (const c of ['git stash', 'git stash push -m prova', 'git stash -u', 'git stash save x', 'git -C sub stash', 'git -C "C:\\Users\\a b\\repo" stash push',
    'cd src && git stash && npm test', 'bash -c "git stash"', 'powershell -Command "git stash; git status"', 'cmd /c "git stash"', 'git --no-pager -c core.x=1 stash']) {
    assert.deepEqual(tipi(c), ['stash'], c);
  }
  for (const c of ['git reset --hard', 'git reset --hard HEAD~1', 'git -C x reset --har']) assert.deepEqual(tipi(c), ['reset-hard'], c);
  for (const c of ['git checkout -- a.txt', 'git checkout HEAD -- src', 'git checkout .', 'git checkout -f main']) assert.deepEqual(tipi(c), ['checkout'], c);
  for (const c of ['git restore a.txt', 'git restore .', 'git restore --staged --worktree a.txt', 'git restore -SW a.txt', 'git restore --source HEAD~1 a.txt']) assert.deepEqual(tipi(c), ['restore'], c);
  for (const c of ['git clean -f', 'git clean -fd', 'git clean -fdx', 'git clean -xdf', 'git clean --force -d']) assert.deepEqual(tipi(c), ['clean'], c);
  assert.deepEqual(azioniSulLavoro('git -C "C:\\Users\\a b\\repo" stash push')[0].cartelle, ['C:\\Users\\a b\\repo'], 'il -C resta intero, barre rovesce comprese');
  assert.deepEqual(azioniSulLavoro('git stash -- src/a.mjs')[0].percorsi, ['src/a.mjs']);
  assert.equal(azioniSulLavoro('git clean -fdx')[0].ignorati, true);
});

test('R26-02 AL CONTRARIO: le forme che non toccano il lavoro non si riconoscono', () => {
  for (const c of ['git stash list', 'git stash show -p', 'git stash pop', 'git stash apply stash@{0}', 'git stash create', 'git status', 'git reset --soft HEAD~1',
    'git reset HEAD a.txt', 'git checkout main', 'git checkout -b nuovo', 'git restore --staged a.txt', 'git restore -S a.txt', 'git clean -n', 'git clean -fn', 'git clean -d',
    'echo "git stash"', 'grep -r "git reset --hard" docs', 'npm test']) {
    assert.deepEqual(tipi(c), [], c);
  }
});

test('R26-03 le voci toccate: stash solo le tracciate (con -u anche le nuove), clean solo le nuove (con -x anche le ignorate), i percorsi restringono', () => {
  const voci = vociDelloStato(' M a.txt\0?? nuovo.txt\0!! build/x.o\0M  src/b.mjs\0R  dopo.txt\0prima.txt\0');
  assert.deepEqual(voci.map((v) => v.percorso), ['a.txt', 'nuovo.txt', 'build/x.o', 'src/b.mjs', 'dopo.txt']);
  const nomi = (comando, opzioni) => vociToccate(azioniSulLavoro(comando)[0], voci, opzioni).map((v) => v.percorso);
  assert.deepEqual(nomi('git stash'), ['a.txt', 'src/b.mjs', 'dopo.txt']);
  assert.deepEqual(nomi('git stash -u'), ['a.txt', 'nuovo.txt', 'src/b.mjs', 'dopo.txt']);
  assert.deepEqual(nomi('git clean -fd'), ['nuovo.txt']);
  assert.deepEqual(nomi('git clean -fdx'), ['nuovo.txt', 'build/x.o']);
  assert.deepEqual(nomi('git checkout -- src'), ['src/b.mjs']);
  assert.deepEqual(nomi('git restore b.mjs', { prefisso: 'src/' }), ['src/b.mjs'], 'un percorso relativo alla sottocartella da cui gira git');
});

/* ── il giro vero, in un repository vero ─────────────────────────────────────────────────────────────────────────────────── */
function repository(t) {
  const c = mkdtempSync(join(tmpdir(), 'talos-r26-'));
  t.after(() => rimuoviCartellaDiProva(c));
  const git = (...a) => execFileSync('git', ['-c', 'core.autocrlf=false', '-c', 'user.name=t', '-c', 'user.email=t@t', ...a], { cwd: c, encoding: 'utf8' });
  git('init', '-q');
  writeFileSync(join(c, 'a.txt'), 'uno\n');
  mkdirSync(join(c, 'sub'));
  writeFileSync(join(c, 'sub', 'b.txt'), 'due\n');
  git('add', '.');
  git('commit', '-q', '-m', 'base');
  return { c, git };
}
const chiama = (id, nome, argomenti) => ({ id, type: 'function', function: { name: nome, arguments: JSON.stringify(argomenti) } });
async function giro(c, passi, altro = {}) {
  let n = 0;
  const r = await talosLavora({
    ...altro,
    cartella: c, task: { consegna: 'lavora' }, modello: 'x', chiave: 'y', livelloAccesso: 'accesso-pieno',
    chiediApprovazioneFn: async () => true,
    fetchDiRete: async () => ({ ok: true, status: 200, text: async () => '', json: async () => ({
      choices: [{ message: n < passi.length ? { role: 'assistant', content: null, tool_calls: passi[n++] } : { role: 'assistant', content: 'fatto' } }],
      usage: { prompt_tokens: 10, completion_tokens: 5 },
    }) }),
  });
  return (id) => r.messaggiFinali.find((m) => m.tool_call_id === id)?.content ?? '';
}

test('R26-04 il lavoro della PERSONA: git stash non parte, anche in Accesso pieno; il file resta, nessuna voce di stash, le alternative nell\'esito', async (t) => {
  const { c, git } = repository(t);
  writeFileSync(join(c, 'a.txt'), 'uno\nmodifica della persona\n');
  const esito = await giro(c, [[chiama('s', 'shell', { comando: 'git stash' })]]);
  assert.match(esito('s'), /^REFUSED\. Nothing was run: `git stash` would set aside \(stash\) changes you did not make in this session — 1 file\(s\) the person changed and has not committed: a\.txt\./u);
  /* owner 29/10/2026 sera, «al modello l'alternativa pronta»: il comando già scritto col file vero, non uno schema da riempire */
  assert.match(esito('s'), /`git show "HEAD:a\.txt"`/u);
  assert.match(esito('s'), /`git worktree add "[^"`]+talos-committed[^"`]*" HEAD`/u);
  assert.doesNotMatch(esito('s'), /<path>|<new folder>/u);
  assert.equal(readFileSync(join(c, 'a.txt'), 'utf8'), 'uno\nmodifica della persona\n');
  assert.equal(git('stash', 'list').trim(), '');
});

test('R26-05 le altre quattro forme sul lavoro della persona: reset --hard, checkout --, restore, clean -fd — e con git -C', async (t) => {
  const { c } = repository(t);
  writeFileSync(join(c, 'a.txt'), 'uno\npersona\n');
  writeFileSync(join(c, 'sub', 'b.txt'), 'due\npersona\n');
  writeFileSync(join(c, 'appunti.txt'), 'nuovo della persona\n');
  /* un repository DENTRO la cartella, con la sua modifica: `git -C altro stash` riguarda lui, non quello di fuori */
  const altro = join(c, 'altro');
  mkdirSync(altro);
  const gitAltro = (...a) => execFileSync('git', ['-c', 'core.autocrlf=false', '-c', 'user.name=t', '-c', 'user.email=t@t', ...a], { cwd: altro, encoding: 'utf8' });
  gitAltro('init', '-q');
  writeFileSync(join(altro, 'x.txt'), 'x\n');
  gitAltro('add', '.');
  gitAltro('commit', '-q', '-m', 'base');
  writeFileSync(join(altro, 'x.txt'), 'x della persona\n');
  const esito = await giro(c, [[
    chiama('r', 'shell', { comando: 'git reset --hard' }),
    chiama('k', 'shell', { comando: 'git checkout -- a.txt' }),
    chiama('w', 'shell', { comando: 'git restore .' }),
    chiama('l', 'shell', { comando: 'git clean -fd' }),
    chiama('C', 'shell', { comando: 'git -C sub stash' }),
    chiama('A', 'shell', { comando: 'git -C altro stash' }),
  ]]);
  for (const id of ['r', 'k', 'w', 'l', 'C', 'A']) assert.match(esito(id), /^REFUSED\. Nothing was run: /u, id);
  assert.match(esito('l'), /would delete changes .*appunti\.txt/u);
  assert.match(esito('C'), /sub\/b\.txt/u);
  assert.match(esito('A'), /: x\.txt\./u, 'il repository di -C, non quello della cartella');
  assert.equal(readFileSync(join(altro, 'x.txt'), 'utf8'), 'x della persona\n');
  assert.equal(readFileSync(join(c, 'a.txt'), 'utf8'), 'uno\npersona\n');
  assert.equal(readFileSync(join(c, 'sub', 'b.txt'), 'utf8'), 'due\npersona\n');
  assert.ok(existsSync(join(c, 'appunti.txt')));
});

test('R26-06 AL CONTRARIO: modifiche tutte dell\'agente (scritte in questo turno) — lo stash e il clean passano', async (t) => {
  const { c, git } = repository(t);
  const esito = await giro(c, [
    [chiama('e', 'file_edit', { percorso: 'a.txt', old_string: 'uno', new_string: 'uno cambiato dall\'agente' }),
      chiama('n', 'scrivi', { percorso: 'tmp-agente.txt', contenuto: 'mio\n' })],
    [chiama('s', 'shell', { comando: 'git stash' }), chiama('l', 'shell', { comando: 'git clean -f' })],
  ]);
  assert.match(esito('e'), /^edited: /u);
  assert.doesNotMatch(esito('s'), /REFUSED/u);
  assert.doesNotMatch(esito('l'), /REFUSED/u);
  assert.match(git('stash', 'list'), /stash@\{0\}/u, 'lo stash dell\'agente è partito davvero');
  assert.equal(existsSync(join(c, 'tmp-agente.txt')), false, 'il clean del file dell\'agente è partito davvero');
});

test('R26-07 AL CONTRARIO: niente da perdere (albero pulito) — lo stash passa; e un file dell\'agente toccato poi dalla persona torna della persona', async (t) => {
  const { c } = repository(t);
  const pulito = await giro(c, [[chiama('s', 'shell', { comando: 'git stash' })]]);
  assert.doesNotMatch(pulito('s'), /REFUSED/u);
  let passo = 0;
  const esito = await giro(c, [
    [chiama('e', 'file_edit', { percorso: 'a.txt', old_string: 'uno', new_string: 'agente' })],
    [chiama('s', 'shell', { comando: 'git stash' })],
  ], { onGiro: (e) => { if (e?.tipo === 'tool-esito' && e.toolCallId === 'e' && passo++ === 0) writeFileSync(join(c, 'a.txt'), 'agente\npoi la persona\n'); } });
  assert.match(esito('s'), /^REFUSED\./u, 'il contenuto non è più quello che l\'agente ha scritto');
});

test('R26-08 l\'ospite sa che cosa ha scritto l\'agente nei turni prima (lavoroDellAgenteFn): con lui, passa', async (t) => {
  const { c, git } = repository(t);
  writeFileSync(join(c, 'a.txt'), 'scritto dall\'agente ieri\n');
  const chiesti = [];
  const esito = await giro(c, [[chiama('s', 'shell', { comando: 'git stash' })]], {
    lavoroDellAgenteFn: async ({ percorsi }) => { chiesti.push(...percorsi); return percorsi; },
  });
  assert.doesNotMatch(esito('s'), /REFUSED/u);
  assert.equal(chiesti.length, 1);
  assert.match(chiesti[0].replaceAll('\\', '/'), /\/a\.txt$/u);
  assert.match(git('stash', 'list'), /stash@\{0\}/u);
});
