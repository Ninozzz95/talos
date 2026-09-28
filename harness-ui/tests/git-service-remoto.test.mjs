/*
 * git-service-remoto.test.mjs — F6-2 (27/09/2026): recupera, scarica, invia. Repository VERI e un remoto «bare» vero, su disco,
 * con due cloni (A = la sessione, B = «gli altri»): nessuna rete, nessun doppio di git. Le regole stanno in testa a
 * `src/git-service.mjs` (decisioni dell'owner 26-27/09, memoria `decisioni-owner-f6-github-26-09`, punti 2 e 16-23).
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { creaServizioGit } from '../src/git-service.mjs';

/** Un remoto bare e due cloni con identità locale; il primo commit arriva da A e va sul remoto, così `main` esiste ovunque. */
function mondo(t, { primoCommit = true } = {}) {
  const base = mkdtempSync(join(tmpdir(), 'talos-git-remoto-'));
  t.after(() => rmSync(base, { recursive: true, force: true }));
  const esegui = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } });
  const remoto = join(base, 'remoto.git');
  execFileSync('git', ['init', '-q', '--bare', '-b', 'main', remoto], { encoding: 'utf8' });
  const clona = (nome) => {
    const dir = join(base, nome);
    execFileSync('git', ['clone', '-q', remoto, dir], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    esegui(dir, 'config', 'user.email', `${nome}@example.invalid`);
    esegui(dir, 'config', 'user.name', nome);
    return { dir, g: (...args) => esegui(dir, ...args) };
  };
  const A = clona('A');
  if (primoCommit) {
    writeFileSync(join(A.dir, 'a.txt'), 'uno\n');
    A.g('add', 'a.txt'); A.g('commit', '-q', '-m', 'primo');
    A.g('push', '-q', '-u', 'origin', 'main');
  }
  const B = clona('B');
  const servizio = creaServizioGit({ cartellaDiSessione: (id) => (id === 'sA' ? A.dir : id === 'sB' ? B.dir : null) });
  const commitIn = (clone, nome, contenuto, messaggio) => { writeFileSync(join(clone.dir, nome), contenuto); clone.g('add', nome); clone.g('commit', '-q', '-m', messaggio); };
  return { base, remoto, A, B, servizio, commitIn };
}

test('F6-2 — remoti e sincronizzazione: il riferimento, avanti/indietro coi numeri, l ultimo recupero, il remoto per l invio', async (t) => {
  const { A, B, servizio, commitIn } = mondo(t);
  assert.deepEqual(await servizio.remoti({ sessionId: 'sA' }), { remoti: [{ nome: 'origin', url: (await servizio.remoti({ sessionId: 'sA' })).remoti[0].url, urlInvio: null }] });
  let s = await servizio.sincronizzazione({ sessionId: 'sA' });
  assert.equal(s.ramo, 'main');
  assert.deepEqual(s.riferimento, { corto: 'origin/main', remoto: 'origin', ramo: 'main' });
  assert.deepEqual([s.avanti, s.indietro, s.riferimentoSparito, s.remotoPerInvio, s.recuperoInCorso], [0, 0, false, 'origin', false]);
  assert.equal(s.ultimoRecupero, null, 'A ha solo inviato: nessun FETCH_HEAD');
  commitIn(A, 'b.txt', 'due\n', 'secondo');
  s = await servizio.sincronizzazione({ sessionId: 'sA' });
  assert.deepEqual([s.avanti, s.indietro], [1, 0], 'un commit solo qui');
  // B manda un commit al remoto: A non lo sa finché non recupera
  commitIn(B, 'c.txt', 'tre\n', 'da B');
  B.g('push', '-q', 'origin', 'main');
  s = await servizio.sincronizzazione({ sessionId: 'sA' });
  assert.deepEqual([s.avanti, s.indietro], [1, 0], 'prima del recupero il remoto è quello di ieri');
  const r = await servizio.recupera({ sessionId: 'sA' });
  assert.equal(r.ok, true); assert.equal(r.remoto, 'origin');
  assert.deepEqual([r.sincronizzazione.avanti, r.sincronizzazione.indietro], [1, 1], 'dopo il recupero: uno qui, uno là');
  assert.ok(typeof r.sincronizzazione.ultimoRecupero === 'string' && Date.now() - Date.parse(r.sincronizzazione.ultimoRecupero) < 60_000, 'l ultimo recupero è adesso');
  // un ramo nuovo, mai pubblicato: nessun riferimento, il remoto per l'invio è origin
  A.g('switch', '-q', '-c', 'lavoro');
  s = await servizio.sincronizzazione({ sessionId: 'sA' });
  assert.deepEqual([s.ramo, s.riferimento, s.avanti, s.indietro, s.remotoPerInvio], ['lavoro', null, null, null, 'origin']);
  // HEAD staccata: nessun ramo, la verità
  A.g('switch', '-q', '--detach');
  s = await servizio.sincronizzazione({ sessionId: 'sA' });
  assert.deepEqual([s.ramo, s.staccata, s.riferimento], [null, true, null]);
});

