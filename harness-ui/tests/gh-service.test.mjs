/*
 * gh-service.test.mjs — F6-3 (27/09/2026, decisioni owner 1, 5-7, 25-28): le PR con `gh`. Un `gh` FINTO registra ogni
 * chiamata (argomenti esatti e testo sullo stdin) e risponde col JSON vero misurato il 27/09 sul repository dell'owner; un
 * `servizioGit` finto dà ramo, remoti e bozza. Le funzioni pure (repo dall'indirizzo, controlli, bozza, codice di accesso)
 * si provano sui dati veri. Ricerca: `.claude/RICERCA-F6-3-PR-2026-09-27.md`.
 */
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  PACCHETTI_GH, VERSIONE_GH, bozzaDaCommit, codiceDiAccesso, controlliDaRollup, creaServizioGh, repoDaIndirizzo, versioneAlmeno,
} from '../src/gh-service.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

/* Il `statusCheckRollup` VERO della PR #13 (27/09): `cli-unit` compare due volte, l'ultima vince. */
const ROLLUP_VERO = [
  { __typename: 'CheckRun', completedAt: '2026-09-27T11:18:14Z', conclusion: 'FAILURE', detailsUrl: 'https://github.com/talos-private/agent-virtual-machine/actions/runs/36315291950/job/108608741026', name: 'cli-unit', startedAt: '2026-09-27T11:18:12Z', status: 'COMPLETED', workflowName: 'cli' },
  { __typename: 'CheckRun', completedAt: '2026-09-27T11:18:11Z', conclusion: 'SUCCESS', detailsUrl: 'https://github.com/talos-private/agent-virtual-machine/actions/runs/36315289130/job/108608733806', name: 'cli-unit', startedAt: '2026-09-27T11:18:09Z', status: 'COMPLETED', workflowName: 'cli' },
  { __typename: 'CheckRun', completedAt: null, conclusion: '', detailsUrl: 'https://github.com/x/y/actions/runs/1', name: 'streaming-regression', startedAt: '2026-09-27T11:18:12Z', status: 'IN_PROGRESS', workflowName: 'desktop-streaming-red' },
  { __typename: 'CheckRun', completedAt: '2026-09-27T11:18:14Z', conclusion: 'SKIPPED', detailsUrl: 'https://github.com/x/y/actions/runs/2', name: 'pubblica', startedAt: '2026-09-27T11:18:12Z', status: 'COMPLETED', workflowName: 'release' },
  { __typename: 'CheckRun', completedAt: '2026-09-27T11:18:14Z', conclusion: 'CANCELLED', detailsUrl: 'https://github.com/x/y/actions/runs/3', name: 'lento', startedAt: '2026-09-27T11:18:12Z', status: 'COMPLETED', workflowName: 'nightly' },
  { __typename: 'StatusContext', context: 'ci/esterno', state: 'SUCCESS', targetUrl: 'https://ci.example.invalid/1', startedAt: '2026-09-27T11:10:00Z' },
];

test('GH-PURE-01 — versioni, e il repository GitHub dall\'indirizzo di un remoto (https, ssh, ssh://); al contrario: fuori da github.com o nomi strani, null', () => {
  assert.equal(versioneAlmeno('2.101.0', '2.97.0'), true);
  assert.equal(versioneAlmeno('2.97.0', '2.97.0'), true);
  assert.equal(versioneAlmeno('2.96.9', '2.97.0'), false);
  assert.equal(versioneAlmeno('3.0.0', '2.97.0'), true);
  assert.equal(versioneAlmeno('boh', '2.97.0'), false);
  assert.equal(repoDaIndirizzo('https://github.com/Ninozzz95/agent-virtual-machine.git'), 'Ninozzz95/agent-virtual-machine');
  assert.equal(repoDaIndirizzo('https://github.com/talos-private/agent-virtual-machine'), 'talos-private/agent-virtual-machine');
  assert.equal(repoDaIndirizzo('git@github.com:Ninozzz95/talos.git'), 'Ninozzz95/talos');
  assert.equal(repoDaIndirizzo('ssh://git@github.com/Ninozzz95/talos.git'), 'Ninozzz95/talos');
  assert.equal(repoDaIndirizzo('https://gitlab.com/a/b.git'), null);
  assert.equal(repoDaIndirizzo('https://github.com.evil.example/a/b'), null);
  assert.equal(repoDaIndirizzo('https://github.com/a/b/c'), null);
  assert.equal(repoDaIndirizzo('https://github.com/-rm/b;x'), null);
  assert.equal(repoDaIndirizzo('C:/repo/remoto.git'), null);
  assert.equal(repoDaIndirizzo('https://github.com/-web/b'), null, 'un proprietario che comincia con «-» sarebbe un\'opzione in `gh repo view`');
});

