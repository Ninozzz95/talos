/*
 * Reperto 2 della revisione COMPUTER USE (giudice v1470, correzione 2 della v1472; Desktop 13/11): la bolla manda `ferma`, `messaggio` e `risposta`
 * (`bolla.js:71`, `:76`, `:87`), ma il ponte della pagina principale apriva il canale e mandava soltanto: nessuno ascoltava. «Ferma» non fermava, il messaggio
 * scritto nella bolla e la risposta a una carta andavano persi (il compito restava fermo fino a `msAttesaPermesso`, dieci minuti).
 * Qui il ponte e la bolla VERI parlano su un canale finto che consegna come `BroadcastChannel` (a tutti gli altri oggetti col nome, mai a chi scrive:
 * HTML, «BroadcastChannel», e MDN `BroadcastChannel.postMessage`, letta il 13/11/2026). Le azioni verso il server sono finte e contate.
 * Correzione 3: la carta del computer use sta nella chat E nella bolla; una risposta, da una parte o dall'altra, le chiude tutte e due.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { documento, clic } from './aiuto-dom-blocchi.mjs';
import { creaPonteBolla } from '../../src/components/computer-use/ponte-bolla.js';
import { creaBolla } from '../../src/components/computer-use/bolla.js';

/** Un bus come BroadcastChannel: ogni messaggio va agli altri oggetti dello stesso nome, clonato, mai a chi lo manda. */
function bus() {
  const canali = [];
  const nuovo = () => {
    const c = {
      onmessage: null, chiuso: false, mandati: [],
      postMessage(m) { c.mandati.push(m); for (const o of canali) if (o !== c && !o.chiuso) o.onmessage?.({ data: structuredClone(m) }); },
      close() { c.chiuso = true; },
    };
    canali.push(c);
    return c;
  };
  return { nuovo, canali };
}

function scena({ conAzioni = true } = {}) {
  const b = bus();
  const fatte = [];
  const azioni = {
    ferma: (sessionId) => fatte.push({ ferma: sessionId, quando: performance.now() }),
    messaggio: (sessionId, testo) => fatte.push({ messaggio: testo, sessionId }),
    risposta: (sessionId, corpo) => fatte.push({ risposta: corpo, sessionId }),
  };
  const ponte = creaPonteBolla({ apri: () => b.nuovo(), ...(conAzioni ? { azioni } : {}) });
  const document = documento();
  const finestra = new EventTarget();
  finestra.location = { origin: 'http://127.0.0.1:7501' };
  finestra.open = () => null;
  const timer = { setInterval: () => 1, clearInterval: () => {} };
  const bolla = creaBolla({ document, finestra, canale: b.nuovo(), timer, adesso: () => 0 });
  document.body.append(bolla.nodo);
  /* `estranea()`: un'altra pagina della stessa origine che scrive sul canale (giro 4) */
  return { ponte, bolla, document, fatte, estranea: () => b.nuovo() };
}
const custom = (name, value, _sequenza) => ({ type: 'CUSTOM', name, value, _sequenza });
const lavora = (ponte, sessione = 'S1', seq = 1) => ponte.evento(custom('talos.computer-use-passo', { n: 1, fase: 'annuncio', bersaglio: 'Salva' }, seq), { sessione });
const DOMANDA = {
  type: 'UserQuestionRequested', requestId: 'r1', _sequenza: 2,
  questions: [{ id: 'computer_use', header: 'Computer use', question: 'TALOS is about to pay. Allow it?',
    options: [{ label: 'Allow', description: 'Go on' }, { label: 'Not this one', description: 'Skip it' }, { label: 'Stop', description: 'Stop the task' }] }],
};
const bottoni = (document) => document.body.querySelectorAll('button');
const conTesto = (document, testo) => bottoni(document).find((x) => x.textContent.includes(testo));

test('PBR-01 «Ferma» nella bolla ferma il compito della sessione che usa il computer, entro 1 s', () => {
  const { ponte, document, fatte } = scena();
  lavora(ponte, 'S1');
  const ferma = document.body.querySelectorAll('[data-ferma]')[0];
  assert.ok(ferma, 'la bolla al lavoro mostra «Ferma»');
  const t0 = performance.now();
  clic(ferma);
  const fermate = fatte.filter((f) => 'ferma' in f);
  assert.equal(fermate.length, 1, 'il Ferma della bolla arriva al ponte');
  assert.equal(fermate[0].ferma, 'S1', 'ferma QUELLA sessione, non la visibile');
  assert.ok(fermate[0].quando - t0 < 1000, 'entro 1 s');
});

