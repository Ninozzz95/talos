import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

import { contestoDelDispositivo, mondoPonteGit } from './aiuto/mondo-ponte-git.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';
import { esitoAnnullaPerIlDispositivo } from '../src/remoto/lista-bianca.mjs';
import { OPERAZIONI_HTTP } from '../src/remoto/operazioni.mjs';

import { iscriviConRigiocata } from '../src/iscrizione-sessione.mjs';
import { creaOperazioni } from '../src/remoto/operazioni.mjs';

/*
 * Il cancello delle voci del contratto (`CONTRATTO-LISTA-BIANCA-PONTE-2026-10-31.md`, §7; punti 2, 12 e 13 della revisione del Mobile al blocco 15): repository e rotte veri.
 */
const preparaSegreta = ({ dir, g }) => {
  mkdirSync(join(dir, 'segreta'), { recursive: true });
  writeFileSync(join(dir, 'segreta', 'nota.txt'), 'riservata\n'); g(dir, 'add', '.'); g(dir, 'commit', '-q', '-m', 'segreta');
  writeFileSync(join(dir, 'segreta', 'nota.txt'), 'CONTENUTO BLOCCATO\n');
  writeFileSync(join(dir, 'a.txt'), 'uno cambiato\n');
};

test('BLOCCHI-01 punto 2: una sottocartella bloccata non si vede e non si tocca da Git', async (t) => {
  const m = mondoPonteGit(t);
  preparaSegreta(m);
  const { dir, op, stato } = m;
  stato.bloccate = [join(dir, 'segreta')];
  const status = await op('status');
  assert.deepEqual(status.voci.map((v) => v.percorso), ['a.txt']);
  assert.equal(status.bloccati, 1);
  assert.equal(status.riepilogo.totale, 2, 'il conto resta vero');
  const atteso = { code: 'FOLDER_BLOCKED', stato: 409, reason: 'folder-blocked' };
  await assert.rejects(op('diff', { percorso: 'segreta/nota.txt', area: 'lavoro' }), atteso);
  await assert.rejects(op('discard', { corpo: { percorsi: ['a.txt', 'segreta/nota.txt'] }, confermata: true }), atteso);
  await assert.rejects(op('stage', { corpo: { percorsi: ['segreta/nota.txt'] } }), atteso);
  await assert.rejects(op('commit', { corpo: { percorsi: ['segreta/nota.txt'], messaggio: 'x' } }), atteso);
  await assert.rejects(op('stash', { corpo: {} }), atteso, 'una scrittura senza percorsi tocca anche la cartella bloccata');
  await assert.rejects(op('commit-message', { corpo: {} }), atteso, 'il preparato andrebbe a un modello');
  await assert.rejects(op('switch', { corpo: { ramo: 'main' } }), atteso);
  assert.equal(readFileSync(join(dir, 'segreta', 'nota.txt'), 'utf8'), 'CONTENUTO BLOCCATO\n');
  const preparato = await op('stage', { corpo: { percorsi: ['a.txt'] } });
  assert.deepEqual(preparato.stato.voci.map((v) => v.percorso), ['a.txt'], 'anche lo stato di ritorno');
  assert.equal((await op('diff', { percorso: 'a.txt', area: 'preparato' })).percorso, 'a.txt');
});

test('BLOCCHI-02 punto 2: anche il rinominato che viene da una cartella bloccata resta fuori, e nei cambiamenti di un commit', async (t) => {
  const m = mondoPonteGit(t);
  preparaSegreta(m);
  const { dir, g, op, stato } = m;
  g(dir, 'checkout', '--', '.');
  g(dir, 'mv', 'segreta/nota.txt', 'b.txt');
  stato.bloccate = [join(dir, 'segreta')];
  assert.deepEqual((await op('status')).voci.map((v) => v.percorso), []);
  g(dir, 'commit', '-q', '-m', 'spostata');
  const { testa } = await op('log');
  const cambiati = await op('changes', { a: testa });
  assert.deepEqual(cambiati.file, []);
  assert.equal(cambiati.bloccati, 1);
  await assert.rejects(op('changes-diff', { a: testa, percorso: 'b.txt', prima: 'segreta/nota.txt' }), { code: 'FOLDER_BLOCKED' });
});

test('BLOCCHI-03 se i blocchi non si leggono si nega', async (t) => {
  const { chiama, sessionRegistry } = mondoPonteGit(t);
  const cartelle = { consentita: async () => true, descrivi: async () => ({}), elenco: async () => [] };
  const operazioni = creaOperazioni({ chiama, sessionRegistry, iscriviConRigiocata, cartelle, bloccateDi: async () => { throw new Error('C:\\Users\\Anna\\illeggibile'); } });
  await assert.rejects(operazioni.esegui('session.git.status', { sessionId: 's1' }, contestoDelDispositivo()), (e) => e.code === 'FOLDER_BLOCKED' && !/Anna/u.test(e.message));
});

test('BLOCCHI-04 punto 12: da una sottocartella le operazioni sul repository vogliono il consenso sulla radice', async (t) => {
  const { cartella, dir, g, op, stato } = mondoPonteGit(t, { sotto: 'sub' });
  stato.consentite = [cartella];
  writeFileSync(join(dir, 'altra', 'fuori.txt'), 'lavoro\n'); g(dir, 'stash', 'push', '-q', '-m', 'dal PC', '--', 'altra/fuori.txt');
  g(dir, 'switch', '-q', '-c', 'feat');
  writeFileSync(join(dir, 'altra', 'fuori.txt'), 'su feat\n'); g(dir, 'add', 'altra/fuori.txt'); g(dir, 'commit', '-q', '-m', 'su feat');
  const radice = { code: 'CONSENT_REQUIRED', stato: 403, reason: 'repo-consent-required', params: { cartellaId: 'id-A', nome: 'A' } };
  const { testa } = await op('log');
  await assert.rejects(op('switch', { corpo: { ramo: 'main' } }), radice);
  assert.equal(readFileSync(join(dir, 'altra', 'fuori.txt'), 'utf8').replaceAll('\r\n', '\n'), 'su feat\n', 'il file fuori dal consenso resta');
  const [voce] = (await op('stashes')).accantonati;
  for (const [nome, args] of [['pull', { corpo: {}, confermata: true }], ['fetch', { corpo: {} }], ['branch-create', { corpo: { ramo: 'x' } }], ['branch-rename', { corpo: { da: 'feat', a: 'y' } }],
    ['branch-delete', { corpo: { ramo: 'main' }, confermata: true }], ['amend', { corpo: { commit: testa, messaggio: 'x' }, confermata: true }], ['undo-commit', { corpo: { commit: testa }, confermata: true }],
    ['stash-pop', { corpo: { indice: voce.indice, commit: voce.commit } }], ['stash-drop', { corpo: { indice: voce.indice, commit: voce.commit }, confermata: true }],
    ['push', { corpo: {}, confermata: true, visto: { ramo: 'feat', remoto: 'origin', urlInvio: 'u', destinazione: 'feat', commit: testa } }]]) {
    await assert.rejects(op(nome, args), radice, nome);
  }
  writeFileSync(join(dir, 'sub', 's.txt'), 'nella cartella\n');
  assert.equal((await op('stage', { corpo: { percorsi: ['s.txt'] } })).ok, true, 'dentro la cartella consentita si lavora');
  stato.consentite = [cartella, dir];
  assert.equal((await op('switch', { corpo: { ramo: 'main' } })).ramo, 'main', 'col consenso sulla radice si passa');
});

