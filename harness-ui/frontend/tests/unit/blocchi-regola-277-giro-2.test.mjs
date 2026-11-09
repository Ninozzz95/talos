/*
 * Cura 288, round 2 (owner 06/11/2026, decisions 277 and 288: in EVERY chat a gesture locks its own block and the twins drawn before
 * it, never those drawn after; one click is one message; the page and a reload say the same thing). The three adversarial reviews of
 * 5ed5a76d2 (desktop/in-corso/uig-unione-2026-11-06): A1 a second answer lost (the unnamed block's key was its text, and the server keeps
 * one action per key), A2 page and reload apart, A3 a «ready» chat back with no replay, AV1-AV2 a whole redraw that frees an answered
 * block, two twins in one message; P5-P20 are the mutant probes, copied as they are. `conPosto` gives the hook the host's
 * `messaggioDelNodo` (legacy/app.js): without it the hook keeps the old keys, as an older host would.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { documento, clic, orologio, spento } from './aiuto-dom-blocchi.mjs';
import { impostaLingua } from '../../src/components/lingua.js';
import { creaAggancioBlocchi, impronta, EVENTO_VERSIONE_DEL_BLOCCO } from '../../src/components/blocchi/aggancio.js';

impostaLingua('it');
const SCELTE = readFileSync(new URL('../../../tests/fixtures/blocchi/03-scelte.txt', import.meta.url), 'utf8').trim();
const ALTRO = SCELTE.replace('Come vuoi procedere?', 'Quale strada prendi?');
function pagina({ sessione = 's1', conPosto = true } = {}) {
  const document = documento();
  const inviati = [];
  let corrente = sessione;
  const messaggi = new Map();
  const a = creaAggancioBlocchi({ document, sessione: () => corrente, timer: orologio().timer,
    consegna: (testo, azione) => inviati.push({ testo, azione }), elementoDelMessaggio: (id) => messaggi.get(id) ?? null,
    ...(conPosto ? { messaggioDelNodo: (nodo) => { for (const [id, m] of messaggi) if (m === nodo || m.contains(nodo)) return id; return null; } } : {}) });
  const inMessaggio = (id, nodo) => {
    let m = messaggi.get(id);
    if (!m) { m = document.createElement('article'); messaggi.set(id, m); document.body.append(m); }
    m.append(nodo);
    return nodo;
  };
  return { a, document, inviati, messaggi, inMessaggio, passaA: (s) => { corrente = s; } };
}
const v1 = (nome, messaggio, posizione = 0) => ({ type: 'CUSTOM', name: EVENTO_VERSIONE_DEL_BLOCCO,
  value: { blocco: nome, versione: 1, sorgente: SCELTE, messaggio, posizione, quando: '2026-11-06T00:00:00.000Z' } });
const arrivaVivo = (p, id) => { p.inMessaggio(id, p.a.blocco(SCELTE.slice(0, 20), false)); return p.a.blocco(SCELTE, true); };
const sezioniIn = (p, id) => p.messaggi.get(id).querySelectorAll('section').filter((x) => x.classList.contains('gu'));
const sezioneIn = (p, id, i = 0) => sezioniIn(p, id)[i];
const opzioni = (nodo) => nodo.querySelectorAll('.gu-scelte button');
const opzione = (nodo, t) => opzioni(nodo).find((b) => b.dataset.scelta === t);
const stati = (nodo) => opzioni(nodo).map((b) => [b.dataset.scelta, spento(b), b.getAttribute('aria-pressed')]);
const libero = (nodo) => opzioni(nodo).every((b) => !spento(b)) && !opzioni(nodo).some((b) => b.hasAttribute('aria-pressed'));
const K = (s) => `${s}:${impronta(SCELTE)}#prossimo`;
const C = [['Continua', true, 'true'], ['Fermati qui', true, 'false']];
const F = [['Continua', true, 'false'], ['Fermati qui', true, 'true']];
/* the journal: the person's bubble, then the action event (no value) */
const gesto = (p, chiave, valore) => { p.a.spegni(chiave, { tipo: 'scelte', valore }); p.a.spegni(chiave, { tipo: 'scelte' }); };
/* a live click and its echo from the server */
const clicca = (p, nodo, valore) => {
  const prima = p.inviati.length;
  clic(opzione(nodo, valore));
  if (p.inviati.length > prima) gesto(p, p.inviati.at(-1).azione.chiave, valore);
  return p.inviati.at(-1)?.azione.chiave;
};
const assestato = () => new Promise((fatto) => setImmediate(fatto));

