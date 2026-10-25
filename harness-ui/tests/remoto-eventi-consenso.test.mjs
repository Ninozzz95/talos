import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, realpathSync } from 'node:fs';
import { createServer, request } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { creaAdattatorePortachiaviInMemoria } from '../src/adattatore-keyring.mjs';
import { createHttpApp } from '../src/http-app.mjs';
import { iscriviConRigiocata } from '../src/iscrizione-sessione.mjs';
import { ALPN_LAVORO } from '../src/remoto/accoppiamento.mjs';
import { ATTESA_CONSENSO_MS, creaCartelleDeiDispositivi } from '../src/remoto/cartelle-dispositivi.mjs';
import { creaChiamataInterna } from '../src/remoto/chiamata-interna.mjs';
import { codifica, creaLettore } from '../src/remoto/filo.mjs';
import { creaRemoto } from '../src/remoto/index.mjs';
import { creaOperazioni } from '../src/remoto/operazioni.mjs';
import { ROTTE_REMOTO } from '../src/remoto/rotte.mjs';
import { cartellaDiProva } from './aiuto/cartelle-di-prova.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

/*
 * 24/10/2026 sera — R2.1 del contratto `CONTRATTO-DISPOSITIVI-CARTELLE-FILE-RISORSE-2026-10-23.md` (Parte 1, «Revision 2», AGREED col
 *   Mobile): la carta del consenso deve arrivare sul PC SUBITO. Owner, dopo la prova dal vivo (≈49 s dal tocco alla carta, fino a 20 s
 *   dei quali spesi dalla finestra che CONTROLLAVA ogni 20 s): «È troppo tempo, bisogna renderlo più istantaneo possibile».
 *   ⇒ `GET /api/v1/remote/events`, uno stream SSE per la finestra: `consent.requested` quando la richiesta si registra, `consent.closed`
 *   su consenso, rifiuto, scadenza e dimenticanza del dispositivo. Come Hermes (un WebSocket aperto, `approval.request` come evento:
 *   `apps/desktop/src/api/client.ts:534-540`, `api/canonical-protocol.ts:613`) e Happy (`update` spinto, `apiSession.ts:325`).
 *   Qui le rotte VERE del server su un socket vero (porta scelta dal sistema), il modulo vero delle cartelle, e ogni cosa al contrario.
 */
const DISP_A = 'dispositivo-A1';
const FINESTRA = { 'sec-fetch-site': 'same-origin' };

function banco({ programma = undefined, clock = undefined } = {}) {
  // 25/10/2026 (PR #81 della 0.1.37, CI rossa): sul runner la TEMP ha il nome corto di Windows (RUNNER~1); il prodotto mostra il percorso vero (`realpathSync.native`, decisione F-E-001), quindi anche la radice di prova si prende col percorso vero, e l'atteso torna uguale su ogni macchina.
  const radice = realpathSync.native(cartellaDiProva('talos-eventi-consenso-'));
  const crea = (...parti) => { const p = join(radice, ...parti); mkdirSync(p, { recursive: true }); return realpathSync(p); };
  const avm = crea('progetti', 'AVM');
  const app = crea('progetti', 'app');
  const dati = crea('dati');
  const sessioni = new Map();
  const avviate = [];
  const sessionRegistry = {
    cartellePiuUsate: () => [{ percorso: avm, conteggio: 2, ultimaVolta: '2026-10-24T10:00:00.000Z' }, { percorso: app, conteggio: 1, ultimaVolta: '2026-10-24T09:00:00.000Z' }],
    elenca: () => [...sessioni.keys()].map((sessionId) => ({ sessionId, titolo: sessionId })),
    esiste: (id) => sessioni.has(id),
    avviaLibero: (richiesta) => { const sessionId = `s${avviate.length + 1}`; avviate.push(richiesta); sessioni.set(sessionId, richiesta.cartellaLibera); return { sessionId }; },
    async cartellaPerChatFile(id) { return sessioni.has(id) ? { ok: true, cartella: realpathSync(sessioni.get(id)) } : { code: 'NOT_FOUND', reason: 'session-not-found' }; },
  };
  const cartelle = creaCartelleDeiDispositivi({ fileConsensi: join(dati, 'remoto', 'consensi.json'), fileSegreto: join(dati, 'remoto', 'segreto-cartelle'),
    sessionRegistry, cartelleAmmesse: [], cartelleEscluse: [dati], ...(programma ? { programma } : {}), ...(clock ? { clock } : {}) });
  const httpApp = createHttpApp({ staticHandler: async () => null, sessionRegistry, remotoFn: () => ({ cartelle }) });
  const chiama = creaChiamataInterna({ httpApp, porta: 4999 });
  const operazioni = creaOperazioni({ chiama, sessionRegistry, iscriviConRigiocata, cartelle });
  const contesto = (id = DISP_A, nome = 'OnePlus Pad 3') => ({ dispositivo: { id, nome }, iscrizioni: new Map(), iscrivi: () => async () => {} });
  const pc = (metodo, percorso, corpo) => chiama({ metodo, percorso, corpo, origine: 'pc' });
  return { radice, avm, app, dati, cartelle, httpApp, chiama, operazioni, contesto, pc, avviate };
}