test('F6-2 — il remoto per l invio segue l ordine di git: pushRemote, pushDefault, il remoto del ramo, origin, l unico; con due e niente config è NULL', async (t) => {
  const { A, B, servizio } = mondo(t);
  A.g('remote', 'add', 'public', B.dir);
  A.g('switch', '-q', '-c', 'nuovo');
  let s = await servizio.sincronizzazione({ sessionId: 'sA' });
  assert.equal(s.remotoPerInvio, 'origin', 'origin esiste: vince come in git');
  A.g('config', 'remote.pushDefault', 'public');
  s = await servizio.sincronizzazione({ sessionId: 'sA' });
  assert.equal(s.remotoPerInvio, 'public');
  A.g('config', 'branch.nuovo.pushRemote', 'origin');
  s = await servizio.sincronizzazione({ sessionId: 'sA' });
  assert.equal(s.remotoPerInvio, 'origin', 'pushRemote del ramo batte pushDefault');
  A.g('config', '--unset', 'branch.nuovo.pushRemote'); A.g('config', '--unset', 'remote.pushDefault');
  A.g('remote', 'rename', 'origin', 'altro');
  s = await servizio.sincronizzazione({ sessionId: 'sA' });
  assert.equal(s.remotoPerInvio, null, 'due remoti, nessuna configurazione, nessun origin: si chiede (owner, punto 22)');
  assert.deepEqual((await servizio.remoti({ sessionId: 'sA' })).remoti.map((r) => r.nome).sort(), ['altro', 'public']);
});

test('F6-2 — recupera: senza remoti si rifiuta, un remoto sconosciuto si rifiuta, un nome che comincia per «-» non esiste', async (t) => {
  const { A, servizio } = mondo(t);
  assert.equal((await servizio.recupera({ sessionId: 'sA', remoto: 'upstream' })).code, 'GIT_REMOTE_UNKNOWN');
  assert.equal((await servizio.recupera({ sessionId: 'sA', remoto: '--all' })).code, 'GIT_REMOTE_UNKNOWN');
  assert.equal((await servizio.recupera({ sessionId: 'sA', remoto: '-v' })).code, 'GIT_REMOTE_UNKNOWN');
  A.g('remote', 'remove', 'origin');
  assert.equal((await servizio.recupera({ sessionId: 'sA' })).code, 'GIT_NO_REMOTE');
  assert.equal((await servizio.sincronizzazione({ sessionId: 'sA' })).remoti.length, 0);
  assert.deepEqual(await servizio.fermaRecupero({ sessionId: 'sA' }), { ok: true, fermato: false }, 'niente da fermare: lo dice');
});