test('GH-PURE-02 — i controlli come `gh pr checks`: l\'ultima esecuzione per nome, cinque esiti, falliti in testa, solo link di github.com', () => {
  const c = controlliDaRollup(ROLLUP_VERO);
  assert.equal(c.totale, 5, 'cli-unit una volta sola');
  const cli = c.voci.find((v) => v.nome === 'cli-unit');
  assert.equal(cli.stato, 'fallito', 'vince l\'esecuzione più recente (FAILURE delle 11:18:12), non la vecchia verde');
  assert.equal(cli.flusso, 'cli');
  assert.deepEqual(c.conteggi, { passati: 1, falliti: 1, inCorso: 1, saltati: 1, annullati: 1 });
  assert.deepEqual(c.voci.map((v) => v.stato), ['fallito', 'in-corso', 'annullato', 'passato', 'saltato']);
  assert.equal(c.voci.find((v) => v.nome === 'ci/esterno').indirizzo, null, 'un link fuori da github.com non si offre');
  assert.deepEqual(controlliDaRollup(null), { voci: [], conteggi: { passati: 0, falliti: 0, inCorso: 0, saltati: 0, annullati: 0 }, totale: 0 });
  assert.equal(controlliDaRollup([{ __typename: 'CheckRun', name: 'x', status: 'QUEUED' }]).voci[0].stato, 'in-corso');
  assert.equal(controlliDaRollup([{ __typename: 'CheckRun', name: 'x', status: 'COMPLETED', conclusion: 'TIMED_OUT' }]).voci[0].stato, 'fallito');
});

test('GH-PURE-03 — la bozza come `--fill`: un commit dà soggetto e corpo; più commit, il ramo e i soggetti dal più vecchio', () => {
  assert.deepEqual(bozzaDaCommit('feat/x', [{ soggetto: 'aggiunge x', corpo: 'perché serve' }]), { titolo: 'aggiunge x', testo: 'perché serve' });
  assert.deepEqual(bozzaDaCommit('feat/pr-tab_nuova', [{ soggetto: 'secondo', corpo: '' }, { soggetto: 'primo', corpo: 'x' }]), { titolo: 'feat/pr tab nuova', testo: '- **primo**\n- **secondo**\n' });
  assert.deepEqual(bozzaDaCommit('vuoto', []), { titolo: 'vuoto', testo: '' });
});

test('GH-PURE-04 — il codice di accesso si legge per FORMA dallo stderr vero di `gh auth login` (flow.go:48-84), anche coi colori', () => {
  assert.deepEqual(codiceDiAccesso('\n! One-time code (AB12-CD34) copied to clipboard\nOpen this URL to continue in your web browser: https://github.com/login/device\n'), { codice: 'AB12-CD34', indirizzo: 'https://github.com/login/device' });
  assert.deepEqual(codiceDiAccesso('\u001b[0;33m!\u001b[0m First copy your one-time code: \u001b[1mWXYZ-9876\u001b[0m\n'), { codice: 'WXYZ-9876', indirizzo: null });
  assert.deepEqual(codiceDiAccesso('niente di utile'), { codice: null, indirizzo: null });
});

/* ─────────── il servizio, con un gh finto ─────────── */

const SINC_PUBBLICATO = {
  ramo: 'feat/pr-tab', staccata: false, avanti: 0, indietro: 0, riferimentoSparito: false, remotoPerInvio: 'origin',
  riferimento: { corto: 'origin/feat/pr-tab', remoto: 'origin', ramo: 'feat/pr-tab' },
  /* `origin` in FONDO apposta: la PR va dove va il ramo, non sul primo remoto dell'elenco */
  remoti: [
    { nome: 'public', url: 'https://github.com/Ninozzz95/talos.git', urlInvio: null },
    { nome: 'talos-private', url: 'https://github.com/talos-private/agent-virtual-machine.git', urlInvio: null },
    { nome: 'origin', url: 'https://github.com/Ninozzz95/agent-virtual-machine.git', urlInvio: null },
  ],
};

