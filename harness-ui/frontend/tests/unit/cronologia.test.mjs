import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  LENTE,
  contenitoreCheScorre,
  VOCI_MASSIME,
  anteprima,
  capoFumetto,
  etichettaVoce,
  larghezzaLente,
  scorrimentoPerVedere,
  testoFumetto,
  tonoPeggiore,
  vociDaConversazione,
  vociDaTurni,
} from '../../src/components/cronologia.js';

/*
 * ⛔ 07/09/2026, owner (screenshot): passando il mouse sulla barra dei giri comparivano DUE riquadri
 *   sovrapposti con lo stesso testo. Riprodotto sul 4174 (`cronologia-hover.png`): uno era il nostro
 *   fumetto, l'altro il tooltip NATIVO che Chrome disegna da `title` — che appare dopo circa un
 *   secondo, ignora il tema, e si posiziona dove vuole lui. In questo stesso progetto esiste già
 *   `tooltip.js` con `migraTitle()` proprio per non avere due riquadri: la barra lo scavalcava
 *   riscrivendo `b.title` a ogni aggiornamento.
 * ⇒ La guardia sta qui, non nella memoria: se qualcuno rimette un `title` su una voce, questo test
 *   diventa rosso. E ha la sua metà AL CONTRARIO, perché un cancello che non ha mai respinto niente
 *   non è un cancello.
 */
const SORGENTE = readFileSync(new URL('../../src/components/cronologia.js', import.meta.url), 'utf8');
const assegnaTitle = (codice) => /\.title\s*=/.test(codice);

test('CRONOLOGIA-FUMETTO-UNICO: nessuna voce riceve il `title` nativo', () => {
  assert.equal(assegnaTitle(SORGENTE), false, 'un `title` qui rimette il doppio riquadro del 07/9');
  assert.match(SORGENTE, /removeAttribute\('title'\)/, 'e il title di un DOM già disegnato va tolto, non solo evitato');
});

test('CRONOLOGIA-FUMETTO-UNICO, al contrario: la guardia MORDE se il title torna', () => {
  assert.equal(assegnaTitle("b.title = testoFumetto(v);"), true);
  assert.equal(assegnaTitle("b.setAttribute('aria-label', 'Vai al giro 3');"), false);
});

test('LENTE: 26 sotto il cursore, poi 20·14·10·6, e il fondo per chi è lontano', () => {
  assert.deepEqual([0, 1, 2, 3, 4, 9].map((d) => larghezzaLente(d, 0)), [26, 20, 14, 10, 6, 6]);
  assert.equal(larghezzaLente(5, 7), LENTE[2]);
  assert.equal(larghezzaLente(NaN, 0), 6, 'senza un indice valido si sta al minimo, non si esplode');
});

test('ANTEPRIMA: una riga sola, tagliata, e il vuoto lo dice', () => {
  assert.equal(anteprima('  due   righe\ndi testo '), 'due righe di testo');
  assert.equal(anteprima(''), 'Messaggio senza testo');
  assert.equal(anteprima('x'.repeat(200)).length, 140);
  assert.match(anteprima('x'.repeat(200)), /…$/);
});

/* ────────────────────────── BC-08 — le voci sono DUE per scambio, e dicono di chi sono ──────────── */

/*
 * ⛔ Un DOM finto, e stretto apposta: conosce SOLO i selettori che il componente usa davvero, e su
 * qualunque altro LANCIA. Un finto permissivo avrebbe fatto passare un selettore sbagliato — e il
 * difetto che stiamo curando (CB-03, `.assistant-copy` presa dal ragionamento) nasceva proprio da un
 * selettore sbagliato che nessuna prova poteva vedere.
 */
