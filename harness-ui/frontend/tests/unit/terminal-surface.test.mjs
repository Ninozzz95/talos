import assert from 'node:assert/strict';
import test from 'node:test';

import { attesaPrimaDiRiprovare, createTerminalSurface } from '../../src/app/surfaces/terminal.js';
import { fakeDocument, testoDi, trova } from './fake-dom.mjs';

const ETICHETTE = {
  regionLabel: 'Terminale',
  noFolder: 'nessuna cartella',
  states: {
    connecting: 'collegamento in corso',
    open: 'collegato',
    'reconnected-unknown': 'riconnesso — non sappiamo se la shell è ancora quella di prima',
    reconnecting: 'caduto, riprovo fra',
    disconnected: 'scollegato dopo tentativi:',
    exited: 'la shell è uscita, codice',
    forbidden: 'questa scheda non esiste più o non è tua',
    error: 'errore di collegamento',
    closed: 'nessuna scheda aperta',
  },
  isolation: { isolated: 'isolato', host: 'sulla tua macchina', unknownIsolation: 'non sappiamo se è isolato' },
  launchedBy: { utente: 'lo hai lanciato tu', agente: 'lo ha lanciato l’agente', unknown: 'non sappiamo chi lo ha lanciato' },
};

/** Un trasporto finto che registra tutto e lascia pilotare i callback. */
function trasportoFinto() {
  const aperture = [];
  const t = {
    aperture,
    ultima: () => aperture.at(-1),
    open(opzioni) {
      const conn = { inviati: [], distrutto: false, ...opzioni };
      conn.send = (v) => conn.inviati.push(v);
      conn.resize = () => {};
      conn.destroy = () => { conn.distrutto = true; };
      aperture.push(conn);
      return conn;
    },
  };
  return t;
}

function vistaFinta() {
  const scritte = [];
  return { fabbrica: () => ({ scrivi: (d) => scritte.push(d), destroy() {} }), scritte };
}

/** Un orologio finto: i timer si fanno scattare a mano. */
function orologio() {
  const attese = [];
  return {
    attese,
    programma: (fn, ms) => { attese.push({ fn, ms }); return attese.length; },
    annulla: (id) => { if (attese[id - 1]) attese[id - 1].annullata = true; },
    scatta: () => { const a = attese.find((x) => !x.annullata && !x.fatta); if (a) { a.fatta = true; a.fn(); } return a; },
  };
}

function monta(extra = {}) {
  const trasporto = trasportoFinto();
  const vista = vistaFinta();
  const tempo = orologio();
  const s = createTerminalSurface({
    documentObj: fakeDocument(),
    labels: ETICHETTE,
    trasporto,
    creaVista: vista.fabbrica,
    programmaAttesa: tempo.programma,
    annullaAttesa: tempo.annulla,
    casuale: () => 0.5, // jitter neutro: l'attesa diventa deterministica
    testId: 'terminal',
    ...extra,
  });
  return { s, trasporto, vista, tempo };
}

const SCHEDA = { terminalId: 't1', cartella: 'C:/progetti/talos', isolato: false };
const statoDi = (el) => testoDi(trova(el, (e) => e.getAttribute('role') === 'status'));

/* --- Il backoff --- */

test('TERM-01 ⭐ il backoff raddoppia, si ferma a 30 s e porta il jitter', () => {
  const neutro = { casuale: () => 0.5 };
  assert.equal(attesaPrimaDiRiprovare(1, neutro), 500);
  assert.equal(attesaPrimaDiRiprovare(2, neutro), 1000);
  assert.equal(attesaPrimaDiRiprovare(3, neutro), 2000);
  assert.equal(attesaPrimaDiRiprovare(20, neutro), 30000, 'il tetto è 30 s');
  // ⛔ Il jitter è ±50%: senza, al riavvio del server tutti tornano insieme.
  assert.equal(attesaPrimaDiRiprovare(3, { casuale: () => 0 }), 1000);
  assert.equal(attesaPrimaDiRiprovare(3, { casuale: () => 1 }), 3000);
});

/* --- Riconnessione onesta --- */

