/*
 * FE-070: il ponte dalla pagina principale al canale della bolla (Desktop 05/11 16:44, lacuna 1). La pagina principale ha già lo stream degli eventi: inoltra SOLO quelli del
 * computer use, letti per forma, e mai durante la rigiocata (un annuncio vecchio disegnerebbe un cursore e un bordo che non esistono più).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { creaPonteBolla } from '../../src/components/computer-use/ponte-bolla.js';
import { CANALE_BOLLA } from '../../src/components/computer-use/bolla-protocollo.js';

function scena() {
  const creati = [];
  const ponte = creaPonteBolla({ apri: (nome) => { const c = { nome, mandati: [], chiuso: false, postMessage(m) { c.mandati.push(m); }, close() { c.chiuso = true; } }; creati.push(c); return c; } });
  return { ponte, creati, mandati: () => creati.flatMap((c) => c.mandati) };
}
const custom = (name, value) => ({ type: 'CUSTOM', name, value });
const ANN = { finestra: { x: 0, y: 0, w: 800, h: 600 }, punto: { x: 10, y: 20 }, t0: 1 };

test('PON-01 inoltra gli eventi del computer use come li legge la bolla, e apre il canale solo al primo', () => {
  const { ponte, creati, mandati } = scena();
  ponte.evento({ type: 'TextMessageContent', delta: 'ciao' }, { inRigiocata: false });
  ponte.evento(custom('talos.process-output', {}), { inRigiocata: false });
  assert.equal(creati.length, 0, 'nessun canale finché non serve');
  ponte.evento(custom('talos.computer-use-annuncio', ANN), { inRigiocata: false });
  ponte.evento(custom('talos.computer-use-passo', { n: 1, fase: 'annuncio', bersaglio: 'Salva' }), { inRigiocata: false });
  ponte.evento(custom('talos.computer-use-esito', { motivo: 'fatto' }), { inRigiocata: false });
  assert.equal(creati.length, 1);
  assert.equal(creati[0].nome, CANALE_BOLLA);
  assert.deepEqual(mandati(), [
    { tipo: 'evento', evento: { name: 'talos.computer-use-annuncio', value: ANN } },
    { tipo: 'evento', evento: { name: 'talos.computer-use-passo', value: { n: 1, fase: 'annuncio', bersaglio: 'Salva' } } },
    { tipo: 'evento', evento: { name: 'talos.computer-use-esito', value: { motivo: 'fatto' } } },
  ]);
});

test('PON-02 per forma: nomi sconosciuti, valori non oggetto, rigiocata e canale assente non mandano niente', () => {
  const { ponte, mandati } = scena();
  ponte.evento(custom('talos.computer-use-inventato', {}), { inRigiocata: false });
  ponte.evento(custom('talos.computer-use-annuncio', 'x'), { inRigiocata: false });
  ponte.evento(null, { inRigiocata: false });
  ponte.evento(custom('talos.computer-use-annuncio', ANN), { inRigiocata: true });
  assert.deepEqual(mandati(), []);
  const senza = creaPonteBolla({ apri: () => { throw new Error('BroadcastChannel non c è'); } });
  assert.doesNotThrow(() => senza.evento(custom('talos.computer-use-annuncio', ANN), { inRigiocata: false }), 'senza canale la pagina principale non cade');
});

test('PON-03 la pagina principale passa ogni evento dal ponte dopo eventoPerLoSchermo, con la rigiocata', () => {
  const app = readFileSync(new URL('../../src/legacy/app.js', import.meta.url), 'utf8');
  assert.match(app, /import \{ creaPonteBolla \} from '\.\.\/components\/computer-use\/ponte-bolla\.js';/u);
  const corpo = app.slice(app.indexOf('function handleRealEvent(evento, generation) {'));
  const schermo = corpo.indexOf('evento = eventoPerLoSchermo(evento);');
  const ponte = corpo.indexOf('ponteBolla.evento(evento, { inRigiocata: state.realSession.inRigiocata === true, sessione: state.realSession.id });');
  assert.ok(schermo > 0 && ponte > schermo && ponte < corpo.indexOf("if (evento.type === 'CUSTOM' && evento.name === 'talos.process-output')"), 'subito dopo eventoPerLoSchermo, prima di ogni ritorno');
});

/*
 * FE-071 (Desktop 05/11 17:09): il segno e la bolla restano accesi quando la persona cambia chat mentre TALOS usa il computer in un'altra. La pagina principale ascolta una
 * sessione sola; il ponte, quando la chat visibile si lascia, apre UN ascolto suo su quella che sta usando il computer (`?after=` dell'ultima sequenza vista) e ne inoltra solo
 * gli eventi del computer use. Prima il segnale del server (`talos.computer-use-sessione`), poi la deduzione: un evento del computer use senza fine, o un giro senza fine.
 */
