/**
 * http-routes-git.test.mjs — W1-05 (05/09), le cinque rotte git.
 *
 * ⛔ Il servizio VERO e repository VERI, non un doppio: qui si prova che il
 * cancello morde attraversando il livello HTTP fino alla decisione, non solo
 * la funzione isolata (già provata in `git-service.test.mjs`). Stessa
 * disciplina di `http-routes-terminals.test.mjs` (W1-01).
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { createHttpApp } from '../src/http-app.mjs';
import { creaServizioGit } from '../src/git-service.mjs';

const QUI = dirname(fileURLToPath(import.meta.url));

function repo(t, prefisso = 'talos-git-http-') {
  const base = mkdtempSync(join(tmpdir(), prefisso));
  t.after(() => rmSync(base, { recursive: true, force: true }));
  const g = (...args) => execFileSync('git', args, { cwd: base, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  g('init', '-q');
  g('config', 'user.email', 'prova@example.invalid');
  g('config', 'user.name', 'Prova');
  return { base, g };
}

async function servi(t, cartellaDi, { senzaServizio = false, chiediAllaSessione = null, cartellaUtenteFn = undefined } = {}) {
  const app = createHttpApp({
    staticHandler: async () => null,
    sessionRegistry: { cartellaDi, ...(chiediAllaSessione ? { chiediAllaSessione } : {}) }, // F6-1 ✨: il modello della sessione, finto
    gitService: senzaServizio ? null : creaServizioGit({ cartellaDiSessione: cartellaDi, ...(cartellaUtenteFn ? { cartellaUtenteFn } : {}) }),
  });
  const server = createServer(app);
  await new Promise((ok, ko) => { server.once('error', ko); server.listen(0, '127.0.0.1', ok); });
  t.after(() => new Promise((ok) => server.close(ok)));
  return `http://127.0.0.1:${server.address().port}`;
}

async function ambiente(t, opzioni = {}) {
  const { base, g } = repo(t);
  const url = await servi(t, (id) => (id === 's1' ? base : null), opzioni);
  return { base, g, url };
}

const posta = (corpo) => ({ method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(corpo) });

test('⭐⭐⭐ GET /git/status: le voci arrivano al client con i nomi INTATTI, accenti e spazi compresi', async (t) => {
  const { base, url } = await ambiente(t);
  writeFileSync(join(base, 'àccento.txt'), 'a\n');
  writeFileSync(join(base, 'con spazio.txt'), 'b\n');

  const risposta = await fetch(`${url}/api/v1/sessions/s1/git/status`);
  assert.equal(risposta.status, 200);
  const { data } = await risposta.json();
  assert.deepEqual(data.voci.map((v) => v.percorso).sort(), ['con spazio.txt', 'àccento.txt']);
  assert.equal(data.riepilogo.nonTracciati, 2);
  assert.equal(data.cartellaEradiceRepo, true);
});

test('⭐⭐ GET /git/branch dice il ramo, e su HEAD staccata dice la verità invece della stringa «HEAD»', async (t) => {
  const { base, g, url } = await ambiente(t);
  writeFileSync(join(base, 'x.txt'), 'x\n');
  g('add', '--', 'x.txt');
  g('commit', '-q', '-m', 'base');

  const primo = await (await fetch(`${url}/api/v1/sessions/s1/git/branch`)).json();
  assert.equal(typeof primo.data.ramo, 'string');
  assert.equal(primo.data.staccata, false);

  g('checkout', '-q', '--detach', g('rev-parse', 'HEAD').trim());
  const dopo = await (await fetch(`${url}/api/v1/sessions/s1/git/branch`)).json();
  assert.equal(dopo.data.ramo, null);
  assert.equal(dopo.data.staccata, true);
});

test('⭐⭐⭐ stage → commit dal solo HTTP: il commit tocca SOLO il percorso nominato', async (t) => {
  const { base, g, url } = await ambiente(t);
  writeFileSync(join(base, 'mio.txt'), 'v0\n');
  writeFileSync(join(base, 'di-un-altro.txt'), 'x0\n');
  g('add', '--', 'mio.txt', 'di-un-altro.txt');
  g('commit', '-q', '-m', 'base');
  writeFileSync(join(base, 'mio.txt'), 'v1\n');
  writeFileSync(join(base, 'di-un-altro.txt'), 'lavoro di un altro\n');
  // Un'altra sessione mette in stage roba sua sullo STESSO indice condiviso.
  g('add', '--', 'di-un-altro.txt');

  const messo = await fetch(`${url}/api/v1/sessions/s1/git/stage`, posta({ percorsi: ['mio.txt'] }));
  assert.equal(messo.status, 200);
  assert.equal((await messo.json()).data.stato.riepilogo.staged, 2);

  const fatto = await fetch(`${url}/api/v1/sessions/s1/git/commit`, posta({ percorsi: ['mio.txt'], messaggio: 'solo il mio' }));
  assert.equal(fatto.status, 200);
  const { data } = await fatto.json();
  assert.match(data.commit, /^[0-9a-f]{40}$/u);

  const toccati = g('show', '--name-only', '--format=', 'HEAD').trim().split('\n').filter(Boolean);
  assert.deepEqual(toccati, ['mio.txt'], 'la rotta ha raccolto lavoro non nominato');
  assert.match(g('status', '--porcelain=v1'), /^M {2}di-un-altro\.txt$/mu, 'il lavoro di un altro e stato committato o buttato');
});

test('⭐⭐ unstage dal solo HTTP', async (t) => {
  const { base, url } = await ambiente(t);
  writeFileSync(join(base, 'àccento.txt'), 'a\n');
  await fetch(`${url}/api/v1/sessions/s1/git/stage`, posta({ percorsi: ['àccento.txt'] }));
  const tolto = await fetch(`${url}/api/v1/sessions/s1/git/unstage`, posta({ percorsi: ['àccento.txt'] }));
  assert.equal(tolto.status, 200);
  assert.equal((await tolto.json()).data.stato.riepilogo.staged, 0);
});

/* ═══════════════════════════ AL CONTRARIO ═══════════════════════════ */

