/*
 * A1-bis (07/10/2026, review di «talos desktop» sulla foto del ritorno a 4 s) — durante la storia la colonna destra si
 * disegna UNA volta, prima che i giri arrivino (B1). I suoi vuoti allora non devono affermare niente:
 * «Indice dei giri · Nessun giro ancora» su una sessione da 1363 giri, e «Riusato dalla cache · non misurato» su una
 * sessione che la misura ce l'ha (a fine storia: «94 % · su 1286 giri»), erano due frasi false a schermo per ~14 s.
 * Lo stato vuoto e lo stato di caricamento sono due stati diversi (ebrains design system, «Empty & Loading States»,
 * design.ebrains.eu/patterns/empty-loading-states, letto il 07/10/2026).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { righeFinestra, aggiornaInspector } from '../../src/components/inspector.js';
import { aggiornaPiedeChat } from '../../src/components/chat-foot.js';

/** DOM minimo, sul modello di `cache-sessione.test.mjs`; nessun HTML interpretato. */
function documento() {
  const crea = (tag) => {
    const n = { tag, figli: [], dataset: {}, className: '', proprio: '',
      get textContent() { return this.proprio + this.figli.map((x) => x.textContent).join(''); },
      set textContent(v) { this.proprio = String(v); this.figli = []; },
      append(...nodi) { for (const x of nodi) { x.parent = this; this.figli.push(x); } },
      appendChild(x) { this.append(x); return x; },
      replaceChildren(...nodi) { this.figli = []; this.proprio = ''; this.append(...nodi); },
      remove() { if (this.parent) this.parent.figli = this.parent.figli.filter((x) => x !== this); },
      querySelector() { return null; },
      querySelectorAll(s) { return this.figli.filter((x) => x.className === s.slice(1)); },
      setAttribute() {},
    };
    return n;
  };
  return { createElement: crea, createTextNode: (testo) => { const n = crea('#text'); n.textContent = testo; return n; } };
}

function colonna() {
  const d = documento();
  const finestra = d.createElement('div');
  const indice = d.createElement('div');
  const inspector = { querySelector: () => null, querySelectorAll: () => [null, finestra, indice] };
  return { d, finestra, indice, inspector };
}

test('A1BIS-01 INDICE: durante la storia l indice vuoto dice che sta caricando, non che i giri non ci sono', () => {
  const { d, indice, inspector } = colonna();
  aggiornaInspector(inspector, { giri: [], storiaInCaricamento: true }, { document: d });
  assert.match(indice.textContent, /Apro la cronologia…/);
  assert.doesNotMatch(indice.textContent, /Nessun giro ancora/);
  // AL CONTRARIO: a storia finita, una sessione davvero senza giri lo dice
  aggiornaInspector(inspector, { giri: [], storiaInCaricamento: false }, { document: d });
  assert.match(indice.textContent, /Nessun giro ancora/);
  assert.doesNotMatch(indice.textContent, /Apro la cronologia/);
});

test('A1BIS-02 CACHE: durante la storia la misura assente è «—», non «non misurato»; a misura arrivata resta la misura', () => {
  assert.deepEqual(righeFinestra(null, null, null, null, { storiaInCaricamento: true }).righe.at(-1), ['Riusato dalla cache', '—', 'a-capo']);
  assert.deepEqual(righeFinestra(null, null, null, null).righe.at(-1), ['Riusato dalla cache', 'non misurato', 'a-capo']);
  const misura = { percentuale: 94, giriMisurati: 1286 };
  assert.deepEqual(righeFinestra(null, null, null, misura, { storiaInCaricamento: true }).righe.at(-1), ['Riusato dalla cache', '94 % · su 1286 richieste al modello', 'a-capo']);
  const { d, finestra, inspector } = colonna();
  aggiornaInspector(inspector, { cacheSessione: null, storiaInCaricamento: true }, { document: d });
  assert.match(finestra.textContent, /Riusato dalla cache—/);
  assert.doesNotMatch(finestra.textContent, /non misurato/);
  // AL CONTRARIO: a storia finita la card torna al valore vero, non resta sul trattino
  aggiornaInspector(inspector, { cacheSessione: misura, storiaInCaricamento: false }, { document: d });
  assert.match(finestra.textContent, /Riusato dalla cache94 % · su 1286 richieste al modello/);
  assert.doesNotMatch(finestra.textContent, /Riusato dalla cache—/);
});

test('A1BIS-03 APP: la colonna riceve lo stato della storia dalla sessione vera', () => {
  const app = readFileSync(new URL('../../src/legacy/app.js', import.meta.url), 'utf8');
  assert.equal(app.split('storiaInCaricamento: storiaDellaSessioneInCaricamento(),').length - 1, 2, 'colonna e piede');
  assert.match(app, /function storiaDellaSessioneInCaricamento\(\) \{\n\s+return Boolean\(state\.realSession\.id\) && state\.realSession\.inRigiocata === true;/);
});

/* ── A1-bis 5 (07/10/2026): i conteggi FUORI dal velo non mostrano numeri intermedi durante la storia ── */

/* 11/10/2026 (owner): la pillola dei giri ha lasciato il composer; il numero dell'invio sta nell'Indice dei giri della scheda Contesto.
   La regola resta la stessa: durante la storia il numero di un invio INTERMEDIO non va a schermo. */
test('A1BIS-04 GIRI: durante la storia la riga «Questo invio» tace anche sopra la soglia; a storia finita torna', () => {
  const { d, indice, inspector } = colonna();
  const giri = [{ numero: 1, token: 900 }];
  aggiornaInspector(inspector, { giri, invio: { giri: 107, tetto: 120 }, storiaInCaricamento: true }, { document: d });
  assert.doesNotMatch(indice.textContent, /Questo invio/, 'il 107 di un invio intermedio non va a schermo');
  // AL CONTRARIO: storia finita, stesso numero ⇒ la riga si vede, col tetto
  aggiornaInspector(inspector, { giri, invio: { giri: 107, tetto: 120 }, storiaInCaricamento: false }, { document: d });
  assert.match(indice.textContent, /Questo invio107 di 120 richieste/);
});

test('A1BIS-04-bis PIEDE: il piede non cerca più la pillola dei giri (e non si rompe se manca)', () => {
  const piede = { ownerDocument: null, querySelector: () => null, querySelectorAll: () => [] };
  assert.doesNotThrow(() => aggiornaPiedeChat(piede, { usage: { giri: 107 }, tettoGiri: 120, storiaInCaricamento: false }));
  assert.equal(readFileSync(new URL('../../src/components/chat-foot.js', import.meta.url), 'utf8').includes("'[data-runtime-giri]'"), false);
});

test('A1BIS-05 REVIEW: durante la storia la testata riceve null (nessun numero), e il confine la ridisegna', () => {
  const app = readFileSync(new URL('../../src/legacy/app.js', import.meta.url), 'utf8');
  assert.match(app, /fileReview: storiaDellaSessioneInCaricamento\(\) \? null\n\s+: state\.realSession\.reviewFiles instanceof Map/);
  const confine = app.slice(app.indexOf("evento.name === 'talos.fine-rigiocata') {"), app.indexOf("evento.name === 'talos.fine-rigiocata') {") + 2500);
  assert.match(confine, /aggiornaTestataSessione\(\); \/\/ A1-bis 5/);
  assert.match(confine, /aggiornaPiedeChatDaStato\(\); \/\/ A1-bis 5/);
});
