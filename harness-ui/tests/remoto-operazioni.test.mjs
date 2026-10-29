import assert from 'node:assert/strict';
import test from 'node:test';
import { createHttpApp } from '../src/http-app.mjs';
import { iscriviConRigiocata } from '../src/iscrizione-sessione.mjs';
import { bollaValida } from '../src/bolla-della-persona.mjs';
import { bollaConOrigine, origineValida } from '../src/origine-remota.mjs';
import { createServer } from 'node:http';
import { creaChiamataInterna } from '../src/remoto/chiamata-interna.mjs';
import { BATTITO_REMOTO, BATTITO_REMOTO_MS, OPERAZIONI_HTTP, battitoConStato, creaOperazioni } from '../src/remoto/operazioni.mjs';

/*
 * 18/10/2026 — controllo remoto, l'elenco CHIUSO delle operazioni sopra il gestore HTTP VERO (`createHttpApp`), chiamato in processo:
 * le risposte e i rifiuti del telefono sono quelli della finestra del PC (stessi validatori), e la rigiocata degli eventi è la
 * stessa della rotta `/events`. Nessuna rete. Ogni prova ha il suo verso contrario.
 */
function registroFinto() {
  const chiamate = [];
  const bolle = [];
  const eventi = [
    { type: 'RunStarted', runId: 'r', _sequenza: 1 },
    { type: 'TextMessageStart', messageId: 'm', _sequenza: 2 },
    { type: 'TextMessageContent', messageId: 'm', delta: 'ci', _sequenza: 3 },
    { type: 'TextMessageContent', messageId: 'm', delta: 'ao', _sequenza: 4 },
  ];
  const ascoltatori = new Set();
  return {
    chiamate, ascoltatori, bolle,
    emetti(e) { for (const a of ascoltatori) a(e); },
    elenca: () => [{ sessionId: 's-1', titolo: 'Prova' }],
    esiste: (id) => id === 's-1',
    resume: (id, msg, _immagini, opzioni) => { chiamate.push(['resume', id, msg]); if (opzioni?.bolla) bolle.push(opzioni.bolla); return id === 's-1' ? { sessionId: id } : { erroreAvvio: 'Session not found', code: 'NOT_FOUND' }; },
    ferma: (id) => { chiamate.push(['ferma', id]); return id === 's-1'; },
    iscriviti: (id, asc, da) => { for (const e of eventi) if (e._sequenza > da) asc(e); ascoltatori.add(asc); return () => ascoltatori.delete(asc); },
    statoCoda: () => ({ voci: [], inPausa: false }),
  };
}

function banco(opzioni = {}) {
  const sessionRegistry = registroFinto();
  const httpApp = createHttpApp({ staticHandler: async () => null, sessionRegistry });
  const chiama = creaChiamataInterna({ httpApp, porta: 4999 });
  const operazioni = creaOperazioni({ chiama, sessionRegistry, iscriviConRigiocata, ...opzioni });
  const iscrizioni = new Map();
  const ricevuti = [];
  const contesto = { dispositivo: { id: 'd-1', nome: 'Pad' }, iscrizioni, iscrivi: (sub, chiudi) => { iscrizioni.set(sub, chiudi); return async (data) => { ricevuti.push({ sub, data }); }; } };
  return { sessionRegistry, operazioni, contesto, ricevuti };
}

test('OPS-01 elenco delle sessioni dal gestore vero, senza rete', async () => {
  const b = banco();
  assert.deepEqual(await b.operazioni.esegui('sessions.list', {}, b.contesto), { items: [{ sessionId: 's-1', titolo: 'Prova' }] });
});

