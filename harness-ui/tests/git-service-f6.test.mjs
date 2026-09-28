/**
 * git-service-f6.test.mjs — F6-1 (26/09/2026), la parte «locale» della scheda GitHub: base dichiarata, impronta dell'area
 * preparata, diff di un file, annulla, commit di ciò che è preparato. Ledger `.claude/LEDGER-F6-GITHUB-2026-09-26.md`.
 *
 * ⛔ Repository VERI (`git init`), come in `git-service.test.mjs`: le cose da dimostrare — che l'annulla riporti alla versione
 *   PREPARATA e non a quella del commit, che il commit prenda l'indice e non l'albero, che un file preparato fuori dalla sessione
 *   fermi tutto — vivono nel modo in cui git si comporta, e un doppio non le vedrebbe.
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { creaServizioGit } from '../src/git-service.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

function repoVero(t) {
  const base = mkdtempSync(join(tmpdir(), 'talos-git-f6-'));
  t.after(() => rimuoviCartellaDiProva(base)); // BC-09, classe A: ritenta e avvisa (un git può tenere la cartella)
  const g = (...args) => execFileSync('git', args, { cwd: base, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  g('init', '-q');
  g('config', 'user.email', 'prova@example.invalid');
  g('config', 'user.name', 'Prova');
  g('config', 'core.autocrlf', 'false');
  return { base, g };
}

const servizio = (cartelle) => creaServizioGit({ cartellaDiSessione: (id) => cartelle[id] ?? null });
const ok = (esito) => { assert.ok(!('erroreAvvio' in esito), `${esito.code}: ${esito.erroreAvvio}`); return esito; };

/* ═══════════════════════ 1. LA BASE E L'IMPRONTA ═══════════════════════ */

test('F6-1 — la base si dichiara: null senza commit, poi hash corto e soggetto del commit', async (t) => {
  const { base, g } = repoVero(t);
  writeFileSync(join(base, 'a.txt'), 'uno\n');
  const git = servizio({ s: base });
  const vuoto = ok(await git.stato({ sessionId: 's' }));
  assert.equal(vuoto.base, null, 'un repository senza commit non ha una base: nessun hash inventato');
  g('add', '--', 'a.txt');
  g('commit', '-q', '-m', 'Primo commit');
  const dopo = ok(await git.stato({ sessionId: 's' }));
  assert.equal(dopo.base.soggetto, 'Primo commit');
  assert.equal(dopo.base.commit, g('rev-parse', 'HEAD').trim());
  assert.ok(dopo.base.commit.startsWith(dopo.base.breve) && dopo.base.breve.length >= 7, `hash corto: ${dopo.base.breve}`);
});

test('F6-1 — l\'impronta cambia quando cambia ciò che è preparato o HEAD, e resta uguale altrimenti', async (t) => {
  const { base, g } = repoVero(t);
  writeFileSync(join(base, 'a.txt'), 'uno\n');
  g('add', '--', 'a.txt');
  g('commit', '-q', '-m', 'base');
  const git = servizio({ s: base });
  const i1 = ok(await git.stato({ sessionId: 's' })).impronta;
  writeFileSync(join(base, 'a.txt'), 'due\n');
  const i2 = ok(await git.stato({ sessionId: 's' })).impronta;
  assert.equal(i2, i1, 'una modifica NON preparata non cambia l\'area preparata');
  g('add', '--', 'a.txt');
  const i3 = ok(await git.stato({ sessionId: 's' })).impronta;
  assert.notEqual(i3, i1, 'preparare cambia l\'impronta');
  g('commit', '-q', '-m', 'secondo');
  const i4 = ok(await git.stato({ sessionId: 's' })).impronta;
  assert.notEqual(i4, i1, 'un commit nuovo cambia HEAD, e l\'impronta con lui (anche con l\'area preparata di nuovo vuota)');
});