test('PBR-02 la risposta data nella bolla arriva alla carta del compito (la domanda con le scelte vere)', () => {
  const { ponte, document, fatte } = scena();
  lavora(ponte, 'S1');
  ponte.evento(DOMANDA, { sessione: 'S1' });
  const consenti = conTesto(document, 'Allow');
  assert.ok(consenti, 'la carta del computer use compare anche nella bolla, con le sue scelte');
  assert.ok(document.body.textContent.includes('TALOS is about to pay. Allow it?'), 'con la domanda vera');
  clic(consenti);
  assert.deepEqual(fatte.filter((f) => 'risposta' in f), [
    { risposta: { requestId: 'r1', status: 'answered', answers: { computer_use: 'Allow' } }, sessionId: 'S1' },
  ]);
  assert.equal(conTesto(document, 'Allow'), undefined, 'risposta data: la carta della bolla si chiude');
});

test('PBR-03 il messaggio scritto nella bolla arriva al compito in corso', () => {
  const { ponte, document, fatte } = scena();
  lavora(ponte, 'S1');
  ponte.evento(custom('talos.computer-use-esito', { motivo: 'completato' }, 2), { sessione: 'S1' });
  const campo = document.body.querySelectorAll('textarea')[0];
  assert.ok(campo, 'a riposo la bolla ha il campo');
  campo.value = 'usa la seconda finestra';
  campo.dispatchEvent(Object.assign(new Event('keydown'), { key: 'Enter', shiftKey: false, preventDefault() {} }));
  assert.deepEqual(fatte.filter((f) => 'messaggio' in f), [{ messaggio: 'usa la seconda finestra', sessionId: 'S1' }]);
});

test('PBR-04 correzione 3: una risposta data nella chat chiude anche la carta della bolla; una sola carta da rispondere', () => {
  const { ponte, document, fatte } = scena();
  lavora(ponte, 'S1');
  ponte.evento(DOMANDA, { sessione: 'S1' });
  assert.ok(conTesto(document, 'Allow'));
  ponte.evento({ type: 'UserQuestionResolved', requestId: 'r1', status: 'answered', answers: { computer_use: 'Allow' }, _sequenza: 3 }, { sessione: 'S1' });
  assert.equal(conTesto(document, 'Allow'), undefined, 'risolta nella chat: la bolla la toglie');
  assert.equal(fatte.length, 0, 'e la bolla non risponde una seconda volta');
});

test('PBR-05 per forma: niente dalla storia, niente scelte inventate, niente sessioni che il ponte non conosce', () => {
  const { ponte, document, fatte } = scena();
  ponte.evento(DOMANDA, { sessione: 'S1', inRigiocata: true });
  assert.equal(conTesto(document, 'Allow'), undefined, 'una domanda della storia non arriva alla bolla');
  lavora(ponte, 'S1');
  ponte.evento({ ...DOMANDA, requestId: 'r9', _sequenza: 5, questions: [{ ...DOMANDA.questions[0], id: 'altra' }] }, { sessione: 'S1' });
  assert.equal(conTesto(document, 'Allow'), undefined, 'solo la carta del computer use');
  // la carta con l'elenco intero dietro un pulsante: «Consenti» si sceglie solo dopo averlo aperto, nella chat (decisione dell'owner 11/11 17:12)
  ponte.evento({ ...DOMANDA, _sequenza: 6, questions: [{ ...DOMANDA.questions[0], details: { label: 'Open', text: 'a\nb' },
    options: [{ label: 'Allow', requiresDetails: true }, { label: 'Stop' }] }] }, { sessione: 'S1' });
  assert.equal(conTesto(document, 'Allow'), undefined, 'una scelta che vuole l\'elenco aperto non sta nella bolla');
  assert.ok(conTesto(document, 'Stop'), 'le altre sì');
  clic(conTesto(document, 'Stop'));
  assert.deepEqual(fatte.map((f) => f.risposta?.answers), [{ computer_use: 'Stop' }]);
});