test('⛔⛔⛔ una sessione che non esiste: 404, su tutte e cinque le rotte', async (t) => {
  const { url } = await ambiente(t);
  const prove = [
    ['status', () => fetch(`${url}/api/v1/sessions/inventata/git/status`)],
    ['branch', () => fetch(`${url}/api/v1/sessions/inventata/git/branch`)],
    ['stage', () => fetch(`${url}/api/v1/sessions/inventata/git/stage`, posta({ percorsi: ['x'] }))],
    ['unstage', () => fetch(`${url}/api/v1/sessions/inventata/git/unstage`, posta({ percorsi: ['x'] }))],
    ['commit', () => fetch(`${url}/api/v1/sessions/inventata/git/commit`, posta({ percorsi: ['x'], messaggio: 'x' }))],
  ];
  for (const [nome, chiamata] of prove) {
    const risposta = await chiamata();
    assert.equal(risposta.status, 404, `${nome} ha risposto a una sessione che non esiste`);
    assert.equal((await risposta.json()).error.code, 'NOT_FOUND');
  }
});

test('⛔⛔⛔ una cartella che non è un repository: 409 GIT_NOT_A_REPOSITORY, mai un 200 con un elenco vuoto', async (t) => {
  const fuori = mkdtempSync(join(tmpdir(), 'talos-non-repo-http-'));
  t.after(() => rmSync(fuori, { recursive: true, force: true }));
  const url = await servi(t, () => fuori);

  const risposta = await fetch(`${url}/api/v1/sessions/s1/git/status`);
  assert.equal(risposta.status, 409);
  const corpo = await risposta.json();
  assert.equal(corpo.error.code, 'GIT_NOT_A_REPOSITORY');
  /* ⛔ La forma peggiore sarebbe un 200 con voci vuote, che si legge come «tutto committato». */
  assert.equal('data' in corpo, false);
});

test('⛔⛔⛔ un percorso fuori dalla sessione: 422 GIT_PATH_INVALID, e niente viene toccato', async (t) => {
  const { base, g, url } = await ambiente(t);
  writeFileSync(join(base, 'dentro.txt'), 'd\n');
  for (const cattivo of ['../fuori.txt', 'C:/Windows/win.ini', ':/', ':(exclude)x', '-x', '/etc/passwd']) {
    const risposta = await fetch(`${url}/api/v1/sessions/s1/git/stage`, posta({ percorsi: [cattivo] }));
    assert.equal(risposta.status, 422, `«${cattivo}» non è stato rifiutato`);
    assert.equal((await risposta.json()).error.code, 'GIT_PATH_INVALID');
  }
  assert.equal(g('diff', '--cached', '--name-only').trim(), '', 'qualcosa è finito in stage');
});

test('⛔⛔ un commit senza percorsi o senza messaggio: 422, e nessun commit nasce', async (t) => {
  const { base, g, url } = await ambiente(t);
  writeFileSync(join(base, 'x.txt'), 'x\n');
  g('add', '--', 'x.txt');

  const senzaPercorsi = await fetch(`${url}/api/v1/sessions/s1/git/commit`, posta({ percorsi: [], messaggio: 'x' }));
  assert.equal(senzaPercorsi.status, 422);
  assert.equal((await senzaPercorsi.json()).error.code, 'GIT_PATHS_REQUIRED');

  const senzaMessaggio = await fetch(`${url}/api/v1/sessions/s1/git/commit`, posta({ percorsi: ['x.txt'], messaggio: '  ' }));
  assert.equal(senzaMessaggio.status, 422);
  assert.equal((await senzaMessaggio.json()).error.code, 'GIT_MESSAGE_REQUIRED');

  assert.equal(g('log', '--oneline', '--all').trim(), '');
});

test('⛔⛔ un file cambiato dopo lo stage: 409 GIT_WORKTREE_DIFFERS invece di committare la versione sbagliata in silenzio', async (t) => {
  const { base, g, url } = await ambiente(t);
  writeFileSync(join(base, 'a.txt'), 'v0\n');
  g('add', '--', 'a.txt');
  g('commit', '-q', '-m', 'base');
  writeFileSync(join(base, 'a.txt'), 'v1-STAGED\n');
  g('add', '--', 'a.txt');
  writeFileSync(join(base, 'a.txt'), 'v2-ALBERO\n');

  const risposta = await fetch(`${url}/api/v1/sessions/s1/git/commit`, posta({ percorsi: ['a.txt'], messaggio: 'x' }));
  assert.equal(risposta.status, 409);
  assert.equal((await risposta.json()).error.code, 'GIT_WORKTREE_DIFFERS');
  assert.equal(g('log', '--oneline').trim().split('\n').length, 1);
});