/* ═══════════════════════ 2. IL DIFF DI UN FILE ═══════════════════════ */

test('F6-1 — il diff di un file: area «lavoro» e area «preparato» sono due cose diverse', async (t) => {
  const { base, g } = repoVero(t);
  writeFileSync(join(base, 'a.txt'), 'riga uno\n');
  g('add', '--', 'a.txt');
  g('commit', '-q', '-m', 'base');
  writeFileSync(join(base, 'a.txt'), 'riga PREPARATA\n');
  g('add', '--', 'a.txt');
  writeFileSync(join(base, 'a.txt'), 'riga NEL LAVORO\n');
  const git = servizio({ s: base });
  const preparato = ok(await git.diff({ sessionId: 's', percorso: 'a.txt', area: 'preparato' }));
  assert.match(preparato.testo, /^-riga uno$/mu);
  assert.match(preparato.testo, /^\+riga PREPARATA$/mu);
  assert.doesNotMatch(preparato.testo, /NEL LAVORO/u);
  const lavoro = ok(await git.diff({ sessionId: 's', percorso: 'a.txt', area: 'lavoro' }));
  assert.match(lavoro.testo, /^-riga PREPARATA$/mu, 'il lavoro si confronta con l\'INDICE, non con HEAD');
  assert.match(lavoro.testo, /^\+riga NEL LAVORO$/mu);
  assert.equal(lavoro.base.soggetto, 'base', 'il diff porta la sua base dichiarata');
});

test('F6-1 — un file NUOVO ha il suo diff contro il vuoto; un file binario lo dice; un file pulito è un rifiuto per nome', async (t) => {
  const { base, g } = repoVero(t);
  writeFileSync(join(base, 'pulito.txt'), 'x\n');
  g('add', '--', 'pulito.txt');
  g('commit', '-q', '-m', 'base');
  writeFileSync(join(base, 'nuovo.txt'), 'prima riga\nseconda riga\n');
  writeFileSync(join(base, 'immagine.bin'), Buffer.from([0, 1, 2, 0, 255, 0, 3]));
  const git = servizio({ s: base });
  const nuovo = ok(await git.diff({ sessionId: 's', percorso: 'nuovo.txt', area: 'lavoro' }));
  assert.match(nuovo.testo, /^\+prima riga$/mu);
  assert.match(nuovo.testo, /^\+seconda riga$/mu);
  const binario = ok(await git.diff({ sessionId: 's', percorso: 'immagine.bin', area: 'lavoro' }));
  assert.equal(binario.binario, true, binario.testo);
  const pulito = await git.diff({ sessionId: 's', percorso: 'pulito.txt', area: 'lavoro' });
  assert.equal(pulito.code, 'GIT_PATH_UNCHANGED');
  const nonPreparato = await git.diff({ sessionId: 's', percorso: 'nuovo.txt', area: 'preparato' });
  assert.equal(nonPreparato.code, 'GIT_PATH_UNCHANGED', 'un file nuovo non preparato non ha diff nell\'area preparata');
  assert.equal((await git.diff({ sessionId: 's', percorso: 'nuovo.txt', area: 'tutto' })).code, 'GIT_DIFF_AREA_INVALID');
  assert.equal((await git.diff({ sessionId: 's', percorso: '../fuori.txt', area: 'lavoro' })).code, 'GIT_PATH_INVALID');
});

