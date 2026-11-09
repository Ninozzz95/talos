/*
 * Cura 288, round 4 (BG3; owner decision 378: the PC release waits for it). The third adversarial review of 29a48f0ab
 * (desktop/in-corso/uig-unione-2026-11-06/AVVERSARIO-GIRO-3-correttezza.md, probes G3C-1..3) found:
 * - E1: only `passaASessione` reset the hook. «Riprova» (`avviaRamo`), the fork (`forkSession`) and the three new-chat paths
 *   (`startRealSession`, `avviaSessionePendente`, `startCustomSession`) parked the page and went on drawing over it: a click in the new chat
 *   answered the parent's parked shell, and the parent's own click was never sent.
 * - E2 (same cause): a new chat inherited the open chat's names: its v1 was refused, its click named the parent's message.
 * - E3: a place or name key had no chat, and the raw memory (first wins) gave a fork's answer to the parent after a tail redraw.
 * The host below runs the REAL lines of `nuovaGenerazioneSessione` that park and reset (sliced out of legacy/app.js) with the REAL
 * arguments each caller passes, so the test fails if a caller, the order, or the `!continua` guard changes.
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
const SCELTE_V2 = SCELTE.replace('Come vuoi procedere?', 'Come procediamo?');
const APP = readFileSync(new URL('../../src/legacy/app.js', import.meta.url), 'utf8');

/* a top-level function of the legacy host, up to the next one */
const corpo = (nome) => {
  const i = APP.search(new RegExp(`\\n  (?:async )?function ${nome}\\(`, 'u'));
  assert.ok(i > 0, nome);
  const j = APP.slice(i + 1).search(/\n {2}(?:async )?function [\w$]+\(/u);
  return APP.slice(i + 1, j > 0 ? i + 1 + j : undefined);
};
const RIGA_GENERAZIONE = /^\s*(?:const generation = )?nuovaGenerazioneSessione\((.*)\);/mu;
/* the arguments a caller really passes to `nuovaGenerazioneSessione` */
const argomentiDi = (nome, ambiente = {}) => {
  const m = RIGA_GENERAZIONE.exec(corpo(nome));
  assert.ok(m, `${nome} opens a new generation`);
  return new Function(...Object.keys(ambiente), `return [${m[1]}];`)(...Object.values(ambiente));
};
/* a caller's own reset right after its generation line (29a48f0ab had one in `passaASessione` only) */
const azzeraDopo = (nome) => new RegExp(`${RIGA_GENERAZIONE.source}\\s*\\n\\s*aggancioDeiBlocchi\\?\\.azzera\\(\\);`, 'mu').test(corpo(nome));
/* the REAL parking and reset lines of `nuovaGenerazioneSessione`, in their order, with their guards */
const NG = corpo('nuovaGenerazioneSessione');
const FIRMA = /^ {2}function nuovaGenerazioneSessione\((\{[^)]*\} = \{\})\)/u.exec(NG)[1];
const RIGHE_NG = NG.split('\n').filter((r) => /parcheggiaChatAperta\(\)|aggancioDeiBlocchi\?\./u.test(r));
const generazioneVera = new Function('parcheggiaChatAperta', 'aggancioDeiBlocchi',
  `return function nuovaGenerazioneSessione(${FIRMA}) {\n${RIGHE_NG.join('\n')}\n};`);

