import assert from 'node:assert/strict';
import { mkdirSync, realpathSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

import { createHttpApp } from '../src/http-app.mjs';
import { iscriviConRigiocata } from '../src/iscrizione-sessione.mjs';
import { creaCartelleDeiDispositivi } from '../src/remoto/cartelle-dispositivi.mjs';
import { creaChiamataInterna } from '../src/remoto/chiamata-interna.mjs';
import { creaOperazioni } from '../src/remoto/operazioni.mjs';
import { cartellaDiProva } from './aiuto/cartelle-di-prova.mjs';

/*
 * 24/10/2026 — parità remoto ↔ desktop, punto 4: la Chat del dispositivo sul PC (owner 23/10 sera, terza tornata; contratto Parte 4 in
 *   handoff `CONTRATTO-DISPOSITIVI-CARTELLE-FILE-RISORSE-2026-10-23.md`, d'accordo col Mobile il 24/10). Una cartella di serie nei dati
 *   di TALOS, chiesta con `chat.folder` e MAI elencata fra le cartelle del Codice (i dispositivi già usciti la mostrerebbero), unica
 *   eccezione alla cartella dei dati; consenso una volta per dispositivo; `dispositivoId` sulle righe delle sue sessioni; togliere un
 *   messaggio (`session.message.delete`, il primo DELETE del dispositivo) col cancello del consenso che guarda OGNI scrittura.
 */
const DISP_A = 'dispositivo-A1';
const DISP_B = 'dispositivo-B2';

function banco({ conChat = true } = {}) {
  // 25/10/2026 (PR #81 della 0.1.37, CI rossa): sul runner la TEMP ha il nome corto di Windows (RUNNER~1); il prodotto mostra il percorso vero (`realpathSync.native`, decisione F-E-001), quindi anche la radice di prova si prende col percorso vero, e l'atteso torna uguale su ogni macchina.
  const radice = realpathSync.native(cartellaDiProva('talos-chat-dispositivi-'));
  const crea = (...parti) => { const p = join(radice, ...parti); mkdirSync(p, { recursive: true }); return realpathSync(p); };
  const avm = crea('progetti', 'AVM');
  const dati = crea('dati');
  const chat = join(dati, 'remoto', 'Chats from devices');
  const accanto = crea('dati', 'remoto', 'altro');
  const sessioni = new Map();
  const avviate = []; const tolti = [];
  const sessionRegistry = {
    /* la cartella della Chat è anche fra le recenti, come sarà dopo la prima chat: non deve arrivare all'elenco del Codice */
    cartellePiuUsate: () => [{ percorso: avm, conteggio: 1, ultimaVolta: '2026-10-24T10:00:00.000Z' }, ...(existsSync(chat) ? [{ percorso: chat, conteggio: 3, ultimaVolta: '2026-10-24T11:00:00.000Z' }] : [])],
    elenca: () => [...sessioni.keys()].map((sessionId) => ({ sessionId, titolo: sessionId })),
    esiste: (id) => sessioni.has(id),
    avviaLibero: (richiesta) => { const sessionId = `s${avviate.length + 1}`; avviate.push(richiesta); sessioni.set(sessionId, richiesta.cartellaLibera); return { sessionId }; },
    async cartellaPerChatFile(id) {
      if (!sessioni.has(id)) return { code: 'NOT_FOUND', reason: 'session-not-found' };
      try { return { ok: true, cartella: realpathSync(sessioni.get(id)) }; } catch { return { code: 'SESSION_NOT_READY' }; }
    },
    resume: (id) => ({ sessionId: id }),
    rimuoviMessaggio: async (id, riferimento) => { tolti.push([id, riferimento]); return { riferimento }; },
  };
  const cartelle = creaCartelleDeiDispositivi({ fileConsensi: join(dati, 'remoto', 'consensi.json'), fileSegreto: join(dati, 'remoto', 'segreto-cartelle'),
    sessionRegistry, cartelleAmmesse: [], cartelleEscluse: [dati], ...(conChat ? { cartellaChat: chat } : {}) });
  const httpApp = createHttpApp({ staticHandler: async () => null, sessionRegistry, remotoFn: () => ({ cartelle }) });
  const chiama = creaChiamataInterna({ httpApp, porta: 4999 });
  const operazioni = creaOperazioni({ chiama, sessionRegistry, iscriviConRigiocata, cartelle });
  const contesto = (id = DISP_A, nome = 'OnePlus Pad 3') => ({ dispositivo: { id, nome }, iscrizioni: new Map(), iscrivi: () => async () => {} });
  const remota = (id = DISP_A) => ({ tipo: 'telefono', nome: 'OnePlus Pad 3', dispositivoId: id });
  const pc = (metodo, percorso, corpo) => chiama({ metodo, percorso, corpo, origine: 'pc' });
  return { radice, avm, dati, chat, accanto, sessioni, avviate, tolti, cartelle, chiama, operazioni, contesto, remota, pc };
}

test('CHD-01 chat.folder: la cartella nasce alla prima richiesta, col suo id e senza consenso; MAI nell\'elenco del Codice, nemmeno quando è fra le recenti', async () => {
  const b = banco();
  assert.equal(existsSync(b.chat), false);
  const c = await b.operazioni.esegui('chat.folder', {}, b.contesto());
  assert.equal(existsSync(b.chat), true, 'creata alla prima richiesta');
  assert.deepEqual([c.nome, c.consentita, /^[A-Za-z0-9_-]{32}$/u.test(c.cartellaId)], ['Chats from devices', false, true]);
  assert.equal(JSON.stringify(c).includes(b.radice), false, 'nessun percorso al dispositivo');
  const { items } = await b.operazioni.esegui('projects.list', {}, b.contesto());
  assert.deepEqual(items.map((r) => r.nome), ['AVM'], '⛔ i dispositivi già usciti la mostrerebbero fra le cartelle del Codice');
  assert.ok(items.every((r) => !Object.hasOwn(r, 'tipo')));
  /* stessa cartella, stesso id, per ogni dispositivo (una cartella condivisa, Mobile 24/10); il consenso resta per dispositivo */
  assert.equal((await b.operazioni.esegui('chat.folder', {}, b.contesto(DISP_B))).cartellaId, c.cartellaId);
});

test('CHD-02 la Chat sul PC: la prima chat aspetta la carta del PC, poi parte NELLA cartella della Chat e la riga dice da quale dispositivo', async () => {
  const b = banco();
  const { cartellaId } = await b.operazioni.esegui('chat.folder', {}, b.contesto());
  const attesa = await b.operazioni.esegui('session.start', { corpo: { cartellaId, consegna: 'ciao dal Pad' } }, b.contesto());
  assert.equal(attesa.stato, 'attesa-consenso');
  assert.equal(b.avviate.length, 0);
  const { dati } = await b.pc('POST', `/api/v1/remote/consents/${attesa.richiestaId}/allow`, {});
  assert.deepEqual(dati, { esito: 'consentita', sessionId: 's1' });
  assert.equal(b.avviate[0].cartellaLibera, realpathSync(b.chat));
  assert.equal(b.avviate[0].consegna, 'ciao dal Pad');
  /* da consentita, la seconda parte subito */
  assert.deepEqual(await b.operazioni.esegui('session.start', { corpo: { cartellaId, consegna: 'seconda' } }, b.contesto()), { sessionId: 's2' });
  assert.equal((await b.operazioni.esegui('chat.folder', {}, b.contesto())).consentita, true);
  /* le righe delle sessioni della Chat portano chi le ha aperte, anche lette da un altro dispositivo; le altre no */
  b.sessioni.set('s-pc', b.avm);
  const righe = (await b.operazioni.esegui('sessions.list', {}, b.contesto(DISP_B))).items;
  const perId = Object.fromEntries(righe.map((r) => [r.sessionId, r]));
  assert.deepEqual([perId.s1.dispositivoId, perId.s2.dispositivoId, perId.s1.cartellaId], [DISP_A, DISP_A, cartellaId]);
  assert.equal(Object.hasOwn(perId['s-pc'], 'dispositivoId'), false);
  assert.equal(perId.s1.consentita, false, 'per B la cartella della Chat non è consentita');
  /* sopravvive al riavvio: il ricordo sta col file dei consensi */
  await b.cartelle.attendiScritture();
  const rinato = creaCartelleDeiDispositivi({ fileConsensi: join(b.dati, 'remoto', 'consensi.json'), fileSegreto: join(b.dati, 'remoto', 'segreto-cartelle'),
    cartelleEscluse: [b.dati], cartellaChat: b.chat });
  assert.equal(await rinato.dispositivoDellaSessioneChat('s1'), DISP_A);
});

test('CHD-03 al contrario: l\'eccezione è ESATTAMENTE la cartella della Chat — i dati accanto restano di TALOS, e senza la cartella configurata non c\'è niente', async () => {
  const b = banco();
  await b.operazioni.esegui('chat.folder', {}, b.contesto());
  assert.equal((await b.cartelle.verifica(b.accanto, DISP_A)).esito, 'esclusa', 'una cartella accanto, nei dati');
  assert.equal((await b.cartelle.verifica(b.dati, DISP_A)).esito, 'esclusa', 'la cartella dei dati stessa');
  const sotto = join(b.chat, 'dentro'); mkdirSync(sotto);
  assert.equal((await b.cartelle.verifica(sotto, DISP_A)).esito, 'esclusa', 'una cartella DENTRO quella della Chat');
  await assert.rejects(b.pc('POST', `/api/v1/remote/phones/${DISP_A}/folders`, { percorso: b.accanto }), (e) => e.code === 'FOLDER_NOT_ALLOWED');
  assert.equal((await b.cartelle.verifica(b.chat, DISP_A)).esito, 'ok');
  const senza = banco({ conChat: false });
  await assert.rejects(senza.operazioni.esegui('chat.folder', {}, senza.contesto()), (e) => e.code === 'CHAT_UNAVAILABLE' && e.stato === 404);
});

test('CHD-04 togliere un messaggio: senza consenso no (anche saltando l\'operazione: il cancello guarda il DELETE); col consenso arriva al registro; un id storto non parte', async () => {
  const b = banco();
  const { cartellaId } = await b.operazioni.esegui('chat.folder', {}, b.contesto());
  b.sessioni.set('s-chat', b.chat);
  await assert.rejects(b.operazioni.esegui('session.message.delete', { sessionId: 's-chat', messageId: 'm-7' }, b.contesto()),
    (e) => e.code === 'CONSENT_REQUIRED' && e.stato === 403 && e.params?.cartellaId === cartellaId);
  await assert.rejects(b.chiama({ metodo: 'DELETE', percorso: '/api/v1/sessions/s-chat/messages/m-7', origine: 'telefono', origineRemota: b.remota() }),
    (e) => e.code === 'CONSENT_REQUIRED' && e.stato === 403, '⛔ un DELETE dal dispositivo saltava il cancello che guardava solo POST');
  assert.deepEqual(b.tolti, []);
  for (const messageId of ['../x', '', 7, 'a/b']) {
    await assert.rejects(b.operazioni.esegui('session.message.delete', { sessionId: 's-chat', messageId }, b.contesto()), { code: 'BAD_MESSAGE' }, String(messageId));
  }
  await b.pc('POST', `/api/v1/remote/phones/${DISP_A}/folders`, { percorso: b.chat });
  assert.deepEqual(await b.operazioni.esegui('session.message.delete', { sessionId: 's-chat', messageId: 'm-7' }, b.contesto()), { rimosso: true, riferimento: 'm-7' });
  assert.deepEqual(b.tolti, [['s-chat', 'm-7']]);
  /* AL CONTRARIO: dal PC (la finestra) il DELETE passa senza consenso, come sempre */
  await b.pc('DELETE', '/api/v1/sessions/s-chat/messages/m-8');
  assert.deepEqual(b.tolti.at(-1), ['s-chat', 'm-8']);
});
