import assert from 'node:assert/strict';
import { mkdirSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

import { createHttpApp } from '../src/http-app.mjs';
import { iscriviConRigiocata } from '../src/iscrizione-sessione.mjs';
import { creaCartelleDeiDispositivi } from '../src/remoto/cartelle-dispositivi.mjs';
import { creaChiamataInterna } from '../src/remoto/chiamata-interna.mjs';
import { creaOperazioni } from '../src/remoto/operazioni.mjs';
import { cartellaDiProva } from './aiuto/cartelle-di-prova.mjs';

/*
 * 24/10/2026 — parità remoto ↔ desktop, punto 2 (owner 23/10 sera, «IMPRESCINDIBILMENTE NON NEGOZIABILE»; censimento in handoff
 *   `CENSIMENTO-PARITA-REMOTO-2026-10-23.md`): le azioni piccole che la finestra del PC ha già — coda (invia ora, togli), riassunto
 *   (salta, annulla una compattazione), duplica, elimina, deleghe (pausa, riprendi, riprova), processi (ferma, togli, in sottofondo) —
 *   diventano operazioni del dispositivo. Le rotte sono quelle della finestra; qui si prova che ogni operazione arriva alla SUA rotta,
 *   che gli id storti non diventano mai un pezzo di percorso, e che il consenso della cartella vale per le scritture ma non per fermare.
 */
const DISP = 'dispositivo-A1';

/* operazione → [percorso atteso (sessione «s1»), corpo atteso] */
const ATTESE = {
  'session.queue.send': [{ sessionId: 's1', corpo: { id: 'q-1' } }, '/api/v1/sessions/s1/queue/invia', { id: 'q-1' }],
  'session.queue.cancel': [{ sessionId: 's1', corpo: { id: 'q-1' } }, '/api/v1/sessions/s1/queue/annulla', { id: 'q-1' }],
  'session.compact.skip': [{ sessionId: 's1' }, '/api/v1/sessions/s1/compaction/skip', {}],
  'session.compact.undo': [{ sessionId: 's1', compactionAt: '2026-10-24T09:15:00.000Z' }, '/api/v1/sessions/s1/compaction/2026-10-24T09%3A15%3A00.000Z/undo', {}],
  'session.fork': [{ sessionId: 's1' }, '/api/v1/sessions/s1/fork', {}],
  'session.delete': [{ sessionId: 's1' }, '/api/v1/sessions/s1/delete', {}],
  'session.delegation.pause': [{ sessionId: 's1' }, '/api/v1/sessions/s1/delegation/pause', {}],
  'session.delegation.resume': [{ sessionId: 's1' }, '/api/v1/sessions/s1/delegation/resume', {}],
  'session.delegation.retry': [{ sessionId: 's1' }, '/api/v1/sessions/s1/delegation/retry', {}],
  'session.process.stop': [{ sessionId: 's1', toolCallId: 'call_7' }, '/api/v1/sessions/s1/processes/call_7/stop', {}],
  'session.process.remove': [{ sessionId: 's1', toolCallId: 'call_7' }, '/api/v1/sessions/s1/processes/call_7/remove', {}],
  'session.process.background': [{ sessionId: 's1', toolCallId: 'call_7' }, '/api/v1/sessions/s1/processes/call_7/sfondo', {}],
};
const FERMARE = new Set(['session.delegation.pause', 'session.process.stop']);

test('OPP-01 ogni azione piccola arriva alla SUA rotta del PC, in POST, col corpo che la rotta vuole, e porta l\'identità del canale', async () => {
  const chiamate = [];
  const chiama = async (c) => { chiamate.push(c); return { stato: 200, dati: { ok: true } }; };
  const operazioni = creaOperazioni({ chiama, sessionRegistry: { elenca: () => [] }, iscriviConRigiocata });
  const contesto = { dispositivo: { id: DISP, nome: 'OnePlus Pad 3' }, iscrizioni: new Map(), iscrivi: () => async () => {} };
  for (const [op, [args, percorso, corpo]] of Object.entries(ATTESE)) {
    assert.ok(operazioni.elenco().includes(op), `${op} non è nell'elenco`);
    chiamate.length = 0;
    assert.deepEqual(await operazioni.esegui(op, args, contesto), { ok: true }, op);
    assert.equal(chiamate.length, 1, op);
    assert.deepEqual([chiamate[0].metodo, chiamate[0].percorso, chiamate[0].corpo], ['POST', percorso, corpo], op);
    assert.equal(chiamate[0].origineRemota?.dispositivoId, DISP, `${op}: l'identità viene dal canale`);
  }
});

test('OPP-02 al contrario: un id storto non diventa mai un pezzo di percorso (BAD_MESSAGE, nessuna chiamata)', async () => {
  const chiamate = [];
  const operazioni = creaOperazioni({ chiama: async (c) => { chiamate.push(c); return { dati: {} }; }, sessionRegistry: { elenca: () => [] }, iscriviConRigiocata });
  const contesto = { dispositivo: { id: DISP, nome: 'X' }, iscrizioni: new Map(), iscrivi: () => async () => {} };
  const storti = [
    ['session.fork', { sessionId: '..' }],
    ['session.delete', { sessionId: 's1/../../settings' }],
    ['session.delete', {}],
    ['session.compact.undo', { sessionId: 's1' }],
    ['session.compact.undo', { sessionId: 's1', compactionAt: '../x' }],
    ['session.process.stop', { sessionId: 's1', toolCallId: '../../stop' }],
    ['session.process.stop', { sessionId: 's1', toolCallId: 7 }],
    ['session.process.remove', { sessionId: 's1' }],
    ['session.process.background', { sessionId: 's1', toolCallId: '' }],
    ['session.queue.send', { sessionId: 's1', corpo: [] }],
  ];
  for (const [op, args] of storti) {
    await assert.rejects(operazioni.esegui(op, args, contesto), { code: 'BAD_MESSAGE' }, `${op} ${JSON.stringify(args)}`);
  }
  assert.equal(chiamate.length, 0, '⛔ un id storto è arrivato al PC');
});

function banco() {
  const radice = cartellaDiProva('talos-operazioni-piccole-');
  const crea = (...parti) => { const p = join(radice, ...parti); mkdirSync(p, { recursive: true }); return realpathSync(p); };
  const avm = crea('progetti', 'AVM');
  const dati = crea('dati');
  const sessioni = new Map([['s1', avm]]);
  const fatte = [];
  const segna = (nome, esito) => (...a) => { fatte.push([nome, ...a]); return esito; };
  const sessionRegistry = {
    cartellePiuUsate: () => [{ percorso: avm, conteggio: 1, ultimaVolta: '2026-10-24T10:00:00.000Z' }],
    elenca: () => [...sessioni.keys()].map((sessionId) => ({ sessionId, titolo: sessionId })),
    esiste: (id) => sessioni.has(id),
    async cartellaPerChatFile(id) { return sessioni.has(id) ? { ok: true, cartella: sessioni.get(id) } : { code: 'NOT_FOUND', reason: 'session-not-found' }; },
    inviaDallaCoda: async (id, qid) => { fatte.push(['inviaDallaCoda', id, qid]); return { modo: 'correzione', coda: [] }; },
    svuotaCoda: segna('svuotaCoda', { rimosso: 1, coda: [] }),
    saltaRiassunto: segna('saltaRiassunto', { saltato: true }),
    annullaCompattazione: async (id, at) => { fatte.push(['annullaCompattazione', id, at]); return { ok: true }; },
    forka: segna('forka', { sessionId: 's2' }),
    elimina: async (id) => { fatte.push(['elimina', id]); return { ok: true }; },
    pausaDelega: segna('pausaDelega', 'in-pausa'),
    riprendiDelega: segna('riprendiDelega', { esito: 'ripresa' }),
    fermaComando: segna('fermaComando', 'fermato'),
    togliProcesso: segna('togliProcesso', 'tolto'),
    sfondaComando: segna('sfondaComando', 'sfondato'),
  };
  const cartelle = creaCartelleDeiDispositivi({ fileConsensi: join(dati, 'remoto', 'consensi.json'), fileSegreto: join(dati, 'remoto', 'segreto-cartelle'),
    sessionRegistry, cartelleAmmesse: [], cartelleEscluse: [dati] });
  const httpApp = createHttpApp({ staticHandler: async () => null, sessionRegistry, remotoFn: () => ({ cartelle }) });
  const chiama = creaChiamataInterna({ httpApp, porta: 4999 });
  const operazioni = creaOperazioni({ chiama, sessionRegistry, iscriviConRigiocata, cartelle });
  const contesto = { dispositivo: { id: DISP, nome: 'OnePlus Pad 3' }, iscrizioni: new Map(), iscrivi: () => async () => {} };
  const pc = (metodo, percorso, corpo) => chiama({ metodo, percorso, corpo, origine: 'pc' });
  return { avm, fatte, operazioni, contesto, chiama, pc };
}

test('OPP-03 senza il consenso della cartella le scritture sono CONSENT_REQUIRED e il PC non fa niente; fermare un processo e mettere in pausa una delega passano', async () => {
  const b = banco();
  for (const [op, [args]] of Object.entries(ATTESE)) {
    if (FERMARE.has(op)) continue;
    /* dall'operazione, coi parametri della cartella che servono alla carta del dispositivo (la rotta da sola non li dà) */
    await assert.rejects(b.operazioni.esegui(op, args, b.contesto),
      (e) => e.code === 'CONSENT_REQUIRED' && e.stato === 403 && e.reason === 'consent-required' && e.params?.nome === 'AVM', op);
  }
  assert.deepEqual(b.fatte, [], '⛔ il PC ha scritto senza consenso');
  // anche saltando l'operazione: la rotta è il cancello vero
  for (const coda of ['fork', 'delete', 'delegation/resume', 'processes/call_7/remove', 'processes/call_7/sfondo', 'compaction/skip']) {
    await assert.rejects(b.chiama({ metodo: 'POST', percorso: `/api/v1/sessions/s1/${coda}`, corpo: {}, origine: 'telefono', origineRemota: { tipo: 'telefono', nome: 'X', dispositivoId: DISP } }),
      (e) => e.code === 'CONSENT_REQUIRED' && e.stato === 403, coda);
  }
  assert.deepEqual(b.fatte, []);
  // AL CONTRARIO: fermare è sempre ammesso, dall'operazione e dalla rotta
  assert.deepEqual(await b.operazioni.esegui('session.process.stop', ATTESE['session.process.stop'][0], b.contesto), { stopped: true });
  assert.deepEqual(await b.operazioni.esegui('session.delegation.pause', ATTESE['session.delegation.pause'][0], b.contesto), { childId: 's1', paused: true });
  assert.deepEqual(b.fatte, [['fermaComando', 's1', 'call_7'], ['pausaDelega', 's1']]);
});

test('OPP-04 l\'eccezione del «fermare» è stretta: solo `processes/<id>/stop` e `delegation/pause`, non un percorso che ci somiglia', async () => {
  const b = banco();
  const dalDispositivo = (percorso) => b.chiama({ metodo: 'POST', percorso, corpo: {}, origine: 'telefono', origineRemota: { tipo: 'telefono', nome: 'X', dispositivoId: DISP } });
  for (const percorso of ['/api/v1/sessions/s1/processes/stop', '/api/v1/sessions/s1/processes/call_7/stop/x', '/api/v1/sessions/s1/delegation/pause/x',
    '/api/v1/sessions/s1/delegation', '/api/v1/sessions/s1/x/call_7/stop']) {
    await assert.rejects(dalDispositivo(percorso), (e) => e.code === 'CONSENT_REQUIRED' && e.stato === 403, percorso);
  }
  assert.deepEqual(b.fatte, []);
});

test('OPP-05 col consenso le scritture arrivano al registro con gli argomenti giusti, e gli esiti tornano al dispositivo', async () => {
  const b = banco();
  await b.pc('POST', `/api/v1/remote/phones/${DISP}/folders`, { percorso: b.avm });
  const esiti = {};
  for (const [op, [args]] of Object.entries(ATTESE)) esiti[op] = await b.operazioni.esegui(op, args, b.contesto);
  assert.deepEqual(b.fatte, [
    ['inviaDallaCoda', 's1', 'q-1'],
    ['svuotaCoda', 's1', { id: 'q-1' }],
    ['saltaRiassunto', 's1'],
    ['annullaCompattazione', 's1', '2026-10-24T09:15:00.000Z'],
    ['forka', 's1'],
    ['elimina', 's1'],
    ['pausaDelega', 's1'],
    ['riprendiDelega', 's1', 'resume'],
    ['riprendiDelega', 's1', 'retry'],
    ['fermaComando', 's1', 'call_7'],
    ['togliProcesso', 's1', 'call_7'],
    ['sfondaComando', 's1', 'call_7'],
  ]);
  assert.equal(esiti['session.fork'].sessionId, 's2', 'duplicare dice al dispositivo la sessione nuova');
  assert.equal(esiti['session.compact.skip'].saltato, true);
  assert.equal(esiti['session.queue.cancel'].rimosso, 1);
});