/* the PC host: article → message id, ready pages with the hook state in the same entry, and the callers that change chat */
function host({ sessione = 's1' } = {}) {
  const document = documento();
  const inviati = [];
  let corrente = sessione;
  let messaggi = new Map();
  const idDi = new WeakMap();
  const registro = creaChatPronte();
  const stato = { parcheggiabile: true };
  const a = creaAggancioBlocchi({ document, sessione: () => corrente, timer: orologio().timer,
    consegna: (testo, azione) => inviati.push({ chat: corrente, testo, azione }), elementoDelMessaggio: (id) => messaggi.get(id) ?? null,
    messaggioDelNodo: (nodo) => {
      for (let n = nodo; n; n = n.parentNode) {
        const id = idDi.get(n);
        if (id !== undefined && messaggi.get(id) === n) return id;
      }
      return null;
    } });
  const inMessaggio = (id, nodo) => {
    let m = messaggi.get(id);
    if (!m) { m = document.createElement('article'); messaggi.set(id, m); idDi.set(m, id); document.body.append(m); }
    m.append(nodo);
    return nodo;
  };
  /* legacy/app.js `parcheggiaChatAperta`: a chat still running is not parked (`chatParcheggiabile`), its page is thrown away */
  const parcheggiaChatAperta = () => {
    if (!stato.parcheggiabile) return;
    const pagine = [...messaggi.entries()];
    for (const [, m] of pagine) m.remove();
    registro.parcheggia(corrente, { nodi: 10, pagine, moduli: { blocchi: a.parcheggia() } });
  };
  const nuovaGenerazioneSessione = generazioneVera(parcheggiaChatAperta, a);
  const genera = (nome, args) => {
    nuovaGenerazioneSessione(...args);
    if (!args[0]?.continua) { for (const [, m] of messaggi) m.remove(); messaggi = new Map(); } // replaceChildren, messageElements = new Map()
    if (azzeraDopo(nome)) a.azzera();
  };
  const apri = (chiamante, s) => { genera(chiamante, argomentiDi(chiamante)); corrente = s; };
  /* legacy/app.js `passaASessione`: take the ready page first, then the new generation, then the page back (or the journal replays) */
  const torna = (s) => {
    const presa = registro.prendi(s);
    genera('passaASessione', argomentiDi('passaASessione', { forza: false, sessionId: s, state: { realSession: { id: corrente } } }));
    corrente = s;
    if (presa) {
      a.ripristina(presa.moduli.blocchi);
      for (const [id, m] of presa.pagine) { messaggi.set(id, m); document.body.append(m); }
    }
    return presa;
  };
  /* the review's probe host (G3C-1, G3C-2): the page is parked and wiped, with NO reset of the hook at all */
  const viaSenzaAzzera = (s) => {
    parcheggiaChatAperta();
    for (const [, m] of messaggi) m.remove();
    messaggi = new Map();
    corrente = s;
  };
  return { a, inviati, stato, inMessaggio, apri, torna, genera, viaSenzaAzzera, sezione: (id, i = 0) => sezioniIn(messaggi.get(id))[i] };
}
const sezioniIn = (m) => m.querySelectorAll('section').filter((x) => x.classList.contains('gu'));
const evento = (value) => ({ type: 'CUSTOM', name: EVENTO_VERSIONE_DEL_BLOCCO, value });
const v1 = (nome, messaggio, posizione = 0) => evento({ blocco: nome, versione: 1, sorgente: SCELTE, messaggio, posizione, quando: '2026-11-08T00:00:00.000Z' });
const v2 = (nome, messaggio, sorgente = SCELTE_V2) => evento({ blocco: nome, versione: 2, sorgente, messaggio, cosaECambiato: 'domanda', origine: 'modello' });
const opzioni = (nodo) => nodo.querySelectorAll('.gu-scelte button');
const opzione = (nodo, t) => opzioni(nodo).find((b) => b.dataset.scelta === t);
const stati = (nodo) => opzioni(nodo).map((b) => [b.dataset.scelta, spento(b), b.getAttribute('aria-pressed')]);
const libero = (nodo) => opzioni(nodo).every((b) => !spento(b)) && !opzioni(nodo).some((b) => b.hasAttribute('aria-pressed'));
const C = [['Continua', true, 'true'], ['Fermati qui', true, 'false']];
const F = [['Continua', true, 'false'], ['Fermati qui', true, 'true']];
const gesto = (h, chiave, valore) => { h.a.spegni(chiave, { tipo: 'scelte', valore }); h.a.spegni(chiave, { tipo: 'scelte' }); };
/* a click, and its echo from the server (bubble + event), as the live chat gets it */
const clicca = (h, nodo, valore) => {
  const prima = h.inviati.length;
  clic(opzione(nodo, valore));
  if (h.inviati.length > prima) gesto(h, h.inviati.at(-1).azione.chiave, valore);
  return h.inviati.length > prima ? h.inviati.at(-1).azione.chiave : null;
};
const assestato = () => new Promise((fatto) => setImmediate(fatto));
/* a reload of a chat: a fresh hook replays the journal (text, v1, bubble + gesture) */
const ricarica = async (s, passi) => {
  const r = host({ sessione: s });
  for (const p of passi) {
    if (p.blocco) r.inMessaggio(p.blocco, r.a.blocco(SCELTE, true, p.info ?? ''));
    if (p.v1) r.a.aggiornaVersione(v1(p.v1, p.messaggio));
    if (p.chiave) gesto(r, p.chiave, p.valore);
  }
  await assestato();
  return r;
};

