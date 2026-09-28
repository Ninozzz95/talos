/**
 * git-service.test.mjs — W1-05 (05/09).
 *
 * ⛔ I repository sono VERI, creati qui da `git init`: niente finzioni. Le
 * cose che questa riga doveva dimostrare — un nome accentato che non si
 * deforma, una rinomina che non si capovolge, un commit che non raccoglie il
 * lavoro di un'altra sessione — non si possono provare con un doppio, perché
 * il difetto vive proprio nel modo in cui git parla.
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, appendFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { analizzaStatoPorcelain, creaServizioGit, normalizzaPercorso, GitServiceError } from '../src/git-service.mjs';

const QUI = dirname(fileURLToPath(import.meta.url));

/** Un repository vero e usa-e-getta, con identità LOCALE (i test non dipendono dal `~/.gitconfig` di chi li lancia). */
function repoVero(t, { conIdentita = true } = {}) {
  const base = mkdtempSync(join(tmpdir(), 'talos-git-test-'));
  t.after(() => rmSync(base, { recursive: true, force: true }));
  const g = (...args) => execFileSync('git', args, { cwd: base, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  g('init', '-q');
  if (conIdentita) {
    g('config', 'user.email', 'prova@example.invalid');
    g('config', 'user.name', 'Prova');
  }
  return { base, g };
}

function servizio(cartelle, extra = {}) {
  return creaServizioGit({ cartellaDiSessione: (id) => cartelle[id] ?? null, ...extra });
}

/* ═══════════════════════════ 1. I NOMI ═══════════════════════════ */

test('⭐⭐⭐ un nome ACCENTATO e uno con uno SPAZIO arrivano IDENTICI, senza escape (è la prova che morde su `-z`)', async (t) => {
  const { base, g } = repoVero(t);
  writeFileSync(join(base, 'àccento.txt'), 'a\n');
  writeFileSync(join(base, 'con spazio.txt'), 'b\n');
  writeFileSync(join(base, 'però costa 3€.txt'), 'c\n');
  const git = servizio({ s1: base });

  const esito = await git.stato({ sessionId: 's1' });
  assert.ok(!('erroreAvvio' in esito), esito.erroreAvvio);
  const nomi = esito.voci.map((v) => v.percorso).sort();
  assert.deepEqual(nomi, ['con spazio.txt', 'però costa 3€.txt', 'àccento.txt'].sort());
  /* ⛔ La forma sbagliata, nominata: senza `-z` git avrebbe risposto `"\303\240ccento.txt"`. */
  for (const nome of nomi) {
    assert.ok(!nome.includes('\\'), `«${nome}» contiene un backslash: è un escape ottale, non un nome`);
    assert.ok(!nome.startsWith('"'), `«${nome}» è fra virgolette: core.quotePath ha deformato il nome`);
    assert.ok(!nome.includes('\uFFFD'), `«${nome}» contiene il carattere di sostituzione: la decodifica UTF-8 si è spezzata`);
  }
  /* ⛔ E il nome deve essere USABILE, non solo bello: il file esiste davvero con quel nome. */
  for (const nome of nomi) assert.ok(existsSync(join(base, nome)), `«${nome}» non esiste sul disco: il nome è stato deformato`);

  // Lo stesso nome deve tornare identico anche dopo essere passato per stage.
  g('add', '--', 'àccento.txt');
  const dopo = await git.stato({ sessionId: 's1' });
  const accentato = dopo.voci.find((v) => v.percorso === 'àccento.txt');
  assert.ok(accentato, 'il nome accentato è cambiato passando dallo stage');
  assert.equal(accentato.staged, true);
});

/* ═══════════════════════════ 2. LA RINOMINA ═══════════════════════════ */

test('⭐⭐⭐ una RINOMINA arriva nel verso GIUSTO: `da` è il nome vecchio, `percorso` il nuovo (nel flusso -z l\'ordine è invertito)', async (t) => {
  const { base, g } = repoVero(t);
  writeFileSync(join(base, 'vecchio.txt'), 'contenuto abbastanza lungo da farsi riconoscere come rinomina\n');
  g('add', '--', 'vecchio.txt');
  g('commit', '-q', '-m', 'base');
  g('mv', 'vecchio.txt', 'nuovo.txt');

  const esito = await servizio({ s1: base }).stato({ sessionId: 's1' });
  const rinomina = esito.voci.find((v) => v.tipo === 'rinominato');
  assert.ok(rinomina, 'la rinomina non è stata riconosciuta');
  assert.equal(rinomina.percorso, 'nuovo.txt', 'il DOVE è sbagliato: la rinomina è stata letta al contrario');
  assert.equal(rinomina.da, 'vecchio.txt', 'il DA è sbagliato: la rinomina è stata letta al contrario');
  /* ⛔ E il file vecchio non deve comparire come voce a sé: sarebbe un file fantasma nella Review. */
  assert.equal(esito.voci.filter((v) => v.percorso === 'vecchio.txt').length, 0);
  assert.equal(esito.voci.length, 1, 'una rinomina è UNA voce, non due');
});

test('⭐⭐ il parser: la rinomina consuma il campo IN PIÙ senza disallineare le voci successive', () => {
  // XY<spazio><DOVE><NUL><DA><NUL> seguito da una voce normale.
  const grezzo = 'R  nuovo.txt\0vecchio.txt\0 M altro.txt\0?? terzo.txt\0';
  const voci = analizzaStatoPorcelain(grezzo);
  assert.equal(voci.length, 3, 'il campo in più della rinomina ha disallineato tutto il resto');
  assert.deepEqual(voci[0], { x: 'R', y: ' ', percorsoRepo: 'nuovo.txt', daRepo: 'vecchio.txt' });
  assert.deepEqual(voci[1], { x: ' ', y: 'M', percorsoRepo: 'altro.txt', daRepo: null });
  assert.deepEqual(voci[2], { x: '?', y: '?', percorsoRepo: 'terzo.txt', daRepo: null });
});

test('WORKFLOW-BASELINE-CHARACTERIZATION — porcelain -z preserva newline e Unicode nel pathname', () => {
  /*
   * ⛔ 20/09/2026 — non creare davvero un filename con newline: su Windows i
   * control character non sono validi. Il parser però deve restare corretto
   * davanti all'output Git NUL-delimited prodotto su filesystem che li ammettono.
   */
  const grezzo = '?? riga\nspezzata.txt\0?? città-€.txt\0';
  const voci = analizzaStatoPorcelain(grezzo);
  assert.deepEqual(voci.map((voce) => voce.percorsoRepo), ['riga\nspezzata.txt', 'città-€.txt']);
});

/* ═══════════════════════ 3. STAGED contro NON STAGED ═══════════════════════ */

test('⭐⭐⭐ staged e non-staged si distinguono per i DUE caratteri XY: X è l\'indice, Y l\'albero di lavoro', async (t) => {
  const { base, g } = repoVero(t);
  writeFileSync(join(base, 'solo-stage.txt'), 'v0\n');
  writeFileSync(join(base, 'solo-lavoro.txt'), 'v0\n');
  writeFileSync(join(base, 'tutti-e-due.txt'), 'v0\n');
  g('add', '--', 'solo-stage.txt', 'solo-lavoro.txt', 'tutti-e-due.txt');
  g('commit', '-q', '-m', 'base');
  writeFileSync(join(base, 'solo-stage.txt'), 'v1\n');
  g('add', '--', 'solo-stage.txt');
  writeFileSync(join(base, 'solo-lavoro.txt'), 'v1\n');
  writeFileSync(join(base, 'tutti-e-due.txt'), 'v1\n');
  g('add', '--', 'tutti-e-due.txt');
  writeFileSync(join(base, 'tutti-e-due.txt'), 'v2\n');
  writeFileSync(join(base, 'mai-visto.txt'), 'nuovo\n');

  const esito = await servizio({ s1: base }).stato({ sessionId: 's1' });
  const per = Object.fromEntries(esito.voci.map((v) => [v.percorso, v]));

  assert.deepEqual([per['solo-stage.txt'].staged, per['solo-stage.txt'].nonStaged], [true, false]);
  assert.deepEqual([per['solo-lavoro.txt'].staged, per['solo-lavoro.txt'].nonStaged], [false, true]);
  assert.deepEqual([per['tutti-e-due.txt'].staged, per['tutti-e-due.txt'].nonStaged], [true, true]);
  assert.equal(per['mai-visto.txt'].tipo, 'nonTracciato');
  assert.equal(per['mai-visto.txt'].staged, false);

  assert.equal(esito.riepilogo.staged, 2);
  assert.equal(esito.riepilogo.nonStaged, 2);
  assert.equal(esito.riepilogo.nonTracciati, 1);
  assert.equal(esito.riepilogo.conflitti, 0);
});

test('⭐⭐ una cancellazione messa in stage è `eliminato` + staged, non un file sparito', async (t) => {
  const { base, g } = repoVero(t);
  writeFileSync(join(base, 'da-togliere.txt'), 'x\n');
  g('add', '--', 'da-togliere.txt');
  g('commit', '-q', '-m', 'base');
  rmSync(join(base, 'da-togliere.txt'));
  const git = servizio({ s1: base });
  const prima = await git.stato({ sessionId: 's1' });
  assert.equal(prima.voci[0].tipo, 'eliminato');
  assert.equal(prima.voci[0].nonStaged, true);
  /* ⛔ AL CONTRARIO del senso comune: `git add` su un file CANCELLATO mette in stage la cancellazione. Se non fosse così, la Review non potrebbe committare una rimozione. */
  const esito = await git.stage({ sessionId: 's1', percorsi: ['da-togliere.txt'] });
  assert.ok(!('erroreAvvio' in esito), esito.erroreAvvio);
  assert.equal(esito.stato.voci[0].staged, true);
  assert.equal(esito.stato.voci[0].tipo, 'eliminato');
});

/* ═══════════════════════ 4. IL CONFINE DEI REPO ANNIDATI ═══════════════════════ */

test('⛔⛔⛔ un repository ANNIDATO non si attraversa: si vede la cartella, mai i file dentro, ed è MARCATA (W1-13)', async (t) => {
  const { base, g } = repoVero(t);
  writeFileSync(join(base, 'radice.txt'), 'r\n');
  g('add', '--', 'radice.txt');
  g('commit', '-q', '-m', 'base');
  const annidato = join(base, 'annidato');
  mkdirSync(annidato);
  execFileSync('git', ['init', '-q'], { cwd: annidato });
  writeFileSync(join(annidato, 'segreto.txt'), 's\n');
  writeFileSync(join(annidato, 'altro-segreto.txt'), 's\n');
  // Una cartella non tracciata NORMALE, per il confronto: quella non è un repo.
  mkdirSync(join(base, 'normale'));
  writeFileSync(join(base, 'normale', 'f.txt'), 'f\n');

  const esito = await servizio({ s1: base }).stato({ sessionId: 's1' });
  const percorsi = esito.voci.map((v) => v.percorso).sort();
  assert.deepEqual(percorsi, ['annidato/', 'normale/']);
  /* ⛔ La prova che conta: nessun file del repo annidato è finito nell'elenco. */
  assert.equal(esito.voci.some((v) => v.percorso.includes('segreto')), false, 'il contenuto di un repository annidato è trapelato');

  const voceAnnidata = esito.voci.find((v) => v.percorso === 'annidato/');
  assert.equal(voceAnnidata.repoAnnidato, true, 'un repo annidato non è marcato: la Review lo mostrerebbe come una normale cartella da aggiungere');
  assert.equal(esito.voci.find((v) => v.percorso === 'normale/').repoAnnidato, false, 'una cartella qualunque è stata scambiata per un repository');
});

/* ═══════════════════ 5. LA SESSIONE DENTRO UNA SOTTOCARTELLA ═══════════════════ */

test('⛔⛔⛔ sessione in una SOTTOCARTELLA: i percorsi sono relativi ALLA SESSIONE, e il resto del repo padre NON si vede', async (t) => {
  const { base, g } = repoVero(t);
  writeFileSync(join(base, 'della-radice.txt'), 'r\n');
  const sotto = join(base, 'sottocartella');
  mkdirSync(sotto);
  writeFileSync(join(sotto, 'mio.txt'), 'm\n');
  mkdirSync(join(sotto, 'giu'));
  writeFileSync(join(sotto, 'giu', 'profondo.txt'), 'p\n');
  g('add', '--', 'sottocartella/mio.txt', 'sottocartella/giu/profondo.txt', 'della-radice.txt');

  const esito = await servizio({ s1: sotto }).stato({ sessionId: 's1' });
  assert.ok(!('erroreAvvio' in esito), esito.erroreAvvio);
  const percorsi = esito.voci.map((v) => v.percorso).sort();
  /* ⛔ MISURATO: senza `-- .` qui comparirebbe anche `della-radice.txt`, cioè un file fuori dal workspace della sessione. */
  assert.deepEqual(percorsi, ['giu/profondo.txt', 'mio.txt']);
  assert.equal(esito.voci.some((v) => v.percorso.includes('della-radice')), false, 'un file del repo padre, fuori dalla cartella di sessione, è trapelato');

  // La radice del repo e il prefisso restano dichiarati: la Review deve poterlo dire.
  assert.equal(esito.cartellaEradiceRepo, false);
  assert.equal(esito.prefisso, 'sottocartella/');
  /* ⛔ Il percorso «di git» resta disponibile, ma non è il vocabolario dell'API. */
  assert.equal(esito.voci.find((v) => v.percorso === 'mio.txt').percorsoRepo, 'sottocartella/mio.txt');

  // E lo stage funziona con lo STESSO vocabolario: percorsi relativi alla sessione.
  const git = servizio({ s1: sotto });
  const messo = await git.unstage({ sessionId: 's1', percorsi: ['mio.txt'] });
  assert.ok(!('erroreAvvio' in messo), messo.erroreAvvio);
  assert.equal(messo.stato.voci.find((v) => v.percorso === 'mio.txt').staged, false);
  /* ⛔ E l'unstage non ha toccato il file della radice del repo, che non è suo. */
  assert.equal(execFileSync('git', ['diff', '--cached', '--name-only'], { cwd: base, encoding: 'utf8' }).includes('della-radice.txt'), true);
});

test('⛔⛔⛔ una cartella di sessione INTERAMENTE non tracciata non diventa UNA voce con il percorso VUOTO: si vedono i file veri', async (t) => {
  /*
   * ⛔ Il caso che ha rotto la prima stesura di questo file, trovato
   * sabotando `-- .` e misurando cosa cambiava davvero. git COLLASSA una
   * cartella non tracciata: da dentro `sessione/` risponde `?? sessione/`,
   * cioè esattamente il prefisso — che tolto lascia la stringa vuota. La
   * Review avrebbe mostrato una riga senza nome, non stageabile.
   */
  const { base, g } = repoVero(t);
  writeFileSync(join(base, 'radice.txt'), 'r\n');
  g('add', '--', 'radice.txt');
  g('commit', '-q', '-m', 'base');
  const sessione = join(base, 'sessione');
  mkdirSync(sessione);
  writeFileSync(join(sessione, 'uno.txt'), '1\n');
  mkdirSync(join(sessione, 'giu'));
  writeFileSync(join(sessione, 'giu', 'due.txt'), '2\n');
  const annidato = join(sessione, 'annidato');
  mkdirSync(annidato);
  execFileSync('git', ['init', '-q'], { cwd: annidato });
  writeFileSync(join(annidato, 'segreto.txt'), 's\n');

  const git = servizio({ s1: sessione });
  const esito = await git.stato({ sessionId: 's1' });
  assert.ok(!('erroreAvvio' in esito), esito.erroreAvvio);
  assert.equal(esito.voci.some((v) => v.percorso === ''), false, 'una voce con il percorso VUOTO: la cartella collassata non è stata aperta');
  assert.deepEqual(esito.voci.map((v) => v.percorso).sort(), ['annidato/', 'giu/due.txt', 'uno.txt']);
  /* ⛔ E il confine di W1-13 regge anche qui: il repo annidato resta una cartella, il suo contenuto non si vede. */
  assert.equal(esito.voci.some((v) => v.percorso.includes('segreto')), false, 'aprendo la cartella collassata è trapelato un repository annidato');
  assert.equal(esito.voci.find((v) => v.percorso === 'annidato/').repoAnnidato, true);
  /* ⛔ E i percorsi che ne escono devono essere USABILI: stage vero, non solo belli da vedere. */
  const messo = await git.stage({ sessionId: 's1', percorsi: ['uno.txt', 'giu/due.txt'] });
  assert.ok(!('erroreAvvio' in messo), messo.erroreAvvio);
  assert.equal(messo.stato.riepilogo.staged, 2);
});

test('⭐ una sessione che È la radice del repo lo dichiara (prefisso vuoto)', async (t) => {
  const { base } = repoVero(t);
  writeFileSync(join(base, 'x.txt'), 'x\n');
  const esito = await servizio({ s1: base }).stato({ sessionId: 's1' });
  assert.equal(esito.prefisso, '');
  assert.equal(esito.cartellaEradiceRepo, true);
});

/* ═══════════════════════════ 6. IL RAMO ═══════════════════════════ */

test('⭐⭐ il ramo si legge anche su un repository SENZA NEMMENO UN COMMIT (dove `rev-parse --abbrev-ref HEAD` esce 128)', async (t) => {
  const { base } = repoVero(t);
  const esito = await servizio({ s1: base }).ramo({ sessionId: 's1' });
  assert.ok(!('erroreAvvio' in esito), esito.erroreAvvio);
  assert.ok(typeof esito.ramo === 'string' && esito.ramo.length > 0, 'nessun ramo su un repo appena creato');
  assert.equal(esito.staccata, false);
  /* ⛔ La forma vecchia, che questo test esiste per escludere: `rev-parse` qui MUORE. */
  assert.throws(() => execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: base, stdio: ['ignore', 'pipe', 'pipe'] }));
});

