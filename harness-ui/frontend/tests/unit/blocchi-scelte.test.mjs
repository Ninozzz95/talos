/*
 * Scena 5 (FE-086, gruppo G-G del ledger UI generativa 05/11/2026): le opzioni scritte dal modello, un clic = un messaggio.
 * CARATTERIZZAZIONE: queste prove fissano ciò che `scelte.js`, `modulo.js`, `azione.js` e `aggancio.js` fanno già, passando dalla porta
 * vera della chat (`creaAggancioBlocchi`, quella che `legacy/app.js` monta), non dal disegnatore da solo.
 *
 * Il confronto, letto nel codice (Hermes, clone `hermes-agent-2026-11-01`, 05/11/2026):
 *   - `gateway/session_pending_controls.py:70-71`: una seconda risposta alla stessa domanda torna `already_resolved` — una domanda
 *     si risponde una volta, per id;
 *   - `ui-tui/src/gatewayTypes.ts:394-395`: le scelte sono «generation-bound», legate alla generazione che le ha prodotte — una
 *     risposta rigenerata ha domande nuove (qui: UIG-5.3).
 * Ricerca del 05/11/2026: Cognigy Webchat v3 spegne le risposte rapide dopo il clic («Disable Quick Reply buttons after click»),
 * Messenger le fa sparire. Qui il blocco resta nella conversazione come storia, spento e con la scelta segnata (`aria-pressed`).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { documento, clic, orologio, spento } from './aiuto-dom-blocchi.mjs';
import { creaVisteDelBlocco } from '../../src/components/blocchi/viste.js';
import { impostaLingua } from '../../src/components/lingua.js';
import { creaAggancioBlocchi, impronta, EVENTO_VERSIONE_DEL_BLOCCO } from '../../src/components/blocchi/aggancio.js';
import { disegnaBlocco, statoDelBlocco } from '../../src/components/blocchi/guscio.js';
import { EVENTO_AZIONE } from '../../src/components/blocchi/azione.js';
import { leggi } from '../../../src/blocchi/lettore.mjs';

impostaLingua('it');
const fixture = (n) => readFileSync(new URL(`../../../tests/fixtures/blocchi/${n}`, import.meta.url), 'utf8').trim();
const SCELTE = fixture('03-scelte.txt');
const MODULO = fixture('04-modulo.txt');
const MENU = '#menuDelBlocco';

function pagina({ sessione = 's1', azioni } = {}) {
  const document = documento();
  const inviati = [];
  let corrente = sessione;
  /* i messaggi della chat per id, come `state.realSession.messageElements` in `legacy/app.js:3507` */
  const messaggi = new Map();
  const a = creaAggancioBlocchi({
    document, sessione: () => corrente, timer: orologio().timer,
    consegna: (testo, azione) => inviati.push({ testo, azione }),
    elementoDelMessaggio: (id) => messaggi.get(id) ?? null,
    ...(azioni ? { azioni } : {}),
  });
  /* un blocco dentro il suo messaggio (un <article> nella pagina) */
  const inMessaggio = (id, nodo) => {
    let m = messaggi.get(id);
    if (!m) { m = document.createElement('article'); messaggi.set(id, m); document.body.append(m); }
    m.append(nodo);
    return nodo;
  };
  return { a, document, inviati, messaggi, inMessaggio, passaA: (s) => { corrente = s; } };
}
/* G-B3: l'evento v1 che dà il nome al blocco, legato al suo messaggio (`talos.blocco.versione`, arriva DOPO il testo) */
const v1 = (nome, messaggio, sorgente = SCELTE) => ({
  type: 'CUSTOM', name: EVENTO_VERSIONE_DEL_BLOCCO,
  value: { blocco: nome, versione: 1, sorgente, messaggio, posizione: 0, quando: '2026-11-06T00:00:00.000Z' },
});
/* il blocco nato vivo nel messaggio `id`: arriva a pezzi, poi si chiude (il recinto vivo non porta `nome=`) */
const arrivaVivo = (p, id, testo = SCELTE) => { p.inMessaggio(id, p.a.blocco(testo.slice(0, 20), false)); return p.a.blocco(testo, true); };
const sezioneIn = (p, id) => p.messaggi.get(id).querySelectorAll('section').find((x) => x.classList.contains('gu'));
const opzioni = (nodo) => nodo.querySelectorAll('.gu-scelte button');
const opzione = (nodo, testo) => opzioni(nodo).find((b) => b.dataset.scelta === testo);
const invio = (b) => {
  /* nel browser Invio su un <button> col fuoco arriva come `click` (comportamento di attivazione HTML): qui si manda il keydown e poi
     il clic che il browser sintetizza. Se un domani qualcuno ascoltasse anche `keydown`, il doppio messaggio si vedrebbe qui. */
  const giu = Object.assign(new Event('keydown', { bubbles: true, cancelable: true }), { key: 'Enter' });
  b.dispatchEvent(giu);
  if (!giu.defaultPrevented) clic(b);
};
const destro = () => Object.assign(new Event('contextmenu', { bubbles: true, cancelable: true }), { clientX: 120, clientY: 80 });
const stati = (nodo) => opzioni(nodo).map((b) => [b.dataset.scelta, spento(b), b.getAttribute('aria-pressed')]);
const libero = (nodo) => opzioni(nodo).every((b) => !spento(b)) && !opzioni(nodo).some((b) => b.hasAttribute('aria-pressed'));

test('UIG-5.1 due clic veloci, e clic più Invio, fanno UN messaggio solo con UNA chiave', () => {
  const { a, document, inviati } = pagina();
  const nodo = a.blocco(SCELTE, true);
  document.body.append(nodo);
  clic(opzione(nodo, 'Continua'));
  clic(opzione(nodo, 'Continua'));
  clic(opzione(nodo, 'Fermati qui'));
  invio(opzione(nodo, 'Continua'));
  assert.equal(inviati.length, 1, 'il primo gesto vince');
  const [{ testo, azione }] = inviati;
  assert.equal(testo, 'Continua', 'il testo mandato è quello del pulsante');
  assert.equal(azione.evento, EVENTO_AZIONE);
  assert.equal(azione.chiave, `s1:${impronta(SCELTE)}#prossimo`, 'la chiave: conversazione, messaggio e blocco — non il valore');
  assert.deepEqual(stati(nodo), [['Continua', true, 'true'], ['Fermati qui', true, 'false']], 'spento, la scelta segnata');

  /* Invio come PRIMO gesto: lo stesso, uno solo */
  const due = pagina();
  const n2 = due.a.blocco(SCELTE, true);
  invio(opzione(n2, 'Fermati qui'));
  clic(opzione(n2, 'Fermati qui'));
  assert.deepEqual(due.inviati.map((x) => x.testo), ['Fermati qui']);

  /* il blocco nato VIVO (arriva a pezzi, poi si chiude): stessa regola, e la stessa chiave del blocco ridisegnato dopo una ricarica */
  const tre = pagina();
  tre.a.blocco(SCELTE.slice(0, 20), false);
  const n3 = tre.a.blocco(SCELTE, true);
  clic(opzione(n3, 'Continua'));
  clic(opzione(n3, 'Continua'));
  assert.equal(tre.inviati.length, 1);
  assert.equal(tre.inviati[0].azione.chiave, azione.chiave);
});

test('UIG-5.1b due viste dello stesso blocco (in linea e a lato) condividono il gesto: un messaggio solo', () => {
  const document = documento();
  const inviati = [];
  const r = leggi(SCELTE);
  const stato = statoDelBlocco();
  const opz = { document, stato, origine: 'o1', quandoAgisce: (az) => inviati.push(az) };
  const inLinea = disegnaBlocco(r, opz);
  const aLato = disegnaBlocco(r, { ...opz });
  clic(opzione(aLato, 'Continua'));
  clic(opzione(inLinea, 'Fermati qui'));
  assert.equal(inviati.length, 1);
  assert.equal(inviati[0].valore, 'Continua');
});