test('G2-01 (A1) two unnamed twins answered one after the other send two keys, and after a reload both stay answered', () => {
  const p = pagina();
  const m1 = p.inMessaggio('m1', p.a.blocco(SCELTE, true));
  const k1 = clicca(p, m1, 'Continua'); // before its v1: no name yet
  p.a.aggiornaVersione(v1('b1', 'm1'));
  p.inMessaggio('m5', p.a.blocco(SCELTE, true, 'nome=b5')); p.a.aggiornaVersione(v1('b5', 'm5'));
  const m9 = p.inMessaggio('m9', p.a.blocco(SCELTE, true));
  assert.equal(libero(m9), true, 'm9 free: drawn after the gesture');
  const k9 = clicca(p, m9, 'Fermati qui');
  assert.equal(p.inviati.length, 2);
  assert.notEqual(k9, k1, 'the server keeps one action per key: the same key loses the second answer');
  const r = pagina();
  r.inMessaggio('m1', r.a.blocco(SCELTE, true));
  gesto(r, k1, 'Continua');
  r.a.aggiornaVersione(v1('b1', 'm1'));
  r.inMessaggio('m5', r.a.blocco(SCELTE, true, 'nome=b5')); r.a.aggiornaVersione(v1('b5', 'm5'));
  r.inMessaggio('m9', r.a.blocco(SCELTE, true));
  gesto(r, k9, 'Fermati qui');
  assert.deepEqual(stati(sezioneIn(r, 'm1')), C, 'm1 after reload');
  assert.equal(libero(sezioneIn(r, 'm5')), true, 'm5 after reload');
  assert.deepEqual(stati(sezioneIn(r, 'm9')), F, 'm9 after reload');
});

test('G2-02 (A2) old chat with no names: a live click on m1 leaves m2 free, on the page and after a reload', () => {
  const p = pagina();
  const m1 = p.inMessaggio('m1', p.a.blocco(SCELTE, true));
  p.inMessaggio('m2', p.a.blocco(SCELTE, true));
  const k = clicca(p, m1, 'Continua');
  const pagine = [stati(sezioneIn(p, 'm1')), libero(sezioneIn(p, 'm2'))];
  const r = pagina();
  r.inMessaggio('m1', r.a.blocco(SCELTE, true));
  r.inMessaggio('m2', r.a.blocco(SCELTE, true));
  gesto(r, k, 'Continua');
  assert.deepEqual(pagine, [C, true], 'page');
  assert.deepEqual([stati(sezioneIn(r, 'm1')), libero(sezioneIn(r, 'm2'))], pagine, 'the reload says what the page said');
});

test('G2-03 (A3) a «ready» chat comes back with no replay: its answered block stays answered and a new twin is born free', () => {
  for (const conPosto of [false, true]) {
    const p = pagina({ conPosto });
    const m1 = p.inMessaggio('m1', p.a.blocco(SCELTE, true));
    clicca(p, m1, 'Continua');
    const pagina1 = p.messaggi.get('m1');
    pagina1.remove(); // to s2: the host parks s1's page and, in the same entry, the hook's state (round 3, D1)
    const parcheggiato = p.a.parcheggia();
    p.a.azzera();
    p.passaA('s2');
    p.a.azzera(); // back to s1, a ready chat: no replay
    p.passaA('s1');
    assert.equal(p.a.ripristina(parcheggiato), true, `${conPosto}: the parked state comes back`);
    p.document.body.append(pagina1);
    const nuovo = p.inMessaggio('m2', p.a.blocco(SCELTE, true));
    assert.equal(libero(nuovo), true, `${conPosto}: the later twin is a new question`);
    assert.deepEqual(stati(sezioneIn(p, 'm1')), C, `${conPosto}: m1 still answered`);
    clic(opzione(sezioneIn(p, 'm1'), 'Fermati qui'));
    assert.equal(p.inviati.length, 1, `${conPosto}: one click, one message`);
  }
});

