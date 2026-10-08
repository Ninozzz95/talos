import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { collegaNavigazioneSpina } from '../../src/components/conversazione.js';
import TESTI_CHAT from '../../src/i18n/testi/chat.js';

/*
 * ⭐⭐ BUG-24, 06/10/2026 — IL BANCO DELLA FINESTRA DI REPLAY (Mosse 1 del dossier
 * `harness-ui/scratchpad/dossier-bug24-conversazioni-lunghe-2026-10-06.md`).
 *
 * Il difetto: nelle conversazioni lunghe (rettifica owner 06/10/2026: lag percepito da ~300 giri in su, NON da 3000
 * come ipotizzato all'origine — dossier BUG-24) l'apertura monta TUTTA la cronologia (misurato:
 * 19.482 nodi, 7,0 s di apertura su una sessione vera — commento 11/09 in `mantieniFondoDuranteRipristino`)
 * e l'utente aspetta svariati minuti prima di tornare all'ultima posizione. Il replay SSE monta un blocco
 * DOM per OGNI evento (`handleRealEvent`), il custode del fondo fa layout thrashing per tutto il replay,
 * e `collegaNavigazioneSpina` ri-scanza TUTTI i turni a OGNI mutazione → O(n²) sull'apertura.
 *
 * La cura (decisioni owner già firmate nel dossier, NON si rimettono in discussione):
 *   D1 — finestra di replay senza virtualizer (strada Hermes); D2 — la finestra si misura a PESO di
 *   montaggio con pavimento minimo; D3 — la coda viva è SEMPRE montata, gli eventi fuori finestra
 *   restano processati; D4 — «Mostra precedenti» + backfill con prepend ANCORATO (letture prima delle
 *   scritture); D5 — il single-writer non si tocca (custode batched); D6 — spina a registro additivo.
 *
 * I casi qui sotto riprendono il piano di test del dossier (a)-(e) e li nominano B24-*.
 * Come i canceli del progetto (replay-non-tocca-il-layout), le prove-chiave girano anche AL CONTRARIO:
 * la stessa asserzione rifatta su una copia GUASTA a mano deve fallire, o non sta guardando niente.
 */

const APP = readFileSync(new URL('../../src/legacy/app.js', import.meta.url), 'utf8');
const STILI = readFileSync(new URL('../../src/styles/index.css', import.meta.url), 'utf8');
const senzaCommenti = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
const NUDO = senzaCommenti(APP);

/** Il corpo di una funzione o il intorno di un segnale, dal segnale dato fino a `lunghezza` caratteri. */
const attorno = (sorgente, segnale, lunghezza = 2600) => {
  const i = sorgente.indexOf(segnale);
  assert.notEqual(i, -1, `segnale non trovato nel sorgente: ${segnale}`);
  return sorgente.slice(i, i + lunghezza);
};

/** Estrae una funzione del monolite (2 spazi d'indentazione) e la fa girare in un contesto finto. */
function funzione(nome, contesto) {
  const codice = APP.match(new RegExp(`^  function ${nome}\\([^]*?^  }`, 'm'))?.[0];
  assert.ok(codice, `Manca la funzione ${nome} in app.js: la cura è cambiata di forma, il banco va seguito`);
  return vm.runInNewContext(`(${codice})`, contesto);
}

/* ─────────────────────────── DOM finto, minimo ma onesto ─────────────────────────── */

function turnoFinto({ nome = 'giro', nodi = 9, altezza = 100 } = {}) {
  const turno = {
    nome, nodi, altezza,
    isConnected: true,
    parentNode: null,
    classList: { contains: (c) => c === 'talos-turn' },
    dataset: {},
    querySelector: () => null,
    querySelectorAll: (selettore) => (selettore === '*' ? Array.from({ length: nodi }) : []),
    remove() {
      this.isConnected = false;
      const p = this.parentNode;
      if (p) p.children = p.children.filter((figlio) => figlio !== this);
      this.parentNode = null;
    },
  };
  /* il prepend reale inserisce i figli del frammento PRIMA di questo nodo e cresce il layout: qui lo simuliamo */
  turno.before = (frammento) => {
    const p = turno.parentNode;
    assert.ok(p, 'il turno di riferimento non ha un genitore: il prepend non sa dove andare');
    const i = p.children.indexOf(turno);
    const inseriti = frammento.figli ?? [];
    p.children.splice(i, 0, ...inseriti);
    for (const n of inseriti) { n.parentNode = p; n.isConnected = true; }
    if (p.scorrevole && frammento._altezza) p.scorrevole.scrollHeight += frammento._altezza;
  };
  return turno;
}

function colonnaFinta(figli = []) {
  const colonna = {
    children: figli,
    scorrevole: null,
    get firstElementChild() { return this.children[0] ?? null; },
    get lastElementChild() { return this.children[this.children.length - 1] ?? null; },
    get childElementCount() { return this.children.length; },
    querySelector(selettore) {
      if (selettore === '.talos-turn') return this.children.find((c) => c.classList?.contains('talos-turn')) ?? null;
      return null;
    },
    querySelectorAll(selettore) {
      if (selettore === '.talos-turn') return this.children.filter((c) => c.classList?.contains('talos-turn'));
      return [];
    },
    append(nodo) { this.children.push(nodo); nodo.parentNode = this; },
    insertBefore(nodo, prima) {
      const i = prima ? this.children.indexOf(prima) : this.children.length;
      this.children.splice(i, 0, nodo); nodo.parentNode = this;
    },
    parentElement: null,
  };
  for (const f of figli) f.parentNode = colonna;
  return colonna;
}

function scorrevoleFinto(colonna, { scrollTop = 0, scrollHeight = 2000 } = {}) {
  const sc = {
    children: [colonna],
    scrollTop, scrollHeight, clientHeight: 800,
    style: { overflowAnchor: '' },
    insertBefore(nodo, prima) {
      const i = prima ? this.children.indexOf(prima) : this.children.length;
      this.children.splice(i, 0, nodo);
      nodo.remove = () => { const k = this.children.indexOf(nodo); if (k !== -1) this.children.splice(k, 1); };
    },
    querySelector(selettore) {
      if (selettore === ':scope > .talos-mostra-precedenti') return this.children.find((c) => c.className === 'talos-mostra-precedenti') ?? null;
      return null;
    },
  };
  colonna.parentElement = sc;
  colonna.scorrevole = sc;
  return sc;
}

function documentoFinto() {
  return {
    createElement(tag) {
      return { tag, type: '', className: '', textContent: '', hidden: false, _click: null, style: {},
        addEventListener(tipo, fn) { if (tipo === 'click') this._click = fn; },
        remove() {} };
    },
    createDocumentFragment() {
      return { figli: [], _altezza: 0, append(n) { this.figli.push(n); this._altezza += n.altezza ?? 0; } };
    },
    getElementById: () => null,
  };
}

