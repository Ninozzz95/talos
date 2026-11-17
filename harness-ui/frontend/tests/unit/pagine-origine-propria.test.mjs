/*
 * Giro di sicurezza 5 delle anteprime (11/11/2026; owner 09:12, forma `FORMA-ORIGINE-PER-PAGINA-2026-11-11.md` VERDE dal giudice v1418): nel guscio
 * del PC ogni pagina resa si apre sulla SUA origine, `http://<etichetta>.localhost:<porta del servizio>`, così Chromium le dà un processo suo e una
 * che cade non porta via le sorelle. L'etichetta la dà il servizio con il lasciapassare (`POST /sessions/:id/pagine` → `{indirizzo, etichetta}`).
 * Condizione (c) del giudice v1417: il nome lo apre SOLO il guscio del PC. Nel browser (remoto, 4174) e nel telefono l'indirizzo resta quello di
 * sempre, sul nome del servizio: nessun altro pezzo costruisce il nome con l'etichetta.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { documento, clic } from './aiuto-dom-blocchi.mjs';
import * as fonti from '../../src/components/lettore/fonti.js';
const { fonteDaCartella, fonteDaLibreria } = fonti;
const indirizzoDellaPagina = fonti.indirizzoDellaPagina;
import { creaCardArtefatto } from '../../src/components/artifact-card.js';
import { creaArtefattoALato } from '../../src/components/pannello/artefatto-a-lato.js';
import { creaChatALato } from '../../src/components/pannello/a-lato.js';
import { impostaLingua } from '../../src/components/lingua.js';

const CAP = 'c'.repeat(43);
const ETICHETTA = '0123456789abcdef'.repeat(2);
const GUSCIO = 'ab'.repeat(24);
const RELATIVO = `/api/v1/pagine/${CAP}/Bilancio.html`;
const attesa = () => new Promise((f) => setTimeout(f, 15));
const finestraDi = (href, gettone = GUSCIO) => ({ location: new URL(href), ...(gettone === null ? {} : { __talosGuscioArtefatti: { gettone } }) });

test('FE-ORIGINE-01 l indirizzo sulla sua origine solo nel guscio del PC (gettone del guscio, app su 127.0.0.1 con la sua porta), con un etichetta in forma', () => {
  assert.equal(typeof indirizzoDellaPagina, 'function', 'oggi la carta non sa dare alla pagina un origine sua');
  const guscio = finestraDi('http://127.0.0.1:4000/');
  assert.equal(indirizzoDellaPagina({ indirizzo: RELATIVO, etichetta: ETICHETTA }, guscio), `http://${ETICHETTA}.localhost:4000${RELATIVO}`);
  for (const [quale, dati, finestra] of [
    ['il browser sul nome localhost (4174)', { indirizzo: RELATIVO, etichetta: ETICHETTA }, finestraDi('http://localhost:4174/')],
    ['senza il gettone del guscio (remoto, browser)', { indirizzo: RELATIVO, etichetta: ETICHETTA }, finestraDi('http://127.0.0.1:4000/', null)],
    ['un gettone del guscio fuori forma', { indirizzo: RELATIVO, etichetta: ETICHETTA }, finestraDi('http://127.0.0.1:4000/', 'x')],
    ['il telefono (https://localhost)', { indirizzo: RELATIVO, etichetta: ETICHETTA }, finestraDi('https://localhost/')],
    ['senza porta', { indirizzo: RELATIVO, etichetta: ETICHETTA }, finestraDi('http://127.0.0.1/')],
    ['un servizio vecchio senza etichetta', { indirizzo: RELATIVO }, finestraDi('http://127.0.0.1:4000/')],
    ['etichetta maiuscola', { indirizzo: RELATIVO, etichetta: ETICHETTA.toUpperCase() }, finestraDi('http://127.0.0.1:4000/')],
    ['etichetta corta', { indirizzo: RELATIVO, etichetta: ETICHETTA.slice(1) }, finestraDi('http://127.0.0.1:4000/')],
    ['etichetta con un punto', { indirizzo: RELATIVO, etichetta: `${ETICHETTA.slice(2)}.x` }, finestraDi('http://127.0.0.1:4000/')],
  ]) assert.equal(indirizzoDellaPagina(dati, finestra), RELATIVO, quale);
  /* il gettone del guscio passato a mano (la carta lo riceve iniettato) vale come quello della finestra */
  assert.equal(indirizzoDellaPagina({ indirizzo: RELATIVO, etichetta: ETICHETTA }, finestraDi('http://127.0.0.1:4000/', null), GUSCIO), `http://${ETICHETTA}.localhost:4000${RELATIVO}`);
});