test('G2-04 a click on the open chat\'s own row touches nothing in the hook (round 3): its gestures stay', () => {
  const p = pagina({ conPosto: false });
  p.inMessaggio('m1', p.a.blocco(SCELTE, true));
  p.inMessaggio('m2', p.a.blocco(SCELTE, true));
  clicca(p, sezioneIn(p, 'm1'), 'Continua');
  gesto(p, K('s1'), 'Continua'); // the event replayed by the stream after its last sequence: the same owner
  assert.equal(libero(sezioneIn(p, 'm2')), true, 'm2 stays free');
  assert.equal(typeof p.a.riprendi, 'undefined', 'no parking by chat id any more: it lives in the ready page');
});

test('AV1 old chat, unnamed form clicked on this page, then the message is redrawn whole: still one click, one message', () => {
  const p = pagina({ conPosto: false });
  const vecchio = p.inMessaggio('m1', p.a.blocco(SCELTE, true));
  clic(opzione(vecchio, 'Continua'));
  assert.equal(p.inviati.length, 1);
  gesto(p, K('s1'), 'Continua');
  const nuovo = p.a.blocco(SCELTE, true);
  p.messaggi.get('m1').replaceChildren(nuovo);
  clic(opzione(nuovo, 'Fermati qui'));
  assert.equal(p.inviati.length, 1, 'answered form reopened after a whole redraw');
  assert.deepEqual(stati(nuovo), C, 'and it shows the answer given');
});

test('AV2 old chat after reload: journal gesture, then the message is redrawn whole', async () => {
  const p = pagina({ conPosto: false });
  p.inMessaggio('m1', p.a.blocco(SCELTE, true));
  gesto(p, K('s1'), 'Continua');
  const nuovo = p.a.blocco(SCELTE, true);
  p.messaggi.get('m1').replaceChildren(nuovo);
  await assestato();
  assert.deepEqual(stati(nuovo), C, 'shown answered once on the page');
  clic(opzione(nuovo, 'Fermati qui'));
  assert.equal(p.inviati.length, 0, 'answered form reopened after a whole redraw');
});

test('G2-05 place key: a whole redraw of an answered block shows it answered, and a click sends nothing', async () => {
  const p = pagina();
  const vecchio = p.inMessaggio('m1', p.a.blocco(SCELTE, true));
  clicca(p, vecchio, 'Continua');
  const nuovo = p.a.blocco(SCELTE, true);
  p.messaggi.get('m1').replaceChildren(nuovo);
  await assestato();
  assert.deepEqual(stati(nuovo), C);
  clic(opzione(nuovo, 'Fermati qui'));
  assert.equal(p.inviati.length, 1);
});

test('G2-06 two twins in the same message: a live click locks only the clicked one, on the page and after a reload', () => {
  const p = pagina();
  p.inMessaggio('m1', p.a.blocco(SCELTE, true));
  const secondo = p.inMessaggio('m1', p.a.blocco(SCELTE, true));
  const k = clicca(p, secondo, 'Fermati qui');
  assert.equal(libero(sezioneIn(p, 'm1', 0)), true, 'page: the first is free');
  assert.deepEqual(stati(sezioneIn(p, 'm1', 1)), F, 'page: the second answered');
  const r = pagina();
  r.inMessaggio('m1', r.a.blocco(SCELTE, true));
  r.inMessaggio('m1', r.a.blocco(SCELTE, true));
  gesto(r, k, 'Fermati qui');
  assert.equal(libero(sezioneIn(r, 'm1', 0)), true, 'reload: the first is free');
  assert.deepEqual(stati(sezioneIn(r, 'm1', 1)), F, 'reload: the second answered');
});

test('G2-07 an OLD key from the journal after two twins in one message locks both (277: the twins drawn before it)', () => {
  const r = pagina();
  r.inMessaggio('m1', r.a.blocco(SCELTE, true));
  r.inMessaggio('m1', r.a.blocco(SCELTE, true));
  gesto(r, K('s1'), 'Continua');
  assert.deepEqual(stati(sezioneIn(r, 'm1', 0)), C);
  assert.deepEqual(stati(sezioneIn(r, 'm1', 1)), C);
  const dopo = r.inMessaggio('m2', r.a.blocco(SCELTE, true));
  assert.equal(libero(dopo), true, 'never the twins drawn after it');
});