function pr(numero, altro = {}) {
  return { number: numero, title: `PR ${numero}`, url: `https://github.com/talos-private/agent-virtual-machine/pull/${numero}`, state: 'OPEN', isDraft: false, isCrossRepository: false, headRepositoryOwner: { login: 'talos-private' }, headRefName: 'feat/pr-tab', baseRefName: 'main', author: { login: 'altro' }, updatedAt: '2026-09-27T10:00:00Z', createdAt: '2026-09-27T09:00:00Z', reviewDecision: '', mergeStateStatus: 'CLEAN', ...altro };
}

function ambiente(t, { sinc = SINC_PUBBLICATO, risposte = {}, perLaPr = null, ghDiSistema = '2.97.0', ghTalos = false } = {}) {
  const cartella = mkdtempSync(join(tmpdir(), 'talos-gh-'));
  t.after(() => rimuoviCartellaDiProva(cartella));
  const chiamate = [];
  const sistema = join(cartella, 'sistema', 'gh.exe');
  const talos = join(cartella, 'strumenti', VERSIONE_GH, 'bin', 'gh.exe');
  const esistenti = new Set([...(ghDiSistema ? [sistema] : []), ...(ghTalos ? [talos] : [])]);
  const eseguiFn = async (eseguibile, argomenti, opzioni) => {
    chiamate.push({ eseguibile, argomenti, input: opzioni?.input ?? null });
    if (argomenti[0] === '--version') return { codice: 0, stdout: `gh version ${eseguibile === sistema ? ghDiSistema : VERSIONE_GH} (2026-09-15)\nhttps://github.com/cli/cli/releases/tag/v${VERSIONE_GH}\n`, stderr: '' };
    const chiave = argomenti.slice(0, 2).join(' ');
    const r = typeof risposte[chiave] === 'function' ? risposte[chiave](argomenti) : risposte[chiave];
    if (r) return r;
    if (chiave === 'auth status') return { codice: 0, stdout: JSON.stringify({ hosts: { 'github.com': [{ state: 'success', active: true, host: 'github.com', login: 'Ninozzz95', tokenSource: 'keyring', scopes: 'gist, read:org, repo, workflow', gitProtocol: 'https' }] } }), stderr: '' };
    if (chiave === 'repo view') return { codice: 0, stdout: JSON.stringify({ defaultBranchRef: { name: 'main' } }), stderr: '' };
    return { codice: 1, stdout: '', stderr: `comando non previsto: ${argomenti.join(' ')}` };
  };
  const servizioGit = {
    sincronizzazione: async () => sinc,
    perLaPr: perLaPr ?? (async ({ base = null, basePredefinita = null }) => ({ ramo: sinc.ramo, remoto: 'origin', base: base ?? basePredefinita, baseConfigurata: null, ramiRemoti: ['feat/pr-tab', 'main', 'rilascio'], baseTrovata: true, commit: [{ hash: 'a'.repeat(40), soggetto: 'aggiunge la scheda', corpo: 'il corpo' }] })),
  };
  const servizio = creaServizioGh({
    cartellaStrumenti: join(cartella, 'strumenti'), servizioGit, piattaforma: 'win32', architettura: 'x64',
    ambiente: { PATH: join(cartella, 'sistema') }, eseguiFn, esisteFn: async (p) => esistenti.has(p),
  });
  return { servizio, chiamate, cartella, sistema, talos, esistenti };
}

test('GH-SERVIZIO-01 — stato: il gh di sistema abbastanza nuovo si usa, collegato, e il token non passa mai (solo `auth status --json`)', async (t) => {
  const { servizio, chiamate } = ambiente(t);
  const s = await servizio.stato();
  assert.deepEqual([s.gh.trovato, s.gh.origine, s.gh.versione], [true, 'sistema', '2.97.0']);
  assert.deepEqual([s.accesso.collegato, s.accesso.account], [true, 'Ninozzz95']);
  assert.ok(s.accesso.ambiti.includes('repo'));
  assert.deepEqual(chiamate.find((c) => c.argomenti[0] === 'auth').argomenti, ['auth', 'status', '--json', 'hosts', '--hostname', 'github.com']);
  assert.ok(!chiamate.some((c) => c.argomenti.includes('token')), 'nessun `auth token`');
});