test('⛔⛔ HEAD STACCATA: `ramo` è null e `staccata` è true — mai la stringa «HEAD», che sembrerebbe un nome di ramo', async (t) => {
  const { base, g } = repoVero(t);
  writeFileSync(join(base, 'x.txt'), 'x\n');
  g('add', '--', 'x.txt');
  g('commit', '-q', '-m', 'base');
  g('checkout', '-q', '--detach', g('rev-parse', 'HEAD').trim());

  const esito = await servizio({ s1: base }).ramo({ sessionId: 's1' });
  assert.equal(esito.ramo, null);
  assert.equal(esito.staccata, true);
  /* ⛔ La bugia misurata della forma vecchia. */
  assert.equal(execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: base, encoding: 'utf8' }).trim(), 'HEAD');
});

/* ═══════════════════ 7. STAGE / UNSTAGE, ANDATA E RITORNO ═══════════════════ */

test('⭐⭐ stage e unstage, andata e ritorno, con un nome accentato e uno con spazio', async (t) => {
  const { base } = repoVero(t);
  writeFileSync(join(base, 'àccento.txt'), 'a\n');
  writeFileSync(join(base, 'con spazio.txt'), 'b\n');
  const git = servizio({ s1: base });

  const messo = await git.stage({ sessionId: 's1', percorsi: ['àccento.txt', 'con spazio.txt'] });
  assert.ok(!('erroreAvvio' in messo), messo.erroreAvvio);
  assert.equal(messo.stato.riepilogo.staged, 2);

  /* ⛔ `git reset` e non `git restore --staged`: qui NON c'è ancora nessun commit, e `restore` non avrebbe un HEAD da cui ripristinare. */
  const tolto = await git.unstage({ sessionId: 's1', percorsi: ['àccento.txt'] });
  assert.ok(!('erroreAvvio' in tolto), tolto.erroreAvvio);
  const per = Object.fromEntries(tolto.stato.voci.map((v) => [v.percorso, v]));
  assert.equal(per['àccento.txt'].tipo, 'nonTracciato', 'il file non è tornato non tracciato: l’unstage non ha morso');
  assert.equal(per['con spazio.txt'].staged, true, 'l’unstage ha toccato un file che non era stato nominato');
});