test('G2-08 the place key is the message and the index; over the server cap (400) the old key stays', () => {
  const p = pagina();
  const m = p.inMessaggio('m 1#x', p.a.blocco(SCELTE, true));
  assert.equal(clicca(p, m, 'Continua'), `posto:${encodeURIComponent('m 1#x')}@0#prossimo`);
  const q = pagina();
  const lungo = 'x'.repeat(390);
  const n = q.inMessaggio(lungo, q.a.blocco(SCELTE, true));
  assert.equal(clicca(q, n, 'Continua'), K('s1'));
});

test('G2-09 place key: a tail redraw (old shell removed first) stays answered at once', () => {
  const p = pagina();
  clicca(p, p.inMessaggio('m1', p.a.blocco(SCELTE, true)), 'Continua');
  sezioneIn(p, 'm1').remove();
  const ri = p.inMessaggio('m1', p.a.blocco(SCELTE, true));
  assert.deepEqual(stati(ri), C);
});

test('G2-10 the same words in ANOTHER message after the answered one left the page: free once on the page', async () => {
  for (const conPosto of [false, true]) {
    const p = pagina({ conPosto });
    clicca(p, p.inMessaggio('m1', p.a.blocco(SCELTE, true)), 'Continua');
    await assestato();
    p.messaggi.get('m1').remove(); // the message is deleted
    const nuovo = p.inMessaggio('m2', p.a.blocco(SCELTE, true));
    await assestato();
    assert.equal(libero(nuovo), true, `${conPosto}: a new message is a new question`);
    clic(opzione(nuovo, 'Fermati qui'));
    assert.equal(p.inviati.length, 2, `${conPosto}: its click is its own message`);
  }
});

test('G2-11 a place key from the journal locks the shell drawn later at that place (whole redraw before the gesture settles)', async () => {
  const r = pagina();
  r.inMessaggio('m1', r.a.blocco(SCELTE, true));
  r.inMessaggio('m1', r.a.blocco(SCELTE, true));
  gesto(r, 'posto:m1@1#prossimo', 'Fermati qui');
  const a = r.a.blocco(SCELTE, true);
  const b = r.a.blocco(SCELTE, true);
  r.messaggi.get('m1').replaceChildren(a, b);
  await assestato();
  assert.equal(libero(a), true);
  assert.deepEqual(stati(b), F);
});