test('BLOCCHI-05 un commit del preparato con file fuori dalla cartella si rifiuta subito: nessuna carta che non può aiutare', async (t) => {
  const { cartella, dir, g, op, stato } = mondoPonteGit(t, { sotto: 'sub' });
  stato.consentite = [cartella];
  writeFileSync(join(dir, 'altra', 'fuori.txt'), 'x\n'); g(dir, 'add', 'altra/fuori.txt');
  writeFileSync(join(dir, 'sub', 's.txt'), 'y\n'); g(dir, 'add', 'sub/s.txt');
  const { impronta, preparatiFuori } = await op('status');
  assert.equal(preparatiFuori, 1);
  await assert.rejects(op('commit-staged', { corpo: { messaggio: 'x', impronta } }), { code: 'GIT_STAGED_OUTSIDE' }, 'il servizio non fa quel commit: un consenso sulla radice non cambierebbe niente');
  g(dir, 'restore', '--staged', 'altra/fuori.txt');
  stato.consentite = [cartella];
  const pulito = await op('status');
  assert.equal(pulito.preparatiFuori, 0);
  assert.equal((await op('commit-staged', { corpo: { messaggio: 'x', impronta: pulito.impronta } })).ok, true, 'senza niente fuori basta la cartella');
});

test('BLOCCHI-09 annulla e rifai non portano percorsi assoluti né il testo del PC', () => {
  const annullo = esitoAnnullaPerIlDispositivo({ ok: true, ripristinati: ['a.txt'], nonTolti: ['b.txt'], saltati: ['c.txt'], durante: ['d.txt'], fuori: ['C:/Users/Anna Maria/x.txt', '/home/a/y'] });
  assert.deepEqual(annullo, { ok: true, ripristinati: ['a.txt'], nonTolti: ['b.txt'], saltati: ['c.txt'], durante: ['d.txt'], fuori: ['', ''] });
  assert.deepEqual(esitoAnnullaPerIlDispositivo({ ok: true, rifatti: ['a.txt'], saltati: [], nonTolti: [] }), { ok: true, rifatti: ['a.txt'], saltati: [], nonTolti: [] });
  assert.deepEqual(esitoAnnullaPerIlDispositivo({ ok: false, motivo: 'git', dettaglio: 'fatal: C:/Users/Anna Maria/x.txt' }), { ok: false, motivo: 'git' });
  assert.deepEqual(esitoAnnullaPerIlDispositivo({ ok: true, ripristinati: ['C:/x.txt', 'a.txt'] }).ripristinati, ['a.txt'], 'un percorso assoluto non è mai relativo');
  assert.equal(OPERAZIONI_HTTP['session.undo'].filtra, esitoAnnullaPerIlDispositivo);
  assert.equal(OPERAZIONI_HTTP['session.undo.redo'].filtra, esitoAnnullaPerIlDispositivo);
});

test('BLOCCHI-06 punto 13: se la cartella non si risolve il diff si chiude, come stage', async (t) => {
  const { op, sessionRegistry } = mondoPonteGit(t);
  sessionRegistry.cartellaPerChatFile = async () => ({ erroreAvvio: 'x', code: 'SESSION_NOT_READY' });
  sessionRegistry.cartellaDi = () => null;
  await assert.rejects(op('diff', { percorso: 'a.txt', area: 'lavoro' }), { code: 'CONSENT_REQUIRED', stato: 403 });
  await assert.rejects(op('stage', { corpo: { percorsi: ['a.txt'] } }), { code: 'CONSENT_REQUIRED', stato: 403 });
});

test('BLOCCHI-07 Accesso pieno: per Git conta la cartella dove git gira, non quella della conversazione', async (t) => {
  const { base, dir, op, sessionRegistry, stato } = mondoPonteGit(t);
  sessionRegistry.cartellaPerChatFile = async () => ({ ok: true, cartella: join(base, 'conversazione') });
  stato.consentite = [join(base, 'conversazione')];
  writeFileSync(join(dir, 'a.txt'), 'x\n');
  await assert.rejects(op('diff', { percorso: 'a.txt', area: 'lavoro' }), { code: 'CONSENT_REQUIRED' });
  stato.consentite = [join(base, 'conversazione'), dir];
  assert.equal((await op('diff', { percorso: 'a.txt', area: 'lavoro' })).percorso, 'a.txt');
});