test('GH-SERVIZIO-02 — al contrario: un gh di sistema troppo vecchio non si usa; c\'è quello di TALOS ⇒ quello; nessuno ⇒ «non installata», nessuna chiamata a GitHub', async (t) => {
  const vecchio = ambiente(t, { ghDiSistema: '2.40.1', ghTalos: true });
  const s = await vecchio.servizio.stato();
  assert.deepEqual([s.gh.origine, s.gh.versione, s.gh.sistemaTroppoVecchio], ['talos', VERSIONE_GH, '2.40.1']);
  assert.ok(vecchio.chiamate.filter((c) => c.argomenti[0] !== '--version').every((c) => c.eseguibile === vecchio.talos));
  const nessuno = ambiente(t, { ghDiSistema: null, ghTalos: false });
  const n = await nessuno.servizio.stato();
  assert.deepEqual([n.gh.trovato, n.accesso.collegato, n.installabile], [false, false, true]);
  assert.equal((await nessuno.servizio.pullRequest({ sessionId: 's' })).code, 'GH_NOT_INSTALLED');
  assert.ok(!nessuno.chiamate.some((c) => c.argomenti[0] === 'pr'), 'senza gh non parte niente');
});

test('GH-SERVIZIO-03 — PR: `--repo` SEMPRE dal remoto del ramo (tre remoti), la PR da fork scartata, l\'aperta prima, le proprie in testa', async (t) => {
  const { servizio, chiamate } = ambiente(t, {
    risposte: {
      'pr list': (argomenti) => argomenti.some((x) => x.startsWith('--head='))
        ? { codice: 0, stdout: JSON.stringify([pr(20, { isCrossRepository: true, headRepositoryOwner: { login: 'estraneo' } }), pr(19, { state: 'MERGED' }), pr(21, { statusCheckRollup: ROLLUP_VERO })]), stderr: '' }
        : { codice: 0, stdout: JSON.stringify([pr(1, { updatedAt: '2026-09-27T12:00:00Z' }), pr(2, { author: { login: 'Ninozzz95' }, updatedAt: '2026-09-20T00:00:00Z' }), pr(3, { updatedAt: '2026-09-26T00:00:00Z' })]), stderr: '' },
    },
  });
  const r = await servizio.pullRequest({ sessionId: 's' });
  assert.equal(r.erroreAvvio, undefined, r.erroreAvvio);
  assert.equal(r.repo, 'Ninozzz95/agent-virtual-machine', 'il remoto del ramo è origin: mai public né talos-private');
  for (const c of chiamate.filter((c) => c.argomenti[0] === 'pr')) {
    assert.ok(c.argomenti.includes('--repo=Ninozzz95/agent-virtual-machine'), c.argomenti.join(' '));
  }
  assert.deepEqual(chiamate.find((c) => c.argomenti.some((a) => a.startsWith('--head='))).argomenti.slice(0, 6), ['pr', 'list', '--repo=Ninozzz95/agent-virtual-machine', '--head=feat/pr-tab', '--state', 'all']);
  assert.equal(r.prDelRamo.numero, 21, 'l\'aperta del nostro repository, non la unita né quella da fork');
  assert.equal(r.prDelRamo.controlli.conteggi.falliti, 1);
  assert.deepEqual(r.aperte.map((p) => p.numero), [2, 1, 3], 'la mia in testa, poi le più recenti');
  assert.equal(r.account, 'Ninozzz95');
});

test('GH-SERVIZIO-04 — la PR unita del ramo PREDEFINITO non si mostra come «la PR del ramo» (gh finder.go, cli/cli#4263); di un altro ramo sì', async (t) => {
  const suMain = ambiente(t, {
    sinc: { ...SINC_PUBBLICATO, ramo: 'main', riferimento: { corto: 'origin/main', remoto: 'origin', ramo: 'main' } },
    risposte: { 'pr list': (a) => ({ codice: 0, stdout: JSON.stringify(a.some((x) => x.startsWith('--head=')) ? [pr(5, { state: 'MERGED', headRefName: 'main' })] : []), stderr: '' }) },
  });
  assert.equal((await suMain.servizio.pullRequest({ sessionId: 's' })).prDelRamo, null);
  const altro = ambiente(t, { risposte: { 'pr list': (a) => ({ codice: 0, stdout: JSON.stringify(a.some((x) => x.startsWith('--head=')) ? [pr(6, { state: 'MERGED' })] : []), stderr: '' }) } });
  assert.equal((await altro.servizio.pullRequest({ sessionId: 's' })).prDelRamo.stato, 'merged');
});