const CHIAMANTI = [
  ['avviaRamo', '«Riprova»', 's1-riprova'],
  ['forkSession', 'fork', 's1-ramo'],
  ['startRealSession', 'new chat', 's2'],
  ['avviaSessionePendente', 'new chat', 's2'],
  ['startCustomSession', 'new chat', 's2'],
];
const NUOVE = CHIAMANTI.filter(([, tipo]) => tipo === 'new chat');

test('E1 the hook is reset in ONE place: nuovaGenerazioneSessione, right after the parking, for every chat change and never on a resume', () => {
  const traccia = [];
  const ng = generazioneVera(() => traccia.push('parcheggia'), { azzera: () => traccia.push('azzera'), parcheggia: () => null });
  ng();
  assert.deepEqual(traccia.splice(0), ['parcheggia', 'azzera'], 'a new chat: park, then reset');
  ng({ parcheggia: false });
  assert.deepEqual(traccia.splice(0), ['azzera'], 'the same chat rebuilt (language change): not parked, still reset');
  ng({ continua: true });
  assert.deepEqual(traccia.splice(0), [], 'a resume of the open chat keeps its page and its answers');
  const codice = APP.split('\n').filter((r) => !/^\s*(?:\/\/|\*|\/\*)/u.test(r));
  assert.equal(codice.filter((r) => r.includes('aggancioDeiBlocchi?.azzera()')).length, 1, 'one reset in the whole host');
  for (const [nome] of [...CHIAMANTI, ['passaASessione']]) assert.equal(azzeraDopo(nome), false, `${nome} has no reset of its own`);
});

test('E1 every caller that changes chat goes through the reset (no `continua`), the resumes do not', () => {
  for (const [nome] of CHIAMANTI) assert.deepEqual(argomentiDi(nome), [], nome);
  for (const nome of ['resumeSession', 'runDirectShell']) assert.deepEqual(argomentiDi(nome), [{ continua: true }], `${nome}: a resume`);
});