test('BLOCCHI-08 correzione 4: con la cartella bloccata la Libreria non si elenca; punto: l\'anteprima di annulla è contenuto', async (t) => {
  const m = mondoPonteGit(t);
  const { sessionRegistry } = m;
  const risposte = { '/api/v1/sessions/s1/library': { voci: [{ id: 'v', nome: 'n', cartella: 'C:\\x', percorso: 'C:\\x\\y' }], errore: null }, '/api/v1/sessions/s1/library/v/versions': { versioni: [{ n: 1, creataIl: 'x', altro: 'C:\\y' }], totale: 1 },
    '/api/v1/sessions/s1/file-undo/3': { ok: true, turno: 3, commit: 'c', alle: 'a', ripristina: [{ stato: 'M', percorso: 'a.txt' }], salta: [{ stato: 'M', percorso: 'b.txt', motivo: 'persona' }], fuori: ['C:\\Users\\Anna\\x', '/home/y'], troppoGrandi: ['g.bin'], diff: 'testo', troncato: false, dettaglio: 'C:\\z' } };
  const stato = { bloccati: [], consentite: true };
  const operazioni = creaOperazioni({ chiama: async (c) => ({ stato: 200, dati: risposte[c.percorso] }), sessionRegistry, iscriviConRigiocata,
    cartelle: { consentita: async () => stato.consentite, descrivi: async () => ({ nome: 'p' }), elenco: async () => [] }, bloccateDi: async () => stato.bloccati });
  const c = contestoDelDispositivo();
  const voce = { sessionId: 's1', voceId: 'v' };
  assert.deepEqual((await operazioni.esegui('session.library.list', { sessionId: 's1' }, c)).voci, [{ id: 'v', nome: 'n' }]);
  assert.deepEqual((await operazioni.esegui('session.library.versions', voce, c)).versioni, [{ n: 1, creataIl: 'x' }]);
  const anteprima = await operazioni.esegui('session.undo.preview', { sessionId: 's1', turn: 3 }, c);
  assert.deepEqual(anteprima.fuori, ['', ''], 'la scheda ne usa il numero');
  assert.equal(anteprima.diff, 'testo');
  assert.equal(Object.hasOwn(anteprima, 'dettaglio'), false);
  stato.consentite = false;
  await assert.rejects(operazioni.esegui('session.undo.preview', { sessionId: 's1', turn: 3 }, c), { code: 'CONSENT_REQUIRED' });
  assert.equal((await operazioni.esegui('session.library.list', { sessionId: 's1' }, c)).errore, null, 'l\'elenco resta libero');
  stato.consentite = true;
  stato.bloccati = [m.cartella];
  for (const [op, args] of [['session.library.list', { sessionId: 's1' }], ['session.library.versions', voce], ['session.undo.preview', { sessionId: 's1', turn: 3 }]]) {
    await assert.rejects(operazioni.esegui(op, args, c), { code: 'FOLDER_BLOCKED' }, op);
  }
  stato.bloccati = [join(m.cartella, 'sotto')];
  await assert.rejects(operazioni.esegui('session.undo.preview', { sessionId: 's1', turn: 3 }, c), { code: 'FOLDER_BLOCKED' }, 'il diff è uno solo: un blocco dentro lo chiude');
  assert.equal((await operazioni.esegui('session.library.list', { sessionId: 's1' }, c)).errore, null, 'un blocco più in giù non tocca la Libreria');
});

/* Revisione 3 del Mobile: un blocco dentro la cartella madre. `sopra` è tracciata, `sopra/segreta` è bloccata */
const preparaMadre = ({ dir, g, stato }) => {
  mkdirSync(join(dir, 'sopra', 'segreta'), { recursive: true });
  writeFileSync(join(dir, 'sopra', 'segreta', 'chiavi.txt'), 'vecchia\n'); writeFileSync(join(dir, 'sopra', 'libero.txt'), 'libero\n');
  g(dir, 'add', '.'); g(dir, 'commit', '-q', '-m', 'due');
  const primo = g(dir, 'rev-parse', 'HEAD').trim();
  writeFileSync(join(dir, 'sopra', 'segreta', 'chiavi.txt'), 'CHIAVE-NEL-COMMIT\n');
  g(dir, 'add', '.'); g(dir, 'commit', '-q', '-m', 'tre');
  const secondo = g(dir, 'rev-parse', 'HEAD').trim();
  writeFileSync(join(dir, 'sopra', 'segreta', 'chiavi.txt'), 'LAVORO-SEGRETO\n');
  stato.bloccate = [join(dir, 'sopra', 'segreta')];
  return { primo, secondo };
};
const BLOCCATO = { code: 'FOLDER_BLOCKED', stato: 409, reason: 'folder-blocked' };
const VARIANTI_DELLA_MADRE = ['sopra', 'sopra/', 'sopra\\', './sopra', 'sopra//', '.', './', '', ...(process.platform === 'win32' ? ['SOPRA', 'Sopra/'] : [])];

test('BLOCCHI-10 A1: il diff di una cartella che contiene un blocco non esce, in nessuna scrittura del percorso', async (t) => {
  const m = mondoPonteGit(t);
  const { primo, secondo } = preparaMadre(m);
  for (const percorso of VARIANTI_DELLA_MADRE) {
    await assert.rejects(m.op('changes-diff', { da: primo, a: secondo, percorso }), BLOCCATO, JSON.stringify(percorso));
    await assert.rejects(m.op('diff', { percorso, area: 'lavoro' }), BLOCCATO, JSON.stringify(percorso));
  }
  await assert.rejects(m.op('changes-diff', { da: primo, a: secondo, percorso: 'sopra/libero.txt', prima: 'sopra' }), BLOCCATO, 'anche `prima`');
  writeFileSync(join(m.dir, 'sopra', 'libero.txt'), 'cambiato\n');
  assert.equal((await m.op('diff', { percorso: 'sopra/libero.txt', area: 'lavoro' })).percorso, 'sopra/libero.txt', 'un file accanto al blocco non lo contiene');
});

test('BLOCCHI-11 A2: nessuna scrittura tocca una cartella che contiene un blocco', async (t) => {
  const m = mondoPonteGit(t);
  preparaMadre(m);
  const { dir, g, op } = m;
  for (const p of VARIANTI_DELLA_MADRE) {
    await assert.rejects(op('stage', { corpo: { percorsi: [p] } }), BLOCCATO, `stage ${JSON.stringify(p)}`);
    await assert.rejects(op('unstage', { corpo: { percorsi: ['a.txt', p] } }), BLOCCATO, `unstage ${JSON.stringify(p)}`);
    await assert.rejects(op('commit', { corpo: { percorsi: [p], messaggio: 'x' } }), BLOCCATO, `commit ${JSON.stringify(p)}`);
    await assert.rejects(op('discard', { corpo: { percorsi: [p] }, confermata: true }), BLOCCATO, `discard ${JSON.stringify(p)}`);
    await assert.rejects(op('hunk', { corpo: { percorso: p, area: 'lavoro', indice: 0, impronta: 'x', azione: 'prepara' } }), BLOCCATO, `hunk ${JSON.stringify(p)}`);
  }
  assert.equal(g(dir, 'diff', '--cached', '--name-only').trim(), '', 'niente è stato preparato');
  assert.equal(readFileSync(join(dir, 'sopra', 'segreta', 'chiavi.txt'), 'utf8'), 'LAVORO-SEGRETO\n');
});

