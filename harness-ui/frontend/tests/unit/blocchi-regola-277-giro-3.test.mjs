/*
 * Cura 288, round 3 (owner 06/11/2026, decisions 277 and 288: in EVERY chat a gesture locks its own block and the twins drawn BEFORE
 * it, never those drawn after; forks inherit locked; one click is one message; the page and a reload say the same thing). The second
 * adversarial review of 9c0200932 (desktop/in-corso/uig-unione-2026-11-06): N1-N4 are its probes ported here (N1/N2 a selection-mode
 * click reset the hook, N3 the hook's own cap of 8 parked chats apart from the ready pages' cap of 3, N4 a shell taken off the page by the
 * replay window in the same slice that drew it never got its place-key gesture), D1 the parked state now lives in the ready page's entry,
 * D4 the place lookup is linear, and one test per mutant the review left alive (M1, M8, M15, M16, M21, M22, M28, M38).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { documento, clic, orologio, spento } from './aiuto-dom-blocchi.mjs';
import { impostaLingua } from '../../src/components/lingua.js';
import { creaAggancioBlocchi, impronta, EVENTO_VERSIONE_DEL_BLOCCO } from '../../src/components/blocchi/aggancio.js';
import { creaChatPronte } from '../../src/components/chat-pronte.js';

impostaLingua('it');
const SCELTE = readFileSync(new URL('../../../tests/fixtures/blocchi/03-scelte.txt', import.meta.url), 'utf8').trim();
const APP = readFileSync(new URL('../../src/legacy/app.js', import.meta.url), 'utf8');
/* the host as legacy/app.js builds it (round 3, D4): article → message id, and «which message holds this shell» walks up the ancestors */
function pagina({ sessione = 's1', conPosto = true } = {}) {
  const document = documento();
  const inviati = [];
  let corrente = sessione;
  const messaggi = new Map();
  const idDi = new WeakMap();
  const conti = { chiamate: 0, passi: 0 };
  const a = creaAggancioBlocchi({ document, sessione: () => corrente, timer: orologio().timer,
    consegna: (testo, azione) => inviati.push({ testo, azione }), elementoDelMessaggio: (id) => messaggi.get(id) ?? null,
    ...(conPosto ? { messaggioDelNodo: (nodo) => {
      conti.chiamate += 1;
      for (let n = nodo; n; n = n.parentNode) {
        conti.passi += 1;
        const id = idDi.get(n);
        if (id !== undefined && messaggi.get(id) === n) return id;
      }
      return null;
    } } : {}) });
  const inMessaggio = (id, nodo) => {
    let m = messaggi.get(id);
    if (!m) { m = document.createElement('article'); messaggi.set(id, m); idDi.set(m, id); document.body.append(m); }
    m.append(nodo);
    return nodo;
  };
  /* the host's ready chats: page and hook state in ONE entry (legacy/app.js `parcheggiaChatAperta` / `rimettiChatPronta`) */
  const parcheggia = (registro) => {
    const pagine = [...messaggi.entries()];
    for (const [, m] of pagine) m.remove();
    registro.parcheggia(corrente, { nodi: 10, pagine, moduli: { blocchi: a.parcheggia() } });
  };
  const rimetti = (voce) => {
    a.ripristina(voce.moduli.blocchi);
    messaggi.clear();
    for (const [id, m] of voce.pagine) { messaggi.set(id, m); document.body.append(m); }
  };
  /* passaASessione: park (when ready), reset, then the ready page comes back with no replay, or the journal is replayed */
  const passaA = (s, registro = null) => {
    if (registro) parcheggia(registro);
    a.azzera();
    corrente = s;
    const pronta = registro?.prendi(s) ?? null;
    if (pronta) rimetti(pronta); else messaggi.clear();
    return pronta;
  };
  return { a, document, inviati, messaggi, conti, inMessaggio, passaA, parcheggia, rimetti, sessione: (s) => { corrente = s; } };
}
const v1 = (nome, messaggio, posizione = 0) => ({ type: 'CUSTOM', name: EVENTO_VERSIONE_DEL_BLOCCO,
  value: { blocco: nome, versione: 1, sorgente: SCELTE, messaggio, posizione, quando: '2026-11-06T00:00:00.000Z' } });