test('FE-ORIGINE-02 le fonti: la pagina per la cornice sulla sua origine nel guscio; i byte (Copia, Scarica) sempre dal nome del servizio', async () => {
  const chieste = [];
  const fetchFn = async (indirizzo, init = {}) => {
    chieste.push(`${init.method ?? 'GET'} ${indirizzo}`);
    if (init.method === 'POST') return { ok: true, json: async () => ({ data: { indirizzo: RELATIVO, etichetta: ETICHETTA } }) };
    return { ok: true, arrayBuffer: async () => new TextEncoder().encode('<p>x</p>').buffer };
  };
  const finestra = finestraDi('http://127.0.0.1:4000/');
  const voce = fonteDaLibreria({ sessionId: 's1', voce: { id: 'v' }, fetchFn, finestra });
  assert.equal(await voce.creaPagina(), `http://${ETICHETTA}.localhost:4000${RELATIVO}`);
  const versione = fonteDaLibreria({ sessionId: 's1', voce: { id: 'v' }, versione: 2, fetchFn, finestra });
  assert.equal(await versione.creaPagina(), `http://${ETICHETTA}.localhost:4000${RELATIVO}`);
  chieste.length = 0;
  await versione.leggiByte();
  assert.deepEqual(chieste, ['POST /api/v1/sessions/s1/pagine', `GET ${RELATIVO}`], 'i byte dal nome dell app: la sua politica (connect-src \'self\') non ammette altre origini');
  const cartella = fonteDaCartella({ sessionId: 's1', percorso: 'a/Bilancio.html', fetchFn, finestra });
  assert.equal(await cartella.creaPagina(), `http://${ETICHETTA}.localhost:4000${RELATIVO}`);
  /* fuori dal guscio: come sempre */
  assert.equal(await fonteDaLibreria({ sessionId: 's1', voce: { id: 'v' }, fetchFn, finestra: finestraDi('http://localhost:4174/', null) }).creaPagina(), RELATIVO);
});

/* la carta vera e il pannello vero, nel guscio */
function cartaNelGuscio({ gettone = GUSCIO } = {}) {
  impostaLingua('it');
  const doc = documento();
  const finestra = Object.assign(new EventTarget(), { URL, location: new URL('http://127.0.0.1:4000/') });
  doc.defaultView = finestra;
  const posto = doc.createElement('div');
  const scheda = doc.createElement('button');
  doc.body.append(scheda, posto);
  const chat = creaChatALato({ document: doc, sessione: () => 's1', chiedi: async () => ({ risposta: 'ok', usage: null }), trasforma: async () => ({}),
    apriSessione: () => {}, testoConsumo: () => '', testoErrore: (e) => e.message });
  posto.append(chat.nodo);
  const lato = creaArtefattoALato({ document: doc, posto, chat, scheda, mostra: () => {}, timer: globalThis });
  let n = 0;
  const fetchFn = async (indirizzo, init = {}) => {
    if (init.method === 'POST') { n += 1; return { ok: true, json: async () => ({ data: { indirizzo: `/api/v1/pagine/${CAP}/p${n}.html`, etichetta: `${String(n).padStart(2, '0')}${ETICHETTA.slice(2)}` } }) }; }
    return { ok: false, status: 404, json: async () => ({}) };
  };
  const aperte = [];
  const c = creaCardArtefatto({ evento: { id: 'v1', titolo: 'Bilancio', voceLibreriaId: 'lib-00000000-0000-4000-8000-000000000001' }, sessionId: 's1', API: (p) => p, fetchFn,
    apriFn: (...a) => { aperte.push(a); return null; }, ancoraValida: () => true, gettoneGuscio: () => gettone, lato,
    copia: async () => {}, scarica: () => {}, mostraInLibreria: () => {}, avvisa: () => {} }, { document: doc });
  doc.body.append(c.card);
  return { doc, finestra, posto, c, lato, aperte };
}