function banco() {
  const mandati = [];
  const ascolti = [];
  const sessioni = [];
  const ponte = creaPonteBolla({
    apri: () => ({ postMessage: (m) => (m.tipo === 'evento' ? mandati : sessioni).push(m), close() {} }),
    ascolta: (sessione, dopo, onEvento, onChiuso) => { const a = { sessione, dopo, onEvento, onChiuso, staccato: false }; ascolti.push(a); return () => { a.staccato = true; }; },
  });
  const aperti = () => ascolti.filter((a) => !a.staccato);
  const nomi = () => mandati.map((m) => m.evento.name);
  return { ponte, mandati, ascolti, aperti, nomi, sessioni };
}
const conSeq = (evento, n) => ({ ...evento, _sequenza: n });
const vivo = (ponte, sessione, evento) => ponte.evento(evento, { inRigiocata: false, sessione });
const storia = (ponte, sessione, evento) => ponte.evento(evento, { inRigiocata: true, sessione });
const RUN = (n) => conSeq({ type: 'RunStarted' }, n);
const FINE = (n) => conSeq({ type: 'RunFinished' }, n);
const ANNUNCIO = (n) => conSeq(custom('talos.computer-use-annuncio', ANN), n);

test('PON-04 lasciata la chat col computer use in corso, il ponte la ascolta da dove era e inoltra solo il computer use; il giro finito chiude', () => {
  const { ponte, ascolti, aperti, nomi } = banco();
  vivo(ponte, 'A', RUN(10));
  vivo(ponte, 'A', ANNUNCIO(11));
  ponte.lascia('A');
  assert.equal(ascolti.length, 1);
  assert.deepEqual([ascolti[0].sessione, ascolti[0].dopo], ['A', 11], 'dalla sequenza dopo l ultima vista');
  ascolti[0].onEvento(conSeq({ type: 'TextMessageContent', delta: 'x' }, 12));
  ascolti[0].onEvento(conSeq(custom('talos.computer-use-guarda', { finestra: ANN.finestra }), 13));
  ascolti[0].onEvento(ANNUNCIO(14));
  assert.deepEqual(nomi(), ['talos.computer-use-annuncio', 'talos.computer-use-guarda', 'talos.computer-use-annuncio']);
  ascolti[0].onEvento(FINE(15));
  assert.equal(aperti().length, 0, 'il giro è finito: niente più ascolto');
});

test('PON-05 la stessa sequenza dai due ascolti passa una volta; quando la chat torna visibile e dal vivo, l ascolto del ponte si chiude', () => {
  const { ponte, ascolti, aperti, mandati } = banco();
  vivo(ponte, 'A', RUN(1));
  vivo(ponte, 'A', ANNUNCIO(2));
  ponte.lascia('A');
  ascolti[0].onEvento(ANNUNCIO(2));
  ascolti[0].onEvento(ANNUNCIO(3));
  storia(ponte, 'A', ANNUNCIO(3));
  assert.equal(mandati.length, 2, 'la 2 e la 3 una volta sola');
  assert.equal(aperti().length, 1, 'durante la storia della pagina principale il ponte resta in ascolto');
  vivo(ponte, 'A', ANNUNCIO(3));
  assert.equal(aperti().length, 0, 'la pagina principale è di nuovo dal vivo su A');
  vivo(ponte, 'A', ANNUNCIO(4));
  assert.equal(mandati.length, 3);
});