test('BLOCCHI-12 A2: la cartella madre nuova, che git riassume in una riga, non si cancella col file bloccato dentro', async (t) => {
  const { dir, op, stato } = mondoPonteGit(t);
  mkdirSync(join(dir, 'nuova', 'segreta'), { recursive: true });
  writeFileSync(join(dir, 'nuova', 'segreta', 'chiavi.txt'), 'NON TRACCIATO\n');
  stato.bloccate = [join(dir, 'nuova', 'segreta')];
  assert.deepEqual((await op('status')).voci.map((v) => v.percorso), ['nuova/']);
  await assert.rejects(op('discard', { corpo: { percorsi: ['nuova/'] }, confermata: true }), BLOCCATO);
  assert.equal(readFileSync(join(dir, 'nuova', 'segreta', 'chiavi.txt'), 'utf8'), 'NON TRACCIATO\n');
});

test('BLOCCHI-13 A1: il blocco dentro si vede anche attraverso una giunzione verso la madre', { skip: process.platform !== 'win32' }, async (t) => {
  const m = mondoPonteGit(t);
  preparaMadre(m);
  const { dir, op } = m;
  execFileSync('cmd', ['/c', 'mklink', '/J', join(dir, 'varco'), join(dir, 'sopra')], { stdio: 'ignore' });
  await assert.rejects(op('discard', { corpo: { percorsi: ['varco'] }, confermata: true }), BLOCCATO, 'giunzione');
  await assert.rejects(op('stage', { corpo: { percorsi: ['varco/segreta/chiavi.txt'] } }), BLOCCATO, 'giunzione, sotto');
  assert.equal(readFileSync(join(dir, 'sopra', 'segreta', 'chiavi.txt'), 'utf8'), 'LAVORO-SEGRETO\n');
});

test('BLOCCHI-14 A3: annulla e rifai non partono se un blocco sta dentro la cartella', async (t) => {
  const chiamate = [];
  const registro = { async puntiDiRipristinoDi() { return { ok: true }; },
    async anteprimaAnnulla() { chiamate.push('anteprima'); return { ok: true, diff: 'SEGRETO' }; },
    async annullaModifiche() { chiamate.push('annulla'); return { ok: true, ripristinati: ['sopra/segreta/k.txt'] }; },
    async rifaiAnnullamento() { chiamate.push('rifai'); return { ok: true, rifatti: ['sopra/segreta/k.txt'] }; } };
  const m = mondoPonteGit(t, { registro });
  const { contesto, dir, operazioni, stato } = m;
  const ogni = [['session.undo.preview', { turn: 1 }], ['session.undo', { turn: 1, corpo: {} }], ['session.undo.redo', {}]];
  stato.bloccate = [join(dir, 'sopra', 'segreta')];
  for (const [op, args] of ogni) await assert.rejects(operazioni.esegui(op, { sessionId: 's1', ...args }, contesto), BLOCCATO, op);
  assert.deepEqual(chiamate, [], 'nessuna scrittura è partita');
  stato.bloccate = [dir];
  for (const [op, args] of ogni) await assert.rejects(operazioni.esegui(op, { sessionId: 's1', ...args }, contesto), BLOCCATO, `${op}: la cartella stessa`);
  stato.bloccate = [join(m.base, 'altrove')];
  for (const [op, args] of ogni) await operazioni.esegui(op, { sessionId: 's1', ...args }, contesto);
  assert.deepEqual(chiamate, ['anteprima', 'annulla', 'rifai'], 'un blocco altrove non ferma niente');
});

test('BLOCCHI-15 M1: il blocco si guarda prima del consenso', async (t) => {
  const m = mondoPonteGit(t, { registro: { async anteprimaAnnulla() { return { ok: true, diff: 'x' }; } } });
  const { contesto, dir, g, op, operazioni, stato } = m;
  stato.bloccate = [dir];
  for (const [nome, args] of [['diff', { percorso: 'a.txt', area: 'lavoro' }], ['changes-diff', { a: 'a'.repeat(40), percorso: 'a.txt' }], ['stage', { corpo: { percorsi: ['a.txt'] } }], ['stash', { corpo: {} }], ['switch', { corpo: { ramo: 'x' } }], ['commit-message', { corpo: {} }]]) {
    await assert.rejects(op(nome, args), BLOCCATO, nome);
  }
  await assert.rejects(operazioni.esegui('session.undo.preview', { sessionId: 's1', turn: 1 }, contesto), BLOCCATO);
  await assert.rejects(operazioni.esegui('session.library.rename', { sessionId: 's1', voceId: 'v', corpo: { nome: 'x' } }, contesto), BLOCCATO);
  stato.bloccate = [];
  stato.consentite = [];
  await assert.rejects(op('diff', { percorso: 'a.txt', area: 'lavoro' }), { code: 'CONSENT_REQUIRED', stato: 403 }, 'senza blocco resta il consenso');
  mkdirSync(join(dir, 'sub2'));
  writeFileSync(join(dir, 'sub2', 'x.txt'), 'x\n'); g(dir, 'add', '.'); g(dir, 'commit', '-q', '-m', 'sub2');
  stato.bloccate = [join(dir, 'sub2')];
  await assert.rejects(op('stage', { corpo: { percorsi: ['sub2/x.txt'] } }), BLOCCATO, 'un percorso bloccato senza consenso');
});

test('BLOCCHI-16 M1: dalla sottocartella un blocco nella radice viene prima del consenso sulla radice', async (t) => {
  const { dir, op, stato } = mondoPonteGit(t, { sotto: 'sub' });
  stato.consentite = [join(dir, 'sub')];
  stato.bloccate = [join(dir, 'altra')];
  await assert.rejects(op('switch', { corpo: { ramo: 'x' } }), BLOCCATO);
  stato.bloccate = [];
  await assert.rejects(op('switch', { corpo: { ramo: 'x' } }), { code: 'CONSENT_REQUIRED', reason: 'repo-consent-required' });
});

test('BLOCCHI-17 B5: la forma si giudica prima del consenso', async (t) => {
  const { op, stato } = mondoPonteGit(t);
  stato.consentite = [];
  const pezzo = { percorso: 'a.txt', area: 'lavoro', indice: 0, impronta: 'x' };
  await assert.rejects(op('hunk', { corpo: { ...pezzo, azione: ['annulla'] } }), { code: 'BAD_MESSAGE', stato: 400 });
  await assert.rejects(op('hunk', { corpo: 'testo' }), { code: 'BAD_MESSAGE', stato: 400 });
  await assert.rejects(op('push', { corpo: {}, confermata: true }), { code: 'BAD_MESSAGE', stato: 400 }, 'senza visto');
  await assert.rejects(op('stage', { corpo: [] }), { code: 'BAD_MESSAGE', stato: 400 });
  await assert.rejects(op('hunk', { corpo: { ...pezzo, azione: 'prepara' } }), { code: 'CONSENT_REQUIRED' }, 'la forma giusta arriva al consenso');
  await assert.rejects(op('push', { corpo: {} }), { code: 'CONSENT_REQUIRED' }, 'senza carta il visto non si guarda ancora');
});