test('PBR-06 un messaggio che non nasce da una carta mostrata non agisce: id sconosciuto, scelta inventata, sessione mai vista', () => {
  const b = bus();
  const fatte = [];
  const ponte = creaPonteBolla({ apri: () => b.nuovo(), azioni: { ferma: (s) => fatte.push(['ferma', s]), messaggio: (s, t) => fatte.push(['messaggio', s, t]), risposta: (s, c) => fatte.push(['risposta', s, c]) } });
  lavora(ponte, 'S1');
  ponte.evento(DOMANDA, { sessione: 'S1' });
  const altra = b.nuovo();
  altra.postMessage({ tipo: 'risposta', id: 'r-mai-vista', valore: 'Allow', sessionId: 'S1' });
  altra.postMessage({ tipo: 'risposta', id: 'r1', valore: 'Pay 1000 EUR', sessionId: 'S1' });
  altra.postMessage({ tipo: 'ferma', sessionId: 'S-mai-vista' });
  altra.postMessage({ tipo: 'messaggio', testo: 'ciao', sessionId: 'S-mai-vista' });
  altra.postMessage({ tipo: 'messaggio', testo: '   ', sessionId: 'S1' });
  altra.postMessage({ tipo: 'sconosciuto' });
  assert.deepEqual(fatte, []);
  altra.postMessage({ tipo: 'ferma' }); // senza sessione: quella che il ponte ha detto alla bolla
  assert.deepEqual(fatte, [['ferma', 'S1']]);
});

test('PBR-07 la pagina principale dà al ponte le rotte di sempre: Stop del giro, coda, risposta alla carta, sulla sessione che usa il computer', async () => {
  const { readFileSync } = await import('node:fs');
  const app = readFileSync(new URL('../../src/legacy/app.js', import.meta.url), 'utf8');
  const filo = app.slice(app.indexOf('const rottaDellaBolla ='), app.indexOf("window.addEventListener('pagehide', () => ponteBolla.chiudi());"));
  assert.match(filo, /apiPost\(`\/api\/v1\/sessions\/\$\{encodeURIComponent\(sessionId\)\}\/\$\{coda\}`, corpo\)/u);
  assert.match(filo, /ferma: \(sessionId\) => rottaDellaBolla\(sessionId, 'stop', \{\}\)/u);
  assert.match(filo, /messaggio: \(sessionId, testo\) => rottaDellaBolla\(sessionId, 'queue', \{ messaggio: testo \}\)/u);
  assert.match(filo, /risposta: \(sessionId, corpo\) => rottaDellaBolla\(sessionId \?\? state\.realSession\.id, 'question', corpo\)/u);
});

test('PBR-08 tabella 375 (correzione 3): su 10 compiti le carte da rispondere restano quelle della chat; la bolla le mostra, non ne aggiunge', () => {
  const { ponte, document, fatte } = scena();
  const perCompito = [1, 0, 2, 1, 1, 3, 0, 1, 2, 1]; // carta del compito + conferme (pagare, inviare...) come le chiede il ciclo
  let seq = 0; let mostrate = 0; let daQui = 0; let r = 0;
  for (const [i, k] of perCompito.entries()) {
    lavora(ponte, 'S1', ++seq);
    for (let j = 0; j < k; j += 1) {
      const id = `r${++r}`;
      ponte.evento({ ...DOMANDA, requestId: id, _sequenza: ++seq }, { sessione: 'S1' });
      if (conTesto(document, 'Allow')) mostrate += 1;
      if ((i + j) % 2 === 0) { clic(conTesto(document, 'Allow')); daQui += 1; } // risposta nella bolla
      ponte.evento({ type: 'UserQuestionResolved', requestId: id, status: 'answered', answers: { computer_use: 'Allow' }, _sequenza: ++seq }, { sessione: 'S1' });
      assert.equal(conTesto(document, 'Allow'), undefined, `compito ${i + 1}, carta ${j + 1}: chiusa da tutte e due le parti`);
    }
    ponte.evento(custom('talos.computer-use-esito', { motivo: 'completato' }, ++seq), { sessione: 'S1' });
  }
  const domande = perCompito.reduce((a, b) => a + b, 0);
  assert.equal(mostrate, domande, 'ogni carta della chat ha la sua copia nella bolla');
  assert.equal(fatte.filter((f) => 'risposta' in f).length, daQui, 'una risposta per carta, mai due');
});