test('F6-1 — guardare un diff NON esegue i programmi che il repository configura (textconv, diff esterno)', async (t) => {
  const { base, g } = repoVero(t);
  /* Due script che, se git li lancia, lasciano un segno sul disco. Il repository li configura come farebbe chiunque abbia
     scritto quel progetto: è testo non fidato per chi apre la scheda. */
  writeFileSync(join(base, 'conv.sh'), '#!/bin/sh\necho x > "$(dirname "$0")/lanciato-textconv.txt"\ncat "$1"\n');
  writeFileSync(join(base, 'esterno.sh'), '#!/bin/sh\necho x > "$(dirname "$0")/lanciato-esterno.txt"\n');
  writeFileSync(join(base, '.gitattributes'), '*.seg diff=segreto\n');
  g('config', 'diff.segreto.textconv', `sh "${join(base, 'conv.sh').replaceAll('\\', '/')}"`);
  writeFileSync(join(base, 'dato.seg'), 'uno\n');
  g('add', '--', '.gitattributes', 'dato.seg');
  g('commit', '-q', '-m', 'base');
  writeFileSync(join(base, 'dato.seg'), 'due\n');
  const git = servizio({ s: base });
  const conTextconv = ok(await git.diff({ sessionId: 's', percorso: 'dato.seg', area: 'lavoro' }));
  assert.match(conTextconv.testo, /^\+due$/mu);
  assert.equal(existsSync(join(base, 'lanciato-textconv.txt')), false, 'il driver textconv del repository è stato eseguito');
  g('config', 'diff.external', `sh "${join(base, 'esterno.sh').replaceAll('\\', '/')}"`);
  ok(await git.diff({ sessionId: 's', percorso: 'dato.seg', area: 'lavoro' }));
  assert.equal(existsSync(join(base, 'lanciato-esterno.txt')), false, 'il diff esterno del repository è stato eseguito');
  // AL CONTRARIO: la trappola scatta davvero, se si chiede a git di usarla (la prova non è verde per costruzione)
  execFileSync('git', ['diff', '--', 'dato.seg'], { cwd: base, stdio: 'ignore' });
  assert.equal(existsSync(join(base, 'lanciato-esterno.txt')), true, 'premessa: senza le guardie git esegue il diff esterno');
});

/* ═══════════════════════ 3. ANNULLA ═══════════════════════ */

test('F6-1 — annulla riporta un file tracciato alla versione PREPARATA (non a quella del commit) e non tocca l\'indice', async (t) => {
  const { base, g } = repoVero(t);
  writeFileSync(join(base, 'a.txt'), 'v0\n');
  g('add', '--', 'a.txt');
  g('commit', '-q', '-m', 'base');
  writeFileSync(join(base, 'a.txt'), 'v1-preparata\n');
  g('add', '--', 'a.txt');
  writeFileSync(join(base, 'a.txt'), 'v2-lavoro\n');
  const git = servizio({ s: base });
  const esito = ok(await git.annulla({ sessionId: 's', percorsi: ['a.txt'] }));
  assert.deepEqual(esito.riportati, ['a.txt']);
  assert.equal(readFileSync(join(base, 'a.txt'), 'utf8'), 'v1-preparata\n', 'il lavoro torna com\'è nell\'indice');
  const voce = esito.stato.voci.find((v) => v.percorso === 'a.txt');
  assert.equal(voce.staged, true, 'ciò che era preparato resta preparato');
  assert.equal(voce.nonStaged, false);
});

test('F6-1 — annulla ELIMINA un file nuovo e una cartella nuova, e lo dice; rifiuta ciò che è solo preparato', async (t) => {
  const { base, g } = repoVero(t);
  writeFileSync(join(base, 'tenuto.txt'), 'x\n');
  g('add', '--', 'tenuto.txt');
  g('commit', '-q', '-m', 'base');
  writeFileSync(join(base, 'nuovo.txt'), 'n\n');
  mkdirSync(join(base, 'cartella-nuova'));
  writeFileSync(join(base, 'cartella-nuova', 'dentro.txt'), 'd\n');
  writeFileSync(join(base, 'tenuto.txt'), 'preparato\n');
  g('add', '--', 'tenuto.txt');
  const git = servizio({ s: base });
  const esito = ok(await git.annulla({ sessionId: 's', percorsi: ['nuovo.txt', 'cartella-nuova/'] }));
  assert.deepEqual(esito.eliminati.sort(), ['cartella-nuova/', 'nuovo.txt']);
  assert.equal(existsSync(join(base, 'nuovo.txt')), false);
  assert.equal(existsSync(join(base, 'cartella-nuova')), false);
  const soloPreparato = await git.annulla({ sessionId: 's', percorsi: ['tenuto.txt'] });
  assert.equal(soloPreparato.code, 'GIT_NOTHING_TO_DISCARD', 'annulla tocca il lavoro, non l\'area preparata');
  assert.equal(readFileSync(join(base, 'tenuto.txt'), 'utf8'), 'preparato\n');
});