const sezioniIn = (p, id) => p.messaggi.get(id).querySelectorAll('section').filter((x) => x.classList.contains('gu'));
const sezioneIn = (p, id, i = 0) => sezioniIn(p, id)[i];
const opzioni = (nodo) => nodo.querySelectorAll('.gu-scelte button');
const opzione = (nodo, t) => opzioni(nodo).find((b) => b.dataset.scelta === t);
const stati = (nodo) => opzioni(nodo).map((b) => [b.dataset.scelta, spento(b), b.getAttribute('aria-pressed')]);
const libero = (nodo) => opzioni(nodo).every((b) => !spento(b)) && !opzioni(nodo).some((b) => b.hasAttribute('aria-pressed'));
const K = (s) => `${s}:${impronta(SCELTE)}#prossimo`;
const C = [['Continua', true, 'true'], ['Fermati qui', true, 'false']];
const F = [['Continua', true, 'false'], ['Fermati qui', true, 'true']];
const gesto = (p, chiave, valore) => { p.a.spegni(chiave, { tipo: 'scelte', valore }); p.a.spegni(chiave, { tipo: 'scelte' }); };
const clicca = (p, nodo, valore) => {
  const prima = p.inviati.length;
  clic(opzione(nodo, valore));
  if (p.inviati.length > prima) gesto(p, p.inviati.at(-1).azione.chiave, valore);
  return p.inviati.at(-1)?.azione.chiave;
};
const assestato = () => new Promise((fatto) => setImmediate(fatto));
const passaASessione = APP.slice(APP.indexOf('function passaASessione('), APP.indexOf('function passaASessione(') + 12000);

test('N1 (host) a selection-mode click and a click on the open chat\'s own row never reset the hook', () => {
  /* cura BG3 round 4 (E1): the reset lives in `nuovaGenerazioneSessione`, right after the parking; `passaASessione` reaches it only
     past its two early returns */
  const generazione = APP.slice(APP.indexOf('function nuovaGenerazioneSessione('), APP.indexOf('function nuovaGenerazioneSessione(') + 3000);
  const parcheggio = generazione.indexOf('if (!continua && parcheggia) parcheggiaChatAperta();');
  const azzera = generazione.indexOf('if (!continua) aggancioDeiBlocchi?.azzera();');
  assert.ok(parcheggio > 0 && azzera > parcheggio, 'the reset comes after the parking');
  const chiama = passaASessione.indexOf('const generation = nuovaGenerazioneSessione(');
  assert.ok(chiama > 0);
  assert.ok(passaASessione.indexOf('if (state.sessionSelection.active) {') < chiama, 'selection mode returns before the reset');
  assert.ok(passaASessione.indexOf('if (sessionId === state.realSession.id && !forza) {') < chiama, 'the open chat\'s own row returns before it');
  assert.equal(passaASessione.slice(0, chiama).includes('aggancioDeiBlocchi?.azzera();'), false, 'no reset before the change');
});

test('N1 (hook) with no reset, a tail redraw of the answered block stays answered: one click, one message', async () => {
  const p = pagina();
  const vecchio = p.inMessaggio('m1', p.a.blocco(SCELTE, true));
  assert.match(clicca(p, vecchio, 'Continua'), /^posto:/u);
  vecchio.remove();
  const nuovo = p.inMessaggio('m1', p.a.blocco(SCELTE, true));
  await assestato();
  clic(opzione(nuovo, 'Fermati qui'));
  assert.equal(p.inviati.length, 1);
  assert.deepEqual(stati(nuovo), C);
});

test('N2 an old key answered, then the chat is left and comes back ready: a NEW twin drawn after it is born free (277)', () => {
  const p = pagina();
  const registro = creaChatPronte();
  p.inMessaggio('m1', p.a.blocco(SCELTE, true));
  gesto(p, K('s1'), 'Continua');
  assert.deepEqual(stati(sezioneIn(p, 'm1')), C);
  p.passaA('s2', registro);
  assert.ok(p.passaA('s1', registro), 'ready: no replay');
  assert.deepEqual(stati(sezioneIn(p, 'm1')), C, 'm1 still answered');
  assert.equal(libero(p.inMessaggio('m9', p.a.blocco(SCELTE, true))), true, 'the later twin is a new question');
});