test('F6-2 — «Ferma» durante un recupero: il comando riceve il segnale, l esito è GIT_ABORTED, un secondo recupero è rifiutato mentre gira, e il lock NOSTRO si toglie', async (t) => {
  const { A } = mondo(t);
  /* il fetch VERO finisce in un lampo: qui un fetch finto che resta in volo finché non arriva il segnale, tutto il resto è git vero */
  const eseguiGitFn = async (cartella, argomenti, timeoutMs, { ambiente = null, segnale = null } = {}) => {
    if (argomenti.includes('fetch')) {
      assert.equal(ambiente?.GIT_TERMINAL_PROMPT, '0', 'un comando di rete non chiede nel terminale');
      assert.ok(segnale instanceof AbortSignal, 'il recupero porta il segnale di Ferma');
      writeFileSync(join(A.dir, '.git', 'FETCH_HEAD.lock'), ''); // ciò che un git ucciso a metà lascia dietro
      await new Promise((r) => { if (segnale.aborted) r(); else segnale.addEventListener('abort', r, { once: true }); });
      return { codice: null, stdout: '', stderr: '', annullato: true, scaduto: false };
    }
    try { return { codice: 0, stdout: execFileSync('git', argomenti, { cwd: cartella, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }), stderr: '' }; }
    catch (e) { return { codice: e.status ?? 1, stdout: String(e.stdout ?? ''), stderr: String(e.stderr ?? '') }; }
  };
  const servizio = creaServizioGit({ cartellaDiSessione: (id) => (id === 'sA' ? A.dir : null), eseguiGitFn });
  /* ⛔ AL CONTRARIO: un lock nato PRIMA del nostro avvio è di qualcun altro (un altro git vivo) e resta dov'è */
  const lockAltrui = join(A.dir, '.git', 'ORIG_HEAD.lock');
  writeFileSync(lockAltrui, '');
  const unOraFa = new Date(Date.now() - 3_600_000);
  utimesSync(lockAltrui, unOraFa, unOraFa);
  const inVolo = servizio.recupera({ sessionId: 'sA' });
  await new Promise((r) => setTimeout(r, 150));
  assert.equal((await servizio.sincronizzazione({ sessionId: 'sA' })).recuperoInCorso, true);
  assert.equal((await servizio.recupera({ sessionId: 'sA' })).code, 'GIT_FETCH_RUNNING');
  assert.deepEqual(await servizio.fermaRecupero({ sessionId: 'sA' }), { ok: true, fermato: true });
  const esito = await inVolo;
  assert.equal(esito.code, 'GIT_ABORTED');
  assert.equal(existsSync(join(A.dir, '.git', 'FETCH_HEAD.lock')), false, 'il lock nato dopo il nostro avvio è nostro: tolto');
  assert.equal(existsSync(lockAltrui), true, 'il lock più vecchio del nostro avvio NON è nostro: resta');
  rmSync(lockAltrui, { force: true });
  assert.equal((await servizio.sincronizzazione({ sessionId: 'sA' })).recuperoInCorso, false);
});

test('F6-2 — scarica: avanti veloce quando si può, unione quando serve; senza riferimento si rifiuta; i file che verrebbero sovrascritti fermano tutto, per nome', async (t) => {
  const { A, B, servizio, commitIn } = mondo(t);
  commitIn(B, 'c.txt', 'tre\n', 'da B'); B.g('push', '-q', 'origin', 'main');
  let esito = await servizio.scarica({ sessionId: 'sA' });
  assert.equal(esito.ok, true); assert.equal(esito.conflitti, 0);
  assert.notEqual(esito.commitDopo, esito.commitPrima, 'HEAD è avanzata');
  assert.equal(esito.commitDopo, B.g('rev-parse', 'HEAD').trim(), 'avanti veloce: lo stesso commit di B');
  assert.deepEqual([esito.sincronizzazione.avanti, esito.sincronizzazione.indietro], [0, 0]);
  // divergenza: un commit qui e uno là su file diversi → unione (pull.ff e pull.rebase tacciono ⇒ --ff, come GitHub Desktop)
  commitIn(A, 'd.txt', 'quattro\n', 'da A');
  commitIn(B, 'e.txt', 'cinque\n', 'da B 2'); B.g('push', '-q', 'origin', 'main');
  esito = await servizio.scarica({ sessionId: 'sA' });
  assert.equal(esito.ok, true);
  assert.equal(A.g('log', '-1', '--format=%P').trim().split(' ').length, 2, 'un commit di unione, con due genitori');
  // un file modificato qui che i commit in arrivo toccano: rifiuto per nome, PRIMA di toccare git
  commitIn(B, 'c.txt', 'tre bis\n', 'da B 3'); B.g('push', '-q', 'origin', 'main');
  A.g('fetch', '-q', 'origin');
  writeFileSync(join(A.dir, 'c.txt'), 'tre mio\n');
  esito = await servizio.scarica({ sessionId: 'sA' });
  assert.equal(esito.code, 'GIT_WORKTREE_DIRTY');
  assert.match(esito.erroreAvvio, /c\.txt/u, 'il nome del file che blocca');
  assert.equal(A.g('status', '--porcelain').trimEnd(), ' M c.txt', 'niente è cambiato');
  // senza riferimento
  A.g('restore', 'c.txt'); A.g('switch', '-q', '-c', 'orfano');
  assert.equal((await servizio.scarica({ sessionId: 'sA' })).code, 'GIT_NO_UPSTREAM');
  A.g('switch', '-q', '--detach');
  assert.equal((await servizio.scarica({ sessionId: 'sA' })).code, 'GIT_DETACHED');
});

