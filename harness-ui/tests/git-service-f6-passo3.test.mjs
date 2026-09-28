/**
 * git-service-f6-passo3.test.mjs — F6-1 passo 3 (26/09/2026): storia dei commit, modifica e annulla dell'ultimo commit, rami,
 * messi da parte. Decisione dell'owner (memoria `decisioni-owner-f6-github-26-09`): «F6-1 comprende anche: modifica e annulla
 * dell'ultimo commit (solo se non inviato), stash, rinomina ed elimina di un ramo (mai uno non unito senza avviso), storia dei
 * commit (senza il grafo disegnato)». Ledger `.claude/LEDGER-F6-GITHUB-2026-09-26.md`.
 *
 * ⛔ Repository VERI (`git init`), come negli altri due file del servizio: «già inviato», «non unito», «il cambio sovrascriverebbe»
 *   e «lo stash tocca file fuori dalla sessione» sono fatti di git, e un doppio li direbbe come li penso io.
 */
import assert from 'node:assert/strict';
import { execFile, execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { creaServizioGit } from '../src/git-service.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

function repoVero(t) {
  const base = mkdtempSync(join(tmpdir(), 'talos-git-f6p3-'));
  t.after(() => rimuoviCartellaDiProva(base)); // BC-09, classe A
  const g = (...args) => execFileSync('git', args, { cwd: base, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  g('init', '-q', '-b', 'main');
  g('config', 'user.email', 'prova@example.invalid');
  g('config', 'user.name', 'Prova');
  g('config', 'core.autocrlf', 'false');
  return { base, g };
}

const servizio = (cartelle) => creaServizioGit({ cartellaDiSessione: (id) => cartelle[id] ?? null });
const ok = (esito) => { assert.ok(!('erroreAvvio' in esito), `${esito.code}: ${esito.erroreAvvio}`); return esito; };
const committa = (g, base, file, testo, messaggio) => {
  writeFileSync(join(base, file), testo);
  g('add', '--', file);
  g('commit', '-q', '-m', messaggio);
  return g('rev-parse', 'HEAD').trim();
};

/* ═══════════════════════ 1. LA STORIA ═══════════════════════ */

test('F6-1 p3 — la storia: vuota senza commit, poi dal più recente, e «inviato» vero solo per ciò che sta in un ramo remoto', async (t) => {
  const { base, g } = repoVero(t);
  const git = servizio({ s: base });
  assert.deepEqual(ok(await git.storia({ sessionId: 's' })), { commit: [], altri: false });
  const primo = committa(g, base, 'a.txt', '1\n', 'Primo');
  const secondo = committa(g, base, 'a.txt', '2\n', 'Secondo: con i due punti');
  const { commit, ultimoMessaggio } = ok(await git.storia({ sessionId: 's' }));
  assert.equal(ultimoMessaggio, 'Secondo: con i due punti');
  assert.deepEqual(commit.map((c) => c.soggetto), ['Secondo: con i due punti', 'Primo']);
  assert.deepEqual(commit.map((c) => c.commit), [secondo, primo]);
  assert.deepEqual(commit.map((c) => c.genitori), [1, 0]);
  assert.deepEqual(commit.map((c) => c.inviato), [false, false], 'nessun ramo remoto: niente è inviato');
  // al contrario: un ramo remoto che contiene il PRIMO lo rende inviato, e il secondo no
  g('update-ref', 'refs/remotes/origin/main', primo);
  const dopo = ok(await git.storia({ sessionId: 's' })).commit;
  assert.deepEqual(dopo.map((c) => c.inviato), [false, true]);
});

test('F6-1 p3 — la storia ha un tetto e lo dice («altri»), mai un taglio muto', async (t) => {
  const { base, g } = repoVero(t);
  for (let i = 0; i < 4; i += 1) committa(g, base, 'a.txt', `${i}\n`, `c${i}`);
  const git = servizio({ s: base });
  const tre = ok(await git.storia({ sessionId: 's', limite: 3 }));
  assert.equal(tre.commit.length, 3);
  assert.equal(tre.altri, true);
  const tutti = ok(await git.storia({ sessionId: 's', limite: 4 }));
  assert.equal(tutti.altri, false);
});

/* ═══════════════════════ 2. MODIFICA L'ULTIMO COMMIT ═══════════════════════ */

test('F6-1 p3 — modifica: messaggio nuovo più ciò che è preparato, stesso genitore', async (t) => {
  const { base, g } = repoVero(t);
  const primo = committa(g, base, 'a.txt', '1\n', 'Primo');
  const vecchio = committa(g, base, 'a.txt', '2\n', 'Secondo scritto male');
  writeFileSync(join(base, 'b.txt'), 'dimenticato\n');
  g('add', '--', 'b.txt');
  const git = servizio({ s: base });
  const { impronta, base: testa } = ok(await git.stato({ sessionId: 's' }));
  const fatto = ok(await git.modificaUltimoCommit({ sessionId: 's', messaggio: 'Secondo scritto bene', impronta, commit: testa.commit }));
  assert.notEqual(fatto.commit, vecchio);
  assert.equal(g('log', '-1', '--format=%s').trim(), 'Secondo scritto bene');
  assert.equal(g('rev-parse', 'HEAD~1').trim(), primo, 'il genitore resta quello: è una modifica, non un commit nuovo');
  assert.deepEqual(g('show', '--name-only', '--format=', 'HEAD').trim().split('\n').sort(), ['a.txt', 'b.txt']);
});

test('F6-1 p3 — modifica: si ferma per NOME su HEAD cambiato, commit già inviato, impronta vecchia', async (t) => {
  const { base, g } = repoVero(t);
  committa(g, base, 'a.txt', '1\n', 'Primo');
  const git = servizio({ s: base });
  const visto = ok(await git.stato({ sessionId: 's' }));
  committa(g, base, 'a.txt', '2\n', 'Arrivato dopo');
  const cambiato = await git.modificaUltimoCommit({ sessionId: 's', messaggio: 'm', impronta: visto.impronta, commit: visto.base.commit });
  assert.equal(cambiato.code, 'GIT_HEAD_CHANGED');
  assert.equal(g('log', '-1', '--format=%s').trim(), 'Arrivato dopo');
  const ora = ok(await git.stato({ sessionId: 's' }));
  const vecchia = await git.modificaUltimoCommit({ sessionId: 's', messaggio: 'm', impronta: 'non-questa', commit: ora.base.commit });
  assert.equal(vecchia.code, 'GIT_STAGED_CHANGED');
  g('update-ref', 'refs/remotes/origin/main', 'HEAD');
  const inviato = await git.modificaUltimoCommit({ sessionId: 's', messaggio: 'm', impronta: ora.impronta, commit: ora.base.commit });
  assert.equal(inviato.code, 'GIT_COMMIT_PUSHED');
  assert.equal(g('log', '-1', '--format=%s').trim(), 'Arrivato dopo', 'nessuna delle tre ha riscritto niente');
});

/* ═══════════════════════ 3. ANNULLA L'ULTIMO COMMIT ═══════════════════════ */

test('F6-1 p3 — annulla l\'ultimo commit: le modifiche tornano PREPARATE e il messaggio torna a chi chiede', async (t) => {
  const { base, g } = repoVero(t);
  const primo = committa(g, base, 'a.txt', '1\n', 'Primo');
  writeFileSync(join(base, 'a.txt'), '2\n');
  writeFileSync(join(base, 'b.txt'), 'nuovo\n');
  g('add', '--', 'a.txt', 'b.txt');
  g('commit', '-q', '-m', 'Da rifare', '-m', 'con un corpo');
  const git = servizio({ s: base });
  const { base: testa } = ok(await git.stato({ sessionId: 's' }));
  const fatto = ok(await git.annullaUltimoCommit({ sessionId: 's', commit: testa.commit }));
  assert.equal(fatto.messaggio, 'Da rifare\n\ncon un corpo');
  assert.equal(g('rev-parse', 'HEAD').trim(), primo);
  assert.equal(readFileSync(join(base, 'a.txt'), 'utf8'), '2\n', 'l\'albero non si tocca');
  assert.deepEqual(g('diff', '--cached', '--name-only').trim().split('\n').sort(), ['a.txt', 'b.txt'], 'tutto torna preparato');
});

test('F6-1 p3 — annulla il PRIMO commit: niente HEAD, e tutto resta preparato', async (t) => {
  const { base, g } = repoVero(t);
  const unico = committa(g, base, 'a.txt', '1\n', 'Unico');
  const git = servizio({ s: base });
  ok(await git.annullaUltimoCommit({ sessionId: 's', commit: unico }));
  assert.equal(ok(await git.stato({ sessionId: 's' })).base, null);
  assert.deepEqual(g('diff', '--cached', '--name-only').trim().split('\n'), ['a.txt']);
});

test('F6-1 p3 — annulla si ferma su unione, inviato, HEAD cambiato e commit che tocca file fuori dalla sessione', async (t) => {
  const { base, g } = repoVero(t);
  committa(g, base, 'a.txt', '1\n', 'base');
  g('switch', '-q', '-c', 'lato');
  committa(g, base, 'b.txt', 'b\n', 'lato');
  g('switch', '-q', 'main');
  committa(g, base, 'c.txt', 'c\n', 'principale');
  g('merge', '-q', '--no-ff', '--no-edit', 'lato');
  const git = servizio({ s: base });
  const unione = g('rev-parse', 'HEAD').trim();
  assert.equal((await git.annullaUltimoCommit({ sessionId: 's', commit: unione })).code, 'GIT_MERGE_COMMIT');
  assert.equal(g('rev-parse', 'HEAD').trim(), unione);
  const ultimo = committa(g, base, 'd.txt', 'd\n', 'dopo');
  assert.equal((await git.annullaUltimoCommit({ sessionId: 's', commit: unione })).code, 'GIT_HEAD_CHANGED');
  g('update-ref', 'refs/remotes/origin/main', ultimo);
  assert.equal((await git.annullaUltimoCommit({ sessionId: 's', commit: ultimo })).code, 'GIT_COMMIT_PUSHED');
  g('update-ref', '-d', 'refs/remotes/origin/main');
  // da una sottocartella: un commit che tocca anche la radice non si annulla da qui; uno solo della sessione sì
  mkdirSync(join(base, 'sessione'));
  writeFileSync(join(base, 'sessione', 'mio.txt'), 'm\n');
  writeFileSync(join(base, 'radice.txt'), 'r\n');
  g('add', '--', 'sessione/mio.txt', 'radice.txt');
  g('commit', '-q', '-m', 'misto');
  const sotto = servizio({ s: join(base, 'sessione') });
  const misto = g('rev-parse', 'HEAD').trim();
  assert.equal((await sotto.annullaUltimoCommit({ sessionId: 's', commit: misto })).code, 'GIT_COMMIT_OUTSIDE');
  const solo = committa(g, base, 'sessione/mio.txt', 'm2\n', 'solo mio');
  ok(await sotto.annullaUltimoCommit({ sessionId: 's', commit: solo }));
  assert.equal(g('rev-parse', 'HEAD').trim(), misto);
});

/* ═══════════════════════ 4. I RAMI ═══════════════════════ */

test('F6-1 p3 — rami: elenco con il corrente, crea e ci passa, cambia, rinomina', async (t) => {
  const { base, g } = repoVero(t);
  committa(g, base, 'a.txt', '1\n', 'base');
  const git = servizio({ s: base });
  assert.deepEqual(ok(await git.rami({ sessionId: 's' })).rami.map((r) => [r.nome, r.corrente]), [['main', true]]);
  ok(await git.creaRamo({ sessionId: 's', ramo: 'prova/uno' }));
  assert.equal(g('branch', '--show-current').trim(), 'prova/uno');
  ok(await git.cambiaRamo({ sessionId: 's', ramo: 'main' }));
  assert.equal(g('branch', '--show-current').trim(), 'main');
  const rinominato = ok(await git.rinominaRamo({ sessionId: 's', da: 'prova/uno', a: 'prova/due' }));
  assert.deepEqual(rinominato.rami.map((r) => r.nome).sort(), ['main', 'prova/due']);
  assert.equal((await git.creaRamo({ sessionId: 's', ramo: 'main' })).code, 'GIT_BRANCH_EXISTS');
  assert.equal((await git.cambiaRamo({ sessionId: 's', ramo: 'non-esiste' })).code, 'GIT_BRANCH_NOT_FOUND');
  assert.equal((await git.rinominaRamo({ sessionId: 's', da: 'prova/due', a: 'main' })).code, 'GIT_BRANCH_EXISTS');
});

test('F6-1 p3 — un nome di ramo è testo non fidato: trattino, «@{», spazi, «..», «.lock», HEAD si rifiutano e NIENTE cambia', async (t) => {
  const { base, g } = repoVero(t);
  committa(g, base, 'a.txt', '1\n', 'base');
  g('branch', 'altro');
  g('switch', '-q', 'altro');
  g('switch', '-q', 'main');
  const git = servizio({ s: base });
  const prima = g('for-each-ref', '--format=%(refname)', 'refs/heads');
  for (const nome of ['-f', '--orphan=x', '@{-1}', 'a b', 'a..b', 'x.lock', 'HEAD', '', 'a\0b', 42, null]) {
    const esito = await git.creaRamo({ sessionId: 's', ramo: nome });
    assert.equal(esito.code, 'GIT_BRANCH_INVALID', `«${String(nome)}» è passato`);
    assert.equal((await git.cambiaRamo({ sessionId: 's', ramo: nome })).code, 'GIT_BRANCH_INVALID');
  }
  assert.equal(g('for-each-ref', '--format=%(refname)', 'refs/heads'), prima);
  assert.equal(g('branch', '--show-current').trim(), 'main', '«@{-1}» avrebbe portato su «altro»');
});

test('F6-1 p3 — il cambio di ramo che sovrascriverebbe modifiche si ferma per NOME, e i file restano come erano', async (t) => {
  const { base, g } = repoVero(t);
  committa(g, base, 'a.txt', 'main\n', 'base');
  g('switch', '-q', '-c', 'altro');
  committa(g, base, 'a.txt', 'altro\n', 'diverso');
  g('switch', '-q', 'main');
  writeFileSync(join(base, 'a.txt'), 'lavoro mio\n');
  const git = servizio({ s: base });
  assert.equal((await git.cambiaRamo({ sessionId: 's', ramo: 'altro' })).code, 'GIT_SWITCH_BLOCKED');
  assert.equal(readFileSync(join(base, 'a.txt'), 'utf8'), 'lavoro mio\n');
  assert.equal(g('branch', '--show-current').trim(), 'main');
});

test('F6-1 p3 — elimina: mai il corrente; un non unito solo con forza esplicita; un unito subito', async (t) => {
  const { base, g } = repoVero(t);
  committa(g, base, 'a.txt', '1\n', 'base');
  g('branch', 'unito');
  g('switch', '-q', '-c', 'solitario');
  committa(g, base, 's.txt', 's\n', 'solo qui');
  g('switch', '-q', 'main');
  const git = servizio({ s: base });
  assert.equal((await git.eliminaRamo({ sessionId: 's', ramo: 'main' })).code, 'GIT_BRANCH_CURRENT');
  const nonUnito = await git.eliminaRamo({ sessionId: 's', ramo: 'solitario' });
  assert.equal(nonUnito.code, 'GIT_BRANCH_NOT_MERGED');
  assert.match(g('branch', '--list', 'solitario'), /solitario/u, 'il primo tentativo non elimina niente');
  const nonForza = await git.eliminaRamo({ sessionId: 's', ramo: 'solitario', forza: 'true' });
  assert.equal(nonForza.code, 'GIT_BRANCH_NOT_MERGED', '«forza» vale solo come true letterale');
  ok(await git.eliminaRamo({ sessionId: 's', ramo: 'solitario', forza: true }));
  assert.equal(g('branch', '--list', 'solitario').trim(), '');
  ok(await git.eliminaRamo({ sessionId: 's', ramo: 'unito' }));
  assert.equal(g('branch', '--list', 'unito').trim(), '');
});

/* ═══════════════════════ 5. I MESSI DA PARTE ═══════════════════════ */

test('F6-1 p3 — mettere da parte da una sottocartella prende SOLO la cartella della sessione; senza modifiche lo dice', async (t) => {
  const { base, g } = repoVero(t);
  mkdirSync(join(base, 'sessione'));
  writeFileSync(join(base, 'sessione', 'mio.txt'), 'm0\n');
  writeFileSync(join(base, 'fuori.txt'), 'f0\n');
  g('add', '--', 'sessione/mio.txt', 'fuori.txt');
  g('commit', '-q', '-m', 'base');
  const git = servizio({ s: join(base, 'sessione') });
  assert.equal((await git.accantona({ sessionId: 's' })).code, 'GIT_NOTHING_TO_STASH');
  writeFileSync(join(base, 'sessione', 'mio.txt'), 'm1\n');
  writeFileSync(join(base, 'fuori.txt'), 'f1\n');
  writeFileSync(join(base, 'sessione', 'nuovo.txt'), 'n\n');
  const fatto = ok(await git.accantona({ sessionId: 's', messaggio: '  prima   della  prova  ' }));
  assert.equal(readFileSync(join(base, 'sessione', 'mio.txt'), 'utf8'), 'm0\n');
  assert.equal(readFileSync(join(base, 'fuori.txt'), 'utf8'), 'f1\n', 'il file di fuori resta dov\'era');
  assert.ok(existsSync(join(base, 'sessione', 'nuovo.txt')), 'senza «conNuovi» un file nuovo non si mette da parte');
  assert.equal(fatto.accantonati.length, 1);
  assert.match(fatto.accantonati[0].messaggio, /prima della prova$/u);
  assert.equal(fatto.accantonati[0].indice, 0);
  // con i nuovi
  ok(await git.accantona({ sessionId: 's', conNuovi: true }));
  assert.equal(existsSync(join(base, 'sessione', 'nuovo.txt')), false);
  // una sessione in una cartella senza file tracciati: stesso rifiuto per nome, non un errore di git
  mkdirSync(join(base, 'vuota'));
  writeFileSync(join(base, 'vuota', 'x.txt'), 'x\n');
  const vuota = servizio({ s: join(base, 'vuota') });
  assert.equal((await vuota.accantona({ sessionId: 's' })).code, 'GIT_NOTHING_TO_STASH');
});

test('F6-1 p3 — riprendere e scartare vogliono indice E hash visti; una voce con file fuori non si riprende', async (t) => {
  const { base, g } = repoVero(t);
  mkdirSync(join(base, 'sessione'));
  writeFileSync(join(base, 'sessione', 'mio.txt'), 'm0\n');
  writeFileSync(join(base, 'fuori.txt'), 'f0\n');
  g('add', '--', 'sessione/mio.txt', 'fuori.txt');
  g('commit', '-q', '-m', 'base');
  const git = servizio({ s: join(base, 'sessione') });
  writeFileSync(join(base, 'sessione', 'mio.txt'), 'm1\n');
  const { accantonati: [voce] } = ok(await git.accantona({ sessionId: 's', messaggio: 'mia' }));
  // qualcuno mette da parte altro, dalla radice: la pila si sposta sotto la scheda
  writeFileSync(join(base, 'fuori.txt'), 'f1\n');
  g('stash', 'push', '-q', '-m', 'di-fuori', '--', 'fuori.txt');
  assert.equal((await git.riprendiAccantonato({ sessionId: 's', indice: voce.indice, commit: voce.commit })).code, 'GIT_STASH_CHANGED');
  const elenco = ok(await git.accantonati({ sessionId: 's' })).accantonati;
  const diFuori = elenco.find((v) => /di-fuori/u.test(v.messaggio));
  const mia = elenco.find((v) => /mia$/u.test(v.messaggio));
  assert.equal((await git.riprendiAccantonato({ sessionId: 's', indice: diFuori.indice, commit: diFuori.commit })).code, 'GIT_STASH_OUTSIDE');
  assert.equal(readFileSync(join(base, 'fuori.txt'), 'utf8'), 'f0\n');
  ok(await git.riprendiAccantonato({ sessionId: 's', indice: mia.indice, commit: mia.commit }));
  assert.equal(readFileSync(join(base, 'sessione', 'mio.txt'), 'utf8'), 'm1\n');
  const resta = ok(await git.accantonati({ sessionId: 's' })).accantonati;
  assert.deepEqual(resta.map((v) => v.commit), [diFuori.commit], 'ripresa = applicata e tolta');
  assert.equal((await git.scartaAccantonato({ sessionId: 's', indice: 0, commit: 'non-questo' })).code, 'GIT_STASH_CHANGED');
  ok(await git.scartaAccantonato({ sessionId: 's', indice: 0, commit: diFuori.commit }));
  assert.deepEqual(ok(await git.accantonati({ sessionId: 's' })).accantonati, []);
});

test('F6-1 p3 — riprendere con un conflitto lo dice per nome e la voce RESTA messa da parte', async (t) => {
  const { base, g } = repoVero(t);
  committa(g, base, 'a.txt', 'base\n', 'base');
  const git = servizio({ s: base });
  writeFileSync(join(base, 'a.txt'), 'messo da parte\n');
  const { accantonati: [voce] } = ok(await git.accantona({ sessionId: 's' }));
  committa(g, base, 'a.txt', 'cambiato dopo\n', 'dopo');
  const esito = await git.riprendiAccantonato({ sessionId: 's', indice: voce.indice, commit: voce.commit });
  assert.equal(esito.code, 'GIT_STASH_CONFLICT');
  assert.deepEqual(ok(await git.accantonati({ sessionId: 's' })).accantonati.map((v) => v.commit), [voce.commit]);
});

/* ═══════════════════════ 6. UN GIT CHE PARLA UN'ALTRA LINGUA ═══════════════════════ */

/*
 * ⛔ `LANG`/`LC_ALL` passano a git (`AMBIENTE_GIT`), e su Linux un git in italiano è normale. Tre decisioni della scheda — «il
 *   ramo non è unito: chiedo», «non c'è niente da mettere da parte», «riprendendo ci sono conflitti» — non devono dipendere
 *   dal testo inglese dei messaggi. Qui lo STESSO git vero risponde, ma ogni frase che il servizio potrebbe leggere arriva
 *   tradotta: se una decisione la legge ancora, questa prova diventa rossa.
 */
const gitInItaliano = () => (cartella, argomenti) => new Promise((esci) => {
  execFile('git', argomenti, { cwd: cartella, encoding: 'buffer', windowsHide: true }, (errore, stdout, stderr) => {
    const tradotto = (b) => String(b ?? '')
      .replace(/not fully merged/gu, 'non è stato unito completamente')
      .replace(/No local changes to save/gu, 'Nessuna modifica locale da salvare')
      .replace(/did not match any file\(s\) known to git/gu, 'non corrisponde ad alcun file noto a git')
      .replace(/CONFLICT/gu, 'CONFLITTO')
      .replace(/would be overwritten/gu, 'sarebbero sovrascritte');
    esci({ codice: errore ? (typeof errore.code === 'number' ? errore.code : null) : 0, stdout: tradotto(stdout), stderr: tradotto(stderr) });
  });
});
const servizioItaliano = (cartelle) => creaServizioGit({ cartellaDiSessione: (id) => cartelle[id] ?? null, eseguiGitFn: gitInItaliano() });

test('F6-1 p3 — con un git in italiano: «non unito», «niente da mettere da parte» e «conflitto» restano decisioni giuste', async (t) => {
  const { base, g } = repoVero(t);
  committa(g, base, 'a.txt', 'base\n', 'base');
  g('switch', '-q', '-c', 'solitario');
  committa(g, base, 's.txt', 's\n', 'solo qui');
  g('switch', '-q', 'main');
  const git = servizioItaliano({ s: base });
  assert.equal((await git.eliminaRamo({ sessionId: 's', ramo: 'solitario' })).code, 'GIT_BRANCH_NOT_MERGED');
  assert.match(g('branch', '--list', 'solitario'), /solitario/u);
  ok(await git.eliminaRamo({ sessionId: 's', ramo: 'solitario', forza: true }));
  // niente da mettere da parte: pulito, e in una cartella senza file tracciati
  assert.equal((await git.accantona({ sessionId: 's' })).code, 'GIT_NOTHING_TO_STASH');
  mkdirSync(join(base, 'vuota'));
  writeFileSync(join(base, 'vuota', 'x.txt'), 'x\n');
  assert.equal((await servizioItaliano({ s: join(base, 'vuota') }).accantona({ sessionId: 's' })).code, 'GIT_NOTHING_TO_STASH');
  // riprendere con un conflitto
  writeFileSync(join(base, 'a.txt'), 'messo da parte\n');
  const { accantonati: [voce] } = ok(await git.accantona({ sessionId: 's' }));
  committa(g, base, 'a.txt', 'cambiato dopo\n', 'dopo');
  assert.equal((await git.riprendiAccantonato({ sessionId: 's', indice: voce.indice, commit: voce.commit })).code, 'GIT_STASH_CONFLICT');
});