test('OPS-02 messaggio: arriva al registro; un corpo sbagliato è rifiutato dallo STESSO validatore della finestra', async () => {
  const b = banco();
  assert.deepEqual(await b.operazioni.esegui('session.send', { sessionId: 's-1', corpo: { messaggio: ' ciao ' } }, b.contesto), { sessionId: 's-1' });
  assert.deepEqual(b.sessionRegistry.chiamate, [['resume', 's-1', 'ciao']]);
  await assert.rejects(b.operazioni.esegui('session.send', { sessionId: 's-1', corpo: { messaggio: 5 } }, b.contesto), { code: 'QUERY_INVALID' });
  await assert.rejects(b.operazioni.esegui('session.send', { sessionId: 's-1', corpo: { messaggio: 'x', altro: 1 } }, b.contesto), { code: 'QUERY_INVALID' });
  assert.equal(b.sessionRegistry.chiamate.length, 1, 'i corpi rifiutati non arrivano al registro');
});

test('OPS-03 stop: sessione vera fermata, sessione sconosciuta NOT_FOUND', async () => {
  const b = banco();
  assert.deepEqual(await b.operazioni.esegui('session.stop', { sessionId: 's-1' }, b.contesto), { stopped: true });
  await assert.rejects(b.operazioni.esegui('session.stop', { sessionId: 's-2' }, b.contesto), { code: 'NOT_FOUND' });
});

test('OPS-04 elenco chiuso: operazioni fuori elenco e id di sessione che cercano di uscire dal percorso sono rifiutati', async () => {
  const b = banco();
  for (const op of ['shell.exec', 'http.request', 'session.trust', 'mcp.trust', '__proto__', 'toString']) {
    await assert.rejects(b.operazioni.esegui(op, {}, b.contesto), { code: 'UNKNOWN_OPERATION' }, op);
  }
  for (const sessionId of ['../providers', 's-1/../../x', 's 1', '', 5]) {
    await assert.rejects(b.operazioni.esegui('session.stop', { sessionId }, b.contesto), { code: 'BAD_MESSAGE' }, String(sessionId));
  }
  await assert.rejects(b.operazioni.esegui('session.send', { sessionId: 's-1', corpo: [1] }, b.contesto), { code: 'BAD_MESSAGE' });
  assert.deepEqual(b.sessionRegistry.chiamate, []);
  assert.ok(!b.operazioni.elenco().some((o) => /trust|fid/i.test(o)), 'rendere fidati MCP, hook e plugin resta solo dal PC (ELENCO-AZIONI §7.3)');
  assert.ok(Object.values(OPERAZIONI_HTTP).every((v) => typeof v.percorso === 'function' && /^(GET|POST|PATCH|DELETE)$/.test(v.metodo)));
  /* owner 27/10/2026 («il dispositivo cambia tutte le impostazioni»): il primo PATCH, le impostazioni del motore del contesto. Il cancello del
     consenso del server guarda ogni metodo che non sia GET/HEAD (`http-app.mjs`), quindi anche questo; l'elenco dei PATCH è chiuso qui */
  assert.deepEqual(Object.entries(OPERAZIONI_HTTP).filter(([, v]) => v.metodo === 'PATCH').map(([n]) => n), ['session.context.settings']);
  /* parità, punto 4 (24/10): il primo DELETE — ammesso solo dopo che il cancello del consenso del server guarda OGNI scrittura, non solo
     POST (`http-app.mjs`); l'elenco dei DELETE è chiuso qui, e il consenso lo provano `remoto-chat-dispositivi` CHD-04 */
  assert.deepEqual(Object.entries(OPERAZIONI_HTTP).filter(([, v]) => v.metodo === 'DELETE').map(([n]) => n), ['session.message.delete']);
});