/** Un server HTTP vero sul gestore, su una porta scelta dal sistema (mai 4174/4176-4179). */
async function apri(t, httpApp) {
  const server = createServer((req, res) => { void httpApp(req, res); });
  await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
  t.after(() => new Promise((ok) => { server.closeAllConnections?.(); server.close(() => ok()); }));
  return server.address().port;
}

/** Apre lo stream come lo apre un EventSource: GET, e legge gli eventi `data:` man mano che arrivano. */
function flusso(porta, { intestazioni = FINESTRA, metodo = 'GET' } = {}) {
  return new Promise((ok, ko) => {
    const req = request({ host: '127.0.0.1', port: porta, path: '/api/v1/remote/events', method: metodo, headers: { accept: 'text/event-stream', ...intestazioni } }, (res) => {
      const eventi = []; const arrivi = []; let resto = ''; let corpo = '';
      res.setEncoding('utf8');
      res.on('data', (pezzo) => {
        corpo += pezzo;
        resto += pezzo;
        let i;
        while ((i = resto.indexOf('\n\n')) >= 0) {
          const blocco = resto.slice(0, i); resto = resto.slice(i + 2);
          const dati = blocco.split('\n').filter((l) => l.startsWith('data: ')).map((l) => l.slice(6)).join('\n');
          if (dati) { eventi.push(JSON.parse(dati)); arrivi.push(Date.now()); }
        }
      });
      const aspetta = async (condizione, { entroMs = 3000, messaggio = 'evento non arrivato' } = {}) => {
        const fine = Date.now() + entroMs;
        for (;;) {
          const i = eventi.findIndex(condizione);
          if (i >= 0) return { evento: eventi[i], arrivo: arrivi[i] };
          if (Date.now() > fine) throw new Error(`${messaggio}: ${JSON.stringify(eventi)}`);
          await new Promise((x) => setTimeout(x, 5));
        }
      };
      const fine = new Promise((x) => { res.on('end', x); res.on('close', x); });
      ok({ stato: res.statusCode, intestazioni: res.headers, eventi, aspetta, corpo: async () => { await fine; return corpo; }, chiudi: () => req.destroy() });
    });
    req.on('error', ko);
    req.end();
  });
}

test('EV-01 consent.request dal dispositivo: la finestra riceve consent.requested NEL MOMENTO in cui la richiesta si registra', async (t) => {
  const b = banco();
  const porta = await apri(t, b.httpApp);
  const f = await flusso(porta);
  t.after(() => f.chiudi());
  assert.equal(f.stato, 200);
  assert.match(String(f.intestazioni['content-type']), /^text\/event-stream/u);
  assert.equal(f.intestazioni['cache-control'], 'no-store');
  await f.aspetta((e) => e.type === 'remote.changed' && e.motivo === 'connesso', { messaggio: 'manca il segno di stream pronto' });
  const [avmRiga] = (await b.operazioni.esegui('projects.list', {}, b.contesto())).items;
  const registrata = Date.now();
  const r = await b.operazioni.esegui('consent.request', { cartellaId: avmRiga.cartellaId }, b.contesto());
  const { evento, arrivo } = await f.aspetta((e) => e.type === 'consent.requested');
  assert.deepEqual(evento, { type: 'consent.requested', richiestaId: r.richiestaId, dispositivo: { id: DISP_A, nome: 'OnePlus Pad 3' },
    cartella: { nome: 'AVM', percorso: b.avm }, scadeAlle: r.scadeAlle });
  assert.ok(arrivo - registrata < 1000, `⛔ arrivato dopo ${arrivo - registrata} ms`);
  // AL CONTRARIO: la stessa richiesta chiesta di nuovo (stesso dispositivo, stessa cartella) non fa una seconda carta
  await b.operazioni.esegui('consent.request', { cartellaId: avmRiga.cartellaId }, b.contesto());
  await new Promise((x) => setTimeout(x, 50));
  assert.equal(f.eventi.filter((e) => e.type === 'consent.requested').length, 1);
});

