import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { collegaNavigazioneSpina } from '../../src/components/conversazione.js';
import { aggiornaSeparatoreContesto } from '../../src/components/context-separator.js';

const app = readFileSync(process.env.BC43_APP_SORGENTE || new URL('../../src/legacy/app.js', import.meta.url), 'utf8');
const ponte = () => import('../../src/bridge/conversazione-dom.js');
function funzione(nome, contesto) {
  const codice = app.match(new RegExp(`^  function ${nome}\\([^]*?^  }`, 'm'))?.[0];
  assert.ok(codice, `Manca la funzione ${nome}`);
  return vm.runInNewContext(`(${codice})`, contesto);
}

function banco({ ridotto = false, ridottoApp = false } = {}) {
  const ascolti = new Map();
  const misure = { osservati: [], chiamate: [], root: null };
  const scorrevole = {
    scrollTop: 0, scrollHeight: 1800, clientHeight: 500, clientTop: 2,
    getBoundingClientRect: () => ({ top: 100 }),
    scrollTo(opzioni) { misure.chiamate.push(opzioni); this.scrollTop = Math.min(1300, Math.max(0, opzioni.top)); },
  };
  const turno = {
    getBoundingClientRect: () => ({ top: 902 }),
    scrollIntoView() { misure.chiamate.push('scrollIntoView'); },
  };
  const tick = { closest: s => { assert.equal(s, '.talos-turn'); return turno; } };
  const colonna = {
    dataset: {}, children: [], scrollHeight: 1800, clientHeight: 1800,
    get scrollTop() { return 0; }, set scrollTop(v) { void v; },
    closest(s) { assert.equal(s, '.talos-conversation'); return scorrevole; },
    addEventListener: (tipo, fn) => ascolti.set(tipo, fn),
    removeEventListener: (tipo, fn) => { if (ascolti.get(tipo) === fn) ascolti.delete(tipo); },
    querySelectorAll(s) {
      if (s === '.talos-turn') return [turno];
      if (s === '[data-context-separator]') return this.children;
      throw new Error(`Selettore inatteso: ${s}`);
    },
    append(nodo) { this.children.push(nodo); },
    classList: { contains: () => false },
  };
  const finestra = {
    matchMedia(s) { assert.equal(s, '(prefers-reduced-motion: reduce)'); return { matches: ridotto }; },
    IntersectionObserver: class {
      constructor(callback, opzioni) { misure.root = opzioni.root; }
      observe(nodo) { misure.osservati.push(nodo); }
      disconnect() { misure.disconnesso = true; }
    },
    MutationObserver: class { observe(nodo) { misure.mutazioni = nodo; } disconnect() {} },
    setTimeout: fn => fn(),
  };
  const doc = {
    defaultView: finestra,
    body: { classList: { contains: s => s === 'reduce-motion' && ridottoApp } },
    querySelector(s) { assert.equal(s, '#conversation'); return colonna; },
    createElement() { return { dataset: {}, children: [], setAttribute() {}, addEventListener() {}, append(...n) { this.children.push(...n); } }; },
  };
  colonna.ownerDocument = scorrevole.ownerDocument = doc;
  return { scorrevole, colonna, turno, tick, doc, finestra, misure, ascolti };
}

test('BC43-01 — colonna e scorrevole sono distinti, anche con radice incorporata', async () => {
  const { colonnaConversazione, scorrevoleConversazione } = await ponte();
  const b = banco();
  assert.equal(colonnaConversazione(b.doc), b.colonna);
  assert.equal(scorrevoleConversazione(b.colonna), b.scorrevole);
  assert.equal(scorrevoleConversazione(null), null);
  assert.equal(colonnaConversazione({ querySelector: () => null }), null);
  const vecchioDom = { scrollTop: 0 };
  assert.equal(scorrevoleConversazione(vecchioDom), vecchioDom);
});