test('F6-2 — scarica passa `--ff` solo se `pull.ff` tace (GitHub Desktop `pull.ts:115-135`), e sempre `--no-edit`, `--` e il remoto del riferimento', async (t) => {
  const { A, B, commitIn } = mondo(t);
  /* ⛔ Una prova sull'ESITO non può vederlo su Windows: il gitconfig di SISTEMA ha già `pull.rebase=false` (misurato il 27/09), e git
     unisce comunque. Si guarda quindi ciò che va a git — il resto è git vero. */
  const pull = [];
  const eseguiGitFn = async (cartella, argomenti, timeoutMs, { ambiente = null } = {}) => {
    if (argomenti.includes('pull')) pull.push(argomenti.slice(argomenti.indexOf('pull')));
    try { return { codice: 0, stdout: execFileSync('git', argomenti, { cwd: cartella, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, ...(ambiente ?? {}) } }), stderr: '' }; }
    catch (e) { return { codice: e.status ?? 1, stdout: String(e.stdout ?? ''), stderr: String(e.stderr ?? '') }; }
  };
  const servizio = creaServizioGit({ cartellaDiSessione: (id) => (id === 'sA' ? A.dir : null), eseguiGitFn });
  commitIn(B, 'c.txt', 'tre\n', 'da B'); B.g('push', '-q', 'origin', 'main');
  assert.equal((await servizio.scarica({ sessionId: 'sA' })).ok, true);
  assert.deepEqual(pull.at(-1), ['pull', '--no-edit', '--ff', '--', 'origin']);
  A.g('config', 'pull.ff', 'only');
  commitIn(B, 'd.txt', 'quattro\n', 'da B 2'); B.g('push', '-q', 'origin', 'main');
  assert.equal((await servizio.scarica({ sessionId: 'sA' })).ok, true);
  assert.deepEqual(pull.at(-1), ['pull', '--no-edit', '--', 'origin'], 'la scelta del progetto vince: niente --ff');
});

test('F6-2 — scarica con conflitto: non è un errore, è lo stato che torna (conflitti > 0), e da lì niente altro scarica finché non si risolve', async (t) => {
  const { A, B, servizio, commitIn } = mondo(t);
  commitIn(A, 'a.txt', 'versione A\n', 'A cambia a');
  commitIn(B, 'a.txt', 'versione B\n', 'B cambia a'); B.g('push', '-q', 'origin', 'main');
  const esito = await servizio.scarica({ sessionId: 'sA' });
  assert.equal(esito.ok, false);
  assert.equal(esito.conflitti, 1);
  assert.equal(esito.stato.voci.find((v) => v.percorso === 'a.txt')?.conflitto, true);
  assert.equal((await servizio.scarica({ sessionId: 'sA' })).code, 'GIT_CONFLICTS');
  assert.equal((await servizio.invia({ sessionId: 'sA' })).code, 'GIT_BEHIND', 'e non si invia sopra un remoto più avanti');
});

