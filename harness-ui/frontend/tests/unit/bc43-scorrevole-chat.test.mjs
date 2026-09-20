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

/*
 * ⛔ 16/09/2026 (P0, corsia C, punto 6) — BC43-02 E BC43-07 SONO STATI RISCRITTI, E QUI C'È PERCHÉ.
 *
 * Quello che questo file difende è UN invariante: lo scroll si scrive sullo SCORREVOLE
 * (`.talos-conversation`), mai sulla COLONNA (`#conversation`) — la causa di BC-08/BC-43.
 * Quell'invariante non è cambiato e resta provato riga per riga.
 *
 * È cambiata la STRADA: `scorriAllaBollaAppesa` e la coda di `appendToolNote` non scrivono più lo
 * scroll da sole (`scorriInFondoConversazione`, `scrollTo` a molla, `setTimeout(40)`), perché in
 * quel modo cinque eventi del MODELLO riportavano in fondo una persona che stava leggendo più su.
 * Adesso passano dall'unico scrittore, `scrollStreamingOutput`, che consulta `streamingAutoFollow`.
 * ⇒ Le due prove ora fanno girare la CATENA VERA (chiamante → scrittore unico → scorrevole) invece
 *   di fermarsi al primo anello: guardano più di prima, non meno.
 */
function contestoScrollReale(b, { autoFollow = true } = {}) {
  const contesto = {
    $: s => b.doc.querySelector(s), document: b.doc, window: b.finestra,
    CONVERSAZIONE_FONDO_SOGLIA_PX: 24,
    CONVERSATION_FOLLOW_EPSILON_PX: 24,
    movimentoRidottoDalSistema: () => true,
    colonnaConversazione: () => b.colonna,
    scorrevoleConversazione: nodo => nodo.closest('.talos-conversation'), ROOT: () => b.doc,
    // stato del modulo: il corpo della funzione li legge e li scrive come variabili libere
    streamingAutoFollow: autoFollow,
    streamingLastTargetTop: null,
    streamingScrollFrame: null,
    streamingScrollTarget: null,
    riarmate: 0,
    riarmaSeguiConversazione() { contesto.riarmate += 1; contesto.streamingAutoFollow = true; contesto.streamingLastTargetTop = null; },
    // fuori dall'invariante di questo file: lo spazio in coda ha il suo test (SPAZIO-CODA-01)
    aggiornaSpazioCodaConversazione() {},
    logStreaming() {},
  };
  contesto.scrollerConversazione = funzione('scrollerConversazione', contesto);
  contesto.scrollStreamingOutput = funzione('scrollStreamingOutput', contesto);
  return contesto;
}

test('BC43-02 — la bolla appesa passa dallo scrittore unico e muove solo lo scorrevole', () => {
  const b = banco();
  const contesto = contestoScrollReale(b);
  const article = { isConnected: true, getBoundingClientRect: () => ({ bottom: 1400 }) };
  funzione('scorriAllaBollaAppesa', contesto)(article);
  // fondo del contenuto 1300, metà viewport 250 ⇒ 1050: il bersaglio «a metà pagina» dell'owner
  assert.equal(b.scorrevole.scrollTop, 1050);
  assert.equal(b.colonna.scrollTop, 0);
  assert.equal(contesto.riarmate, 0, 'un evento del modello non riarma il seguito');
});

test('BC43-02-bis AL CONTRARIO — con il seguito spento nessuno tocca lo scroll, nemmeno di un pixel', () => {
  const b = banco();
  const contesto = contestoScrollReale(b, { autoFollow: false });
  funzione('scorriAllaBollaAppesa', contesto)({ isConnected: true, getBoundingClientRect: () => ({ bottom: 1400 }) });
  assert.equal(b.scorrevole.scrollTop, 0, 'la persona si era spostata: la vista resta dov’è');
  assert.equal(b.colonna.scrollTop, 0);
});

test('BC43-02-ter — il messaggio della PERSONA riarma il seguito e la riporta a schermo', () => {
  const b = banco();
  const contesto = contestoScrollReale(b, { autoFollow: false });
  funzione('scorriAllaBollaAppesa', contesto)({ isConnected: true, getBoundingClientRect: () => ({ bottom: 1400 }) }, { azioneDellaPersona: true });
  assert.equal(contesto.riarmate, 1);
  assert.equal(b.scorrevole.scrollTop, 1050);
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
    let riarmate = 0;
    funzione('scorriInFondoConversazione', {
      document: b.doc, movimentoRidottoDalSistema: () => sistema,
      CONVERSAZIONE_FONDO_SOGLIA_PX: 24,
      riarmaSeguiConversazione: () => { riarmate += 1; },
    })(b.scorrevole);
    assert.equal(b.misure.chiamate[0].behavior, comportamento);
    assert.equal(b.colonna.scrollTop, 0);
    /* ⛔ 16/09 — questa funzione ha un chiamante solo, il pulsante «torna in fondo»: è la persona che
       CHIEDE il fondo, quindi è qui che il «segui mentre scrive» si riaccende. Prima lo riaccendeva
       `RunStarted`, cioè un evento del modello, e la persona rientrava nel seguito senza averlo chiesto. */
    assert.equal(riarmate, 1, 'chiedere il fondo riaccende il seguito');
  });
}

for (const collegato of [true, false]) {
  test(`BC43-07 — la nota attrezzo scorre nella chat soltanto se ancora collegata: ${collegato}`, () => {
    const b = banco({ ridotto: true });
    const article = {
      isConnected: collegato, hidden: false,
      getBoundingClientRect: () => ({ bottom: 1400 }),
      classList: { add() {} },
    };
    const detail = { classList: { add() {} } };
    const contesto = contestoScrollReale(b);
    contesto.creaRigaAttrezzo = () => ({ riga: article, corpo: detail });
    contesto.markMotionEnter = () => {};
    /*
     * ⛔ 16/09 — `fondoConversazioneInVista` NON serve più a questa funzione, ed è il punto della
     *   cura: la guardia che la usava era CAPOVOLTA («se sono in fondo non fare niente, se sto
     *   leggendo più in su portami giù»). Resta qui come trappola: se qualcuno la rimettesse, la
     *   chiamata farebbe fallire questa prova invece di passare in silenzio.
     */
    contesto.fondoConversazioneInVista = () => { throw new Error('la riga attrezzo non deve più decidere da sé dove sta la vista'); };
    funzione('appendToolNote', contesto)('Nota di prova', { contenitore: { append() {} } });
    assert.equal(b.scorrevole.scrollTop, collegato ? 1050 : 0);
    assert.equal(b.colonna.scrollTop, 0);
  });
}

test('BC43-08 — una riga attrezzo NON riporta giù chi si è spostato (la guardia non è più capovolta)', () => {
  const b = banco({ ridotto: true });
  const article = { isConnected: true, hidden: false, getBoundingClientRect: () => ({ bottom: 1400 }), classList: { add() {} } };
  const contesto = contestoScrollReale(b, { autoFollow: false });
  contesto.creaRigaAttrezzo = () => ({ riga: article, corpo: { classList: { add() {} } } });
  contesto.markMotionEnter = () => {};
  contesto.fondoConversazioneInVista = () => { throw new Error('la riga attrezzo non deve più decidere da sé dove sta la vista'); };
  funzione('appendToolNote', contesto)('Nota di prova', { contenitore: { append() {} } });
  assert.equal(b.scorrevole.scrollTop, 0, 'la persona sta leggendo più in alto: una riga nuova non la sposta');
});