function nodo({ tag = 'div', classi = [], dataset = {}, testo = '', figli = [] } = {}) {
  const n = {
    tag,
    classi: new Set(classi),
    dataset: { ...dataset },
    figli,
    get textContent() { return testo || n.figli.map((f) => f.textContent).join(''); },
    classList: { contains: (c) => n.classi.has(c) },
    querySelectorAll(selettore) { return cerca(n, selettore); },
    querySelector(selettore) { return cerca(n, selettore)[0] || null; },
  };
  return n;
}
function discendenti(radice) {
  const fuori = [];
  for (const f of radice.figli || []) { fuori.push(f, ...discendenti(f)); }
  return fuori;
}
function cerca(radice, selettore) {
  const passi = String(selettore).trim().split(/\s+/);
  for (const passo of passi) {
    const corpo = passo.startsWith('.') ? passo.slice(1) : passo;
    if (!/^[a-zA-Z][\w-]*$/.test(corpo)) throw new Error(`finto: selettore non gestito «${selettore}»`);
  }
  let livello = [radice];
  for (const passo of passi) {
    const combacia = passo.startsWith('.') ? (n) => n.classi.has(passo.slice(1)) : (n) => n.tag === passo;
    const prossimo = [];
    for (const n of livello) for (const d of discendenti(n)) if (combacia(d) && !prossimo.includes(d)) prossimo.push(d);
    livello = prossimo;
  }
  return livello;
}
const turnoUtente = (testo) => nodo({
  classi: ['talos-turn'],
  dataset: { turno: 'utente' },
  figli: [
    nodo({ classi: ['talos-turn-spine'], figli: [nodo({ classi: ['talos-turn-spine__n'], testo: '1' }), nodo({ classi: ['talos-turn-spine__tick'], dataset: { tick: '1' } })] }),
    nodo({ classi: ['talos-message', 'talos-message--user'], figli: [nodo({ classi: ['message-bubble'], figli: [nodo({ tag: 'p', testo })] })] }),
  ],
});
const turnoTalos = (testo, giri = [{ n: 2, tick: 1, tono: null }], ragionamento = '') => nodo({
  classi: ['talos-turn'],
  dataset: { turno: 'talos' },
  figli: [
    nodo({ classi: ['talos-turn-spine'], figli: giri.flatMap((g) => [
      nodo({ classi: ['talos-turn-spine__n'], testo: String(g.n) }),
      nodo({ classi: ['talos-turn-spine__tick', ...(g.tono ? [`talos-turn-spine__tick--${g.tono}`] : [])], dataset: { tick: String(g.tick) } }),
    ]) }),
    ...(ragionamento ? [nodo({ classi: ['real-reasoning-note'], figli: [nodo({ classi: ['assistant-copy'], testo: ragionamento })] })] : []),
    ...(testo ? [nodo({ classi: ['talos-message'], figli: [nodo({ classi: ['talos-message__copy'], figli: [nodo({ classi: ['assistant-copy'], testo })] })] })] : []),
  ],
});
const conversazione = (...turni) => nodo({ classi: ['talos-conversation'], figli: turni });

const SELETTORI_VERI = /SELETTORE_TESTO_UTENTE|SELETTORE_RISPOSTA_TURNO/;

test('BC-08: i selettori del testo si IMPORTANO da inspector.js, non si riscrivono qui', () => {
  assert.match(SORGENTE, /from '\.\/inspector\.js'/, 'due copie dello stesso selettore divergono al primo ritocco');
  assert.match(SORGENTE, SELETTORI_VERI);
  /* ⛔ sottostringa, non espressione regolare: questo file è pieno di apostrofi italiani, e un
     `[^']*` fra due virgolette semplici combacia con mezzo commento — la prima stesura di questa
     riga era rossa per quello, non per il codice. */
  assert.equal(SORGENTE.includes("'.assistant-copy"), false, 'e `.assistant-copy` riscritta qui è il difetto CB-03: prende il ragionamento');
  assert.equal(SORGENTE.includes("'.talos-message__copy"), false, 'anche il selettore completo si importa, non si ricopia');
});

