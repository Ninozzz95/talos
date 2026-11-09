/*
 * Cura 288 (owner 06/11/2026 09:08): decision 277 for EVERY chat. R1-R14 are the probes of the Desktop's adversarial review of G-BG2 +
 * G-BG3 (desktop/in-corso/REVISIONE-UIG-BG2-BG3-SONDE-2026-11-06.test.mjs), copied as they are: R5 (defect 1), R8 (defect 2), R12 and
 * R13 (the gap: old chats with no names, and their forks) were red on c66f19253. R15-R17 are the cure's own guards.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { documento, clic, orologio, spento } from './aiuto-dom-blocchi.mjs';
import { impostaLingua } from '../../src/components/lingua.js';
import { creaAggancioBlocchi, impronta, EVENTO_VERSIONE_DEL_BLOCCO } from '../../src/components/blocchi/aggancio.js';

impostaLingua('it');
const SCELTE = readFileSync(new URL('../../../tests/fixtures/blocchi/03-scelte.txt', import.meta.url), 'utf8').trim();
function pagina({ sessione = 's1' } = {}) {
  const document = documento();
  const inviati = [];
  let corrente = sessione;
  const messaggi = new Map();
  const a = creaAggancioBlocchi({ document, sessione: () => corrente, timer: orologio().timer,
    consegna: (testo, azione) => inviati.push({ testo, azione }), elementoDelMessaggio: (id) => messaggi.get(id) ?? null });
  const inMessaggio = (id, nodo) => {
    let m = messaggi.get(id);
    if (!m) { m = document.createElement('article'); messaggi.set(id, m); document.body.append(m); }
    m.append(nodo);
    return nodo;
  };
  return { a, document, inviati, messaggi, inMessaggio, passaA: (s) => { corrente = s; } };
}
const v1 = (nome, messaggio) => ({ type: 'CUSTOM', name: EVENTO_VERSIONE_DEL_BLOCCO,
  value: { blocco: nome, versione: 1, sorgente: SCELTE, messaggio, posizione: 0, quando: '2026-11-06T00:00:00.000Z' } });
const arrivaVivo = (p, id) => { p.inMessaggio(id, p.a.blocco(SCELTE.slice(0, 20), false)); return p.a.blocco(SCELTE, true); };
const sezioneIn = (p, id) => p.messaggi.get(id).querySelectorAll('section').find((x) => x.classList.contains('gu'));
const opzioni = (nodo) => nodo.querySelectorAll('.gu-scelte button');
const opzione = (nodo, t) => opzioni(nodo).find((b) => b.dataset.scelta === t);
const stati = (nodo) => opzioni(nodo).map((b) => [b.dataset.scelta, spento(b), b.getAttribute('aria-pressed')]);
const libero = (nodo) => opzioni(nodo).every((b) => !spento(b)) && !opzioni(nodo).some((b) => b.hasAttribute('aria-pressed'));
const K = (s) => `${s}:${impronta(SCELTE)}#prossimo`;
const C = [['Continua', true, 'true'], ['Fermati qui', true, 'false']];
const F = [['Continua', true, 'false'], ['Fermati qui', true, 'true']];
const gesto = (p, chiave, valore) => { p.a.spegni(chiave, { tipo: 'scelte', valore }); p.a.spegni(chiave, { tipo: 'scelte' }); };

/* R1 (8q, own variant): fork, both twins named by the FENCE, the fork's own old key after its twin; then a reload */
test('R1 fork: fence-named twin m9 keeps the fork own old-key answer, page and reload', () => {
  const giro = (r) => {
    r.inMessaggio('m1', r.a.blocco(SCELTE, true, 'nome=b1'));
    r.a.aggiornaVersione(v1('b1', 'm1'));
    gesto(r, K('s1'), 'Continua');
    r.inMessaggio('m9', r.a.blocco(SCELTE, true, 'nome=b9'));
    r.a.aggiornaVersione(v1('b9', 'm9'));
    gesto(r, K('s1-ramo'), 'Fermati qui');
  };
  for (const r of [pagina({ sessione: 's1-ramo' }), pagina({ sessione: 's1-ramo' })]) {
    giro(r);
    assert.deepEqual(stati(sezioneIn(r, 'm1')), C, 'm1 parent answer');
    assert.deepEqual(stati(sezioneIn(r, 'm9')), F, 'm9 fork answer');
    clic(opzione(sezioneIn(r, 'm9'), 'Continua'));
    assert.equal(r.inviati.length, 0);
  }
});