test('FE-ORIGINE-03 la carta nel guscio: il pannello a lato e la finestra a parte aprono la pagina sulla sua origine; fuori dal guscio no', async () => {
  const { posto, c, aperte } = cartaNelGuscio();
  await c.pronta;
  clic(c.carta); await c.apertura;
  assert.equal(posto.querySelector('iframe').src, `http://01${ETICHETTA.slice(2)}.localhost:4000/api/v1/pagine/${CAP}/p1.html`, 'oggi la pagina a lato sta sull origine dell app');
  assert.equal(posto.querySelector('iframe').getAttribute('sandbox'), 'allow-scripts');
  await c.azioni.apriAParte();
  assert.equal(aperte.length, 1, 'la finestra a parte chiesta al guscio');
  const url = new URL(aperte[0][0]);
  assert.equal(url.protocol, 'talos-desktop:');
  assert.equal(url.searchParams.get('pagina'), `http://02${ETICHETTA.slice(2)}.localhost:4000/api/v1/pagine/${CAP}/p2.html`);
  /* fuori dal guscio: il pannello resta sull'indirizzo di sempre */
  const fuori = cartaNelGuscio({ gettone: null });
  await fuori.c.pronta;
  clic(fuori.c.carta); await fuori.c.apertura;
  assert.equal(fuori.posto.querySelector('iframe').src, `/api/v1/pagine/${CAP}/p1.html`);
});

/* K05 e K06 del controllore del giro 4: le due strade d'errore della ricarica a lato (giro 4, C4) */
test('CADUTE-07 (K05, K06) la ricarica a lato senza un lasciapassare nuovo: la riga con «Riprova», mai il pannello vuoto per sempre né il vecchio indirizzo', async () => {
  impostaLingua('it');
  for (const [quale, rinnova] of [['negato (K05)', async () => { throw new Error('rifiutato'); }], ['vuoto (K06)', async () => null], ['stringa vuota (K06)', async () => '']]) {
    const doc = documento();
    const finestra = Object.assign(new EventTarget(), { URL, location: { href: 'http://127.0.0.1:4000/' } });
    doc.defaultView = finestra;
    const posto = doc.createElement('div');
    doc.body.append(posto);
    const chat = creaChatALato({ document: doc, sessione: () => 's1', chiedi: async () => ({}), trasforma: async () => ({}), apriSessione: () => {}, testoConsumo: () => '', testoErrore: (e) => e.message });
    posto.append(chat.nodo);
    const lato = creaArtefattoALato({ document: doc, posto, chat, scheda: null, mostra: () => {}, timer: globalThis });
    const origine = doc.createElement('button'); doc.body.append(origine);
    let cadute = 0;
    const vecchio = `/api/v1/pagine/${CAP}/vecchia.html`;
    lato.apri({ origine, titolo: 'x', indirizzo: vecchio, caduta: () => { cadute += 1; }, rinnova });
    finestra.dispatchEvent(new CustomEvent('talos:anteprime-cadute', { detail: { indirizzi: [vecchio] } }));
    await attesa();
    assert.equal(cadute, 1, `${quale}: oggi nessuna riga, il pannello resta vuoto`);
    assert.equal(posto.querySelector('iframe'), null, `${quale}: il vecchio indirizzo non torna`);
  }
});