test('PON-06 un giro in corso senza computer use si segue; mai più di un ascolto; un giro solo non scalza il computer use', () => {
  const { ponte, ascolti, aperti } = banco();
  vivo(ponte, 'A', RUN(1));
  ponte.lascia('A');
  assert.deepEqual(aperti().map((a) => a.sessione), ['A'], 'richiesta mandata e chat cambiata: il computer use può partire dopo');
  vivo(ponte, 'B', RUN(1));
  ponte.lascia('B');
  assert.deepEqual(aperti().map((a) => a.sessione), ['B'], 'a parità vince l ultima lasciata, e uno solo resta aperto');
  vivo(ponte, 'C', RUN(1));
  vivo(ponte, 'C', ANNUNCIO(2));
  ponte.lascia('C');
  assert.deepEqual(aperti().map((a) => a.sessione), ['C']);
  vivo(ponte, 'D', RUN(1));
  ponte.lascia('D');
  assert.deepEqual(aperti().map((a) => a.sessione), ['C'], 'il computer use in corso non si scalza');
  assert.equal(ascolti.length, 3);
});

test('PON-07 niente ascolto per un giro finito, per un computer use concluso a giro finito, per una chat mai vista o senza sequenze', () => {
  const { ponte, ascolti } = banco();
  vivo(ponte, 'A', RUN(1));
  vivo(ponte, 'A', FINE(2));
  ponte.lascia('A');
  vivo(ponte, 'B', RUN(1));
  vivo(ponte, 'B', ANNUNCIO(2));
  vivo(ponte, 'B', conSeq(custom('talos.computer-use-esito', { motivo: 'fatto' }), 3));
  vivo(ponte, 'B', FINE(4));
  ponte.lascia('B');
  ponte.lascia('mai-vista');
  vivo(ponte, 'E', { type: 'RunStarted' });
  ponte.lascia('E');
  assert.deepEqual(ascolti, [], 'senza sequenza non si sa da dove ripartire: si rischierebbe di ridisegnare la storia');
});

test('PON-08 storia della chat: un giro rimasto aperto vale (chat aperta a metà giro), ma niente si inoltra; un ascolto che non parte o cade non rompe niente', () => {
  const { ponte, ascolti, aperti, mandati } = banco();
  storia(ponte, 'A', RUN(5));
  storia(ponte, 'A', ANNUNCIO(6));
  assert.equal(mandati.length, 0, 'la storia non si disegna');
  ponte.lascia('A');
  assert.deepEqual([ascolti[0]?.sessione, ascolti[0]?.dopo], ['A', 6]);
  ascolti[0].onChiuso();
  assert.equal(aperti().length, 0);
  ascolti[0].onEvento(ANNUNCIO(7));
  assert.equal(mandati.length, 0, 'un ascolto chiuso non inoltra più');
  const rotto = creaPonteBolla({ apri: () => ({ postMessage() {}, close() {} }), ascolta: () => { throw new Error('EventSource non c è'); } });
  vivo(rotto, 'A', RUN(1));
  assert.doesNotThrow(() => rotto.lascia('A'));
  const b = banco();
  vivo(b.ponte, 'A', RUN(1));
  b.ponte.lascia('A');
  b.ponte.chiudi();
  assert.equal(b.aperti().length, 0, 'pagehide: si chiude tutto');
});