test('TERM-02 ⭐⭐ una caduta riprova col backoff, e la ripresa NON promette che la shell sia la stessa', () => {
  const { s, trasporto, tempo } = monta();
  s.update({ tab: SCHEDA });
  trasporto.ultima().onState('open');
  assert.equal(statoDi(s.element), 'collegato');

  // Arriva output: da qui in poi «riconnesso» non è più «appena aperto».
  trasporto.ultima().onData('$ npm test\n');
  trasporto.ultima().onState('closed');
  assert.match(statoDi(s.element), /caduto, riprovo fra 1/);
  assert.equal(tempo.attese.at(-1).ms, 500);

  tempo.scatta();
  trasporto.ultima().onState('open');
  // ⛔ Il protocollo non ha un segnale «ripreso»: se il reaper ha chiuso la
  // PTY il server ne apre una NUOVA e da fuori si vede uguale. Si dichiara.
  assert.match(statoDi(s.element), /non sappiamo se la shell è ancora quella/);
  assert.equal(s.stato(), 'reconnected-unknown');
});

test('TERM-03 ⭐ dopo il tetto dei tentativi si passa a «scollegato», non si ritenta all\'infinito', () => {
  const { s, trasporto, tempo } = monta();
  s.update({ tab: SCHEDA });
  for (let i = 0; i < 12; i += 1) {
    trasporto.ultima().onState('closed');
    tempo.scatta();
  }
  trasporto.ultima().onState('closed');
  assert.equal(s.stato(), 'disconnected');
  assert.match(statoDi(s.element), /scollegato dopo tentativi: 12/);
  const attesePrima = tempo.attese.length;
  trasporto.ultima().onState('closed');
  assert.equal(tempo.attese.length, attesePrima, 'non si programma un altro tentativo');
});

test('TERM-04 ⭐⭐ un 403 NON si ritenta: il registro ha già detto no', () => {
  const { s, trasporto, tempo } = monta();
  s.update({ tab: SCHEDA });
  trasporto.ultima().onError(Object.assign(new Error('no'), { status: 403 }));
  assert.equal(s.stato(), 'forbidden');
  assert.match(statoDi(s.element), /non esiste più o non è tua/);
  assert.equal(tempo.attese.filter((a) => !a.annullata).length, 0, 'nessun tentativo programmato');
  // E nemmeno la chiusura che segue lo fa ripartire.
  trasporto.ultima().onState('closed');
  assert.equal(s.stato(), 'forbidden');
});

test('TERM-05 ⭐ l\'uscita della shell è un fatto, non una caduta: nessun tentativo', () => {
  const { s, trasporto, tempo } = monta();
  s.update({ tab: SCHEDA });
  trasporto.ultima().onExit(130);
  assert.equal(s.stato(), 'exited');
  assert.match(statoDi(s.element), /la shell è uscita, codice 130/);
  trasporto.ultima().onState('closed');
  assert.equal(tempo.attese.filter((a) => !a.annullata).length, 0);
});

test('TERM-06 una riconnessione riuscita azzera il contatore dei tentativi', () => {
  const { s, trasporto, tempo } = monta();
  s.update({ tab: SCHEDA });
  trasporto.ultima().onState('closed');
  tempo.scatta();
  trasporto.ultima().onState('closed');
  assert.equal(tempo.attese.at(-1).ms, 1000, 'secondo tentativo: 1 s');
  tempo.scatta();
  trasporto.ultima().onState('open');
  trasporto.ultima().onState('closed');
  assert.equal(tempo.attese.at(-1).ms, 500, 'dopo una ripresa si riparte da 500 ms');
});

/* --- G8-G10: il terminale dichiara sempre tre cose --- */

test('TERM-07 ⭐⭐ dichiara la cartella, l\'isolamento e CHI ha lanciato', () => {
  const { s } = monta();
  s.update({ tab: SCHEDA, launchedBy: 'agente' });
  assert.match(testoDi(trova(s.element, (e) => e.className === 'talos-terminal__folder')), /C:\/progetti\/talos/);
  assert.equal(trova(s.element, (e) => e.className === 'talos-terminal__isolation').dataset.isolamento, 'host');
  assert.match(testoDi(trova(s.element, (e) => e.className === 'talos-terminal__author')), /lo ha lanciato l’agente/);
});