/* R2 (5.8 regression, own variant): same chat, NOT a fork; unnamed twin bound by look-alike, own old key, then its v1 */
test('R2 same chat: unnamed twin locked by its own chat old key stays locked after its v1', () => {
  const p = pagina();
  p.inMessaggio('m1', p.a.blocco(SCELTE, true, 'nome=b1'));
  p.a.aggiornaVersione(v1('b1', 'm1'));
  p.inMessaggio('m9', p.a.blocco(SCELTE, true));
  assert.equal(sezioneIn(p, 'm9').dataset.nome, 'b1', 'premise: look-alike');
  gesto(p, K('s1'), 'Fermati qui');
  p.a.aggiornaVersione(v1('b9', 'm9'));
  assert.equal(sezioneIn(p, 'm9').dataset.nome, 'b9');
  assert.deepEqual(stati(sezioneIn(p, 'm9')), F);
  clic(opzione(sezioneIn(p, 'm9'), 'Continua'));
  assert.equal(p.inviati.length, 0);
});

/* R3 (5.8b after a chat switch and back, not a fresh reload): the raw memory is kept, the block is drawn locked at once (not a redraw) */
test('R3 5.8b after a chat switch and back: the twin stays locked after its v1', () => {
  const r = pagina({ sessione: 's1-ramo' });
  const giro = () => {
    r.inMessaggio('m1', r.a.blocco(SCELTE, true, 'nome=b1'));
    r.a.aggiornaVersione(v1('b1', 'm1'));
    r.inMessaggio('m9', r.a.blocco(SCELTE, true));
    gesto(r, K('s1-ramo'), 'Fermati qui');
    r.a.aggiornaVersione(v1('b9', 'm9'));
  };
  giro();
  assert.deepEqual(stati(sezioneIn(r, 'm9')), F, 'premise: first visit');
  r.a.azzera(); r.passaA('s2'); r.messaggi.clear();
  r.a.azzera(); r.passaA('s1-ramo'); r.messaggi.clear();
  giro();
  assert.deepEqual(stati(sezioneIn(r, 'm9')), F, 'after the switch back');
  clic(opzione(sezioneIn(r, 'm9'), 'Continua'));
  assert.equal(r.inviati.length, 0);
});

/* R4 (5.9 with a twin): the own old key replayed while the twin m9 still streams; then m9's v1 */
test('R4 a gesture replayed while a twin streams: still locked after its v1', () => {
  const p = pagina();
  p.inMessaggio('m1', p.a.blocco(SCELTE, true, 'nome=b1'));
  p.a.aggiornaVersione(v1('b1', 'm1'));
  p.inMessaggio('m9', p.a.blocco(SCELTE.slice(0, 20), false));
  gesto(p, K('s1'), 'Fermati qui');
  p.a.blocco(SCELTE, true);
  p.a.aggiornaVersione(v1('b9', 'm9'));
  assert.equal(sezioneIn(p, 'm9').dataset.nome, 'b9');
  assert.deepEqual(stati(sezioneIn(p, 'm9')), F);
  clic(opzione(sezioneIn(p, 'm9'), 'Continua'));
  assert.equal(p.inviati.length, 0);
});