test('UIG-5.1c il modulo: due invii veloci fanno un messaggio solo; una scelta non apre nessuna tastiera', () => {
  const { a, document, inviati } = pagina();
  const nodo = a.blocco(MODULO, true);
  document.body.append(nodo);
  clic(nodo.querySelector('[data-valore="Treno"]'));
  const cerca = nodo.querySelector('[data-invia-modulo]');
  clic(cerca);
  clic(cerca);
  invio(cerca);
  assert.equal(inviati.length, 1);
  assert.match(inviati[0].testo, /Treno/u);
  assert.equal(nodo.querySelectorAll('input').every((i) => i.disabled), true, 'dopo l’invio i campi sono spenti');

  /* niente tastiera sul tocco: un blocco `scelte` non ha campi, e un clic non sposta il fuoco su un campo di testo */
  const due = pagina();
  const s = due.a.blocco(SCELTE, true);
  due.document.body.append(s);
  assert.equal(s.querySelectorAll('input').length + s.querySelectorAll('textarea').length + s.querySelectorAll('[contenteditable]').length, 0);
  clic(opzione(s, 'Continua'));
  assert.equal(due.document.activeElement, null, 'nessun fuoco spostato dal clic: la tastiera del telefono non sale');
});

test('UIG-5.2 dopo una ricarica la scelta resta spenta, ricostruita dall’evento salvato', () => {
  const prima = pagina();
  const n1 = prima.a.blocco(SCELTE, true);
  clic(opzione(n1, 'Fermati qui'));
  const { chiave, tipo } = prima.inviati[0].azione;

  /* la ricarica come la fa la chat: la rigiocata ridisegna il blocco, poi arriva il messaggio della persona con la sua bolla (col
     valore) e poi l'evento `talos.blocco.azione.v1` del giornale (senza valore) */
  const dopo = pagina();
  const nodo = dopo.a.blocco(SCELTE, true);
  dopo.document.body.append(nodo);
  assert.equal(spento(opzione(nodo, 'Fermati qui')), false, 'prima della rigiocata del gesto il blocco è ancora libero');
  dopo.a.spegni(chiave, { tipo, valore: 'Fermati qui' });
  dopo.a.spegni(chiave, { tipo });
  const ora = dopo.document.body.childNodes.at(-1);
  assert.notEqual(ora, nodo, 'ridisegnato spento');
  assert.deepEqual(stati(ora), [['Continua', true, 'false'], ['Fermati qui', true, 'true']], 'spento, e la scelta fatta resta segnata');
  clic(opzione(ora, 'Continua'));
  assert.equal(dopo.inviati.length, 0, 'la rigiocata non rimanda niente');
  /* un ridisegno successivo dello stesso messaggio resta spento. Cura 288 (decisione 277 per tutte le chat): un ridisegno TOGLIE il
     blocco vecchio prima di disegnare il nuovo (`legacy/app.js`, `renderizzaMarkdownIncrementale`: `nodo.remove()` della coda, poi
     `renderizzaMarkdownSemplice`); un gemello ancora sulla pagina è un altro messaggio, e dopo il gesto è libero (prova R12) */
  ora.remove();
  const ancora = dopo.a.blocco(SCELTE, true);
  assert.deepEqual(stati(ancora), stati(ora));

  /* solo l'evento del giornale (la bolla della persona fuori dalla rigiocata): il blocco è spento lo stesso */
  const soloEvento = pagina();
  soloEvento.a.spegni(chiave, { tipo });
  const n3 = soloEvento.a.blocco(SCELTE, true);
  assert.equal(opzioni(n3).every(spento), true);
  clic(opzione(n3, 'Continua'));
  assert.equal(soloEvento.inviati.length, 0);

  /* il modulo: stessa ricostruzione */
  const m1 = pagina();
  const nm = m1.a.blocco(MODULO, true);
  clic(nm.querySelector('[data-valore="Aereo"]'));
  clic(nm.querySelector('[data-invia-modulo]'));
  assert.equal(m1.inviati.length, 1);
  const m2 = pagina();
  m2.a.spegni(m1.inviati[0].azione.chiave, { tipo: m1.inviati[0].azione.tipo });
  const nm2 = m2.a.blocco(MODULO, true);
  assert.equal(spento(nm2.querySelector('[data-invia-modulo]')), true);
  clic(nm2.querySelector('[data-invia-modulo]'));
  assert.equal(m2.inviati.length, 0);
});

test('UIG-5.3 un messaggio rigenerato ha opzioni nuove: il blocco spento del vecchio non si attacca', () => {
  const p = pagina({ sessione: 's1' });
  const vecchio = p.a.blocco(SCELTE, true);
  p.document.body.append(vecchio);
  clic(opzione(vecchio, 'Continua'));
  const chiaveVecchia = p.inviati[0].azione.chiave;

  /* «Riprova» sul PC è un RAMO: `avviaRamo` in `legacy/app.js` fa `POST …/fork` e la chat passa alla sessione nuova. Lo stesso testo,
     parola per parola, nella sessione del ramo è un altro blocco */
  p.passaA('s1-ramo');
  const rigenerato = p.a.blocco(SCELTE, true);
  p.document.body.append(rigenerato);
  assert.equal(opzioni(rigenerato).every((b) => !spento(b)), true, 'opzioni fresche');
  assert.equal(opzioni(rigenerato).some((b) => b.hasAttribute('aria-pressed')), false, 'nessuna scelta segnata ereditata');
  /* l'evento del vecchio gesto (arriva ancora, dalla rigiocata) non spegne il nuovo */
  p.a.spegni(chiaveVecchia, { tipo: 'scelte', valore: 'Continua' });
  assert.equal(p.document.body.childNodes.at(-1), rigenerato, 'non ridisegnato');
  clic(opzione(rigenerato, 'Fermati qui'));
  assert.equal(p.inviati.length, 2);
  assert.notEqual(p.inviati[1].azione.chiave, chiaveVecchia, 'una chiave nuova');

  /* rigenerato con opzioni riscritte dal modello (testo diverso), nella stessa sessione: libero anche lui */
  const q = pagina();
  clic(opzione(q.a.blocco(SCELTE, true), 'Continua'));
  const nuovo = q.a.blocco(SCELTE.replace('Fermati qui', 'Rifai da capo'), true);
  assert.equal(opzioni(nuovo).every((b) => !spento(b)), true);
  clic(opzione(nuovo, 'Rifai da capo'));
  assert.equal(q.inviati.length, 2);
  /* AL CONTRARIO: il messaggio vecchio, ridisegnato, resta spento */
  assert.equal(opzioni(q.a.blocco(SCELTE, true)).every(spento), true);
});

/*
 * G-G2 (06/11/2026): la chiave del gesto passa al NOME del blocco più il suo messaggio — `nome:bN@<messaggio>#<id>` — quando il nome
 * c'è (il recinto salvato porta `nome=bN`; il blocco vivo lo prende dal suo v1). La forma (`FORMA-BLOCCO-AGGIORNA-E-RISCRITTURA-
 * 2026-11-05.md` §1) dice «b1, b2… mai riusati, stabili fra ricarica, ramo e rigenerazione»: un testo uguale in un messaggio nuovo è
 * un altro blocco (5.3b), e nel ramo il blocco della madre resta lui (5.3c), perché il v1 rigiocato porta l'id del messaggio della madre.
 * Il blocco senza nome (giornale vecchio) tiene la chiave di prima, `sessione:impronta#id`. Hermes: una risposta per domanda, per id
 * (`gateway/session_pending_controls.py:70-71`); le scelte legate alla generazione che le ha prodotte (`ui-tui/src/gatewayTypes.ts:394-395`).
 */