test('⛔⛔ un corpo con chiavi NON previste è rifiutato, non ignorato in silenzio', async (t) => {
  const { base, url } = await ambiente(t);
  writeFileSync(join(base, 'x.txt'), 'x\n');
  /* ⛔ Un messaggio su uno stage vuol dire che chi chiama ha capito un'altra cosa: meglio dirglielo che ignorarlo. */
  for (const [rotta, corpo] of [
    ['stage', { percorsi: ['x.txt'], messaggio: 'ciao' }],
    ['unstage', { percorsi: ['x.txt'], forza: true }],
    ['commit', { percorsi: ['x.txt'], messaggio: 'x', tutto: true }],
    ['stage', { tutto: true }],
  ]) {
    const risposta = await fetch(`${url}/api/v1/sessions/s1/git/${rotta}`, posta(corpo));
    assert.equal(risposta.status, 400, `${rotta} ha accettato ${JSON.stringify(corpo)}`);
    assert.equal((await risposta.json()).error.code, 'QUERY_INVALID');
  }
});

test('⛔ senza il servizio cablato le POST lo DICONO (503), non fingono un repository pulito', async (t) => {
  const { url } = await ambiente(t, { senzaServizio: true });
  const risposta = await fetch(`${url}/api/v1/sessions/s1/git/stage`, posta({ percorsi: ['x'] }));
  assert.equal(risposta.status, 503);
  assert.equal((await risposta.json()).error.code, 'GIT_STORE_UNAVAILABLE');
  /* ⛔ Le GET, senza servizio, non sono nemmeno una rotta: 404 come qualunque percorso sconosciuto — mai un 200 vuoto. */
  const lettura = await fetch(`${url}/api/v1/sessions/s1/git/status`);
  assert.equal(lettura.status, 404);
});