test('F6-2 — invia: pubblica un ramo nuovo con --set-upstream sul remoto scelto, poi manda i commit; niente da inviare lo dice; il flag «!» di --porcelain è un rifiuto', async (t) => {
  const { A, B, servizio, commitIn } = mondo(t);
  A.g('switch', '-q', '-c', 'lavoro');
  commitIn(A, 'l.txt', 'lavoro\n', 'sul ramo');
  assert.equal((await servizio.invia({ sessionId: 'sA', remoto: 'inesistente' })).code, 'GIT_REMOTE_UNKNOWN');
  let esito = await servizio.invia({ sessionId: 'sA', remoto: 'origin' });
  assert.equal(esito.ok, true);
  assert.deepEqual([esito.remoto, esito.ramo, esito.pubblicato], ['origin', 'lavoro', true]);
  assert.equal(esito.esiti[0].flag, '*', 'un ref nuovo sul remoto');
  assert.deepEqual(esito.sincronizzazione.riferimento, { corto: 'origin/lavoro', remoto: 'origin', ramo: 'lavoro' }, 'da ora il ramo segue il remoto');
  assert.equal(B.g('ls-remote', '--heads', 'origin', 'lavoro').includes('refs/heads/lavoro'), true);
  esito = await servizio.invia({ sessionId: 'sA' });
  assert.equal(esito.nienteDaInviare, true);
  commitIn(A, 'm.txt', 'm\n', 'ancora');
  assert.equal((await servizio.invia({ sessionId: 'sA', remoto: 'altro' })).code, 'GIT_REMOTE_MISMATCH', 'il ramo segue origin: si va lì');
  esito = await servizio.invia({ sessionId: 'sA', remoto: 'origin' });
  assert.equal(esito.ok, true); assert.equal(esito.pubblicato, false); assert.equal(esito.esiti[0].flag, ' ', 'avanti veloce');
  // il remoto va avanti da un'altra parte, e qui NON si è recuperato: la nostra guardia non lo sa, git risponde «!» — e si dice
  B.g('fetch', '-q', 'origin'); B.g('switch', '-q', '-c', 'lavoro', 'origin/lavoro');
  commitIn(B, 'n.txt', 'n\n', 'da B'); B.g('push', '-q', 'origin', 'lavoro');
  commitIn(A, 'o.txt', 'o\n', 'da A');
  esito = await servizio.invia({ sessionId: 'sA' });
  assert.equal(esito.code, 'GIT_PUSH_REJECTED');
  /* il perché viene dalla riga di --porcelain («[rejected] (fetch first)»), non dagli hint in inglese di stderr */
  assert.match(esito.erroreAvvio, /^Il remoto non ha accettato l’invio: \[rejected\] \(fetch first\)$/u);
  // dopo il recupero la guardia lo sa: GIT_BEHIND, prima si scarica
  await servizio.recupera({ sessionId: 'sA' });
  assert.equal((await servizio.invia({ sessionId: 'sA' })).code, 'GIT_BEHIND');
  A.g('switch', '-q', '--detach');
  assert.equal((await servizio.invia({ sessionId: 'sA' })).code, 'GIT_DETACHED');
});

test('F6-2 — un repository senza commit non invia, e con due remoti e nessuna preferenza chiede il remoto', async (t) => {
  const { A, B, servizio } = mondo(t, { primoCommit: false });
  assert.equal((await servizio.invia({ sessionId: 'sA' })).code, 'GIT_NOTHING_TO_COMMIT');
  writeFileSync(join(A.dir, 'z.txt'), 'z\n'); A.g('add', 'z.txt'); A.g('commit', '-q', '-m', 'z');
  A.g('remote', 'add', 'public', B.dir);
  A.g('remote', 'rename', 'origin', 'altro');
  /* il clone di un remoto VUOTO configura già `branch.main.remote/merge` (misurato): senza quello, e senza origin, non c'è una preferenza */
  try { A.g('branch', '--unset-upstream'); } catch { /* non c'era */ }
  assert.equal((await servizio.invia({ sessionId: 'sA' })).code, 'GIT_REMOTE_REQUIRED');
});

/* ═══════════ F6-2 passo 3 — la storia col remoto del ramo (decisione 21) ═══════════ */