test('G2-12 the host gives the hook the message of a shell and restores the parked gestures with THAT ready page (round 3)', () => {
  const app = readFileSync(new URL('../../src/legacy/app.js', import.meta.url), 'utf8');
  assert.match(app, /messaggioDelNodo: \(nodo\) => \{\s*for \(let n = nodo; n; n = n\.parentNode\) \{\s*const id = idDelMessaggioReale\.get\(n\);\s*if \(id !== undefined && state\.realSession\.messageElements\?\.get\?\.\(id\) === n\) return id;/u);
  assert.match(app, /state\.realSession\.messageElements\.set\(messageId, article\);\s*idDelMessaggioReale\.set\(article, messageId\);/u);
  const parcheggia = app.slice(app.indexOf('function parcheggiaChatAperta() {'), app.indexOf('function rimettiChatPronta(voce) {'));
  assert.ok(parcheggia.indexOf('frammento.append(...colonna.childNodes)') < parcheggia.indexOf('aggancioDeiBlocchi?.parcheggia()'), 'after the page left');
  assert.match(parcheggia, /passi: passiDelGiro\?\.istantanea\(\) \?\? null,\s*blocchi: aggancioDeiBlocchi\?\.parcheggia\(\) \?\? null \}/u);
  const rimetti = app.slice(app.indexOf('function rimettiChatPronta(voce) {'), app.indexOf('function rimettiChatPronta(voce) {') + 300);
  assert.match(rimetti, /aggancioDeiBlocchi\?\.ripristina\(voce\.moduli\.blocchi\)/u);
  assert.doesNotMatch(app, /aggancioDeiBlocchi\?\.riprendi\(/u);
  const stessa = app.slice(app.indexOf('if (sessionId === state.realSession.id && !forza) {'), app.indexOf('if (sessionId === state.realSession.id && !forza) {') + 600);
  assert.doesNotMatch(stessa.slice(0, stessa.indexOf('return;')), /aggancioDeiBlocchi/u, 'the open chat\'s own row: no reset');
});

test('G2-13 the answered shell leaves (tail removal) and the same words come in ANOTHER message: free, and its click is sent', async () => {
  for (const conPosto of [false, true]) {
    const p = pagina({ conPosto });
    clicca(p, p.inMessaggio('m1', p.a.blocco(SCELTE, true)), 'Continua');
    await assestato();
    sezioneIn(p, 'm1').remove();
    const nuovo = p.inMessaggio('m2', p.a.blocco(SCELTE, true));
    await assestato();
    assert.equal(libero(nuovo), true, `${conPosto}: not the block that left`);
    clic(opzione(nuovo, 'Fermati qui'));
    assert.equal(p.inviati.length, 2, `${conPosto}: one click, one message`);
  }
});

test('G2-14 both twins of a message leave and come back: the first is free again, the answered second stays answered', async () => {
  for (const conPosto of [false, true]) {
    const p = pagina({ conPosto });
    p.inMessaggio('m1', p.a.blocco(SCELTE, true));
    clicca(p, p.inMessaggio('m1', p.a.blocco(SCELTE, true)), 'Fermati qui');
    await assestato();
    sezioniIn(p, 'm1').forEach((x) => x.remove());
    const primo = p.inMessaggio('m1', p.a.blocco(SCELTE, true));
    const secondo = p.inMessaggio('m1', p.a.blocco(SCELTE, true));
    await assestato();
    assert.equal(libero(primo), true, `${conPosto}: the first`);
    assert.deepEqual(stati(secondo), F, `${conPosto}: the second`);
    clic(opzione(secondo, 'Continua'));
    assert.equal(p.inviati.length, 1, `${conPosto}: the answered one sends nothing`);
    clic(opzione(primo, 'Continua'));
    assert.equal(p.inviati.length, 2, `${conPosto}: the free one sends`);
  }
});

test('G2-15 a block born live and clicked sends its place key', () => {
  const p = pagina();
  const nodo = arrivaVivo(p, 'm1');
  assert.equal(clicca(p, nodo, 'Continua'), 'posto:m1@0#prossimo');
  assert.deepEqual(stati(nodo), C);
});

test('G2-16 a parked chat keeps its last v1: a journal gesture after the switch back goes to the response still waiting for its v1', () => {
  const p = pagina({ conPosto: false });
  p.inMessaggio('m1', p.a.blocco(SCELTE, true, 'nome=b1')); p.a.aggiornaVersione(v1('b1', 'm1'));
  p.inMessaggio('m5', p.a.blocco(SCELTE, true, 'nome=b5')); p.a.aggiornaVersione(v1('b5', 'm5'));
  p.inMessaggio('m9', p.a.blocco(SCELTE, true));
  const parcheggiato = p.a.parcheggia();
  p.a.azzera();
  assert.equal(p.a.ripristina(parcheggiato), true);
  gesto(p, K('s1'), 'Fermati qui');
  assert.equal(libero(sezioneIn(p, 'm1')), true, 'm1');
  assert.equal(libero(sezioneIn(p, 'm5')), true, 'm5');
  assert.deepEqual(stati(sezioneIn(p, 'm9')), F, 'm9');
});

test('G2-17 the place is counted in the whole message, also when the host wraps each block', () => {
  const p = pagina();
  for (let i = 0; i < 2; i += 1) {
    const involucro = p.document.createElement('div');
    involucro.append(p.a.blocco(SCELTE, true));
    p.inMessaggio('m1', involucro);
  }
  assert.equal(clicca(p, sezioneIn(p, 'm1', 1), 'Continua'), 'posto:m1@1#prossimo');
  assert.equal(libero(sezioneIn(p, 'm1', 0)), true);
});

test('G2-18 a place key from the journal before its shell: the shell is locked, and its v1 does not free it', async () => {
  const r = pagina();
  gesto(r, 'posto:m1@0#prossimo', 'Continua');
  r.inMessaggio('m1', r.a.blocco(SCELTE, true));
  await assestato();
  assert.deepEqual(stati(sezioneIn(r, 'm1')), C, 'locked');
  r.a.aggiornaVersione(v1('b1', 'm1'));
  await assestato();
  assert.deepEqual(stati(sezioneIn(r, 'm1')), C, 'still locked after its v1');
});

test('G2-19 a place key from the journal, the shell clicked before it settles: nothing is sent', () => {
  const r = pagina();
  gesto(r, 'posto:m1@0#prossimo', 'Continua');
  const nodo = r.inMessaggio('m1', r.a.blocco(SCELTE, true));
  clic(opzione(nodo, 'Fermati qui'));
  assert.equal(r.inviati.length, 0);
  assert.deepEqual(stati(nodo), C);
});

test('G2-20 a later twin at the index an answered twin had before an earlier one left: free', async () => {
  const p = pagina({ conPosto: false });
  p.inMessaggio('m1', p.a.blocco(SCELTE, true));
  clicca(p, p.inMessaggio('m1', p.a.blocco(SCELTE, true)), 'Fermati qui');
  await assestato();
  sezioneIn(p, 'm1', 0).remove();
  const nuovo = p.inMessaggio('m1', p.a.blocco(SCELTE, true));
  await assestato();
  assert.equal(libero(nuovo), true);
  assert.deepEqual(stati(sezioneIn(p, 'm1', 0)), F, 'the answered one is still answered');
});

test('G2-21 a whole redraw matches each shell by its index, whatever order the shells were drawn in', async () => {
  const p = pagina({ conPosto: false });
  const b = p.a.blocco(SCELTE, true);
  const a = p.a.blocco(SCELTE, true);
  p.inMessaggio('m1', a); p.inMessaggio('m1', b);
  await assestato();
  clicca(p, a, 'Continua');
  const a2 = p.a.blocco(SCELTE, true);
  const b2 = p.a.blocco(SCELTE, true);
  p.messaggi.get('m1').replaceChildren(a2, b2);
  await assestato();
  assert.deepEqual(stati(a2), C, 'the clicked one');
  assert.equal(libero(b2), true, 'the other');
  clic(opzione(b2, 'Fermati qui'));
  assert.equal(p.inviati.length, 2);
});

test('G2-22 a whole redraw that puts DIFFERENT words at the answered place: a new question', async () => {
  const p = pagina({ conPosto: false });
  clicca(p, p.inMessaggio('m1', p.a.blocco(SCELTE, true)), 'Continua');
  await assestato();
  const altro = p.a.blocco(ALTRO, true);
  p.messaggi.get('m1').replaceChildren(altro);
  await assestato();
  assert.equal(libero(altro), true);
  clic(opzione(altro, 'Fermati qui'));
  assert.equal(p.inviati.length, 2);
});

test('G2-23 (round 3, N3) the parked state has no cap of its own: it lives in the ready page\'s entry, and a bad one is refused', () => {
  const p = pagina({ conPosto: false });
  assert.equal(p.a.ripristina(null), false);
  assert.equal(p.a.ripristina({ raccolte: [] }), false);
  assert.equal(p.a.ripristina(p.a.parcheggia()), true);
  const src = readFileSync(new URL('../../src/components/blocchi/aggancio.js', import.meta.url), 'utf8');
  assert.doesNotMatch(src, /CHAT_PARCHEGGIATE|parcheggiate\b/u);
});

/* the mutant probes of AVVERSARIO-mutanti (5ed5a76d2), copied as they are: old keys, no host message lookup */
test('P7 a different text with the same id after the last v1 does not turn on dopo (277 for a G-B3 era key)', () => {
  const r = pagina({ conPosto: false });
  r.inMessaggio('m1', r.a.blocco(SCELTE, true, 'nome=b1')); r.a.aggiornaVersione(v1('b1', 'm1'));
  r.inMessaggio('m5', r.a.blocco(SCELTE, true, 'nome=b5')); r.a.aggiornaVersione(v1('b5', 'm5'));
  r.inMessaggio('m9', r.a.blocco(ALTRO, true));
  gesto(r, K('s1'), 'Continua');
  assert.deepEqual(stati(sezioneIn(r, 'm1')), C, 'm1 locked');
  assert.deepEqual(stati(sezioneIn(r, 'm5')), C, 'm5 locked');
});

test('P9 fork: parent key while streaming, own key after close: the first stays shown', () => {
  const p = pagina({ sessione: 's1-ramo', conPosto: false });
  p.inMessaggio('m1', p.a.blocco(SCELTE.slice(0, 20), false));
  gesto(p, K('s1'), 'Fermati qui');
  p.a.blocco(SCELTE, true);
  gesto(p, K('s1-ramo'), 'Continua');
  assert.deepEqual(stati(sezioneIn(p, 'm1')), F);
  const r = pagina({ sessione: 's1-ramo', conPosto: false });
  r.inMessaggio('m1', r.a.blocco(SCELTE.slice(0, 20), false));
  gesto(r, K('s1'), 'Fermati qui');
  r.a.blocco(SCELTE, true);
  gesto(r, K('s1-ramo'), 'Continua');
  r.messaggi.get('m1').querySelectorAll('section').forEach((x) => x.remove());
  const ri = r.inMessaggio('m1', r.a.blocco(SCELTE, true));
  assert.deepEqual(stati(ri), F, 'redraw keeps the first');
});

test('P5 click on an old unnamed twin while a newer twin waits for its v1: its tail redraw stays locked', () => {
  const p = pagina({ conPosto: false });
  p.inMessaggio('m1', p.a.blocco(SCELTE, true));
  p.inMessaggio('m5', p.a.blocco(SCELTE, true, 'nome=b5')); p.a.aggiornaVersione(v1('b5', 'm5'));
  p.inMessaggio('m9', p.a.blocco(SCELTE, true));
  clic(opzione(sezioneIn(p, 'm1'), 'Continua'));
  gesto(p, p.inviati[0].azione.chiave, 'Continua');
  sezioneIn(p, 'm1').remove();
  const ri = p.inMessaggio('m1', p.a.blocco(SCELTE, true));
  assert.deepEqual(stati(ri), C);
});

test('P8 a named block redrawn after its v1 is not a twin after the last v1', () => {
  const r = pagina({ conPosto: false });
  r.inMessaggio('m1', r.a.blocco(SCELTE, true, 'nome=b1')); r.a.aggiornaVersione(v1('b1', 'm1'));
  sezioneIn(r, 'm1').remove();
  r.inMessaggio('m1', r.a.blocco(SCELTE, true, 'nome=b1'));
  gesto(r, K('s1'), 'Continua');
  assert.deepEqual(stati(sezioneIn(r, 'm1')), C);
});

test('P17 a named tail redraw never takes the order of an answered unnamed twin', () => {
  const p = pagina({ conPosto: false });
  p.inMessaggio('m1', p.a.blocco(SCELTE, true));
  gesto(p, K('s1'), 'Continua');
  assert.deepEqual(stati(sezioneIn(p, 'm1')), C, 'premise');
  sezioneIn(p, 'm1').remove();
  const nuovo = p.inMessaggio('m2', p.a.blocco(SCELTE, true, 'nome=b2'));
  assert.equal(libero(nuovo), true, 'a later named message is free');
});

test('P16 of two answered twins out of the page, the redraw takes the most recent one', () => {
  const p = pagina({ sessione: 's1-ramo', conPosto: false });
  p.inMessaggio('m1', p.a.blocco(SCELTE, true));
  gesto(p, K('s1'), 'Continua');
  p.inMessaggio('m2', p.a.blocco(SCELTE, true));
  gesto(p, K('s1-ramo'), 'Fermati qui');
  assert.deepEqual(stati(sezioneIn(p, 'm1')), C, 'premise m1');
  assert.deepEqual(stati(sezioneIn(p, 'm2')), F, 'premise m2');
  sezioneIn(p, 'm1').remove(); sezioneIn(p, 'm2').remove();
  const ri = p.inMessaggio('m2', p.a.blocco(SCELTE, true));
  assert.deepEqual(stati(ri), F);
});

test('P20 old chat with no names: a click on a live twin does not lock the earlier unanswered twin', () => {
  const p = pagina({ conPosto: false });
  p.inMessaggio('m1', p.a.blocco(SCELTE, true));
  const l2 = arrivaVivo(p, 'm2');
  clic(opzione(l2, 'Fermati qui'));
  gesto(p, p.inviati[0].azione.chiave, 'Fermati qui');
  assert.equal(libero(sezioneIn(p, 'm1')), true, 'm1 free');
  assert.deepEqual(stati(sezioneIn(p, 'm2')), F, 'm2 locked');
});