test('TERM-08 ⭐⭐ isolamento: TRE stati, e «non lo sappiamo» non diventa «sulla tua macchina»', () => {
  const { s } = monta();
  s.update({ tab: { ...SCHEDA, isolato: undefined } });
  const nodo = trova(s.element, (e) => e.className === 'talos-terminal__isolation');
  assert.equal(nodo.dataset.isolamento, 'unknownIsolation');
  assert.match(testoDi(nodo), /non sappiamo se è isolato/);
  s.update({ tab: { ...SCHEDA, terminalId: 't2', isolato: true } });
  assert.equal(trova(s.element, (e) => e.className === 'talos-terminal__isolation').dataset.isolamento, 'isolated');
});

test('TERM-09 senza scheda non si scrive una cartella finta', () => {
  const { s } = monta();
  s.update({ tab: null });
  assert.equal(testoDi(trova(s.element, (e) => e.className === 'talos-terminal__folder')), 'nessuna cartella');
  assert.equal(s.stato(), 'closed');
});

test('TERM-10 chi ha lanciato è ignoto finché non lo sappiamo, mai attribuito a caso', () => {
  const { s } = monta();
  s.update({ tab: SCHEDA });
  const nodo = trova(s.element, (e) => e.className === 'talos-terminal__author');
  assert.equal(nodo.dataset.autore, 'unknown');
  assert.match(testoDi(nodo), /non sappiamo chi lo ha lanciato/);
});

/* --- Schede --- */

test('TERM-11 ⭐ cambiare scheda chiude la shell di prima e non ne mescola l\'output', () => {
  const { s, trasporto } = monta();
  s.update({ tab: SCHEDA });
  const prima = trasporto.ultima();
  s.update({ tab: { terminalId: 't2', cartella: 'C:/altro', isolato: true } });
  assert.equal(prima.distrutto, true);
  assert.equal(trasporto.aperture.length, 2);
  assert.equal(trasporto.ultima().terminalId, 't2');
});

test('TERM-12 lo stesso id non riapre la connessione: aggiorna e basta', () => {
  const { s, trasporto } = monta();
  s.update({ tab: SCHEDA });
  s.update({ tab: { ...SCHEDA }, launchedBy: 'utente' });
  assert.equal(trasporto.aperture.length, 1);
  assert.match(testoDi(trova(s.element, (e) => e.className === 'talos-terminal__author')), /lo hai lanciato tu/);
});

test('TERM-13 chiudere una scheda avvisa chi decide, e passa la scheda intera', () => {
  const chiuse = [];
  const { s } = monta({ onCloseTab: (scheda) => chiuse.push(scheda.terminalId) });
  s.update({ tab: SCHEDA });
  assert.equal(s.chiudi(), true);
  assert.deepEqual(chiuse, ['t1']);
  assert.equal(s.stato(), 'closed');
});

test('TERM-14 AL CONTRARIO dopo destroy una caduta non programma più tentativi', () => {
  const { s, trasporto, tempo } = monta();
  s.update({ tab: SCHEDA });
  const conn = trasporto.ultima();
  assert.equal(s.destroy(), true);
  assert.equal(s.destroy(), false);
  assert.equal(conn.distrutto, true);
  const prima = tempo.attese.length;
  conn.onState('closed');
  assert.equal(tempo.attese.length, prima);
});

test('TERM-15 AL CONTRARIO senza trasporto, vista o etichette non si monta', () => {
  const t = trasportoFinto();
  assert.throws(() => createTerminalSurface({ labels: ETICHETTE, trasporto: t, creaVista: () => {} }), /dipendenze terminale mancanti/);
  assert.throws(() => createTerminalSurface({ documentObj: fakeDocument(), labels: ETICHETTE, creaVista: () => {} }), /dipendenze terminale mancanti/);
  assert.throws(() => createTerminalSurface({ documentObj: fakeDocument(), labels: ETICHETTE, trasporto: t }), /dipendenze terminale mancanti/);
  assert.throws(() => createTerminalSurface({ documentObj: fakeDocument(), trasporto: t, creaVista: () => {}, labels: { states: {} } }), /richiede le sue etichette/);
});