/* R5 (today's click before the v1, not an old chat): two EARLIER unanswered twins must stay free */
test('R5 a click on a live twin before its v1 does not lock earlier, unanswered twins (page and reload)', () => {
  const p = pagina();
  p.inMessaggio('m1', p.a.blocco(SCELTE, true, 'nome=b1')); p.a.aggiornaVersione(v1('b1', 'm1'));
  p.inMessaggio('m5', p.a.blocco(SCELTE, true, 'nome=b5')); p.a.aggiornaVersione(v1('b5', 'm5'));
  const l9 = arrivaVivo(p, 'm9');
  clic(opzione(l9, 'Fermati qui'));
  const { chiave } = p.inviati[0].azione;
  assert.equal(chiave, K('s1'), 'premise: no name yet, the click uses the old key');
  gesto(p, chiave, 'Fermati qui'); // the bubble and the event come back
  p.a.aggiornaVersione(v1('b9', 'm9'));
  assert.deepEqual(stati(sezioneIn(p, 'm9')), F, 'm9 locked');
  assert.equal(libero(sezioneIn(p, 'm1')), true, 'm1 never answered: free on the page');
  assert.equal(libero(sezioneIn(p, 'm5')), true, 'm5 never answered: free on the page');
  /* reload: text m1, v1, text m5, v1, text m9, bubble+event, v1 b9 */
  const r = pagina();
  r.inMessaggio('m1', r.a.blocco(SCELTE, true, 'nome=b1')); r.a.aggiornaVersione(v1('b1', 'm1'));
  r.inMessaggio('m5', r.a.blocco(SCELTE, true, 'nome=b5')); r.a.aggiornaVersione(v1('b5', 'm5'));
  r.inMessaggio('m9', r.a.blocco(SCELTE, true));
  gesto(r, chiave, 'Fermati qui');
  r.a.aggiornaVersione(v1('b9', 'm9'));
  assert.deepEqual(stati(sezioneIn(r, 'm9')), F, 'reload: m9 locked');
  assert.equal(libero(sezioneIn(r, 'm1')), true, 'reload: m1 free');
  assert.equal(libero(sezioneIn(r, 'm5')), true, 'reload: m5 free');
});

/* R6 (8p): 5.2b's order (gesture before any block) gives the same result after a chat switch and back as on a fresh page */
test('R6 5.2b after a chat switch and back equals a fresh page', () => {
  const giro = (p) => {
    gesto(p, K('s1'), 'Continua');
    return [p.a.blocco(SCELTE, true, 'nome=b1'), p.a.blocco(SCELTE, true, 'nome=b2')];
  };
  const fresca = giro(pagina()).map(stati);
  const p = pagina();
  p.document.body.append(p.a.blocco(SCELTE, true, 'nome=b1'));
  p.a.azzera(); p.passaA('s2'); p.a.azzera(); p.passaA('s1');
  assert.deepEqual(giro(p).map(stati), fresca);
});

/* R7 (8s probe): a named key whose message id looks like an impronta must not count as an old key */
test('R7 a named-key gesture never locks a twin through the old-key index', () => {
  const p = pagina();
  p.inMessaggio('m1', p.a.blocco(SCELTE, true, 'nome=b1')); p.a.aggiornaVersione(v1('b1', 'm1'));
  p.inMessaggio('m2', p.a.blocco(SCELTE, true, 'nome=b2')); p.a.aggiornaVersione(v1('b2', 'm2'));
  gesto(p, 'nome:b2@m2#prossimo', 'Fermati qui');
  gesto(p, `nome:b7@x:${impronta(SCELTE)}#prossimo`, 'Continua');
  assert.equal(libero(sezioneIn(p, 'm1')), true);
  assert.deepEqual(stati(sezioneIn(p, 'm2')), F);
});

/* R8 (prima filter, hand-built order): a key arriving while the block streams (prima false), then a different key after it closes */
test('R8 the answer shown keeps the gesture received while streaming after the v1 binds', () => {
  const p = pagina({ sessione: 's1-ramo' });
  p.inMessaggio('m1', p.a.blocco(SCELTE.slice(0, 20), false));
  gesto(p, K('s1-ramo'), 'Fermati qui');
  p.a.blocco(SCELTE, true);
  assert.deepEqual(stati(sezioneIn(p, 'm1')), F, 'premise: 5.9');
  gesto(p, K('s1'), 'Continua');
  p.a.aggiornaVersione(v1('b1', 'm1'));
  assert.deepEqual(stati(sezioneIn(p, 'm1')), F, 'the shown answer does not change on the v1');
});