test('UIG-5.2b la chiave vecchia (sessione:impronta#id) si legge ancora, e spegne UN blocco col nome solo', () => {
  const p = pagina();
  const vecchia = `s1:${impronta(SCELTE)}#prossimo`;
  /* un gesto fatto prima di G-G2, rigiocato dal giornale: lo stesso testo in due messaggi col nome (salvati, recinto `nome=bN`) */
  p.a.spegni(vecchia, { tipo: 'scelte', valore: 'Continua' });
  const primo = p.a.blocco(SCELTE, true, 'nome=b1');
  assert.deepEqual(stati(primo), [['Continua', true, 'true'], ['Fermati qui', true, 'false']], 'il primo nome lo prende');
  const secondo = p.a.blocco(SCELTE, true, 'nome=b2');
  assert.equal(libero(secondo), true, 'la chiave vecchia non spegne un secondo nome');
  assert.deepEqual(stati(p.a.blocco(SCELTE, true, 'nome=b1')), stati(primo), 'il ridisegno del primo resta spento: il reclamo è stabile');
  assert.equal(opzioni(p.a.blocco(SCELTE, true)).every(spento), true, 'il blocco senza nome legge la chiave vecchia come prima');
  clic(opzione(secondo, 'Fermati qui'));
  assert.equal(p.inviati.length, 1);
  assert.equal(p.inviati[0].azione.chiave, 'nome:b2@~s1#prossimo', 'un nome senza il suo v1: la chiave porta la conversazione');
  /* AL CONTRARIO: un'altra conversazione non legge la chiave vecchia di s1 */
  p.passaA('s2');
  assert.equal(libero(p.a.blocco(SCELTE, true, 'nome=b1')), true);
});

test('UIG-5.3b lo stesso blocco riscritto identico in un messaggio NUOVO della stessa chat è un blocco nuovo', () => {
  /* dopo una ricarica: i recinti salvati portano il nome, i v1 rigiocati arrivano dopo il testo */
  const p = pagina();
  const uno = p.inMessaggio('m1', p.a.blocco(SCELTE, true, 'nome=b1'));
  p.a.aggiornaVersione(v1('b1', 'm1'));
  clic(opzione(uno, 'Continua'));
  assert.equal(p.inviati[0].azione.chiave, 'nome:b1@m1#prossimo', 'la chiave: il nome e il messaggio');
  const due = p.inMessaggio('m2', p.a.blocco(SCELTE, true, 'nome=b2'));
  p.a.aggiornaVersione(v1('b2', 'm2'));
  assert.equal(libero(due), true, 'più avanti nella stessa chat le stesse opzioni, parola per parola, si cliccano');
  clic(opzione(due, 'Fermati qui'));
  assert.deepEqual(p.inviati.map((x) => x.azione.chiave), ['nome:b1@m1#prossimo', 'nome:b2@m2#prossimo']);
  /* AL CONTRARIO: il primo, ridisegnato, resta spento con la sua scelta */
  assert.deepEqual(stati(p.a.blocco(SCELTE, true, 'nome=b1')), [['Continua', true, 'true'], ['Fermati qui', true, 'false']]);

  /* dal vivo: il recinto non porta il nome, lo dà il v1 che arriva col messaggio */
  const q = pagina();
  const l1 = arrivaVivo(q, 'm1');
  q.a.aggiornaVersione(v1('b1', 'm1'));
  clic(opzione(l1, 'Continua'));
  assert.equal(q.inviati[0].azione.chiave, 'nome:b1@m1#prossimo');
  const l2 = arrivaVivo(q, 'm2');
  q.a.aggiornaVersione(v1('b2', 'm2'));
  assert.equal(l2.dataset.nome, 'b2');
  assert.equal(libero(l2), true, 'il blocco nuovo, col suo nome, è libero');
  clic(opzione(l2, 'Fermati qui'));
  assert.equal(q.inviati.length, 2);
  assert.equal(q.inviati[1].azione.chiave, 'nome:b2@m2#prossimo');
  assert.deepEqual(stati(l1), [['Continua', true, 'true'], ['Fermati qui', true, 'false']], 'e il primo non si è riacceso');
});

test('UIG-5.3c in un ramo i blocchi già usati PRIMA del punto del ramo restano spenti', () => {
  const p = pagina({ sessione: 's1' });
  const madre = p.inMessaggio('m1', p.a.blocco(SCELTE, true, 'nome=b1'));
  p.a.aggiornaVersione(v1('b1', 'm1'));
  clic(opzione(madre, 'Continua'));
  const { chiave } = p.inviati[0].azione;
  /* «Riprova» = `avviaRamo`: la chat cambia sessione e `disegnaStoriaEreditata` (`legacy/app.js:15605-15622`) rigioca gli eventi della
     madre fino al punto del ramo — il testo, il v1 coi messaggi della madre, la bolla della persona e l'evento del gesto */
  p.a.azzera();
  p.passaA('s1-ramo');
  p.messaggi.clear();
  p.inMessaggio('m1', p.a.blocco(SCELTE, true, 'nome=b1'));
  p.a.aggiornaVersione(v1('b1', 'm1'));
  /* cura BG3 round 4 (E3): the memory of gestures is per chat, so the fork's page reads as the reloaded fork below: free until the
     parent's gesture is replayed in it (before, the parent's raw key leaked into the fork, and the fork's answers into the parent) */
  assert.equal(libero(sezioneIn(p, 'm1')), true, 'prima del gesto rigiocato è libero, come dopo un ricarico');
  p.a.spegni(chiave, { tipo: 'scelte', valore: 'Continua' });
  p.a.spegni(chiave, { tipo: 'scelte' });
  assert.deepEqual(stati(sezioneIn(p, 'm1')), [['Continua', true, 'true'], ['Fermati qui', true, 'false']], 'il gesto rigiocato della madre lo spegne');
  clic(opzione(sezioneIn(p, 'm1'), 'Fermati qui'));
  assert.equal(p.inviati.length, 1, 'niente rimandato');

  /* il ramo ricaricato: solo gli eventi rigiocati */
  const f = pagina({ sessione: 's1-ramo' });
  const r = f.inMessaggio('m1', f.a.blocco(SCELTE, true, 'nome=b1'));
  f.a.aggiornaVersione(v1('b1', 'm1'));
  assert.equal(libero(r), true, 'prima del gesto rigiocato è libero');
  f.a.spegni(chiave, { tipo: 'scelte', valore: 'Continua' });
  const ora = sezioneIn(f, 'm1');
  assert.deepEqual(stati(ora), [['Continua', true, 'true'], ['Fermati qui', true, 'false']], 'spento, con la scelta della madre');
  clic(opzione(ora, 'Fermati qui'));
  assert.equal(f.inviati.length, 0);
  /* AL CONTRARIO: la risposta nuova del ramo, dopo il punto del ramo, con lo stesso testo, è libera */
  const nuovo = f.inMessaggio('m9', f.a.blocco(SCELTE, true, 'nome=b2'));
  f.a.aggiornaVersione(v1('b2', 'm9'));
  assert.equal(libero(nuovo), true);
});