test('PON-09 il segnale del server viene prima: attivo apre l ascolto (anche per una chat mai vista, dalla fine della storia), spento lo chiude; per forma', () => {
  const { ponte, ascolti, aperti, mandati } = banco();
  vivo(ponte, 'V', RUN(1));
  ponte.segnale({ type: 'talos.computer-use-sessione', sessionId: 'V', attivo: true });
  assert.equal(ascolti.length, 0, 'la chat visibile la ascolta già la pagina principale');
  ponte.segnale({ type: 'talos.computer-use-sessione', sessionId: 'T', attivo: true });
  assert.deepEqual([ascolti[0].sessione, ascolti[0].dopo], ['T', 0], 'avviato dal telefono: dalla storia intera');
  ascolti[0].onEvento(ANNUNCIO(3));
  assert.equal(mandati.length, 0, 'prima della fine della storia è passato');
  ascolti[0].onEvento(custom('talos.fine-rigiocata', {}));
  ascolti[0].onEvento(ANNUNCIO(4));
  assert.equal(mandati.length, 1);
  vivo(ponte, 'B', RUN(1));
  vivo(ponte, 'B', ANNUNCIO(2));
  ponte.lascia('B');
  assert.deepEqual(aperti().map((a) => a.sessione), ['T'], 'il segnale vince sulla deduzione');
  ponte.segnale({ type: 'talos.computer-use-sessione', sessionId: 'T', attivo: false });
  assert.equal(aperti().filter((a) => a.sessione === 'T').length, 0);
  for (const sbagliato of [null, {}, { sessionId: '', attivo: true }, { sessionId: 'X', attivo: 'si' }, { sessionId: 7, attivo: true }]) ponte.segnale(sbagliato);
  assert.equal(ascolti.filter((a) => a.sessione === 'X').length, 0);
  /* Desktop 05/11 17:45: l'istantanea è UN oggetto `{sessionId|null, attivo}`. Una sessione alla volta, vince l'ultima accesa; `null` spento vuol dire nessuna. */
  const SEG = 'talos.computer-use-sessione';
  ponte.segnale({ type: SEG, sessionId: 'T', attivo: true });
  assert.deepEqual(aperti().map((a) => a.sessione), ['T']);
  for (const sbagliato of [{ type: SEG, sessionId: null, attivo: true }, { type: SEG, sessionId: null }, { type: SEG, attivo: false }]) ponte.segnale(sbagliato);
  assert.deepEqual(aperti().map((a) => a.sessione), ['T'], 'nessuna sessione accesa senza un id; senza `attivo` o senza `sessionId` non vale');
  ponte.segnale({ type: SEG, sessionId: null, attivo: false });
  assert.deepEqual(aperti(), [], 'nessuna sessione usa il computer: l ascolto si chiude');
  const due = banco();
  due.ponte.segnale({ type: SEG, sessionId: 'P', attivo: true });
  due.ponte.segnale({ type: SEG, sessionId: 'Q', attivo: true });
  assert.deepEqual(due.aperti().map((a) => a.sessione), ['Q'], 'due compiti: vince l ultima accesa');
  due.ponte.segnale({ type: SEG, sessionId: 'P', attivo: false });
  assert.deepEqual(due.aperti().map((a) => a.sessione), ['Q'], 'spegnere un altra sessione non spegne quella accesa');
  due.aperti()[0].onChiuso();
  assert.deepEqual(due.aperti(), [], 'caduto l ascolto, non si riapre da solo');
  due.ponte.segnale({ type: SEG, sessionId: 'Q', attivo: true });
  assert.deepEqual(due.aperti().map((a) => a.sessione), ['Q'], 'un nuovo segnale acceso lo riapre');
  due.ponte.segnale({ type: SEG, sessionId: 'Q', attivo: false });
  assert.deepEqual(due.aperti(), [], 'spenta Q non si torna a P: il segnale nomina una sessione sola');
});

