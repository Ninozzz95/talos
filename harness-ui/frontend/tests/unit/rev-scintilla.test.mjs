/*
 * PERF-PANNELLO-01 (P3 della ricognizione del giudice, 11/11/2026, `RICOGNIZIONE-PRESTAZIONI-SESSIONI-LUNGHE-2026-11-11.md` D2): le schede
 * Processi e Agenti del pannello v2 si ridisegnavano DA CAPO a ogni disegno della colonna (`replaceChildren` + fino a 10 giri di misura
 * del layout in `disegnaScheda`, `pannello/comune.js`), anche con gli stessi dati: e la colonna si disegna a ogni evento del giro.
 * ⇒ Come la scheda Contesto (`pannello/contesto.js`, il salto dei disegni uguali), ma con una firma economica (le righe, il loro stato e
 *   i campi che la scheda mostra) e senza leggere `clientHeight` per decidere: la misura la dà già `osservaSpazio`.
 * La prova: 200 chiamate con dati UGUALI (oggetti nuovi a ogni chiamata, come li costruisce l'app) danno 0 `replaceChildren` e 0 letture
 * di `clientHeight`; un dato che cambia ridisegna; l'orologio «da quanto» continua a scorrere senza ridisegni.
 * DOM finto dei blocchi (niente jsdom), con una spia sul prototipo dei suoi nodi.
 * Concorrenti: pi salta le righe uguali (`packages/tui/src/tui-alt-screen.ts:1752`, `screen[row] === this.previousScreen[row]`).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { documento } from './aiuto-dom-blocchi.mjs';
import { impostaLingua } from '../../src/components/lingua.js';
import { disegnaProcessiV2 } from '../../src/components/pannello/processi.js';
import { disegnaAgenti } from '../../src/components/pannello/agenti.js';
import { creaStato } from '../fixtures/pannello-dati.mjs';

const ADESSO = Date.parse('2026-11-11T19:00:00Z');

function banco() {
  const doc = documento();
  doc.querySelector = (s) => doc.body.querySelector(s);
  doc.querySelectorAll = (s) => doc.body.querySelectorAll(s);
  doc.documentElement = doc.body;
  doc.body.setAttribute('lang', 'it');
  doc.defaultView = { Node: doc.body.constructor, getComputedStyle: () => ({}) };
  const proto = Object.getPrototypeOf(doc.body);
  const conto = { replaceChildren: 0, clientHeight: 0 };
  const replaceVero = proto.replaceChildren;
  proto.replaceChildren = function (...figli) { conto.replaceChildren += 1; return replaceVero.apply(this, figli); };
  Object.defineProperty(proto, 'clientHeight', { configurable: true, get() { conto.clientHeight += 1; return 0; } });
  Object.defineProperty(proto, 'clientWidth', { configurable: true, get() { return 0; } });
  const contenitore = doc.createElement('div');
  doc.body.append(contenitore);
  const prima = { document: globalThis.document, setInterval: globalThis.setInterval, clearInterval: globalThis.clearInterval, now: Date.now };
  const timer = new Map(); let prossimo = 1;
  globalThis.document = doc;
  globalThis.setInterval = (fn, ms) => { const id = prossimo++; timer.set(id, fn); return id; };
  globalThis.clearInterval = (id) => { timer.delete(id); };
  let adesso = ADESSO;
  Date.now = () => adesso;
  return {
    doc, contenitore, conto,
    azzera: () => { conto.replaceChildren = 0; conto.clientHeight = 0; },
    battito: (ms) => { adesso += ms; for (const fn of [...timer.values()]) fn(); },
    chiudi: () => {
      proto.replaceChildren = replaceVero;
      delete proto.clientHeight; delete proto.clientWidth;
      globalThis.document = prima.document; globalThis.setInterval = prima.setInterval; globalThis.clearInterval = prima.clearInterval; Date.now = prima.now;
    },
  };
}

/* I dati come li costruisce l'app a ogni disegno della colonna (`datiPannelloProcessi`, legacy/app.js): oggetti NUOVI, contenuto uguale. */
const datiProcessi = (S, cambia = (x) => x) => ({
  processi: cambia(structuredClone(S.processi)), risorse: new Map(S.risorse), storiaCpu: new Map([...S.storiaCpu].map(([k, v]) => [k, [...v]])),
  porte: new Map([...S.porte].map(([k, v]) => [k, v.map((p) => ({ ...p }))])), sessione: 's-madre', inCaricamento: false,
});
const datiAgenti = (S, cambia = (x) => x) => ({ agenti: cambia(structuredClone(S.agenti)), domande: structuredClone(S.domande), errore: null, inCaricamento: false, evidenziato: null, sessione: 's-madre' });
const azioni = () => ({ apriMenu: () => {}, ferma: async () => ({ ok: true }) });

test('REV-SCINTILLA — Processi: la storia della CPU scorre (12 letture, la nuova uguale all ultima, memoria uguale): il mini-grafico deve cambiare', () => {
  impostaLingua('it');
  const S = creaStato(ADESSO - 1000);
  const b = banco();
  try {
    disegnaProcessiV2(b.contenitore, datiProcessi(S), azioni());
    const punti = () => [...b.contenitore.querySelectorAll('polyline')].map((p) => p.getAttribute('points')).join(' | ');
    const prima = punti();
    b.azzera();
    const S2 = { ...S, storiaCpu: new Map(S.storiaCpu) };
    S2.storiaCpu.set('tc-watch', [...S.storiaCpu.get('tc-watch'), 0.4].slice(-12)); // lettura nuova: 0,4 % come l ultima, il 6 % esce dal minuto
    disegnaProcessiV2(b.contenitore, datiProcessi(S2), azioni());
    console.log(`[rev-scintilla] replaceChildren dopo la lettura che fa scorrere il grafico: ${b.conto.replaceChildren}; punti cambiati: ${prima !== punti()}`);
    assert.ok(b.conto.replaceChildren > 0, 'il mini-grafico della CPU dell ultimo minuto si ridisegna quando la storia scorre');
  } finally {
    b.chiudi();
  }
});
