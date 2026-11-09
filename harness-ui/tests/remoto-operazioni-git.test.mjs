import assert from 'node:assert/strict';
import test from 'node:test';

import { createHttpApp } from '../src/http-app.mjs';
import { iscriviConRigiocata } from '../src/iscrizione-sessione.mjs';
import { creaChiamataInterna } from '../src/remoto/chiamata-interna.mjs';
import { creaOperazioni } from '../src/remoto/operazioni.mjs';

/*
 * Ponte Git (owner 31/10/2026 sera, contratto `CONTRATTO-GIT-PONTE-BOZZA-2026-10-31.md`): dal dispositivo, le rotte della scheda Git del PC. Leggere è libero,
 *   il contenuto dei file (diff) e le scritture vogliono il consenso della cartella, ciò che perde lavoro vuole anche la carta, e l'invio si lega a ciò che la
 *   carta ha mostrato. Niente percorsi del PC e niente gettoni negli indirizzi dei remoti.
 */
const DISP = 'dispositivo-A1';
const contesto = { dispositivo: { id: DISP, nome: 'OnePlus Pad 3' }, iscrizioni: new Map(), iscrivi: () => async () => {} };
const sessionRegistry = { elenca: () => [], esiste: () => true, async cartellaPerChatFile() { return { ok: true, cartella: 'C:\\Users\\persona\\progetto' }; } };

function banco({ consentita = true, cartelle = true, risposte = {} } = {}) {
  const chiamate = [];
  const chiama = async (c) => {
    chiamate.push(c);
    const chiave = `${c.metodo} ${c.percorso.split('?')[0].split('/').pop()}`;
    return { stato: 200, dati: risposte[chiave] ?? { ok: true } };
  };
  const finte = cartelle ? { consentita: async () => consentita, descrivi: async () => ({ nome: 'progetto' }), elenco: async () => [] } : null;
  return { chiamate, operazioni: creaOperazioni({ chiama, sessionRegistry, iscriviConRigiocata, cartelle: finte }) };
}

const LIBERE = ['status', 'branch', 'log', 'branches', 'stashes', 'remotes', 'sync'];
const SCRITTURE_SENZA_CARTA = ['stage', 'unstage', 'commit', 'commit-staged', 'switch', 'branch-create', 'branch-rename', 'stash', 'stash-pop', 'fetch', 'commit-message'];
const CON_CARTA = ['discard', 'amend', 'undo-commit', 'branch-delete', 'stash-drop', 'pull'];

test('GIT-PONTE-01 ogni lettura libera arriva alla sua rotta in GET, senza consenso', async () => {
  const { chiamate, operazioni } = banco({ consentita: false });
  for (const nome of LIBERE) {
    chiamate.length = 0;
    await operazioni.esegui(`session.git.${nome}`, { sessionId: 's1' }, contesto);
    assert.deepEqual(chiamate.map((c) => [c.metodo, c.percorso]), [['GET', `/api/v1/sessions/s1/git/${nome}`]], nome);
  }
  await operazioni.esegui('session.git.changes', { sessionId: 's1', a: 'abc', da: 'def' }, contesto);
  assert.equal(chiamate.at(-1).percorso, '/api/v1/sessions/s1/git/changes?a=abc&da=def');
});

test('GIT-PONTE-02 il diff vuole il consenso della cartella: è il contenuto dei file, e il telefono non sfoglia i file del PC', async () => {
  const { chiamate, operazioni } = banco({ consentita: false });
  for (const [op, args] of [['session.git.diff', { sessionId: 's1', percorso: 'a b.txt', area: 'lavoro' }], ['session.git.changes-diff', { sessionId: 's1', a: 'abc', percorso: 'x.txt' }]]) {
    await assert.rejects(operazioni.esegui(op, args, contesto), { code: 'CONSENT_REQUIRED' }, op);
  }
  assert.equal(chiamate.length, 0);
  const aperto = banco();
  await aperto.operazioni.esegui('session.git.diff', { sessionId: 's1', percorso: 'a b+c è.txt', area: 'lavoro' }, contesto);
  const url = new URL(aperto.chiamate[0].percorso, 'http://x');
  assert.equal(url.searchParams.get('percorso'), 'a b+c è.txt');
  assert.equal(url.searchParams.get('area'), 'lavoro');
});