test('PBR-09 una carta si risponde una volta sola: la stessa risposta ripetuta sul canale non parte due volte', () => {
  const b = bus();
  const fatte = [];
  const ponte = creaPonteBolla({ apri: () => b.nuovo(), azioni: { risposta: (s, c) => fatte.push(c.requestId) } });
  lavora(ponte, 'S1');
  ponte.evento(DOMANDA, { sessione: 'S1' });
  const altra = b.nuovo();
  altra.postMessage({ tipo: 'risposta', id: 'r1', valore: 'Allow', sessionId: 'S1' });
  altra.postMessage({ tipo: 'risposta', id: 'r1', valore: 'Allow', sessionId: 'S1' });
  assert.deepEqual(fatte, ['r1']);
});

/* Giro 4 della bolla (controllore CU, 13/11): i mutanti P1-P4 del ponte erano uccisi da una prova sola. Qui la seconda, da un altro lato: la bolla VERA e una
   pagina della stessa origine che scrive sul canale. */
test('PBR-10 una scelta inventata sulla carta vera non agisce e non la chiude: la scelta vera della bolla, dopo, parte una volta', () => {
  const { ponte, document, fatte, estranea } = scena();
  lavora(ponte, 'S1');
  ponte.evento(DOMANDA, { sessione: 'S1' });
  const altra = estranea();
  for (const valore of ['Allow all', 'allow', 'Allow ', '', 'Pay']) altra.postMessage({ tipo: 'risposta', id: 'r1', valore, sessionId: 'S1' });
  assert.deepEqual(fatte, [], 'nessuna scelta che la carta non ha');
  const vera = conTesto(document, 'Not this one');
  assert.ok(vera, 'la carta della bolla resta aperta, con le sue scelte');
  clic(vera);
  assert.deepEqual(fatte.map((f) => f.risposta?.answers), [{ computer_use: 'Not this one' }], 'la scelta vera parte, una volta');
});

test('PBR-11 risposta data dalla bolla: la stessa risposta ripetuta da un\'altra pagina non parte una seconda volta', () => {
  const { ponte, document, fatte, estranea } = scena();
  lavora(ponte, 'S1');
  ponte.evento(DOMANDA, { sessione: 'S1' });
  clic(conTesto(document, 'Allow'));
  const altra = estranea();
  altra.postMessage({ tipo: 'risposta', id: 'r1', valore: 'Allow', sessionId: 'S1' });
  altra.postMessage({ tipo: 'risposta', id: 'r1', valore: 'Stop', sessionId: 'S1' });
  assert.deepEqual(fatte.map((f) => f.risposta?.answers), [{ computer_use: 'Allow' }], 'una risposta per carta, mai due');
});

test('PBR-12 Ferma e messaggio da un\'altra pagina per una sessione che il ponte non segue non agiscono; quelli della bolla sì', () => {
  const { ponte, document, fatte, estranea } = scena();
  lavora(ponte, 'S1');
  const altra = estranea();
  altra.postMessage({ tipo: 'ferma', sessionId: 'S2' });
  altra.postMessage({ tipo: 'messaggio', testo: 'compra tutto', sessionId: 'S2' });
  assert.deepEqual(fatte, [], 'una sessione mai vista dal ponte');
  clic(document.body.querySelectorAll('[data-ferma]')[0]);
  assert.deepEqual(fatte.map((f) => f.ferma), ['S1'], 'il Ferma della bolla ferma la sessione che usa il computer');
});

test('PBR-13 la scelta che vuole l\'elenco aperto non si dà da fuori la chat, nemmeno scrivendola sul canale', () => {
  const { ponte, document, fatte, estranea } = scena();
  lavora(ponte, 'S1');
  ponte.evento({ ...DOMANDA, questions: [{ ...DOMANDA.questions[0], details: { label: 'Open', text: 'a\nb' },
    options: [{ label: 'Allow', requiresDetails: true }, { label: 'Stop' }] }] }, { sessione: 'S1' });
  assert.equal(conTesto(document, 'Allow'), undefined, 'nella bolla non c è');
  estranea().postMessage({ tipo: 'risposta', id: 'r1', valore: 'Allow', sessionId: 'S1' });
  assert.deepEqual(fatte, [], 'scritta sul canale non vale: si sceglie nella chat, con l elenco aperto');
  clic(conTesto(document, 'Stop'));
  assert.deepEqual(fatte.map((f) => f.risposta?.answers), [{ computer_use: 'Stop' }]);
});
