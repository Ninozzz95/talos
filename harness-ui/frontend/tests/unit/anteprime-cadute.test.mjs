/*
 * 0.2.2, giro di sicurezza 3 (10/11/2026; controllore del giro 2, reperto N1; owner 22:51 «l'app se ne accorga e riapra l'anteprima»;
 * giudice v1376 (i) «mai un ciclo»). Il guscio del PC dice al documento dell'app quali anteprime sono cadute (`talos:anteprime-cadute`,
 * `desktop/finestra-artefatto.mjs`). Qui la regola (`anteprime-cadute.js`) e i due posti che la usano: il pannello «A lato» con la carta
 * dell'artefatto e il lettore. Una caduta: UNA ricarica da sola. La seconda: «Pagina non caricata.» con «Riprova», nella grammatica
 * d'errore che c'è già (sotto la carta; la carta dell'errore del lettore). Il conto lo azzera solo «Riprova».
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { documento, clic } from './aiuto-dom-blocchi.mjs';
import { EVENTO_ANTEPRIME_CADUTE, RICARICHE_AUTOMATICHE, guardaAnteprima, percorsoAnteprima } from '../../src/components/anteprime-cadute.js';
import { creaCardArtefatto } from '../../src/components/artifact-card.js';
import { creaArtefattoALato } from '../../src/components/pannello/artefatto-a-lato.js';
import { creaChatALato } from '../../src/components/pannello/a-lato.js';
import { creaLettore } from '../../src/components/lettore/lettore.js';
import { impostaLingua } from '../../src/components/lingua.js';
import { TESTI } from '../../src/i18n/testi/index.js';
/* il modulo VERO dei lasciapassare del servizio, solo letto, con l orologio finto (giro 4, C4) */
import { creaLasciapassarePagine } from '../../../src/pagine-lasciapassare.mjs';

const CAP = 'c'.repeat(43);
const giro = () => new Promise((f) => setTimeout(f, 0));
/* la ricarica a lato chiede un lasciapassare nuovo (giro 4, C4): qualche giro di promesse */
const attesa = () => new Promise((f) => setTimeout(f, 15));
/* una finestra che riceve l evento e conta chi smette di ascoltarlo (un ascolto lasciato indietro resterebbe vivo per sempre) */
const finestraFinta = () => {
  const f = Object.assign(new EventTarget(), { URL, location: { href: 'http://127.0.0.1:4000/' }, tolti: 0 });
  const togli = f.removeEventListener.bind(f);
  f.removeEventListener = (...a) => { if (a[0] === EVENTO_ANTEPRIME_CADUTE) f.tolti += 1; return togli(...a); };
  return f;
};
const cade = (finestra, ...indirizzi) => finestra.dispatchEvent(new CustomEvent(EVENTO_ANTEPRIME_CADUTE, { detail: { indirizzi } }));