test('BLOCCHI-18 B6: fermare resta possibile anche con i blocchi illeggibili', async (t) => {
  const { chiama, sessionRegistry } = mondoPonteGit(t);
  const cartelle = { consentita: async () => true, descrivi: async () => ({}), elenco: async () => [] };
  const operazioni = creaOperazioni({ chiama, sessionRegistry, iscriviConRigiocata, cartelle, bloccateDi: async () => { throw new Error('giù'); } });
  assert.equal((await operazioni.esegui('session.git.fetch-stop', { sessionId: 's1' }, contestoDelDispositivo())).ok, true);
  await assert.rejects(operazioni.esegui('session.git.stage', { sessionId: 's1', corpo: { percorsi: ['a.txt'] } }, contestoDelDispositivo()), BLOCCATO, 'il resto si nega');
});

test('BLOCCHI-19 B7: il rifiuto della rotta in Accesso pieno dice quale cartella chiedere', async (t) => {
  const { base, dir, op, sessionRegistry, stato } = mondoPonteGit(t);
  sessionRegistry.cartellaPerChatFile = async () => ({ ok: true, cartella: join(base, 'conversazione') });
  stato.consentite = [dir];
  writeFileSync(join(dir, 'a.txt'), 'x\n');
  await assert.rejects(op('stage', { corpo: { percorsi: ['a.txt'] } }), (e) => e.code === 'CONSENT_REQUIRED' && e.stato === 403 && e.reason === 'consent-required' && e.params?.nome === 'conversazione' && e.params?.cartellaId === 'id-conversazione');
});

test('BLOCCHI-20 un guasto nel leggere la radice non nasconde la carta del consenso', async (t) => {
  const { base, op, sessionRegistry, stato } = mondoPonteGit(t);
  const vuota = join(base, 'vuota');
  mkdirSync(vuota);
  sessionRegistry.cartellaDi = () => vuota;
  sessionRegistry.cartellaPerChatFile = async () => ({ ok: true, cartella: vuota });
  stato.bloccate = [join(base, 'altrove')];
  stato.consentite = [];
  await assert.rejects(op('switch', { corpo: { ramo: 'x' } }), { code: 'CONSENT_REQUIRED' });
  stato.consentite = [vuota];
  await assert.rejects(op('switch', { corpo: { ramo: 'x' } }), { code: 'GIT_NOT_A_REPOSITORY' });
});

test('BLOCCHI-21 B6: la pausa di una ricerca non guarda i blocchi', async (t) => {
  const { chiama, sessionRegistry } = mondoPonteGit(t, { registro: { async mettiInPausaRicerca() { return { ok: true, ricerca: { id: 'r1', stato: 'paused' }, errore: null }; } } });
  const cartelle = { consentita: async () => false, descrivi: async () => ({}), elenco: async () => [] };
  const operazioni = creaOperazioni({ chiama: async (c) => (c.percorso.endsWith('/pausa') ? { stato: 200, dati: { ricerca: { id: 'r1', stato: 'paused' }, errore: null } } : chiama(c)), sessionRegistry, iscriviConRigiocata, cartelle, bloccateDi: async () => { throw new Error('giù'); } });
  assert.equal((await operazioni.esegui('session.research.pause', { sessionId: 's1', ricercaId: 'r1' }, contestoDelDispositivo())).ricerca.stato, 'paused');
});

/* Revisione delle cure 3 del Mobile. `bloccataDa` toglie gli spazi dai bordi, git no */
const TESTA_DEL_NOME = [[' ', 'spazio'], ['\u00a0', 'spazio duro']];
const preparaNomeEsatto = ({ dir, g, stato }, testa) => {
  const madre = `${testa}sopra`;
  const blocco = join(dir, madre, 'segreta');
  mkdirSync(blocco, { recursive: true });
  writeFileSync(join(blocco, 'k.txt'), 'vecchia\n'); g(dir, 'add', '.'); g(dir, 'commit', '-q', '-m', 'due');
  const primo = g(dir, 'rev-parse', 'HEAD').trim();
  writeFileSync(join(blocco, 'k.txt'), 'NEL-COMMIT\n'); g(dir, 'add', '.'); g(dir, 'commit', '-q', '-m', 'tre');
  const secondo = g(dir, 'rev-parse', 'HEAD').trim();
  writeFileSync(join(blocco, 'k.txt'), 'LAVORO\n');
  stato.bloccate = [blocco];
  return { blocco, madre, file: `${madre}/segreta/k.txt`, primo, secondo };
};

for (const [testa, nome] of TESTA_DEL_NOME) {
  test(`BLOCCHI-22 N1: il blocco vale sul nome esatto di git, ${nome} in testa`, async (t) => {
    const m = mondoPonteGit(t);
    const { blocco, file, madre, primo, secondo } = preparaNomeEsatto(m, testa);
    const { dir, g, op } = m;
    const stato = await op('status');
    assert.deepEqual(stato.voci, []);
    assert.equal(stato.bloccati, 1);
    const cambiati = await op('changes', { da: primo, a: secondo });
    assert.deepEqual(cambiati.file, []);
    assert.equal(cambiati.bloccati, 1);
    for (const percorso of [file, madre, `${madre}/segreta`]) {
      await assert.rejects(op('changes-diff', { da: primo, a: secondo, percorso }), BLOCCATO, `changes-diff ${JSON.stringify(percorso)}`);
      await assert.rejects(op('diff', { percorso, area: 'lavoro' }), BLOCCATO, `diff ${JSON.stringify(percorso)}`);
      await assert.rejects(op('stage', { corpo: { percorsi: [percorso] } }), BLOCCATO, `stage ${JSON.stringify(percorso)}`);
      await assert.rejects(op('unstage', { corpo: { percorsi: [percorso] } }), BLOCCATO);
      await assert.rejects(op('commit', { corpo: { percorsi: [percorso], messaggio: 'dal telefono' } }), BLOCCATO);
      await assert.rejects(op('discard', { corpo: { percorsi: [percorso] }, confermata: true }), BLOCCATO);
      await assert.rejects(op('hunk', { corpo: { percorso, area: 'lavoro', indice: 0, impronta: 'x', azione: 'prepara' } }), BLOCCATO);
    }
    assert.equal(readFileSync(join(blocco, 'k.txt'), 'utf8'), 'LAVORO\n');
    assert.equal(g(dir, 'log', '-1', '--format=%s').trim(), 'tre');
  });
}