test('GH-SERVIZIO-05 — crea: argomenti esatti, il testo passa dallo stdin (mai sulla riga di comando), bozza, e l\'indirizzo restituito', async (t) => {
  const { servizio, chiamate } = ambiente(t, { risposte: { 'pr create': { codice: 0, stdout: 'https://github.com/talos-private/agent-virtual-machine/pull/42\n', stderr: '' } } });
  const testo = 'Righe con "virgolette", $DOLLARI e `backtick`\n- punto';
  const r = await servizio.crea({ sessionId: 's', titolo: '  Aggiunge la scheda PR  ', testo, base: 'main', bozza: true });
  assert.deepEqual(r, { ok: true, url: 'https://github.com/talos-private/agent-virtual-machine/pull/42', numero: 42, repo: 'Ninozzz95/agent-virtual-machine', base: 'main', ramo: 'feat/pr-tab', bozza: true });
  const c = chiamate.find((x) => x.argomenti[1] === 'create');
  assert.deepEqual(c.argomenti, ['pr', 'create', '--repo=Ninozzz95/agent-virtual-machine', '--head=feat/pr-tab', '--base=main', '--title=Aggiunge la scheda PR', '--body-file', '-', '--draft']);
  assert.equal(c.input, testo);
  assert.ok(!c.argomenti.includes(testo));
});

test('GH-SERVIZIO-05b — al contrario: un titolo che sembra un\'opzione («--web», «--draft») resta TESTO, attaccato col «=»', async (t) => {
  const { servizio, chiamate } = ambiente(t, { risposte: { 'pr create': { codice: 0, stdout: 'https://github.com/a/b/pull/7\n', stderr: '' } } });
  for (const titolo of ['--web', '--draft', '-R altro/repo']) {
    const r = await servizio.crea({ sessionId: 's', titolo, base: 'main' });
    assert.equal(r.ok, true, titolo);
    const c = chiamate.filter((x) => x.argomenti[1] === 'create').at(-1);
    assert.ok(c.argomenti.includes(`--title=${titolo}`), c.argomenti.join(' | '));
    assert.ok(!c.argomenti.includes(titolo), 'mai come argomento a sé');
    assert.ok(!c.argomenti.includes('--draft'), 'la bozza la decide solo `bozza`');
  }
});

test('GH-SERVIZIO-06 — al contrario: ramo non pubblicato o con commit da inviare ⇒ GH_BRANCH_NOT_PUSHED e NESSUN `pr create`; base assente, titolo vuoto o lungo ⇒ rifiuti nominati', async (t) => {
  const nonPubblicato = ambiente(t, { sinc: { ...SINC_PUBBLICATO, riferimento: null, avanti: null } });
  const a = await nonPubblicato.servizio.crea({ sessionId: 's', titolo: 'x', base: 'main' });
  assert.deepEqual([a.code, a.dettagli.pubblicato, a.dettagli.remoto], ['GH_BRANCH_NOT_PUSHED', false, 'origin']);
  const avanti = ambiente(t, { sinc: { ...SINC_PUBBLICATO, avanti: 2 } });
  const b = await avanti.servizio.crea({ sessionId: 's', titolo: 'x', base: 'main' });
  assert.deepEqual([b.code, b.dettagli.avanti], ['GH_BRANCH_NOT_PUSHED', 2]);
  for (const x of [nonPubblicato, avanti]) assert.ok(!x.chiamate.some((c) => c.argomenti[1] === 'create'), 'gh non spinge mai al posto nostro');
  const { servizio, chiamate } = ambiente(t);
  assert.equal((await servizio.crea({ sessionId: 's', titolo: 'x', base: 'sconosciuto' })).code, 'GH_BASE_UNKNOWN');
  assert.equal((await servizio.crea({ sessionId: 's', titolo: '   ', base: 'main' })).code, 'GH_INPUT_INVALID');
  assert.equal((await servizio.crea({ sessionId: 's', titolo: 'x'.repeat(257), base: 'main' })).code, 'GH_INPUT_INVALID');
  assert.equal((await servizio.crea({ sessionId: 's', titolo: 'x', base: '--web' })).code, 'GH_INPUT_INVALID');
  const stesso = await servizio.crea({ sessionId: 's', titolo: 'x', base: 'feat/pr-tab' });
  assert.deepEqual([stesso.code, stesso.erroreAvvio], ['GH_INPUT_INVALID', 'La base e il ramo sono lo stesso'], 'il ramo stesso è sul remoto, ma non può essere la sua base');
  assert.ok(!chiamate.some((c) => c.argomenti[1] === 'create'));
});