/* ═══════════════════════════ 8. IL COMMIT ═══════════════════════════ */

test('⭐⭐⭐ commit di percorsi ESPLICITI: quello che un\'ALTRA sessione ha messo in stage resta FUORI e resta in stage', async (t) => {
  const { base, g } = repoVero(t);
  writeFileSync(join(base, 'mio.txt'), 'v0\n');
  writeFileSync(join(base, 'di-un-altro.txt'), 'x0\n');
  g('add', '--', 'mio.txt', 'di-un-altro.txt');
  g('commit', '-q', '-m', 'base');
  writeFileSync(join(base, 'mio.txt'), 'v1\n');
  g('add', '--', 'mio.txt');
  // Un'altra sessione, sullo STESSO indice condiviso, mette in stage roba sua.
  writeFileSync(join(base, 'di-un-altro.txt'), 'x1-lavoro-non-mio\n');
  g('add', '--', 'di-un-altro.txt');

  const esito = await servizio({ s1: base }).commit({ sessionId: 's1', percorsi: ['mio.txt'], messaggio: 'solo il mio\n' });
  assert.ok(!('erroreAvvio' in esito), esito.erroreAvvio);

  const toccati = g('show', '--name-only', '--format=', 'HEAD').trim().split('\n').filter(Boolean);
  assert.deepEqual(toccati, ['mio.txt'], 'il commit ha raccolto lavoro non nominato: è il difetto «due sessioni intrecciano i commit»');
  /* ⛔ E il lavoro dell'altra sessione non è stato né committato né buttato: è ancora lì, in stage. */
  assert.match(g('status', '--porcelain=v1'), /^M {2}di-un-altro\.txt$/mu);
  assert.equal(g('log', '-1', '--format=%s').trim(), 'solo il mio');
});

