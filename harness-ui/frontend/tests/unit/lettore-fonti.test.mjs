/*
 * F5 File reader (26/09/2026) — le FONTI del lettore (`components/lettore/fonti.js`): gli indirizzi che le due porte
 * chiedono al server, l'errore del server portato con le sue parole, l'indirizzo di pagina accettato solo se è un
 * lasciapassare, e il caricatore delle rese Office che non tiene in memoria un fallimento.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { RESE_OFFICE, caricatoreOffice, fonteDaCartella, fonteDaLibreria } from '../../src/components/lettore/fonti.js';

function rete(risposte) {
  const chiamate = [];
  const fetchFn = async (indirizzo, init = {}) => {
    chiamate.push({ indirizzo, metodo: init.method ?? 'GET', corpo: init.body ?? null, credenziali: init.credentials });
    const r = risposte.shift();
    return {
      ok: r.status < 400,
      status: r.status,
      json: async () => (typeof r.corpo === 'string' ? JSON.parse(r.corpo) : r.corpo),
      arrayBuffer: async () => Uint8Array.from(r.byte ?? []).buffer,
    };
  };
  return { fetchFn, chiamate };
}

test('LETTORE-FONTI-CARTELLA: byte, pagina e PDF dagli indirizzi della sessione, col percorso codificato', async () => {
  const { fetchFn, chiamate } = rete([{ status: 200, byte: [1, 2, 3] }, { status: 200, corpo: { data: { indirizzo: '/api/v1/pagine/abc/index.html' } } }]);
  const fonte = fonteDaCartella({ sessionId: 's 1', percorso: 'dati/vendite 2026.csv', fetchFn });
  assert.equal(fonte.nome, 'vendite 2026.csv', 'il nome è l’ultimo segmento del percorso');
  assert.equal(fonte.origine, 'cartella');
  assert.deepEqual([...new Uint8Array(await fonte.leggiByte())], [1, 2, 3]);
  assert.equal(await fonte.creaPagina(), '/api/v1/pagine/abc/index.html');
  assert.equal(fonte.indirizzoPdf, '/api/v1/sessions/s%201/file/anteprima?percorso=dati%2Fvendite%202026.csv');
  assert.deepEqual(chiamate.map((c) => [c.metodo, c.indirizzo, c.corpo, c.credenziali]), [
    ['GET', '/api/v1/sessions/s%201/file?percorso=dati%2Fvendite%202026.csv', null, 'same-origin'],
    ['POST', '/api/v1/sessions/s%201/pagine', JSON.stringify({ percorso: 'dati/vendite 2026.csv' }), 'same-origin'],
  ]);
});

test('LETTORE-FONTI-LIBRERIA: la voce si legge per id, la pagina si chiede per voceId', async () => {
  const { fetchFn, chiamate } = rete([{ status: 200, byte: [9] }, { status: 200, corpo: { data: { indirizzo: '/api/v1/pagine/xyz/pagina.html' } } }]);
  const fonte = fonteDaLibreria({ sessionId: 's1', voce: { id: 'lib-1', nome: 'Pagina.html' }, fetchFn });
  assert.equal(fonte.nome, 'Pagina.html');
  assert.equal(fonte.percorso, null);
  await fonte.leggiByte();
  await fonte.creaPagina();
  assert.equal(fonte.indirizzoPdf, '/api/v1/sessions/s1/library/lib-1/anteprima');
  assert.deepEqual(chiamate.map((c) => [c.metodo, c.indirizzo, c.corpo]), [
    ['GET', '/api/v1/sessions/s1/library/lib-1/file', null],
    ['POST', '/api/v1/sessions/s1/pagine', JSON.stringify({ voceId: 'lib-1' })],
  ]);
});

test('LETTORE-FONTI-ERRORI: il messaggio del server arriva al lettore; un indirizzo che non è un lasciapassare si rifiuta', async () => {
  const { fetchFn } = rete([
    { status: 404, corpo: { error: { code: 'FILE_NOT_FOUND', message: 'Il file non esiste più' } } },
    { status: 500, corpo: 'non json' },
    { status: 200, corpo: { data: { indirizzo: 'https://altrove.example/pagina.html' } } },
  ]);
  const fonte = fonteDaCartella({ sessionId: 's1', percorso: 'a.md', fetchFn });
  await assert.rejects(fonte.leggiByte(), (e) => e.message === 'Il file non esiste più' && e.code === 'FILE_NOT_FOUND' && e.status === 404);
  await assert.rejects(fonte.leggiByte(), (e) => e.message === 'il server ha risposto HTTP 500' && e.code === null);
  await assert.rejects(fonte.creaPagina(), /non ha dato un indirizzo/u, 'la cornice non punta mai fuori dalla rotta dei lasciapassare');
});

test('LETTORE-FONTI-OFFICE: una resa si chiede una volta sola, un fallimento non resta in memoria, un tipo ignoto si rifiuta', async () => {
  const chiesti = [];
  let falliscaLaPrima = true;
  const importa = async (indirizzo) => {
    chiesti.push(indirizzo);
    if (indirizzo === RESE_OFFICE.foglio && falliscaLaPrima) { falliscaLaPrima = false; throw new Error('rete giù'); }
    return { rendi: () => indirizzo };
  };
  const carica = caricatoreOffice(importa);
  await assert.rejects(carica('foglio'), /rete giù/u);
  const [a, b] = await Promise.all([carica('foglio'), carica('foglio')]);
  assert.equal(a, b, 'due richieste insieme condividono la stessa promessa');
  assert.equal(a.rendi(), '/lettore-foglio.js', 'dopo un fallimento si ritenta davvero');
  await assert.rejects(carica('binario'), /nessuna resa/u);
  // Word e PowerPoint si rendono nella pagina ospite: nella pagina di TALOS non si importa NIENTE (26/09 pomeriggio)
  const [documento, presentazione] = await Promise.all([carica('documento'), carica('presentazione')]);
  assert.equal(typeof documento.rendi, 'function');
  assert.equal(documento, presentazione, 'la stessa resa in cornice per i due formati');
  assert.deepEqual(chiesti, ['/lettore-foglio.js', '/lettore-foglio.js']);
});

/* un documento e una finestra finti, quanto basta a una cornice: attributi, dataset, un contentWindow che registra */
function ambienteCornice() {
  const ascoltatori = new Set();
  const spediti = [];
  const finestra = { addEventListener: (_t, f) => ascoltatori.add(f), removeEventListener: (_t, f) => ascoltatori.delete(f) };
  const doc = {
    createElement: () => {
      const attributi = new Map();
      return { dataset: {}, setAttribute: (k, v) => attributi.set(k, v), getAttribute: (k) => attributi.get(k), contentWindow: { postMessage: (dati, bersaglio) => spediti.push({ dati, bersaglio }) } };
    },
  };
  const invia = (sorgente, data) => { for (const f of [...ascoltatori]) f({ source: sorgente, data }); };
  return { doc, finestra, spediti, invia, ascoltatori };
}