test('BC43-02 — il chiamante della bolla appesa cambia scrollTop dello scorrevole soltanto', () => {
  const b = banco();
  const contesto = {
    $: s => b.doc.querySelector(s), document: b.doc, window: b.finestra,
    CONVERSAZIONE_FONDO_SOGLIA_PX: 24,
    movimentoRidottoDalSistema: () => true,
    colonnaConversazione: () => b.colonna,
    scorrevoleConversazione: nodo => nodo.closest('.talos-conversation'), ROOT: () => b.doc,
  };
  contesto.scrollerConversazione = funzione('scrollerConversazione', contesto);
  contesto.scorriInFondoConversazione = funzione('scorriInFondoConversazione', contesto);
  funzione('scorriAllaBollaAppesa', contesto)({ isConnected: true });
  assert.equal(b.scorrevole.scrollTop, 1300);
  assert.equal(b.colonna.scrollTop, 0);
});

test('BC43-03 — il separatore continua a entrare nella colonna e si deduplica al replay', async () => {
  const { colonnaConversazione } = await ponte();
  const b = banco();
  const evento = { sessionId: 'prova', versionId: 'v1', kind: 'context.committed' };
  for (let i = 0; i < 2; i++) aggiornaSeparatoreContesto(colonnaConversazione(b.doc), [evento], { sessionId: 'prova', document: b.doc });
  assert.equal(b.colonna.children.length, 1);
  assert.equal(b.colonna.children[0].dataset.contextVersion, 'v1');
  assert.equal(b.scorrevole.scrollTop, 0);
});

test('BC43-04 — la spina osserva la viewport e le mutazioni restano sulla colonna', () => {
  const b = banco();
  const stacca = collegaNavigazioneSpina(b.colonna);
  assert.equal(b.misure.root, b.scorrevole);
  assert.equal(b.misure.mutazioni, b.colonna);
  assert.deepEqual(b.misure.osservati, [b.turno]);
  stacca();
  assert.equal(b.misure.disconnesso, true);
});

for (const ridotto of [false, true]) {
  test(`BC43-05 — il clic della spina muove solo lo scorrevole, movimento ridotto ${ridotto}`, () => {
    const b = banco({ ridotto });
    collegaNavigazioneSpina(b.colonna);
    b.ascolti.get('click')({ target: { closest: s => { assert.equal(s, '.talos-turn-spine__tick'); return b.tick; } } });
    assert.equal(b.scorrevole.scrollTop, 800);
    assert.equal(b.colonna.scrollTop, 0);
    assert.equal(b.misure.chiamate[0].behavior, ridotto ? 'instant' : 'smooth');
  });
}

for (const [sistema, applicazione, comportamento] of [[true, false, 'instant'], [false, true, 'instant'], [false, false, 'smooth']]) {
  test(`BC43-06 — ritorno in fondo: sistema ${sistema}, applicazione ${applicazione}, ${comportamento}`, () => {
    const b = banco({ ridotto: sistema, ridottoApp: applicazione });
    funzione('scorriInFondoConversazione', {
      document: b.doc, movimentoRidottoDalSistema: () => sistema,
      CONVERSAZIONE_FONDO_SOGLIA_PX: 24,
    })(b.scorrevole);
    assert.equal(b.misure.chiamate[0].behavior, comportamento);
    assert.equal(b.colonna.scrollTop, 0);
  });
}

for (const collegato of [true, false]) {
  test(`BC43-07 — la nota attrezzo scorre nella chat soltanto se ancora collegata: ${collegato}`, () => {
    const b = banco({ ridotto: true });
    const article = {
      isConnected: collegato, hidden: false,
      getBoundingClientRect: () => ({ bottom: 1400 }),
      scrollIntoView: () => b.misure.chiamate.push('scrollIntoView'),
      classList: { add() {} },
    };
    const detail = { classList: { add() {} } };
    funzione('appendToolNote', {
      creaRigaAttrezzo: () => ({ riga: article, corpo: detail }),
      markMotionEnter() {}, window: b.finestra, document: b.doc,
      $: s => b.doc.querySelector(s), fondoConversazioneInVista: () => false,
      scrollerConversazione: () => b.scorrevole, movimentoRidottoDalSistema: () => true,
    })('Nota di prova', { contenitore: { append() {} } });
    assert.equal(b.scorrevole.scrollTop, collegato ? 798 : 0);
    assert.equal(b.colonna.scrollTop, 0);
    assert.equal(b.misure.chiamate.length, collegato ? 1 : 0);
    if (collegato) assert.equal(b.misure.chiamate[0].behavior, 'instant');
  });
}