test('F6-1 — annulla non elimina MAI un repository annidato', async (t) => {
  const { base, g } = repoVero(t);
  writeFileSync(join(base, 'a.txt'), 'x\n');
  g('add', '--', 'a.txt');
  g('commit', '-q', '-m', 'base');
  const annidato = join(base, 'altro-repo');
  mkdirSync(annidato);
  execFileSync('git', ['init', '-q'], { cwd: annidato });
  writeFileSync(join(annidato, 'suo.txt'), 's\n');
  const git = servizio({ s: base });
  const esito = await git.annulla({ sessionId: 's', percorsi: ['altro-repo/'] });
  assert.equal(esito.code, 'GIT_NESTED_REPO');
  assert.equal(existsSync(join(annidato, 'suo.txt')), true, 'il repository annidato è ancora lì');
});

/* ═══════════════════════ 4. COMMIT DI CIÒ CHE È PREPARATO ═══════════════════════ */

test('F6-1 — il commit prende l\'INDICE: la versione preparata, non quella cambiata dopo nell\'albero', async (t) => {
  const { base, g } = repoVero(t);
  writeFileSync(join(base, 'a.txt'), 'v0\n');
  g('add', '--', 'a.txt');
  g('commit', '-q', '-m', 'base');
  writeFileSync(join(base, 'a.txt'), 'v1-preparata\n');
  g('add', '--', 'a.txt');
  writeFileSync(join(base, 'a.txt'), 'v2-lavoro\n');
  const git = servizio({ s: base });
  const { impronta } = ok(await git.stato({ sessionId: 's' }));
  const esito = ok(await git.commitPreparato({ sessionId: 's', messaggio: 'Il preparato', impronta }));
  assert.equal(g('show', `${esito.commit}:a.txt`), 'v1-preparata\n', 'nel commit c\'è ciò che era preparato');
  assert.equal(readFileSync(join(base, 'a.txt'), 'utf8'), 'v2-lavoro\n', 'il lavoro non si tocca');
  assert.equal(g('log', '-1', '--format=%s').trim(), 'Il preparato');
  assert.equal(esito.stato.base.soggetto, 'Il preparato');
});

test('F6-1 — il commit si ferma per NOME: impronta vecchia, niente preparato, messaggio vuoto', async (t) => {
  const { base, g } = repoVero(t);
  writeFileSync(join(base, 'a.txt'), 'v0\n');
  writeFileSync(join(base, 'b.txt'), 'b0\n');
  g('add', '--', 'a.txt', 'b.txt');
  g('commit', '-q', '-m', 'base');
  const git = servizio({ s: base });
  const vuota = ok(await git.stato({ sessionId: 's' }));
  assert.equal((await git.commitPreparato({ sessionId: 's', messaggio: 'm', impronta: vuota.impronta })).code, 'GIT_NOTHING_STAGED');
  writeFileSync(join(base, 'a.txt'), 'v1\n');
  g('add', '--', 'a.txt');
  const vista = ok(await git.stato({ sessionId: 's' })).impronta;
  // un'altra sessione (o l'owner) prepara b.txt DOPO che la scheda ha mostrato lo stato
  writeFileSync(join(base, 'b.txt'), 'b1\n');
  g('add', '--', 'b.txt');
  const dopo = await git.commitPreparato({ sessionId: 's', messaggio: 'm', impronta: vista });
  assert.equal(dopo.code, 'GIT_STAGED_CHANGED', 'la persona non ha visto b.txt preparato: il commit non lo prende');
  assert.equal(g('log', '-1', '--format=%s').trim(), 'base', 'nessun commit fatto');
  const fresca = ok(await git.stato({ sessionId: 's' })).impronta;
  assert.equal((await git.commitPreparato({ sessionId: 's', messaggio: '   ', impronta: fresca })).code, 'GIT_MESSAGE_REQUIRED');
  assert.equal((await git.commitPreparato({ sessionId: 's', messaggio: 'm' })).code, 'GIT_STAGED_CHANGED', 'senza impronta non si committa');
});