test('LETTORE-CORNICE-OSPITE: alla pagina ospite pronta si mandano i BYTE e il formato; il suo errore arriva al lettore; gli estranei no', async () => {
  const { doc, finestra, spediti, invia, ascoltatori } = ambienteCornice();
  const errori = [];
  const byte = Uint8Array.from([80, 75, 3, 4]).buffer;
  const resa = await caricatoreOffice(async () => { throw new Error('non si importa niente'); })('presentazione');
  const cornice = resa.rendi({ doc, finestra, byte, nome: 'slide.pptx', tipo: 'presentazione', onErrore: (m) => errori.push(m) });
  assert.equal(cornice.src, '/api/v1/lettore/ospite');
  assert.equal(cornice.getAttribute('sandbox'), 'allow-scripts', 'origine nulla: niente allow-same-origin');
  assert.equal(cornice.title, 'Presentazione: slide.pptx');
  invia({ altra: 'finestra' }, { tipo: 'talos-lettore-ospite-pronto' });
  assert.equal(spediti.length, 0, 'un messaggio da un’altra finestra non riceve niente');
  invia(cornice.contentWindow, { tipo: 'talos-lettore-ospite-pronto' });
  invia(cornice.contentWindow, { tipo: 'talos-lettore-ospite-pronto' }); // la cornice si è ricaricata (rail → schermo intero)
  assert.equal(spediti.length, 2, 'i byte si rimandano a ogni «pronto»: il rail e lo schermo intero ricaricano la cornice');
  assert.deepEqual(spediti[0], { dati: { tipo: 'talos-lettore-documento', formato: 'presentazione', byte, nome: 'slide.pptx' }, bersaglio: '*' });
  invia(cornice.contentWindow, { tipo: 'talos-lettore-ospite-errore', messaggio: 'file rotto' });
  assert.deepEqual(errori, ['file rotto']);
  cornice.smontaTalos();
  assert.equal(ascoltatori.size, 0, 'smontata, la pagina non ascolta più');
  assert.throws(() => resa.rendi({ doc, finestra, byte, nome: 'x', tipo: 'foglio' }), /nessuna resa in cornice/u);
});

/* 03/10/2026, seconda ondata della lingua: i motivi del lettore arrivano a schermo, quindi con l'interfaccia in inglese si
   leggono in inglese (le prove qui sopra restano in italiano, la lingua predefinita della prova). */
test('LETTORE-FONTI-EN: con l’interfaccia in inglese i motivi del lettore sono inglesi', async () => {
  const { impostaLingua } = await import('../../src/components/lingua.js');
  impostaLingua('en');
  try {
    const { fetchFn } = rete([{ status: 500, corpo: 'non json' }, { status: 200, corpo: { data: { indirizzo: 'https://altrove.example/p.html' } } }]);
    const fonte = fonteDaCartella({ sessionId: 's1', percorso: 'a.md', fetchFn });
    await assert.rejects(fonte.leggiByte(), (e) => e.message === 'the server answered HTTP 500');
    await assert.rejects(fonte.creaPagina(), (e) => e.message === 'the server gave no address for the page');
    await assert.rejects(caricatoreOffice(async () => ({}))('binario'), (e) => e.message === 'no renderer for «binario»');
  } finally { impostaLingua('it'); }
});