test('OPS-05 eventi dal numero N: la storia coalescente come /events, la fine della storia, la coda, poi il presente; disiscrivere ferma', async () => {
  const b = banco();
  assert.deepEqual(await b.operazioni.esegui('session.events', { sessionId: 's-1', after: 2, sub: 'chat' }, b.contesto), { sub: 'chat', after: 2 });
  const tipi = b.ricevuti.map((r) => r.data.type === 'CUSTOM' ? r.data.name : r.data.type);
  assert.deepEqual(tipi, ['TextMessageContent', 'talos.fine-rigiocata', 'talos.coda'], 'gli eventi fino al 2 non tornano, i due pezzi si fondono');
  assert.equal(b.ricevuti[0].data.delta, 'ciao');
  b.sessionRegistry.emetti({ type: 'TextMessageContent', messageId: 'm', delta: '!', _sequenza: 5 });
  assert.equal(b.ricevuti.at(-1).data.delta, '!', 'il presente arriva com\'è');
  assert.deepEqual(await b.operazioni.esegui('session.unsubscribe', { sub: 'chat' }, b.contesto), { sub: 'chat', chiusa: true });
  const prima = b.ricevuti.length;
  b.sessionRegistry.emetti({ type: 'TextMessageContent', messageId: 'm', delta: '?', _sequenza: 6 });
  assert.equal(b.ricevuti.length, prima);
  assert.equal(b.sessionRegistry.ascoltatori.size, 0);
});

/** Un orologio finto: `ogni`/`smetti` come setInterval/clearInterval, `batti()` fa scattare i timer vivi. */
function orologio() {
  const vivi = new Map();
  let n = 0;
  return { vivi, ogni: (fn, ms) => { n += 1; vivi.set(n, { fn, ms }); return n; }, smetti: (id) => { vivi.delete(id); }, batti: () => { for (const t of [...vivi.values()]) t.fn(); } };
}

test('OPS-05b ⛔ il battito: ogni iscrizione viva riceve talos.battito ogni 15 s, senza _sequenza; finisce con l’iscrizione (Mobile 27/10)', async () => {
  const o = orologio();
  const b = banco({ ogni: o.ogni, smetti: o.smetti });
  assert.equal(BATTITO_REMOTO_MS, 15_000);
  await b.operazioni.esegui('session.events', { sessionId: 's-1', after: 4, sub: 'chat' }, b.contesto);
  assert.deepEqual([...o.vivi.values()].map((t) => t.ms), [15_000], 'un timer per l’iscrizione, a 15 s');
  const prima = b.ricevuti.length;
  o.batti();
  const battiti = b.ricevuti.slice(prima);
  assert.deepEqual(battiti, [{ sub: 'chat', data: BATTITO_REMOTO }]);
  assert.equal('_sequenza' in battiti[0].data, false, 'mai salvato né rigiocato: after non si muove');
  // la stessa sub richiesta di nuovo (la «Riprova» del telefono): il timer vecchio si ferma, ne resta uno
  await b.operazioni.esegui('session.events', { sessionId: 's-1', after: 4, sub: 'chat' }, b.contesto);
  assert.equal(o.vivi.size, 1);
  // disiscrivere ferma il battito
  await b.operazioni.esegui('session.unsubscribe', { sub: 'chat' }, b.contesto);
  assert.equal(o.vivi.size, 0);
  const dopo = b.ricevuti.length;
  o.batti();
  assert.equal(b.ricevuti.length, dopo);
  // una connessione che si chiude chiude le sue iscrizioni (servizio.mjs, finally): anche il battito
  await b.operazioni.esegui('session.events', { sessionId: 's-1', sub: 'a' }, b.contesto);
  await b.operazioni.esegui('session.events', { sessionId: 's-1', sub: 'b' }, b.contesto);
  assert.equal(o.vivi.size, 2);
  for (const chiudi of b.contesto.iscrizioni.values()) chiudi();
  assert.equal(o.vivi.size, 0);
});