test('EV-02 un session.start trattenuto fa la stessa carta; chi si collega DOPO riceve l\'istantanea delle richieste aperte, poi «connesso»', async (t) => {
  const b = banco();
  const porta = await apri(t, b.httpApp);
  const [, appRiga] = (await b.operazioni.esegui('projects.list', {}, b.contesto())).items;
  const attesa = await b.operazioni.esegui('session.start', { corpo: { cartellaId: appRiga.cartellaId, consegna: 'il primo messaggio' } }, b.contesto());
  assert.equal(attesa.stato, 'attesa-consenso');
  const f = await flusso(porta);
  t.after(() => f.chiudi());
  await f.aspetta((e) => e.type === 'remote.changed');
  assert.deepEqual(f.eventi.map((e) => e.type), ['consent.requested', 'remote.changed'], 'prima l\'istantanea, poi il segno');
  assert.equal(f.eventi[0].richiestaId, attesa.richiestaId);
  assert.deepEqual(f.eventi[0].cartella, { nome: 'app', percorso: b.app });
  // AL CONTRARIO: una richiesta già chiusa non torna nell'istantanea di chi si collega dopo
  await b.pc('POST', `/api/v1/remote/consents/${attesa.richiestaId}/deny`, {});
  const g = await flusso(porta);
  t.after(() => g.chiudi());
  await g.aspetta((e) => e.type === 'remote.changed');
  assert.deepEqual(g.eventi.map((e) => e.type), ['remote.changed']);
});

test('EV-03 «Consenti» e «Non ora» dal PC: consent.closed con l\'esito, anche col sessionId della sessione avviata dal PC', async (t) => {
  const b = banco();
  const porta = await apri(t, b.httpApp);
  const f = await flusso(porta);
  t.after(() => f.chiudi());
  const [avmRiga, appRiga] = (await b.operazioni.esegui('projects.list', {}, b.contesto())).items;
  const avvio = await b.operazioni.esegui('session.start', { corpo: { cartellaId: avmRiga.cartellaId, consegna: 'ciao' } }, b.contesto());
  const domanda = await b.operazioni.esegui('consent.request', { cartellaId: appRiga.cartellaId }, b.contesto());
  await b.pc('POST', `/api/v1/remote/consents/${avvio.richiestaId}/allow`, {});
  await b.pc('POST', `/api/v1/remote/consents/${domanda.richiestaId}/deny`, {});
  const { evento: consentita } = await f.aspetta((e) => e.type === 'consent.closed' && e.richiestaId === avvio.richiestaId);
  const { evento: negata } = await f.aspetta((e) => e.type === 'consent.closed' && e.richiestaId === domanda.richiestaId);
  assert.equal(consentita.esito, 'consentita');
  assert.equal(consentita.sessionId, 's1');
  assert.equal(negata.esito, 'negata');
  assert.equal(negata.sessionId, undefined);
  // AL CONTRARIO: una risposta ripetuta non chiude due volte
  await assert.rejects(b.pc('POST', `/api/v1/remote/consents/${domanda.richiestaId}/deny`, {}), { code: 'CONSENT_NOT_PENDING' });
  await new Promise((x) => setTimeout(x, 50));
  assert.equal(f.eventi.filter((e) => e.type === 'consent.closed').length, 2);
});