test('UIG-5.3d il ridisegno spento di `spegni` tiene il nome del blocco', () => {
  /* due blocchi dallo stesso testo, nati vivi e legati dal loro v1: col testo solo non si saprebbe di chi è il ridisegno */
  const p = pagina();
  const l1 = arrivaVivo(p, 'm1');
  p.a.aggiornaVersione(v1('b1', 'm1'));
  const l2 = arrivaVivo(p, 'm2');
  p.a.aggiornaVersione(v1('b2', 'm2'));
  assert.deepEqual([l1.dataset.nome, l2.dataset.nome], ['b1', 'b2']);
  /* l2 era stato legato a b1 per somiglianza di testo prima del suo v1: il v1 giusto lo toglie da b1, e una v2 di b1 non lo tocca */
  const avanti = SCELTE.replace('"Continua"', '"Avanti"');
  p.a.aggiornaVersione({ type: 'CUSTOM', name: EVENTO_VERSIONE_DEL_BLOCCO, value: { conversazione: 's1', messaggio: 'm1', blocco: 'b1', versione: 2, sorgente: avanti, cosaECambiato: 'Avanti', origine: 'modello', posizione: 0, quando: '2026-11-06T00:01:00.000Z' } });
  assert.ok(opzione(sezioneIn(p, 'm1'), 'Avanti'), 'premessa: la v2 di b1 arriva al suo blocco');
  assert.ok(opzione(sezioneIn(p, 'm2'), 'Continua') && !opzione(sezioneIn(p, 'm2'), 'Avanti'), 'il blocco di b2 non riceve la versione di b1');
  p.a.spegni('nome:b2@m2#prossimo', { tipo: 'scelte', valore: 'Fermati qui' });
  const ora = sezioneIn(p, 'm2');
  assert.notEqual(ora, l2, 'ridisegnato');
  assert.equal(ora.dataset.nome, 'b2', 'col nome');
  assert.deepEqual(stati(ora), [['Continua', true, 'false'], ['Fermati qui', true, 'true']]);
  assert.equal(libero(l1), true, 'l’altro blocco con lo stesso testo resta libero');
});

test('UIG-5.4 il tasto destro su un’opzione apre UN menu, quello del blocco, e non anche quello della risposta (UIG-A.R-1)', () => {
  const { a, document, inviati } = pagina();
  const nodo = a.blocco(SCELTE, true);
  /* la risposta col suo menu col tasto destro, in fase di risalita come `conversazione.js` (`ospite`) */
  const risposta = document.createElement('article');
  let menuDellaRisposta = 0;
  risposta.addEventListener('contextmenu', (ev) => { ev.preventDefault(); menuDellaRisposta += 1; });
  risposta.append(nodo);
  document.body.append(risposta);

  for (const testo of ['Continua', 'Fermati qui']) {
    const ev = destro();
    opzione(nodo, testo).dispatchEvent(ev);
    assert.equal(ev.defaultPrevented, true, 'niente menu del sistema');
    assert.equal(menuDellaRisposta, 0, 'un menu solo');
    const menu = document.body.querySelectorAll(MENU);
    assert.equal(menu.length, 1, 'il menu del blocco è uno, nel corpo della pagina');
    assert.equal(menu[0].hidden, false);
    assert.deepEqual([menu[0].style.left, menu[0].style.top], ['120px', '80px'], 'al puntatore');
    menu[0].dispatchEvent(Object.assign(new Event('keydown', { cancelable: true }), { key: 'Escape' }));
    assert.equal(menu[0].hidden, true);
  }
  assert.equal(inviati.length, 0, 'il tasto destro non è una scelta');

  /* anche a blocco spento (scelta fatta). ⛔ Se Chrome mandi `contextmenu` a un <button disabled> lo dice solo UIG-5.R1 */
  clic(opzione(nodo, 'Continua'));
  const ev = destro();
  opzione(nodo, 'Fermati qui').dispatchEvent(ev);
  assert.equal(ev.defaultPrevented, true);
  assert.equal(menuDellaRisposta, 0);
  assert.equal(document.body.querySelectorAll(MENU).length, 1);
  assert.equal(document.body.querySelector(MENU).hidden, false);
  assert.equal(inviati.length, 1);

  /* AL CONTRARIO: fuori dal blocco, nella stessa risposta, il menu è quello della risposta */
  const testo = document.createElement('p');
  risposta.append(testo);
  testo.dispatchEvent(destro());
  assert.equal(menuDellaRisposta, 1);
});

/* scena 8: il menu «⋯» vive nel corpo della pagina (`#menuDelBlocco`); qui si cerca la voce per testo, come `blocchi-viste.test.mjs` */
const voce = (nodo, testo) => {
  const piu = nodo.querySelector('button[aria-haspopup="menu"]');
  if (piu.getAttribute('aria-expanded') !== 'true') clic(piu);
  return nodo.ownerDocument.body.querySelector(MENU)?.querySelectorAll('[role="menuitem"]').find((b) => b.textContent.trim().startsWith(testo));
};

test('UIG-5.5 una scelta fatta nella vista a lato spegne SUBITO i tasti in linea, stesso aspetto e aria-pressed, senza ricarica', () => {
  const document = documento();
  const colonna = document.createElement('aside');
  document.body.append(colonna);
  const viste = creaVisteDelBlocco({ document, colonna: () => colonna, apriColonna: () => {} });
  const inviati = [];
  const a = creaAggancioBlocchi({ document, sessione: () => 's1', timer: orologio().timer, consegna: (testo, azione) => inviati.push({ testo, azione }), azioni: { lato: viste.lato, schermo: viste.schermo } });
  const inLinea = a.blocco(SCELTE, true);
  document.body.append(inLinea);
  clic(voce(inLinea, 'Apri a lato'));
  const lato = colonna.querySelector('.gu-lato');
  assert.ok(lato, 'la vista a lato è aperta');
  clic(opzione(lato, 'Fermati qui'));
  assert.equal(inviati.length, 1);
  const atteso = [['Continua', true, 'false'], ['Fermati qui', true, 'true']];
  assert.deepEqual(stati(lato), atteso);
  assert.deepEqual(stati(inLinea), atteso, 'in linea spento subito, con la stessa scelta segnata');
  assert.equal(inLinea.isConnected, true, 'lo stesso nodo, non un ridisegno');
  clic(opzione(inLinea, 'Continua'));
  assert.equal(inviati.length, 1, 'e un clic in linea non manda niente');
  /* AL CONTRARIO: da in linea verso a lato, lo stesso */
  const b = a.blocco(SCELTE.replace('Fermati qui', 'Rifai'), true);
  document.body.append(b);
  clic(voce(b, 'Apri a lato'));
  const lato2 = colonna.querySelector('.gu-lato');
  clic(opzione(b, 'Rifai'));
  assert.deepEqual(stati(lato2), [['Continua', true, 'false'], ['Rifai', true, 'true']]);
});