test('BLOCCHI-23 N1, al contrario: ` sopra` non è `sopra`', async (t) => {
  const m = mondoPonteGit(t);
  preparaMadre(m);
  const { dir, g, op } = m;
  g(dir, 'checkout', '--', 'sopra');
  mkdirSync(join(dir, ' sopra', 'segreta'), { recursive: true });
  writeFileSync(join(dir, ' sopra', 'segreta', 'k.txt'), 'libero\n'); g(dir, 'add', '.'); g(dir, 'commit', '-q', '-m', 'accanto');
  writeFileSync(join(dir, ' sopra', 'segreta', 'k.txt'), 'libero cambiato\n');
  assert.deepEqual((await op('status')).voci.map((v) => v.percorso), [' sopra/segreta/k.txt']);
  assert.match((await op('diff', { percorso: ' sopra/segreta/k.txt', area: 'lavoro' })).testo, /libero cambiato/u);
});

test('BLOCCHI-24 N1: su Windows punti e spazi in coda sono lo stesso nome, e il blocco resta', { skip: process.platform !== 'win32' }, async (t) => {
  const m = mondoPonteGit(t);
  const { primo, secondo } = preparaMadre(m);
  const { dir, g, op } = m;
  for (const percorso of ['sopra ', 'sopra.', 'sopra. ', 'sopra./', 'sopra./segreta', 'sopra/segreta./chiavi.txt', 'sopra/segreta /chiavi.txt', 'sopra./segreta/chiavi.txt']) {
    await assert.rejects(op('changes-diff', { da: primo, a: secondo, percorso }), BLOCCATO, JSON.stringify(percorso));
    await assert.rejects(op('unstage', { corpo: { percorsi: [percorso] } }), BLOCCATO, JSON.stringify(percorso));
  }
  writeFileSync(join(dir, 'sopra', 'segreta.txt'), 'accanto\n'); writeFileSync(join(dir, 'sopra', 'a..b'), 'accanto\n');
  g(dir, 'add', 'sopra/segreta.txt', 'sopra/a..b');
  assert.equal((await op('diff', { percorso: 'sopra/segreta.txt', area: 'preparato' })).percorso, 'sopra/segreta.txt', 'un nome che comincia uguale non è il blocco');
  assert.equal((await op('diff', { percorso: 'sopra/a..b', area: 'preparato' })).percorso, 'sopra/a..b', 'i punti in mezzo restano');
});

test('BLOCCHI-25 N3: la cartella madre sparita dal disco resta riconoscibile dietro una giunzione', { skip: process.platform !== 'win32' }, async (t) => {
  const m = mondoPonteGit(t);
  const { primo, secondo } = preparaMadre(m);
  const { base, dir, op, sessionRegistry } = m;
  const alias = join(base, 'alias');
  execFileSync('cmd', ['/c', 'mklink', '/J', alias, dir], { stdio: 'ignore' });
  sessionRegistry.cartellaDi = () => alias;
  sessionRegistry.cartellaPerChatFile = async () => ({ ok: true, cartella: alias });
  rimuoviCartellaDiProva(join(dir, 'sopra'));
  await assert.rejects(op('changes-diff', { da: primo, a: secondo, percorso: 'sopra' }), BLOCCATO);
  await assert.rejects(op('changes-diff', { da: primo, a: secondo, percorso: 'sopra/segreta/chiavi.txt' }), BLOCCATO);
});

test('BLOCCHI-26 N11: il nome nuovo di una rinomina uscita da un blocco vale come quello vecchio', async (t) => {
  const m = mondoPonteGit(t);
  preparaSegreta(m);
  const { dir, g, op, stato } = m;
  g(dir, 'checkout', '--', '.');
  mkdirSync(join(dir, 'nuova'));
  g(dir, 'mv', 'segreta/nota.txt', 'nuova/b.txt');
  stato.bloccate = [join(dir, 'segreta')];
  for (const percorso of ['nuova/b.txt', 'nuova', './nuova/b.txt']) {
    await assert.rejects(op('diff', { percorso, area: 'preparato' }), BLOCCATO, JSON.stringify(percorso));
    await assert.rejects(op('unstage', { corpo: { percorsi: [percorso] } }), BLOCCATO);
    await assert.rejects(op('stage', { corpo: { percorsi: [percorso] } }), BLOCCATO);
    await assert.rejects(op('commit', { corpo: { percorsi: [percorso], messaggio: 'x' } }), BLOCCATO);
    await assert.rejects(op('discard', { corpo: { percorsi: [percorso] }, confermata: true }), BLOCCATO);
    await assert.rejects(op('hunk', { corpo: { percorso, area: 'preparato', indice: 0, impronta: 'x', azione: 'togli' } }), BLOCCATO);
  }
  g(dir, 'commit', '-q', '-m', 'spostata');
  const { testa } = await op('log');
  for (const percorso of ['nuova/b.txt', 'nuova']) await assert.rejects(op('changes-diff', { a: testa, percorso }), BLOCCATO, JSON.stringify(percorso));
  writeFileSync(join(dir, 'a.txt'), 'uno cambiato\n');
  assert.equal((await op('diff', { percorso: 'a.txt', area: 'lavoro' })).percorso, 'a.txt', 'il resto si legge');
  await op('changes', { a: testa });
});

test('BLOCCHI-27 N11, al contrario: una rinomina che non viene da un blocco resta libera', async (t) => {
  const m = mondoPonteGit(t);
  preparaSegreta(m);
  const { dir, g, op, stato } = m;
  g(dir, 'checkout', '--', '.');
  g(dir, 'mv', 'a.txt', 'c.txt');
  stato.bloccate = [join(dir, 'segreta')];
  assert.equal((await op('diff', { percorso: 'c.txt', area: 'preparato' })).percorso, 'c.txt');
  g(dir, 'commit', '-q', '-m', 'spostata');
  const { testa } = await op('log');
  assert.equal((await op('changes-diff', { a: testa, percorso: 'c.txt', prima: 'a.txt' })).percorso, 'c.txt');
});