test('GH-SERVIZIO-07 — un remoto fuori da github.com, e l\'uscita 4 di gh (accesso richiesto): rifiuti nominati, non messaggi inglesi', async (t) => {
  const gitlab = ambiente(t, { sinc: { ...SINC_PUBBLICATO, remoti: [{ nome: 'origin', url: 'https://gitlab.com/a/b.git', urlInvio: null }] } });
  assert.equal((await gitlab.servizio.pullRequest({ sessionId: 's' })).code, 'GH_NOT_GITHUB');
  const scollegato = ambiente(t, { risposte: { 'pr list': { codice: 4, stdout: '', stderr: 'To get started with GitHub CLI, please run:  gh auth login' }, 'auth status': { codice: 1, stdout: '{"hosts":{}}', stderr: '' } } });
  assert.equal((await scollegato.servizio.pullRequest({ sessionId: 's' })).code, 'GH_NOT_LOGGED_IN');
  assert.equal((await scollegato.servizio.stato()).accesso.collegato, false);
});

test('GH-SERVIZIO-08 — bozza: base predefinita dal repository, basi senza il ramo stesso, titolo e testo come --fill', async (t) => {
  const { servizio } = ambiente(t);
  const b = await servizio.bozza({ sessionId: 's' });
  assert.equal(b.erroreAvvio, undefined, b.erroreAvvio);
  assert.deepEqual([b.repo, b.base, b.ramoPredefinito, b.titolo, b.testo, b.commit, b.pubblicato], ['Ninozzz95/agent-virtual-machine', 'main', 'main', 'aggiunge la scheda', 'il corpo', 1, true]);
  assert.deepEqual(b.basi, ['main', 'rilascio']);
});

test('GH-SERVIZIO-09 — controlli di una PR per numero; al contrario un numero non valido non arriva a gh', async (t) => {
  const { servizio, chiamate } = ambiente(t, { risposte: { 'pr view': { codice: 0, stdout: JSON.stringify({ number: 21, state: 'OPEN', statusCheckRollup: ROLLUP_VERO }), stderr: '' } } });
  const c = await servizio.controlli({ sessionId: 's', numero: 21 });
  assert.deepEqual([c.numero, c.stato, c.controlli.totale], [21, 'open', 5]);
  assert.deepEqual(chiamate.find((x) => x.argomenti[0] === 'pr').argomenti, ['pr', 'view', '21', '--repo=Ninozzz95/agent-virtual-machine', '--json', 'number,state,statusCheckRollup']);
  const prima = chiamate.length;
  for (const n of [0, -1, 1.5, '21', null]) assert.equal((await servizio.controlli({ sessionId: 's', numero: n })).code, 'QUERY_INVALID');
  assert.equal(chiamate.length, prima);
});

/* ─────────── scaricare e collegare ─────────── */