test('PON-10 la pagina principale collega il ponte: sessione in ogni evento, lascia prima di chiudere lo stream, il segnale dal flusso del remoto, chiudi a pagehide', () => {
  const app = readFileSync(new URL('../../src/legacy/app.js', import.meta.url), 'utf8');
  assert.match(app, /const ponteBolla = creaPonteBolla\(\{ ascolta: apriFlussoComputerUse \}\);/u);
  assert.match(app, /ponteBolla\.evento\(evento, \{ inRigiocata: state\.realSession\.inRigiocata === true, sessione: state\.realSession\.id \}\);/u);
  assert.match(app, /function apriFlussoComputerUse\(sessionId, dopo, onEvento, onChiuso\) \{[\s\S]{0,600}?\/api\/v1\/sessions\/\$\{encodeURIComponent\(sessionId\)\}\/events/u);
  const cambio = app.slice(app.indexOf('function nuovaGenerazioneSessione('));
  const lascia = cambio.indexOf('if (!continua && state.realSession.id) ponteBolla.lascia(state.realSession.id);');
  assert.ok(lascia > 0 && lascia < cambio.indexOf('state.realSession.eventSource.close();'), 'lascia prima di chiudere lo stream della chat');
  assert.match(app, /else if \(e\?\.type === 'talos\.computer-use-sessione'\) \{\s*ponteBolla\.segnale\(e\);/u);
  assert.match(app, /window\.addEventListener\('pagehide', \(\) => ponteBolla\.chiudi\(\)\);/u);
});

test('PON-11 la bolla sa di quale chat è il computer use: prima del primo evento di una sessione diversa il ponte manda «sessione», così le risposte non vanno alla chat visibile', () => {
  const { ponte, ascolti, sessioni, mandati } = banco();
  vivo(ponte, 'A', RUN(1));
  vivo(ponte, 'A', ANNUNCIO(2));
  vivo(ponte, 'A', ANNUNCIO(3));
  assert.deepEqual(sessioni, [{ tipo: 'sessione', sessionId: 'A' }], 'una volta sola per la stessa sessione');
  ponte.lascia('A');
  vivo(ponte, 'B', RUN(1));
  ascolti[0].onEvento(ANNUNCIO(4));
  assert.deepEqual(sessioni.map((m) => m.sessionId), ['A'], 'la chat visibile B non cambia la sessione della bolla');
  vivo(ponte, 'B', ANNUNCIO(2));
  assert.deepEqual(sessioni.map((m) => m.sessionId), ['A', 'B']);
  assert.equal(mandati.length, 4);
});

test('PON-12 segnale spento: il server ha detto che il computer use è finito, la deduzione non riapre la stessa chat', () => {
  const { ponte, ascolti, aperti } = banco();
  ponte.segnale({ type: 'talos.computer-use-sessione', sessionId: 'T', attivo: true });
  ascolti[0].onEvento(custom('talos.fine-rigiocata', {}));
  ascolti[0].onEvento(ANNUNCIO(1));
  ponte.segnale({ type: 'talos.computer-use-sessione', sessionId: 'T', attivo: false });
  assert.equal(aperti().length, 0);
  assert.equal(ascolti.length, 1, 'nessun ascolto riaperto per deduzione');
});

/* Revisione 05/11 sera, difetto 8b: la mappa `chat` cresceva di una voce per ogni chat vista e non perdeva mai niente. Una chat che finisce (lasciata a giro chiuso, giro
   finito sull'ascolto del ponte, segnale spento) si dimentica, se non è la visibile, quella ascoltata o quella segnalata. Fonti: MDN `Map.prototype.delete`; Hermes
   `gateway/run_adapters.py:561` toglie la sessione finita dalla sua mappa (`inflight.pop(session_id, None)`).
   Revisione delle cure piccole, difetto 1: riaperta, una chat dimenticata riprende dalla sua ultima sequenza (ne restano al massimo 50, PON-15), non dalla storia intera:
   dalla storia non si inoltra niente fino a `talos.fine-rigiocata`, e gli eventi del giro nuovo arrivati prima si perdevano. */
test('PON-13 (difetto 8b) una chat finita si dimentica: lasciata a giro chiuso, giro finito sull ascolto, segnale spento; mai la visibile, l ascoltata o la segnalata', () => {
  const SEG = 'talos.computer-use-sessione';
  const { ponte, ascolti, aperti, nomi } = banco();
  for (let i = 0; i < 50; i += 1) {
    const id = `C${i}`;
    vivo(ponte, id, RUN(1));
    vivo(ponte, id, ANNUNCIO(2));
    vivo(ponte, id, FINE(3));
    ponte.lascia(id);
  }
  assert.equal(ponte.ricordate(), 0, 'cinquanta chat aperte e lasciate a giro chiuso: nessuna resta');
  // lasciata a metà giro resta (il ponte la segue da dove era), il giro finito sull ascolto la toglie
  vivo(ponte, 'A', RUN(10));
  vivo(ponte, 'A', ANNUNCIO(11));
  ponte.lascia('A');
  assert.deepEqual([aperti().length, ascolti.at(-1).dopo], [1, 11], 'segue A dalla sequenza vista');
  assert.equal(ponte.ricordate(), 1);
  ascolti.at(-1).onEvento(FINE(12));
  assert.deepEqual(aperti(), [], 'giro finito: niente ascolto');
  assert.equal(ponte.ricordate(), 0, 'e A si dimentica');
  // revisione delle cure piccole, difetto 4: lo stesso per un giro finito in errore sull ascolto
  vivo(ponte, 'B', RUN(20));
  ponte.lascia('B');
  assert.deepEqual([aperti().length, ascolti.at(-1).sessione, ponte.ricordate()], [1, 'B', 1], 'segue B a metà giro');
  ascolti.at(-1).onEvento(conSeq({ type: 'RunError' }, 21));
  assert.deepEqual(aperti(), [], 'giro in errore: niente ascolto');
  assert.equal(ponte.ricordate(), 0, 'e B si dimentica');
  // la visibile non si dimentica mai, nemmeno a giro chiuso
  vivo(ponte, 'V', RUN(1));
  vivo(ponte, 'V', FINE(2));
  assert.equal(ponte.ricordate(), 1, 'la visibile resta');
  // segnale: la segnalata resta finché è accesa; spenta e lasciata si dimentica, e riaperta riprende dalla sua ultima sequenza
  ponte.lascia('V');
  ponte.segnale({ type: SEG, sessionId: 'S', attivo: true });
  ascolti.at(-1).onEvento(custom('talos.fine-rigiocata', {}));
  ascolti.at(-1).onEvento(ANNUNCIO(7));
  assert.equal(ponte.ricordate(), 1, 'la segnalata resta');
  ponte.segnale({ type: SEG, sessionId: 'S', attivo: false });
  assert.equal(ponte.ricordate(), 0, 'spenta: si dimentica');
  const prima = nomi().length;
  ponte.segnale({ type: SEG, sessionId: 'S', attivo: true });
  assert.equal(ascolti.at(-1).dopo, 7, 'riaperta: dalla sua ultima sequenza, non dalla storia intera');
  ascolti.at(-1).onEvento(ANNUNCIO(7));
  assert.equal(nomi().length, prima, 'il doppione non si inoltra');
  ascolti.at(-1).onEvento(ANNUNCIO(8));
  assert.equal(nomi().length, prima + 1, 'il giro nuovo si inoltra subito, senza aspettare la fine della rigiocata');
});

/* Revisione delle cure piccole, difetto 1: le posizioni delle chat dimenticate stanno in un ricordo di 50 voci, la più vecchia esce per prima (MDN `Map`: le chiavi si
   iterano in ordine d'inserimento). Una chat dimenticata, rivista dal vivo o risegnalata, riprende da lì e non perde nessun evento del giro nuovo; oltre le 50 riparte
   dalla storia intera, come prima. */
test('PON-15 (difetto 1) una chat dimenticata riprende dalla sua ultima sequenza; il ricordo tiene le ultime 50, la più vecchia esce per prima', () => {
  const SEG = 'talos.computer-use-sessione';
  const { ponte, ascolti, nomi } = banco();
  // la sonda Q1 della revisione: A vista fino alla 40, lasciata a giro chiuso, poi il server segnala un giro nuovo
  vivo(ponte, 'A', RUN(39));
  vivo(ponte, 'A', FINE(40));
  ponte.lascia('A');
  assert.equal(ponte.ricordate(), 0, 'A si dimentica');
  ponte.segnale({ type: SEG, sessionId: 'A', attivo: true });
  assert.equal(ascolti.at(-1).dopo, 40, 'riprende dalla 40');
  const prima = nomi().length;
  ascolti.at(-1).onEvento(FINE(40));
  ascolti.at(-1).onEvento(RUN(41));
  ascolti.at(-1).onEvento(ANNUNCIO(42));
  assert.equal(nomi().length, prima + 1, 'l annuncio 42 del giro nuovo arriva alla bolla subito');
  ascolti.at(-1).onEvento(FINE(43));
  ponte.segnale({ type: SEG, sessionId: 'A', attivo: false });
  assert.equal(ponte.ricordate(), 0);
  // rivista dal vivo dalla pagina principale: la sua storia sotto la 43 è doppione, e il giro nuovo passa
  storia(ponte, 'A', ANNUNCIO(42));
  vivo(ponte, 'A', ANNUNCIO(44));
  assert.equal(nomi().length, prima + 2, 'solo il 44, il 42 è già passato');
  vivo(ponte, 'A', FINE(45));
  ponte.lascia('A');
  // il tetto: 50 chat dimenticate dopo A, e A è la più vecchia; la cinquantesima più recente resta
  for (let i = 0; i < 50; i += 1) {
    vivo(ponte, `D${i}`, RUN(1));
    vivo(ponte, `D${i}`, FINE(2));
    ponte.lascia(`D${i}`);
  }
  assert.equal(ponte.ricordate(), 0);
  ponte.segnale({ type: SEG, sessionId: 'D0', attivo: true });
  assert.equal(ascolti.at(-1).dopo, 2, 'D0 è fra le ultime 50: riprende dalla 2');
  ponte.segnale({ type: SEG, sessionId: 'A', attivo: true });
  assert.equal(ascolti.at(-1).dopo, 0, 'A è uscita dal ricordo: dalla storia intera, come una chat mai vista');
  const ora = nomi().length;
  ascolti.at(-1).onEvento(ANNUNCIO(42));
  assert.equal(nomi().length, ora, 'e la sua storia non si inoltra');
});

/* Revisione del secondo giro di cure, difetto 3: riaperta, una chat esce dal ricordo (`scheda`, `posizioni.delete(id)`), e dimenticata di nuovo rientra in coda come la
   più recente. `Map.set` su una chiave che c'è già cambia il valore ma la lascia al suo posto: senza il `delete`, A terrebbe il posto vecchio e uscirebbe prima di chat
   dimenticate dopo di lei. Fonti: MDN `Map.prototype.delete`; Hermes `gateway/run.py:3818`, `cached_sources.move_to_end(session_key)` dopo aver riscritto la voce. */
test('PON-15b (difetto 3) dimenticata di nuovo, una chat torna in coda come la più recente, non al suo posto vecchio', () => {
  const SEG = 'talos.computer-use-sessione';
  const { ponte, ascolti } = banco();
  vivo(ponte, 'A', RUN(1));
  vivo(ponte, 'A', FINE(2));
  ponte.lascia('A');
  vivo(ponte, 'B', RUN(1));
  vivo(ponte, 'B', FINE(2));
  ponte.lascia('B');
  vivo(ponte, 'A', RUN(3));
  vivo(ponte, 'A', FINE(4));
  ponte.lascia('A');
  assert.equal(ponte.ricordate(), 0, 'A e B dimenticate');
  for (let i = 0; i < 49; i += 1) {
    vivo(ponte, `E${i}`, RUN(1));
    vivo(ponte, `E${i}`, FINE(2));
    ponte.lascia(`E${i}`);
  }
  ponte.segnale({ type: SEG, sessionId: 'A', attivo: true });
  assert.equal(ascolti.at(-1).dopo, 4, 'A è fra le ultime 50 dimenticate: riprende dalla 4');
  ponte.segnale({ type: SEG, sessionId: 'B', attivo: true });
  assert.equal(ascolti.at(-1).dopo, 0, 'B è la più vecchia ed è uscita: dalla storia intera');
});

/* Revisione delle cure piccole, difetto 2: il server passa il segnale da Y a X senza spegnere Y. Y, se ha finito, si dimentica al passaggio come quando la si spegne;
   a giro aperto resta (sonda Q3c della revisione). */
test('PON-16 (difetto 2) il segnale passa da Y a X senza spegnere Y: Y finita si dimentica, a metà giro resta', () => {
  const SEG = 'talos.computer-use-sessione';
  const { ponte, ascolti } = banco();
  vivo(ponte, 'Y', RUN(1));
  ponte.lascia('Y');
  ponte.segnale({ type: SEG, sessionId: 'Y', attivo: true });
  ascolti.at(-1).onEvento(FINE(2));
  ponte.segnale({ type: SEG, sessionId: 'Y', attivo: true });
  assert.equal(ponte.ricordate(), 1, 'la stessa, riaccesa, resta');
  ponte.segnale({ type: SEG, sessionId: 'X', attivo: true });
  assert.equal(ponte.ricordate(), 1, 'Y finita si dimentica al passaggio: resta solo X');
  ascolti.at(-1).onEvento(custom('talos.fine-rigiocata', {}));
  ascolti.at(-1).onEvento(FINE(5));
  ponte.segnale({ type: SEG, sessionId: 'X', attivo: false });
  assert.equal(ponte.ricordate(), 0, 'Q3c: spenta anche X, nessuna resta');
  ponte.segnale({ type: SEG, sessionId: 'Y', attivo: true });
  assert.equal(ascolti.at(-1).dopo, 2, 'e Y, risegnalata, riprende dalla 2');
  const b = banco();
  vivo(b.ponte, 'Y', RUN(1));
  b.ponte.lascia('Y');
  b.ponte.segnale({ type: SEG, sessionId: 'Y', attivo: true });
  b.ponte.segnale({ type: SEG, sessionId: 'X', attivo: true });
  assert.equal(b.ponte.ricordate(), 2, 'Y a metà giro resta, accanto a X');
});

/* Difetto 8b, le tre guardie di `dimentica` una per una: un ascolto che non parte lascia la chat senza ascolto, e allora la tengono solo il giro aperto e il segnale;
   la visibile si tiene anche quando il server la spegne. */
/* Revisione delle cure piccole, difetto 5: `lascia` con l ascolto del ponte aperto sulla stessa chat, tornata visibile e ancora in rigiocata. Finita, si dimentica;
   a metà giro resta, e l ascolto prosegue senza riaprirsi. (Il mutante r6, `dimentica` prima di `scegli`, qui non cambia l esito: vedi l esito della cura.) */
test('PON-17 (difetto 5) lascia con l ascolto del ponte sulla stessa chat in rigiocata: finita si dimentica, a metà giro resta', () => {
  const { ponte, ascolti, aperti } = banco();
  vivo(ponte, 'V', RUN(1));
  ponte.lascia('V');
  assert.deepEqual([aperti().length, ascolti.at(-1).sessione], [1, 'V'], 'il ponte segue V');
  storia(ponte, 'V', RUN(1));
  assert.equal(aperti().length, 1, 'tornata visibile in rigiocata: l ascolto del ponte resta');
  ponte.lascia('V');
  assert.deepEqual([aperti().length, ascolti.length, ponte.ricordate()], [1, 1, 1], 'a metà giro resta, lo stesso ascolto');
  storia(ponte, 'V', RUN(1));
  ascolti.at(-1).onEvento(FINE(2));
  assert.deepEqual([aperti().length, ponte.ricordate()], [0, 1], 'giro finito sull ascolto: la visibile resta');
  ponte.lascia('V');
  assert.deepEqual([aperti().length, ponte.ricordate()], [0, 0], 'lasciata finita: si dimentica');
});

test('PON-14 (difetto 8b) si tengono la chat a metà giro e la segnalata anche senza ascolto, e la visibile spenta dal server', () => {
  const SEG = 'talos.computer-use-sessione';
  const senzaAscolto = () => creaPonteBolla({ apri: () => ({ postMessage() {}, close() {} }), ascolta: () => { throw new Error('EventSource non c è'); } });
  const g = senzaAscolto();
  vivo(g, 'A', RUN(1));
  g.lascia('A');
  assert.equal(g.ricordate(), 1, 'giro aperto: resta, anche se l ascolto non è partito');
  const y = senzaAscolto();
  vivo(y, 'Y', RUN(1));
  vivo(y, 'Y', FINE(2));
  y.segnale({ type: SEG, sessionId: 'Y', attivo: true });
  y.lascia('Y');
  assert.equal(y.ricordate(), 1, 'segnalata: resta, e con lei il segno che il suo ascolto è caduto');
  const { ponte, aperti } = banco();
  vivo(ponte, 'V', RUN(1));
  ponte.segnale({ type: SEG, sessionId: 'V', attivo: true });
  ponte.segnale({ type: SEG, sessionId: 'V', attivo: false });
  assert.deepEqual(aperti(), []);
  assert.equal(ponte.ricordate(), 1, 'la visibile resta anche spenta dal server');
});