test('F6-2 p3 — la storia porta il ramo E il suo remoto in ordine topologico, con HEAD, la punta del remoto, il suo nome e la base comune', async (t) => {
  const { A, B, servizio, commitIn } = mondo(t);
  const rev = (r) => A.g('rev-parse', r).trim();
  const primo = rev('HEAD');
  // in pari: il remoto è HEAD, e la base comune pure
  let s = await servizio.storia({ sessionId: 'sA' });
  assert.deepEqual([s.testa, s.remoto, s.nomeRemoto, s.baseComune], [primo, primo, 'origin/main', primo]);
  assert.deepEqual(s.commit.map((c) => [c.soggetto, c.padri]), [['primo', []]]);
  // divergenti: B manda due commit, A ne fa uno suo e recupera. ⛔ I due di B hanno l'orologio indietro (data di commit del
  //   2020): l'ordine per data li metterebbe DOPO il loro genitore, e solo `--topo-order` li tiene sopra — così la prova lo vede.
  process.env.GIT_COMMITTER_DATE = '2020-01-01T00:00:00+00:00';
  try {
    commitIn(B, 'r1.txt', 'r1\n', 'r1');
    commitIn(B, 'r2.txt', 'r2\n', 'r2');
  } finally { delete process.env.GIT_COMMITTER_DATE; }
  B.g('push', '-q', 'origin', 'main');
  commitIn(A, 'l1.txt', 'l1\n', 'l1');
  assert.equal((await servizio.recupera({ sessionId: 'sA' })).ok, true);
  s = await servizio.storia({ sessionId: 'sA' });
  assert.deepEqual([s.testa, s.remoto, s.baseComune], [rev('HEAD'), rev('origin/main'), primo]);
  const soggetti = s.commit.map((c) => c.soggetto);
  assert.deepEqual([...soggetti].sort(), ['l1', 'primo', 'r1', 'r2'], 'i commit del remoto entrano nella storia');
  const posto = new Map(s.commit.map((c, i) => [c.commit, i]));
  for (const c of s.commit) for (const p of c.padri) assert.ok(posto.get(p) > posto.get(c.commit), `${c.soggetto}: nessun genitore prima dei suoi figli (--topo-order)`);
  assert.equal(s.commit.find((c) => c.soggetto === 'l1').inviato, false, '«solo qui» resta quello di F6-1');
  assert.equal(s.commit.find((c) => c.soggetto === 'l1').genitori, 1, 'il conteggio dei genitori resta');
  // un'unione: A unisce il remoto, e il commit di unione porta i DUE genitori per intero (le corsie del grafo li seguono)
  A.g('merge', '-q', '--no-edit', 'origin/main');
  s = await servizio.storia({ sessionId: 'sA' });
  const unione = s.commit.find((c) => c.commit === s.testa);
  assert.deepEqual(unione.padri, [rev('HEAD^1'), rev('HEAD^2')]);
  assert.equal(unione.genitori, 2);
  assert.equal(s.baseComune, rev('origin/main'), 'dopo l unione la base comune è la punta del remoto');
  // il remoto va avanti ancora (r3): lo vede il ramo col riferimento, non uno che non ne ha
  commitIn(B, 'r3.txt', 'r3\n', 'r3');
  B.g('push', '-q', 'origin', 'main');
  await servizio.recupera({ sessionId: 'sA' });
  assert.ok((await servizio.storia({ sessionId: 'sA' })).commit.some((c) => c.soggetto === 'r3'));
  // AL CONTRARIO: un ramo senza riferimento non porta remoto né base, e la storia è solo sua
  A.g('switch', '-q', '-c', 'lavoro');
  s = await servizio.storia({ sessionId: 'sA' });
  assert.deepEqual([s.remoto, s.nomeRemoto, s.baseComune], [null, null, null]);
  assert.ok(!s.commit.some((c) => c.soggetto === 'r3'), 'senza riferimento il remoto non entra');
  // e con HEAD staccata, lo stesso
  A.g('switch', '-q', '--detach');
  s = await servizio.storia({ sessionId: 'sA' });
  assert.deepEqual([s.remoto, s.baseComune], [null, null]);
});