test('GH-INSTALLA-01 — scarica: impronta contro checksums.txt E contro quella attesa; estrae; poi si usa il gh di TALOS', async (t) => {
  const env = ambiente(t, { ghDiSistema: null });
  const pacchetto = PACCHETTI_GH['win32-x64'];
  const scaricati = [];
  const servizio = creaServizioGh({
    cartellaStrumenti: join(env.cartella, 'strumenti'), servizioGit: { sincronizzazione: async () => SINC_PUBBLICATO }, piattaforma: 'win32', architettura: 'x64', ambiente: { PATH: '' },
    eseguiFn: async (eseguibile, argomenti) => (argomenti[0] === '--version' ? { codice: 0, stdout: `gh version ${VERSIONE_GH} (2026-09-15)\n`, stderr: '' } : { codice: 0, stdout: '{}', stderr: '' }),
    esisteFn: async (p) => env.esistenti.has(p),
    scaricaFn: async (url, destinazione) => {
      scaricati.push(url);
      if (url.endsWith('checksums.txt')) { writeFileSync(destinazione, `${'0'.repeat(64)}  gh_2.101.0_windows_386.zip\n${pacchetto.sha256}  ${pacchetto.nome}\n`); return { byte: 10, sha256: 'x' }; }
      writeFileSync(destinazione, 'zip'); return { byte: 3, sha256: pacchetto.sha256 };
    },
    estraiFn: async (zip, destinazione) => { const bin = join(destinazione, 'bin'); (await import('node:fs')).mkdirSync(bin, { recursive: true }); writeFileSync(join(bin, 'gh.exe'), 'exe'); env.esistenti.add(join(destinazione, 'bin', 'gh.exe')); env.esistenti.add(env.talos); },
  });
  const r = await servizio.installa();
  assert.equal(r.erroreAvvio, undefined, r.erroreAvvio);
  assert.deepEqual(r.gh, { trovato: true, origine: 'talos', versione: VERSIONE_GH });
  assert.deepEqual(scaricati, [`https://github.com/cli/cli/releases/download/v${VERSIONE_GH}/gh_${VERSIONE_GH}_checksums.txt`, `https://github.com/cli/cli/releases/download/v${VERSIONE_GH}/${pacchetto.nome}`]);
});

test('GH-INSTALLA-02 — al contrario: impronta pubblicata diversa, o file scaricato diverso ⇒ GH_CHECKSUM_MISMATCH e niente estratto; piattaforma non prevista ⇒ rifiuto', async (t) => {
  const pacchetto = PACCHETTI_GH['win32-x64'];
  for (const [nome, impronteFile, improntaZip] of [['pubblicata', 'f'.repeat(64), pacchetto.sha256], ['scaricata', pacchetto.sha256, 'e'.repeat(64)]]) {
    const env = ambiente(t, { ghDiSistema: null });
    let estratto = false;
    const servizio = creaServizioGh({
      cartellaStrumenti: join(env.cartella, 'strumenti'), servizioGit: { sincronizzazione: async () => SINC_PUBBLICATO }, piattaforma: 'win32', architettura: 'x64', ambiente: { PATH: '' },
      eseguiFn: async () => ({ codice: 1, stdout: '', stderr: '' }), esisteFn: async () => false,
      scaricaFn: async (url, destinazione) => { writeFileSync(destinazione, url.endsWith('checksums.txt') ? `${impronteFile}  ${pacchetto.nome}\n` : 'zip'); return { byte: 3, sha256: improntaZip }; },
      estraiFn: async () => { estratto = true; },
    });
    assert.equal((await servizio.installa()).code, 'GH_CHECKSUM_MISMATCH', nome);
    assert.equal(estratto, false, `${nome}: niente estratto`);
  }
  const env = ambiente(t);
  const linux = creaServizioGh({ cartellaStrumenti: join(env.cartella, 'l'), servizioGit: { sincronizzazione: async () => SINC_PUBBLICATO }, piattaforma: 'linux', architettura: 'x64', ambiente: { PATH: '' }, eseguiFn: async () => ({ codice: 1, stdout: '', stderr: '' }), esisteFn: async () => false });
  assert.equal((await linux.installa()).code, 'GH_UNSUPPORTED_PLATFORM');
});

function figlioFinto() {
  const figlio = new EventEmitter();
  figlio.stdout = new EventEmitter();
  figlio.stderr = new EventEmitter();
  figlio.uccisioni = 0;
  figlio.kill = () => { figlio.uccisioni += 1; queueMicrotask(() => figlio.emit('close', null)); return true; };
  return figlio;
}