test('BC-08: una voce per TURNO, i due lati, e ognuna col testo SUO', () => {
  const voci = vociDaTurni([
    { elemento: 'A', diUtente: true, numeri: [1], toni: [], attrezzi: 0, testo: 'la mia domanda' },
    { elemento: 'B', diUtente: false, numeri: [2, 3], toni: [], attrezzi: 3, testo: 'la sua risposta' },
  ]);
  assert.equal(voci.length, 2);
  assert.deepEqual(voci.map((v) => v.lato), ['utente', 'talos']);
  assert.deepEqual(voci.map((v) => v.testo), ['la mia domanda', 'la sua risposta']);
  assert.notEqual(voci[1].testo, voci[0].testo, 'era questo il difetto: la risposta portava il testo della domanda');
  assert.deepEqual(voci.map((v) => v.indice), [0, 1]);
  assert.deepEqual(voci.map((v) => v.elemento), ['A', 'B'], 'due voci, due elementi diversi: due clic che non finiscono nello stesso punto');
});

test('BC-08, dal DOM: due turni, due voci, ordine della conversazione e testi giusti', () => {
  const chat = conversazione(
    turnoUtente('aggiungi la guardia di stallo'),
    turnoTalos('ho aggiunto la guardia e la prova', [{ n: 2, tick: 2, tono: null }, { n: 3, tick: 1, tono: 'warning' }], 'The user asks in Italian'),
    turnoUtente('adesso misurala'),
  );
  const voci = vociDaConversazione(chat);
  assert.equal(voci.length, 3, 'tre turni, tre voci: i due giri del turno di TALOS NON fanno due voci');
  assert.deepEqual(voci.map((v) => v.lato), ['utente', 'talos', 'utente']);
  assert.equal(voci[1].testo, 'ho aggiunto la guardia e la prova');
  assert.doesNotMatch(voci[1].testo, /The user asks/, 'CB-03: il ragionamento non è la risposta');
  assert.equal(voci[1].numero, 2);
  assert.equal(voci[1].numeroUltimo, 3);
  assert.equal(voci[1].tono, 'warning');
  assert.equal(voci[1].attrezzi, 3, 'gli attrezzi del turno sono quelli di TUTTI i suoi giri');
  assert.equal(voci[2].elemento, chat.figli[2]);
});

test('BC-08, al contrario: ciò che NON è un turno non diventa una voce', () => {
  const chat = conversazione(
    nodo({ classi: ['talos-system-note'], testo: 'Impostazioni cambiate fuori da questa scheda' }),
    turnoUtente('una domanda'),
    nodo({ classi: ['talos-waiting'], testo: 'sta scrivendo' }),
    turnoTalos('una risposta'),
  );
  const voci = vociDaConversazione(chat);
  assert.equal(voci.length, 2, 'note di sistema e attesa non sono messaggi da navigare');
  assert.deepEqual(voci.map((v) => v.lato), ['utente', 'talos']);
  assert.equal(vociDaConversazione(conversazione()).length, 0, 'e una chat senza turni non inventa voci');
  assert.equal(vociDaConversazione(null).length, 0);
});

test('BC-08: «in corso» vale solo per l’ULTIMO turno — 21 giri su 56 restavano accesi su una sessione VERA', () => {
  const voci = vociDaTurni([
    { elemento: 'A', diUtente: false, numeri: [2], toni: ['current'], attrezzi: 1, testo: 'prima risposta' },
    { elemento: 'B', diUtente: true, numeri: [3], toni: [], attrezzi: 0, testo: 'poi ho scritto io' },
    { elemento: 'C', diUtente: false, numeri: [4], toni: ['current'], attrezzi: 1, testo: 'risposta di adesso' },
  ]);
  assert.deepEqual(voci.map((v) => v.tono), [null, null, 'current'], 'una conversazione non ha tre turni «in corso» insieme');
  const soloUno = vociDaTurni([{ elemento: 'A', diUtente: false, numeri: [2], toni: ['current'], attrezzi: 1, testo: 'x' }]);
  assert.equal(soloUno[0].tono, 'current', 'e l’ultimo, se davvero sta rispondendo, resta acceso');
  const spento = vociDaTurni([
    { elemento: 'A', diUtente: false, numeri: [2], toni: ['current'], attrezzi: 1, testo: '' },
    { elemento: 'B', diUtente: true, numeri: [3], toni: [], attrezzi: 0, testo: 'ciao' },
  ]);
  assert.equal(spento[0].testo, 'Risposta senza testo', 'e chi perde l’«in corso» non resta a dire «sta rispondendo»');
});