test('CADUTE-01 la regola: la prima caduta ricarica UNA volta, la seconda si arrende; la ricarica non azzera il conto, solo azzera()', () => {
  assert.equal(EVENTO_ANTEPRIME_CADUTE, 'talos:anteprime-cadute');
  assert.equal(RICARICHE_AUTOMATICHE, 1);
  const finestra = finestraFinta();
  let indirizzo = `http://127.0.0.1:4000/api/v1/pagine/${CAP}/a.html`;
  const fatti = [];
  const g = guardaAnteprima({ finestra, indirizzo: () => indirizzo, ricarica: () => fatti.push('ricarica'), arresa: () => fatti.push('arresa') });
  /* un altra pagina, un evento senza elenco, un elenco storto: niente */
  cade(finestra, `/api/v1/pagine/${CAP}/b.html`);
  finestra.dispatchEvent(new CustomEvent(EVENTO_ANTEPRIME_CADUTE));
  finestra.dispatchEvent(new CustomEvent(EVENTO_ANTEPRIME_CADUTE, { detail: { indirizzi: `/api/v1/pagine/${CAP}/a.html` } }));
  finestra.dispatchEvent(new CustomEvent('altro', { detail: { indirizzi: [`/api/v1/pagine/${CAP}/a.html`] } }));
  assert.deepEqual(fatti, []);
  cade(finestra, `/api/v1/pagine/${CAP}/b.html`, `/api/v1/pagine/${CAP}/a.html`);
  assert.deepEqual(fatti, ['ricarica']);
  assert.equal(g.ricariche, 1);
  /* una pagina che cade SEMPRE: dopo la ricarica non se ne fa un altra, mai */
  for (let i = 0; i < 5; i += 1) cade(finestra, `/api/v1/pagine/${CAP}/a.html`);
  assert.deepEqual(fatti, ['ricarica', 'arresa', 'arresa', 'arresa', 'arresa', 'arresa']);
  assert.equal(g.ricariche, 1, 'il conto non si azzera con la ricarica');
  /* «Riprova» (un gesto): il conto riparte */
  g.azzera();
  cade(finestra, `/api/v1/pagine/${CAP}/a.html`);
  assert.equal(fatti.at(-1), 'ricarica');
  /* la domanda conta (un lasciapassare nuovo è un indirizzo nuovo); senza cornice niente */
  indirizzo = `/api/v1/pagine/${CAP}/a.html?v=2`;
  cade(finestra, `/api/v1/pagine/${CAP}/a.html`);
  assert.equal(fatti.length, 7);
  indirizzo = null;
  cade(finestra, `/api/v1/pagine/${CAP}/a.html?v=2`);
  assert.equal(fatti.length, 7);
  /* fermata (pannello chiuso, lettore distrutto): non ascolta più */
  indirizzo = `/api/v1/pagine/${CAP}/a.html`;
  g.ferma();
  cade(finestra, `/api/v1/pagine/${CAP}/a.html`);
  assert.equal(fatti.length, 7);
  /* il percorso come lo manda il guscio: percorso e domanda, niente origine né frammento */
  assert.equal(percorsoAnteprima('http://127.0.0.1:4000/api/v1/pagine/x/y.html?a=1#b', finestra), '/api/v1/pagine/x/y.html?a=1');
  assert.equal(percorsoAnteprima('/api/v1/pagine/x/y.html', finestra), '/api/v1/pagine/x/y.html');
  for (const no of ['', null, undefined, 42]) assert.equal(percorsoAnteprima(no, finestra), null, String(no));
  /* senza una finestra che ascolta (il telefono, un DOM finto) non lancia */
  assert.doesNotThrow(() => guardaAnteprima({ finestra: {}, indirizzo: () => null, ricarica() {}, arresa() {} }).ferma());
});

/* la carta vera e il pannello «A lato» vero, come `artifact-card.test.mjs`, con una finestra che riceve l evento del guscio */
function cartaALato(indirizzoDi = (n) => `/api/v1/pagine/${CAP}/p${n}.html`) {
  const doc = documento();
  const finestra = finestraFinta();
  doc.defaultView = finestra;
  const posto = doc.createElement('div');
  const scheda = doc.createElement('button');
  doc.body.append(scheda, posto);
  const chat = creaChatALato({ document: doc, sessione: () => 's1', chiedi: async () => ({ risposta: 'ok', usage: null }), trasforma: async () => ({}),
    apriSessione: () => {}, testoConsumo: () => '', testoErrore: (e) => e.message });
  posto.append(chat.nodo);
  const lato = creaArtefattoALato({ document: doc, posto, chat, scheda, mostra: () => {}, timer: globalThis });
  let n = 0;
  const post = [];
  const fetchFn = async (indirizzo, init = {}) => {
    if (init.method === 'POST') { post.push(indirizzo); n += 1; const dove = indirizzoDi(n); return { ok: true, json: async () => ({ data: { indirizzo: dove } }) }; }
    return { ok: false, status: 404, json: async () => ({}) };
  };
  const nuovaCarta = (id = 'v1', voce = 'lib-00000000-0000-4000-8000-000000000001') => creaCardArtefatto({ evento: { id, titolo: 'Bilancio', voceLibreriaId: voce }, sessionId: 's1', API: (p) => p, fetchFn,
    apriFn: () => null, ancoraValida: () => true, gettoneGuscio: () => undefined, lato, copia: async () => {}, scarica: () => {}, mostraInLibreria: () => {}, avvisa: () => {} }, { document: doc });
  const c = nuovaCarta();
  doc.body.append(c.card);
  return { doc, finestra, posto, c, post, lato, nuovaCarta: () => nuovaCarta('v2', 'lib-00000000-0000-4000-8000-000000000002') };
}