test('GH-COLLEGA-01 — «Collega GitHub»: argomenti esatti, il codice letto dallo stderr, poi «collegato» quando gh esce con 0', async (t) => {
  const env = ambiente(t);
  let figlio; let argomenti; let lanci = 0;
  const servizio = creaServizioGh({
    cartellaStrumenti: join(env.cartella, 'strumenti'), servizioGit: { sincronizzazione: async () => SINC_PUBBLICATO }, piattaforma: 'win32', architettura: 'x64',
    ambiente: { PATH: join(env.cartella, 'sistema') }, esisteFn: async (p) => env.esistenti.has(p),
    eseguiFn: async (e, a) => (a[0] === '--version' ? { codice: 0, stdout: 'gh version 2.97.0 (2026-07-31)\n', stderr: '' } : { codice: 0, stdout: '{}', stderr: '' }),
    avviaFn: (e, a) => { lanci += 1; argomenti = a; figlio = figlioFinto(); setImmediate(() => figlio.stderr.emit('data', Buffer.from('\n! One-time code (AB12-CD34) copied to clipboard\nOpen this URL to continue in your web browser: https://github.com/login/device\n'))); return figlio; },
  });
  const r = await servizio.collega();
  assert.deepEqual(argomenti, ['auth', 'login', '--web', '--clipboard', '--hostname', 'github.com', '--git-protocol', 'https', '--skip-ssh-key']);
  assert.deepEqual([r.ok, r.stato, r.codice, r.indirizzo], [true, 'in-attesa', 'AB12-CD34', 'https://github.com/login/device']);
  assert.deepEqual((await servizio.collega()).codice, 'AB12-CD34');
  assert.equal(lanci, 1, 'un secondo clic non lancia un secondo login');
  figlio.emit('close', 0);
  const s = await servizio.stato();
  assert.deepEqual([s.collegamento.stato, s.collegamento.codice], ['collegato', null]);
});

test('GH-COLLEGA-02 — al contrario: annullato ⇒ il processo si ferma; nessun codice ⇒ errore nominato e processo fermato', async (t) => {
  const env = ambiente(t);
  const figli = [];
  let parla = true;
  const servizio = creaServizioGh({
    cartellaStrumenti: join(env.cartella, 'strumenti'), servizioGit: { sincronizzazione: async () => SINC_PUBBLICATO }, piattaforma: 'win32', architettura: 'x64',
    ambiente: { PATH: join(env.cartella, 'sistema') }, esisteFn: async (p) => env.esistenti.has(p),
    eseguiFn: async (e, a) => (a[0] === '--version' ? { codice: 0, stdout: 'gh version 2.97.0 (2026-07-31)\n', stderr: '' } : { codice: 0, stdout: '{}', stderr: '' }),
    avviaFn: () => {
      const f = figlioFinto(); figli.push(f);
      setImmediate(() => { if (parla) f.stderr.emit('data', 'First copy your one-time code: QQQQ-1111\n'); else { f.stderr.emit('data', 'error connecting to github.com\n'); f.emit('close', 1); } });
      return f;
    },
  });
  await servizio.collega();
  assert.deepEqual(await servizio.annullaCollegamento(), { ok: true, fermato: true });
  assert.equal(figli[0].uccisioni, 1);
  assert.equal((await servizio.stato()).collegamento.stato, 'annullato');
  assert.deepEqual(await servizio.annullaCollegamento(), { ok: true, fermato: false });
  parla = false;
  const r = await servizio.collega();
  assert.equal(r.code, 'GH_LOGIN_FAILED');
  assert.equal((await servizio.stato()).collegamento.stato, 'fallito');
});

test('GH-COLLEGA-03 — due clic PRIMA che arrivi il codice: un solo `gh auth login`, e tutti e due ricevono lo stesso codice', async (t) => {
  const env = ambiente(t);
  let lanci = 0;
  const servizio = creaServizioGh({
    cartellaStrumenti: join(env.cartella, 'strumenti'), servizioGit: { sincronizzazione: async () => SINC_PUBBLICATO }, piattaforma: 'win32', architettura: 'x64',
    ambiente: { PATH: join(env.cartella, 'sistema') }, esisteFn: async (p) => env.esistenti.has(p),
    eseguiFn: async (e, a) => (a[0] === '--version' ? { codice: 0, stdout: 'gh version 2.97.0 (2026-07-31)\n', stderr: '' } : { codice: 0, stdout: '{}', stderr: '' }),
    avviaFn: () => {
      lanci += 1;
      const f = figlioFinto();
      setTimeout(() => f.stderr.emit('data', '! One-time code (ZZ99-YY88) copied to clipboard\n'), 30);
      return f;
    },
  });
  const [a, b] = await Promise.all([servizio.collega(), servizio.collega()]);
  assert.equal(lanci, 1, 'il secondo clic non lancia un secondo processo');
  assert.deepEqual([a.codice, b.codice], ['ZZ99-YY88', 'ZZ99-YY88']);
  assert.equal((await servizio.collega()).codice, 'ZZ99-YY88');
  assert.equal(lanci, 1);
});