/** Il banco della finestra: le cinque funzioni della cura nello stesso contesto (si vedano fra loro). */
function bancoFinestra({ generation = 7, inRigiocata = true, autoFollow = true, peso = 100, pavimento = 3, pagina = 100 } = {}) {
  const colonna = colonnaFinta();
  const sc = scorrevoleFinto(colonna);
  const radice = { querySelector: (s) => (s === '#conversation' ? colonna : null) };
  const contesto = {
    window: { requestAnimationFrame: () => 1, cancelAnimationFrame() {} },
    cimaInCoda: null,
    colonnaConversazione: (r) => r?.querySelector('#conversation') ?? null,
    ROOT: () => radice,
    scrollerConversazione: () => sc,
    state: { realSession: { generation, inRigiocata } },
    streamingAutoFollow: autoFollow,
    FINESTRA_REPLAY: { peso, pavimento, pagina },
    turniFuoriFinestra: [],
    registroFinestraGenerazione: null,
    pesoFinestraReplay: 0,
    ultimoTurnoVistoFinestra: null,
    revisioneLayoutConversazione: 0, // A1: smonta e aggiungi pagina la toccano in modo SINCRONO
    document: documentoFinto(),
    tr: (chiave) => `«${chiave}»`,
  };
  contesto.pesoTurnoReplay = funzione('pesoTurnoReplay', contesto);
  contesto.smontaTurnoPiuVecchioReplay = funzione('smontaTurnoPiuVecchioReplay', contesto);
  contesto.aggiungiPaginaPrecedenti = funzione('aggiungiPaginaPrecedenti', contesto);
  contesto.assicuraBottonePrecedenti = funzione('assicuraBottonePrecedenti', contesto);
  contesto.aggiornaFinestraReplay = funzione('aggiornaFinestraReplay', contesto);
  if (/^  function resettaFinestraReplay\(/m.test(APP)) contesto.resettaFinestraReplay = funzione('resettaFinestraReplay', contesto);
  contesto.colonna = colonna;
  contesto.scorrevole = sc;
  return contesto;
}

/** Ciò che `handleRealEvent` fa a ogni evento rigiocato: monta un turno, poi il gate riporta la finestra. */
function montaEvento(contesto, { nodi = 9, altezza = 100, nome } = {}) {
  const turno = turnoFinto({ nodi, altezza, nome });
  contesto.colonna.append(turno);
  contesto.aggiornaFinestraReplay();
  return turno;
}

const montati = (contesto) => contesto.colonna.querySelectorAll('.talos-turn');

/* ═══════════════════════════════════════════════════════════════════════════════════
 * ⭐ BUG-24, 06/10/2026 — COMPLETAMENTE DEL BANCO (curante in ripresa, append-only).
 * L'impalcatura sopra (DOM finto, bancoFinestra, montaEvento, montati) è quanto lasciatoci
 * dal curante precedente, morto prima di scrivere i casi. I casi qui sotto COMPLETANO il
 * piano di test del dossier (a)-(e), nominati B24-*, stile BUG-25 (casi nominati, messaggi
 * parlanti). Ogni prova-chiave gira anche AL CONTRARIO (cancello, come
 * `replay-non-tocca-il-layout-a-ogni-evento.test.mjs`): la stessa asserzione rifatta su una
 * copia GUASTA a mano — la forma di ieri, rimessa a mano — deve fallire, o non sta guardando
 * niente. I mutanti coprono la lista dichiarata nel dossier: tetto tolto, ri-scan totale
 * della spina, custode con letture/scritture invertite, prepend senza ancoraggio.
 * ═══════════════════════════════════════════════════════════════════════════════════ */

const CONV = readFileSync(new URL('../../src/components/conversazione.js', import.meta.url), 'utf8');

/* I segnali che i mutanti guastano: se il sorgente curato smette di contenerli, il banco urla
   invece di tacere (la cura è cambiata di forma → il banco va seguito). */
const SEG_TETTO = 'while (turniMontati > FINESTRA_REPLAY.pavimento && pesoFinestraReplay > FINESTRA_REPLAY.peso) {';
const SEG_ANCORAGGIO = 'sc.scrollTop = prima.alto + (sc.scrollHeight - prima.altezza);';
const SEG_LETTURA_IN_FONDO = 'const spazio = calcolaSpazioCodaConversazione(conversation, sc);';
const SEG_USCITA_ANTICIPATA = 'if (!opzioni?.colonnaCresciuta && chiave === chiaveSpazioCodaUltimo && spazioCodaConversazioneUltimo !== -1) return;';
const SEG_GATE = 'if (state.realSession.inRigiocata) aggiornaFinestraReplay();';

/** Un guasto si costruisce SOLO se il sorgente curato contiene davvero il punto da guastare. */
const guasta = (segnale, sostituto, motivazione) => {
  assert.ok(APP.includes(segnale), `il sorgente curato non contiene più il segnale atteso (${motivazione}): il banco va seguito`);
  return APP.replace(segnale, sostituto);
};

/** Estrae una funzione da UN SORGENTE DATO (anche guasto) e la fa girare in un contesto finto. */
function funzioneDa(sorgente, nome, contesto) {
  const codice = sorgente.match(new RegExp(`^  function ${nome}\\([^]*?^  }`, 'm'))?.[0];
  assert.ok(codice, `Manca la funzione ${nome} nel sorgente dato: la cura è cambiata di forma, il banco va seguito`);
  return vm.runInNewContext(`(${codice})`, contesto);
}

/** Ogni prova-chiave gira anche sul sorgente GUASTO: lì deve fallire, o non sta guardando niente. */
const morde = (controllo, guasto) => {
  assert.throws(() => controllo(guasto), assert.AssertionError,
    'il controllo passa anche sul sorgente GUASTO: non morde');
};

test('B24-01 FINESTRA-A-PESO: eventi oltre budget ⇒ montati ≤ finestra, STATO completo nel registro (dossier a)', () => {
  const controllo = (sorgente) => {
    const b = bancoFinestra({ peso: 100, pavimento: 3, pagina: 100 });
    const gate = funzioneDa(sorgente, 'aggiornaFinestraReplay', b);
    for (let i = 1; i <= 20; i += 1) {
      b.colonna.append(turnoFinto({ nome: `g${i}`, nodi: 9, altezza: 100 })); // un turno leggero = 10 di peso
      gate();
    }
    assert.ok(montati(b).length <= 12, `i montati seguono la CRONOLOGIA (${montati(b).length} turni su 20 eventi): il tetto a peso non sta guardando niente (D2)`);
    return b;
  };
  const b = controllo(APP);
  assert.equal(montati(b).length, 11, 'stato misurato a budget 100/pavimento 3 con turni da 10: 11 montati (110 di peso chiuso, smontato fino al budget) — se l\'attacco dei pesi cambia, il banco va seguito');
  assert.equal(b.turniFuoriFinestra.length, 9, 'niente si perde: gli eventi fuori finestra restano PROCESSATI (D3) — i nodi staccati vivono nel registro, pronti per il «Mostra precedenti»');
  assert.equal(montati(b).length + b.turniFuoriFinestra.length, 20, 'montati + registro = eventi giocati: nessun turno abbandonato');
  assert.deepEqual(b.turniFuoriFinestra.map((t) => t.nome), ['g1', 'g2', 'g3', 'g4', 'g5', 'g6', 'g7', 'g8', 'g9'], 'il registro è il prefisso più vecchio, IN ORDINE: il prepend lo deve trovare pronto (D4)');
  assert.equal(montati(b)[montati(b).length - 1].nome, 'g20', 'la coda viva è montata fino all\'ultimo evento giocato (D3)');
  // AL CONTRARIO (mutante del dossier: «togli il tetto di montaggio»): il difetto originale torna
  morde(controllo, guasta(SEG_TETTO, 'while (false) {', 'tetto di montaggio della finestra'));
});

test('B24-02 CODA-VIVA-SEMPRE-MONTATA: giri pesanti oltre budget ⇒ il pavimento tiene, l\'ultimo turno non si smonta (dossier b)', () => {
  const controllo = (sorgente) => {
    const b = bancoFinestra({ peso: 100, pavimento: 3, pagina: 100 });
    const gate = funzioneDa(sorgente, 'aggiornaFinestraReplay', b);
    for (let i = 1; i <= 8; i += 1) {
      b.colonna.append(turnoFinto({ nome: `g${i}`, nodi: 60, altezza: 100 })); // un turno pesante = 61 di peso
      gate();
      assert.ok(montati(b).length >= Math.min(3, i), `montati ${montati(b).length} dopo ${i} eventi (ne esistono ${i}): la finestra è scesa sotto il pavimento (D2, «never virtualizes below the min-group floor»)`);
    }
    return b;
  };
  const b = controllo(APP);
  assert.equal(montati(b).length, 3, 'restano ESATTAMENTE i turni del pavimento: 3×61 = 183 > budget 100 — è il pavimento (D2), non il budget, a fermare lo smontaggio');
  assert.ok(b.pesoFinestraReplay > 100, `peso finestra ${b.pesoFinestraReplay} ≤ budget: il test non dimostra il pavimento (il budget avrebbe fermato da solo)`);
  assert.deepEqual(montati(b).map((t) => t.nome), ['g6', 'g7', 'g8'], 'restano montati gli ULTIMI turni: la coda viva (D3)');
  assert.deepEqual(b.turniFuoriFinestra.map((t) => t.nome), ['g1', 'g2', 'g3', 'g4', 'g5'], 'smontati solo i più vecchi, in ordine: l\'ultimo turno non finisce MAI nel registro (D3)');
  // AL CONTRARIO (mutante: pavimento tolto): la finestra scende sotto il minimo e sembra rotta
  morde(controllo, guasta('turniMontati > FINESTRA_REPLAY.pavimento && ', '', 'pavimento della finestra'));
});

test('B24-03 PREPEND-ANCORATO: la pagina vecchia torna in testa, ordine preservato, la vista non salta (dossier c)', () => {
  const controllo = (sorgente) => {
    const b = bancoFinestra({ peso: 100, pavimento: 3, pagina: 100, inRigiocata: false }); // il prepend NON gira durante il replay (D4): il banco del prepend è a replay spento
    const prepend = funzioneDa(sorgente, 'aggiungiPaginaPrecedenti', b);
    montaEvento(b, { nome: 'vivo', nodi: 9, altezza: 100 }); // la coda viva, già montata
    b.scorrevole.scrollTop = 500;
    b.scorrevole.scrollHeight = 2000;
    for (let i = 1; i <= 4; i += 1) b.turniFuoriFinestra.push(turnoFinto({ nome: `vec${i}`, nodi: 9, altezza: 100 }));
    prepend();
    assert.equal(b.scorrevole.scrollTop, 900, `scrollTop ${b.scorrevole.scrollTop} ≠ 900: la vista SALTA al prepend — il contenuto cresciuto sopra la vista (4×100px) non è compensato (D4: letture prima delle scritture, una scrittura sola)`);
    assert.deepEqual(b.colonna.children.map((t) => t.nome), ['vec1', 'vec2', 'vec3', 'vec4', 'vivo'], 'la pagina vecchia torna in TESTA alla colonna, in ordine vecchio→nuovo, sopra la coda viva');
    assert.equal(b.turniFuoriFinestra.length, 0, 'la pagina consuma il registro fino all\'ultima pagina');
    assert.equal(b.pesoFinestraReplay, 40, 'il peso della pagina rientra nell\'ammontare della finestra (40 = 4×10)');
    return b;
  };
  controllo(APP);
  // AL CONTRARIO (mutante del dossier: «fai il prepend senza ancoraggio»): la vista salta
  morde(controllo, guasta(SEG_ANCORAGGIO, 'sc.scrollTop = prima.alto;', 'ancoraggio del prepend'));
});

/* ── DOM finto per la SPINA REALE (`collegaNavigazioneSpina`, importata in testa al file) ── */

const turnoSpina = (nome) => ({ nodeType: 1, nome, classList: { contains: (c) => c === 'talos-turn' } });

function convSpinaFinta(turniIniziali) {
  const ascoltatori = new Map();
  return {
    children: [...turniIniziali],
    dataset: {},
    closest: () => null, // «Anche il vecchio DOM»: colonna e scorrevole coincidono (bridge/conversazione-dom.js)
    ascoltatori,
    addEventListener(tipo, fn) { if (!ascoltatori.has(tipo)) ascoltatori.set(tipo, new Set()); ascoltatori.get(tipo).add(fn); },
    removeEventListener(tipo, fn) { ascoltatori.get(tipo)?.delete(fn); },
    ownerDocument: { defaultView: null, body: { classList: { contains: () => false } } }, // compilata dal chiamante con la finestra finta
    querySelector(selettore) {
      if (selettore === '.talos-turn') return this.children.find((c) => c.classList?.contains('talos-turn')) ?? null;
      return null;
    },
    querySelectorAll(selettore) {
      if (selettore === '.talos-turn') return this.children.filter((c) => c.classList?.contains('talos-turn'));
      return [];
    },
  };
}

function finestraSpinaFinta() {
  const io = [];
  const mo = [];
  class IOFinto {
    constructor(cb, opzioni) { this.cb = cb; this.opzioni = opzioni; this.bersagli = []; this.unosservati = []; this.chiamate = 0; this.staccato = false; io.push(this); }
    observe(t) { this.chiamate += 1; this.bersagli.push(t); }
    unobserve(t) { this.unosservati.push(t); this.bersagli = this.bersagli.filter((x) => x !== t); }
    disconnect() { this.bersagli = []; this.staccato = true; }
  }
  class MOFinto {
    constructor(cb) { this.cb = cb; this.staccato = false; mo.push(this); }
    observe() {}
    disconnect() { this.staccato = true; }
  }
  return { IntersectionObserver: IOFinto, MutationObserver: MOFinto, __io: io, __mo: mo };
}

test('B24-04 SPINA-ADDITIVA: una mutazione osserva SOLO i nodi nuovi; la cima si riaggancia O(1) e chiama il backfill (dossier d)', () => {
  const conv = convSpinaFinta([turnoSpina('t0'), turnoSpina('t1'), turnoSpina('t2')]);
  const fin = finestraSpinaFinta();
  conv.ownerDocument.defaultView = fin; // il chiamante compila la finestra finta (vedi convSpinaFinta)
  const viste = [];
  const stacca = collegaNavigazioneSpina(conv, { suCimaRaggiunta: () => viste.push('cima') });
  assert.equal(fin.__io.length, 2, 'due osservatori attesi: la spina dei giri e quello di backfill (D4)');
  const spina = fin.__io[0];
  const cima = fin.__io[1];
  assert.deepEqual(spina.bersagli.map((t) => t.nome), ['t0', 't1', 't2'], 'l\'aggancio osserva i turni presenti, UNA volta sola (la scansione intera resta quella d\'aggancio)');
  assert.equal(spina.chiamate, 3, `la spina ha chiamato observe ${spina.chiamate} volte all'aggancio: una scansione sola, non una per mutazione (D6)`);
  assert.equal(cima.opzioni.rootMargin, '-120px 0px 0px 0px', 'il backfill parte con rootMargin negativo SOPRA, come da dossier D4');
  assert.deepEqual(cima.bersagli.map((t) => t.nome), ['t0'], 'il bersaglio di backfill è la PRIMA riga montata');
  // una mutazione con un nodo nuovo + un nodo testo: si osserva SOLO il turno nuovo (D6)
  fin.__mo[0].cb([{ addedNodes: [{ nodeType: 3 }, turnoSpina('tNuovo')] }], fin.__mo[0]);
  assert.equal(spina.chiamate, 4, `observe chiamato ${spina.chiamate} volte dopo 1 mutazione: la forma di ieri ri-scanava TUTTI i turni (7 chiamate) — O(n) per evento, O(n²) sull'apertura`);
  assert.equal(spina.bersagli[spina.bersagli.length - 1].nome, 'tNuovo', 'il nodo nuovo è l\'unico bersaglio aggiunto: la mutazione dice QUALI nodi sono stati aggiunti');
  // una mutazione senza nodi nuovi non costa niente
  fin.__mo[0].cb([{ addedNodes: [] }], fin.__mo[0]);
  assert.equal(spina.chiamate, 4, 'una mutazione senza nodi nuovi non deve toccare l\'osservatore');
  // il prepend sposta la prima riga montata: la cima si riaggancia O(1) — unobserve+observe, zero ri-scan
  const tPrep = turnoSpina('tPrep');
  conv.children.unshift(tPrep);
  fin.__mo[0].cb([{ addedNodes: [tPrep] }], fin.__mo[0]);
  assert.deepEqual(cima.unosservati.map((t) => t.nome), ['t0'], 'il vecchio bersaglio di cima viene lasciato');
  assert.deepEqual(cima.bersagli.map((t) => t.nome), ['tPrep'], 'il bersaglio di backfill segue la NUOVA prima riga montata');
  assert.equal(spina.chiamate, 5, 'la spina osserva anche tPrep: è un nodo nuovo che entra dalla cima');
  // la voce d'intersezione chiama il backfill; le voci non intersecanti non chiamano niente
  cima.cb([{ isIntersecting: true }], cima);
  cima.cb([{ isIntersecting: false }], cima);
  assert.deepEqual(viste, ['cima'], 'suCimaRaggiunta scatta UNA volta sola (solo sulle voci intersecanti)');
  stacca();
  // AL CONTRARIO (mutante del dossier: «rimetti il ri-scan totale della spina»): il difetto D6 torna
  const controllo = (sorgente) => {
    const i = sorgente.indexOf('const guarda =');
    const j = sorgente.indexOf('const mutazioni = new', i);
    assert.ok(i !== -1 && j !== -1, 'il callback `guarda` della spina non è più riconoscibile: il banco va seguito');
    assert.ok(!sorgente.slice(i, j).includes("querySelectorAll('.talos-turn')"), 'il callback della MutationObserver ri-scanza TUTTI i .talos-turn: O(n) per evento, il difetto D6 è tornato');
  };
  controllo(CONV);
  const segnale = 'const guarda = (mutazioniLotto) => {';
  assert.ok(CONV.includes(segnale), 'il sorgente della spina non contiene più `guarda`: il banco va seguito');
  morde(controllo, CONV.replace(segnale, `${segnale} for (const turno of conversazione.querySelectorAll('.talos-turn')) osservatore.observe(turno);`));
});

test('B24-05 CUSTODE-BATCHED: inFondo legge PRIMA e scrive DOPO; l\'uscita anticipata decide PRIMA delle letture (dossier e)', () => {
  const controlloInFondo = (sorgente) => {
    /* sul sorgente SENZA commenti: i commenti della cura nominano gli altri simboli e confonderebbero le letture */
    const corpo = attorno(senzaCommenti(sorgente), 'const inFondo = () =>', 1800);
    const primaScrittura = corpo.search(/\.style\.setProperty\(|sc\.scrollTop\s*=/);
    assert.ok(primaScrittura > 0, 'manca la fase di scrittura del custode');
    const primaDelleScritture = corpo.slice(0, primaScrittura);
    assert.ok(primaDelleScritture.includes('calcolaSpazioCodaConversazione') && primaDelleScritture.includes('sc.scrollHeight'), 'inFondo deve completare le letture del layout prima della prima scrittura reale (D5)');
    assert.ok(!primaDelleScritture.includes('aggiornaSpazioCodaConversazione'), 'inFondo richiama lo scrittore `aggiornaSpazioCodaConversazione` fra le letture e la scrittura del fondo: la forma di ieri (layout thrashing misurato 1.334 ms) è tornata');
    assert.ok(corpo.includes('sc.scrollTop = fondo +'), 'la scrittura del fondo non è più compensata del Δ del padding (`fondo + Δ`): lo scroll sbaglierebbe di quanto cresce la riserva');
    if (corpo.includes('ultimoTopNostro = sc.scrollTop;')) assert.ok(corpo.indexOf('ultimoTopNostro = sc.scrollTop;') > corpo.indexOf('sc.scrollTop = fondo +'), 'il readback deve leggere il risultato effettivo dopo la scrittura');
  };
  const controlloUscita = (sorgente) => {
    const corpo = senzaCommenti(sorgente).match(new RegExp('^  function aggiornaSpazioCodaConversazione\\([^]*?^  }', 'm'))?.[0];
    assert.ok(corpo, 'aggiornaSpazioCodaConversazione non è più riconoscibile: il banco va seguito');
    const uscita = corpo.indexOf('colonnaCresciuta');
    const lettura = corpo.indexOf('calcolaSpazioCodaConversazione(');
    assert.ok(uscita !== -1, 'l\'uscita anticipata non dichiara più `colonnaCresciuta`: la chiave strutturale nasconderebbe le crescite dichiarate (ResizeObserver, seguito, custode)');
    assert.ok(lettura !== -1 && uscita < lettura, 'l\'uscita anticipata viene DOPO la lettura del layout: ogni chiamata ripaga getComputedStyle/scrollHeight (zona 4 del dossier)');
    assert.ok(!/getComputedStyle|\.scrollHeight|\.clientHeight/.test(corpo), 'aggiornaSpazioCodaConversazione legge ancora il layout: le letture vivono in calcolaSpazioCodaConversazione, non qui');
  };
  controlloInFondo(APP);
  controlloUscita(APP);
  // AL CONTRARIO 1 (mutante del dossier: «scrivi prima-le-letture-dopo invertite nel custode»)
  morde(controlloInFondo, guasta(SEG_LETTURA_IN_FONDO, 'aggiornaSpazioCodaConversazione(conversation);', 'forma di ieri di inFondo'));
  // AL CONTRARIO 2: l'uscita anticipata tolta — le letture tornano a ogni chiamata
  morde(controlloUscita, guasta(SEG_USCITA_ANTICIPATA, '', 'uscita anticipata prima delle letture'));
});

test('B24-06 GATE-DEL-REPLAY: il gate sta DOPO il processo e SOLO in rigioca; reset per generazione; backfill coalescato e muto durante il replay', () => {
  // zona 1 del dossier: dopo `handleRealEvent`, gate condizionato alla rigiocata
  const controlloGate = (sorgente) => {
    const corpo = attorno(senzaCommenti(sorgente), 'handleRealEvent(evento, generation);', 400);
    assert.ok(corpo.includes('aggiornaFinestraReplay()') && corpo.includes('state.realSession.inRigiocata'), 'il gate della finestra non sta più dopo il processo dell\'evento, condizionato alla rigiocata (zona 1 del dossier)');
  };
  controlloGate(APP);
  morde(controlloGate, guasta(SEG_GATE, '', 'gate del replay in collegaEventiSessione'));
  // fuori dal replay il gate non smonta niente: la coda viva cresce senza tetto, come sempre (D3)
  const bFuori = bancoFinestra({ generation: 7, inRigiocata: false, peso: 100, pavimento: 3, pagina: 100 });
  for (let i = 1; i <= 20; i += 1) {
    bFuori.colonna.append(turnoFinto({ nome: `g${i}`, nodi: 9, altezza: 100 }));
    bFuori.aggiornaFinestraReplay();
  }
  assert.equal(montati(bFuori).length, 20, 'fuori dal replay la finestra non smonta niente: il seguito vivo cresce senza tetto, come sempre');
  // reset per generazione: una sessione nuova butta il registro al primo evento rigiocato, senza ganci
  const b = bancoFinestra({ generation: 7, inRigiocata: true, peso: 100, pavimento: 3, pagina: 100 });
  for (let i = 1; i <= 6; i += 1) {
    b.colonna.append(turnoFinto({ nome: `g${i}`, nodi: 60, altezza: 100 }));
    b.aggiornaFinestraReplay();
  }
  assert.ok(b.turniFuoriFinestra.length > 0, 'il banco non ha prodotto un registro da buttare: rivedere i pesi del banco');
  b.state.realSession.generation = 8;
  b.aggiornaFinestraReplay();
  assert.equal(b.turniFuoriFinestra.length, 0, 'i nodi di un\'altra conversazione non sopravvivono: il registro si butta senza toccare nuovaGenerazioneSessione');
  assert.equal(b.pesoFinestraReplay, 0, 'il peso della finestra riparte da zero con la sessione nuova');
  assert.equal(b.registroFinestraGenerazione, 8, 'il registro è marchiato dalla generazione che lo possiede');
  // coalescenza del backfill: molti eventi d'intersezione nello stesso frame = UN prepend (web.dev «yield»)
  const raf = [];
  const prependi = [];
  const contestoCima = {
    window: { requestAnimationFrame: (cb) => { raf.push(cb); return raf.length; } },
    state: { realSession: { inRigiocata: false } },
    turniFuoriFinestra: [turnoFinto({ nome: 'vec', nodi: 9, altezza: 100 })],
    aggiungiPaginaPrecedenti: () => prependi.push('prepend'),
    cimaInCoda: null,
  };
  const suCima = funzione('suCimaRaggiuntaSpina', contestoCima);
  suCima();
  suCima();
  suCima();
  assert.equal(raf.length, 1, 'tre intersezioni nello stesso fotogramma hanno schedulato più di un rAF: la coalescenza a fotogramma è sparita');
  raf[0]();
  assert.deepEqual(prependi, ['prepend'], 'un prepend solo per tutti gli eventi del frame');
  assert.equal(contestoCima.cimaInCoda, null, 'il coalescatore si riarma dopo il fotogramma');
  // durante il replay il backfill NON prepone: la finestra sta costruendo il fondo (D4)
  const contestoRigiocata = {
    window: { requestAnimationFrame: (cb) => { raf.push(cb); return raf.length; } },
    state: { realSession: { inRigiocata: true } },
    turniFuoriFinestra: [turnoFinto({ nome: 'vec', nodi: 9, altezza: 100 })],
    aggiungiPaginaPrecedenti: () => prependi.push('prepend-in-rigiocata'),
    cimaInCoda: null,
  };
  const suCimaRigiocata = funzione('suCimaRaggiuntaSpina', contestoRigiocata);
  suCimaRigiocata();
  raf[raf.length - 1]();
  assert.deepEqual(prependi, ['prepend'], 'durante il replay il backfill non prepone niente');
  assert.equal(contestoRigiocata.turniFuoriFinestra.length, 1, 'il registro non viene consumato durante il replay');
});

test('B24-07 BOTTONE-E-TESTI: «Mostra precedenti» esiste in it+en, è citato dal monolite, ha stile, e sparisce a registro vuoto (dossier D4)', () => {
  assert.equal(TESTI_CHAT.it['finestra.mostraPrecedenti'], 'Mostra precedenti', 'manca la voce italiana del bottone nell\'area chat');
  assert.equal(TESTI_CHAT.en['finestra.mostraPrecedenti'], 'Show earlier', 'manca la voce inglese del bottone nell\'area chat');
  assert.ok(NUDO.includes("tr('chat.finestra.mostraPrecedenti')"), 'il monolite non usa la chiave stabile del bottone (i18n area chat)');
  assert.ok(STILI.includes('.talos-mostra-precedenti{'), 'manca lo stile del bottone «Mostra precedenti»');
  assert.ok(STILI.includes('.talos-mostra-precedenti[hidden]{display:none}'), 'manca la regola che nasconde davvero il bottone');
  const b = bancoFinestra({ generation: 7, inRigiocata: false, peso: 100, pavimento: 3, pagina: 100 }); // il clic del bottone preponde SOLO a replay spento (D4)
  montaEvento(b, { nome: 'vivo', nodi: 9, altezza: 100 });
  b.turniFuoriFinestra.push(turnoFinto({ nome: 'vec', nodi: 9, altezza: 100 }));
  b.assicuraBottonePrecedenti(b.colonna);
  const bottone = b.scorrevole.children[0];
  assert.equal(bottone.className, 'talos-mostra-precedenti', 'il bottone vive NELLO SCORREVOLE, sopra la colonna: i figli della colonna restano solo turni');
  assert.equal(bottone.hidden, false, 'con il registro pieno il bottone si mostra');
  assert.equal(bottone.textContent, '«chat.finestra.mostraPrecedenti»', 'il bottone usa la chiave i18n (tr finto del banco)');
  bottone._click(); // il clic prepone la pagina e, a registro vuoto, smonta il bottone
  assert.deepEqual(b.colonna.children.map((t) => t.nome), ['vec', 'vivo'], 'il clic preponde la pagina vecchia sopra la coda viva');
  assert.equal(b.turniFuoriFinestra.length, 0, 'il clic consuma il registro');
  assert.deepEqual(b.scorrevole.children, [b.colonna], 'a registro vuoto il bottone si smonta: non resta un bottone morto nello scorrevole');
});

test('B24-08 COSTANTI-REALI (D2): le costanti di produzione esistono, sono congelate, e con LORO la finestra resta nel budget col pavimento che tiene', () => {
  /* D2 chiude così: «Costanti: da definire al momento dell'edit, con test che le coprano». I casi B24-01/02/03
     provano la MECCANICA con costanti iniettate dal banco; questo caso copre le costanti VERE, estratte dal
     sorgente (non copiate a mano) e usate in uno scenario a loro valori: se il proprietario le sposta, è QUESTO
     caso a urlare e a chiedere l'aggiunta consapevole — non un numero morto in un commento. */
  const controllo = (sorgente) => {
    const corrispondenza = senzaCommenti(sorgente).match(
      /const FINESTRA_REPLAY = Object\.freeze\(\{ peso: (\d+), pavimento: (\d+), pagina: (\d+) \}\);/,
    );
    assert.ok(corrispondenza, 'FINESTRA_REPLAY non è più una costante congelata riconoscibile in app.js: la cura è cambiata di forma, il banco va seguito');
    const reali = { peso: Number(corrispondenza[1]), pavimento: Number(corrispondenza[2]), pagina: Number(corrispondenza[3]) };
    assert.equal(reali.peso, 900, `il budget a peso di produzione è ${reali.peso}, non 900: se il proprietario lo sposta DELIBERATAMENTE aggiorni questo caso e il dossier — se lo ha allentato un mutante, qui lo si vede`);
    assert.equal(reali.pavimento, 8, `il pavimento di produzione è ${reali.pavimento}, non 8: con meno turni la finestra «sembra rotta» (Hermes MIN_GROUPS) — aggiornamento deliberato o mutante, qui si vede`);
    assert.equal(reali.pagina, 900, `la pagina di «Mostra precedenti» è ${reali.pagina}, non 900: aggiornamento deliberato o mutante, qui si vede`);

    /* Scenario a costanti reali, giri leggeri (peso 10 ciascuno): a regime il peso dei CHIUSI montati
       sta dentro il budget (90 × 10 = 900) e la coda viva aggiunge l'ultimo giro aperto ⇒ 91 montati,
       109 nel registro, il prefisso più vecchio in ordine. 200 giri giocati, 91 montati: la finestra
       NON cresce con la cronologia (D2), che era il difetto originario. */
    const leggeri = bancoFinestra({ peso: reali.peso, pavimento: reali.pavimento, pagina: reali.pagina });
    for (let i = 1; i <= 200; i += 1) {
      leggeri.colonna.append(turnoFinto({ nome: `g${i}`, nodi: 9, altezza: 100 }));
      leggeri.aggiornaFinestraReplay();
    }
    const attesiMontati = Math.floor(reali.peso / 10) + 1; // 91: 90 chiusi entro il budget + l'ultimo aperto
    assert.equal(montati(leggeri).length, attesiMontati, `con 200 giri leggeri a budget ${reali.peso} restano montati ${montati(leggeri).length} turni invece di ${attesiMontati}: la finestra sta crescendo con la CRONOLOGIA (il difetto BUG-24), non con il peso (D2)`);
    assert.equal(leggeri.turniFuoriFinestra.length, 200 - attesiMontati, 'montati + registro non tornano con i giri giocati: un turno è stato abbandonato o duplicato');
    assert.ok(leggeri.pesoFinestraReplay <= reali.peso, `peso chiusi montati ${leggeri.pesoFinestraReplay} > budget ${reali.peso}: il tetto a peso non tiene a costanti di produzione`);
    assert.equal(montati(leggeri)[montati(leggeri).length - 1].nome, 'g200', 'l\'ultimo giro giocato non è montato: la coda viva (D3) si è persa a costanti reali');
    assert.deepEqual(leggeri.turniFuoriFinestra.map((t) => t.nome)[0], 'g1', 'il registro non inizia dal giro più vecchio: il prepend (D4) monterebbe la storia in disordine');

    /* Giri PESANTI (peso 91) a costanti reali: il budget da solo non basta, il pavimento (8) tiene la
       finestra «viva» — e l'invariante d'uscita del ciclo resta: montati ≤ pavimento OPPURE peso ≤ budget. */
    const pesanti = bancoFinestra({ peso: reali.peso, pavimento: reali.pavimento, pagina: reali.pagina });
    for (let i = 1; i <= 30; i += 1) {
      pesanti.colonna.append(turnoFinto({ nome: `h${i}`, nodi: 90, altezza: 100 }));
      pesanti.aggiornaFinestraReplay();
      assert.ok(montati(pesanti).length >= Math.min(reali.pavimento, i), `dopo ${i} giri pesanti restano montati ${montati(pesanti).length} turni < min(pavimento ${reali.pavimento}, giocati ${i}): la finestra è scesa sotto il minimo a costanti di produzione (D2)`);
    }
    assert.equal(montati(pesanti).length + pesanti.turniFuoriFinestra.length, 30, 'montati + registro non tornano con i giri pesanti giocati');
    assert.equal(montati(pesanti)[montati(pesanti).length - 1].nome, 'h30', 'l\'ultimo giro pesante non è montato: la coda viva (D3) si è persa');
    assert.ok(pesanti.pesoFinestraReplay <= reali.peso || montati(pesanti).length <= reali.pavimento, `uscita dal ciclo di smontaggio senza invariante (peso ${pesanti.pesoFinestraReplay}, montati ${montati(pesanti).length}): né il budget né il pavimento hanno fermato il ciclo`);
    return reali;
  };
  controllo(APP);
  // AL CONTRARIO (mutante del dossier «togli il tetto», alla lettera D2: le costanti si allentano): il tetto che non c'è più non si vede più
  morde(controllo, guasta('Object.freeze({ peso: 900, pavimento: 8, pagina: 900 })', 'Object.freeze({ peso: 1000000, pavimento: 8, pagina: 900 })', 'costanti di produzione della finestra'));
});

/* Codex07/10: regressioni dell'audit. Gli attesi sono indipendenti dal codice;
   scheduler e DOM sono confini controllati, le funzioni eseguite sono quelle reali. */
test('B24-09 R1-GENERAZIONE-STANTIA: il frame vecchio non consuma storia nuova né disarma il frame nuovo', () => {
  const callbacks = [];
  let prepend = 0;
  const b = { window: { requestAnimationFrame: (cb) => { callbacks.push(cb); return callbacks.length; } },
    state: { realSession: { generation: 7, inRigiocata: false } },
    turniFuoriFinestra: [turnoFinto()], cimaInCoda: null, aggiungiPaginaPrecedenti: () => { prepend += 1; } };
  const cima = funzione('suCimaRaggiuntaSpina', b);
  cima();
  b.state.realSession.generation = 8;
  b.cimaInCoda = null; // il reset ha invalidato il frame7; il callback già catturato è ancora invocabile
  cima();
  callbacks[0]();
  assert.equal(prepend, 0, 'il callback della sessione7 ha letto/consumato il registro della8');
  assert.equal(b.cimaInCoda, 2, 'il callback vecchio ha disarmato la richiesta della sessione nuova');
  callbacks[1]();
  assert.equal(prepend, 1);
  assert.equal(b.cimaInCoda, null);
});

function bancoCambioSessione(b) {
  const niente = () => {};
  Object.assign(b, { AbortController, outputSessionController: new AbortController(),
    fermaFondoRipristino: b.fermaFondoRipristino ?? null,
    fermaRiarmoRuotaConversazione: b.fermaRiarmoRuotaConversazione ?? null,
    providerRetryUi: { reset: niente }, risultatiDelegaMostrati: new Set(), dialoghiAgenteMostrati: new Set(), ultimoEventoGrafoMadre: null,
    frameGrafoMadre: null, agentiInDiretta: new Map(), frameAgentiInDiretta: null, figliLettura: 0,
    figliErrore: null, figliAggiornati: null, contextCompactor: null, contextMonitor: null,
    contextChatSnapshot: null, richiestaCacheSessione: null,
    $: (selector) => selector === '#conversation' ? b.colonna : null,
  });
  b.colonna.classList = { remove: niente };
  b.colonna.replaceChildren = () => { b.colonna.children = []; };
  for (const nome of ['chiudiGrafoAgenti', 'chiudiLettoreFile', 'chiudiConversazioneFiglia',
    'aggiornaAvanzamentoContesto', 'nascondiAttesaRisposta', 'cancellaRenderMessaggiStreaming',
    'cancellaRenderAlberoDifferito', 'smontaStatoVuoto', 'aggiornaSpazioCodaConversazione',
    'programmaSchedeAgente', 'renderizzaBannerCoda', 'resettaSuperficiRealiDedicate',
    'disegnaFasciaPianoRichiesto', 'disegnaFasciaModoRitirato', 'programmaSchedaGithub',
    'nascondiAvvisoPiano', 'syncRunComposerState']) b[nome] = niente;
  return funzione('nuovaGenerazioneSessione', b);
}

test('B24-10 SESSIONE-VUOTA-RESET: cambio senza eventi elimina subito registro e bottone vecchi', () => {
  const b = bancoFinestra();
  for (let i = 1; i <= 6; i += 1) montaEvento(b, { nome: `g${i}`, nodi: 60 });
  assert.equal(b.turniFuoriFinestra.length, 3);
  const nuovaGenerazione = bancoCambioSessione(b);
  assert.equal(nuovaGenerazione(), 8);
  assert.equal(b.turniFuoriFinestra.length, 0, 'nessun evento arriverà nella sessione vuota: il registro deve essere già vuoto');
  assert.equal(b.pesoFinestraReplay, 0);
  assert.equal(b.ultimoTurnoVistoFinestra, null);
  assert.equal(b.registroFinestraGenerazione, 8);
  assert.equal(b.scorrevole.querySelector(':scope > .talos-mostra-precedenti'), null);
  b.aggiungiPaginaPrecedenti();
  assert.equal(b.colonna.children.length, 0, 'un gesto tardivo ha rimontato la chat precedente nella sessione vuota');
});

test('B24-11 ORDINE-TRE-PAGINE: ciascun prepend carica i predecessori contigui, cronologia vecchio→nuovo', () => {
  const b = bancoFinestra({ inRigiocata: false, pagina: 20 });
  montaEvento(b, { nome: 'vivo' });
  for (let i = 1; i <= 6; i += 1) b.turniFuoriFinestra.push(turnoFinto({ nome: `g${i}` }));
  b.aggiungiPaginaPrecedenti();
  assert.deepEqual(b.colonna.children.map((t) => t.nome), ['g5', 'g6', 'vivo']);
  b.aggiungiPaginaPrecedenti();
  assert.deepEqual(b.colonna.children.map((t) => t.nome), ['g3', 'g4', 'g5', 'g6', 'vivo']);
  b.aggiungiPaginaPrecedenti();
  assert.deepEqual(b.colonna.children.map((t) => t.nome), ['g1', 'g2', 'g3', 'g4', 'g5', 'g6', 'vivo']);
  assert.equal(b.turniFuoriFinestra.length, 0);
});

test('B24-12 DISCONNECT-SPINA: cleanup stacca entrambi gli IO e il MO, poi può essere ripetuto', () => {
  const conv = convSpinaFinta([turnoSpina('t0')]);
  const fin = finestraSpinaFinta(); conv.ownerDocument.defaultView = fin;
  const stacca = collegaNavigazioneSpina(conv, { suCimaRaggiunta() {} });
  stacca(); stacca();
  assert.ok(fin.__io.every((observer) => observer.staccato));
  assert.ok(fin.__mo.every((observer) => observer.staccato));
  assert.equal(conv.dataset.spinaCollegata, undefined);
});

test('B24-13 CALLBACK-DOPO-TEARDOWN: delivery già catturate non fanno backfill né cambiano tick o osservazioni', () => {
  let chiamateCima = 0; let cambiTick = 0;
  const turno = turnoSpina('t0');
  turno.querySelector = () => ({ querySelectorAll: () => [{ classList: { toggle: () => { cambiTick += 1; } } }] });
  const conv = convSpinaFinta([turno]); const fin = finestraSpinaFinta(); conv.ownerDocument.defaultView = fin;
  const stacca = collegaNavigazioneSpina(conv, { suCimaRaggiunta: () => { chiamateCima += 1; } });
  stacca();
  fin.__io[1].cb([{ target: turno, isIntersecting: true }]);
  fin.__io[0].cb([{ target: turno, isIntersecting: true }]);
  fin.__mo[0].cb([{ addedNodes: [turnoSpina('t1')], removedNodes: [] }]);
  assert.equal(chiamateCima, 0, 'delivery vecchia ha richiamato il backfill dopo cleanup');
  assert.equal(cambiTick, 0, 'delivery vecchia ha modificato tick dopo cleanup');
  assert.equal(fin.__io[0].bersagli.length, 0, 'delivery vecchia ha riagganciato observer scollegato');
});

test('B24-14 CLICK-TEARDOWN-SENZA-IO: cleanup e rebind non accumulano listener', () => {
  const conv = convSpinaFinta([]); conv.ownerDocument.defaultView = {};
  const stacca = collegaNavigazioneSpina(conv);
  assert.equal(conv.ascoltatori.get('click')?.size, 1);
  stacca();
  assert.equal(conv.ascoltatori.get('click')?.size, 0, 'cleanup senza IO ha lasciato il clic collegato');
  assert.equal(conv.dataset.spinaCollegata, undefined);
  const diNuovo = collegaNavigazioneSpina(conv);
  assert.equal(conv.ascoltatori.get('click')?.size, 1);
  diNuovo();
});

test('B24-15 TURNI-STACCATI-NON-OSSERVATI: il lotto di rimozione lascia il vecchio target senza riscan', () => {
  const vecchio = turnoSpina('vecchio'); const conv = convSpinaFinta([vecchio]);
  const fin = finestraSpinaFinta(); conv.ownerDocument.defaultView = fin;
  const stacca = collegaNavigazioneSpina(conv);
  conv.children = [];
  fin.__mo[0].cb([{ addedNodes: [], removedNodes: [vecchio] }]);
  assert.deepEqual(fin.__io[0].bersagli, [], 'turno staccato è rimasto un target osservato');
  assert.deepEqual(fin.__io[0].unosservati, [vecchio]);
  assert.equal(fin.__io[0].chiamate, 1, 'rimozione ha richiesto un riscan completo');
  stacca();
});

test('B24-16 RESUME-PRESERVA-REGISTRO: generazione nuova della stessa chat conserva storia e cancella frame vecchio', () => {
  const b = bancoFinestra();
  for (let i = 1; i <= 6; i += 1) montaEvento(b, { nome: `g${i}`, nodi: 60 });
  const nomi = b.turniFuoriFinestra.map((t) => t.nome); const annullati = [];
  b.cimaInCoda = 42; b.window.cancelAnimationFrame = (id) => annullati.push(id);
  const nuovaGenerazione = bancoCambioSessione(b);
  assert.equal(nuovaGenerazione({ continua: true }), 8);
  assert.deepEqual(b.turniFuoriFinestra.map((t) => t.nome), nomi);
  assert.equal(b.registroFinestraGenerazione, 8, 'resume ha lasciato ownership vecchia: il prossimo gate cancellerebbe la storia della stessa chat');
  assert.deepEqual(annullati, [42]);
  assert.equal(b.cimaInCoda, null);
});

/* R3: scrollTop viene limitato dal browser. La delivery dello scroll è separata
   dall'assegnazione e può arrivare dopo timer e variazioni del contenuto. */
function bancoCustodeRipristino({ tabindex = null, velata = false } = {}) {
  const listeners = new Map();
  const windowListeners = new Map(); const documentListeners = new Map(); // A1: rilascio del puntatore e tasti del trova
  const frames = new Map(); const timers = new Map(); const intervals = new Map();
  const mutation = []; const resize = [];
  let token = 0; let top = 0; let writes = 0; let now = 0;
  /* A1-R2 (07/10/2026): sotto il velo i gesti della persona non contano. Le prove dei gesti parlano di una chat VISIBILE, quindi il
     banco parte senza velo; chi prova il velo lo chiede (`velata: true`). */
  const classes = new Set(velata ? ['is-restoring'] : []);
  const colonna = { childElementCount: 0, lastElementChild: null,
    classList: { remove: (name) => classes.delete(name), contains: (name) => classes.has(name) } };
  const attributes = new Map(tabindex === null ? [] : [['tabindex', String(tabindex)]]);
  const scroller = { scrollHeight: 2000, clientHeight: 800, dataset: {}, nodeType: 1, tagName: 'DIV',
    hasAttribute: name => attributes.has(name), getAttribute: name => attributes.get(name) ?? null,
    setAttribute: (name, value) => attributes.set(name, String(value)),
    style: { setProperty() {} },
    get scrollTop() { return top; },
    set scrollTop(value) { writes += 1; top = Math.max(0, Math.min(value, this.scrollHeight - this.clientHeight)); },
    addEventListener(type, cb) { if (!listeners.has(type)) listeners.set(type, new Set()); listeners.get(type).add(cb); },
    removeEventListener(type, cb) { listeners.get(type)?.delete(cb); },
  };
  const b = {
    $: (selector) => selector === '#conversation' ? colonna : null,
    scrollerConversazione: () => scroller,
    assicuraCaricamentoCronologia() {},
    testiDelVelo: [], aggiornaTestoCaricamentoLungo(_conversazione, eventi) { b.testiDelVelo.push(eventi); }, // A1-R2
    uscite: [], uscitaVisibile: false, velaRipristinati: 0, // A1-R2: l'uscita offerta dopo 15 s di silenzio vero
    mostraUscitaDalVelo(_conversazione, alClic) { if (!b.uscitaVisibile) { b.uscitaVisibile = true; b.uscite.push(alClic); } },
    nascondiUscitaDalVelo() { b.uscitaVisibile = false; },
    ripristinaVelo() { b.uscitaVisibile = false; b.velaRipristinati += 1; },
    state: { realSession: { generation: 7, inRigiocata: true, sequenzeViste: new Set() } },
    streamingUserScrollHold: false, streamingAutoFollow: true, streamingLastTargetTop: null,
    streamingScrollFrame: null, streamingScrollTarget: null, fondoInVistaRicordato: null,
    spazioCodaConversazioneUltimo: 0, chiaveSpazioCodaUltimo: '', fermaFondoRipristino: null,
    fermaRiarmoRuotaConversazione: null,
    CONVERSATION_FOLLOW_EPSILON_PX: 2,
    calcolaSpazioCodaConversazione: () => 0, chiaveStrutturaleSpazioCoda: () => 'layout',
    aggiornaSpazioCodaConversazione() {}, aggiornaPiedeChatDaStato() {},
    runRealeAttivo: () => false,
    fondoConversazioneInVista: () => scroller.scrollHeight - scroller.clientHeight - top <= 40,
    pubblicaSegui: () => { scroller.dataset.segue = b.streamingAutoFollow ? 'si' : 'no'; },
    riarmaSeguiConversazione() {}, scrollStreamingOutput() {},
    /* A1 (07/10/2026): lo stato condiviso che distingue uno scroll di LAYOUT da uno della persona (`legacy/app.js`). */
    revisioneLayoutConversazione: 0, puntatoreSulloScorrevole: false, trovaNellaPaginaAperto: false,
    document: { addEventListener(type, cb) { if (!documentListeners.has(type)) documentListeners.set(type, new Set()); documentListeners.get(type).add(cb); } },
    performance: { now: () => now },
    window: {
      addEventListener(type, cb) { if (!windowListeners.has(type)) windowListeners.set(type, new Set()); windowListeners.get(type).add(cb); },
      getComputedStyle: (node) => node.css ?? { overflowY: 'visible', overscrollBehaviorY: 'auto' },
      requestAnimationFrame: (cb) => { const id = ++token; frames.set(id, cb); return id; },
      cancelAnimationFrame: (id) => frames.delete(id),
      setTimeout: (cb, delay) => { const id = ++token; timers.set(id, { cb, delay, at: now + delay }); return id; },
      clearTimeout: (id) => timers.delete(id),
      setInterval: (cb, delay) => { const id = ++token; intervals.set(id, { cb, delay, at: now + delay }); return id; },
      clearInterval: (id) => intervals.delete(id),
    },
    MutationObserver: class {
      constructor(cb) { this.cb = cb; this.disconnected = false; mutation.push(this); }
      observe() {} disconnect() { this.disconnected = true; }
    },
    ResizeObserver: class {
      constructor(cb) { this.cb = cb; this.disconnected = false; resize.push(this); }
      observe() {} disconnect() { this.disconnected = true; }
    },
  };
  // A1: la regola di layout è una funzione del monolite; prima della cura non esiste (il banco resta valido senza).
  if (/^  function scrollDiLayout\(/m.test(APP)) b.scrollDiLayout = funzione('scrollDiLayout', b);
  // Entrambi i listener REALI condividono lo stesso contesto di stato.
  funzione('collegaSeguiFondoConversazione', b)();
  const resizePrimaCustode = resize.length;
  funzione('mantieniFondoDuranteRipristino', b)(7);
  const frame = () => { const pending = [...frames.values()]; frames.clear(); for (const cb of pending) cb(); };
  const timeoutZero = () => { for (const [id, item] of [...timers]) if (item.delay === 0) { timers.delete(id); item.cb(); } };
  const emit = (type, event = {}) => {
    const nativeEvent = { target: scroller, composedPath: () => [scroller], ...event };
    for (const cb of [...(listeners.get(type) ?? [])]) cb(nativeEvent);
  };
  const emitWindow = (type, event = {}) => { for (const cb of [...(windowListeners.get(type) ?? [])]) cb({ target: null, ...event }); };
  const emitDocument = (type, event = {}) => { for (const cb of [...(documentListeners.get(type) ?? [])]) cb({ target: null, ...event }); };
  const advance = (ms) => {
    const end = now + ms;
    while (true) {
      const next = [...timers.entries()].map(([id, item]) => ({ id, item, repeat: false }))
        .concat([...intervals.entries()].map(([id, item]) => ({ id, item, repeat: true })))
        .filter(({ item }) => item.at <= end).sort((a, b) => a.item.at - b.item.at || a.id - b.id)[0];
      if (!next) break;
      now = next.item.at;
      if (next.repeat) next.item.at += next.item.delay;
      else timers.delete(next.id);
      next.item.cb();
    }
    now = end;
  };
  return { b, colonna, scroller, custode: mutation[0], get resize() { return resize.slice(resizePrimaCustode); }, get resizeGlobali() { return resize.slice(0, resizePrimaCustode); }, classes, frame, timeoutZero, emit,
    emitWindow, emitDocument, advance, frames, timers, intervals, listeners,
    get writes() { return writes; },
    humanScroll(value) { top = value; },
    resizeContent(height) { scroller.scrollHeight = height; top = Math.max(0, Math.min(top, height - scroller.clientHeight)); },
    requestBottom() { mutation[0].cb([]); },
  };
}

test('B24-17 SCROLL-PROPRIO-DOPO-CRESCITA: delivery tardiva non perde follow e custode senza input', () => {
  const h = bancoCustodeRipristino();
  h.requestBottom(); h.frame(); h.timeoutZero();
  assert.equal(h.scroller.scrollTop, 1200, 'il browser deve limitare la scrittura al massimo reale');
  h.scroller.scrollHeight += 700; // layout cresce prima della delivery già accodata
  h.emit('scroll');
  assert.equal(h.b.streamingAutoFollow, true, 'lo scroll proprio tardivo è stato scambiato per gesto umano dal listener globale');
  assert.equal(h.custode.disconnected, false, 'il custode si è staccato senza alcun input');
  h.requestBottom(); h.frame();
  assert.equal(h.scroller.scrollTop, 1900, 'il nuovo layout deve ri-ancorarsi al fondo');
});

test('B24-18 SCROLL-UTENTE-PREVALE: spostamento reale disconnette e callback catturato non riporta in fondo', () => {
  const h = bancoCustodeRipristino();
  h.requestBottom(); h.frame(); h.timeoutZero();
  h.requestBottom(); // frame già catturato prima del gesto
  h.humanScroll(1080); h.emit('scroll');
  assert.equal(h.custode.disconnected, true);
  const before = h.writes;
  h.frame();
  assert.equal(h.writes, before);
  assert.equal(h.scroller.scrollTop, 1080);
});

test('B24-19 WHEEL-MINIMO-PRIMA-DEL-FRAME: un pixel volontario impedisce la scrittura già accodata', () => {
  const h = bancoCustodeRipristino();
  h.requestBottom(); h.frame(); h.timeoutZero();
  h.requestBottom();
  h.emit('wheel', { deltaY: -1 }); // listener vero dichiara l'intenzione anche prima dello scroll
  assert.equal(h.b.streamingUserScrollHold, true);
  const before = h.writes;
  h.frame();
  assert.equal(h.writes, before, 'il frame del custode ha prevalso sulla rotella umana');
  assert.equal(h.custode.disconnected, true);
});

test('B24-20 GENERAZIONE-CUSTODE-STANTIA: frame vecchio non scrive sullo scroller della sessione nuova', () => {
  const h = bancoCustodeRipristino();
  h.requestBottom();
  h.b.state.realSession.generation = 8;
  const before = h.writes;
  h.frame();
  assert.equal(h.writes, before, 'callback vecchio ha scritto lo scroll della nuova generazione');
  assert.equal(h.custode.disconnected, true);
});

test('B24-21 VISIBILITA-NUOVA-GENERAZIONE: cleanup vecchio non scopre la chat nuova', () => {
  const h = bancoCustodeRipristino({ velata: true });
  h.requestBottom();
  h.b.state.realSession.generation = 8;
  h.frame();
  assert.equal(h.classes.has('is-restoring'), true, 'il vecchio owner ha liberato la visibilita della nuova generazione');
});

test('B24-22 TEARDOWN-RISORSE-PENDENTI: stop idempotente cancella frame timer intervallo propri', () => {
  const h = bancoCustodeRipristino();
  h.requestBottom();
  const stop = h.b.fermaFondoRipristino;
  stop(); stop();
  assert.equal(h.frames.size, 0, 'frame del custode rimasto in coda');
  assert.equal(h.timers.size, 0, 'timer del custode rimasti in coda');
  assert.equal(h.intervals.size, 0);
  assert.equal(h.custode.disconnected, true);
  assert.equal(h.b.fermaFondoRipristino, null);
});

test('B24-23 REPLAY-OLTRE-TRENTA-SECONDI: il tempo assoluto non termina il custode', () => {
  const h = bancoCustodeRipristino();
  h.requestBottom(); h.frame();
  h.advance(31000);
  assert.equal(h.custode.disconnected, false, 'custode scaduto mentre il replay e ancora attivo');
  h.scroller.scrollHeight += 700;
  h.requestBottom(); h.frame();
  assert.equal(h.scroller.scrollTop, 1900);
  h.b.fermaFondoRipristino();
});

test('B24-24 CRESCITA-TARDIVA-DOPO-REPLAY: il fondo segue il layout anche dopo45secondi', () => {
  const h = bancoCustodeRipristino();
  h.requestBottom(); h.frame();
  h.b.state.realSession.inRigiocata = false;
  h.advance(200); h.frame();
  assert.equal(h.resize.length, 1);
  h.advance(45000);
  assert.equal(h.resize[0].disconnected, false, 'RO scaduto senza input/cambio sessione/live');
  h.scroller.scrollHeight += 700;
  h.resize[0].cb([]); h.frame();
  assert.equal(h.scroller.scrollTop, 1900);
  h.b.fermaFondoRipristino();
});

test('B24-25 CAMBIO-GENERAZIONE-FERMA-SUBITO: resume libera custode prima di generation++', () => {
  const b = bancoFinestra();
  const nuovaGenerazione = bancoCambioSessione(b);
  const stoppedAt = [];
  b.fermaFondoRipristino = () => stoppedAt.push(b.state.realSession.generation);
  nuovaGenerazione({ continua: true });
  assert.deepEqual(stoppedAt, [7], 'il custode vecchio non e stato fermato prima di invalidare la generazione');
});

test('B24-26 TEARDOWN-DOPO-HANDOFF: RO frame finali e timer250 sono cancellati', () => {
  const h = bancoCustodeRipristino();
  h.requestBottom(); h.frame();
  h.b.state.realSession.inRigiocata = false;
  h.advance(200);
  assert.equal(h.resize.length, 1);
  assert.ok(h.frames.size > 0 && h.timers.size > 0, 'servono risorse davvero pendenti al teardown');
  h.b.fermaFondoRipristino();
  assert.equal(h.frames.size, 0);
  assert.equal(h.timers.size, 0);
  assert.equal(h.intervals.size, 0);
  assert.equal(h.resize[0].disconnected, true);
  const before = h.writes;
  h.resize[0].cb([]); h.advance(50000); h.frame();
  assert.equal(h.writes, before, 'callback RO gia catturato ha prodotto nuovo lavoro dopo stop');
});

test('B24-27 SAFETY-STANTIA: callback8s vecchio non rivela la nuova generazione', () => {
  const h = bancoCustodeRipristino({ velata: true });
  const pending = [...h.timers.entries()].find(([, item]) => item.delay === 8000);
  assert.ok(pending);
  const [handle, { cb: safety }] = pending;
  h.timers.delete(handle); // il timer consegnato e uscito dalla coda, come nel browser
  h.b.state.realSession.generation = 8;
  safety();
  assert.equal(h.classes.has('is-restoring'), true);
  assert.equal(h.custode.disconnected, true);
  assert.equal(h.frames.size, 0);
  assert.equal(h.timers.size, 0);
  assert.equal(h.intervals.size, 0);
});

test('B24-28 CTRL-WHEEL-ZOOM: lo zoom non disarma il follow ne accoda un riarmo', () => {
  const alto = bancoCustodeRipristino();
  alto.emit('wheel', { deltaY: -1, ctrlKey: true });
  assert.equal(alto.b.streamingUserScrollHold, false, 'Ctrl+wheel e zoom, non una richiesta di leggere piu in alto');
  assert.equal(alto.b.streamingAutoFollow, true);
  const basso = bancoCustodeRipristino();
  basso.b.streamingUserScrollHold = true;
  basso.emit('wheel', { deltaY: 1, ctrlKey: true });
  assert.equal(basso.frames.size, 0, 'lo zoom non deve riattaccare una lettura sospesa');
});

test('B24-29 WHEEL-GIA-ANNULLATO: un controllo che consuma la rotella non cambia intento chat', () => {
  const alto = bancoCustodeRipristino();
  alto.emit('wheel', { deltaY: -1, defaultPrevented: true });
  assert.equal(alto.b.streamingUserScrollHold, false);
  assert.equal(alto.b.streamingAutoFollow, true);
  const basso = bancoCustodeRipristino();
  basso.b.streamingUserScrollHold = true;
  basso.emit('wheel', { deltaY: 1, defaultPrevented: true });
  assert.equal(basso.frames.size, 0);
});

test('B24-30 RIARMO-GENERAZIONE-STANTIA: wheel-down vecchio non tocca cache o follow nuovo', () => {
  const h = bancoCustodeRipristino();
  h.requestBottom(); h.frame();
  let riarmi = 0; h.b.riarmaSeguiConversazione = () => { riarmi += 1; };
  h.b.streamingUserScrollHold = true;
  h.emit('wheel', { deltaY: 1 });
  assert.equal(h.frames.size, 1, 'serve un callback realmente accodato');
  h.b.state.realSession.generation = 8;
  h.b.fondoInVistaRicordato = 'nuova-sessione';
  h.frame();
  assert.equal(h.b.fondoInVistaRicordato, 'nuova-sessione', 'la cache della nuova chat e stata invalidata dal vecchio gesto');
  assert.equal(riarmi, 0);
});

test('B24-31 NUOVO-GESTO-PREVALE: wheel-up dopo down nello stesso frame impedisce il vecchio riarmo', () => {
  const h = bancoCustodeRipristino();
  h.requestBottom(); h.frame();
  let riarmi = 0; h.b.riarmaSeguiConversazione = () => { riarmi += 1; };
  h.b.streamingUserScrollHold = true;
  h.emit('wheel', { deltaY: 1 });
  h.emit('wheel', { deltaY: -1 });
  h.frame();
  assert.equal(riarmi, 0, 'il callback down ha prevalso sul gesto up successivo');
  assert.equal(h.b.streamingUserScrollHold, true);
  assert.equal(h.b.streamingAutoFollow, false);
});

test('B24-32 RIARMO-COALESCENTE: un burst di20gesti down mantiene un solo frame e riarmo', () => {
  const h = bancoCustodeRipristino();
  h.requestBottom(); h.frame();
  let riarmi = 0; h.b.riarmaSeguiConversazione = () => { riarmi += 1; };
  h.b.streamingUserScrollHold = true;
  for (let i = 0; i < 20; i += 1) h.emit('wheel', { deltaY: 1 });
  assert.equal(h.frames.size, 1, 'burst wheel accumula lavoro inutile prima del prossimo paint');
  h.frame();
  assert.equal(riarmi, 1);
});

test('B24-33 GESTO-UP-CANCELLA-RIARMO: il nuovo intento libera anche il frame pendente', () => {
  const h = bancoCustodeRipristino();
  h.requestBottom(); h.frame();
  h.b.streamingUserScrollHold = true;
  h.emit('wheel', { deltaY: 1 });
  assert.equal(h.frames.size, 1);
  h.emit('wheel', { deltaY: -1 });
  assert.equal(h.frames.size, 0, 'il frame cancellato dal nuovo intento e ancora nella coda');
  assert.equal(h.b.streamingUserScrollHold, true);
});

test('B24-34 CAMBIO-SESSIONE-CANCELLA-RIARMO: nuova chat e resume liberano il frame subito', () => {
  for (const continua of [true, false]) {
    const h = bancoCustodeRipristino();
    h.requestBottom(); h.frame(); h.timeoutZero();
    h.b.streamingUserScrollHold = true;
    h.emit('wheel', { deltaY: 1 });
    assert.equal(h.frames.size, 1);
    const captured = [...h.frames.values()][0];
    h.b.colonna = h.colonna;
    h.b.resettaFinestraReplay = () => {}; // finestra provata separatamente: qui conta il cleanup reale
    let riarmi = 0; h.b.riarmaSeguiConversazione = () => { riarmi += 1; };
    bancoCambioSessione(h.b)({ continua });
    assert.equal(h.frames.size, 0, `riarmo rimasto pendente al cambio continua=${continua}`);
    h.b.fondoInVistaRicordato = 'nuova-chat';
    captured();
    assert.equal(h.b.fondoInVistaRicordato, 'nuova-chat');
    assert.equal(riarmi, 0);
  }
});

test('B24-35 AZIONE-ESPLICITA-CANCELLA-RIARMO: l azione invalida anche una delivery catturata', () => {
  const h = bancoCustodeRipristino();
  h.requestBottom(); h.frame(); h.timeoutZero();
  h.b.streamingUserScrollHold = true;
  h.emit('wheel', { deltaY: 1 });
  const captured = [...h.frames.values()][0];
  funzione('riarmaSeguiConversazione', h.b)();
  assert.equal(h.frames.size, 0, 'il riarmo esplicito non libera il lavoro differito');
  h.b.fondoInVistaRicordato = 'azione-esplicita';
  captured();
  assert.equal(h.b.fondoInVistaRicordato, 'azione-esplicita');
  assert.equal(h.b.streamingUserScrollHold, false);
  assert.equal(h.b.streamingAutoFollow, true);
});

function pannelloRuota({ top = 20, max = 100, overflowY = 'auto', overscrollBehaviorY = 'auto' } = {}) {
  return { nodeType: 1, scrollTop: top, scrollHeight: max + 100, clientHeight: 100,
    css: { overflowY, overscrollBehaviorY } };
}

test('B24-36 WHEEL-NESTED-CONSUMATO: pannello con spazio nella direzione possiede la rotella', () => {
  for (const deltaY of [-1, 1]) {
    const h = bancoCustodeRipristino();
    h.b.streamingUserScrollHold = deltaY > 0;
    const panel = pannelloRuota();
    h.emit('wheel', { deltaY, composedPath: () => [panel, h.scroller] });
    assert.equal(h.b.streamingUserScrollHold, deltaY > 0, 'la chat ha interpretato input del pannello');
    assert.equal(h.b.streamingAutoFollow, true);
    assert.equal(h.frames.size, 0);
  }
});

test('B24-37 WHEEL-NESTED-CONTENUTO: contain none e hidden senza overflow fermano la catena', () => {
  for (const overscrollBehaviorY of ['contain', 'none']) {
    for (const deltaY of [-1, 1]) {
      for (const overflowY of ['auto', 'hidden']) {
        const h = bancoCustodeRipristino();
        h.b.streamingUserScrollHold = deltaY > 0;
        const panel = pannelloRuota({ top: deltaY < 0 ? 0 : 100,
          max: overflowY === 'hidden' ? 0 : 100, overflowY, overscrollBehaviorY });
        h.emit('wheel', { deltaY, composedPath: () => [panel, h.scroller] });
        assert.equal(h.b.streamingUserScrollHold, deltaY > 0);
        assert.equal(h.frames.size, 0, `catena contenuta ${overflowY}/${overscrollBehaviorY}`);
      }
    }
  }
});

test('B24-38 WHEEL-NESTED-CHAIN: auto al bordo propaga ma un altro antenato consumatore no', () => {
  for (const deltaY of [-1, 1]) {
    const h = bancoCustodeRipristino();
    h.b.streamingUserScrollHold = deltaY > 0;
    const edge = pannelloRuota({ top: deltaY < 0 ? 0 : 100 });
    h.emit('wheel', { deltaY, composedPath: () => [edge, h.scroller] });
    if (deltaY < 0) assert.equal(h.b.streamingUserScrollHold, true);
    else assert.equal(h.frames.size, 1, 'il bordo auto deve consentire riarmo umano della chat');
    const other = bancoCustodeRipristino();
    other.b.streamingUserScrollHold = deltaY > 0;
    other.emit('wheel', { deltaY, composedPath: () => [edge, pannelloRuota(), other.scroller] });
    assert.equal(other.b.streamingUserScrollHold, deltaY > 0);
    assert.equal(other.frames.size, 0);
  }
});

test('B24-39 WHEEL-NON-SCROLLER: visible clip e shadow path non bloccano l intento della chat', () => {
  for (const overflowY of ['visible', 'clip']) {
    const h = bancoCustodeRipristino();
    const node = pannelloRuota({ overflowY, overscrollBehaviorY: 'contain' });
    h.emit('wheel', { deltaY: -1, composedPath: () => [node, { nodeType: 11 }, h.scroller] });
    assert.equal(h.b.streamingUserScrollHold, true);
    assert.equal(h.b.streamingAutoFollow, false);
  }
});

/* R3-E: esercita i veri chiamanti delle bolle, il confine eventi, dedup e generation.
 * Factory/render/strumenti estranei sono stub espliciti; nessun comando viene eseguito.
 * Il writer e misurato al confine di chiamata: non e un secondo renderer DOM. */
function bancoBolleRigiocate({ restoring = false, differito = false } = {}) {
  const counts = { published: 0, cancelled: 0, stopped: 0, writer: 0 };
  const bubbles = [], chips = [], actions = [];
  const conversation = { classList: { contains: c => c === 'is-restoring' && restoring },
    querySelectorAll: () => [] };
  const b = {
    state: { model: 'modello-fixture', realSession: { generation: 7, inRigiocata: true,
      deferHistoricalRendering: differito, bollaDaMostrare: null, taskBubbleMostrata: false,
      sequenzeViste: new Set(), redirectInvalidatedIds: new Set(), eventiAttrezzi: [],
      usage: null, usageEsecuzioniPrecedenti: null, chiusaDalServer: true,
      followUpBubbleInAttesa: false } },
    streamingAutoFollow: false, streamingUserScrollHold: true, streamingLastTargetTop: 731,
    $: selector => selector === '#conversation' ? conversation : null,
    creaMessaggioUtente: data => ({ data, dataset: {}, isConnected: true, querySelector: () => null }),
    nellaChat: article => { bubbles.push(article); return article; },
    disegnaChipAllegati: (article, allegati) => chips.push({ article, allegati }),
    collegaAzioniMessaggioUtente: (article, data) => actions.push({ article, data }),
    markMotionEnter() {}, oraMessaggio: () => '12:34', tr: key => key,
    nomeLeggibileSessione: id => id, etichettaPermessiGiro: () => '',
    pubblicaSegui: () => { counts.published += 1; },
    fermaRiarmoRuotaConversazione: () => { counts.cancelled += 1; },
    fermaFondoRipristino: () => { counts.stopped += 1; },
    scrollStreamingOutput: () => { counts.writer += 1; },
    eventoPerLoSchermo: event => event, providerRetryUi: { evento() {} },
    runRealeAttivo: () => false, interpretaEventoCompattazione: () => null,
    aggiornaAvvisoSogliaContesto() {}, accendiRagionamentiApertiDopoLaStoria() {},
    disegnaTestiRimastiNellaStoria: () => { counts.testiRimasti = (counts.testiRimasti ?? 0) + 1; }, // TESTO-PERSO: il testo rimasto indietro, al confine
    aggiornaRiassuntoSegmento() {}, disegnaFasciaPianoRichiesto() {},
    aggiornaInspectorDaStato: () => { counts.inspector = (counts.inspector ?? 0) + 1; }, // B1: la colonna si disegna al confine
    aggiornaTestataSessione: () => { counts.testata = (counts.testata ?? 0) + 1; }, // A1-bis 5: il conteggio della Review torna al confine
    aggiornaPiedeChatDaStato: () => { counts.piede = (counts.piede ?? 0) + 1; }, // A1-bis 5: e il chip «Giri»
    reviewDaDisegnareDopoLaStoria: null, renderRealReviewList() {}, renderReviewFile() {}, aggiornaSommarioReviewReale() {}, // B1: la Review rinviata al confine
    statoFasciaPianoRichiesto: () => ({}),
    grafoAgenti: null, frameGrafoMadre: null, ultimoEventoGrafoMadre: null,
    caricaCacheSessioneDalRegistro() {}, EVENTI_DELLE_SCHEDE_AGENTE: new Set(),
    segnalaRigaSessioneViva() {}, chiudiAttrezziInterrotti: () => 0,
    chiudiBatchTool() {}, chiudiSegmentoAttivo() {}, contextMonitor: null,
    sommaUsage: () => ({}), aggiornaUsageSessione() {},
    giroPianoProposto: false, legacyPlanCard: null, svuotaSuggerimentoComposer() {},
    syncRunComposerState() {}, segnaTappaLatenza() {}, mostraRisultatoDelega: () => false, mostraDialogoAgente: () => false, eDialogoAgente: () => false,
    segnaGiroNellaSpine() {}, mostraAttesaRisposta() {}, nascondiAttesaRisposta() {},
    programmaRenderAlberoReale() {}, programmaAggiornamentoElencoSessioniReali() {},
  };
  for (const name of ['riarmaSeguiConversazione', 'scorriAllaBollaAppesa',
    'appendRealTaskStart', 'appendUserFollowUp', 'appendComandoDiretto', 'handleRealEvent']) {
    b[name] = funzione(name, b);
  }
  return { b, counts, bubbles, chips, actions };
}

function assertLetturaPreservata(h) {
  assert.equal(h.b.streamingUserScrollHold, true, 'una bolla storica ha tolto la sospensione umana');
  assert.equal(h.b.streamingAutoFollow, false);
  assert.equal(h.b.streamingLastTargetTop, 731);
  assert.deepEqual(h.counts, { published: 0, cancelled: 0, stopped: 0, writer: 0 });
}

test('B24-40 TASK-STORICO-NON-RIARMA: testo e allegati restano senza alterare lettura o custode', () => {
  for (const restoring of [true, false]) {
    const h = bancoBolleRigiocate({ restoring });
    const allegati = [{ nome: 'storico.png', tipo: 'immagine' }];
    h.b.appendRealTaskStart({ consegna: 'Domanda storica', immagini: allegati }, null, 18, { rigiocata: true });
    assertLetturaPreservata(h);
    assert.equal(h.bubbles.length, 1);
    assert.equal(h.bubbles[0].data.testo, 'Domanda storica');
    assert.equal(h.chips[0].allegati, allegati);
    assert.equal(h.actions[0].data.riferimento, 'giro:18');
    assert.equal(h.b.state.realSession.taskBubbleMostrata, true);
  }
});

test('B24-41 FOLLOWUP-STORICO-NON-RIARMA: conserva domanda chip e riferimento senza riarmo', () => {
  const h = bancoBolleRigiocate();
  const allegati = [{ nome: 'archivio.pdf', tipo: 'documento' }];
  h.b.appendUserFollowUp('Seguito storico', null, allegati, 19, { rigiocata: true });
  assertLetturaPreservata(h);
  assert.equal(h.bubbles[0].data.testo, 'Seguito storico');
  assert.equal(h.b.state.realSession.ultimaDomanda, 'Seguito storico');
  assert.equal(h.chips[0].allegati, allegati);
  assert.equal(h.actions[0].data.riferimento, 'giro:19');
});

test('B24-42 COMANDO-STORICO-NON-RIARMA: disegna la bolla senza eseguire o riarmare', () => {
  const h = bancoBolleRigiocate();
  const article = h.b.appendComandoDiretto('pwd', null, { rigiocata: true });
  assertLetturaPreservata(h);
  assert.equal(article, h.bubbles[0]);
  assert.equal(article.data.testo, 'pwd');
  assert.equal(h.b.state.realSession.ultimaDomanda, 'pwd');
});

test('B24-43 INVIO-REALE-DURANTE-REPLAY: tre chiamanti ottimisti conservano il riarmo', () => {
  for (const name of ['appendRealTaskStart', 'appendUserFollowUp', 'appendComandoDiretto']) {
    for (const restoring of [true, false]) {
      const h = bancoBolleRigiocate({ restoring });
      h.b[name](name === 'appendRealTaskStart' ? { consegna: 'Nuovo invio' } : 'Nuovo invio');
      assert.equal(h.b.streamingUserScrollHold, false, name);
      assert.equal(h.b.streamingAutoFollow, true);
      assert.equal(h.b.streamingLastTargetTop, null);
      assert.equal(h.counts.published, 1);
      assert.equal(h.counts.cancelled, 1);
      assert.equal(h.counts.stopped, 0, 'il custode del replay rimane nel contratto esistente');
      assert.equal(h.counts.writer, restoring ? 0 : 1);
      assert.equal(h.bubbles.length, 1);
    }
  }
});

test('B24-44 EVENTI-STORICI-PROPAGANO-PROVENIENZA: cinque percorsi reali non riarmano', () => {
  const events = [
    { type: 'RunStarted', input: { consegna: 'Inizio' } },
    { type: 'RunStarted', input: { consegna: 'Seguito', seguito: true, immagini: [] } },
    { type: 'ComandoUtenteIniziato', comando: 'pwd' },
    { type: 'QueuedMessageDelivered', testo: 'Accodato', immagini: [] },
    { type: 'RunRedirectApplied', testo: 'Correzione', immagini: [], redirectId: 'r1' },
  ];
  for (const differito of [true, false]) {
    for (const [i, event] of events.entries()) {
      const h = bancoBolleRigiocate({ differito });
      h.b.state.realSession.taskBubbleMostrata = i === 1;
      h.b.handleRealEvent({ ...event, _sequenza: 21 }, 7);
      assertLetturaPreservata(h);
      assert.equal(h.bubbles.length, 1, `${event.type}/${i} deve realmente disegnare la bolla`);
      assert.ok(h.b.state.realSession.sequenzeViste.has(21));
    }
  }
});

test('B24-45 CONFINE-REPLAY-RIPRISTINA-DIRETTA: marker vero dedup e generazione mantengono contratti', () => {
  const h = bancoBolleRigiocate({ differito: true });
  const event = { type: 'QueuedMessageDelivered', testo: 'Passato', immagini: [], _sequenza: 22 };
  h.b.handleRealEvent(event, 7);
  assertLetturaPreservata(h);
  assert.equal(h.bubbles.length, 1);
  h.b.handleRealEvent(event, 7);
  h.b.handleRealEvent({ ...event, _sequenza: 23 }, 6);
  assert.equal(h.bubbles.length, 1, 'duplicato o generation vecchia ha ridisegnato');
  h.b.handleRealEvent({ type: 'CUSTOM', name: 'talos.fine-rigiocata' }, 7);
  assert.equal(h.b.state.realSession.inRigiocata, false);
  assert.equal(h.b.state.realSession.deferHistoricalRendering, false);
  assert.equal(h.counts.inspector, 1, 'B1: al confine della storia la colonna rimasta sporca si disegna, una volta');
  assert.equal(h.counts.testata, 1, 'A1-bis 5: al confine la testata ridisegna il conteggio della Review, una volta');
  assert.equal(h.counts.piede, 1, 'A1-bis 5: e il piede il chip «Giri»');
  h.b.handleRealEvent({ ...event, testo: 'Ora vivo', _sequenza: 24 }, 7);
  assert.equal(h.bubbles.length, 2);
  assert.equal(h.bubbles[1].data.testo, 'Ora vivo');
  assert.equal(h.b.streamingAutoFollow, true);
  assert.equal(h.b.streamingUserScrollHold, false);
  assert.equal(h.counts.published, 1);
  assert.equal(h.counts.stopped, 1);
  assert.equal(h.counts.writer, 1);
});

test('B24-46 RUNSTARTED-STORICO-CONSERVA-CUSTODE: provenienza non dipende dal rendering differito', () => {
  const h = bancoBolleRigiocate({ differito: false });
  h.b.handleRealEvent({ type: 'RunStarted', _sequenza: 30 }, 7);
  assert.equal(h.counts.stopped, 0, 'RunStarted storico visibile ha spento il custode');
  assert.equal(h.bubbles.length, 0, 'test del custode indipendente dalle bolle');
  h.b.handleRealEvent({ type: 'CUSTOM', name: 'talos.fine-rigiocata' }, 7);
  h.b.state.realSession.deferHistoricalRendering = true; // fixture distingue provenienza e rendering
  h.b.handleRealEvent({ type: 'RunStarted', _sequenza: 31 }, 7);
  assert.equal(h.counts.stopped, 1, 'RunStarted vivo deve cedere al single-writer vivo');
});

function riarmoRealeContatore(h) {
  const real = funzione('riarmaSeguiConversazione', h.b);
  let count = 0;
  h.b.riarmaSeguiConversazione = (options) => { count += 1; real(options); };
  return () => count;
}

function controlloTasto({ tagName = 'DIV', role = null, editable = false, href = false, ...geometry } = {}) {
  return { ...pannelloRuota({ overflowY: 'visible', ...geometry }), tagName, isContentEditable: editable,
    getAttribute: name => name === 'role' ? role : null,
    hasAttribute: name => name === 'href' && href };
}

test('B24-47 RIARMO-DOWN-OLTRE-PRIMO-FRAME: il movimento tardivo nativo al fondo riarma', () => {
  const h = bancoCustodeRipristino(); h.b.fermaFondoRipristino();
  const riarmi = riarmoRealeContatore(h);
  h.humanScroll(800); h.b.streamingUserScrollHold = true; h.b.streamingAutoFollow = false;
  h.emit('wheel', { deltaY: 1 }); h.frame();
  assert.equal(riarmi(), 0);
  assert.equal(h.frames.size, 0, 'nessun polling per aspettare lo scroll');
  const writes = h.writes;
  h.humanScroll(1200); h.emit('scroll');
  assert.equal(riarmi(), 1, 'il down oltre il primo frame e rimasto sospeso');
  assert.equal(h.b.streamingUserScrollHold, false);
  assert.equal(h.b.streamingAutoFollow, true);
  assert.equal(h.writes, writes, 'il listener deve lasciare lo scroll nativo');
});

test('B24-48 SCROLLEND-CHIUDE-INTENTO: niente riarmo da layout dopo fine gesto o nested', () => {
  const h = bancoCustodeRipristino(); h.b.fermaFondoRipristino();
  const riarmi = riarmoRealeContatore(h);
  h.humanScroll(800); h.b.streamingUserScrollHold = true;
  h.emit('wheel', { deltaY: 1 });
  const captured = [...h.frames.values()][0];
  h.emit('scrollend', { target: pannelloRuota() });
  assert.equal(h.frames.size, 1, 'scrollend nested non possiede il gesto root');
  h.humanScroll(900); h.emit('scroll'); h.emit('scrollend');
  assert.equal(h.frames.size, 0, 'fine gesto non cancella il frame');
  h.humanScroll(1200); h.emit('scroll'); captured();
  assert.equal(riarmi(), 0, 'un layout successivo ha riarmato con un intento scaduto');
  assert.equal(h.b.streamingUserScrollHold, true);
});

test('B24-49 RIARMO-TARDIVO-CANCELLAZIONE: up generation e azione esplicita invalidano il pending', () => {
  for (const cancel of ['up', 'generation', 'explicit']) {
    const h = bancoCustodeRipristino(); h.b.fermaFondoRipristino();
    const riarmi = riarmoRealeContatore(h);
    h.humanScroll(800); h.b.streamingUserScrollHold = true; h.b.streamingAutoFollow = false;
    h.emit('wheel', { deltaY: 1 }); h.frame();
    if (cancel === 'up') h.emit('wheel', { deltaY: -1 });
    if (cancel === 'generation') { h.b.state.realSession.generation += 1; h.b.fermaRiarmoRuotaConversazione(); }
    if (cancel === 'explicit') h.b.riarmaSeguiConversazione();
    const before = riarmi();
    h.humanScroll(1200); h.emit('scroll');
    assert.equal(riarmi(), before, cancel);
    assert.equal(h.b.streamingUserScrollHold, cancel !== 'explicit');
  }
});

test('B24-50 TASTI-UP-PRIORITA: navigazione verso alto disarma anche al bordo prima del layout', () => {
  for (const event of [{ key: 'ArrowUp' }, { key: 'PageUp' }, { key: 'Home' }, { key: ' ', shiftKey: true }]) {
    const h = bancoCustodeRipristino();
    h.requestBottom();
    h.emit('keydown', { ...event, preventDefault: () => assert.fail('non impedire il tasto nativo') });
    assert.equal(h.b.streamingUserScrollHold, true, event.key);
    assert.equal(h.b.streamingAutoFollow, false);
    h.frame();
    assert.equal(h.writes, 0, 'custode pendente ha prevalso sul tasto umano');
  }
});

test('B24-51 TASTI-DOWN-NATIVI: riarmo solo al fondo reale anche dopo il primo frame', () => {
  for (const key of ['ArrowDown', 'PageDown', 'End', ' ']) {
    const h = bancoCustodeRipristino(); h.b.fermaFondoRipristino();
    const riarmi = riarmoRealeContatore(h);
    h.humanScroll(800); h.b.streamingUserScrollHold = true; h.b.streamingAutoFollow = false;
    h.emit('keydown', { key, preventDefault: () => assert.fail('non impedire il tasto nativo') });
    assert.equal(riarmi(), 0);
    h.frame();
    assert.equal(riarmi(), 0);
    h.humanScroll(1200); h.emit('scroll');
    assert.equal(riarmi(), 1, key);
    assert.equal(h.b.streamingUserScrollHold, false);
    assert.equal(h.writes, 0);
  }
});

test('B24-52 TASTI-PROTETTI: editor widget e attivazione Space non diventano intento chat', () => {
  const controls = [
    ...['INPUT', 'TEXTAREA', 'SELECT'].map(tagName => ({ tagName })), { editable: true },
    ...['slider','spinbutton','listbox','option','menu','menubar','menuitem','tree','treeitem',
      'grid','gridcell','combobox','textbox','tab','tablist','radio','radiogroup','scrollbar','separator']
      .map(role => ({ role })),
  ];
  for (const props of controls) {
    const h = bancoCustodeRipristino(); h.b.fermaFondoRipristino();
    h.b.streamingUserScrollHold = true; h.humanScroll(800); h.emit('wheel', { deltaY: 1 });
    const node = controlloTasto(props);
    h.emit('keydown', { key: 'Home', composedPath: () => [node, h.scroller] });
    assert.equal(h.frames.size, 1, 'un controllo ha cancellato intento chat precedente');
    assert.equal(h.b.streamingAutoFollow, true);
  }
  for (const props of [{ tagName: 'BUTTON' }, { tagName: 'SUMMARY' }, { tagName: 'A', href: true },
    { role: 'button' }, { role: 'checkbox' }, { role: 'switch' }]) {
    const h = bancoCustodeRipristino(); h.b.streamingUserScrollHold = true;
    const node = controlloTasto(props);
    h.emit('keydown', { key: ' ', shiftKey: true, composedPath: () => [node, h.scroller] });
    assert.equal(h.b.streamingAutoFollow, true, 'Space di attivazione ha disarmato chat');
    assert.equal(h.frames.size, 0);
  }
  const ancestor = bancoCustodeRipristino();
  ancestor.emit('keydown', { key: 'PageUp', composedPath: () => [controlloTasto(), controlloTasto({ editable: true }), ancestor.scroller] });
  assert.equal(ancestor.b.streamingUserScrollHold, false);
});

test('B24-53 TASTI-MODIFICATI: modificatori IME eventi annullati e tasti nonscroll sono inerti', () => {
  for (const event of [{ key: 'PageUp', ctrlKey: true }, { key: 'Home', altKey: true },
    { key: 'ArrowUp', metaKey: true }, { key: 'End', shiftKey: true }, { key: 'PageUp', isComposing: true },
    { key: 'PageUp', keyCode: 229 }, { key: 'Home', defaultPrevented: true }, { key: 'Tab' }, { key: 'Enter' }, { key: 'a' }]) {
    const h = bancoCustodeRipristino(); h.b.fermaFondoRipristino();
    h.humanScroll(800); h.b.streamingUserScrollHold = true; h.emit('wheel', { deltaY: 1 });
    h.emit('keydown', event);
    assert.equal(h.b.streamingAutoFollow, true);
    assert.equal(h.frames.size, 1);
  }
});

test('B24-54 TASTI-NESTED-OWNERSHIP: consumatore e bordo contenuto restano al pannello', () => {
  for (const key of ['PageUp', 'PageDown']) {
    for (const props of [{ top: 50 }, { top: key === 'PageUp' ? 0 : 100, overscrollBehaviorY: 'contain' },
      { top: key === 'PageUp' ? 0 : 100, overscrollBehaviorY: 'none' }]) {
      const h = bancoCustodeRipristino();
      const node = controlloTasto({ overflowY: 'auto', ...props });
      h.emit('keydown', { key, composedPath: () => [node, h.scroller] });
      assert.equal(h.b.streamingUserScrollHold, false);
      assert.equal(h.b.streamingAutoFollow, true);
    }
  }
  for (const props of [{ top: 0 }, { overflowY: 'visible', overscrollBehaviorY: 'contain' },
    { overflowY: 'clip', overscrollBehaviorY: 'none' }]) {
    const h = bancoCustodeRipristino();
    h.emit('keydown', { key: 'PageUp', composedPath: () => [controlloTasto({ overflowY: 'auto', ...props }), h.scroller] });
    assert.equal(h.b.streamingUserScrollHold, true, 'bordo auto/visible/clip deve propagare');
  }
});

test('B24-55 FOCUS-IDEMPOTENTE: radice tabbabile se assente mantiene -1 e non duplica listener', () => {
  for (const tabindex of [null, -1, 0]) {
    const h = bancoCustodeRipristino({ tabindex });
    assert.equal(h.scroller.getAttribute('tabindex'), tabindex === null ? '0' : String(tabindex));
    funzione('collegaSeguiFondoConversazione', h.b)();
    assert.equal(h.listeners.get('keydown')?.size, 1);
    assert.equal(h.listeners.get('scrollend')?.size, 1);
  }
});

function toccoFinto(clientY, clientX = 100, identifier = 1) {
  return { identifier, clientX, clientY };
}

test('B24-56 TOUCH-UP-PRIMA-DEL-FRAME: un pixel verticale disarma prima del custode', () => {
  const h = bancoCustodeRipristino(); h.requestBottom();
  h.emit('touchstart', { touches: [toccoFinto(500)] });
  h.emit('touchmove', { touches: [toccoFinto(501)], preventDefault: () => assert.fail('pan nativo') });
  assert.equal(h.b.streamingUserScrollHold, true);
  assert.equal(h.b.streamingAutoFollow, false);
  h.frame(); assert.equal(h.writes, 0, 'custode prevale sul dito');
});

test('B24-57 TOUCH-DOWN-INERZIA: riarmo oltre frame e rilascio solo al fondo reale', () => {
  const h = bancoCustodeRipristino(); h.b.fermaFondoRipristino();
  const riarmi = riarmoRealeContatore(h);
  h.humanScroll(800); h.b.streamingUserScrollHold = true; h.b.streamingAutoFollow = false;
  h.emit('touchstart', { touches: [toccoFinto(500)] });
  h.emit('touchmove', { touches: [toccoFinto(499)] }); h.frame();
  assert.equal(riarmi(), 0);
  h.emit('touchend', { touches: [], changedTouches: [toccoFinto(499)] });
  const writes = h.writes; h.humanScroll(1200); h.emit('scroll');
  assert.equal(riarmi(), 1); assert.equal(h.writes, writes);
  assert.equal(h.b.streamingAutoFollow, true);
});

test('B24-58 TOUCH-INVERSIONE-DOPO-RIARMO: medesimo dito puo risalire dopo il fondo', () => {
  const h = bancoCustodeRipristino(); h.b.fermaFondoRipristino();
  const riarmi = riarmoRealeContatore(h);
  h.humanScroll(800); h.b.streamingUserScrollHold = true; h.b.streamingAutoFollow = false;
  h.emit('touchstart', { touches: [toccoFinto(500)] });
  h.emit('touchmove', { touches: [toccoFinto(490)] });
  h.humanScroll(1200); h.emit('scroll'); assert.equal(riarmi(), 1);
  h.emit('touchmove', { touches: [toccoFinto(491)] });
  assert.equal(h.b.streamingUserScrollHold, true); assert.equal(h.b.streamingAutoFollow, false);
});

test('B24-59 TOUCH-NESTED-OWNERSHIP: consumatori e contain protetti, bordo auto propaga', () => {
  for (const props of [{ top: 20 }, { top: 0, overscrollBehaviorY: 'contain' }, { top: 0 }]) {
    const h = bancoCustodeRipristino(); const node = controlloTasto({ overflowY: 'auto', ...props });
    const composedPath = () => [node, h.scroller];
    h.emit('touchstart', { touches: [toccoFinto(500)], composedPath });
    h.emit('touchmove', { touches: [toccoFinto(501)], composedPath });
    assert.equal(h.b.streamingUserScrollHold, props.top === 0 && !props.overscrollBehaviorY);
  }
});

test('B24-60 TOUCH-TAP-ORIZZONTALE-PINCH: nessun intento di lettura inventato', () => {
  for (const gesture of ['tap', 'horizontal', 'pinch', 'prevented']) {
    const h = bancoCustodeRipristino();
    h.emit('touchstart', { touches: [toccoFinto(500)] });
    if (gesture === 'horizontal') h.emit('touchmove', { touches: [toccoFinto(500, 110)] });
    if (gesture === 'pinch') {
      h.emit('touchmove', { touches: [toccoFinto(501), toccoFinto(499, 120, 2)] });
      h.emit('touchmove', { touches: [toccoFinto(502)] });
    }
    if (gesture === 'prevented') h.emit('touchmove', { touches: [toccoFinto(501)], defaultPrevented: true });
    h.emit('touchend', { touches: [], changedTouches: [toccoFinto(500)] });
    assert.equal(h.b.streamingUserScrollHold, false, gesture);
    assert.equal(h.b.streamingAutoFollow, true, gesture);
  }
});

test('B24-61 TOUCH-CANCEL-END: annullamento libera pending, altri identifier non chiudono', () => {
  const h = bancoCustodeRipristino(); h.b.fermaFondoRipristino();
  const riarmi = riarmoRealeContatore(h);
  h.humanScroll(800); h.b.streamingUserScrollHold = true;
  h.emit('touchstart', { touches: [toccoFinto(500)] });
  h.emit('touchmove', { touches: [toccoFinto(499)] });
  assert.equal(h.frames.size, 1);
  h.emit('touchcancel', { touches: [], changedTouches: [toccoFinto(499)] });
  assert.equal(h.frames.size, 0);
  h.humanScroll(1200); h.emit('scroll'); assert.equal(riarmi(), 0);
  const second = bancoCustodeRipristino();
  second.emit('touchstart', { touches: [toccoFinto(500)] });
  second.emit('touchend', { touches: [toccoFinto(500)], changedTouches: [toccoFinto(600, 100, 2)] });
  second.emit('touchmove', { touches: [toccoFinto(501)] });
  assert.equal(second.b.streamingUserScrollHold, true);
});

test('B24-62 TOUCH-GENERAZIONE-AZIONE: tocco vecchio non disarma nuova proprieta', () => {
  for (const cancel of ['generation', 'explicit']) {
    const h = bancoCustodeRipristino(); h.b.fermaFondoRipristino(); riarmoRealeContatore(h);
    h.emit('touchstart', { touches: [toccoFinto(500)] });
    if (cancel === 'generation') { h.b.state.realSession.generation += 1; h.b.fermaRiarmoRuotaConversazione(); }
    else h.b.riarmaSeguiConversazione();
    h.emit('touchmove', { touches: [toccoFinto(501)] });
    assert.equal(h.b.streamingUserScrollHold, false, cancel);
    assert.equal(h.b.streamingAutoFollow, true, cancel);
  }
});

test('B24-63 TOUCH-ACTION-WIDGET: nessun pan chat da superficie che lo vieta', () => {
  for (const kind of ['none', 'pan-x', 'slider', 'range']) {
    const h = bancoCustodeRipristino();
    const node = controlloTasto({ tagName: kind === 'range' ? 'INPUT' : 'DIV', role: kind === 'slider' ? 'slider' : null });
    if (kind === 'none' || kind === 'pan-x') node.css.touchAction = kind;
    if (kind === 'range') node.getAttribute = name => name === 'type' ? 'range' : null;
    const composedPath = () => [node, h.scroller];
    h.emit('touchstart', { touches: [toccoFinto(500)], composedPath });
    h.emit('touchmove', { touches: [toccoFinto(501)], composedPath });
    assert.equal(h.b.streamingUserScrollHold, false, kind);
  }
});

test('B24-64 RELOAD-FONDO-NON-DETERMINISTICO: clamp da layout seguito da crescita non e input umano', () => {
  const h = bancoCustodeRipristino();
  h.requestBottom(); h.frame(); h.timeoutZero();
  assert.equal(h.scroller.scrollTop, 1200);
  h.resizeContent(1000); assert.equal(h.scroller.scrollTop, 200, 'clamp nativo, senza gesto');
  h.resizeContent(3000); h.requestBottom(); // variazione prima della delivery dello scroll
  h.emit('scroll');
  assert.equal(h.b.streamingAutoFollow, true, 'il layout ha spento il seguito senza input');
  assert.equal(h.custode.disconnected, false, 'il layout ha terminato il custode');
  h.frame(); assert.equal(h.scroller.scrollTop, 2200, 'ripristino non arriva al nuovo fondo');
});

/* ═══════════════════════════════════════════════════════════════════════════════════
 * ⭐ A1 (07/10/2026, `desktop-bugfixer`, ledger `bugfixer/LEDGER-A1.md`, GREEN di «talos desktop» sul ledger) —
 * UNO SCROLL DI LAYOUT NON È UN GESTO DELLA PERSONA. Regola: uno scroll non nostro, col puntatore libero e senza
 * trova-nella-pagina, è layout se dall'ultimo scroll visto è cambiata la REVISIONE (le nostre mutazioni, in modo
 * sincrono, e il ResizeObserver) OPPURE il VALORE dell'altezza. Fonti: use-stick-to-bottom 1.1.6 `:438-447`
 * (resizeDifference), Hermes desktop `thread-list.tsx:1172-1182` e `:1208` (posizione non nostra = persona; pointerdown).
 * ═══════════════════════════════════════════════════════════════════════════════════ */

test('B24-65 BARRA-DURANTE-CRESCITA: col puntatore premuto lo scroll è della persona anche se l altezza cambia', () => {
  const h = bancoCustodeRipristino();
  h.requestBottom(); h.frame(); h.timeoutZero();
  h.emit('pointerdown');
  h.resizeContent(3000); h.humanScroll(900);
  h.emit('scroll');
  assert.equal(h.b.streamingAutoFollow, false, 'la barra trascinata è della persona: il seguito si spegne');
  assert.equal(h.custode.disconnected, true, 'e il custode lascia la vista a lei');
});

test('B24-66 RILASCIO-FUORI: il puntatore rilasciato fuori dalla finestra torna libero, e il clamp dopo è layout', () => {
  const h = bancoCustodeRipristino();
  h.requestBottom(); h.frame(); h.timeoutZero();
  h.emit('pointerdown'); h.emitWindow('pointerup');
  h.resizeContent(1000); h.resizeContent(3000); h.requestBottom();
  h.emit('scroll');
  assert.equal(h.b.streamingAutoFollow, true);
  assert.equal(h.custode.disconnected, false);
  h.emit('pointerdown'); h.emitWindow('pointercancel');
  assert.equal(h.b.puntatoreSulloScorrevole, false, 'anche pointercancel rilascia');
});

test('B24-67 TROVA-O-BARRA-AD-ALTEZZA-FERMA: senza nessun cambio di layout lo scroll non nostro è della persona', () => {
  const h = bancoCustodeRipristino();
  h.requestBottom(); h.frame(); h.timeoutZero();
  h.humanScroll(700); h.emit('scroll');
  assert.equal(h.b.streamingAutoFollow, false, 'altezza e revisione ferme: è la persona (trova nella pagina, barra)');
  assert.equal(h.custode.disconnected, true);
});

test('B24-68 GLOBALE-SENZA-CUSTODE: lo stesso clamp a ripristino finito non spegne il seguito e chiede il fondo', () => {
  const h = bancoCustodeRipristino();
  h.requestBottom(); h.frame(); h.timeoutZero();
  h.b.fermaFondoRipristino?.();
  assert.equal(h.custode.disconnected, true, 'premessa: il custode è finito');
  let richieste = 0;
  h.b.scrollStreamingOutput = () => { richieste += 1; };
  h.colonna.lastElementChild = { isConnected: true };
  h.resizeContent(1000); h.resizeContent(3000);
  h.emit('scroll');
  assert.equal(h.b.streamingAutoFollow, true, 'il clamp senza gesto non spegne il seguito');
  assert.equal(richieste, 1, 'il fondo si chiede all unico scrittore');
});

test('B24-69 A-B-A: smonta e rimonta alla STESSA altezza fra due scroll — la revisione lo vede, il seguito resta', () => {
  const h = bancoCustodeRipristino();
  h.requestBottom(); h.frame(); h.timeoutZero();
  assert.equal(h.scroller.scrollTop, 1200);
  h.b.revisioneLayoutConversazione += 1; h.resizeContent(1000); // smonta il turno più vecchio: clamp a 200
  h.b.revisioneLayoutConversazione += 1; h.resizeContent(2000); // una pagina lo rimonta: di nuovo 2000, top resta 200
  h.requestBottom();
  h.emit('scroll');
  assert.equal(h.b.streamingAutoFollow, true, 'A→B→A: il valore è lo stesso, ma la revisione dice che è layout');
  assert.equal(h.custode.disconnected, false);
  h.frame(); assert.equal(h.scroller.scrollTop, 1200, 'e il custode riporta al fondo');
  // le due mutazioni vere della finestra toccano la revisione in modo SINCRONO, senza aspettare un osservatore
  const f = bancoFinestra({ peso: 1, pavimento: 1, inRigiocata: true });
  montaEvento(f, { nome: 'a' }); montaEvento(f, { nome: 'b' });
  const primaSmonta = f.revisioneLayoutConversazione;
  assert.ok(f.smontaTurnoPiuVecchioReplay(f.colonna) > 0, 'premessa: un turno smontato');
  assert.equal(f.revisioneLayoutConversazione, primaSmonta + 1, 'smonta tocca la revisione');
  f.state.realSession.inRigiocata = false;
  const primaPagina = f.revisioneLayoutConversazione;
  f.aggiungiPaginaPrecedenti();
  assert.equal(f.revisioneLayoutConversazione, primaPagina + 1, 'aggiungi pagina tocca la revisione');
});

test('B24-70 RUOTA-DURANTE-CRESCITA: la ruota verso l alto vince anche mentre l altezza cambia di continuo', () => {
  const h = bancoCustodeRipristino();
  h.requestBottom(); h.frame(); h.timeoutZero();
  h.b.revisioneLayoutConversazione += 1; h.resizeContent(2600);
  h.emit('wheel', { deltaY: -40 });
  h.humanScroll(1100); h.resizeContent(3200);
  h.emit('scroll');
  assert.equal(h.b.streamingAutoFollow, false, 'la ruota spegne il seguito anche durante una crescita');
  assert.equal(h.b.streamingUserScrollHold, true);
  assert.equal(h.custode.disconnected, true);
});

test('B24-71 TROVA-NELLA-PAGINA: Ctrl/Cmd+F, F3, Ctrl/Cmd+G sono fatti della persona anche durante una crescita', () => {
  for (const tasto of [{ key: 'f', ctrlKey: true }, { key: 'F', metaKey: true }, { key: 'F3' }, { key: 'g', ctrlKey: true }]) {
    const h = bancoCustodeRipristino();
    h.requestBottom(); h.frame(); h.timeoutZero();
    h.emitDocument('keydown', tasto);
    h.resizeContent(3000); h.humanScroll(900);
    h.emit('scroll');
    assert.equal(h.b.streamingAutoFollow, false, `${JSON.stringify(tasto)}: lo scroll del trova è della persona`);
    assert.equal(h.custode.disconnected, true);
  }
  // un tasto qualunque NON lo è: lo stesso scroll durante la crescita resta layout
  const h = bancoCustodeRipristino();
  h.requestBottom(); h.frame(); h.timeoutZero();
  h.emitDocument('keydown', { key: 'a', ctrlKey: true });
  h.resizeContent(1000); h.resizeContent(3000); h.requestBottom();
  h.emit('scroll');
  assert.equal(h.b.streamingAutoFollow, true);
});

/* ── A1, review di «talos desktop» (F1, F2): ogni ramo della regola ha una prova che lo uccide ─────────────────────── */
const clampDiLayout = (h) => { h.resizeContent(1000); h.resizeContent(3000); h.requestBottom(); h.emit('scroll'); };
const alFondoScritto = () => { const h = bancoCustodeRipristino(); h.requestBottom(); h.frame(); h.timeoutZero(); return h; };

test('B24-72 TROVA-CHIUSO-DA-UN-CLIC: Ctrl+F, poi un clic nel compositore (fuori dallo scorrevole) chiude l intento', () => {
  const h = alFondoScritto();
  h.emitDocument('keydown', { key: 'f', ctrlKey: true });
  h.emitDocument('pointerdown'); h.emitWindow('pointerup');
  clampDiLayout(h);
  assert.equal(h.b.streamingAutoFollow, true, 'il clamp dopo il trova chiuso è di nuovo layout');
  assert.equal(h.custode.disconnected, false);
});

test('B24-73 TROVA-CHIUSO-DAL-FUOCO: la barra del browser chiusa restituisce il fuoco alla pagina e chiude l intento', () => {
  const h = alFondoScritto();
  h.emitDocument('keydown', { key: 'f', ctrlKey: true });
  h.emitWindow('blur'); h.emitWindow('focus');
  clampDiLayout(h);
  assert.equal(h.b.streamingAutoFollow, true);
});

test('B24-74 RO-DELLA-COLONNA: una causa esterna dichiarata dal ResizeObserver fra due scroll si vede anche ad altezza tornata uguale', () => {
  const h = alFondoScritto();
  const roColonna = h.resizeGlobali[0];
  h.resizeContent(1000); roColonna.cb([]); h.resizeContent(2000); // A→B→A esterno, ma il RO l'ha detto
  h.requestBottom(); h.emit('scroll');
  assert.equal(h.b.streamingAutoFollow, true, 'la revisione del RO dice layout');
  assert.equal(h.custode.disconnected, false);
});

test('B24-75 GESTO-CHIUDE-IL-TROVA: dopo Ctrl+F un gesto di lettura chiude l intento, e il clamp dopo è layout', () => {
  const h = alFondoScritto();
  h.emitDocument('keydown', { key: 'f', ctrlKey: true });
  h.emit('wheel', { deltaY: 40 });
  clampDiLayout(h);
  assert.equal(h.b.streamingAutoFollow, true);
});

test('B24-76 BLUR-RILASCIA-IL-PUNTATORE: puntatore premuto e finestra che perde il fuoco (nessun pointerup) ⇒ libero', () => {
  const h = alFondoScritto();
  h.emit('pointerdown'); h.emitWindow('blur');
  assert.equal(h.b.puntatoreSulloScorrevole, false);
  clampDiLayout(h);
  assert.equal(h.b.streamingAutoFollow, true);
});

test('B24-77 ESCAPE-CHIUDE-IL-TROVA: Ctrl+F poi Escape sul documento ⇒ il clamp dopo è layout', () => {
  const h = alFondoScritto();
  h.emitDocument('keydown', { key: 'f', ctrlKey: true });
  h.emitDocument('keydown', { key: 'Escape' });
  clampDiLayout(h);
  assert.equal(h.b.streamingAutoFollow, true);
});

/* ── A1-R2 (07/10/2026, owner dal vivo: «a volte lo spinner sparisce e vedo la conversazione scorrere davanti a me, altre volte
   sparisce prima e si vede lo schermo vuoto») ─ riprodotto sul 4174: con la risposta degli eventi in ritardo di 9 s il velo cadeva a
   8.036 ms su zero turni; con una rotella a 1 s cadeva a 1.100 ms e la storia si disegnava dal primo messaggio, finendo a 225.457 px
   dal fondo. Il velo si toglie SOLO alla fine vera della storia, a un cambio di sessione, o se il flusso è morto. */
const flussoVivo = (h) => { h.b.state.realSession.eventSource = { readyState: 1 }; };

test('A1R2-01 VELO-SENZA-SCADENZA: col flusso vivo il velo resta a 8 s, a 20 s e a 2 minuti; dice quanto è arrivato; cade solo al confine', () => {
  const h = bancoCustodeRipristino({ velata: true });
  flussoVivo(h);
  h.advance(8_000);
  assert.equal(h.classes.has('is-restoring'), true, 'a 8 s la storia non è finita: il velo resta');
  h.b.state.realSession.sequenzeViste = new Set(['a', 'b', 'c']);
  h.advance(12_000);
  assert.equal(h.classes.has('is-restoring'), true, 'a 20 s nemmeno: niente tetto a tempo');
  h.advance(100_000);
  assert.equal(h.classes.has('is-restoring'), true, 'a 2 minuti nemmeno');
  assert.ok(h.b.testiDelVelo.length > 0 && h.b.testiDelVelo.at(-1) === 3, `il velo dice quanti eventi sono arrivati: ${h.b.testiDelVelo.slice(-3)}`);
  // il confine: la storia è finita ⇒ si scopre, in fondo
  h.b.state.realSession.inRigiocata = false;
  h.advance(200);
  assert.equal(h.classes.has('is-restoring'), false, 'al confine il velo cade');
  assert.equal(h.scroller.scrollTop, h.scroller.scrollHeight - h.scroller.clientHeight, 'e la chat è in fondo');
});

test('A1R2-02 FLUSSO-MORTO-SCOPRE: un EventSource chiuso scopre la chat; uno che riprova da solo no', () => {
  const morto = bancoCustodeRipristino({ velata: true });
  morto.b.state.realSession.eventSource = { readyState: 2 };
  morto.advance(8_000);
  assert.equal(morto.classes.has('is-restoring'), false, 'flusso chiuso per sempre: si mostra ciò che c è (la nota «eventi interrotti» c è già)');
  const assente = bancoCustodeRipristino({ velata: true });
  assente.b.state.realSession.eventSource = null;
  assente.advance(8_000);
  assert.equal(assente.classes.has('is-restoring'), false, 'nessun flusso: si scopre');
  // AL CONTRARIO: CONNECTING (0) è una caduta che EventSource riprova da solo, con Last-Event-ID: la storia continua
  const riprova = bancoCustodeRipristino({ velata: true });
  riprova.b.state.realSession.eventSource = { readyState: 0 };
  riprova.advance(30_000);
  assert.equal(riprova.classes.has('is-restoring'), true);
});

test('A1R2-03 GESTI-SOTTO-IL-VELO: rotella, tasti e scroll durante l attesa non staccano il custode né il seguito', () => {
  const h = bancoCustodeRipristino({ velata: true });
  flussoVivo(h);
  h.requestBottom(); h.frame(); h.timeoutZero();
  h.emit('wheel', { deltaY: -600 });
  h.emit('keydown', { key: 'PageUp' });
  h.humanScroll(0);
  h.emit('scroll');
  assert.equal(h.custode.disconnected, false, 'sotto il velo la persona non ha niente da leggere: il custode resta');
  assert.equal(h.b.streamingAutoFollow, true, 'e il seguito del fondo resta acceso');
  assert.equal(h.b.streamingUserScrollHold, false);
  h.frame();
  assert.equal(h.scroller.scrollTop, h.scroller.scrollHeight - h.scroller.clientHeight, 'il custode riporta al fondo, sotto il velo');
  h.b.state.realSession.inRigiocata = false;
  h.advance(200);
  assert.equal(h.classes.has('is-restoring'), false);
  assert.equal(h.scroller.scrollTop, h.scroller.scrollHeight - h.scroller.clientHeight, 'si scopre in fondo, non dal primo messaggio');
});

test('A1R2-04 DOPO IL VELO COMANDA LA PERSONA: la stessa rotella, a chat scoperta, stacca il custode', () => {
  const h = bancoCustodeRipristino({ velata: true });
  flussoVivo(h);
  h.b.state.realSession.inRigiocata = false;
  h.advance(200);
  assert.equal(h.classes.has('is-restoring'), false, 'premessa: scoperta');
  h.emit('wheel', { deltaY: -600 });
  assert.equal(h.b.streamingUserScrollHold, true, 'a chat visibile la rotella è un intento di lettura');
  h.humanScroll(200);
  h.emit('scroll');
  assert.equal(h.custode.disconnected, true);
});

/* ── A1-R2, review di «talos desktop»: senza scadenza un flusso VIVO che tace terrebbe il velo per sempre. Dopo 15 s di silenzio
   VERO il velo OFFRE un'uscita; lo preme la persona, il velo non si toglie da solo. ── */
test('A1R2-05 USCITA-DOPO-IL-SILENZIO: flusso vivo e fermo ⇒ il pulsante compare dopo 15 s di silenzio, NON prima, e il velo resta', () => {
  const h = bancoCustodeRipristino({ velata: true });
  flussoVivo(h);
  assert.equal(h.b.velaRipristinati, 1, 'ogni velo nuovo riparte dal testo breve e senza pulsante');
  h.advance(14_500);
  assert.equal(h.b.uscitaVisibile, false, 'a 14,5 s di silenzio no');
  h.advance(1_000);
  assert.equal(h.b.uscitaVisibile, true, 'a 15 s di silenzio sì');
  assert.equal(h.classes.has('is-restoring'), true, 'il pulsante si OFFRE: il velo non cade da solo');
  h.advance(60_000);
  assert.equal(h.classes.has('is-restoring'), true);
  assert.equal(h.b.uscite.length, 1, 'un pulsante solo');
});

test('A1R2-06 EVENTI-CHE-ARRIVANO: col conteggio che cresce il pulsante non compare mai, nemmeno dopo un minuto', () => {
  const h = bancoCustodeRipristino({ velata: true });
  flussoVivo(h);
  for (let s = 0; s < 60; s += 1) {
    h.b.state.realSession.sequenzeViste.add(`e${s}`);
    h.advance(1_000);
  }
  assert.equal(h.b.uscitaVisibile, false);
  assert.equal(h.b.uscite.length, 0);
});

test('A1R2-07 PREMUTO: scopre, segue il fondo, e se gli eventi riprendono prima del clic il pulsante si ritira', () => {
  const h = bancoCustodeRipristino({ velata: true });
  flussoVivo(h);
  h.advance(16_000);
  assert.equal(h.b.uscitaVisibile, true);
  // gli eventi riprendono: l'uscita non serve più
  h.b.state.realSession.sequenzeViste.add('ripresa');
  h.advance(1_000);
  assert.equal(h.b.uscitaVisibile, false, 'il silenzio è finito: il pulsante si ritira');
  // di nuovo silenzio, e stavolta la persona preme
  h.advance(16_000);
  assert.equal(h.b.uscitaVisibile, true);
  const osservatoriPrima = h.resize.length;
  h.b.uscite.at(-1)();
  assert.equal(h.classes.has('is-restoring'), false, 'premuto: si scopre');
  assert.equal(h.scroller.scrollTop, h.scroller.scrollHeight - h.scroller.clientHeight, 'in fondo');
  assert.ok(h.resize.length > osservatoriPrima, 'e si segue la crescita: la storia continua ad arrivare sotto');
});

test('A1R2-06b IL SILENZIO SI CONTA DALL ULTIMO EVENTO: 10 s di eventi e poi 6 s fermi ⇒ a 16 s il pulsante NON c è; a 25 s sì', () => {
  const h = bancoCustodeRipristino({ velata: true });
  flussoVivo(h);
  for (let s = 0; s < 10; s += 1) { h.b.state.realSession.sequenzeViste.add(`e${s}`); h.advance(1_000); }
  h.advance(6_000);
  assert.equal(h.b.uscitaVisibile, false, 'solo 6 s di silenzio: il tempo dall apertura non conta');
  h.advance(9_500);
  assert.equal(h.b.uscitaVisibile, true, '15 s di silenzio vero: il pulsante si offre');
});