test('BLOCCHI-28 N11: un guasto nel leggere le rinomine non nasconde la carta del consenso, e il diff non esce', async (t) => {
  const { dir, op, stato } = mondoPonteGit(t);
  stato.bloccate = [join(dir, 'segreta')];
  stato.consentite = [];
  await assert.rejects(op('changes-diff', { a: 'non-un-commit', percorso: 'a.txt' }), { code: 'CONSENT_REQUIRED' });
  stato.consentite = null;
  await assert.rejects(op('changes-diff', { a: 'non-un-commit', percorso: 'a.txt' }), { code: 'GIT_COMMIT_INVALID', stato: 422 });
  await assert.rejects(op('changes-diff', { a: 'a'.repeat(40), percorso: 'a.txt' }), { code: 'GIT_COMMIT_UNKNOWN', stato: 404 });
});

test('BLOCCHI-29 N1: anche la coda del nome è esatta, dove il sistema la tiene', async (t) => {
  const m = mondoPonteGit(t);
  const { dir, g, op, stato } = m;
  const nome = 'coda\u00a0';
  mkdirSync(join(dir, nome));
  writeFileSync(join(dir, nome, 'k.txt'), 'vecchia\n'); g(dir, 'add', '.'); g(dir, 'commit', '-q', '-m', 'due');
  writeFileSync(join(dir, nome, 'k.txt'), 'LAVORO\n');
  stato.bloccate = [join(dir, nome)];
  for (const percorso of [nome, `${nome}/k.txt`]) {
    await assert.rejects(op('diff', { percorso, area: 'lavoro' }), BLOCCATO, JSON.stringify(percorso));
    await assert.rejects(op('stage', { corpo: { percorsi: [percorso] } }), BLOCCATO, JSON.stringify(percorso));
  }
});

test('BLOCCHI-30 un percorso di soli spazi vale la cartella, come prima: la rotta non lo accetta comunque', async (t) => {
  const m = mondoPonteGit(t);
  preparaMadre(m);
  await assert.rejects(m.op('stage', { corpo: { percorsi: [' '] } }), BLOCCATO);
});


/* D5: un percorso enorme fermava il PC a ogni risalita, prima ancora del consenso. Il costo cresce con lunghezza per livelli: i due tetti stanno prima di ogni risalita */
const VOCI_COL_PERCORSO = (percorso) => [['diff', { percorso, area: 'lavoro' }], ['changes-diff', { a: 'a'.repeat(40), percorso }], ['changes-diff', { a: 'a'.repeat(40), percorso: 'a.txt', prima: percorso }],
  ['stage', { corpo: { percorsi: [percorso] } }], ['unstage', { corpo: { percorsi: ['a.txt', percorso] } }], ['commit', { corpo: { percorsi: [percorso], messaggio: 'x' } }],
  ['discard', { corpo: { percorsi: [percorso] }, confermata: true }], ['hunk', { corpo: { percorso, area: 'lavoro', indice: 0, impronta: 'x', azione: 'prepara' } }]];
const percorsoProfondo = (livelli) => Array.from({ length: livelli }, () => 'a').join('/');

for (const [nome, percorso] of [['troppo lungo', 'a'.repeat(32_768)], ['troppo profondo', percorsoProfondo(2049)], ['profondo con la barra rovescia', Array.from({ length: 2049 }, () => 'a').join('\\')]]) {
  test(`BLOCCHI-31 D5: un percorso ${nome} si rifiuta prima del consenso e di ogni risalita, con o senza blocchi`, async (t) => {
    const { base, op, stato } = mondoPonteGit(t);
    stato.consentite = [];
    for (const bloccate of [[], [join(base, 'altrove')]]) {
      stato.bloccate = bloccate;
      for (const [voce, args] of VOCI_COL_PERCORSO(percorso)) await assert.rejects(op(voce, args), { code: 'GIT_PATH_INVALID', stato: 422 }, voce);
    }
  });
}

test('BLOCCHI-32 D5, al contrario: ai due tetti il percorso passa e arriva alla sua risposta', async (t) => {
  const { base, op, stato } = mondoPonteGit(t);
  stato.bloccate = [join(base, 'altrove')];
  const ai = [percorsoProfondo(2048), `${'a/'.repeat(1000)}${'b'.repeat(32_767 - 2000)}`];
  assert.equal(ai[1].length, 32_767);
  for (const percorso of ai) {
    const esito = await op('diff', { percorso, area: 'lavoro' }).catch((e) => e);
    assert.notEqual(esito.code, 'GIT_PATH_INVALID', 'il tetto è compreso');
  }
});

test('BLOCCHI-33 D5: un percorso normale non cambia, e un elenco oltre il tetto del PC si rifiuta prima di risalire', async (t) => {
  const { base, dir, op, stato } = mondoPonteGit(t);
  stato.bloccate = [join(base, 'altrove')];
  writeFileSync(join(dir, 'a.txt'), 'cambiato\n');
  assert.equal((await op('diff', { percorso: 'a.txt', area: 'lavoro' })).percorso, 'a.txt');
  stato.consentite = [];
  const elenco = Array.from({ length: 1001 }, (_, i) => `f${i}.txt`);
  await assert.rejects(op('stage', { corpo: { percorsi: elenco } }), { code: 'GIT_PATHS_REQUIRED', stato: 422 });
  await assert.rejects(op('stage', { corpo: { percorsi: elenco.slice(1) } }), { code: 'CONSENT_REQUIRED' }, 'mille sono ammessi, come sul PC');
  const profondo = Array.from({ length: 2048 }, () => 'a'.repeat(15)).join('/');
  await assert.rejects(op('stage', { corpo: { percorsi: [profondo] } }), { code: 'CONSENT_REQUIRED' }, 'uno ai due tetti passa');
  await assert.rejects(op('stage', { corpo: { percorsi: [profondo, 'b'] } }), { code: 'GIT_PATH_INVALID', stato: 422 }, 'una richiesta non costa più di uno ai due tetti');
  await assert.rejects(op('stage', { corpo: { percorsi: Array.from({ length: 32 }, () => profondo) } }), { code: 'GIT_PATH_INVALID', stato: 422 });
  const vero = Array.from({ length: 1000 }, (_, i) => `${'c/'.repeat(19)}${String(i).padStart(362, 'n')}`);
  await assert.rejects(op('stage', { corpo: { percorsi: vero } }), { code: 'CONSENT_REQUIRED' }, 'mille percorsi lunghi e profondi, di un repository vero');
});

