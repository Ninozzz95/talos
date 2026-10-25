import assert from 'node:assert/strict';
import { mkdirSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

import { createHttpApp } from '../src/http-app.mjs';
import { iscriviConRigiocata } from '../src/iscrizione-sessione.mjs';
import { creaCartelleDeiDispositivi } from '../src/remoto/cartelle-dispositivi.mjs';
import { creaChiamataInterna } from '../src/remoto/chiamata-interna.mjs';
import { OPERAZIONI_CONSENSO, creaOperazioni } from '../src/remoto/operazioni.mjs';
import { cartellaDiProva } from './aiuto/cartelle-di-prova.mjs';

/*
 * 23/10/2026 sera — R5.12, le cartelle dei dispositivi col consenso del PC, attraverso le operazioni del dispositivo E le rotte vere
 *   del server (contratto `CONTRATTO-DISPOSITIVI-CARTELLE-FILE-RISORSE-2026-10-23.md`, parte 1, revisione 1). Il modulo da solo è in
 *   `remoto-cartelle-dispositivi.test.mjs`; qui i due cancelli insieme: l'operazione (che dà al dispositivo i parametri della cartella)
 *   e la rotta (il cancello vero, per qualunque strada arrivi la richiesta). Ogni divieto ha il suo verso contrario.
 */
const DISP_A = 'dispositivo-A1';
const DISP_B = 'dispositivo-B2';

function banco() {
  const radice = cartellaDiProva('talos-consenso-rotte-');
  const crea = (...parti) => { const p = join(radice, ...parti); mkdirSync(p, { recursive: true }); return realpathSync(p); };
  const avm = crea('progetti', 'AVM');
  const app = crea('progetti', 'app');
  const dati = crea('dati');
  const sessioni = new Map();
  const avviate = []; const riprese = []; const fermate = [];
  const sessionRegistry = {
    cartellePiuUsate: () => [{ percorso: avm, conteggio: 2, ultimaVolta: '2026-10-23T10:00:00.000Z' }, { percorso: app, conteggio: 1, ultimaVolta: '2026-10-23T09:00:00.000Z' }],
    elenca: () => [...sessioni.keys()].map((sessionId) => ({ sessionId, titolo: sessionId })),
    esiste: (id) => sessioni.has(id),
    avviaLibero: (richiesta) => { const sessionId = `s${avviate.length + 1}`; avviate.push(richiesta); sessioni.set(sessionId, richiesta.cartellaLibera); return { sessionId }; },
    async cartellaPerChatFile(id) {
      if (!sessioni.has(id)) return { code: 'NOT_FOUND', reason: 'session-not-found' };
      try { return { ok: true, cartella: realpathSync(sessioni.get(id)) }; } catch { return { code: 'SESSION_NOT_READY', reason: 'workspace-unavailable' }; }
    },
    resume: (id, messaggio) => { if (!sessioni.has(id)) return { erroreAvvio: 'Session not found', code: 'NOT_FOUND', reason: 'session-not-found' }; riprese.push([id, messaggio]); return { sessionId: id }; },
    ferma: (id) => { fermate.push(id); return sessioni.has(id); },
  };
  const cartelle = creaCartelleDeiDispositivi({ fileConsensi: join(dati, 'remoto', 'consensi.json'), fileSegreto: join(dati, 'remoto', 'segreto-cartelle'),
    sessionRegistry, cartelleAmmesse: [], cartelleEscluse: [dati] });
  const httpApp = createHttpApp({ staticHandler: async () => null, sessionRegistry, remotoFn: () => ({ cartelle }) });
  const chiama = creaChiamataInterna({ httpApp, porta: 4999 });
  const operazioni = creaOperazioni({ chiama, sessionRegistry, iscriviConRigiocata, cartelle });
  const contesto = (id = DISP_A, nome = 'OnePlus Pad 3') => ({ dispositivo: { id, nome }, iscrizioni: new Map(), iscrivi: () => async () => {} });
  const remota = (id = DISP_A) => ({ tipo: 'telefono', nome: 'OnePlus Pad 3', dispositivoId: id });
  /* il PC: la finestra, senza origine remota */
  const pc = (metodo, percorso, corpo) => chiama({ metodo, percorso, corpo, origine: 'pc' });
  const sessioneDalPc = async (cartella) => (await pc('POST', '/api/v1/sessions/custom', { cartellaLibera: cartella, consegna: 'dal PC' })).dati.sessionId;
  return { radice, avm, app, dati, sessioni, avviate, riprese, fermate, cartelle, chiama, operazioni, contesto, remota, pc, sessioneDalPc };
}

test('CR-01 projects.list dal dispositivo: le cartelle recenti del PC con id e nome, nessun percorso; le operazioni del consenso esistono solo col modulo', async () => {
  const b = banco();
  const { items } = await b.operazioni.esegui('projects.list', {}, b.contesto());
  assert.deepEqual(items.map((r) => [r.nome, r.consentita]), [['AVM', false], ['app', false]]);
  assert.ok(items.every((r) => /^[A-Za-z0-9_-]{32}$/u.test(r.cartellaId)));
  assert.ok(!JSON.stringify(items).includes('progetti') && !JSON.stringify(items).includes('talos-consenso-rotte'), 'nessun percorso');
  for (const op of OPERAZIONI_CONSENSO) assert.ok(b.operazioni.elenco().includes(op), op);
  // AL CONTRARIO: senza il modulo le operazioni del consenso non ci sono
  const senza = creaOperazioni({ chiama: b.chiama, sessionRegistry: { elenca: () => [], esiste: () => false }, iscriviConRigiocata });
  for (const op of OPERAZIONI_CONSENSO) assert.ok(!senza.elenco().includes(op), op);
});

test('CR-02 avvio in una cartella non consentita: niente parte, il PC tiene il corpo e avvia LUI al «Consenti»; consent.wait dà lo stesso esito', async () => {
  const b = banco();
  const [avmRiga] = (await b.operazioni.esegui('projects.list', {}, b.contesto())).items;
  const attesa = await b.operazioni.esegui('session.start', { corpo: { cartellaId: avmRiga.cartellaId, consegna: 'il primo messaggio' } }, b.contesto());
  assert.equal(attesa.stato, 'attesa-consenso');
  assert.equal(b.avviate.length, 0, '⛔ partita senza consenso');
  const [carta] = b.cartelle.inAttesa();
  assert.deepEqual([carta.richiestaId, carta.dispositivoId, carta.nomeDispositivo, carta.nome, carta.percorso], [attesa.richiestaId, DISP_A, 'OnePlus Pad 3', 'AVM', b.avm]);
  // il dispositivo aspetta; il PC consente durante l'attesa e l'attesa si sveglia subito
  const inizio = Date.now();
  const attendi = b.operazioni.esegui('consent.wait', { richiestaId: attesa.richiestaId }, b.contesto());
  const { dati: risposta } = await b.pc('POST', `/api/v1/remote/consents/${attesa.richiestaId}/allow`, {});
  assert.deepEqual(risposta, { esito: 'consentita', sessionId: 's1' });
  assert.deepEqual(await attendi, { esito: 'consentita', sessionId: 's1' });
  assert.ok(Date.now() - inizio < 5000, 'l\'attesa lunga si sveglia alla risposta');
  assert.equal(b.avviate[0].cartellaLibera, b.avm, 'la cartella REALE, tradotta dal PC');
  assert.equal(b.avviate[0].consegna, 'il primo messaggio', 'il primo messaggio della persona non si perde');
  assert.equal(b.avviate.length, 1);
  // AL CONTRARIO: «Non ora» — nessuna sessione, e la stessa risposta due volte non ha effetto
  const [, appRiga] = (await b.operazioni.esegui('projects.list', {}, b.contesto())).items;
  const seconda = await b.operazioni.esegui('session.start', { corpo: { cartellaId: appRiga.cartellaId, consegna: 'x' } }, b.contesto());
  assert.deepEqual((await b.pc('POST', `/api/v1/remote/consents/${seconda.richiestaId}/deny`, {})).dati, { esito: 'negata' });
  assert.deepEqual(await b.operazioni.esegui('consent.wait', { richiestaId: seconda.richiestaId }, b.contesto()), { esito: 'negata' });
  await assert.rejects(b.pc('POST', `/api/v1/remote/consents/${seconda.richiestaId}/allow`, {}), (e) => e.code === 'CONSENT_NOT_PENDING' && e.stato === 409);
  assert.equal(b.avviate.length, 1, '⛔ partita dopo un «Non ora»');
});

test('CR-03 in una cartella già consentita l\'avvio parte subito, nella cartella reale; un id che non è nell\'elenco è FOLDER_NOT_LISTED', async () => {
  const b = banco();
  await b.pc('POST', `/api/v1/remote/phones/${DISP_A}/folders`, { percorso: b.avm });
  const [avmRiga] = (await b.operazioni.esegui('projects.list', {}, b.contesto())).items;
  assert.equal(avmRiga.consentita, true);
  assert.deepEqual(await b.operazioni.esegui('session.start', { corpo: { cartellaId: avmRiga.cartellaId, consegna: 'subito' } }, b.contesto()), { sessionId: 's1' });
  assert.equal(b.avviate[0].cartellaLibera, b.avm);
  await assert.rejects(b.operazioni.esegui('session.start', { corpo: { cartellaId: 'x'.repeat(32), consegna: 'y' } }, b.contesto()), (e) => e.code === 'FOLDER_NOT_LISTED' && e.stato === 404);
  // AL CONTRARIO: il consenso è di QUEL dispositivo — per B la stessa cartella chiede ancora
  const perB = await b.operazioni.esegui('session.start', { corpo: { cartellaId: avmRiga.cartellaId, consegna: 'z' } }, b.contesto(DISP_B, 'Telefono'));
  assert.equal(perB.stato, 'attesa-consenso');
  assert.equal(b.avviate.length, 1);
});

test('CR-04 il cancello vero è la rotta: dal dispositivo `cartellaId` crudo e una `cartellaLibera` non consentita (o consentita a un ALTRO) sono 403', async () => {
  const b = banco();
  const [avmRiga] = (await b.operazioni.esegui('projects.list', {}, b.contesto())).items;
  const avvia = (corpo, id = DISP_A) => b.chiama({ metodo: 'POST', percorso: '/api/v1/sessions/custom', corpo, origine: `telefono:${id}`, origineRemota: b.remota(id) });
  await assert.rejects(avvia({ cartellaId: avmRiga.cartellaId, consegna: 'x' }), (e) => e.code === 'NOT_ALLOWED_REMOTELY' && e.stato === 403);
  await assert.rejects(avvia({ cartellaId: 'progetto-1', consegna: 'x' }), (e) => e.code === 'NOT_ALLOWED_REMOTELY' && e.stato === 403, 'l\'elenco vecchio non vale più dal dispositivo');
  await assert.rejects(avvia({ cartellaLibera: b.avm, consegna: 'x' }), (e) => e.code === 'NOT_ALLOWED_REMOTELY' && e.stato === 403);
  await b.pc('POST', `/api/v1/remote/phones/${DISP_B}/folders`, { percorso: b.avm });
  await assert.rejects(avvia({ cartellaLibera: b.avm, consegna: 'x' }), (e) => e.code === 'NOT_ALLOWED_REMOTELY', 'consentita a B, non ad A');
  await assert.rejects(b.chiama({ metodo: 'POST', percorso: '/api/v1/sessions/custom', corpo: { cartellaLibera: b.avm, consegna: 'x' }, origine: 'telefono:?', origineRemota: { tipo: 'telefono', nome: 'X' } }),
    (e) => e.code === 'NOT_ALLOWED_REMOTELY', 'senza l\'identità del canale non passa');
  assert.equal(b.avviate.length, 0);
  // AL CONTRARIO: la cartella consentita a B, dal canale di B, passa
  assert.deepEqual((await avvia({ cartellaLibera: b.avm, consegna: 'x' }, DISP_B)).dati, { sessionId: 's1' });
});

test('CR-05 scrivere in una sessione aperta vuole il consenso; fermare no; leggere l\'elenco dice se è consentita; la revoca vale dalla scrittura dopo', async () => {
  const b = banco();
  const id = await b.sessioneDalPc(b.avm);
  const invia = (testo = 'ciao') => b.operazioni.esegui('session.send', { sessionId: id, corpo: { messaggio: testo } }, b.contesto());
  await assert.rejects(invia(), (e) => e.code === 'CONSENT_REQUIRED' && e.stato === 403 && e.reason === 'consent-required' && e.params?.nome === 'AVM' && /^[A-Za-z0-9_-]{32}$/u.test(e.params?.cartellaId));
  for (const op of ['session.queue', 'session.approve', 'session.answer', 'session.plan', 'session.settings', 'session.rename', 'session.compact']) {
    await assert.rejects(b.operazioni.esegui(op, { sessionId: id, corpo: {} }, b.contesto()), { code: 'CONSENT_REQUIRED' }, op);
  }
  // anche saltando l'operazione: la rotta
  await assert.rejects(b.chiama({ metodo: 'POST', percorso: `/api/v1/sessions/${id}/resume`, corpo: { messaggio: 'x' }, origine: 'telefono', origineRemota: b.remota() }),
    (e) => e.code === 'CONSENT_REQUIRED' && e.stato === 403);
  assert.equal(b.riprese.length, 0, '⛔ scritto senza consenso');
  // fermare è sempre ammesso
  assert.deepEqual(await b.operazioni.esegui('session.stop', { sessionId: id, corpo: {} }, b.contesto()), { stopped: true });
  assert.deepEqual(b.fermate, [id]);
  // l'elenco lo dice prima di scrivere
  const prima = (await b.operazioni.esegui('sessions.list', {}, b.contesto())).items.find((r) => r.sessionId === id);
  assert.equal(prima.consentita, false);
  assert.match(prima.cartellaId, /^[A-Za-z0-9_-]{32}$/u);
  assert.deepEqual(await b.operazioni.esegui('session.consent', { sessionId: id }, b.contesto()), { consentita: false, cartellaId: prima.cartellaId, nome: 'AVM' });
  // il PC consente in anticipo: si scrive
  const { dati: aggiunta } = await b.pc('POST', `/api/v1/remote/phones/${DISP_A}/folders`, { percorso: b.avm });
  assert.equal(aggiunta.cartellaId, prima.cartellaId);
  assert.deepEqual(await invia('adesso sì'), { sessionId: id });
  assert.deepEqual(b.riprese, [[id, 'adesso sì']]);
  assert.equal((await b.operazioni.esegui('sessions.list', {}, b.contesto())).items.find((r) => r.sessionId === id).consentita, true);
  assert.equal((await b.operazioni.esegui('session.consent', { sessionId: id }, b.contesto())).consentita, true);
  assert.equal((await b.operazioni.esegui('session.consent', { sessionId: id }, b.contesto(DISP_B))).consentita, false, 'per B no');
  // l'identità viene dal canale: B non scrive col consenso di A, nemmeno dicendo di essere A
  await assert.rejects(b.operazioni.esegui('session.send', { sessionId: id, dispositivoId: DISP_A, corpo: { messaggio: 'x' } }, b.contesto(DISP_B)), { code: 'CONSENT_REQUIRED' });
  // la revoca vale subito, anche per la sessione aperta
  const { dati: elenco } = await b.pc('GET', `/api/v1/remote/phones/${DISP_A}/folders`);
  assert.deepEqual(elenco.cartelle.map((c) => [c.nome, c.percorso, c.da]), [['AVM', b.avm, 'anticipo']]);
  assert.deepEqual((await b.pc('POST', `/api/v1/remote/phones/${DISP_A}/folders/${prima.cartellaId}/revoke`, {})).dati, { revocata: true });
  await assert.rejects(invia('dopo la revoca'), { code: 'CONSENT_REQUIRED' });
  assert.equal(b.riprese.length, 1, '⛔ scritto dopo la revoca');
});

test('CR-06 chiuso a guasto: una sessione vera la cui cartella non si risolve è rifiutata; una sessione che non esiste arriva al 404', async () => {
  const b = banco();
  await b.pc('POST', `/api/v1/remote/phones/${DISP_A}/folders`, { percorso: b.avm });
  b.sessioni.set('sparita', join(b.radice, 'mai-esistita'));
  await assert.rejects(b.chiama({ metodo: 'POST', percorso: '/api/v1/sessions/sparita/resume', corpo: { messaggio: 'x' }, origine: 'telefono', origineRemota: b.remota() }),
    (e) => e.code === 'CONSENT_REQUIRED' && e.stato === 403);
  assert.equal(b.riprese.length, 0);
  // AL CONTRARIO: una sessione inesistente non è un consenso mancante — la rotta dice che non c'è
  for (const coda of ['resume', 'stop']) {
    await assert.rejects(b.chiama({ metodo: 'POST', percorso: `/api/v1/sessions/nessuna/${coda}`, corpo: coda === 'resume' ? { messaggio: 'x' } : {}, origine: 'telefono', origineRemota: b.remota() }),
      (e) => e.code === 'NOT_FOUND' && e.stato === 404, coda);
  }
});

test('CR-07 il dispositivo non raggiunge MAI le rotte della finestra del remoto, nemmeno in lettura; il PC sì', async () => {
  const b = banco();
  const [avmRiga] = (await b.operazioni.esegui('projects.list', {}, b.contesto())).items;
  const attesa = await b.operazioni.esegui('consent.request', { cartellaId: avmRiga.cartellaId }, b.contesto());
  const dalDispositivo = (metodo, percorso, corpo) => b.chiama({ metodo, percorso, corpo, origine: `telefono:${DISP_A}`, origineRemota: b.remota() });
  await assert.rejects(dalDispositivo('POST', `/api/v1/remote/consents/${attesa.richiestaId}/allow`, {}), (e) => e.code === 'REMOTE_ORIGIN_FORBIDDEN' && e.stato === 403);
  await assert.rejects(dalDispositivo('POST', `/api/v1/remote/phones/${DISP_A}/folders`, { percorso: b.avm }), { code: 'REMOTE_ORIGIN_FORBIDDEN' });
  await assert.rejects(dalDispositivo('GET', `/api/v1/remote/phones/${DISP_A}/folders`), { code: 'REMOTE_ORIGIN_FORBIDDEN' }, 'i percorsi interi restano sul PC');
  assert.equal(await b.cartelle.consentita(DISP_A, b.avm), false, '⛔ il dispositivo si è consentito da solo');
  // AL CONTRARIO: la stessa risposta dalla finestra passa
  assert.equal((await b.pc('POST', `/api/v1/remote/consents/${attesa.richiestaId}/allow`, {})).dati.esito, 'consentita');
  assert.equal(await b.cartelle.consentita(DISP_A, b.avm), true);
});

test('CR-08 le rotte del PC rifiutano ciò che non è una cartella da dare: la cartella dei dati, una che non c\'è, corpi e id storti', async () => {
  const b = banco();
  await assert.rejects(b.pc('POST', `/api/v1/remote/phones/${DISP_A}/folders`, { percorso: b.dati }), (e) => e.code === 'FOLDER_NOT_ALLOWED' && e.stato === 403);
  await assert.rejects(b.pc('POST', `/api/v1/remote/phones/${DISP_A}/folders`, { percorso: join(b.radice, 'non-esiste') }), (e) => e.code === 'FOLDER_INVALID' && e.stato === 400);
  await assert.rejects(b.pc('POST', `/api/v1/remote/phones/${DISP_A}/folders`, { percorso: b.avm, altro: 1 }), (e) => e.code === 'QUERY_INVALID' && e.stato === 400);
  await assert.rejects(b.pc('POST', '/api/v1/remote/phones/corto/folders', { percorso: b.avm }), { code: 'QUERY_INVALID' });
  await assert.rejects(b.pc('POST', `/api/v1/remote/phones/${DISP_A}/folders/${'z'.repeat(32)}/revoke`, {}), (e) => e.code === 'NOT_FOUND' && e.stato === 404);
  await assert.rejects(b.pc('POST', `/api/v1/remote/consents/${'q'.repeat(22)}/allow`, {}), (e) => e.code === 'CONSENT_NOT_PENDING' && e.stato === 409);
  assert.deepEqual((await b.pc('GET', `/api/v1/remote/phones/${DISP_A}/folders`)).dati, { cartelle: [] });
  // AL CONTRARIO: una cartella vera si dà
  assert.equal((await b.pc('POST', `/api/v1/remote/phones/${DISP_A}/folders`, { percorso: b.app })).dati.nome, 'app');
});

test('CR-09 consent.wait: solo chi ha chiesto la può attendere; un id storto è BAD_MESSAGE', async () => {
  const b = banco();
  const [avmRiga] = (await b.operazioni.esegui('projects.list', {}, b.contesto())).items;
  const attesa = await b.operazioni.esegui('consent.request', { cartellaId: avmRiga.cartellaId }, b.contesto());
  await assert.rejects(b.operazioni.esegui('consent.wait', { richiestaId: attesa.richiestaId }, b.contesto(DISP_B)), { code: 'NOT_FOUND' });
  await assert.rejects(b.operazioni.esegui('consent.wait', { richiestaId: '../x' }, b.contesto()), (e) => e.code === 'BAD_MESSAGE' && e.stato === 400);
  await assert.rejects(b.operazioni.esegui('consent.request', {}, b.contesto()), (e) => e.code === 'BAD_MESSAGE' && e.stato === 400);
  // AL CONTRARIO: chi ha chiesto riceve l'esito
  await b.pc('POST', `/api/v1/remote/consents/${attesa.richiestaId}/deny`, {});
  assert.deepEqual(await b.operazioni.esegui('consent.wait', { richiestaId: attesa.richiestaId }, b.contesto()), { esito: 'negata' });
});