test('GIT-PONTE-03 un valore della query che non è testo non arriva al PC; un argomento non previsto non entra nella query', async () => {
  const { chiamate, operazioni } = banco();
  await assert.rejects(operazioni.esegui('session.git.diff', { sessionId: 's1', percorso: ['a'], area: 'lavoro' }, contesto), { code: 'BAD_MESSAGE' });
  await assert.rejects(operazioni.esegui('session.git.status', { sessionId: '../x' }, contesto), { code: 'BAD_MESSAGE' });
  assert.equal(chiamate.length, 0);
  await operazioni.esegui('session.git.status', { sessionId: 's1', percorso: 'x', altro: 'y' }, contesto);
  assert.equal(chiamate[0].percorso, '/api/v1/sessions/s1/git/status');
});

test('GIT-PONTE-04 ogni scrittura vuole il consenso; fermare il recupero no', async () => {
  const { chiamate, operazioni } = banco({ consentita: false });
  for (const nome of [...SCRITTURE_SENZA_CARTA, ...CON_CARTA, 'hunk', 'push']) {
    const inPiu = { hunk: { corpo: { azione: 'annulla' } }, push: { visto: { ramo: 'm', remoto: 'o', urlInvio: 'u', destinazione: 'm', commit: 'c' } } }[nome] ?? {};
    await assert.rejects(operazioni.esegui(`session.git.${nome}`, { sessionId: 's1', corpo: {}, confermata: true, ...inPiu }, contesto), { code: 'CONSENT_REQUIRED' }, nome);
  }
  assert.equal(chiamate.length, 0);
  await operazioni.esegui('session.git.fetch-stop', { sessionId: 's1' }, contesto);
  assert.deepEqual(chiamate.map((c) => [c.metodo, c.percorso, c.corpo]), [['POST', '/api/v1/sessions/s1/git/fetch-stop', {}]]);
});

test('GIT-PONTE-05 col consenso, le scritture senza carta arrivano in POST col corpo della rotta', async () => {
  const { chiamate, operazioni } = banco();
  for (const nome of SCRITTURE_SENZA_CARTA) {
    chiamate.length = 0;
    await operazioni.esegui(`session.git.${nome}`, { sessionId: 's1', corpo: { ramo: 'x' } }, contesto);
    assert.deepEqual(chiamate.filter((c) => c.metodo !== 'GET').map((c) => [c.metodo, c.percorso, c.corpo]), [['POST', `/api/v1/sessions/s1/git/${nome}`, { ramo: 'x' }]], nome);
  }
});

test('GIT-PONTE-06 ciò che perde lavoro non parte senza la carta, e il segno della carta non arriva alla rotta', async () => {
  const { chiamate, operazioni } = banco();
  for (const nome of CON_CARTA) {
    chiamate.length = 0;
    await assert.rejects(operazioni.esegui(`session.git.${nome}`, { sessionId: 's1', corpo: {} }, contesto), { code: 'CONFIRMATION_REQUIRED' }, nome);
    await assert.rejects(operazioni.esegui(`session.git.${nome}`, { sessionId: 's1', corpo: {}, confermata: 'true' }, contesto), { code: 'CONFIRMATION_REQUIRED' }, nome);
    assert.equal(chiamate.filter((c) => c.metodo !== 'GET').length, 0, nome);
    await operazioni.esegui(`session.git.${nome}`, { sessionId: 's1', corpo: { commit: 'abc' }, confermata: true }, contesto);
    assert.deepEqual(chiamate.find((c) => c.metodo !== 'GET').corpo, { commit: 'abc' }, nome);
  }
});

test('GIT-PONTE-07 un pezzo del diff vuole la carta solo quando butta via: preparare e togliere non perdono niente', async () => {
  const { chiamate, operazioni } = banco();
  await operazioni.esegui('session.git.hunk', { sessionId: 's1', corpo: { azione: 'prepara' } }, contesto);
  await operazioni.esegui('session.git.hunk', { sessionId: 's1', corpo: { azione: 'togli' } }, contesto);
  assert.equal(chiamate.length, 2);
  await assert.rejects(operazioni.esegui('session.git.hunk', { sessionId: 's1', corpo: { azione: 'annulla' } }, contesto), { code: 'CONFIRMATION_REQUIRED' });
  assert.equal(chiamate.length, 2);
});