test('BLOCCHI-34 da una cartella bloccata una scrittura senza percorsi si ferma sul blocco, prima della rotta', async (t) => {
  const m = mondoPonteGit(t);
  preparaSegreta(m);
  const { dir, op, stato } = m;
  stato.bloccate = [dir];
  await assert.rejects(op('stage', { corpo: {} }), { code: 'FOLDER_BLOCKED', stato: 409, reason: 'folder-blocked' });
  await assert.rejects(op('commit', { corpo: { messaggio: 'x' } }), { code: 'FOLDER_BLOCKED', stato: 409, reason: 'folder-blocked' });
});

test('BLOCCHI-35 N5: un repository col nome vicino a quello di un blocco resta libero', async (t) => {
  const m = mondoPonteGit(t);
  const { base, g, op, sessionRegistry, stato } = m;
  const vicino = join(base, 'fermo\u00a0');
  mkdirSync(vicino); mkdirSync(join(base, 'fermo'));
  g(vicino, 'init', '-q', '-b', 'main'); g(vicino, 'config', 'user.email', 'a@example.invalid'); g(vicino, 'config', 'user.name', 'A');
  writeFileSync(join(vicino, 'a.txt'), 'uno\n'); g(vicino, 'add', '.'); g(vicino, 'commit', '-q', '-m', 'primo');
  sessionRegistry.cartellaDi = () => vicino;
  sessionRegistry.cartellaPerChatFile = async () => ({ ok: true, cartella: vicino });
  stato.bloccate = [join(base, 'fermo')];
  await op('branch-create', { corpo: { ramo: 'prova' } });
  assert.match(g(vicino, 'branch', '--list', 'prova'), /prova/u);
});

test('BLOCCHI-36 N7: `corpo.percorsi` conta solo dove la rotta lo legge', async (t) => {
  const m = mondoPonteGit(t);
  const { dir, op } = m;
  writeFileSync(join(dir, 'a.txt'), 'cambiato\n');
  const troppi = Array.from({ length: 1001 }, (_, i) => `f${i}.txt`);
  assert.equal((await op('diff', { percorso: 'a.txt', area: 'lavoro', corpo: { percorsi: troppi } })).percorso, 'a.txt');
  await assert.rejects(op('stage', { corpo: { percorsi: troppi } }), { code: 'GIT_PATHS_REQUIRED', stato: 422 }, 'al contrario: dove la rotta lo legge il tetto resta');
});

test('BLOCCHI-37 N2: un blocco scritto attraverso una giunzione ferma anche la cartella che lo contiene', { skip: process.platform !== 'win32' }, async (t) => {
  const m = mondoPonteGit(t);
  const { base, dir, op, stato } = m;
  mkdirSync(join(dir, 'sopra', 'segreta'), { recursive: true });
  writeFileSync(join(dir, 'sopra', 'segreta', 'k.txt'), 'x\n');
  const alias = join(base, 'alias');
  execFileSync('cmd', ['/c', 'mklink', '/J', alias, dir], { stdio: 'ignore' });
  stato.bloccate = [join(alias, 'sopra', 'segreta')];
  await assert.rejects(op('stage', { corpo: { percorsi: ['sopra'] } }), BLOCCATO);
});

test('BLOCCHI-38 D1: mille percorsi inesistenti e profondi si fermano sul tetto, senza fermare il computer', async (t) => {
  const m = mondoPonteGit(t);
  const { base, dir, op, stato } = m;
  /* 03/11/2026 (OK del Mobile, tre condizioni): il tetto fisso di 1500 ms cadeva sotto carico (2519 ms durante una suite). Il tetto
     ora segue la macchina: un riferimento misurato qui, subito prima, sui file cancellati di BLOCCHI-39, il più basso di 3 corse
     (una punta di carico durante il riferimento non allarga il tetto), e mai sotto i 1500 ms di prima. Il riferimento sta a due
     livelli: a 25 livelli rallentava insieme al codice di prima della cura (990-1278 ms invece di 153) e il tetto lo inseguiva.
     04/11/2026 (OK del Mobile): il minimo sale da 1500 a 3000 ms. Nel treno H il riferimento era basso, il tetto restava a 1500 e la
     prova misurava 1597 ms sotto il carico della suite intera: rossa su un ramo buono. 3000 ms prende ancora il guasto da 5,6 s con
     quasi 2× di margine. Come Hermes, che mette tetti larghi sopra il tempo normale (tests/acp_adapter/test_session_mcp_frozen.py:85). */
  stato.bloccate = [join(dir, 'segreta')];
  const normali = Array.from({ length: 1000 }, (_, i) => `cancellati/f${i}.txt`);
  const giri = [];
  for (let i = 0; i < 3; i += 1) {
    const t0 = performance.now();
    await assert.rejects(op('stage', { corpo: { percorsi: normali } }), (e) => e.code !== 'GIT_PATH_INVALID' && e.code !== 'FOLDER_BLOCKED');
    giri.push(performance.now() - t0);
  }
  const riferimento = Math.min(...giri);
  const tetto = Math.max(3000, 4 * riferimento);
  stato.bloccate = [join(base, 'altrove')];
  stato.consentite = [];
  const percorsi = Array.from({ length: 1000 }, (_, i) => `p${i}/${'ab12/'.repeat(108)}f.txt`); // dentro i tetti di D5: 1000 × 540 caratteri × 110 livelli
  const inizio = performance.now();
  await assert.rejects(op('stage', { corpo: { percorsi } }), { code: 'GIT_PATH_INVALID', stato: 422 });
  const durata = performance.now() - inizio;
  assert.ok(durata < tetto, `durata ${Math.round(durata)} ms, riferimento ${Math.round(riferimento)} ms (il più basso di 3: ${giri.map(Math.round).join(', ')}), tetto ${Math.round(tetto)} ms; prima della cura erano 5,6 s`);
});

test('BLOCCHI-39 D1, al contrario: mille file normali, anche cancellati, stanno dentro il tetto', async (t) => {
  const m = mondoPonteGit(t);
  const { dir, op, stato } = m;
  stato.bloccate = [join(dir, 'segreta')];
  const percorsi = Array.from({ length: 1000 }, (_, i) => `cancellati/${'uno/'.repeat(24)}f${i}.txt`);
  await assert.rejects(op('stage', { corpo: { percorsi } }), (e) => e.code !== 'GIT_PATH_INVALID' && e.code !== 'FOLDER_BLOCKED');
});