test('OPS-05d ⛔ il battito porta lo stato della SORGENTE, letto a ogni battito: ultimaSequenza e lavora dal registro (GFR B1/B2)', async () => {
  const o = orologio();
  const b = banco({ ogni: o.ogni, smetti: o.smetti });
  let stato = { ultimaSequenza: 4, lavora: true };
  b.sessionRegistry.statoPerIlBattito = (id) => (id === 's-1' ? stato : null);
  await b.operazioni.esegui('session.events', { sessionId: 's-1', after: 4, sub: 'chat' }, b.contesto);
  const prima = b.ricevuti.length;
  o.batti();
  assert.deepEqual(b.ricevuti.at(-1), { sub: 'chat', data: { type: 'CUSTOM', name: 'talos.battito', value: { ultimaSequenza: 4, lavora: true } } });
  // il PC scrive altri eventi che il filo non porta (l'iscrizione al registro persa): il battito lo dice
  stato = { ultimaSequenza: 9, lavora: false };
  o.batti();
  assert.deepEqual(b.ricevuti.at(-1).data.value, { ultimaSequenza: 9, lavora: false });
  assert.equal(b.ricevuti.length, prima + 2);
  assert.equal('_sequenza' in b.ricevuti.at(-1).data, false, 'mai salvato né rigiocato');
});

test('OPS-05e AL CONTRARIO: un registro senza lo stato, o che lancia, o con uno stato storto ⇒ il battito di prima, vuoto', () => {
  assert.equal(battitoConStato(null), BATTITO_REMOTO);
  assert.equal(battitoConStato({ ultimaSequenza: '4', lavora: true }), BATTITO_REMOTO);
  assert.equal(battitoConStato({ ultimaSequenza: 4 }), BATTITO_REMOTO);
});

test('OPS-05c un battito su uno stream già chiuso non lancia', async () => {
  const o = orologio();
  const b = banco({ ogni: o.ogni, smetti: o.smetti });
  b.contesto.iscrivi = (sub, chiudi) => { b.contesto.iscrizioni.set(sub, chiudi); return async () => { throw new Error('stream chiuso'); }; };
  await b.operazioni.esegui('session.events', { sessionId: 's-1', after: 4, sub: 'chat' }, b.contesto);
  assert.doesNotThrow(() => o.batti());
  await new Promise((r) => setImmediate(r));
});

test('OPS-06 eventi di una sessione che non c\'è: NOT_FOUND, nessun ascoltatore lasciato; la stessa iscrizione due volte ne lascia una', async () => {
  const b = banco();
  await assert.rejects(b.operazioni.esegui('session.events', { sessionId: 's-9', sub: 'x' }, b.contesto), { code: 'NOT_FOUND' });
  assert.equal(b.sessionRegistry.ascoltatori.size, 0);
  await b.operazioni.esegui('session.events', { sessionId: 's-1', sub: 'chat' }, b.contesto);
  await b.operazioni.esegui('session.events', { sessionId: 's-1', sub: 'chat' }, b.contesto);
  assert.equal(b.sessionRegistry.ascoltatori.size, 1);
  await assert.rejects(b.operazioni.esegui('session.events', { sessionId: 's-1' }, b.contesto), { code: 'BAD_MESSAGE' });
});

test('ORI-01 un messaggio dal telefono arriva nella storia con «dal telefono X»: lo mette il server, non il corpo', async () => {
  const b = banco();
  await b.operazioni.esegui('session.send', { sessionId: 's-1', corpo: { messaggio: 'aggiungi il tema scuro' } }, b.contesto);
  assert.deepEqual(b.sessionRegistry.bolle, [{ testo: 'aggiungi il tema scuro', allegati: [], origine: { tipo: 'telefono', nome: 'Pad' } }]);
});