const VISTO = { ramo: 'main', remoto: 'origin', urlInvio: 'https://example.invalid/a.git', destinazione: 'main', commit: 'abc123' };

test('GIT-PONTE-08 ciò che la carta ha mostrato arriva a `invia`, e se il PC è cambiato il dispositivo riceve il rifiuto', async () => {
  const buono = banco();
  await buono.operazioni.esegui('session.git.push', { sessionId: 's1', corpo: { remoto: 'origin' }, confermata: true, visto: { ...VISTO, altro: 'x' } }, contesto);
  assert.deepEqual(buono.chiamate.filter((c) => c.metodo === 'POST').map((c) => [c.percorso, c.corpo]), [['/api/v1/sessions/s1/git/push', { remoto: 'origin', visto: VISTO }]]);
  const cambiato = { ...VISTO, commit: 'nuovo' };
  const { operazioni } = banco({ risposte: { 'POST push': { ok: false, cambiato } } });
  await assert.rejects(operazioni.esegui('session.git.push', { sessionId: 's1', corpo: {}, confermata: true, visto: VISTO }, contesto),
    (e) => e.code === 'GIT_PUSH_CHANGED' && e.stato === 409 && e.reason === 'push-changed' && e.params.commit === 'nuovo' && e.params.urlInvio === VISTO.urlInvio);
});

test('GIT-PONTE-09 l\'invio senza carta o senza ciò che ha mostrato non parte', async () => {
  const { chiamate, operazioni } = banco();
  await assert.rejects(operazioni.esegui('session.git.push', { sessionId: 's1', corpo: {}, visto: VISTO }, contesto), { code: 'CONFIRMATION_REQUIRED' });
  await assert.rejects(operazioni.esegui('session.git.push', { sessionId: 's1', corpo: {}, confermata: true }, contesto), { code: 'BAD_MESSAGE' });
  await assert.rejects(operazioni.esegui('session.git.push', { sessionId: 's1', corpo: {}, confermata: true, visto: { ramo: 'main' } }, contesto), { code: 'BAD_MESSAGE' });
  assert.equal(chiamate.filter((c) => c.metodo === 'POST').length, 0);
});