test('N3 the parked state shares the ready pages\' life: 9 chats left in between, ready or not, and the ready one comes back whole', () => {
  const p = pagina();
  const registro = creaChatPronte();
  p.inMessaggio('m1', p.a.blocco(SCELTE, true));
  gesto(p, K('s1'), 'Continua');
  p.passaA('s2', registro);
  for (let i = 3; i <= 10; i += 1) p.passaA(`s${i}`); // still loading: the host does not park them (`chatParcheggiabile`)
  assert.ok(p.passaA('s1', registro));
  assert.deepEqual(stati(sezioneIn(p, 'm1')), C, 'm1 still answered');
  assert.equal(libero(p.inMessaggio('m9', p.a.blocco(SCELTE, true))), true, 'the later twin is a new question');
  /* and when the registry drops the page, the state goes with it: the chat replays, nothing stale comes back */
  for (let i = 2; i <= 5; i += 1) { p.inMessaggio('x', p.a.blocco(SCELTE, true)); p.passaA(`s${i}`, registro); }
  assert.equal(registro.prendi('s1'), null, 'out of the three ready pages');
});

test('N4 replay window: the shell leaves the page before its place-key gesture arrives: locked, also once back', async () => {
  const p = pagina();
  const k = clicca(p, p.inMessaggio('m1', p.a.blocco(SCELTE, true)), 'Continua');
  const r = pagina();
  r.inMessaggio('m1', r.a.blocco(SCELTE, true));
  const art = r.messaggi.get('m1');
  art.remove(); // smontaTurnoPiuVecchioReplay, the same slice
  gesto(r, k, 'Continua');
  await assestato();
  assert.deepEqual(stati(sezioneIn(r, 'm1')), C, 'off the page already');
  r.document.body.append(art); // «Show earlier»: nothing left to settle, the place was read from the message while off the page
  await assestato();
  assert.deepEqual(stati(sezioneIn(r, 'm1')), C, 'answered, as on the page that clicked it');
  clic(opzione(sezioneIn(r, 'm1'), 'Fermati qui'));
  assert.equal(r.inviati.length, 0, 'one click, one message');
});

test('N4-click the shell drawn off the page AFTER its place-key gesture: locked before any click', async () => {
  const r = pagina();
  gesto(r, 'posto:m1@0#prossimo', 'Continua');
  const nodo = r.inMessaggio('m1', r.a.blocco(SCELTE, true));
  const art = r.messaggi.get('m1');
  art.remove(); // drawn and taken off in the same slice, before the microtask
  await assestato();
  r.document.body.append(art);
  assert.equal(libero(nodo), false, 'not shown free');
  clic(opzione(nodo, 'Fermati qui'));
  assert.equal(r.inviati.length, 0);
});

test('N4-base an old key from the journal on a shell off the page (no host message): locked, also once back', async () => {
  const r = pagina({ conPosto: false });
  r.inMessaggio('m1', r.a.blocco(SCELTE, true));
  const art = r.messaggi.get('m1');
  art.remove();
  await assestato();
  gesto(r, K('s1'), 'Continua');
  r.document.body.append(art);
  assert.deepEqual(stati(sezioneIn(r, 'm1')), C);
});