test('CADUTE-02 il pannello «A lato»: la pagina caduta si rimette UNA volta; alla seconda la carta dice «Pagina non caricata.» con «Riprova»', async () => {
  impostaLingua('it');
  const { finestra, posto, c, post } = cartaALato();
  await c.pronta;
  clic(c.carta); await c.apertura;
  const prima = posto.querySelector('iframe');
  assert.equal(prima.src, `/api/v1/pagine/${CAP}/p1.html`);
  const errore = c.card.querySelector('.talos-artifact__errore');
  /* prima caduta: una cornice NUOVA, nessun errore; giro 4 (C4): con un lasciapassare NUOVO, come il lettore (il vecchio può essere scaduto) */
  cade(finestra, `/api/v1/pagine/${CAP}/p1.html`);
  await attesa();
  const seconda = posto.querySelector('iframe');
  assert.notEqual(seconda, prima, 'la cornice è rifatta');
  assert.equal(prima.isConnected, false);
  assert.equal(seconda.src, `/api/v1/pagine/${CAP}/p2.html`, 'la ricarica chiede un lasciapassare nuovo');
  assert.equal(seconda.getAttribute('sandbox'), 'allow-scripts', 'la cornice blindata di sempre');
  assert.equal(seconda.getAttribute('referrerpolicy'), 'no-referrer');
  assert.equal(errore.hidden, true);
  assert.equal(post.length, 2);
  /* seconda caduta: niente più ricariche; la pagina si toglie e la carta lo dice, con «Riprova» */
  cade(finestra, `/api/v1/pagine/${CAP}/p2.html`);
  await attesa();
  assert.equal(post.length, 2, 'la seconda caduta non chiede niente');
  assert.equal(posto.querySelector('iframe'), null, 'una pagina che cade sempre non gira in un giro di ricariche');
  assert.equal(errore.hidden, false);
  assert.equal(errore.textContent.includes('Pagina non caricata.'), true, errore.textContent);
  const riprova = errore.querySelector('button');
  assert.equal(riprova.hidden, false);
  assert.match(riprova.textContent, /Riprova/u);
  cade(finestra, `/api/v1/pagine/${CAP}/p2.html`);
  await attesa();
  assert.equal(posto.querySelector('iframe'), null);
  /* «Riprova»: un lasciapassare nuovo, la pagina di nuovo a lato, l errore via, il conto a zero */
  clic(riprova); await c.apertura;
  assert.equal(post.length, 3);
  assert.equal(posto.querySelector('iframe').src, `/api/v1/pagine/${CAP}/p3.html`);
  assert.equal(errore.hidden, true);
  cade(finestra, `/api/v1/pagine/${CAP}/p3.html`);
  await attesa();
  assert.equal(posto.querySelector('iframe')?.src, `/api/v1/pagine/${CAP}/p4.html`, 'dopo «Riprova» torna la ricarica automatica');
  /* chiuso il pannello la guardia non ascolta più */
  const tolti = finestra.tolti;
  clic(c.carta); await c.apertura;
  assert.equal(finestra.tolti, tolti + 1, 'chiudere il pannello toglie l ascolto');
  assert.equal(posto.querySelector('iframe'), null);
  cade(finestra, `/api/v1/pagine/${CAP}/p4.html`); cade(finestra, `/api/v1/pagine/${CAP}/p4.html`);
  await attesa();
  assert.equal(errore.hidden, true);
  assert.equal(posto.querySelector('iframe'), null);
  assert.equal(post.length, 4, 'a pannello chiuso nessuna ricarica');
});

/* Giro 4 (C4, controllore del giro 3): il lasciapassare scade 30 minuti dopo l ULTIMO uso (`src/pagine-lasciapassare.mjs`). Una pagina
   ferma a lato da più di 30 minuti che poi cade si ricaricava sul vecchio: un 404 nel pannello, nessuna riga. Qui il servizio è il modulo
   VERO dei lasciapassare con l orologio finto. */