test('BC-08: una risposta ancora vuota lo DICE, e dice anche quale dei due vuoti è', () => {
  const inCorso = vociDaTurni([{ elemento: 'X', diUtente: false, numeri: [4], toni: ['current'], attrezzi: 1, testo: '' }]);
  assert.equal(inCorso[0].testo, 'Sta rispondendo…');
  const finita = vociDaTurni([{ elemento: 'X', diUtente: false, numeri: [4], toni: [], attrezzi: 1, testo: '   ' }]);
  assert.equal(finita[0].testo, 'Risposta senza testo', 'un turno finito e muto non si spaccia per uno che sta scrivendo');
  const tua = vociDaTurni([{ elemento: 'X', diUtente: true, numeri: [1], toni: [], attrezzi: 0, testo: '' }]);
  assert.equal(tua[0].testo, 'Messaggio senza testo');
});

test('BC-08: oltre il tetto restano le ULTIME voci, rinumerate — non le prime', () => {
  const tanti = Array.from({ length: VOCI_MASSIME + 5 }, (_, i) => ({ elemento: `T${i}`, diUtente: i % 2 === 0, numeri: [i + 1], toni: [], attrezzi: 0, testo: `messaggio ${i}` }));
  const voci = vociDaTurni(tanti);
  assert.equal(voci.length, VOCI_MASSIME);
  assert.equal(voci[voci.length - 1].elemento, `T${VOCI_MASSIME + 4}`, 'la fine della conversazione è dove stai leggendo: non si taglia quella');
  assert.equal(voci[0].elemento, 'T5');
  assert.deepEqual([voci[0].indice, voci[1].indice], [0, 1], 'gli indici si rinumerano dopo il taglio, o la lente punta alla voce sbagliata');
});

test('TONO: di un turno vale il PEGGIORE dei suoi giri, e il nessuno resta nessuno', () => {
  assert.equal(tonoPeggiore(['info', 'danger', 'current']), 'danger');
  assert.equal(tonoPeggiore(['current', 'warning']), 'warning');
  assert.equal(tonoPeggiore([]), null);
  assert.equal(tonoPeggiore(['boh']), null, 'un tono che non esiste non diventa un tono');
});

test('FUMETTO: il capo dice chi parla, e per TALOS i giri, l’esito e gli attrezzi', () => {
  assert.equal(capoFumetto({ diUtente: true, numero: 1 }), 'Tu');
  assert.equal(capoFumetto({ diUtente: false, numero: 5, numeroUltimo: 5, tono: 'danger', attrezzi: 3 }), 'TALOS · giro 5 · errore · 3 attrezzi');
  assert.equal(capoFumetto({ diUtente: false, numero: 5, numeroUltimo: 8, attrezzi: 1 }), 'TALOS · giri 5-8', 'un attrezzo solo non merita una riga');
  assert.equal(capoFumetto({ diUtente: false }), 'TALOS');
  assert.equal(capoFumetto(null), '');
  assert.equal(testoFumetto({ diUtente: false, numero: 5, tono: 'danger', numeroUltimo: 5, attrezzi: 3, testo: 'ciao' }), 'TALOS · giro 5 · errore · 3 attrezzi\nciao');
  assert.equal(testoFumetto({ diUtente: true, testo: 'la mia' }), 'Tu\nla mia');
  assert.equal(testoFumetto(null), '');
});