test('EV-04 la SCADENZA si annuncia da sola: dopo 2 minuti consent.closed «scaduta», senza che nessuno chieda niente', async (t) => {
  let ora = Date.parse('2026-10-24T18:00:00.000Z');
  const programmati = [];
  const programma = (fn, ms) => { const voce = { fn, ms, tolto: false }; programmati.push(voce); return () => { voce.tolto = true; }; };
  const b = banco({ programma, clock: () => ora });
  const porta = await apri(t, b.httpApp);
  const f = await flusso(porta);
  t.after(() => f.chiudi());
  const [avmRiga, appRiga] = (await b.operazioni.esegui('projects.list', {}, b.contesto())).items;
  const r = await b.operazioni.esegui('consent.request', { cartellaId: avmRiga.cartellaId }, b.contesto());
  const altra = await b.operazioni.esegui('consent.request', { cartellaId: appRiga.cartellaId }, b.contesto());
  assert.equal(programmati.length, 2, 'un timer di scadenza per richiesta');
  assert.equal(programmati[0].ms, ATTESA_CONSENSO_MS);
  // la seconda si chiude PRIMA della scadenza: il suo timer si toglie
  await b.pc('POST', `/api/v1/remote/consents/${altra.richiestaId}/deny`, {});
  assert.equal(programmati[1].tolto, true, 'chiusa prima: il timer non resta acceso');
  ora += ATTESA_CONSENSO_MS;
  programmati[0].fn();
  const { evento } = await f.aspetta((e) => e.type === 'consent.closed' && e.richiestaId === r.richiestaId);
  assert.equal(evento.esito, 'scaduta');
  // AL CONTRARIO: un timer che scatta in anticipo (orologio non ancora alla scadenza) non chiude niente
  const terza = await b.operazioni.esegui('consent.request', { cartellaId: appRiga.cartellaId }, b.contesto());
  const quanti = programmati.length;
  programmati.at(-1).fn();
  assert.equal(programmati.length, quanti + 1, 'un timer in anticipo si riprogramma per il resto');
  assert.equal(programmati.at(-1).ms, ATTESA_CONSENSO_MS);
  await new Promise((x) => setTimeout(x, 50));
  assert.ok(!f.eventi.some((e) => e.type === 'consent.closed' && e.richiestaId === terza.richiestaId), 'chiusa prima della scadenza');
});

test('EV-05 dimenticare o revocare il dispositivo chiude le sue richieste aperte: consent.closed «negata»', async (t) => {
  const b = banco();
  const porta = await apri(t, b.httpApp);
  const f = await flusso(porta);
  t.after(() => f.chiudi());
  const [avmRiga] = (await b.operazioni.esegui('projects.list', {}, b.contesto())).items;
  const r = await b.operazioni.esegui('consent.request', { cartellaId: avmRiga.cartellaId }, b.contesto());
  const altro = await b.operazioni.esegui('consent.request', { cartellaId: avmRiga.cartellaId }, b.contesto('dispositivo-B2', 'Telefono'));
  await b.cartelle.dimentica(DISP_A);
  const { evento } = await f.aspetta((e) => e.type === 'consent.closed' && e.richiestaId === r.richiestaId);
  assert.equal(evento.esito, 'negata');
  // AL CONTRARIO: la richiesta di un altro dispositivo resta aperta
  await new Promise((x) => setTimeout(x, 50));
  assert.ok(!f.eventi.some((e) => e.type === 'consent.closed' && e.richiestaId === altro.richiestaId));
});

test('EV-06 lo stream è solo della finestra: un\'origine estranea, un programma senza gettone e il dispositivo ricevono 403; GET soltanto', async (t) => {
  const b = banco();
  const porta = await apri(t, b.httpApp);
  for (const intestazioni of [{ origin: 'http://sito-estraneo.example', 'sec-fetch-site': 'cross-site' }, { 'sec-fetch-site': 'same-site' },
    { origin: `http://127.0.0.1:${porta + 1}` }, {}]) {
    const f = await flusso(porta, { intestazioni });
    const corpo = await f.corpo();
    assert.equal(f.stato, 403, JSON.stringify(intestazioni));
    assert.match(corpo, /REMOTE_ORIGIN_FORBIDDEN/u, JSON.stringify(intestazioni));
    assert.doesNotMatch(String(f.intestazioni['content-type']), /event-stream/u);
  }
  // il dispositivo (chiamata interna con l'origine remota) non lo apre, anche col gettone della finestra
  await assert.rejects(b.chiama({ metodo: 'GET', percorso: '/api/v1/remote/events', origine: 'telefono:x', origineRemota: { tipo: 'telefono', dispositivoId: 'x' } }),
    (e) => e?.code === 'REMOTE_ORIGIN_FORBIDDEN');
  const post = await flusso(porta, { metodo: 'POST', intestazioni: { ...FINESTRA, origin: `http://127.0.0.1:${porta}` } });
  await post.corpo();
  assert.equal(post.stato, 405);
  assert.equal(post.intestazioni.allow, 'GET');
  // AL CONTRARIO: la finestra (stessa porta) lo apre, anche con l'Origin della sua porta
  const buona = await flusso(porta, { intestazioni: { origin: `http://127.0.0.1:${porta}`, 'sec-fetch-site': 'same-origin' } });
  t.after(() => buona.chiudi());
  assert.equal(buona.stato, 200);
  assert.ok(ROTTE_REMOTO.some((r) => r.schema === '/api/v1/remote/events' && r.metodi.includes('GET')), 'nell\'inventario delle rotte');
});