test('CADUTE-05 (giro 4, C4) la ricarica a lato dopo 31 minuti non riusa il lasciapassare scaduto', async () => {
  impostaLingua('it');
  let adesso = 1_000_000;
  const lasciapassare = creaLasciapassarePagine({ ora: () => adesso });
  const gettone = (src) => /\/api\/v1\/pagine\/([^/]+)\//u.exec(String(src))?.[1] ?? null;
  const { finestra, posto, c, lato } = cartaALato((n) => `/api/v1/pagine/${lasciapassare.crea({ sessionId: 's1', voceId: 'v', nome: `p${n}.html` })}/p${n}.html`);
  await c.pronta;
  clic(c.carta); await c.apertura;
  const prima = posto.querySelector('iframe').src;
  assert.ok(lasciapassare.usa(gettone(prima)), 'la pagina si carica: il lasciapassare si usa');
  adesso += 31 * 60 * 1000;
  assert.equal(lasciapassare.usa(gettone(prima)), null, 'dopo 31 minuti fermo il vecchio è scaduto (lo dice il servizio)');
  cade(finestra, new URL(prima, 'http://127.0.0.1:4000/').pathname);
  await attesa();
  const dopo = posto.querySelector('iframe')?.src;
  assert.ok(dopo, 'la pagina è rimessa a lato');
  assert.notEqual(gettone(dopo), gettone(prima), 'oggi la ricarica rimette il lasciapassare scaduto');
  assert.ok(lasciapassare.usa(gettone(dopo)), 'il servizio la dà: il lasciapassare della ricarica è vivo');
  assert.equal(c.card.querySelector('.talos-artifact__errore').hidden, true);
  /* il pannello chiuso MENTRE si aspetta il lasciapassare nuovo: la pagina non torna in un pannello chiuso */
  clic(c.carta); await c.apertura; // chiude
  clic(c.carta); await c.apertura; // riapre: guardia nuova
  cade(finestra, new URL(posto.querySelector('iframe').src, 'http://127.0.0.1:4000/').pathname);
  lato.chiudi();
  await attesa();
  assert.equal(posto.querySelector('iframe'), null, 'chiuso nell attesa: nessuna pagina rimessa');
  assert.equal(lato.aperto, false);
});

/* Giro 4 (mutante C05 del controllore): la riga «Pagina non caricata.» sta sotto la carta finché il pannello è suo; se il pannello si chiude o
   lo prende un altra carta, la riga se ne va con «aperta qui a lato» (non resta un errore su una pagina che nessuno mostra più). */
test('CADUTE-06 (giro 4, C05) la riga della pagina caduta se ne va quando il pannello si chiude o passa a un altra carta', async () => {
  impostaLingua('it');
  const { doc, finestra, posto, c, lato, nuovaCarta } = cartaALato();
  await c.pronta;
  const errore = c.card.querySelector('.talos-artifact__errore');
  const arrenditi = async () => {
    clic(c.carta); await c.apertura;
    const src = posto.querySelector('iframe').src;
    cade(finestra, src); await attesa();
    cade(finestra, posto.querySelector('iframe').src); await attesa();
    assert.equal(errore.hidden, false, 'la riga c è');
    assert.match(errore.textContent, /Pagina non caricata\./u);
  };
  await arrenditi();
  lato.chiudi();
  assert.equal(errore.hidden, true, 'pannello chiuso con la ✕: la riga se ne va');
  await arrenditi();
  const altra = nuovaCarta();
  doc.body.append(altra.card);
  await altra.pronta;
  clic(altra.carta); await altra.apertura;
  assert.ok(posto.querySelector('iframe'), 'l altra carta ha il pannello');
  assert.equal(errore.hidden, true, 'il pannello passa a un altra carta: la riga della prima se ne va');
  /* (mutante C11 del controllore) una carta tolta dalla chat non mostra niente se la sua pagina cade: la riga resta a chi c è */
  const erroreAltra = altra.card.querySelector('.talos-artifact__errore');
  altra.card.remove();
  cade(finestra, posto.querySelector('iframe').src); await attesa();
  const ancora = posto.querySelector('iframe');
  if (ancora) { cade(finestra, ancora.src); await attesa(); }
  assert.equal(erroreAltra.hidden, true, 'una carta che non c è più non riceve la riga');
});