test('ORI-02 al contrario: un client HTTP che scrive bolla.origine la perde al confine', async (t) => {
  const sessionRegistry = registroFinto();
  const server = createServer(createHttpApp({ staticHandler: async () => null, sessionRegistry }));
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  t.after(() => new Promise((r) => server.close(r)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const r = await fetch(`${base}/api/v1/sessions/s-1/resume`, { method: 'POST', headers: { 'content-type': 'application/json', origin: base, 'sec-fetch-site': 'same-origin' },
    body: JSON.stringify({ messaggio: 'ciao', bolla: { testo: 'ciao', allegati: [], origine: { tipo: 'telefono', nome: 'Finto' } } }) });
  assert.equal(r.status, 200);
  assert.deepEqual(sessionRegistry.bolle, [{ testo: 'ciao', allegati: [] }], 'nessuna origine dal corpo');
});

test('ORI-03 la forma dell’origine: solo «telefono», nome tagliato; senza bolla si costruisce dal testo', () => {
  assert.deepEqual(origineValida({ tipo: 'telefono', nome: '  Pad  ' }), { tipo: 'telefono', nome: 'Pad' });
  assert.equal(origineValida({ tipo: 'pc', nome: 'x' }), null);
  assert.equal(origineValida('telefono'), null);
  assert.deepEqual(bollaValida({ testo: 'x', origine: { tipo: 'telefono', nome: 'N'.repeat(99) } }).origine.nome.length, 64);
  assert.equal(bollaValida({ testo: 'x', origine: { tipo: 'altro' } }).origine, undefined);
  assert.equal(bollaConOrigine(null, null, 'testo'), null, 'senza origine niente cambia');
  assert.deepEqual(bollaConOrigine(null, { tipo: 'telefono', nome: 'Pad' }, '  testo  '), { testo: 'testo', allegati: [], origine: { tipo: 'telefono', nome: 'Pad' } });
});

test('OPS-07 (revisione 19/10) un id fatto di soli punti non esce dal percorso fisso: «..» e «.» sono rifiutati, e la chiamata interna non accetta percorsi che la normalizzazione cambierebbe', async () => {
  const b = banco();
  const conId = Object.entries(OPERAZIONI_HTTP).filter(([, v]) => { try { v.percorso({ sessionId: 's-1', serverId: 'srv', turn: 1 }); return /sessions\/s-1/.test(v.percorso({ sessionId: 's-1', serverId: 'srv', turn: 1 })); } catch { return false; } });
  assert.ok(conId.length >= 10, `operazioni con l'id di sessione: ${conId.length}`);
  for (const [op] of conId) {
    for (const sessionId of ['..', '.', '...']) {
      if (sessionId === '...') continue; /* «...» è un id strano ma resta un segmento letterale: non esce */
      await assert.rejects(b.operazioni.esegui(op, { sessionId, serverId: 'srv', turn: 1, corpo: {} }, b.contesto), { code: 'BAD_MESSAGE' }, `${op} ${sessionId}`);
    }
  }
  await assert.rejects(b.operazioni.esegui('session.mcp.test', { sessionId: 's-1', serverId: '..' }, b.contesto), { code: 'BAD_MESSAGE' });
  assert.deepEqual(b.sessionRegistry.chiamate, [], 'niente è arrivato al registro');
  /* il primo livello da solo: l'elenco rifiuta PRIMA di chiamare il gestore (la chiamata interna è una spia) */
  const chiamati = [];
  const soloElenco = creaOperazioni({ chiama: async (x) => { chiamati.push(x.percorso); return { stato: 200, dati: {} }; }, sessionRegistry: registroFinto(), iscriviConRigiocata });
  for (const sessionId of ['..', '.']) await assert.rejects(soloElenco.esegui('session.settings', { sessionId, corpo: {} }, b.contesto), { code: 'BAD_MESSAGE' });
  assert.deepEqual(chiamati, []);
  /* la difesa in profondità: la chiamata interna presa da sola */
  const httpApp = createHttpApp({ staticHandler: async () => null, sessionRegistry: registroFinto() });
  const chiama = creaChiamataInterna({ httpApp, porta: 4999 });
  for (const percorso of ['/api/v1/sessions/../settings', '/api/v1/sessions/./s-1/stop', '/api/v1/sessions/%2e%2e/settings', 'api/v1/sessions', '//evil/x']) {
    await assert.rejects(chiama({ metodo: 'POST', percorso, corpo: {} }), { code: 'BAD_MESSAGE' }, percorso);
  }
  assert.deepEqual((await chiama({ metodo: 'GET', percorso: '/api/v1/sessions' })).dati.items.length, 1, 'un percorso pulito passa');
});