test('UIG-5.6 il tasto destro su un’opzione SPENTA apre il menu del blocco, mai quello del sistema; spenta resta spenta', () => {
  const { a, document, inviati } = pagina();
  const nodo = a.blocco(SCELTE, true);
  const risposta = document.createElement('article');
  let menuDellaRisposta = 0;
  risposta.addEventListener('contextmenu', (ev) => { ev.preventDefault(); menuDellaRisposta += 1; });
  risposta.append(nodo);
  document.body.append(risposta);
  clic(opzione(nodo, 'Continua'));
  for (const testo of ['Continua', 'Fermati qui']) {
    const b = opzione(nodo, testo);
    /* ⛔ non `disabled`: Chrome non garantisce `contextmenu` su un controllo disabilitato (chromestatus 6128674512830464, «In
       development»; HTML §4.10.19.5 vieta solo i clic). Spento si dice con `aria-disabled`, e il clic lo ferma il blocco stesso */
    assert.equal(b.disabled, false, `${testo}: non disabled`);
    assert.equal(b.getAttribute('aria-disabled'), 'true', `${testo}: aria-disabled, lo legge il lettore di schermo`);
    const ev = destro();
    b.dispatchEvent(ev);
    assert.equal(ev.defaultPrevented, true, 'niente menu del sistema');
    assert.equal(menuDellaRisposta, 0, 'un menu solo');
    assert.equal(document.body.querySelectorAll(MENU).length, 1);
    assert.equal(document.body.querySelector(MENU).hidden, false, 'il menu del blocco è aperto');
    document.body.querySelector(MENU).dispatchEvent(Object.assign(new Event('keydown', { cancelable: true }), { key: 'Escape' }));
    clic(b);
    invio(b);
  }
  assert.equal(inviati.length, 1, 'clic e Invio su un’opzione spenta non mandano niente');
  assert.deepEqual(stati(nodo), [['Continua', true, 'true'], ['Fermati qui', true, 'false']]);

  /* il modulo: i tasti spenti con aria-disabled, i campi di testo restano disabled; «Scrivo io» non risponde più */
  const scritti = [];
  const document2 = documento();
  const mod = creaAggancioBlocchi({ document: document2, sessione: () => 's1', timer: orologio().timer, consegna: (testo) => scritti.push(testo), scrivoIo: () => scritti.push('io') });
  const nm = mod.blocco(MODULO, true);
  document2.body.append(nm);
  clic(nm.querySelector('[data-valore="Treno"]'));
  clic(nm.querySelector('[data-invia-modulo]'));
  const tasti = [...nm.querySelectorAll('.talos-chip'), ...nm.querySelectorAll('.gu__sotto button').filter((x) => !x.hasAttribute('aria-haspopup'))];
  assert.ok(tasti.length >= 4, `chip, «Cerca» e «Scrivo io»: ${tasti.length}`);
  assert.equal(tasti.every((x) => !x.disabled && x.getAttribute('aria-disabled') === 'true'), true);
  assert.equal(nm.querySelectorAll('input').every((x) => x.disabled), true);
  const ev = destro();
  nm.querySelector('[data-invia-modulo]').dispatchEvent(ev);
  assert.equal(ev.defaultPrevented, true);
  for (const x of tasti) clic(x);
  assert.equal(scritti.length, 1, 'un invio, poi niente: nemmeno «Scrivo io»');

  /* AL CONTRARIO: un blocco libero non porta aria-disabled="true" */
  assert.equal(opzioni(pagina().a.blocco(SCELTE, true)).some((b) => b.getAttribute('aria-disabled') === 'true'), false);
});

