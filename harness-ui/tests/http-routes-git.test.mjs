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

async function servi(t, cartellaDi, { senzaServizio = false } = {}) {
  const app = createHttpApp({
    staticHandler: async () => null,
    sessionRegistry: { cartellaDi },
    gitService: senzaServizio ? null : creaServizioGit({ cartellaDiSessione: cartellaDi }),
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

test('⛔⛔⛔ PIN — nessuna rotta di PUSH esiste, in nessun metodo e in nessuna forma', async (t) => {
  const { url } = await ambiente(t);
  for (const percorso of ['git/push', 'git/remote', 'git/fetch', 'git/pull']) {
    for (const metodo of ['GET', 'POST']) {
      const risposta = await fetch(`${url}/api/v1/sessions/s1/${percorso}`, metodo === 'POST' ? posta({}) : undefined);
      assert.ok(
        risposta.status === 404 || risposta.status === 405,
        `${metodo} /${percorso} ha risposto ${risposta.status}: esiste una porta che non deve esistere`,
      );
    }
  }
  /*
   * ⛔ E il pin sul SORGENTE: le rotte git dichiarate sono cinque, quelle e
   * basta. Il push si chiede all'owner ogni volta — ed è anche ciò che lo
   * stato dell'arte dichiara come vincolo: «critical operations like git push
   * must have human eyes on them» (ricerca 05/09/2026).
   */
  const sorgente = readFileSync(join(QUI, '..', 'src', 'http-app.mjs'), 'utf8');
  assert.ok(sorgente.includes('\\/git\\/(stage|unstage|commit)$'), 'le tre POST git non sono più dichiarate come previsto');
  assert.ok(sorgente.includes('\\/git\\/status$'), 'la GET status non è più dichiarata come previsto');
  assert.ok(sorgente.includes('\\/git\\/branch$'), 'la GET branch non è più dichiarata come previsto');
  for (const proibito of ['push', 'remote', 'fetch', 'pull']) {
    assert.equal(sorgente.includes(`\\/git\\/${proibito}`), false, `esiste una rotta git/${proibito} in http-app.mjs`);
  }
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