test('EV-07 senza le cartelle dei dispositivi lo stream risponde 503: la finestra resta sul controllo a tempo', async (t) => {
  const httpApp = createHttpApp({ staticHandler: async () => null, sessionRegistry: { elenca: () => [], esiste: () => false }, remotoFn: () => null });
  const porta = await apri(t, httpApp);
  const f = await flusso(porta);
  const corpo = await f.corpo();
  assert.equal(f.stato, 503);
  assert.match(corpo, /REMOTE_UNAVAILABLE/u);
});

test('EV-08 chi chiude lo stream smette di ascoltare: niente ascoltatori lasciati nel modulo', async (t) => {
  const b = banco();
  const porta = await apri(t, b.httpApp);
  const f = await flusso(porta);
  await f.aspetta((e) => e.type === 'remote.changed');
  assert.equal(b.cartelle.ascoltatori(), 1);
  f.chiudi();
  const fine = Date.now() + 2000;
  while (b.cartelle.ascoltatori() !== 0 && Date.now() < fine) await new Promise((x) => setTimeout(x, 5));
  assert.equal(b.cartelle.ascoltatori(), 0);
});

test('EV-09 il coordinatore: un dispositivo che si collega o si scollega, e un accoppiamento in attesa, diventano remote.changed', async (t) => {
  const dir = realpathSync.native(mkdtempSync(join(tmpdir(), 'talos-eventi-idx-')));
  t.after(() => rimuoviCartellaDiProva(dir));
  let gestisci = null;
  const r = creaRemoto({
    keyring: creaAdattatorePortachiaviInMemoria(), fileImpostazioni: join(dir, 'remoto', 'impostazioni.json'), fileTelefoni: join(dir, 'remoto', 'telefoni.json'),
    chiama: async () => ({ dati: null }), sessionRegistry: { esiste: () => false }, iscriviConRigiocata: () => () => {},
    caricaIroh: async () => ({}), nomePc: 'PC',
    avviaTrasporto: async ({ gestisci: g }) => { gestisci = g; return { id: 'pc-id', relayDiCasa: () => 'https://relay.example/', indirizziDiretti: () => [], ferma: async () => {} }; },
  });
  const visti = [];
  const smetti = r.ascoltaStato((e) => visti.push(e));
  await r.imposta({ relay: { modo: 'n0' }, acceso: true });
  const { gettone } = await r.apriAccoppiamento();
  const coda = []; let fine = false; const attesi = []; const lettore = creaLettore();
  const conn = (alpn) => ({
    remoteId: 'tel-id', alpn, chiusa: new Promise(() => {}), chiudi() { fine = true; while (attesi.length) attesi.shift()(null); },
    stream: { leggi: () => (coda.length ? Promise.resolve(coda.shift()) : fine ? Promise.resolve(null) : new Promise((x) => attesi.push(x))), scrivi: async (byte) => { if (fine) throw new Error('chiuso'); lettore.aggiungi(byte); }, finisci: async () => {} },
  });
  const manda = (m) => { const byte = codifica(m); const a = attesi.shift(); if (a) a(byte); else coda.push(byte); };
  const finche = async (c) => { const f = Date.now() + 5000; while (!c()) { if (Date.now() > f) throw new Error(JSON.stringify(visti)); await new Promise((x) => setTimeout(x, 5)); } };
  const pair = conn('talos-remote-pair/1');
  const fattoPair = gestisci(pair);
  manda({ t: 'pair.hello', gettone, nome: 'Pad' });
  await finche(() => visti.some((e) => e.motivo === 'accoppiamento-in-attesa'));
  await r.conferma((await r.stato()).attese[0].id);
  pair.chiudi(); // il telefono chiude il suo lato: niente attesa di 15 s del half-close dopo pair.ok
  await fattoPair;
  fine = false;
  const lavoro = conn(ALPN_LAVORO);
  const fatto = gestisci(lavoro);
  await finche(() => visti.some((e) => e.motivo === 'telefono-collegato'));
  lavoro.chiudi();
  await fatto;
  await finche(() => visti.some((e) => e.motivo === 'telefono-scollegato'));
  assert.ok(visti.every((e) => e.type === 'remote.changed' && Object.keys(e).sort().join() === 'motivo,type'), JSON.stringify(visti));
  // AL CONTRARIO: chi ha smesso di ascoltare non riceve più niente
  smetti();
  const prima = visti.length;
  fine = false;
  const altro = gestisci(conn(ALPN_LAVORO));
  await new Promise((x) => setTimeout(x, 50));
  assert.equal(visti.length, prima);
  fine = true; while (attesi.length) attesi.shift()(null);
  await altro;
  await r.ferma();
});