test('UIG-5.6b lo stile: aria-disabled ha lo stesso aspetto di disabled, senza cambio al passaggio, e GrayText nei colori forzati', () => {
  const css = readFileSync(new URL('../../src/styles/blocchi.css', import.meta.url), 'utf8');
  assert.match(css, /\.gu button\[aria-disabled="true"\]\{opacity:\.55;cursor:default\}/u);
  assert.match(css, /\.gu \.talos-button--secondary\[aria-disabled="true"\]:hover\{border-color:var\(--talos-border\);background:var\(--talos-panel-soft\)\}/u);
  assert.match(css, /\.gu \.talos-button--primary\[aria-disabled="true"\]/u);
  assert.match(css, /\.gu \.talos-chip\[aria-checked\]:hover:not\(:disabled\):not\(\[aria-disabled="true"\]\)/u);
  assert.match(css, /forced-colors:active\)\{\.gu button\[aria-disabled="true"\]\{color:GrayText/u);
});

/*
 * G-BG2 (06/11/2026): the gaps of G-G2 left open by the group review (ledger, «My review of G-B4 + G-G2 as one group», 06/11 05:30).
 * Each test names the mutant it must kill (g7, g11, g15, g17, g19, z5).
 */
const VECCHIA = (s = 's1') => `${s}:${impronta(SCELTE)}#prossimo`;
const BLOCCATO_CONTINUA = [['Continua', true, 'true'], ['Fermati qui', true, 'false']];
const BLOCCATO_FERMATI = [['Continua', true, 'false'], ['Fermati qui', true, 'true']];

test('UIG-5.7 a live block clicked BEFORE its v1: the v1 gives the old key to that name; a twin in a later message stays clickable (g7, g11)', () => {
  const p = pagina();
  const l1 = arrivaVivo(p, 'm1');
  clic(opzione(l1, 'Continua'));
  assert.equal(p.inviati[0].azione.chiave, VECCHIA(), 'premise: no name yet, the click uses the old key');
  p.a.aggiornaVersione(v1('b1', 'm1'));
  assert.equal(l1.dataset.nome, 'b1');
  assert.deepEqual(stati(l1), BLOCCATO_CONTINUA, 'the clicked block stays locked');
  /* a saved fence of a LATER message with the same text, the first other name to ask for the old key: it is not b1, it is free */
  assert.equal(libero(p.inMessaggio('m2', p.a.blocco(SCELTE, true, 'nome=b2'))), true, 'the old key went to b1, not to the next name that asks');
  /* the redraw of b1 (the message tail drawn again) is still locked, with its choice */
  assert.deepEqual(stati(p.a.blocco(SCELTE, true, 'nome=b1')), BLOCCATO_CONTINUA);
  /* live twin: a third message streams the same text, bound to b1 by look-alike text first, then its own v1 */
  const l3 = arrivaVivo(p, 'm3');
  p.a.aggiornaVersione(v1('b3', 'm3'));
  assert.equal(l3.dataset.nome, 'b3');
  assert.equal(libero(sezioneIn(p, 'm3')), true, 'the live twin of a later message is clickable');
  clic(opzione(sezioneIn(p, 'm3'), 'Fermati qui'));
  assert.deepEqual(p.inviati.map((x) => x.azione.chiave), [VECCHIA(), 'nome:b3@m3#prossimo']);
});

test('UIG-5.8 a block locked from the journal under a look-alike name: the right v1, whose name has no gesture, makes it clickable again (g15)', () => {
  const p = pagina();
  arrivaVivo(p, 'm1');
  p.a.aggiornaVersione(v1('b1', 'm1'));
  arrivaVivo(p, 'm2');
  assert.equal(sezioneIn(p, 'm2').dataset.nome, 'b1', 'premise: the look-alike name');
  /* the gesture of b1 arrives from the journal: both shells that say «b1» are redrawn locked */
  p.a.spegni('nome:b1@m1#prossimo', { tipo: 'scelte', valore: 'Continua' });
  assert.deepEqual(stati(sezioneIn(p, 'm2')), BLOCCATO_CONTINUA, 'premise: locked under the look-alike name');
  p.a.aggiornaVersione(v1('b2', 'm2'));
  const ora = sezioneIn(p, 'm2');
  assert.equal(ora.dataset.nome, 'b2');
  assert.equal(libero(ora), true, 'clickable again: no aria-pressed');
  assert.equal(opzioni(ora).some((b) => b.hasAttribute('aria-disabled')), false, 'and no aria-disabled');
  clic(opzione(ora, 'Fermati qui'));
  assert.deepEqual(p.inviati.map((x) => x.azione.chiave), ['nome:b2@m2#prossimo'], 'the click goes under its own name');
  /* AL CONTRARIO: b1 stays locked */
  assert.deepEqual(stati(sezioneIn(p, 'm1')), BLOCCATO_CONTINUA);
});

test('UIG-5.8b a twin locked from the journal BEFORE its v1, under a look-alike name: its own v1 keeps it locked with its own answer', () => {
  /* G-BG3 (Frontend review of G-BG2, 06/11/2026): an old fork chat answered its twin m9 with the old key before m9's v1 was written. The
     UIG-5.8 redraw must not hand that gesture to the look-alike name b1, or m9's own v1 frees it and it can answer twice */
  const r = pagina({ sessione: 's1-ramo' });
  r.inMessaggio('m1', r.a.blocco(SCELTE, true, 'nome=b1'));
  r.a.aggiornaVersione(v1('b1', 'm1'));
  r.inMessaggio('m9', r.a.blocco(SCELTE, true));
  assert.equal(sezioneIn(r, 'm9').dataset.nome, 'b1', 'premise: the look-alike name');
  r.a.spegni(VECCHIA('s1-ramo'), { tipo: 'scelte', valore: 'Fermati qui' });
  r.a.aggiornaVersione(v1('b9', 'm9'));
  assert.equal(sezioneIn(r, 'm9').dataset.nome, 'b9', 'premise: m9 is bound to its own v1');
  assert.deepEqual(stati(sezioneIn(r, 'm9')), BLOCCATO_FERMATI, 'still locked, with the fork answer');
  clic(opzione(sezioneIn(r, 'm9'), 'Continua'));
  assert.equal(r.inviati.length, 0, 'm9 cannot answer a second time');
  /* AL CONTRARIO: a twin drawn AFTER that gesture is a new question, free on its own v1 (5.3b) */
  r.inMessaggio('m10', r.a.blocco(SCELTE, true));
  r.a.aggiornaVersione(v1('b10', 'm10'));
  assert.equal(sezioneIn(r, 'm10').dataset.nome, 'b10', 'premise: m10 is bound to its own v1');
  assert.equal(libero(sezioneIn(r, 'm10')), true, 'the later twin is free');
});

test('UIG-5.9 a gesture replayed while the same block still streams: locked when the live fence closes (g17)', () => {
  const p = pagina();
  p.inMessaggio('m1', p.a.blocco(SCELTE.slice(0, 20), false));
  p.a.spegni(VECCHIA(), { tipo: 'scelte', valore: 'Fermati qui' });
  const nodo = p.a.blocco(SCELTE, true);
  assert.deepEqual(stati(nodo), BLOCCATO_FERMATI, 'locked, with the choice, the same node');
  clic(opzione(nodo, 'Continua'));
  assert.equal(p.inviati.length, 0);
  /* AL CONTRARIO: another chat's gesture does not lock it */
  const q = pagina();
  q.inMessaggio('m1', q.a.blocco(SCELTE.slice(0, 20), false));
  q.a.spegni(VECCHIA('s9'), { tipo: 'scelte', valore: 'Fermati qui' });
  assert.equal(libero(q.a.blocco(SCELTE, true)), true);
});

test('UIG-5.10 the gesture arrives while the block is detached: put back, it shows locked (g19)', () => {
  const p = pagina();
  const nodo = p.inMessaggio('m1', p.a.blocco(SCELTE, true));
  nodo.remove();
  assert.equal(nodo.isConnected, false, 'premise: detached (the chat redraws the message tail)');
  p.a.spegni(VECCHIA(), { tipo: 'scelte', valore: 'Continua' });
  p.messaggi.get('m1').append(nodo);
  assert.deepEqual(stati(nodo), BLOCCATO_CONTINUA);
  clic(opzione(nodo, 'Fermati qui'));
  assert.equal(p.inviati.length, 0);
  /* a named block too, its gesture under its name */
  const q = pagina();
  const n2 = q.inMessaggio('m1', q.a.blocco(SCELTE, true, 'nome=b1'));
  q.a.aggiornaVersione(v1('b1', 'm1'));
  n2.remove();
  q.a.spegni('nome:b1@m1#prossimo', { tipo: 'scelte', valore: 'Fermati qui' });
  q.messaggi.get('m1').append(n2);
  assert.deepEqual(stati(n2), BLOCCATO_FERMATI);
});

test('UIG-5.5b the form: a submit in the side view, or a gesture from the journal, locks the inline form at once, with no reload (z5)', () => {
  const document = documento();
  const colonna = document.createElement('aside');
  document.body.append(colonna);
  const viste = creaVisteDelBlocco({ document, colonna: () => colonna, apriColonna: () => {} });
  const inviati = [];
  const a = creaAggancioBlocchi({ document, sessione: () => 's1', timer: orologio().timer, consegna: (testo, azione) => inviati.push({ testo, azione }), azioni: { lato: viste.lato, schermo: viste.schermo } });
  const inLinea = a.blocco(MODULO, true);
  document.body.append(inLinea);
  assert.equal(inLinea.querySelectorAll('input').some((i) => i.disabled), false, 'premise: free');
  clic(voce(inLinea, 'Apri a lato'));
  const lato = colonna.querySelector('.gu-lato');
  assert.ok(lato, 'the side view is open');
  clic(lato.querySelector('[data-valore="Aereo"]'));
  clic(lato.querySelector('[data-invia-modulo]'));
  assert.equal(inviati.length, 1);
  assert.equal(inLinea.isConnected, true, 'the same node, not a redraw');
  assert.equal(inLinea.querySelectorAll('input').every((i) => i.disabled), true, 'inline fields off at once');
  assert.equal(spento(inLinea.querySelector('[data-invia-modulo]')), true, 'inline submit off at once');
  clic(inLinea.querySelector('[data-valore="Treno"]'));
  clic(inLinea.querySelector('[data-invia-modulo]'));
  assert.equal(inviati.length, 1, 'nothing more from the inline form');

  /* from the journal, while the form is detached: put back, it is locked */
  const q = pagina();
  const nm = q.inMessaggio('m1', q.a.blocco(MODULO, true));
  nm.remove();
  q.a.spegni(inviati[0].azione.chiave, { tipo: 'modulo' });
  q.messaggi.get('m1').append(nm);
  assert.equal(nm.querySelectorAll('input').every((i) => i.disabled), true);
  assert.equal(spento(nm.querySelector('[data-invia-modulo]')), true);
});

test('UIG-5.11 a gesture made before the v1 (`nome:bN@~chat#id`) is found again once the v1 binds: on the page, after a reload, in a fork', () => {
  const p = pagina();
  const n = p.inMessaggio('m1', p.a.blocco(SCELTE, true, 'nome=b2'));
  clic(opzione(n, 'Fermati qui'));
  const { chiave } = p.inviati[0].azione;
  assert.equal(chiave, 'nome:b2@~s1#prossimo', 'premise: the name with no v1 yet');
  p.a.aggiornaVersione(v1('b2', 'm1'));
  assert.deepEqual(stati(sezioneIn(p, 'm1')), BLOCCATO_FERMATI, 'the clicked block stays locked when its v1 binds');
  assert.deepEqual(stati(p.a.blocco(SCELTE, true, 'nome=b2')), BLOCCATO_FERMATI, 'a redraw of b2, now under nome:b2@m1, is locked too');

  /* reload, in the journal order: the text, the v1, the bubble, the gesture */
  const r = pagina();
  const n2 = r.inMessaggio('m1', r.a.blocco(SCELTE, true, 'nome=b2'));
  r.a.aggiornaVersione(v1('b2', 'm1'));
  assert.equal(libero(n2), true, 'premise: free before the gesture');
  r.a.spegni(chiave, { tipo: 'scelte', valore: 'Fermati qui' });
  r.a.spegni(chiave, { tipo: 'scelte' });
  assert.deepEqual(stati(sezioneIn(r, 'm1')), BLOCCATO_FERMATI);
  clic(opzione(sezioneIn(r, 'm1'), 'Continua'));
  assert.equal(r.inviati.length, 0);

  /* the fork replays the parent's events: the key says ~s1, the chat is s1-ramo */
  const f = pagina({ sessione: 's1-ramo' });
  f.inMessaggio('m1', f.a.blocco(SCELTE, true, 'nome=b2'));
  f.a.aggiornaVersione(v1('b2', 'm1'));
  f.a.spegni(chiave, { tipo: 'scelte', valore: 'Fermati qui' });
  assert.deepEqual(stati(sezioneIn(f, 'm1')), BLOCCATO_FERMATI);
  /* AL CONTRARIO: another name stays free */
  assert.equal(libero(f.inMessaggio('m2', f.a.blocco(SCELTE, true, 'nome=b3'))), true);
});

/*
 * G-BG2, UIG-5.2c: an old-key gesture (`sessione:impronta#id`, saved before G-G2) locks EVERY named block with that text drawn BEFORE it in
 * journal order, and never a block first drawn after it. The real replay order: text, v1, bubble, gesture.
 */
const rigioca = (p, vecchia = VECCHIA()) => {
  p.inMessaggio('m1', p.a.blocco(SCELTE, true, 'nome=b1'));
  p.a.aggiornaVersione(v1('b1', 'm1'));
  p.inMessaggio('m2', p.a.blocco(SCELTE, true, 'nome=b2'));
  p.a.aggiornaVersione(v1('b2', 'm2'));
  p.a.spegni(vecchia, { tipo: 'scelte', valore: 'Continua' });
  p.a.spegni(vecchia, { tipo: 'scelte' });
};

test('UIG-5.2c (a) two named twins drawn before one old-key gesture: both locked, on the page, after a reload, after a chat switch', () => {
  const p = pagina();
  rigioca(p);
  assert.deepEqual(stati(sezioneIn(p, 'm1')), BLOCCATO_CONTINUA, 'b1 locked');
  assert.deepEqual(stati(sezioneIn(p, 'm2')), BLOCCATO_CONTINUA, 'b2 locked too: drawn before the gesture');
  assert.deepEqual(stati(p.a.blocco(SCELTE, true, 'nome=b1')), BLOCCATO_CONTINUA, 'a redraw of b1 stays locked');
  assert.deepEqual(stati(p.a.blocco(SCELTE, true, 'nome=b2')), BLOCCATO_CONTINUA, 'a redraw of b2 stays locked');
  clic(opzione(sezioneIn(p, 'm2'), 'Fermati qui'));
  assert.equal(p.inviati.length, 0, 'nothing sent');
  /* reload: a fresh page, the same journal */
  const r = pagina();
  rigioca(r);
  assert.deepEqual([stati(sezioneIn(r, 'm1')), stati(sezioneIn(r, 'm2'))], [BLOCCATO_CONTINUA, BLOCCATO_CONTINUA]);
  /* chat switch and back on the same page: the raw memory is kept, the replay rebuilds the rest */
  p.a.azzera();
  p.passaA('s2');
  p.messaggi.clear();
  assert.equal(libero(p.inMessaggio('m1', p.a.blocco(SCELTE, true, 'nome=b1'))), true, 'another chat: free');
  p.a.azzera();
  p.passaA('s1');
  p.messaggi.clear();
  rigioca(p);
  assert.deepEqual([stati(sezioneIn(p, 'm1')), stati(sezioneIn(p, 'm2'))], [BLOCCATO_CONTINUA, BLOCCATO_CONTINUA]);
});

test('UIG-5.2c (b) a block of a LATER message, saved or live, stays clickable after the old-key gesture', () => {
  const p = pagina();
  rigioca(p);
  const tre = p.inMessaggio('m3', p.a.blocco(SCELTE, true, 'nome=b3'));
  p.a.aggiornaVersione(v1('b3', 'm3'));
  assert.equal(libero(tre), true, 'a saved fence after the gesture');
  const l4 = arrivaVivo(p, 'm4');
  p.a.aggiornaVersione(v1('b4', 'm4'));
  assert.equal(l4.dataset.nome, 'b4');
  assert.equal(libero(sezioneIn(p, 'm4')), true, 'a live block after the gesture');
  clic(opzione(sezioneIn(p, 'm4'), 'Fermati qui'));
  assert.deepEqual(p.inviati.map((x) => x.azione.chiave), ['nome:b4@m4#prossimo']);
  /* AL CONTRARIO: the earlier two are still locked */
  assert.deepEqual([stati(sezioneIn(p, 'm1')), stati(sezioneIn(p, 'm2'))], [BLOCCATO_CONTINUA, BLOCCATO_CONTINUA]);
});

test('UIG-5.2c (c) a v2 of a locked twin, or a later gesture under its own name, keeps the lock', () => {
  const p = pagina();
  rigioca(p);
  const avanti = SCELTE.replace('"Continua"', '"Avanti"');
  p.a.aggiornaVersione({ type: 'CUSTOM', name: EVENTO_VERSIONE_DEL_BLOCCO, value: { conversazione: 's1', messaggio: 'm1', blocco: 'b1', versione: 2, sorgente: avanti, cosaECambiato: 'Avanti', origine: 'modello', posizione: 0, quando: '2026-11-06T00:01:00.000Z' } });
  const uno = sezioneIn(p, 'm1');
  assert.ok(opzione(uno, 'Avanti'), 'premise: the v2 is on screen');
  assert.equal(opzioni(uno).every(spento), true, 'the v2 of b1 is still locked');
  p.a.spegni('nome:b2@m2#prossimo', { tipo: 'scelte', valore: 'Fermati qui' });
  assert.equal(opzioni(sezioneIn(p, 'm2')).every(spento), true, 'b2 still locked');
  assert.equal(opzioni(p.a.blocco(SCELTE, true, 'nome=b2')).every(spento), true, 'and its redraw');
  clic(opzione(sezioneIn(p, 'm2'), 'Continua'));
  assert.equal(p.inviati.length, 0);
});

test('UIG-5.2c (d) a fork replays the parent’s old key in its own chat: both twins locked', () => {
  const f = pagina({ sessione: 's1-ramo' });
  rigioca(f, VECCHIA('s1'));
  assert.deepEqual([stati(sezioneIn(f, 'm1')), stati(sezioneIn(f, 'm2'))], [BLOCCATO_CONTINUA, BLOCCATO_CONTINUA]);
  /* AL CONTRARIO: the fork's new answer, after the branch point, is free */
  const nuovo = f.inMessaggio('m9', f.a.blocco(SCELTE, true, 'nome=b3'));
  f.a.aggiornaVersione(v1('b3', 'm9'));
  assert.equal(libero(nuovo), true);
});

test('UIG-5.2c (e) after a chat switch and back, the replay rebuilds the order: a later message is still a new question', () => {
  const p = pagina();
  rigioca(p);
  const tre = () => { const n = p.inMessaggio('m3', p.a.blocco(SCELTE, true, 'nome=b3')); p.a.aggiornaVersione(v1('b3', 'm3')); return n; };
  assert.equal(libero(tre()), true, 'premise: free on the first visit');
  p.a.azzera();
  p.passaA('s2');
  p.messaggi.clear();
  p.a.azzera();
  p.passaA('s1');
  p.messaggi.clear();
  rigioca(p);
  assert.equal(libero(tre()), true, 'b3 is drawn after the gesture in this replay too: free');
  assert.deepEqual([stati(sezioneIn(p, 'm1')), stati(sezioneIn(p, 'm2'))], [BLOCCATO_CONTINUA, BLOCCATO_CONTINUA]);
});

test('UIG-5.2c (f) twins named by the fence only (no v1 in the journal): one old-key gesture after both locks both', () => {
  const p = pagina();
  p.inMessaggio('m1', p.a.blocco(SCELTE, true, 'nome=b1'));
  p.inMessaggio('m2', p.a.blocco(SCELTE, true, 'nome=b2'));
  p.a.spegni(VECCHIA(), { tipo: 'scelte', valore: 'Continua' });
  assert.deepEqual([stati(sezioneIn(p, 'm1')), stati(sezioneIn(p, 'm2'))], [BLOCCATO_CONTINUA, BLOCCATO_CONTINUA]);
  /* AL CONTRARIO: a fence-named block of a later message is free */
  assert.equal(libero(p.inMessaggio('m3', p.a.blocco(SCELTE, true, 'nome=b3'))), true);
});

test('UIG-5.2c (g) the journal of a click made before the v1 (text, gesture, THEN v1): after a reload the block stays locked', () => {
  /* UIG-5.7 written down: the click used the old key and reached the journal before the block's v1 */
  const p = pagina();
  const uno = p.inMessaggio('m1', p.a.blocco(SCELTE, true));
  p.a.spegni(VECCHIA(), { tipo: 'scelte', valore: 'Continua' });
  assert.deepEqual(stati(sezioneIn(p, 'm1')), BLOCCATO_CONTINUA, 'premise: unnamed, locked by the old key');
  assert.notEqual(sezioneIn(p, 'm1'), uno, 'premise: redrawn locked');
  p.a.aggiornaVersione(v1('b1', 'm1'));
  assert.equal(sezioneIn(p, 'm1').dataset.nome, 'b1', 'premise: the v1 binds the redrawn shell');
  assert.deepEqual(stati(sezioneIn(p, 'm1')), BLOCCATO_CONTINUA, 'still locked once named: it was drawn before the gesture');
  clic(opzione(sezioneIn(p, 'm1'), 'Fermati qui'));
  assert.equal(p.inviati.length, 0);
});

test('UIG-5.2c (h) two twins that arrived LIVE, named by their v1, then an old-key gesture from the journal: both locked', () => {
  const p = pagina();
  arrivaVivo(p, 'm1');
  p.a.aggiornaVersione(v1('b1', 'm1'));
  arrivaVivo(p, 'm2');
  p.a.aggiornaVersione(v1('b2', 'm2'));
  assert.equal(sezioneIn(p, 'm2').dataset.nome, 'b2', 'premise: each twin has its own name');
  p.a.spegni(VECCHIA(), { tipo: 'scelte', valore: 'Continua' });
  assert.deepEqual([stati(sezioneIn(p, 'm1')), stati(sezioneIn(p, 'm2'))], [BLOCCATO_CONTINUA, BLOCCATO_CONTINUA]);
});

/*
 * G-BG3, UIG-5.2d (Frontend adversarial review of G-BG2, 06/11/2026): a fork `s1-ramo` made before G-G2 replays the parent's old-key
 * gesture (`s1:`, «Continua» on m1), then its OWN old-key gesture (`s1-ramo:`, «Fermati qui» on its twin m9). Both keys land on the same
 * fork-chat index; each twin takes the first gesture that arrived AFTER it was drawn. Both journal orders of the fork's gesture and m9's v1.
 */
for (const ordine of ['gesto-prima', 'v1-prima']) {
  test(`UIG-5.2d a fork's own old-key answer on its twin survives the parent's replayed one (${ordine}): m1 «Continua», m9 «Fermati qui», no second answer`, () => {
    const r = pagina({ sessione: 's1-ramo' });
    r.inMessaggio('m1', r.a.blocco(SCELTE, true, 'nome=b1'));
    r.a.aggiornaVersione(v1('b1', 'm1'));
    r.a.spegni(VECCHIA('s1'), { tipo: 'scelte', valore: 'Continua' });
    r.inMessaggio('m9', r.a.blocco(SCELTE, true));
    if (ordine === 'v1-prima') r.a.aggiornaVersione(v1('b9', 'm9'));
    r.a.spegni(VECCHIA('s1-ramo'), { tipo: 'scelte', valore: 'Fermati qui' });
    if (ordine !== 'v1-prima') r.a.aggiornaVersione(v1('b9', 'm9'));
    assert.equal(sezioneIn(r, 'm9').dataset.nome, 'b9', 'premise: m9 is bound to its own v1');
    assert.deepEqual(stati(sezioneIn(r, 'm1')), BLOCCATO_CONTINUA, 'the parent twin keeps the parent answer');
    assert.deepEqual(stati(sezioneIn(r, 'm9')), BLOCCATO_FERMATI, 'the fork twin keeps the fork answer');
    clic(opzione(sezioneIn(r, 'm9'), 'Continua'));
    assert.equal(r.inviati.length, 0, 'm9 cannot answer a second time');
  });
}

test('UIG-5.2d (d2) AL CONTRARIO: three twins and ONE old-key gesture between m5 and m9: m1 and m5 locked, m9 free (5.3b holds)', () => {
  const r = pagina({ sessione: 's1-ramo' });
  r.inMessaggio('m1', r.a.blocco(SCELTE, true, 'nome=b1'));
  r.a.aggiornaVersione(v1('b1', 'm1'));
  r.inMessaggio('m5', r.a.blocco(SCELTE, true, 'nome=b5'));
  r.a.aggiornaVersione(v1('b5', 'm5'));
  r.a.spegni(VECCHIA('s1'), { tipo: 'scelte', valore: 'Continua' });
  r.inMessaggio('m9', r.a.blocco(SCELTE, true));
  r.a.aggiornaVersione(v1('b9', 'm9'));
  assert.deepEqual([stati(sezioneIn(r, 'm1')), stati(sezioneIn(r, 'm5'))], [BLOCCATO_CONTINUA, BLOCCATO_CONTINUA]);
  assert.equal(libero(sezioneIn(r, 'm9')), true, 'the twin drawn after the only gesture is a new question');
  clic(opzione(sezioneIn(r, 'm9'), 'Fermati qui'));
  assert.deepEqual(r.inviati.map((x) => x.azione.chiave), ['nome:b9@m9#prossimo']);
});

test('UIG-5.2d (d3) three twins, three old-key gestures in between: each twin shows the gesture that came right AFTER it', () => {
  /* a fork of a fork (`s3` from `s2` from `s1`): three chats answered the same text, each on its own twin */
  const r = pagina({ sessione: 's3' });
  r.inMessaggio('m1', r.a.blocco(SCELTE, true, 'nome=b1'));
  r.a.aggiornaVersione(v1('b1', 'm1'));
  r.a.spegni(VECCHIA('s1'), { tipo: 'scelte', valore: 'Continua' });
  r.inMessaggio('m5', r.a.blocco(SCELTE, true, 'nome=b5'));
  r.a.aggiornaVersione(v1('b5', 'm5'));
  r.a.spegni(VECCHIA('s2'), { tipo: 'scelte', valore: 'Fermati qui' });
  r.inMessaggio('m9', r.a.blocco(SCELTE, true, 'nome=b9'));
  r.a.aggiornaVersione(v1('b9', 'm9'));
  r.a.spegni(VECCHIA('s3'), { tipo: 'scelte', valore: 'Continua' });
  assert.deepEqual(stati(sezioneIn(r, 'm1')), BLOCCATO_CONTINUA, 'm1: the first gesture after it, not a later one');
  assert.deepEqual(stati(sezioneIn(r, 'm5')), BLOCCATO_FERMATI, 'm5: the gesture after it, not the earlier one nor the last');
  assert.deepEqual(stati(sezioneIn(r, 'm9')), BLOCCATO_CONTINUA, 'm9: the gesture after it');
  assert.deepEqual(stati(r.a.blocco(SCELTE, true, 'nome=b5')), BLOCCATO_FERMATI, 'a redraw of b5 keeps its own answer');
  clic(opzione(sezioneIn(r, 'm5'), 'Continua'));
  assert.equal(r.inviati.length, 0);
});

test('UIG-5.2d (d4) AL CONTRARIO: the SAME old-key gesture delivered twice (bubble and event) keeps its first place: a twin drawn in between stays free', () => {
  const r = pagina({ sessione: 's1' });
  r.inMessaggio('m1', r.a.blocco(SCELTE, true, 'nome=b1'));
  r.a.aggiornaVersione(v1('b1', 'm1'));
  r.a.spegni(VECCHIA('s1'), { tipo: 'scelte', valore: 'Continua' });
  r.inMessaggio('m9', r.a.blocco(SCELTE, true));
  r.a.aggiornaVersione(v1('b9', 'm9'));
  r.a.spegni(VECCHIA('s1'), { tipo: 'scelte', valore: 'Continua' });
  assert.deepEqual(stati(sezioneIn(r, 'm1')), BLOCCATO_CONTINUA, 'm1 was drawn before the gesture');
  assert.equal(libero(sezioneIn(r, 'm9')), true, 'one gesture, not a second one after m9');
  clic(opzione(sezioneIn(r, 'm9'), 'Fermati qui'));
  assert.deepEqual(r.inviati.map((x) => x.azione.chiave), ['nome:b9@m9#prossimo']);
});