test('D1/X1 «Riprova» opens the fork (the parent parked with its state, no reset), then back from the bar: the parent as it was', () => {
  const p = pagina();
  const registro = creaChatPronte();
  const m1 = p.inMessaggio('m1', p.a.blocco(SCELTE, true));
  clicca(p, m1, 'Continua');
  p.parcheggia(registro); // nuovaGenerazioneSessione for the fork: parked, the hook not reset
  p.sessione('s1-ramo'); p.messaggi.clear();
  p.inMessaggio('m1', p.a.blocco(SCELTE, true));
  gesto(p, 'posto:m1@0#prossimo', 'Continua'); // the parent's key replayed in the fork (the shell is redrawn locked)
  assert.deepEqual(stati(sezioneIn(p, 'm1')), C, 'the fork inherits locked');
  assert.equal(libero(p.inMessaggio('m9', p.a.blocco(SCELTE, true))), true, 'the regenerated twin is free');
  assert.ok(p.passaA('s1', registro), 'back from the bar: ready');
  assert.equal(sezioneIn(p, 'm1'), m1);
  assert.deepEqual(stati(m1), C);
  clic(opzione(m1, 'Fermati qui'));
  assert.equal(p.inviati.length, 1, 'one click, one message');
  assert.equal(libero(p.inMessaggio('m10', p.a.blocco(SCELTE, true))), true, 'a later twin in the parent is free');
});

test('M38 a fork\'s own click on an inherited shell never reaches the parent when it comes back ready (same message ids)', () => {
  const p = pagina();
  const registro = creaChatPronte();
  const m1 = p.inMessaggio('m1', p.a.blocco(SCELTE, true));
  assert.ok(p.passaA('s1-ramo', registro) === null);
  const ered = p.inMessaggio('m1', p.a.blocco(SCELTE, true));
  assert.equal(clicca(p, ered, 'Fermati qui'), 'posto:m1@0#prossimo');
  assert.ok(p.passaA('s1', registro));
  assert.equal(libero(m1), true, 'the parent never answered it');
  const ri = p.a.blocco(SCELTE, true);
  m1.replaceWith(ri);
  clic(opzione(ri, 'Continua'));
  assert.equal(p.inviati.length, 2, 'the parent\'s own click is sent');
});

test('D4 the place lookup is linear: 300 messages and 300 gestures', async () => {
  const p = pagina();
  for (let i = 0; i < 300; i += 1) p.inMessaggio(`m${i}`, p.a.blocco(SCELTE, true));
  await assestato();
  const t0 = performance.now();
  for (let i = 0; i < 300; i += 1) gesto(p, `posto:m${i}@0#prossimo`, i % 2 ? 'Continua' : 'Fermati qui');
  const ms = performance.now() - t0;
  await assestato();
  for (let i = 0; i < 300; i += 1) assert.deepEqual(stati(sezioneIn(p, `m${i}`)), i % 2 ? C : F, `m${i}`);
  console.log(`D4: ${p.conti.chiamate} host lookups, ${p.conti.passi} ancestor steps, ${ms.toFixed(1)} ms for the gestures`);
  assert.ok(p.conti.chiamate <= 300 * 8, `host lookups ${p.conti.chiamate} (9c0200932: 45 450)`);
  assert.ok(p.conti.passi <= 300 * 8 * 4, `ancestor steps ${p.conti.passi}`);
});

test('M1 a place key of exactly 400 characters (the server cap) is still a place key', () => {
  const p = pagina();
  const id = 'x'.repeat(383);
  const k = clicca(p, p.inMessaggio(id, p.a.blocco(SCELTE, true)), 'Continua');
  assert.equal(k.length, 400);
  assert.equal(k, `posto:${id}@0#prossimo`);
});

test('M8 the place counts only the block shells (`.gu`), not other sections of the message', () => {
  const p = pagina();
  p.inMessaggio('m1', p.document.createElement('section'));
  assert.equal(clicca(p, p.inMessaggio('m1', p.a.blocco(SCELTE, true)), 'Continua'), 'posto:m1@0#prossimo');
});

test('M15 a whole redraw of an UNANSWERED twin keeps its first order: a later response\'s gesture leaves it free', async () => {
  const p = pagina({ conPosto: false });
  p.inMessaggio('m1', p.a.blocco(SCELTE, true));
  p.inMessaggio('m3', p.a.blocco(SCELTE, true, 'nome=b3')); p.a.aggiornaVersione(v1('b3', 'm3'));
  p.inMessaggio('m5', p.a.blocco(SCELTE, true, 'nome=b5')); p.a.aggiornaVersione(v1('b5', 'm5'));
  p.inMessaggio('m9', p.a.blocco(SCELTE, true)); // two names with these words: no name by likeness
  await assestato();
  const nuovo = p.a.blocco(SCELTE, true);
  p.messaggi.get('m1').replaceChildren(nuovo);
  await assestato();
  gesto(p, K('s1'), 'Fermati qui');
  /* a gesture that locks a shell redraws it (`replaceWith`): read the shell again, never the old reference */
  assert.equal(sezioneIn(p, 'm1'), nuovo, 'not redrawn by the gesture');
  assert.equal(libero(sezioneIn(p, 'm1')), true, 'm1 belongs to an earlier response');
  assert.deepEqual(stati(sezioneIn(p, 'm9')), F, 'm9');
});