test('⛔⛔⛔ AL CONTRARIO — un file cambiato DOPO lo stage è RIFIUTATO per nome, perché il commit prenderebbe la versione nuova in silenzio', async (t) => {
  const { base, g } = repoVero(t);
  writeFileSync(join(base, 'a.txt'), 'v0\n');
  g('add', '--', 'a.txt');
  g('commit', '-q', '-m', 'base');
  writeFileSync(join(base, 'a.txt'), 'v1-STAGED\n');
  g('add', '--', 'a.txt');
  writeFileSync(join(base, 'a.txt'), 'v2-ALBERO-DI-LAVORO\n');

  const esito = await servizio({ s1: base }).commit({ sessionId: 's1', percorsi: ['a.txt'], messaggio: 'prova' });
  assert.equal(esito.code, 'GIT_WORKTREE_DIFFERS');
  assert.match(esito.erroreAvvio, /a\.txt/u, 'il rifiuto non dice QUALE file');
  /* ⛔ La prova che il rifiuto serviva a qualcosa: git, lasciato fare, avrebbe committato `v2`, non `v1`. */
  assert.equal(g('log', '--oneline').trim().split('\n').length, 1, 'ha committato lo stesso');
});

test('⛔⛔ AL CONTRARIO — un commit SENZA percorsi espliciti è rifiutato (fotograferebbe l\'intero indice condiviso)', async (t) => {
  const { base, g } = repoVero(t);
  writeFileSync(join(base, 'x.txt'), 'x\n');
  g('add', '--', 'x.txt');
  const git = servizio({ s1: base });
  for (const percorsi of [undefined, [], null, '.', 'x.txt']) {
    const esito = await git.commit({ sessionId: 's1', percorsi, messaggio: 'prova' });
    assert.equal(esito.code, 'GIT_PATHS_REQUIRED', `percorsi=${JSON.stringify(percorsi)} non è stato rifiutato`);
  }
  /* ⛔ E `.` come UNICO percorso dentro un array non è una scorciatoia ammessa: normalizza a vuoto. */
  const punto = await git.commit({ sessionId: 's1', percorsi: ['.'], messaggio: 'prova' });
  assert.equal(punto.code, 'GIT_PATH_INVALID');
  assert.equal(g('log', '--oneline', '--all').trim(), '', 'è stato creato un commit');
});

test('⛔⛔ AL CONTRARIO — un commit senza MESSAGGIO è rifiutato, e non nasce nessun commit', async (t) => {
  const { base, g } = repoVero(t);
  writeFileSync(join(base, 'x.txt'), 'x\n');
  g('add', '--', 'x.txt');
  const git = servizio({ s1: base });
  for (const messaggio of [undefined, '', '   \n\t ', null, 42]) {
    const esito = await git.commit({ sessionId: 's1', percorsi: ['x.txt'], messaggio });
    assert.equal(esito.code, 'GIT_MESSAGE_REQUIRED', `messaggio=${JSON.stringify(messaggio)} non è stato rifiutato`);
  }
  assert.equal(g('log', '--oneline', '--all').trim(), '');
});

