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

test('PERF-PANNELLO-01 — Processi: 200 chiamate con dati uguali danno 0 replaceChildren e 0 letture di clientHeight; un cambio ridisegna; l orologio scorre', () => {
  impostaLingua('it');
  const S = creaStato(ADESSO - 1000);
  S.risorse.delete('tc-watch'); // senza misura la riga viva mostra il suo orologio («da quanto»)
  const b = banco();
  try {
    disegnaProcessiV2(b.contenitore, datiProcessi(S), azioni());
    assert.ok(b.conto.replaceChildren > 0, 'il primo disegno si fa');
    const vivo = b.contenitore.querySelector('[data-dal]');
    assert.ok(vivo, 'una riga viva ha il suo orologio');
    b.azzera();
    for (let i = 0; i < 200; i += 1) disegnaProcessiV2(b.contenitore, datiProcessi(S), azioni());
    assert.equal(b.conto.replaceChildren, 0, '200 chiamate uguali: nessun ridisegno');
    assert.equal(b.conto.clientHeight, 0, '200 chiamate uguali: nessuna lettura del layout');
    // il tempo «da quanto» continua a scorrere senza ridisegni
    const prima = b.contenitore.querySelector('[data-dal]').textContent;
    const radice = b.contenitore.childNodes[0];
    b.battito(5000);
    assert.notEqual(b.contenitore.querySelector('[data-dal]').textContent, prima, 'i secondi scorrono');
    assert.equal(b.contenitore.childNodes[0], radice, 'l orologio scrive i secondi senza ridisegnare la scheda');
    // un comando che finisce: si ridisegna, e la riga lo dice
    disegnaProcessiV2(b.contenitore, datiProcessi(S, (p) => p.map((x) => (x.id === 'tc-watch' ? { ...x, stato: 'riuscito', durataMs: 4000, uscita: 0 } : x))), azioni());
    assert.ok(b.conto.replaceChildren > 0, 'uno stato cambiato ridisegna');
    // le risorse misurate (CPU, memoria) cambiano senza eventi: si ridisegna lo stesso
    b.azzera();
    const S2 = structuredClone(S); S2.processi = S2.processi.map((x) => (x.id === 'tc-watch' ? { ...x, stato: 'riuscito', durataMs: 4000, uscita: 0 } : x));
    S2.risorse = new Map(S.risorse); S2.risorse.set('tc-dev', { cpuPercento: 77, memoriaByte: 999 * 1_048_576 });
    S2.storiaCpu = S.storiaCpu; S2.porte = S.porte;
    disegnaProcessiV2(b.contenitore, datiProcessi(S2), azioni());
    assert.ok(b.conto.replaceChildren > 0, 'una misura nuova di CPU o memoria ridisegna');
  } finally {
    b.chiudi();
  }
});

test('PERF-PANNELLO-01 — Agenti: 200 chiamate con dati uguali danno 0 replaceChildren e 0 letture di clientHeight; un agente che avanza ridisegna', () => {
  impostaLingua('it');
  const S = creaStato(ADESSO - 1000);
  const b = banco();
  try {
    disegnaAgenti(b.contenitore, datiAgenti(S), azioni());
    assert.ok(b.conto.replaceChildren > 0, 'il primo disegno si fa');
    b.azzera();
    for (let i = 0; i < 200; i += 1) disegnaAgenti(b.contenitore, datiAgenti(S), azioni());
    assert.equal(b.conto.replaceChildren, 0, '200 chiamate uguali: nessun ridisegno');
    assert.equal(b.conto.clientHeight, 0, '200 chiamate uguali: nessuna lettura del layout');
    // solo il file a cui lavora cambia (stesso numero di chiamate, stessa ora): la riga lo dice
    const soloFile = (a) => a.map((x) => (x.sessionId === 's-a1' ? { ...x, attivita: { ...x.attivita, bersaglioCorrente: 'src/solo-il-file.js' } } : x));
    disegnaAgenti(b.contenitore, datiAgenti(S, soloFile), azioni());
    assert.ok(b.conto.replaceChildren > 0, 'cambia solo il file corrente: si ridisegna');
    assert.match(b.contenitore.textContent, /solo-il-file\.js/u);
    b.azzera();
    // l'agente al lavoro passa a un altro file: la riga lo dice
    const avanza = (a) => a.map((x) => (x.sessionId === 's-a1' ? { ...x, ultimaAttivitaAlle: new Date(ADESSO).toISOString(), attivita: { ...x.attivita, chiamate: 15, bersaglioCorrente: 'src/nuovo-file.js' } } : x));
    disegnaAgenti(b.contenitore, datiAgenti(S, avanza), azioni());
    assert.ok(b.conto.replaceChildren > 0, 'un agente che avanza ridisegna');
    assert.match(b.contenitore.textContent, /nuovo-file\.js/u);
    // la lingua cambia: si ridisegna
    b.azzera();
    b.doc.body.setAttribute('lang', 'en');
    b.doc.documentElement.lang = 'en';
    disegnaAgenti(b.contenitore, datiAgenti(S, avanza), azioni());
    assert.ok(b.conto.replaceChildren > 0, 'una lingua diversa ridisegna');
  } finally {
    b.chiudi();
  }
});

/* Giro dei gialli (revisore dell'11/11, R2): un mutante che toglieva dalla firma degli agenti i campi di stato (conclusa, interrotta,
   esito della delega, ultimo esito, motivo della chiusura) restava vivo: nessuna prova cambiava SOLO uno di loro. Ognuno da solo ridisegna. */
test('PERF-PANNELLO-01 — Agenti: cambia solo un campo di stato (conclusa, interrotta, esito, motivo): la scheda si ridisegna ogni volta', () => {
  impostaLingua('it');
  const S = creaStato(ADESSO - 1000);
  const b = banco();
  try {
    disegnaAgenti(b.contenitore, datiAgenti(S), azioni());
    const campi = [['conclusa', true], ['interrotta', true], ['esitoDelega', 'fallito'], ['ultimoEsito', 'errore'], ['motivoChiusura', 'fermato dalla persona']];
    for (const [campo, valore] of campi) {
      disegnaAgenti(b.contenitore, datiAgenti(S), azioni()); // di nuovo i dati di partenza (ridisegna se il giro prima li aveva cambiati)
      b.azzera();
      const solo = (a) => a.map((x) => (x.sessionId === 's-a1' ? { ...x, [campo]: valore } : x));
      assert.notEqual(S.agenti.find((x) => x.sessionId === 's-a1')?.[campo], valore, `${campo} parte da un valore diverso`);
      disegnaAgenti(b.contenitore, datiAgenti(S, solo), azioni());
      assert.ok(b.conto.replaceChildren > 0, `cambia solo ${campo}: si ridisegna`);
    }
  } finally {
    b.chiudi();
  }
});