/* R9 (t2): two tilde keys for the same name in one chat, the first wins */
test('R9 two tilde keys for one name: the first one is shown', () => {
  const p = pagina({ sessione: 's1-ramo' });
  p.inMessaggio('m1', p.a.blocco(SCELTE, true, 'nome=b2'));
  gesto(p, 'nome:b2@~s1#prossimo', 'Continua');
  gesto(p, 'nome:b2@~s1-ramo#prossimo', 'Fermati qui');
  p.a.aggiornaVersione(v1('b2', 'm1'));
  assert.deepEqual(stati(sezioneIn(p, 'm1')), C);
});

/* R10 (two chats with the same text): an old key replayed in s1 never reaches s2 after a switch */
test('R10 two chats with the same text: s1 old key does not lock s2', () => {
  const p = pagina();
  p.inMessaggio('m1', p.a.blocco(SCELTE, true, 'nome=b1')); p.a.aggiornaVersione(v1('b1', 'm1'));
  gesto(p, K('s1'), 'Continua');
  p.a.azzera(); p.passaA('s2'); p.messaggi.clear();
  p.inMessaggio('m1', p.a.blocco(SCELTE, true, 'nome=b1')); p.a.aggiornaVersione(v1('b1', 'm1'));
  p.inMessaggio('m2', p.a.blocco(SCELTE, true)); p.a.aggiornaVersione(v1('b2', 'm2'));
  assert.equal(libero(sezioneIn(p, 'm1')), true);
  assert.equal(libero(sezioneIn(p, 'm2')), true);
});

/* R11 (a named and an unnamed fence, same text): the gesture between them; the later unnamed one, with its v1, is free */
test('R11 a named twin before and an unnamed twin after the old key: before locked, after free', () => {
  const p = pagina();
  p.inMessaggio('m1', p.a.blocco(SCELTE, true, 'nome=b1')); p.a.aggiornaVersione(v1('b1', 'm1'));
  gesto(p, K('s1'), 'Continua');
  p.inMessaggio('m2', p.a.blocco(SCELTE, true));
  p.a.aggiornaVersione(v1('b2', 'm2'));
  assert.deepEqual(stati(sezioneIn(p, 'm1')), C);
  assert.equal(libero(sezioneIn(p, 'm2')), true);
});

/* R12 (unnamed old chat): an old key locks an unnamed twin of a LATER message (decision 277 says never) */
test('R12 old chat with no names: the twin of a later message stays free', () => {
  const p = pagina();
  p.inMessaggio('m1', p.a.blocco(SCELTE, true));
  gesto(p, K('s1'), 'Continua');
  p.inMessaggio('m2', p.a.blocco(SCELTE, true));
  assert.deepEqual(stati(sezioneIn(p, 'm1')), C);
  assert.equal(libero(sezioneIn(p, 'm2')), true);
});

/* R13 (fork of an old chat with no names): the parent's answered block stays locked in the fork (decision 277) */
test('R13 fork of an old chat with no names: the parent answered twin is locked', () => {
  const f = pagina({ sessione: 's1-ramo' });
  f.inMessaggio('m1', f.a.blocco(SCELTE, true));
  gesto(f, K('s1'), 'Continua');
  assert.deepEqual(stati(sezioneIn(f, 'm1')), C);
});

/* R14 (aimed at R-08, redraw with a new order): fork, unnamed-fence twin m9 drawn, then the parent's key and the fork's own key; then its v1.
   m9 was drawn before both: it shows the FIRST one after it (the parent's), as 5.2d (d3) says */