test('⭐⭐ il messaggio passa da un FILE, non dalla riga di comando: multilinea, accenti e `#` sopravvivono intatti', async (t) => {
  const { base, g } = repoVero(t);
  writeFileSync(join(base, 'x.txt'), 'x\n');
  g('add', '--', 'x.txt');
  const messaggio = 'perché il però è così\n\nSeconda riga con un cancelletto: #42 e una "virgoletta"\nTerza riga\n';
  const esito = await servizio({ s1: base }).commit({ sessionId: 's1', percorsi: ['x.txt'], messaggio });
  assert.ok(!('erroreAvvio' in esito), esito.erroreAvvio);
  const scritto = g('log', '-1', '--format=%B');
  assert.match(scritto, /perché il però è così/u, 'gli accenti del messaggio si sono persi');
  assert.match(scritto, /#42/u, '`--cleanup=whitespace` non è stato applicato: il `#` è stato preso per un commento e cancellato');
  assert.match(scritto, /Seconda riga/u);
  assert.match(scritto, /Terza riga/u);
});

test('⛔ AL CONTRARIO — committare un percorso che non ha NIENTE da committare è rifiutato per nome, non con un errore di git', async (t) => {
  const { base, g } = repoVero(t);
  writeFileSync(join(base, 'x.txt'), 'x\n');
  g('add', '--', 'x.txt');
  g('commit', '-q', '-m', 'base');
  const esito = await servizio({ s1: base }).commit({ sessionId: 's1', percorsi: ['x.txt'], messaggio: 'niente da fare' });
  assert.equal(esito.code, 'GIT_NOTHING_TO_COMMIT');
  assert.match(esito.erroreAvvio, /x\.txt/u);
});

/* ═══════════ 9. AL CONTRARIO — i rifiuti che devono esistere ═══════════ */

test('⛔⛔⛔ una cartella che NON è un repository: errore pulito e NOMINATO, mai un crash né un falso «pulito»', async (t) => {
  const base = mkdtempSync(join(tmpdir(), 'talos-non-repo-'));
  t.after(() => rmSync(base, { recursive: true, force: true }));
  writeFileSync(join(base, 'un-file.txt'), 'x\n');
  const git = servizio({ s1: base });

  for (const [nome, chiamata] of [
    ['stato', () => git.stato({ sessionId: 's1' })],
    ['ramo', () => git.ramo({ sessionId: 's1' })],
    ['stage', () => git.stage({ sessionId: 's1', percorsi: ['un-file.txt'] })],
    ['unstage', () => git.unstage({ sessionId: 's1', percorsi: ['un-file.txt'] })],
    ['commit', () => git.commit({ sessionId: 's1', percorsi: ['un-file.txt'], messaggio: 'x' })],
  ]) {
    const esito = await chiamata();
    assert.equal(esito.code, 'GIT_NOT_A_REPOSITORY', `${nome} non ha nominato il problema`);
    /* ⛔ La forma peggiore sarebbe questa: un elenco vuoto che si legge come «tutto committato». */
    assert.equal('voci' in esito, false, `${nome} ha risposto con uno stato invece che con un rifiuto`);
  }
});

test('⛔⛔⛔ un percorso FUORI dal workspace è rifiutato in tutte le sue forme', async (t) => {
  const { base } = repoVero(t);
  const git = servizio({ s1: base });
  const cattivi = [
    '../fuori.txt', '..\\fuori.txt', 'dentro/../../fuori.txt',
    'C:/Windows/System32/drivers/etc/hosts', '/etc/passwd', '\\\\server\\share\\x',
    ':/', ':(exclude)qualcosa', ':!qualcosa', ':/radice.txt',
    '-x', '--git-dir=/altro', '', '   ', 'con\0nul',
  ];
  for (const cattivo of cattivi) {
    for (const [nome, chiamata] of [
      ['stage', () => git.stage({ sessionId: 's1', percorsi: [cattivo] })],
      ['unstage', () => git.unstage({ sessionId: 's1', percorsi: [cattivo] })],
      ['commit', () => git.commit({ sessionId: 's1', percorsi: [cattivo], messaggio: 'x' })],
    ]) {
      const esito = await chiamata();
      assert.equal(esito.code, 'GIT_PATH_INVALID', `${nome} ha ACCETTATO «${cattivo}»`);
    }
  }
});

test('⛔⛔⛔ la magia dei pathspec non passa: `:/` metterebbe in stage l\'INTERO repository padre (misurato), qui è rifiutata', async (t) => {
  const { base } = repoVero(t);
  writeFileSync(join(base, 'della-radice.txt'), 'r\n');
  const sotto = join(base, 'sottocartella');
  mkdirSync(sotto);
  writeFileSync(join(sotto, 'mio.txt'), 'm\n');
  const git = servizio({ s1: sotto });
  const esito = await git.stage({ sessionId: 's1', percorsi: [':/'] });
  assert.equal(esito.code, 'GIT_PATH_INVALID');
  /* ⛔ La prova che serviva: l'indice del repo padre non è stato toccato. */
  assert.equal(execFileSync('git', ['diff', '--cached', '--name-only'], { cwd: base, encoding: 'utf8' }).trim(), '');
});

test('⛔⛔ una sessione SCONOSCIUTA non prende NIENTE: nessun ripiego su una cartella qualunque', async (t) => {
  const { base } = repoVero(t);
  const git = servizio({ s1: base });
  for (const [nome, chiamata] of [
    ['stato', () => git.stato({ sessionId: 'inventata' })],
    ['ramo', () => git.ramo({ sessionId: 'inventata' })],
    ['stage', () => git.stage({ sessionId: 'inventata', percorsi: ['x.txt'] })],
    ['unstage', () => git.unstage({ sessionId: 'inventata', percorsi: ['x.txt'] })],
    ['commit', () => git.commit({ sessionId: 'inventata', percorsi: ['x.txt'], messaggio: 'x' })],
  ]) {
    const esito = await chiamata();
    assert.equal(esito.code, 'NOT_FOUND', `${nome} ha risposto a una sessione che non esiste`);
  }
  for (const cattivo of [undefined, '', null, 42, {}]) {
    assert.equal((await git.stato({ sessionId: cattivo })).code, 'QUERY_INVALID');
  }
});

/* ═══════════════════ 10. IL PIN del remoto (riscritto in F6-2, 27/09/2026) ═══════════════════ */

test('⛔⛔⛔ PIN — il remoto ha regole scritte: `push` in UN posto, sempre `--porcelain`, MAI forzato; niente prompt nel terminale', () => {
  const sorgente = readFileSync(join(QUI, '..', 'src', 'git-service.mjs'), 'utf8');
  /* ⛔ Si guarda il CODICE, non i commenti: i commenti spiegano le regole e nominano ciò che è vietato. */
  const codice = sorgente
    .replace(/\/\*[\s\S]*?\*\//gu, '')
    .replace(/^\s*\/\/.*$/gmu, '');
  /* Dal 05/09 al 27/09 qui si pinnava «push non esiste». Owner 26/09 (decisione 2) e 27/09 (16-23): esiste, con queste regole. */
  /* ⛔ Si conta la STRINGA 'push', cioè l'argomento passato a git: il regex dei remoti (`(fetch|push)`) e un testo d'errore non sono comandi. */
  const push = [...codice.matchAll(/'push'/gu)];
  assert.equal(push.length, 1, `'push' compare ${push.length} volte nel codice: deve stare in UN solo posto (invia)`);
  assert.match(codice, /\['push', '--porcelain'/u, 'il push si legge dai flag di --porcelain, non dall inglese');
  for (const vietato of ['--force', '--force-with-lease', '--force-if-includes', '--mirror']) {
    assert.equal(codice.includes(vietato), false, `«${vietato}» è comparso nel codice: un push forzato o distruttivo non esiste`);
  }
  /* e gli ARGOMENTI del push, presi dalla riga che lo costruisce: né cancellazioni né potature né `-f` (quello di `clean -f` in `annulla` è un'altra cosa) */
  const argomentiPush = /\['push'[^\]]*\]/u.exec(codice)?.[0] ?? '';
  assert.ok(argomentiPush.includes("'--porcelain'"), argomentiPush);
  for (const vietato of ["'-f'", '--delete', '--prune', '--tags', '--all']) {
    assert.equal(argomentiPush.includes(vietato), false, `«${vietato}» fra gli argomenti del push: ${argomentiPush}`);
  }
  assert.match(codice, /GIT_TERMINAL_PROMPT: '0'/u, 'un comando di rete non chiede mai nel terminale');
  assert.equal(codice.includes('--autostash'), false, 'niente autostash: i file che bloccano si dicono per nome (owner, punto 20)');
  /* ⛔ AL CONTRARIO — la guardia deve MORDERE: su un codice che forza, deve accendersi. */
  assert.equal(/'push'/u.test("git(cartella, ['push', '--force'])"), true, 'la guardia non riconoscerebbe un git push vero');
  assert.equal(/'push'/u.test('voci.push(riga);'), false, 'la guardia scambia un array per un comando git');

  const superficie = Object.keys(creaServizioGit({ cartellaDiSessione: () => null })).sort();
  /* ⭐ 26/09/2026 — F6-1 (memoria `decisioni-owner-f6-github-26-09`): locale con diff, annulla, commit di ciò che è preparato,
     ultimo commit, rami, stash, storia, pezzi, ✨. ⭐ 27/09 — F6-2 (punti 16-23): remoti, sincronizzazione, recupera + ferma,
     scarica, invia. Tutto ciò che parla col remoto sta in queste cinque porte, e in nessun'altra. ⭐ 27/09 — F6-2 passo 4
     (decisione 24): `modificheFra` e `diffFra`, le modifiche di un commit del grafo — sola lettura, nessuna rete. ⭐ 27/09 — F6-3
     (decisione 25): `perLaPr`, la bozza di una PR (base, rami del remoto, commit) — sola lettura, nessuna rete; GitHub sta in
     `gh-service.mjs`, mai qui. ⭐ 28/09 — `inizializza`, il `git init` del pulsante «come VS Code»: locale, nessuna rete. */
  assert.deepEqual(superficie, ['accantona', 'accantonati', 'annulla', 'annullaUltimoCommit', 'cambiaRamo', 'commit', 'commitPreparato', 'creaRamo', 'diff', 'diffFra', 'diffPerMessaggio', 'eliminaRamo', 'fermaRecupero', 'inizializza', 'invia', 'modificaUltimoCommit', 'modificheFra', 'perLaPr', 'pezzo', 'rami', 'ramo', 'recupera', 'remoti', 'rinominaRamo', 'riprendiAccantonato', 'scarica', 'scartaAccantonato', 'sincronizzazione', 'stage', 'stato', 'storia', 'unstage']);
});

/* ═══════════════════ 11. Il perché del Buffer, e le briciole ═══════════════════ */

test('⛔ perché l\'uscita si decodifica UNA volta sola: un carattere UTF-8 spezzato in due pezzi diventa spazzatura', () => {
  /*
   * Questa non è una prova sul servizio: è la prova che il PERICOLO esiste, e
   * quindi che scegliere `execFile` con `encoding:'buffer'` invece di
   * `runApprovedProcess` (che decodifica ogni chunk separatamente) non è un
   * gusto. Il taglio a cavallo di un carattere non è riproducibile a comando
   * su una pipe vera — la sua CAUSA sì, ed è questa.
   */
  const byte = Buffer.from('àccento.txt', 'utf8');
  const spezzato = byte.subarray(0, 1).toString('utf8') + byte.subarray(1).toString('utf8');
  assert.notEqual(spezzato, 'àccento.txt');
  assert.ok(spezzato.includes('\uFFFD'), 'la premessa di questo test non vale più');
  assert.equal(byte.toString('utf8'), 'àccento.txt', 'decodificato in una volta sola, il nome è intatto');
});

test('⭐ normalizzaPercorso pulisce senza cambiare significato', () => {
  const radice = process.platform === 'win32' ? 'C:\\lavoro' : '/lavoro';
  assert.equal(normalizzaPercorso(radice, 'a/b.txt'), 'a/b.txt');
  assert.equal(normalizzaPercorso(radice, './a/./b.txt'), 'a/b.txt');
  assert.equal(normalizzaPercorso(radice, 'a\\b.txt'), 'a/b.txt');
  assert.equal(normalizzaPercorso(radice, 'àccento.txt'), 'àccento.txt');
  assert.equal(normalizzaPercorso(radice, 'con spazio.txt'), 'con spazio.txt');
  assert.throws(() => normalizzaPercorso(radice, '../fuori'), (e) => e instanceof GitServiceError && e.code === 'GIT_PATH_INVALID');
});

test('⛔ un elenco di percorsi ripetuti non moltiplica gli argomenti passati a git', async (t) => {
  const { base } = repoVero(t);
  writeFileSync(join(base, 'x.txt'), 'x\n');
  const visti = [];
  const git = creaServizioGit({
    cartellaDiSessione: () => base,
    eseguiGitFn: async (cartella, argomenti) => {
      visti.push(argomenti);
      return { codice: 0, stdout: argomenti.includes('--show-toplevel') ? `${base}\n\n` : '', stderr: '' };
    },
  });
  await git.stage({ sessionId: 's1', percorsi: ['x.txt', './x.txt', 'x.txt'] });
  const add = visti.find((a) => a.includes('add'));
  assert.deepEqual(add.slice(add.indexOf('--') + 1), ['x.txt']);
  /*
   * ⛔ Il pin di `-- .`, guardato dove la cosa succede DAVVERO: negli
   * argomenti. Sabotandolo, l'elenco che esce non cambia (il containment lo
   * fa il filtro sul prefisso) — quindi un test sull'elenco NON lo
   * proverebbe, e lo si potrebbe togliere senza accorgersene, pagando da lì
   * in poi la scansione dell'intero repository padre a ogni aggiornamento.
   */
  const status = visti.find((a) => a.includes('status'));
  assert.deepEqual(status.slice(status.indexOf('status')), ['status', '--porcelain=v1', '-z', '--', '.'], 'lo status non è più ristretto alla cartella della sessione');
  /* ⛔ E i due flag obbligatori sono davanti a OGNI comando, non solo al primo. */
  for (const argomenti of visti) {
    assert.equal(argomenti[0], '--no-optional-locks', `manca --no-optional-locks su ${argomenti.join(' ')}`);
    assert.equal(argomenti[1], '--literal-pathspecs', `manca --literal-pathspecs su ${argomenti.join(' ')}`);
  }
});

test('⭐⭐ un CONFLITTO non è né staged né non-staged: è una terza cosa, e si conta a parte', async (t) => {
  const { base, g } = repoVero(t);
  writeFileSync(join(base, 'conteso.txt'), 'base\n');
  g('add', '--', 'conteso.txt');
  g('commit', '-q', '-m', 'base');
  g('checkout', '-q', '-b', 'ramo-a');
  writeFileSync(join(base, 'conteso.txt'), 'versione A\n');
  g('add', '--', 'conteso.txt');
  g('commit', '-q', '-m', 'a');
  g('checkout', '-q', '-');
  writeFileSync(join(base, 'conteso.txt'), 'versione B\n');
  g('add', '--', 'conteso.txt');
  g('commit', '-q', '-m', 'b');
  try { g('merge', 'ramo-a'); } catch { /* il conflitto è ESATTAMENTE ciò che serve */ }

  const esito = await servizio({ s1: base }).stato({ sessionId: 's1' });
  const voce = esito.voci.find((v) => v.percorso === 'conteso.txt');
  assert.equal(voce.conflitto, true);
  assert.equal(voce.tipo, 'conflitto');
  assert.equal(voce.staged, false, 'un conflitto contato come «pronto da committare» è una bugia');
  assert.equal(esito.riepilogo.conflitti, 1);

  /* ⛔ AL CONTRARIO — e committarlo così com'è viene rifiutato. */
  const commit = await servizio({ s1: base }).commit({ sessionId: 's1', percorsi: ['conteso.txt'], messaggio: 'x' });
  assert.equal(commit.code, 'GIT_NOTHING_TO_COMMIT');
});

test('WORKFLOW-BASELINE-CHARACTERIZATION — un submodule dirty è osservato come modifica ma NON è un repoAnnidato non tracciato', async (t) => {
  const { base, g } = repoVero(t);
  const sorgente = mkdtempSync(join(tmpdir(), 'talos-git-submodule-source-'));
  t.after(() => rmSync(sorgente, { recursive: true, force: true }));
  const sg = (...args) => execFileSync('git', args, { cwd: sorgente, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  sg('init', '-q');
  sg('config', 'user.email', 'sub@example.invalid');
  sg('config', 'user.name', 'Submodule');
  writeFileSync(join(sorgente, 'dentro.txt'), 'base\n');
  sg('add', '--', 'dentro.txt');
  sg('commit', '-q', '-m', 'base');

  g('-c', 'protocol.file.allow=always', 'submodule', 'add', '-q', sorgente, 'vendor/sub');
  g('commit', '-q', '-m', 'aggiungi submodule');
  writeFileSync(join(base, 'vendor', 'sub', 'dentro.txt'), 'dirty\n');

  const esito = await servizio({ s1: base }).stato({ sessionId: 's1' });
  const voce = esito.voci.find((v) => v.percorso === 'vendor/sub');
  assert.ok(voce, 'un submodule dirty non può sparire dallo stato del workspace');
  assert.equal(voce.nonStaged, true);
  assert.equal(voce.repoAnnidato, false,
    'repoAnnidato significa repository NON tracciato: la futura WorkspaceBaseline deve distinguere il gitlink con un parser dedicato, non riusare questo flag');
});

test('⭐ un WORKTREE (dove `.git` è un FILE, non una cartella) è un repository come gli altri', async (t) => {
  const { base, g } = repoVero(t);
  writeFileSync(join(base, 'x.txt'), 'x\n');
  g('add', '--', 'x.txt');
  g('commit', '-q', '-m', 'base');
  const altrove = mkdtempSync(join(tmpdir(), 'talos-wt-'));
  t.after(() => rmSync(altrove, { recursive: true, force: true }));
  const wt = join(altrove, 'lavoro');
  g('worktree', 'add', '-q', '-b', 'lane/prova', wt);

  /* ⛔ La premessa di tutto questo modulo, verificata invece che presunta. */
  assert.equal(existsSync(join(wt, '.git')), true);
  assert.equal(readFileSync(join(wt, '.git'), 'utf8').startsWith('gitdir:'), true, '.git non è un FILE: la premessa del worktree non vale');

  writeFileSync(join(wt, 'nel-worktree.txt'), 'w\n');
  appendFileSync(join(wt, 'x.txt'), 'cambiato\n');
  const git = servizio({ s1: wt });
  const stato = await git.stato({ sessionId: 's1' });
  assert.ok(!('erroreAvvio' in stato), stato.erroreAvvio);
  assert.deepEqual(stato.voci.map((v) => v.percorso).sort(), ['nel-worktree.txt', 'x.txt']);
  const ramo = await git.ramo({ sessionId: 's1' });
  assert.equal(ramo.ramo, 'lane/prova');
  g('worktree', 'remove', '--force', wt);
});

/* ═══════════ 28/09 — «Inizializza repository», come VS Code (owner: anche senza accesso a GitHub) ═══════════ */

/** Una cartella usa-e-getta che NON è un repository — e lo si verifica, invece di supporlo. */
function cartellaNonRepo(t) {
  const base = mkdtempSync(join(tmpdir(), 'talos-git-init-'));
  t.after(() => rmSync(base, { recursive: true, force: true }));
  let dentro = true;
  try { execFileSync('git', ['rev-parse', '--git-dir'], { cwd: base, stdio: 'ignore' }); } catch { dentro = false; }
  assert.equal(dentro, false, `premessa: ${base} non deve stare dentro un repository`);
  return base;
}

test('INIT-01 — una cartella qualunque diventa un repository: .git c\'è, il ramo è quello della configurazione, i file sono «nuovi»', async (t) => {
  const base = cartellaNonRepo(t);
  writeFileSync(join(base, 'leggimi.md'), 'ciao\n');
  const git = servizio({ s1: base }, { cartellaUtenteFn: () => join(tmpdir(), 'non-contiene-questa') });
  assert.equal((await git.stato({ sessionId: 's1' })).code, 'GIT_NOT_A_REPOSITORY');

  const esito = await git.inizializza({ sessionId: 's1' });
  assert.ok(!('erroreAvvio' in esito), esito.erroreAvvio);
  assert.equal(existsSync(join(base, '.git')), true);
  let atteso = 'main';
  try { atteso = execFileSync('git', ['config', '--get', 'init.defaultBranch'], { cwd: base, encoding: 'utf8' }).trim() || 'main'; } catch { /* nessuna configurazione: main */ }
  assert.equal(esito.ramo, atteso, 'il ramo iniziale: la configurazione di chi usa l\'app, altrimenti main');
  assert.deepEqual(esito.stato.voci.map((v) => [v.percorso, v.tipo]), [['leggimi.md', 'nonTracciato']]);
  assert.equal(esito.stato.base, null, 'nessun commit ancora: la base è null, non inventata');

  const ancora = await git.inizializza({ sessionId: 's1' });
  assert.equal(ancora.code, 'GIT_ALREADY_A_REPOSITORY', 'la seconda volta si rifiuta, non reinizializza');
});

test('INIT-02 — dentro un repository (anche in una sottocartella) si rifiuta: nessun repository annidato', async (t) => {
  const { base } = repoVero(t);
  mkdirSync(join(base, 'sotto'));
  const git = servizio({ radice: base, sotto: join(base, 'sotto') });
  assert.equal((await git.inizializza({ sessionId: 'radice' })).code, 'GIT_ALREADY_A_REPOSITORY');
  assert.equal((await git.inizializza({ sessionId: 'sotto' })).code, 'GIT_ALREADY_A_REPOSITORY');
  assert.equal(existsSync(join(base, 'sotto', '.git')), false);
  assert.equal((await git.inizializza({ sessionId: 'ignota' })).code, 'NOT_FOUND');
});

test('INIT-03 — una cartella che CONTIENE la cartella utente vuole la conferma, come VS Code; confermata, si crea', async (t) => {
  const base = cartellaNonRepo(t);
  const git = servizio({ s1: base }, { cartellaUtenteFn: () => join(base, 'Utenti', 'io') });
  const senza = await git.inizializza({ sessionId: 's1' });
  assert.equal(senza.code, 'GIT_INIT_NEEDS_CONFIRM');
  assert.equal(existsSync(join(base, '.git')), false, 'senza conferma non si tocca niente');
  assert.equal((await git.inizializza({ sessionId: 's1', conferma: 'true' })).code, 'GIT_INIT_NEEDS_CONFIRM', 'la conferma vale solo come true');
  const uguale = servizio({ s1: base }, { cartellaUtenteFn: () => base });
  assert.equal((await uguale.inizializza({ sessionId: 's1' })).code, 'GIT_INIT_NEEDS_CONFIRM', 'la cartella utente stessa');
  const con = await git.inizializza({ sessionId: 's1', conferma: true });
  assert.ok(!('erroreAvvio' in con), con.erroreAvvio);
  assert.equal(existsSync(join(base, '.git')), true);
});

test('INIT-04 — il ramo iniziale: main SOLO se non è configurato; e un rifiuto diverso da «not a git repository» non inizializza', async () => {
  const chiamate = [];
  let configurato = null;
  let rifiuto = 'fatal: not a git repository (or any of the parent directories): .git\n';
  const eseguiGitFn = async (_cartella, argomenti) => {
    chiamate.push(argomenti.filter((a) => a !== '--no-optional-locks' && a !== '--literal-pathspecs'));
    if (argomenti.includes('--git-dir')) return { codice: 128, stdout: '', stderr: rifiuto };
    if (argomenti.includes('--get')) return configurato ? { codice: 0, stdout: `${configurato}\n`, stderr: '' } : { codice: 1, stdout: '', stderr: '' };
    return { codice: 0, stdout: '', stderr: '' };
  };
  const cartella = join(tmpdir(), 'talos-init-finta-inesistente');
  const git = servizio({ s1: cartella }, { eseguiGitFn, esisteFn: () => false, cartellaUtenteFn: () => join(tmpdir(), 'altrove') });
  const init = () => chiamate.find((a) => a.includes('init'));

  await git.inizializza({ sessionId: 's1' });
  assert.deepEqual(init(), ['-c', 'init.defaultBranch=main', 'init', '-q']);

  chiamate.length = 0;
  configurato = 'trunk';
  await git.inizializza({ sessionId: 's1' });
  assert.deepEqual(init(), ['init', '-q'], 'chi ha scelto un ramo iniziale lo tiene');

  chiamate.length = 0;
  rifiuto = "fatal: detected dubious ownership in repository at 'C:/x'\n";
  const dubbio = await git.inizializza({ sessionId: 's1' });
  assert.equal(dubbio.code, 'GIT_COMMAND_FAILED');
  assert.match(dubbio.erroreAvvio, /dubious ownership/u);
  assert.equal(init(), undefined, 'git non ha potuto guardare: nessun init');

  chiamate.length = 0;
  rifiuto = 'fatal: not a git repository\n';
  const conPunto = servizio({ s1: cartella }, { eseguiGitFn, esisteFn: (p) => p.endsWith('.git'), cartellaUtenteFn: () => join(tmpdir(), 'altrove') });
  assert.equal((await conPunto.inizializza({ sessionId: 's1' })).code, 'GIT_ALREADY_A_REPOSITORY', 'un .git sul disco basta a fermarsi');
  assert.equal(init(), undefined);
});