test('GIT-PONTE-10 niente percorsi del PC e niente gettoni: l\'indirizzo di un remoto perde le credenziali', async () => {
  const remoti = { remoti: [
    { nome: 'gettone', url: 'https://x-access-token:ghp_segretissimo@github.com/a/b.git', urlInvio: 'https://persona:pw@github.com/a/b.git' },
    { nome: 'query', url: 'https://example.com/a.git?token=segreto', urlInvio: null },
    { nome: 'ssh', url: 'git@github.com:a/b.git', urlInvio: null },
    { nome: 'locale', url: 'C:\\Users\\persona\\depositi\\b.git', urlInvio: null }] };
  const { operazioni } = banco({ risposte: { 'GET remotes': remoti, 'GET sync': { ...remoti, ramo: 'main' }, 'GET status': { cartella: 'C:\\Users\\persona\\progetto', voci: [{ percorso: 'src/a.js' }] } } });
  for (const nome of ['remotes', 'sync']) {
    const r = await operazioni.esegui(`session.git.${nome}`, { sessionId: 's1' }, contesto);
    assert.deepEqual(r.remoti.slice(0, 3).map((x) => x.url), ['https://github.com/a/b.git', 'https://example.com/a.git', 'git@github.com:a/b.git'], nome);
    assert.match(r.remoti[3].url, /^…\/b\.git#[0-9a-f]{8}$/u, nome);
    assert.equal(r.remoti[0].urlInvio, 'https://github.com/a/b.git', nome);
    assert.doesNotMatch(JSON.stringify(r), /segret|ghp_|persona/u, nome);
  }
  const stato = await operazioni.esegui('session.git.status', { sessionId: 's1' }, contesto);
  assert.equal(Object.hasOwn(stato, 'cartella'), false);
  assert.equal(stato.voci[0].percorso, 'src/a.js');
});

test('GIT-PONTE-11 il testo del diff resta intero, ma ha un tetto di 512 KB e 20.000 righe, e lo dice', async () => {
  const conPercorso = { percorso: 'a.txt', testo: '+leggi C:\\Users\\persona\\file.txt\n', troncato: false, impronta: 'i', voce: { cartella: 'C:\\Users\\persona\\x' } };
  const piccolo = await banco({ risposte: { 'GET diff': conPercorso } }).operazioni.esegui('session.git.diff', { sessionId: 's1', percorso: 'a.txt', area: 'lavoro' }, contesto);
  assert.equal(piccolo.testo, conPercorso.testo, 'il contenuto del file non si riscrive');
  assert.equal(Object.hasOwn(piccolo, 'voce'), false, 'un campo non elencato non esce');
  const righe = await banco({ risposte: { 'GET diff': { testo: 'r\n'.repeat(30_000), troncato: false } } }).operazioni.esegui('session.git.diff', { sessionId: 's1', percorso: 'a.txt', area: 'lavoro' }, contesto);
  assert.equal(righe.testo.split('\n').length - 1, 20_000);
  assert.equal(righe.troncato, true);
  const byte = await banco({ risposte: { 'GET changes-diff': { testo: `${'é'.repeat(400_000)}\n${'x'.repeat(400_000)}`, troncato: false } } }).operazioni.esegui('session.git.changes-diff', { sessionId: 's1', a: 'abc', percorso: 'a.txt' }, contesto);
  assert.ok(Buffer.byteLength(byte.testo, 'utf8') <= 512 * 1024);
  assert.equal(byte.troncato, true);
  assert.doesNotMatch(byte.testo, /\uFFFD/u, 'mai un carattere spezzato a metà');
  const giusto = await banco({ risposte: { 'GET diff': { testo: 'r\n'.repeat(19_999), troncato: false } } }).operazioni.esegui('session.git.diff', { sessionId: 's1', percorso: 'a.txt', area: 'lavoro' }, contesto);
  assert.equal(giusto.troncato, false, 'sotto il tetto niente si dichiara tagliato');
  const giaTagliato = await banco({ risposte: { 'GET diff': { testo: 'r\n', troncato: true } } }).operazioni.esegui('session.git.diff', { sessionId: 's1', percorso: 'a.txt', area: 'lavoro' }, contesto);
  assert.equal(giaTagliato.troncato, true, 'ciò che il PC ha già tagliato resta detto');
});

test('GIT-PONTE-12 senza il consenso delle cartelle sul PC, le voci che lo vogliono non esistono; le letture sì', async () => {
  const { chiamate, operazioni } = banco({ cartelle: false });
  for (const op of ['session.git.diff', 'session.git.commit', 'session.git.push']) {
    assert.ok(!operazioni.elenco().includes(op), op);
    /* il motivo distingue questo PC da uno vecchio, che direbbe lo stesso codice senza motivo: al secondo si dice di aggiornare, a questo no (Mobile) */
    await assert.rejects(operazioni.esegui(op, { sessionId: 's1', corpo: {} }, contesto), { code: 'UNKNOWN_OPERATION', reason: 'no-folder-consent' }, op);
  }
  assert.equal(chiamate.length, 0);
  assert.ok(operazioni.elenco().includes('session.git.status'));
  await operazioni.esegui('session.git.status', { sessionId: 's1' }, contesto);
  assert.equal(chiamate.length, 1);
});

test('GIT-PONTE-13 le voci stanno sulle rotte vere; un ospite senza servizio Git risponde GIT_STORE_UNAVAILABLE e non lancia niente', async () => {
  const httpApp = createHttpApp({ senzaGettone: 'prove', staticHandler: async () => null, sessionRegistry });
  const chiama = creaChiamataInterna({ httpApp, porta: 4999 });
  const finte = { consentita: async () => true, descrivi: async () => ({}), elenco: async () => [] };
  const operazioni = creaOperazioni({ chiama, sessionRegistry, iscriviConRigiocata, cartelle: finte });
  const tutte = operazioni.elenco().filter((op) => op.startsWith('session.git.'));
  assert.equal(tutte.length, 30);
  for (const op of tutte) {
    const nome = op.slice('session.git.'.length);
    const args = { sessionId: 's1', corpo: nome === 'hunk' ? { azione: 'prepara' } : {}, confermata: true, visto: VISTO, percorso: 'a.txt', area: 'lavoro', a: 'abc' };
    /* le voci sulla radice leggono prima il PC: il rifiuto arriva dalla loro prima lettura, con lo stesso codice */
    await assert.rejects(operazioni.esegui(op, args, contesto), { code: 'GIT_STORE_UNAVAILABLE' }, nome);
  }
});