test('R14 unnamed-fence twin drawn before two old keys keeps the first after its v1', () => {
  const p = pagina({ sessione: 's1-ramo' });
  p.inMessaggio('m9', p.a.blocco(SCELTE, true));
  gesto(p, K('s1'), 'Continua');
  gesto(p, K('s1-ramo'), 'Fermati qui');
  p.a.aggiornaVersione(v1('b9', 'm9'));
  assert.deepEqual(stati(sezioneIn(p, 'm9')), C);
});

/* R15 (cura 288, `dopo`): an old chat from before G-B3 (m1, no name, never a v1) continued today (m5 named), then a click on the
   live twin m9 before its v1; after a reload m1 is free: the gesture came after the last v1 and m9 is the only twin drawn after it */
test('R15 old unnamed twin of a pre-names chat stays free when today a live twin is clicked before its v1 (reload)', () => {
  const r = pagina();
  r.inMessaggio('m1', r.a.blocco(SCELTE, true));
  r.inMessaggio('m5', r.a.blocco(SCELTE, true, 'nome=b5')); r.a.aggiornaVersione(v1('b5', 'm5'));
  r.inMessaggio('m9', r.a.blocco(SCELTE, true));
  gesto(r, K('s1'), 'Fermati qui');
  r.a.aggiornaVersione(v1('b9', 'm9'));
  assert.deepEqual(stati(sezioneIn(r, 'm9')), F, 'm9 locked');
  assert.equal(libero(sezioneIn(r, 'm1')), true, 'm1 free');
  assert.equal(libero(sezioneIn(r, 'm5')), true, 'm5 free');
});

/* R16 (AL CONTRARIO of R5's reload): a G-B3-era click AFTER the v1 (old key, every twin already named, no twin after the last v1)
   locks every twin drawn before it, as decision 277 says */
test('R16 an old key after the last v1 with no new twin locks every named twin drawn before it', () => {
  const r = pagina();
  r.inMessaggio('m1', r.a.blocco(SCELTE, true, 'nome=b1')); r.a.aggiornaVersione(v1('b1', 'm1'));
  r.inMessaggio('m5', r.a.blocco(SCELTE, true, 'nome=b5')); r.a.aggiornaVersione(v1('b5', 'm5'));
  gesto(r, K('s1'), 'Continua');
  r.inMessaggio('m9', r.a.blocco(SCELTE, true, 'nome=b9')); r.a.aggiornaVersione(v1('b9', 'm9'));
  assert.deepEqual(stati(sezioneIn(r, 'm1')), C);
  assert.deepEqual(stati(sezioneIn(r, 'm5')), C);
  assert.equal(libero(sezioneIn(r, 'm9')), true, 'm9 is a later message');
});

/* R17 (a click's owner ends with the chat): click m1 live in s1, switch to the fork s1-ramo, whose replay brings m1 and the parent's
   key: m1 is locked there too (277: forks replay the parent's keys), and a redraw that replaces it stays locked */
test('R17 after a switch to the fork, the parent click replayed locks the fork copy of its block; its redraw stays locked', () => {
  const p = pagina();
  p.inMessaggio('m1', p.a.blocco(SCELTE, true));
  clic(opzione(sezioneIn(p, 'm1'), 'Continua'));
  const { chiave } = p.inviati[0].azione;
  p.a.azzera(); p.passaA('s1-ramo'); p.messaggi.clear();
  p.inMessaggio('m1', p.a.blocco(SCELTE, true));
  gesto(p, chiave, 'Continua');
  const m1 = sezioneIn(p, 'm1');
  assert.deepEqual(stati(m1), C, 'the fork copy is locked');
  m1.remove();
  const ridisegno = p.inMessaggio('m1', p.a.blocco(SCELTE, true));
  assert.deepEqual(stati(ridisegno), C, 'its redraw stays locked');
  assert.equal(libero(p.inMessaggio('m2', p.a.blocco(SCELTE, true))), true, 'a later message in the fork is free');
});
