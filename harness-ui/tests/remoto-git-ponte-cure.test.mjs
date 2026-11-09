import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

import { creaServizioGit } from '../src/git-service.mjs';
import { createHttpApp } from '../src/http-app.mjs';
import { iscriviConRigiocata } from '../src/iscrizione-sessione.mjs';
import { creaChiamataInterna } from '../src/remoto/chiamata-interna.mjs';
import { codifica } from '../src/remoto/filo.mjs';
import { OPERAZIONI_HTTP, creaOperazioni } from '../src/remoto/operazioni.mjs';
import { RISPOSTE_NON_RICORDATE } from '../src/remoto/servizio.mjs';

/*
 * Revisione del blocco 14 (31/10/2026), gruppo 1: il ponte Git con un repository VERO e le rotte VERE del PC. Le prove con la `chiama` finta di `remoto-operazioni-git` guardavano
 *   le letture e il cancello del ponte: i difetti stavano nelle risposte delle scritture e nel cancello della rotta.
 */
const contesto = { dispositivo: { id: 'dispositivo-A1', nome: 'Pad' }, iscrizioni: new Map(), iscrivi: () => async () => {} };
const GETTONE = 'ghp_SEGRETO';

function mondo(t) {
  const base = realpathSync.native(mkdtempSync(join(tmpdir(), 'talos-git-ponte-')));
  t.after(() => rimuoviCartellaDiProva(base));
  const g = (cwd, ...a) => execFileSync('git', a, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  const remoto = join(base, 'remoto.git');
  execFileSync('git', ['init', '-q', '--bare', '-b', 'main', remoto]);
  const seme = join(base, 'seme');
  execFileSync('git', ['clone', '-q', remoto, seme], { stdio: 'ignore' });
  g(seme, 'config', 'user.email', 'a@example.invalid'); g(seme, 'config', 'user.name', 'A');
  writeFileSync(join(seme, 'a.txt'), 'uno\n'); g(seme, 'add', 'a.txt'); g(seme, 'commit', '-q', '-m', 'primo'); g(seme, 'push', '-q', '-u', 'origin', 'main');
  /* un secondo clone: quello ha `refs/remotes/origin/HEAD`, come un progetto vero */
  const dir = join(base, 'A');
  execFileSync('git', ['clone', '-q', remoto, dir], { stdio: 'ignore' });
  g(dir, 'config', 'user.email', 'a@example.invalid'); g(dir, 'config', 'user.name', 'A');
  const sessionRegistry = { elenca: () => [], esiste: () => true, async cartellaPerChatFile() { return { ok: true, cartella: dir }; }, async pausaRicerca() { return { ok: true }; }, async leggiRicerca() { return { ricerca: { id: 'r1' } }; } };
  const gitService = creaServizioGit({ cartellaDiSessione: () => dir });
  const costruisci = (cartelle) => {
    const httpApp = createHttpApp({ senzaGettone: 'prove', staticHandler: async () => null, sessionRegistry, gitService, cartelleDispositiviFn: () => cartelle });
    const chiama = creaChiamataInterna({ httpApp, porta: 4999 });
    return { chiama, operazioni: creaOperazioni({ chiama, sessionRegistry, iscriviConRigiocata, cartelle }) };
  };
  const aperte = { consentita: async () => true, descrivi: async () => ({}), elenco: async () => [] };
  const op = (nome, args = {}) => costruisci(aperte).operazioni.esegui(`session.git.${nome}`, { sessionId: 's1', ...args }, contesto);
  return { base, costruisci, dir, g, op, remoto, seme };
}

const nascosto = (risposta, base) => {
  const testo = JSON.stringify(risposta);
  assert.equal(testo.includes(GETTONE), false, 'il gettone di un remoto non esce');
  for (const forma of [base.replaceAll('\\', '/'), JSON.stringify(base).slice(1, -1)]) assert.equal(testo.includes(forma), false, 'la cartella del PC non esce');
};

test('GIT-CURE-01 D-26: nessuna voce Git senza filtro', () => {
  const voci = Object.entries(OPERAZIONI_HTTP).filter(([nome]) => nome.startsWith('session.git.'));
  assert.equal(voci.length, 30);
  for (const [nome, voce] of voci) assert.equal(typeof voce.filtra, 'function', nome);
});

test('GIT-CURE-02 D-26: ogni scrittura che riporta sincronizzazione o stato arriva pulita, con le rotte vere', async (t) => {
  const { base, dir, g, op, seme } = mondo(t);
  g(dir, 'remote', 'add', 'gettone', `https://x-access-token:${GETTONE}@example.invalid/a/b.git`);
  const passa = async (nome, args, controlla = 'stato') => {
    const r = await op(nome, args).catch((e) => { throw new Error(`${nome}: ${e.code} ${e.explanation ?? e.message}`); });
    assert.ok(r?.[controlla], `${nome} riporta ${controlla}`);
    nascosto(r, base);
    return r;
  };
  const corpo = (c, extra = {}) => ({ corpo: c, ...extra });

  writeFileSync(join(seme, 'b.txt'), 'dal remoto\n'); g(seme, 'add', 'b.txt'); g(seme, 'commit', '-q', '-m', 'dal remoto'); g(seme, 'push', '-q');
  await passa('fetch', corpo({ remoto: 'origin' }), 'sincronizzazione');
  await passa('pull', corpo({}, { confermata: true }), 'sincronizzazione');

  writeFileSync(join(dir, 'c.txt'), 'due\n');
  const stage = await passa('stage', corpo({ percorsi: ['c.txt'] }));
  await passa('unstage', corpo({ percorsi: ['c.txt'] }));
  await passa('stage', corpo({ percorsi: ['c.txt'] }));
  const fatto = await passa('commit', corpo({ percorsi: ['c.txt'], messaggio: 'due' }));
  assert.equal(stage.ok, true);
  assert.ok(fatto.commit);

  writeFileSync(join(dir, 'd.txt'), 'tre\n');
  const preparato = await passa('stage', corpo({ percorsi: ['d.txt'] }));
  const commit = await passa('commit-staged', corpo({ messaggio: 'tre', impronta: preparato.stato.impronta }));
  const prima = await op('log');
  assert.equal(prima.testa, commit.commit);
  await passa('amend', corpo({ messaggio: 'tre bis', impronta: (await op('status')).impronta, commit: prima.testa }, { confermata: true }));
  await passa('undo-commit', corpo({ commit: (await op('log')).testa }, { confermata: true }));

  await passa('branch-create', corpo({ ramo: 'prova' }));
  await passa('switch', corpo({ ramo: 'main' }));
  writeFileSync(join(dir, 'a.txt'), 'uno\ncambiato\n');
  await passa('discard', corpo({ percorsi: ['a.txt'] }, { confermata: true }));
  writeFileSync(join(dir, 'a.txt'), 'uno\naccantonato\n');
  await passa('stash', corpo({ messaggio: 'da parte' }));
  const [voce] = (await op('stashes')).accantonati;
  await passa('stash-pop', corpo({ indice: voce.indice, commit: voce.commit }));
  await passa('stash', corpo({ messaggio: 'di nuovo' }));
  const [seconda] = (await op('stashes')).accantonati;
  await passa('stash-drop', corpo({ indice: seconda.indice, commit: seconda.commit }, { confermata: true }), 'accantonati');

  const sync = await op('sync');
  const log = await op('log');
  const inviato = await passa('push', corpo({}, { confermata: true, visto: { ramo: sync.ramo, remoto: sync.riferimento.remoto, urlInvio: sync.urlInvio, destinazione: sync.destinazione, commit: log.testa } }), 'sincronizzazione');
  assert.equal(inviato.ok, true);
});

test('GIT-CURE-03 D-27: un remoto file:// non porta il percorso del PC, in nessuna forma', async (t) => {
  const { dir, g, op } = mondo(t);
  g(dir, 'remote', 'add', 'locale', 'file:///C:/Users/Mario/depositi/b.git');
  g(dir, 'remote', 'add', 'linux', 'file:///home/antonino/depositi/c.git');
  g(dir, 'remote', 'add', 'maiuscolo', 'FILE:///home/antonino/depositi/d.git');
  g(dir, 'remote', 'add', 'host', 'file://server/home/antonino/depositi/e.git');
  for (const voce of ['remotes', 'sync']) {
    const r = await op(voce);
    assert.doesNotMatch(JSON.stringify(r), /ntonino/u, voce);
    const per = Object.fromEntries(r.remoti.map((x) => [x.nome, x.url]));
    assert.deepEqual([per.locale, per.linux, per.maiuscolo, per.host].map((u) => u.split('#')[0]), ['…/b.git', '…/c.git', '…/d.git', '…/e.git'], voce);
  }
  g(dir, 'remote', 'add', 'web', 'https://example.com/home/a/b.git');
  assert.equal((await op('remotes')).remoti.find((x) => x.nome === 'web').url, 'https://example.com/home/a/b.git', 'un indirizzo vero resta intero');
});

test('GIT-CURE-04 D-28: col ramo tracciato sparito si confronta il remoto che l\'invio userà davvero', async (t) => {
  const { base, dir, g, op } = mondo(t);
  const secondo = join(base, 'secondo.git');
  execFileSync('git', ['init', '-q', '--bare', '-b', 'main', secondo]);
  g(dir, 'remote', 'add', 'backup', secondo);
  g(dir, 'config', 'remote.pushDefault', 'backup');
  g(dir, 'switch', '-q', '-c', 'lavoro'); g(dir, 'push', '-q', '-u', 'origin', 'lavoro');
  g(dir, 'update-ref', '-d', 'refs/remotes/origin/lavoro');
  const sync = await op('sync');
  assert.deepEqual([sync.riferimento.remoto, sync.riferimentoSparito, sync.remotoPerInvio], ['origin', true, 'backup']);
  const { testa } = await op('log');
  const carta = { ramo: 'lavoro', urlInvio: sync.urlInvio, destinazione: sync.destinazione, commit: testa };
  await assert.rejects(op('push', { corpo: {}, confermata: true, visto: { ...carta, remoto: 'origin' } }),
    (e) => e.code === 'GIT_PUSH_CHANGED' && e.stato === 409 && e.params.remoto === 'backup');
  assert.equal(g(dir, 'ls-remote', 'backup').trim(), '', 'la carta ha detto origin: su backup non è partito niente');
  const esito = await op('push', { corpo: {}, confermata: true, visto: { ...carta, remoto: 'backup' } });
  assert.deepEqual([esito.ok, esito.remoto, esito.pubblicato], [true, 'backup', true]);
});

test('GIT-CURE-05 D-28: con un riferimento sano resta il remoto tracciato, anche se il remoto predefinito è un altro', async (t) => {
  const { base, dir, g, op } = mondo(t);
  const secondo = join(base, 'secondo.git');
  execFileSync('git', ['init', '-q', '--bare', '-b', 'main', secondo]);
  g(dir, 'remote', 'add', 'backup', secondo);
  g(dir, 'config', 'remote.pushDefault', 'backup');
  writeFileSync(join(dir, 'e.txt'), 'x\n'); g(dir, 'add', 'e.txt'); g(dir, 'commit', '-q', '-m', 'x');
  const { testa } = await op('log');
  const sync = await op('sync');
  const carta = { ramo: 'main', urlInvio: sync.urlInvio, destinazione: sync.destinazione, commit: testa };
  await assert.rejects(op('push', { corpo: {}, confermata: true, visto: { ...carta, remoto: 'backup' } }), { code: 'GIT_PUSH_CHANGED' });
  const esito = await op('push', { corpo: {}, confermata: true, visto: { ...carta, remoto: 'origin' } });
  assert.deepEqual([esito.ok, esito.remoto], [true, 'origin']);
});

const REGISTRO = { esiste: () => true, async cartellaPerChatFile() { return { ok: true, cartella: 'C:\\x' }; } };
const bancoFinto = (dati) => creaOperazioni({ chiama: async () => ({ stato: 200, dati }), sessionRegistry: REGISTRO, iscriviConRigiocata,
  cartelle: { consentita: async () => true, descrivi: async () => ({}), elenco: async () => [] } });
const stazza = (data) => codifica({ t: 'res', n: 'n-000001', ok: true, data }).length;
const voceDiStato = (i) => ({ percorso: `src/modulo-${i}.js`, percorsoRepo: `src/modulo-${i}.js`, da: null, x: ' ', y: 'M', tipo: 'modificato', staged: false, nonStaged: true, conflitto: false, cartella: false, repoAnnidato: false });

test('GIT-CURE-06 D-29: lo stato ha un tetto, lo dice, e la risposta entra nel filo; i conti restano veri', async () => {
  const voci = Array.from({ length: 20_000 }, (_, i) => voceDiStato(i));
  const stato = { voci, riepilogo: { totale: 20_000 }, impronta: 'i', radiceRepo: 'C:/Users/persona/progetto' };
  assert.throws(() => stazza(stato), { code: 'TOO_LARGE' }, 'la grandezza della prova è quella che chiudeva la connessione');
  const r = await bancoFinto(stato).esegui('session.git.status', { sessionId: 's1' }, contesto);
  assert.equal(r.troncato, true);
  assert.ok(r.voci.length > 0 && r.voci.length < 20_000);
  assert.equal(r.riepilogo.totale, 20_000, 'il totale resta quello vero');
  const { percorsoRepo: _r, ...attesa } = voci[0];
  assert.deepEqual(r.voci[0], attesa);
  assert.ok(stazza(r) <= 600 * 1024);
  const piccolo = await bancoFinto({ voci: voci.slice(0, 3), riepilogo: { totale: 3 } }).esegui('session.git.status', { sessionId: 's1' }, contesto);
  assert.deepEqual([piccolo.voci.length, piccolo.troncato], [3, false], 'sotto il tetto niente si dichiara tagliato');
});

test('GIT-CURE-07 D-29: anche lo stato dentro la risposta di una scrittura ha lo stesso tetto', async () => {
  const voci = Array.from({ length: 20_000 }, (_, i) => voceDiStato(i));
  const r = await bancoFinto({ ok: true, percorsi: ['a'], stato: { voci, riepilogo: { totale: 20_000 } } }).esegui('session.git.stage', { sessionId: 's1', corpo: {} }, contesto);
  assert.equal(r.stato.troncato, true);
  assert.ok(stazza(r) <= 600 * 1024);
});

test('GIT-CURE-08 D-29: il tetto del diff conta i byte sul filo, non UTF-8: i colori di terminale pesano sei volte tanto', async () => {
  const riga = `+${'\u001b[0m'.repeat(20)}\n`;
  const testo = riga.repeat(6_000);
  assert.ok(Buffer.byteLength(testo) <= 512 * 1024, 'in UTF-8 sta dentro il tetto');
  const r = await bancoFinto({ testo, troncato: false, impronta: 'i' }).esegui('session.git.diff', { sessionId: 's1', percorso: 'a.log', area: 'lavoro' }, contesto);
  assert.equal(r.troncato, true);
  assert.ok(stazza(r) <= 600 * 1024);
  assert.ok(r.testo.endsWith('\n'), 'il taglio cade a fine riga');
  const virgolette = `+${'"'.repeat(80)}\n`.repeat(9_000);
  const q = await bancoFinto({ testo: virgolette, troncato: false }).esegui('session.git.changes-diff', { sessionId: 's1', a: 'abc', percorso: 'a.json' }, contesto);
  assert.ok(stazza(q) <= 600 * 1024);
});

test('GIT-CURE-09 D-29: i diff non restano nella memoria delle risposte', () => {
  for (const op of ['file.read', 'session.git.diff', 'session.git.changes-diff']) assert.ok(RISPOSTE_NON_RICORDATE.has(op), op);
  assert.equal(RISPOSTE_NON_RICORDATE.has('session.git.push'), false, 'un\'azione si ricorda: lo stesso n non la rifà');
});

test('GIT-CURE-10 D-30: fermare passa anche dal cancello della rotta, le altre scritture no', async (t) => {
  const { costruisci } = mondo(t);
  const chiuse = { consentita: async () => false, descrivi: async () => ({ nome: 'x' }), elenco: async () => [] };
  const { chiama, operazioni } = costruisci(chiuse);
  const fermaGit = await operazioni.esegui('session.git.fetch-stop', { sessionId: 's1' }, contesto);
  assert.equal(fermaGit.ok, true);
  const fermaRicerca = await operazioni.esegui('session.research.pause', { sessionId: 's1', ricercaId: 'r1' }, contesto);
  assert.ok(fermaRicerca);

  const origineRemota = { tipo: 'telefono', nome: 'Pad', dispositivoId: 'A' };
  for (const percorso of ['/api/v1/sessions/s1/git/fetch', '/api/v1/sessions/s1/git/push', '/api/v1/sessions/s1/git/fetch-stop/altro', '/api/v1/sessions/s1/research/r1/ripresa', '/api/v1/sessions/s1/research/pausa', '/api/v1/sessions/s1/research/pausa/riverifica']) {
    await assert.rejects(chiama({ metodo: 'POST', percorso, corpo: {}, origineRemota }), { code: 'CONSENT_REQUIRED' }, percorso);
  }
});

test('GIT-CURE-11 D-31: il ramo locale ha un altro nome ma segue il principale', async (t) => {
  const { dir, g, op } = mondo(t);
  g(dir, 'branch', '-m', 'main', 'lavoro-mio');
  const sync = await op('sync');
  assert.deepEqual([sync.ramo, sync.ramoPrincipale, sync.suPrincipale], ['lavoro-mio', 'main', true]);
  const { rami } = await op('branches');
  assert.equal(rami.find((r) => r.nome === 'lavoro-mio').principale, true);
});

test('GIT-CURE-12 D-31: su un ramo che segue un altro remoto il principale di origin resta riconosciuto', async (t) => {
  const { base, dir, g, op } = mondo(t);
  const fork = join(base, 'fork.git');
  execFileSync('git', ['init', '-q', '--bare', '-b', 'trunk', fork]);
  g(dir, 'remote', 'add', 'fork', fork);
  g(dir, 'switch', '-q', '-c', 'lavoro'); g(dir, 'push', '-q', '-u', 'fork', 'lavoro');
  const sync = await op('sync');
  assert.equal(sync.ramoPrincipale, null, 'il campo di prima non cambia');
  assert.equal(sync.suPrincipale, false, 'git sa qual è il principale di origin, e non è questo');
  const { rami } = await op('branches');
  assert.equal(rami.find((r) => r.nome === 'main').principale, true);
  assert.equal(Object.hasOwn(rami.find((r) => r.nome === 'lavoro'), 'principale'), false);
});

test('GIT-CURE-13 D-31: se git non lo sa i campi non ci sono, e la carta resta normale', async (t) => {
  const { dir, g, op } = mondo(t);
  g(dir, 'remote', 'set-head', 'origin', '--delete');
  const sync = await op('sync');
  assert.equal(sync.ramoPrincipale, null);
  assert.equal(Object.hasOwn(sync, 'suPrincipale'), false);
  for (const riga of (await op('branches')).rami) assert.equal(Object.hasOwn(riga, 'principale'), false, riga.nome);
});

test('GIT-CURE-14 D-32: il testo della persona non si riscrive, in nessuna voce che lo riporta', async (t) => {
  const { dir, g, op } = mondo(t);
  const messaggio = 'fix: il file C:/Users/Mario/x/y.txt non si apriva';
  writeFileSync(join(dir, 'f.txt'), 'x\n'); g(dir, 'add', 'f.txt'); g(dir, 'commit', '-q', '-m', messaggio);
  const log = await op('log');
  assert.equal(log.commit[0].soggetto, messaggio);
  assert.equal(log.ultimoMessaggio, messaggio);
  const annullato = await op('undo-commit', { corpo: { commit: log.testa }, confermata: true });
  assert.equal(annullato.messaggio, messaggio, 'è il testo che la casella rimette: tornerebbe nel commit riscritto');
  await op('stash', { corpo: { messaggio } });
  assert.match((await op('stashes')).accantonati[0].messaggio, /C:\/Users\/Mario\/x\/y\.txt/u);
});