test('F6-1 — un file preparato FUORI dalla cartella della sessione ferma il commit (e lo stato lo conta)', async (t) => {
  const { base, g } = repoVero(t);
  mkdirSync(join(base, 'sessione'));
  writeFileSync(join(base, 'sessione', 'mio.txt'), 'm0\n');
  writeFileSync(join(base, 'fuori.txt'), 'f0\n');
  g('add', '--', 'sessione/mio.txt', 'fuori.txt');
  g('commit', '-q', '-m', 'base');
  writeFileSync(join(base, 'sessione', 'mio.txt'), 'm1\n');
  writeFileSync(join(base, 'fuori.txt'), 'f1\n');
  g('add', '--', 'sessione/mio.txt', 'fuori.txt');
  const git = servizio({ s: join(base, 'sessione') });
  const stato = ok(await git.stato({ sessionId: 's' }));
  assert.equal(stato.preparatiFuori, 1);
  assert.deepEqual(stato.voci.map((v) => v.percorso), ['mio.txt'], 'la scheda non vede fuori.txt');
  const esito = await git.commitPreparato({ sessionId: 's', messaggio: 'm', impronta: stato.impronta });
  assert.equal(esito.code, 'GIT_STAGED_OUTSIDE');
  assert.equal(g('log', '-1', '--format=%s').trim(), 'base', 'nessun commit: fuori.txt ci sarebbe finito dentro');
  // al contrario: tolto dall'area preparata il file di fuori, il commit passa e prende solo il suo
  g('reset', '-q', '--', 'fuori.txt');
  const fresca = ok(await git.stato({ sessionId: 's' }));
  assert.equal(fresca.preparatiFuori, 0);
  const fatto = ok(await git.commitPreparato({ sessionId: 's', messaggio: 'solo il mio', impronta: fresca.impronta }));
  assert.deepEqual(g('show', '--name-only', '--format=', fatto.commit).trim().split('\n'), ['sessione/mio.txt']);
});

test('F6-1 — gli hook del repository girano: un pre-commit che rifiuta ferma il commit e torna col suo testo', async (t) => {
  const { base, g } = repoVero(t);
  writeFileSync(join(base, 'a.txt'), 'v0\n');
  g('add', '--', 'a.txt');
  g('commit', '-q', '-m', 'base');
  const hook = join(base, '.git', 'hooks', 'pre-commit');
  writeFileSync(hook, '#!/bin/sh\necho "hook di prova: fermo" >&2\nexit 1\n');
  try { chmodSync(hook, 0o755); } catch { /* Windows: git per Windows esegue lo stesso lo script con la sua shell */ }
  writeFileSync(join(base, 'a.txt'), 'v1\n');
  g('add', '--', 'a.txt');
  const git = servizio({ s: base });
  const { impronta } = ok(await git.stato({ sessionId: 's' }));
  const esito = await git.commitPreparato({ sessionId: 's', messaggio: 'm', impronta });
  assert.equal(esito.code, 'GIT_COMMAND_FAILED');
  assert.match(esito.erroreAvvio, /hook di prova: fermo/u);
  assert.equal(g('log', '-1', '--format=%s').trim(), 'base');
});