test('⛔⛔⛔ PIN — le rotte del remoto (F6-2, 27/09) sono QUATTRO POST e DUE GET, nominate; il push non ha una forma forzata e non esiste in GET', async (t) => {
  const { url } = await ambiente(t);
  /* Dal 05/09 al 27/09 qui si pinnava «nessuna rotta di push». Owner 26/09 (decisione 2) e 27/09 (16-23): esistono, con le regole. */
  for (const percorso of ['git/fetch', 'git/fetch-stop', 'git/pull', 'git/push']) {
    assert.equal((await fetch(`${url}/api/v1/sessions/s1/${percorso}`)).status, 405, `GET /${percorso}: un comando di rete non si lancia con una GET`);
  }
  for (const percorso of ['git/remotes', 'git/sync']) {
    assert.equal((await fetch(`${url}/api/v1/sessions/s1/${percorso}`, posta({}))).status, 405, `POST /${percorso}: una lettura non accetta una POST`);
  }
  for (const percorso of ['git/force-push', 'git/push-force', 'git/remote', 'git/remote-add', 'git/remote-remove']) {
    for (const metodo of ['GET', 'POST']) {
      const risposta = await fetch(`${url}/api/v1/sessions/s1/${percorso}`, metodo === 'POST' ? posta({}) : undefined);
      assert.ok(risposta.status === 404 || risposta.status === 405, `${metodo} /${percorso} ha risposto ${risposta.status}: esiste una porta che non deve esistere`);
    }
  }
  /* ⛔ E il pin sul SORGENTE: le rotte git dichiarate, quelle e basta. Il push parte solo dalla scheda, dopo la conferma con remoto e
     ramo (owner, punto 2); la rotta accetta il solo `remoto` — mai un `forza`, mai un ramo diverso da quello corrente. */
  const sorgente = readFileSync(join(QUI, '..', 'src', 'http-app.mjs'), 'utf8');
  assert.ok(sorgente.includes('\\/git\\/(stage|unstage|commit|discard|commit-staged|amend|undo-commit|switch|branch-create|branch-rename|branch-delete|stash|stash-pop|stash-drop|hunk|commit-message|fetch|fetch-stop|pull|push|init)$'), 'le POST git non sono più dichiarate come previsto');
  assert.ok(sorgente.includes('\\/git\\/(log|branches|stashes|remotes|sync)$'), 'le GET degli elenchi non sono più dichiarate come previsto');
  assert.ok(sorgente.includes('\\/git\\/status$'), 'la GET status non è più dichiarata come previsto');
  assert.ok(sorgente.includes('\\/git\\/branch$'), 'la GET branch non è più dichiarata come previsto');
  assert.ok(sorgente.includes('\\/git\\/diff$'), 'la GET diff non è più dichiarata come previsto');
  assert.ok(sorgente.includes("push: ['remoto'],"), 'la POST push accetta il solo remoto');
  assert.equal(/forz[a-z]*: \[|'force'|--force/u.test(sorgente.replace(/\/\*[\s\S]*?\*\//gu, '')), false, 'una forma forzata è comparsa nelle rotte');
});

test('F6-2 — GET /git/remotes e /git/sync, POST fetch/pull/push/fetch-stop: con un remoto vero su disco, le chiavi ammesse, i rifiuti per nome', async (t) => {
  const { base, g, url } = await ambiente(t);
  const remoto = join(dirname(base), `talos-git-http-remoto-${Date.now()}.git`);
  execFileSync('git', ['init', '-q', '--bare', '-b', 'main', remoto], { encoding: 'utf8' });
  t.after(() => rmSync(remoto, { recursive: true, force: true }));
  writeFileSync(join(base, 'a.txt'), 'v0\n'); g('add', '--', 'a.txt'); g('commit', '-q', '-m', 'base');
  // senza remoti: le letture lo dicono, l'invio si rifiuta per nome
  let sync = await (await fetch(`${url}/api/v1/sessions/s1/git/sync`)).json();
  assert.deepEqual([sync.data.remoti, sync.data.riferimento, sync.data.remotoPerInvio], [[], null, null]);
  let r = await fetch(`${url}/api/v1/sessions/s1/git/push`, posta({}));
  assert.equal(r.status >= 400 && r.status < 500, true); assert.equal((await r.json()).error.code, 'GIT_NO_REMOTE');
  g('remote', 'add', 'origin', remoto);
  const remoti = await (await fetch(`${url}/api/v1/sessions/s1/git/remotes`)).json();
  assert.deepEqual(remoti.data.remoti.map((x) => x.nome), ['origin']);
  // chiavi non previste: rifiuto, non silenzio
  assert.equal((await fetch(`${url}/api/v1/sessions/s1/git/push`, posta({ remoto: 'origin', forza: true }))).status, 400);
  assert.equal((await fetch(`${url}/api/v1/sessions/s1/git/pull`, posta({ remoto: 'origin' }))).status, 400);
  assert.equal((await fetch(`${url}/api/v1/sessions/s1/git/fetch`, posta({ ramo: 'main' }))).status, 400);
  // pubblica il ramo sul remoto scelto
  r = await fetch(`${url}/api/v1/sessions/s1/git/push`, posta({ remoto: 'origin' }));
  assert.equal(r.status, 200);
  const inviato = (await r.json()).data;
  assert.deepEqual([inviato.pubblicato, inviato.remoto, inviato.ramo, inviato.esiti[0].flag], [true, 'origin', g('branch', '--show-current').trim(), '*']);
  sync = await (await fetch(`${url}/api/v1/sessions/s1/git/sync`)).json();
  assert.deepEqual([sync.data.riferimento.remoto, sync.data.avanti, sync.data.indietro], ['origin', 0, 0]);
  // recupera e scarica: niente di nuovo, ma le porte rispondono; il «ferma» senza niente in corso lo dice
  r = await fetch(`${url}/api/v1/sessions/s1/git/fetch`, posta({}));
  assert.equal(r.status, 200); assert.equal((await r.json()).data.remoto, 'origin');
  r = await fetch(`${url}/api/v1/sessions/s1/git/pull`, posta({}));
  assert.equal(r.status, 200); assert.equal((await r.json()).data.conflitti, 0);
  r = await fetch(`${url}/api/v1/sessions/s1/git/fetch-stop`, posta({}));
  assert.deepEqual((await r.json()).data, { ok: true, fermato: false });
  // un remoto sconosciuto e una query sulle letture: rifiuti
  r = await fetch(`${url}/api/v1/sessions/s1/git/fetch`, posta({ remoto: 'upstream' }));
  assert.equal((await r.json()).error.code, 'GIT_REMOTE_UNKNOWN');
  assert.equal((await fetch(`${url}/api/v1/sessions/s1/git/sync?x=1`)).status, 400);
  // una sessione che non esiste: 404 su tutte
  for (const percorso of ['git/remotes', 'git/sync']) assert.equal((await fetch(`${url}/api/v1/sessions/nessuna/${percorso}`)).status, 404);
  for (const percorso of ['git/fetch', 'git/pull', 'git/push', 'git/fetch-stop']) assert.equal((await fetch(`${url}/api/v1/sessions/nessuna/${percorso}`, posta({}))).status, 404);
});

test('⭐ una sessione in una sottocartella parla lo stesso vocabolario anche via HTTP', async (t) => {
  const { base, g } = repo(t, 'talos-git-http-sub-');
  writeFileSync(join(base, 'della-radice.txt'), 'r\n');
  g('add', '--', 'della-radice.txt');
  const sotto = join(base, 'sessione');
  mkdirSync(sotto);
  writeFileSync(join(sotto, 'mio.txt'), 'm\n');
  const url = await servi(t, () => sotto);

  const { data } = await (await fetch(`${url}/api/v1/sessions/s1/git/status`)).json();
  assert.deepEqual(data.voci.map((v) => v.percorso), ['mio.txt']);
  assert.equal(data.prefisso, 'sessione/');
  assert.equal(data.voci.some((v) => v.percorso.includes('della-radice')), false, 'un file del repo padre è uscito dalla rotta');
});

/* ═══════════════════ F6-1 (26/09/2026) — diff, annulla, commit di ciò che è preparato ═══════════════════ */

test('F6-1 — GET /git/diff: il diff di un file per area, e la query sbagliata è un rifiuto (mai una parte ignorata)', async (t) => {
  const { base, g, url } = await ambiente(t);
  writeFileSync(join(base, 'a.txt'), 'uno\n');
  g('add', '--', 'a.txt');
  g('commit', '-q', '-m', 'base');
  writeFileSync(join(base, 'a.txt'), 'due\n');
  const ok = await fetch(`${url}/api/v1/sessions/s1/git/diff?percorso=${encodeURIComponent('a.txt')}&area=lavoro`);
  assert.equal(ok.status, 200);
  const { data } = await ok.json();
  assert.match(data.testo, /^\+due$/mu);
  assert.equal(data.base.soggetto, 'base');
  for (const query of ['percorso=a.txt', 'area=lavoro', 'percorso=a.txt&area=lavoro&extra=1', 'percorso=a.txt&percorso=b.txt&area=lavoro']) {
    const r = await fetch(`${url}/api/v1/sessions/s1/git/diff?${query}`);
    assert.equal(r.status, 400, `?${query} ha risposto ${r.status}`);
  }
  const pulito = await fetch(`${url}/api/v1/sessions/s1/git/diff?percorso=a.txt&area=preparato`);
  assert.equal(pulito.status, 409);
  assert.equal((await pulito.json()).error.code, 'GIT_PATH_UNCHANGED');
  const fuga = await fetch(`${url}/api/v1/sessions/s1/git/diff?percorso=${encodeURIComponent('../x.txt')}&area=lavoro`);
  assert.equal(fuga.status, 422);
});

test('F6-1 — POST /git/discard e /git/commit-staged: le chiavi ammesse, l\'impronta, i rifiuti per nome', async (t) => {
  const { base, g, url } = await ambiente(t);
  writeFileSync(join(base, 'a.txt'), 'v0\n');
  g('add', '--', 'a.txt');
  g('commit', '-q', '-m', 'base');
  writeFileSync(join(base, 'nuovo.txt'), 'n\n');
  const annulla = await fetch(`${url}/api/v1/sessions/s1/git/discard`, posta({ percorsi: ['nuovo.txt'] }));
  assert.equal(annulla.status, 200);
  assert.deepEqual((await annulla.json()).data.eliminati, ['nuovo.txt']);
  const chiaveInPiu = await fetch(`${url}/api/v1/sessions/s1/git/discard`, posta({ percorsi: ['a.txt'], messaggio: 'x' }));
  assert.equal(chiaveInPiu.status, 400, 'un messaggio su un annulla vuol dire che chi chiama ha capito un\'altra cosa');

  writeFileSync(join(base, 'a.txt'), 'v1\n');
  g('add', '--', 'a.txt');
  const { data: stato } = await (await fetch(`${url}/api/v1/sessions/s1/git/status`)).json();
  const vecchia = await fetch(`${url}/api/v1/sessions/s1/git/commit-staged`, posta({ messaggio: 'm', impronta: 'non-questa' }));
  assert.equal(vecchia.status, 409);
  assert.equal((await vecchia.json()).error.code, 'GIT_STAGED_CHANGED');
  const conPercorsi = await fetch(`${url}/api/v1/sessions/s1/git/commit-staged`, posta({ messaggio: 'm', impronta: stato.impronta, percorsi: ['a.txt'] }));
  assert.equal(conPercorsi.status, 400, 'il commit di ciò che è preparato non prende percorsi');
  const fatto = await fetch(`${url}/api/v1/sessions/s1/git/commit-staged`, posta({ messaggio: 'Preparato via HTTP', impronta: stato.impronta }));
  assert.equal(fatto.status, 200);
  assert.equal(g('log', '-1', '--format=%s').trim(), 'Preparato via HTTP');
  const { data: dopo } = await (await fetch(`${url}/api/v1/sessions/s1/git/status`)).json();
  const niente = await fetch(`${url}/api/v1/sessions/s1/git/commit-staged`, posta({ messaggio: 'm', impronta: dopo.impronta }));
  assert.equal(niente.status, 409);
  assert.equal((await niente.json()).error.code, 'GIT_NOTHING_STAGED');
});

/* ═══════════════════ F6-1 passo 3 (26/09/2026) — storia, ultimo commit, rami, messi da parte ═══════════════════ */

test('F6-1 p3 — GET /git/log, /git/branches, /git/stashes: sola lettura, e una query è un rifiuto', async (t) => {
  const { base, g, url } = await ambiente(t);
  writeFileSync(join(base, 'a.txt'), 'v0\n');
  g('add', '--', 'a.txt');
  g('commit', '-q', '-m', 'base');
  const storia = await (await fetch(`${url}/api/v1/sessions/s1/git/log`)).json();
  assert.deepEqual(storia.data.commit.map((c) => [c.soggetto, c.inviato]), [['base', false]]);
  const rami = await (await fetch(`${url}/api/v1/sessions/s1/git/branches`)).json();
  assert.equal(rami.data.rami.filter((r) => r.corrente).length, 1);
  const accantonati = await (await fetch(`${url}/api/v1/sessions/s1/git/stashes`)).json();
  assert.deepEqual(accantonati.data.accantonati, []);
  for (const elenco of ['log', 'branches', 'stashes']) {
    assert.equal((await fetch(`${url}/api/v1/sessions/s1/git/${elenco}?limite=500`)).status, 400, `${elenco} ha accettato una query`);
    assert.equal((await fetch(`${url}/api/v1/sessions/s1/git/${elenco}`, posta({}))).status, 405, `${elenco} ha accettato una POST`);
  }
});

test('F6-1 p3 — POST amend/undo-commit/rami/stash: le chiavi ammesse, «forza» solo true, i rifiuti per nome', async (t) => {
  const { base, g, url } = await ambiente(t);
  writeFileSync(join(base, 'a.txt'), 'v0\n');
  g('add', '--', 'a.txt');
  g('commit', '-q', '-m', 'base');
  const { data: stato } = await (await fetch(`${url}/api/v1/sessions/s1/git/status`)).json();
  const amend = await fetch(`${url}/api/v1/sessions/s1/git/amend`, posta({ messaggio: 'base riscritta', impronta: stato.impronta, commit: stato.base.commit }));
  assert.equal(amend.status, 200);
  assert.equal(g('log', '-1', '--format=%s').trim(), 'base riscritta');
  const vecchio = await fetch(`${url}/api/v1/sessions/s1/git/undo-commit`, posta({ commit: stato.base.commit }));
  assert.equal(vecchio.status, 409);
  assert.equal((await vecchio.json()).error.code, 'GIT_HEAD_CHANGED', 'l\'hash di prima della modifica non è più HEAD');
  const conPercorsi = await fetch(`${url}/api/v1/sessions/s1/git/undo-commit`, posta({ commit: 'x', percorsi: ['a.txt'] }));
  assert.equal(conPercorsi.status, 400);

  const principale = g('branch', '--show-current').trim(); // `init.defaultBranch` è della macchina: main o master
  assert.equal((await fetch(`${url}/api/v1/sessions/s1/git/branch-create`, posta({ ramo: 'lato' }))).status, 200);
  writeFileSync(join(base, 'b.txt'), 'b\n');
  g('add', '--', 'b.txt');
  g('commit', '-q', '-m', 'solo sul lato');
  assert.equal((await fetch(`${url}/api/v1/sessions/s1/git/switch`, posta({ ramo: principale }))).status, 200);
  const invalido = await fetch(`${url}/api/v1/sessions/s1/git/switch`, posta({ ramo: '@{-1}' }));
  assert.equal(invalido.status, 422);
  assert.equal(g('branch', '--show-current').trim(), principale);
  const nonUnito = await fetch(`${url}/api/v1/sessions/s1/git/branch-delete`, posta({ ramo: 'lato', forza: 'true' }));
  assert.equal(nonUnito.status, 409);
  assert.equal((await nonUnito.json()).error.code, 'GIT_BRANCH_NOT_MERGED');
  assert.equal((await fetch(`${url}/api/v1/sessions/s1/git/branch-delete`, posta({ ramo: 'lato', forza: true }))).status, 200);
  assert.equal(g('branch', '--list', 'lato').trim(), '');

  writeFileSync(join(base, 'a.txt'), 'v1\n');
  const accantona = await fetch(`${url}/api/v1/sessions/s1/git/stash`, posta({ messaggio: 'via http' }));
  assert.equal(accantona.status, 200);
  const [voce] = (await accantona.json()).data.accantonati;
  const sbagliato = await fetch(`${url}/api/v1/sessions/s1/git/stash-pop`, posta({ indice: voce.indice, commit: 'non-questo' }));
  assert.equal(sbagliato.status, 409);
  assert.equal((await sbagliato.json()).error.code, 'GIT_STASH_CHANGED');
  assert.equal((await fetch(`${url}/api/v1/sessions/s1/git/stash-pop`, posta({ indice: voce.indice, commit: voce.commit }))).status, 200);
  // il repository di prova di questo file non fissa `core.autocrlf`: su Windows la ripresa scrive CRLF
  assert.equal(readFileSync(join(base, 'a.txt'), 'utf8').replace(/\r\n/gu, '\n'), 'v1\n');
});

test('F6-1 pezzi — POST /git/hunk: le chiavi ammesse, l\'impronta del diff visto, il pezzo preparato e i rifiuti per nome', async (t) => {
  const { base, g, url } = await ambiente(t);
  const righe = Array.from({ length: 12 }, (_, i) => `r${i + 1}`);
  writeFileSync(join(base, 'f.txt'), `${righe.join('\n')}\n`);
  g('add', '--', 'f.txt');
  g('commit', '-q', '-m', 'base');
  writeFileSync(join(base, 'f.txt'), `${['R1', ...righe.slice(1, 11), 'R12'].join('\n')}\n`);
  const { data: d } = await (await fetch(`${url}/api/v1/sessions/s1/git/diff?percorso=f.txt&area=lavoro`)).json();
  assert.equal(typeof d.impronta, 'string');
  const vecchia = await fetch(`${url}/api/v1/sessions/s1/git/hunk`, posta({ percorso: 'f.txt', area: 'lavoro', indice: 0, impronta: 'non-questa', azione: 'prepara' }));
  assert.equal(vecchia.status, 409);
  assert.equal((await vecchia.json()).error.code, 'GIT_DIFF_CHANGED');
  const chiaveInPiu = await fetch(`${url}/api/v1/sessions/s1/git/hunk`, posta({ percorso: 'f.txt', area: 'lavoro', indice: 0, impronta: d.impronta, azione: 'prepara', percorsi: ['f.txt'] }));
  assert.equal(chiaveInPiu.status, 400);
  const fuori = await fetch(`${url}/api/v1/sessions/s1/git/hunk`, posta({ percorso: 'f.txt', area: 'lavoro', indice: 9, impronta: d.impronta, azione: 'prepara' }));
  assert.equal(fuori.status, 422);
  const fatto = await fetch(`${url}/api/v1/sessions/s1/git/hunk`, posta({ percorso: 'f.txt', area: 'lavoro', indice: 0, impronta: d.impronta, azione: 'prepara' }));
  assert.equal(fatto.status, 200);
  assert.equal(g('show', ':f.txt').split('\n')[0], 'R1');
  assert.equal(g('show', ':f.txt').split('\n')[11], 'r12', 'solo il primo pezzo');
});

test('F6-1 ✨ — POST /git/commit-message: il diff preparato e i soggetti vanno al modello della sessione, torna il messaggio ripulito', async (t) => {
  const richieste = [];
  let risposta = { testo: '```\nAdd f.txt\n```', modello: 'z-ai/glm-5.3-flash' };
  const { base, g, url } = await ambiente(t, { chiediAllaSessione: async (id, prompt) => { richieste.push({ id, prompt }); return risposta; } });
  writeFileSync(join(base, 'a.txt'), 'a\n');
  g('add', '--', 'a.txt');
  g('commit', '-q', '-m', 'docs: base');
  const niente = await fetch(`${url}/api/v1/sessions/s1/git/commit-message`, posta({}));
  assert.equal(niente.status, 409);
  assert.equal((await niente.json()).error.code, 'GIT_NOTHING_TO_COMMIT');
  assert.equal(richieste.length, 0, 'niente da descrivere: il modello non si chiama');
  writeFileSync(join(base, 'f.txt'), 'nuovo\n');
  g('add', '--', 'f.txt');
  const fatto = await fetch(`${url}/api/v1/sessions/s1/git/commit-message`, posta({ bozza: 'Aggiungi f', lingua: 'en' }));
  assert.equal(fatto.status, 200);
  const { data } = await fatto.json();
  assert.equal(data.messaggio, 'Add f.txt');
  assert.equal(data.area, 'preparato');
  assert.equal(richieste[0].id, 's1');
  assert.match(richieste[0].prompt, /\+nuovo/u);
  assert.match(richieste[0].prompt, /- docs: base/u);
  assert.match(richieste[0].prompt, /: Aggiungi f$/mu);
  // le chiavi ammesse, e i rifiuti del modello per nome
  assert.equal((await fetch(`${url}/api/v1/sessions/s1/git/commit-message`, posta({ messaggio: 'x' }))).status, 400);
  risposta = { erroreAvvio: 'Non so quale modello usa questa sessione, quindi non lo chiamo.', code: 'SESSION_MODEL_UNKNOWN' };
  const senzaModello = await fetch(`${url}/api/v1/sessions/s1/git/commit-message`, posta({}));
  assert.equal(senzaModello.status, 409);
  assert.equal((await senzaModello.json()).error.code, 'SESSION_MODEL_UNKNOWN');
  risposta = { testo: '   ', modello: 'm' };
  const vuota = await fetch(`${url}/api/v1/sessions/s1/git/commit-message`, posta({}));
  assert.equal(vuota.status, 502);
  assert.equal((await vuota.json()).error.code, 'MODEL_CALL_FAILED');
});

test('F6-1 ✨ — senza un modello collegato al server, /git/commit-message dice MODEL_CALL_FAILED e non tocca git', async (t) => {
  const { base, g, url } = await ambiente(t);
  writeFileSync(join(base, 'f.txt'), 'x\n');
  g('add', '--', 'f.txt');
  const r = await fetch(`${url}/api/v1/sessions/s1/git/commit-message`, posta({}));
  assert.equal(r.status, 502);
  assert.equal((await r.json()).error.code, 'MODEL_CALL_FAILED');
});

/* ⭐ F6-2 passo 4 (27/09/2026, decisione 24): le modifiche di un commit del grafo — due GET di sola lettura. */
test('F6-2 p4 — GET /git/changes e /git/changes-diff: le chiavi ammesse (una volta sola), gli hash interi, i rifiuti per nome, niente POST', async (t) => {
  const { base, g, url } = await ambiente(t);
  writeFileSync(join(base, 'a.txt'), 'uno\n');
  g('add', '--', 'a.txt');
  g('commit', '-q', '-m', 'radice');
  writeFileSync(join(base, 'a.txt'), 'due\n');
  g('commit', '-q', '-am', 'secondo');
  const commit = g('rev-parse', 'HEAD').trim();
  const radice = g('rev-parse', 'HEAD^').trim();
  const leggi = async (percorso) => { const r = await fetch(`${url}/api/v1/sessions/s1/git/${percorso}`); return { stato: r.status, corpo: await r.json() }; };
  let r = await leggi(`changes?a=${commit}`);
  assert.equal(r.stato, 200);
  assert.deepEqual([r.corpo.data.da, r.corpo.data.a, r.corpo.data.file.map((f) => `${f.stato} ${f.percorso}`)], [radice, commit, ['M a.txt']]);
  r = await leggi(`changes?da=${radice}&a=${commit}`);
  assert.equal(r.corpo.data.file.length, 1);
  r = await leggi(`changes-diff?a=${commit}&percorso=a.txt`);
  assert.equal(r.stato, 200);
  assert.match(r.corpo.data.testo, /^\+due$/mu);
  // le chiavi: sconosciute, ripetute o mancanti sono una domanda sbagliata
  for (const q of [`changes?a=${commit}&percorso=a.txt`, `changes?a=${commit}&a=${commit}`, 'changes', `changes-diff?a=${commit}`, `changes-diff?percorso=a.txt`, `changes-diff?a=${commit}&percorso=a.txt&area=lavoro`]) {
    assert.equal((await leggi(q)).stato, 400, q);
  }
  // gli hash: interi, e di un commit che c'è
  r = await leggi('changes?a=HEAD');
  assert.deepEqual([r.stato, r.corpo.error.code], [422, 'GIT_COMMIT_INVALID']);
  r = await leggi(`changes?a=${'f'.repeat(40)}`);
  assert.deepEqual([r.stato, r.corpo.error.code], [404, 'GIT_COMMIT_UNKNOWN']);
  r = await leggi(`changes-diff?a=${commit}&percorso=..%2Ffuori.txt`);
  assert.deepEqual([r.stato, r.corpo.error.code], [422, 'GIT_PATH_INVALID']);
  for (const percorso of ['changes', 'changes-diff']) {
    assert.equal((await fetch(`${url}/api/v1/sessions/s1/git/${percorso}?a=${commit}`, posta({}))).status, 405, `${percorso} ha accettato una POST`);
  }
});

test('INIT-HTTP — POST /git/init: una cartella che non è un repository lo diventa; il corpo porta solo «conferma»; la seconda volta 409', async (t) => {
  const base = mkdtempSync(join(tmpdir(), 'talos-git-http-init-'));
  t.after(() => rmSync(base, { recursive: true, force: true }));
  writeFileSync(join(base, 'a.txt'), 'a\n');
  const url = await servi(t, (id) => (id === 's1' ? base : null));
  assert.equal((await fetch(`${url}/api/v1/sessions/s1/git/status`)).status, 409, 'premessa: non è un repository');

  const estranea = await fetch(`${url}/api/v1/sessions/s1/git/init`, posta({ percorsi: ['a.txt'] }));
  assert.equal(estranea.status, 400, 'una chiave che init non prevede si rifiuta');
  const fatto = await fetch(`${url}/api/v1/sessions/s1/git/init`, posta({}));
  assert.equal(fatto.status, 200);
  const { data } = await fatto.json();
  assert.equal(typeof data.ramo, 'string');
  assert.deepEqual(data.stato.voci.map((v) => v.percorso), ['a.txt']);
  assert.equal((await fetch(`${url}/api/v1/sessions/s1/git/status`)).status, 200, 'ora la scheda legge lo stato');

  const ancora = await fetch(`${url}/api/v1/sessions/s1/git/init`, posta({}));
  assert.equal(ancora.status, 409);
  assert.equal((await ancora.json()).error.code, 'GIT_ALREADY_A_REPOSITORY');
  const letta = (await fetch(`${url}/api/v1/sessions/s1/git/init`)).status;
  assert.ok(letta === 404 || letta === 405, `solo POST: una GET ha risposto ${letta}`);
});

test('INIT-HTTP-CONFERMA — la cartella che contiene quella utente: 409 senza conferma, e «conferma» vale SOLO come true', async (t) => {
  const base = mkdtempSync(join(tmpdir(), 'talos-git-http-init-casa-'));
  t.after(() => rmSync(base, { recursive: true, force: true }));
  const url = await servi(t, (id) => (id === 's1' ? base : null), { cartellaUtenteFn: () => join(base, 'io') });
  for (const corpo of [{}, { conferma: 'true' }, { conferma: 1 }]) {
    const r = await fetch(`${url}/api/v1/sessions/s1/git/init`, posta(corpo));
    assert.equal(r.status, 409, JSON.stringify(corpo));
    assert.equal((await r.json()).error.code, 'GIT_INIT_NEEDS_CONFIRM');
  }
  assert.equal((await fetch(`${url}/api/v1/sessions/s1/git/status`)).status, 409, 'nessun repository creato senza il sì');
  assert.equal((await fetch(`${url}/api/v1/sessions/s1/git/init`, posta({ conferma: true }))).status, 200);
  assert.equal((await fetch(`${url}/api/v1/sessions/s1/git/status`)).status, 200);
});
