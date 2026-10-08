/*
 * ⛔⛔ B1 (07/10/2026, `desktop-bugfixer`) — L'APERTURA DI UNA SESSIONE LUNGA. Misurato dal vivo sul 4174 (sessione da 1363
 *   giri, ingressi veri dell'owner: freddo, cambio sessione e ritorno, sezione e ritorno; profilo CPU via CDP): main thread
 *   bloccato 40 s → 5,6 s, spinner assente → presente, fondo stabile. Ogni prova qui fissa UNA cura presa da un hotspot del
 *   profilo; il ledger è `bugfixer/LEDGER-A1.md`. Dove il comportamento chiederebbe un DOM finto enorme (segnavia,
 *   colonna), la prova legge il sorgente senza commenti, come `RIPRISTINO-01` del banco BUG-24, e ha il suo verso contrario.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const senzaCommenti = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
const APP = senzaCommenti(readFileSync(new URL('../../src/legacy/app.js', import.meta.url), 'utf8'));
const SEGMENTO = readFileSync(new URL('../../src/components/attivita-segmento.js', import.meta.url), 'utf8');
const CRONOLOGIA = senzaCommenti(readFileSync(new URL('../../src/components/cronologia.js', import.meta.url), 'utf8'));
/* Il corpo di una funzione dalla sua firma alla graffa che la chiude alla STESSA indentazione (2 spazi nel monolite, 0 per
   una funzione esportata da un modulo). */
const corpo = (s, firma) => {
  const i = s.indexOf(firma); assert.notEqual(i, -1, `manca ${firma}`);
  const rientro = firma.match(/^ */)[0];
  const fine = s.indexOf(`\n${rientro}}\n`, i);
  return s.slice(i, fine + rientro.length + 2);
};

test('B1-01 SEGNAVIA: l osservatore della conversazione MARCA, il fotogramma aggiorna (una passata per fotogramma)', () => {
  const collega = corpo(CRONOLOGIA, 'export function collegaCronologia(');
  assert.match(collega, /new finestra\.MutationObserver\(programmaAggiornamento\)/);
  assert.match(collega, /const programmaAggiornamento = \(\) => \{\s*if \(aggiornamentoInCoda !== null\) return;/);
  assert.doesNotMatch(collega, /MutationObserver\(\(\) => \{ aggiornaCronologia\(/, 'al contrario: nessun aggiornamento sincrono per lotto');
});

test('B1-02 COLONNA: durante la storia non si ridisegna, ma il PRIMO disegno di una sessione sì, e al confine si disegna', () => {
  const disegna = corpo(APP, '  function disegnaInspectorAdesso() {');
  assert.match(disegna, /if \(state\.realSession\.inRigiocata && inspectorDisegnatoPer === state\.realSession\.id\) return;/);
  assert.match(disegna, /inspectorDisegnatoPer = state\.realSession\.id;/, 'il primo disegno per sessione si segna');
  assert.doesNotMatch(disegna, /if \(state\.realSession\.inRigiocata\) return;/, 'al contrario: rinviare anche il primo lascia la colonna della sessione di PRIMA');
});

test('B1-03 REVIEW: durante la storia solo i dati, il disegno una volta al confine; e il rinvio non passa a un altra sessione', () => {
  const review = corpo(APP, '  function updateRealReview(delta) {');
  assert.match(review, /state\.realSession\.reviewFiles\.set\(percorso,/, 'i dati restano esatti evento per evento');
  assert.match(review, /if \(state\.realSession\.inRigiocata\) reviewDaDisegnareDopoLaStoria = `real:\$\{percorso\}`;/);
  assert.match(APP, /if \(reviewDaDisegnareDopoLaStoria !== null\) \{[\s\S]{0,200}renderRealReviewList\(\);[\s\S]{0,80}renderReviewFile\(file\);/);
  assert.match(APP, /state\.realSession\.reviewFiles = new Map\(\);\s*reviewDaDisegnareDopoLaStoria = null;/);
});

test('B1-04 FINESTRA: i turni si contano sui figli DIRETTI, non con una ricerca nel sottoalbero', () => {
  const finestra = corpo(APP, '  function aggiornaFinestraReplay() {');
  assert.match(finestra, /for \(const figlio of colonna\.children\) if \(figlio\.classList\?\.contains\('talos-turn'\)\) turniMontati \+= 1;/);
  assert.doesNotMatch(finestra, /querySelectorAll\('\.talos-turn'\)/, 'al contrario: niente ricerca nel sottoalbero a ogni evento');
});

test('B1-05 VELO: OGNI sessione aperta da passaASessione si apre col velo — conclusa, interrotta e IN CORSO (A1-R3)', () => {
  const passa = corpo(APP, '  function passaASessione(');
  assert.match(passa, /state\.realSession\.deferHistoricalRendering = true;/);
  // ⛔ al contrario: legare il rinvio allo stato della sessione lasciava SENZA velo, e con l'ora del ridisegno, una sessione
  //   riaperta mentre lavora (A1-R3 / B-ORA-FALSA, riprodotto sul 4176: 0 campioni col velo su 40, «00:00» su un messaggio delle 23:59)
  assert.doesNotMatch(passa, /deferHistoricalRendering = impostazioniSessione\?\./, 'il rinvio non dipende da conclusa/interrotta');
  // e la ripresa di un giro resta senza rinvio (02/9: lì il rinvio bloccava lo streaming)
  assert.doesNotMatch(corpo(APP, '  async function resumeSession('), /deferHistoricalRendering = true/);
  // ⛔ e al confine della storia si esce dal rinvio: un giro ripreso («continua») si disegna dal vivo (banco BUG-24, B24-45)
  assert.match(APP, /name === 'talos\.fine-rigiocata'\) \{\s*state\.realSession\.inRigiocata = false;[\s\S]{0,400}state\.realSession\.deferHistoricalRendering = false;/);
});

test('B1-06 SEGMENTO: tre aggiornamenti nello stesso fotogramma fanno UNA misura, e senza rAF si misura subito', () => {
  const frame = [];
  const finestra = { requestAnimationFrame: (fn) => { frame.push(fn); return frame.length; } };
  const conta = { n: 0 };
  const metodo = SEGMENTO.match(/^  programmaAdatta\(\) \{[^]*?^  \}/m)?.[0];
  assert.ok(metodo, 'manca programmaAdatta in attivita-segmento.js');
  const programmaAdatta = vm.runInNewContext('(function ' + metodo.trim() + ')');
  const finto = { programmaAdatta };
  finto.card = { ownerDocument: { defaultView: finestra }, isConnected: true };
  finto.adatta = () => { conta.n += 1; };
  finto.programmaAdatta(); finto.programmaAdatta(); finto.programmaAdatta();
  assert.equal(conta.n, 0, 'nessuna misura sincrona');
  assert.equal(frame.length, 1, 'un fotogramma solo chiesto');
  frame.shift()();
  assert.equal(conta.n, 1);
  finto.programmaAdatta(); frame.shift()();
  assert.equal(conta.n, 2, 'dopo il fotogramma si può chiedere di nuovo');
  // al contrario: senza finestra (test, Node) si misura subito, come prima
  finto.card = { ownerDocument: null, isConnected: true };
  finto.programmaAdatta();
  assert.equal(conta.n, 3);
});