for (const [chiamante, tipo, figlio] of CHIAMANTI) {
  for (const pronta of [true, false]) {
    test(`E1 ${chiamante} (${tipo}, parent ${pronta ? 'parked ready' : 'not parked'}): the click on an inherited shell never answers the parent; back in the parent, its own click is sent`, async () => {
      const h = host();
      h.stato.parcheggiabile = pronta;
      const m1 = h.inMessaggio('m1', h.a.blocco(SCELTE, true));
      await assestato();
      h.apri(chiamante, figlio);
      const e = h.inMessaggio('m1', h.a.blocco(SCELTE, true)); // the same message id: the worst case (a fork keeps the parent's ids)
      await assestato();
      assert.equal(clicca(h, e, 'Fermati qui'), 'posto:m1@0#prossimo');
      assert.equal(h.inviati.length, 1);
      assert.deepEqual(stati(h.sezione('m1')), F, 'the new chat shows its own answer');
      assert.equal(libero(m1), true, 'the page it left did not change');
      const presa = h.torna('s1');
      assert.equal(Boolean(presa), pronta);
      const qui = pronta ? m1 : h.inMessaggio('m1', h.a.blocco(SCELTE, true)); // not parked: the journal is replayed, with no gesture
      await assestato();
      assert.equal(h.sezione('m1'), qui);
      assert.equal(libero(qui), true, 'the parent never answered it');
      assert.equal(clicca(h, qui, 'Continua'), 'posto:m1@0#prossimo', 'the parent\'s own click is sent');
      assert.equal(h.inviati.length, 2);
      const ri = h.a.blocco(SCELTE, true);
      qui.replaceWith(ri);
      await assestato();
      assert.deepEqual(stati(ri), C, 'after a tail redraw the parent shows its own answer, as after a reload');
      clic(opzione(ri, 'Fermati qui'));
      assert.equal(h.inviati.length, 2, 'one click, one message');
      const r = await ricarica('s1', [{ blocco: 'm1', chiave: 'posto:m1@0#prossimo', valore: 'Continua' }]);
      assert.deepEqual(stati(r.sezione('m1')), stati(ri), 'page = reload');
    });
  }
}

test('E1 a resume (continua: true) keeps the open page\'s answers: a tail redraw stays answered, one click one message', async () => {
  const h = host();
  const m1 = h.inMessaggio('m1', h.a.blocco(SCELTE, true));
  await assestato();
  clicca(h, m1, 'Continua');
  assert.deepEqual(argomentiDi('resumeSession'), [{ continua: true }]);
  h.genera('resumeSession', argomentiDi('resumeSession')); // the follow-up message of the open chat
  const ri = h.a.blocco(SCELTE, true);
  m1.replaceWith(ri);
  await assestato();
  assert.deepEqual(stati(ri), C);
  clic(opzione(ri, 'Fermati qui'));
  assert.equal(h.inviati.length, 1);
});

test('E1 the parked page never changes, also if a host parks without the reset: the state is handed over, the hook keeps none of it', async () => {
  const h = host();
  const m1 = h.inMessaggio('m1', h.a.blocco(SCELTE, true));
  const m2 = h.inMessaggio('m2', h.a.blocco(SCELTE, true, 'nome=b1'));
  h.a.aggiornaVersione(v1('b1', 'm2'));
  await assestato();
  const parcheggiato = h.a.parcheggia(); // the parking alone, no `azzera`
  const [disegnati, perNome] = parcheggiato.raccolte;
  assert.equal(disegnati.length, 2);
  assert.equal(perNome.get('b1').eventi.length, 1);
  /* what the hook knew is gone from it: a new drawing at the same places takes nothing from the parked entry */
  const e = h.a.blocco(SCELTE, true);
  m1.replaceWith(e); // stands where the parked m1 stood
  await assestato();
  assert.equal(h.a.aggiornaVersione(v1('b1', 'm1')), true, 'b1 is free in the hook');
  clicca(h, e, 'Fermati qui');
  h.a.aggiornaVersione(v2('b1', 'm1'));
  assert.equal(disegnati.length, 2, 'parked list unchanged');
  assert.ok(disegnati.every((d) => d.holder.azione === null), 'no parked shell answered');
  assert.equal(perNome.get('b1').eventi.length, 1, 'parked events unchanged');
  assert.equal(m2.__storico.voci.length, 1, 'parked shell not redrawn');
  assert.equal(libero(m1), true);
});