test('M16/M21 a whole redraw of a block clicked here keeps the click as its own: its v1 does not free it', async () => {
  const p = pagina({ conPosto: false });
  const s = p.inMessaggio('m0', p.a.blocco(SCELTE, true, 'nome=b1'));
  s.remove();
  const x = p.inMessaggio('m1', p.a.blocco(SCELTE, true));
  clicca(p, x, 'Continua');
  const nuovo = p.a.blocco(SCELTE, true);
  p.messaggi.get('m1').replaceChildren(nuovo);
  await assestato();
  assert.deepEqual(stati(nuovo), C, 'premise');
  p.a.aggiornaVersione(v1('b1', 'm1', 0));
  assert.deepEqual(stati(nuovo), C, 'still answered after its v1');
  clic(opzione(nuovo, 'Fermati qui'));
  assert.equal(p.inviati.length, 1);
});

test('M22 a gesture while the block streamed, then a tail redraw into ANOTHER message: as a fresh drawing, locked', async () => {
  const p = pagina({ conPosto: false });
  p.inMessaggio('m1', p.a.blocco(SCELTE.slice(0, 20), false));
  gesto(p, K('s1'), 'Continua');
  p.a.blocco(SCELTE, true);
  assert.deepEqual(stati(sezioneIn(p, 'm1')), C, 'premise');
  sezioneIn(p, 'm1').remove();
  const altrove = p.inMessaggio('m2', p.a.blocco(SCELTE, true));
  await assestato();
  const r = pagina({ conPosto: false });
  r.inMessaggio('m2', r.a.blocco(SCELTE, true));
  gesto(r, K('s1'), 'Continua');
  assert.deepEqual(stati(altrove), stati(sezioneIn(r, 'm2')));
  assert.deepEqual(stati(altrove), C);
});

test('M28 a live block that took an earlier shell\'s place: its click owns its first order, and its tail redraw stays locked', async () => {
  const p = pagina({ conPosto: false });
  const x = p.inMessaggio('m1', p.a.blocco(SCELTE, true));
  await assestato();
  x.remove(); // unanswered, out of the page: the live block takes its place
  p.inMessaggio('m1', p.a.blocco(SCELTE.slice(0, 20), false));
  const vivo = p.a.blocco(SCELTE, true);
  await assestato();
  clicca(p, vivo, 'Continua');
  vivo.remove();
  const ri = p.inMessaggio('m1', p.a.blocco(SCELTE, true));
  assert.deepEqual(stati(ri), C);
  clic(opzione(ri, 'Fermati qui'));
  assert.equal(p.inviati.length, 1);
});

test('S4 a place key goes to the shell standing at that place NOW, not to one whose kept place it was before a twin came in front', async () => {
  const p = pagina();
  const a = p.inMessaggio('m1', p.a.blocco(SCELTE, true));
  await assestato(); // A's place is m1@0
  const b = p.a.blocco(SCELTE, true);
  p.messaggi.get('m1').prepend(b); // a twin drawn in front of it: B stands at m1@0, A at m1@1
  await assestato();
  gesto(p, 'posto:m1@0#prossimo', 'Fermati qui'); // B's answer, from the journal or another device
  assert.equal(sezioneIn(p, 'm1', 1), a, 'A not redrawn');
  assert.equal(libero(sezioneIn(p, 'm1', 1)), true, 'A is free');
  assert.deepEqual(stati(sezioneIn(p, 'm1', 0)), F, 'B is locked');
});