test('ETICHETTA: chi legge da tastiera sente di chi è il messaggio, e nessun nome tecnico', () => {
  assert.equal(etichettaVoce({ diUtente: true }, 3), 'Vai al tuo messaggio 3');
  assert.equal(etichettaVoce({ diUtente: false }, 3), 'Vai alla risposta di TALOS 3');
  assert.equal(etichettaVoce(null, 1), '');
});

/* ───────── BC-08 — quando le voci non ci stanno: la lista scorre e resta agganciata alla lettura ── */

test('SCORRIMENTO: la lista segue la voce attiva sotto e sopra, e non si muove se già si vede', () => {
  const base = { altezzaVoce: 10, clientHeight: 200, scrollHeight: 1200, sfumatura: 40 };
  assert.equal(scorrimentoPerVedere({ ...base, indice: 100, scrollTop: 0 }), 1000 + 10 + 40 - 200, 'voce sotto: si scende quel tanto che basta, sfumatura compresa');
  assert.equal(scorrimentoPerVedere({ ...base, indice: 10, scrollTop: 500 }), 100 - 40, 'voce sopra: si risale');
  assert.equal(scorrimentoPerVedere({ ...base, indice: 60, scrollTop: 500 }), 500, 'voce già nella parte buona: la barra sta ferma');
});

test('SCORRIMENTO, al contrario: niente da scorrere, misure assurde e fondo corsa', () => {
  assert.equal(scorrimentoPerVedere({ indice: 3, altezzaVoce: 10, scrollTop: 0, clientHeight: 400, scrollHeight: 400 }), 0, 'lista che ci sta tutta: non si muove');
  assert.equal(scorrimentoPerVedere({ indice: 3, altezzaVoce: 0, scrollTop: 7, clientHeight: 200, scrollHeight: 1200 }), 7, 'senza altezza di riga non si indovina');
  assert.equal(scorrimentoPerVedere({ indice: NaN, altezzaVoce: 10, scrollTop: 7, clientHeight: 200, scrollHeight: 1200 }), 7);
  assert.equal(scorrimentoPerVedere({ indice: 119, altezzaVoce: 10, scrollTop: 0, clientHeight: 200, scrollHeight: 1200 }), 1000, 'l’ultima voce non fa sfondare il fondo corsa');
  assert.equal(scorrimentoPerVedere({ indice: 0, altezzaVoce: 10, scrollTop: 300, clientHeight: 200, scrollHeight: 1200 }), 0, 'né sfondare in cima');
});

test('SCROLL-SPY: si ascolta il contenitore che SCORRE, non la colonna che porta l’id', () => {
  /* `legacy-dom.js` 154-155: la CLASSE `conversation` va allo scorrevole, l’ID `conversation` alla
     colonna. `app.js` passa l’ID. Senza questa risalita l’ascolto sta su un elemento che non scorre
     mai — ed è il motivo per cui `attivaVera` è rimasto `undefined` per tutta la vita della barra. */
  const scorrevole = { nome: 'scorrevole' };
  const colonna = { nome: 'colonna', closest: (s) => (s === '.talos-conversation' ? scorrevole : null) };
  assert.equal(contenitoreCheScorre(colonna), scorrevole);
  assert.match(SORGENTE, /scorrevole\.addEventListener\('scroll'/, 'e l’ascolto ci si attacca davvero');
});

test('SCROLL-SPY, al contrario: se non c’è un antenato che scorre si usa quello che c’è, non null', () => {
  const solo = { nome: 'solo', closest: () => null };
  assert.equal(contenitoreCheScorre(solo), solo);
  assert.equal(contenitoreCheScorre({ nome: 'antico' }).nome, 'antico', 'un elemento senza `closest` non fa cadere la barra');
  assert.equal(contenitoreCheScorre(null), null);
});