test('G3C-1 (review probe) fork own click on an inherited unanswered shell does not reach the parked parent, even with no reset at all', async () => {
  const h = host();
  const m1 = h.inMessaggio('m1', h.a.blocco(SCELTE, true));
  await assestato();
  h.viaSenzaAzzera('s1-ramo');
  const e = h.inMessaggio('m1', h.a.blocco(SCELTE, true));
  await assestato();
  clicca(h, e, 'Fermati qui');
  assert.ok(h.torna('s1'));
  assert.equal(libero(m1), true, 'the parent never answered it');
});

for (const [chiamante] of NUOVE) {
  test(`E2 ${chiamante}: the new chat's own b1 v1 is accepted and bound to ITS message; its click sends ONE nome:b1@n1 and a reload shows it answered`, async () => {
    const h = host();
    h.inMessaggio('m1', h.a.blocco(SCELTE, true));
    assert.equal(h.a.aggiornaVersione(v1('b1', 'm1')), true);
    await assestato();
    h.apri(chiamante, 's2');
    const n = h.inMessaggio('n1', h.a.blocco(SCELTE, true));
    assert.equal(h.a.aggiornaVersione(v1('b1', 'n1')), true, 'its v1 is not refused');
    await assestato();
    assert.equal(clicca(h, n, 'Continua'), 'nome:b1@n1#prossimo', 'the key a reload of s2 asks for');
    clic(opzione(h.sezione('n1'), 'Fermati qui'));
    assert.equal(h.inviati.length, 1, 'one click, one message');
    assert.equal(h.inviati[0].chat, 's2');
    const r = await ricarica('s2', [{ blocco: 'n1' }, { v1: 'b1', messaggio: 'n1' }, { chiave: 'nome:b1@n1#prossimo', valore: 'Continua' }]);
    assert.deepEqual(stati(r.sezione('n1')), C, 'answered after a reload');
    assert.deepEqual(stati(h.sezione('n1')), stati(r.sezione('n1')), 'page = reload');
    clic(opzione(r.sezione('n1'), 'Fermati qui'));
    assert.equal(r.inviati.length, 0, 'no second message after the reload');
  });
}

test('E2 the new chat\'s v2 events never touch the parked parent: not its events, not its shells; the parent\'s own v2 still lands', async () => {
  const h = host();
  const m1 = h.inMessaggio('m1', h.a.blocco(SCELTE, true));
  h.a.aggiornaVersione(v1('b1', 'm1'));
  await assestato();
  h.apri('startCustomSession', 's2');
  h.inMessaggio('n1', h.a.blocco(SCELTE, true));
  h.a.aggiornaVersione(v1('b1', 'n1'));
  assert.equal(h.a.aggiornaVersione(v2('b1', 'n1')), true, 'the new chat\'s v2 redraws its own shell');
  assert.equal(h.sezione('n1').__storico.voci.length, 2);
  assert.equal(m1.__storico.voci.length, 1, 'the parked parent shell not redrawn');
  assert.ok(h.torna('s1'));
  assert.equal(m1.__storico.voci.length, 1);
  assert.equal(h.a.aggiornaVersione(v2('b1', 'm1', SCELTE.replace('Come vuoi procedere?', 'Andiamo avanti?'))), true, 'the parent\'s v2 is its own, not a duplicate');
  assert.equal(m1.__storico.voci.length, 2);
  assert.match(m1.__storico.voci[1].sorgente, /Andiamo avanti\?/u);
});

test('G3C-2 (review probe) new chat with no reset at all: its b1 v1 is accepted and its click names its own message', async () => {
  const h = host();
  h.inMessaggio('m1', h.a.blocco(SCELTE, true));
  h.a.aggiornaVersione(v1('b1', 'm1'));
  h.viaSenzaAzzera('s2');
  const n = h.inMessaggio('n1', h.a.blocco(SCELTE, true));
  h.a.aggiornaVersione(v1('b1', 'n1'));
  await assestato();
  assert.equal(clicca(h, n, 'Continua'), 'nome:b1@n1#prossimo', 'the key a reload of s2 asks for');
});