test('CADUTE-03 il lettore: la pagina HTML caduta si ridisegna UNA volta; alla seconda resta «Pagina non caricata.» con «Riprova»', async () => {
  impostaLingua('it');
  const doc = documento();
  const finestra = finestraFinta();
  let n = 0;
  const lettore = creaLettore({ doc, finestra, fonte: { nome: 'p.html', leggiByte: async () => new TextEncoder().encode('<!doctype html><p>ciao</p>').buffer,
    creaPagina: async () => { n += 1; return `/api/v1/pagine/${CAP}/p${n}.html`; } } });
  doc.body.append(lettore.elemento);
  const aspetta = () => new Promise((r) => setTimeout(r, 15));
  await aspetta();
  const cornice = () => lettore.elemento.querySelector('iframe');
  assert.equal(cornice()?.src, `http://127.0.0.1:4000/api/v1/pagine/${CAP}/p1.html`);
  cade(finestra, `/api/v1/pagine/${CAP}/p1.html`);
  await aspetta();
  assert.equal(n, 2, 'ridisegnata da sola, con un lasciapassare nuovo');
  assert.equal(cornice()?.src, `http://127.0.0.1:4000/api/v1/pagine/${CAP}/p2.html`);
  assert.equal(cornice().getAttribute('sandbox'), 'allow-scripts');
  cade(finestra, `/api/v1/pagine/${CAP}/p2.html`);
  await aspetta();
  assert.equal(n, 2, 'la seconda caduta non ridisegna');
  assert.equal(cornice(), null);
  const frase = lettore.elemento.querySelector('.talos-lettore__fuori p');
  assert.equal(frase.textContent, 'Pagina non caricata.');
  assert.equal(frase.getAttribute('role'), 'alert');
  const riprova = lettore.elemento.querySelector('.talos-lettore__fuori button');
  assert.equal(riprova.textContent, 'Riprova');
  clic(riprova); await aspetta();
  assert.equal(n, 3);
  assert.ok(cornice());
  cade(finestra, `/api/v1/pagine/${CAP}/p3.html`); await aspetta();
  assert.equal(n, 4, '«Riprova» azzera il conto');
  /* nella vista Sorgente la cornice non c è: un avviso arrivato tardi non tocca il testo */
  clic(lettore.elemento.querySelector('[role="tab"][data-modo="sorgente"]')); await aspetta();
  const sorgente = lettore.elemento.querySelector('.talos-lettore__corpo').textContent;
  cade(finestra, `/api/v1/pagine/${CAP}/p4.html`); cade(finestra, `/api/v1/pagine/${CAP}/p4.html`); await aspetta();
  assert.equal(n, 4);
  assert.equal(lettore.elemento.querySelector('.talos-lettore__corpo').textContent, sorgente);
  const tolti = finestra.tolti;
  lettore.distruggi();
  assert.equal(finestra.tolti, tolti + 1, 'distrutto: l ascolto si toglie');
  cade(finestra, `/api/v1/pagine/${CAP}/p4.html`); await aspetta();
  assert.equal(n, 4, 'distrutto: non ascolta più');
});

test('CADUTE-04 i testi nuovi in inglese e in italiano, chiavi senza trattino; l evento è lo stesso del guscio', () => {
  for (const [chiave, en, it] of [['chat.artifact.pageNotLoaded', 'Page not loaded.', 'Pagina non caricata.'], ['varie.reader.html.notLoaded', 'Page not loaded.', 'Pagina non caricata.']]) {
    assert.equal(TESTI.en[chiave], en, chiave); assert.equal(TESTI.it[chiave], it, chiave);
    assert.doesNotMatch(chiave, /-/u);
  }
  const guscio = readFileSync(new URL('../../../desktop/finestra-artefatto.mjs', import.meta.url), 'utf8');
  assert.match(guscio, /export const EVENTO_ANTEPRIME_CADUTE = 'talos:anteprime-cadute';/u);
  impostaLingua('en');
});