test('E3 place key (G3C-3): the fork answers «Fermati qui» on m1, the parent «Continua»: after a tail redraw the parent shows «Continua», as after a reload', async () => {
  const h = host();
  const m1 = h.inMessaggio('m1', h.a.blocco(SCELTE, true));
  await assestato();
  h.apri('forkSession', 's1-ramo');
  assert.equal(clicca(h, h.inMessaggio('m1', h.a.blocco(SCELTE, true)), 'Fermati qui'), 'posto:m1@0#prossimo');
  assert.ok(h.torna('s1'));
  assert.equal(clicca(h, m1, 'Continua'), 'posto:m1@0#prossimo');
  const ri = h.a.blocco(SCELTE, true);
  m1.replaceWith(ri);
  await assestato();
  assert.deepEqual(stati(ri), C, 'the parent shows its own answer');
  const r = await ricarica('s1', [{ blocco: 'm1', chiave: 'posto:m1@0#prossimo', valore: 'Continua' }]);
  assert.deepEqual(stati(r.sezione('m1')), stati(ri), 'page = reload');
  /* and the fork, back again (replayed), keeps ITS answer */
  h.torna('s1-ramo');
  const f = h.inMessaggio('m1', h.a.blocco(SCELTE, true));
  gesto(h, 'posto:m1@0#prossimo', 'Fermati qui');
  await assestato();
  assert.deepEqual(stati(h.sezione('m1')), F, 'the fork shows its own answer');
  assert.ok(f);
});

test('E3 name key in a fork: the fork answers b1 «Fermati qui», the parent «Continua»: after a tail redraw the parent shows «Continua», as after a reload', async () => {
  const h = host();
  const m1 = h.inMessaggio('m1', h.a.blocco(SCELTE, true, 'nome=b1'));
  h.a.aggiornaVersione(v1('b1', 'm1'));
  await assestato();
  h.apri('forkSession', 's1-ramo');
  const e = h.inMessaggio('m1', h.a.blocco(SCELTE, true, 'nome=b1'));
  h.a.aggiornaVersione(v1('b1', 'm1')); // the fork replays the parent's v1, with the parent's message
  await assestato();
  assert.equal(clicca(h, e, 'Fermati qui'), 'nome:b1@m1#prossimo');
  assert.ok(h.torna('s1'));
  assert.equal(libero(m1), true);
  assert.equal(clicca(h, m1, 'Continua'), 'nome:b1@m1#prossimo');
  assert.equal(h.inviati.length, 2);
  const ri = h.a.blocco(SCELTE, true, 'nome=b1');
  m1.replaceWith(ri);
  await assestato();
  assert.deepEqual(stati(ri), C, 'the parent shows its own answer');
  const r = await ricarica('s1', [{ blocco: 'm1', info: 'nome=b1' }, { v1: 'b1', messaggio: 'm1' }, { chiave: 'nome:b1@m1#prossimo', valore: 'Continua' }]);
  assert.deepEqual(stati(r.sezione('m1')), stati(ri), 'page = reload');
});

test('E3 an old key in a fork and in its parent: each chat keeps its own answer for the same raw key', async () => {
  const h = host({ sessione: 's1' });
  const k = `s1:${impronta(SCELTE)}#prossimo`; // the parent's old key, replayed in the fork too
  const m1 = h.inMessaggio('m1', h.a.blocco(SCELTE, true));
  await assestato();
  h.apri('forkSession', 's1-ramo');
  h.inMessaggio('m1', h.a.blocco(SCELTE, true));
  await assestato();
  gesto(h, k, 'Fermati qui');
  assert.deepEqual(stati(h.sezione('m1')), F);
  assert.ok(h.torna('s1'));
  assert.equal(libero(m1), true, 'the parent never got that gesture');
  gesto(h, k, 'Continua');
  assert.deepEqual(stati(h.sezione('m1')), C, 'its own, not the fork\'s');
});
