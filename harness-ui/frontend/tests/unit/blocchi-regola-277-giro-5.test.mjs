/*
 * Cura 288, round 5 (BG3; owner decision 378: the PC release waits for it). Reviewer A of round 4 (2a1e8610b, ALTO-1, probes R4A-1..4)
 * found that the side view and the full-screen view of a block («Apri a lato», «Tutto schermo») were closed only in `passaASessione`
 * (FE-003). «Riprova» (`avviaRamo`), a fork (`forkSession`) and the three new-chat paths (`startRealSession`, `avviaSessionePendente`,
 * `startCustomSession`) left them open over the new chat: a click in them answered the chat that was left into the new one (the view's
 * shell keeps the parent's holder, the hook asks the OPEN chat), a fork's echo locked the parked parent's page with no gesture in its
 * journal (page != reload), and a view change saved the parent's version into the new chat.
 * The host below runs the REAL lines of `nuovaGenerazioneSessione` that park, reset the hook and close the views (sliced out of
 * legacy/app.js) with the REAL arguments each caller passes, and the REAL views (`creaVisteDelBlocco`) wired as legacy/app.js wires them.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { documento, clic, orologio, spento } from './aiuto-dom-blocchi.mjs';
import { impostaLingua } from '../../src/components/lingua.js';
import { creaAggancioBlocchi, EVENTO_VERSIONE_DEL_BLOCCO } from '../../src/components/blocchi/aggancio.js';
import { creaVisteDelBlocco } from '../../src/components/blocchi/viste.js';
import { creaChatPronte } from '../../src/components/chat-pronte.js';

impostaLingua('it');
const SCELTE = readFileSync(new URL('../../../tests/fixtures/blocchi/03-scelte.txt', import.meta.url), 'utf8').trim();
const TABELLA = readFileSync(new URL('../../../tests/fixtures/blocchi/01-tabella.txt', import.meta.url), 'utf8').trim();
const APP = readFileSync(new URL('../../src/legacy/app.js', import.meta.url), 'utf8');

const corpo = (nome) => {
  const i = APP.search(new RegExp(`\\n  (?:async )?function ${nome}\\(`, 'u'));
  assert.ok(i > 0, nome);
  const j = APP.slice(i + 1).search(/\n {2}(?:async )?function [\w$]+\(/u);
  return APP.slice(i + 1, j > 0 ? i + 1 + j : undefined);
};
const RIGA_GENERAZIONE = /^\s*(?:const generation = )?nuovaGenerazioneSessione\((.*)\);/mu;
const argomentiDi = (nome, ambiente = {}) => {
  const m = RIGA_GENERAZIONE.exec(corpo(nome));
  assert.ok(m, `${nome} opens a new generation`);
  return new Function(...Object.keys(ambiente), `return [${m[1]}];`)(...Object.values(ambiente));
};
/* the REAL parking, hook-reset and view-closing lines of `nuovaGenerazioneSessione`, in their order, with their guards */
const NG = corpo('nuovaGenerazioneSessione');
const FIRMA = /^ {2}function nuovaGenerazioneSessione\((\{[^)]*\} = \{\})\)/u.exec(NG)[1];
const RIGHE_NG = NG.split('\n').filter((r) => !/^\s*(?:\/\/|\*|\/\*)/u.test(r))
  .filter((r) => /parcheggiaChatAperta\(\)|aggancioDeiBlocchi\?\.|visteDeiBlocchi\??\./u.test(r));
const generazioneVera = new Function('parcheggiaChatAperta', 'aggancioDeiBlocchi', 'visteDeiBlocchi',
  `return function nuovaGenerazioneSessione(${FIRMA}) {\n${RIGHE_NG.join('\n')}\n};`);
/* `passaASessione` closes the views before its selection-mode return (FE-003): the REAL line, so the switch keeps doing it */
const PASSA_CHIUDE = /^\s*visteDeiBlocchi\??\.chiudi\(\);/mu.test(corpo('passaASessione'));

function host({ sessione = 's1' } = {}) {
  const document = documento();
  const colonna = document.createElement('aside'); // #inspectorSessione
  document.body.append(colonna);
  const viste = creaVisteDelBlocco({ document, colonna: () => colonna, apriColonna() {} });
  const inviati = [];
  const versioni = [];
  let corrente = sessione;
  let messaggi = new Map();
  const idDi = new WeakMap();
  const registro = creaChatPronte();
  const a = creaAggancioBlocchi({ document, sessione: () => corrente, timer: orologio().timer,
    azioni: { lato: viste.lato, schermo: viste.schermo }, // legacy/app.js: azioni.lato / azioni.schermo = the views
    consegna: (testo, azione) => inviati.push({ chat: corrente, testo, azione }),
    salvaVersione: (valore) => { versioni.push({ chat: corrente, valore }); return Promise.resolve({ ok: true }); },
    elementoDelMessaggio: (id) => messaggi.get(id) ?? null,
    messaggioDelNodo: (nodo) => {
      for (let n = nodo; n; n = n.parentNode) { const id = idDi.get(n); if (id !== undefined && messaggi.get(id) === n) return id; }
      return null;
    } });
  const inMessaggio = (id, nodo) => {
    let m = messaggi.get(id);
    if (!m) { m = document.createElement('article'); messaggi.set(id, m); idDi.set(m, id); document.body.append(m); }
    m.append(nodo);
    return nodo;
  };
  const parcheggiaChatAperta = () => {
    const pagine = [...messaggi.entries()];
    for (const [, m] of pagine) m.remove();
    registro.parcheggia(corrente, { nodi: 10, pagine, moduli: { blocchi: a.parcheggia() } });
  };
  const ng = generazioneVera(parcheggiaChatAperta, a, viste);
  const genera = (args) => {
    ng(...args);
    if (!args[0]?.continua) { for (const [, m] of messaggi) m.remove(); messaggi = new Map(); }
  };
  /* a caller that changes chat, with the arguments it really passes, then the new id (collegaEventiSessione) */
  const apri = (chiamante, s) => { genera(argomentiDi(chiamante)); corrente = s; };
  /* `passaASessione`: views closed first (its own FE-003 line), the ready page taken, the new generation, the page back */
  const torna = (s) => {
    if (PASSA_CHIUDE) viste.chiudi();
    const presa = registro.prendi(s);
    genera(argomentiDi('passaASessione', { forza: false, sessionId: s, state: { realSession: { id: corrente } } }));
    corrente = s;
    if (presa) { a.ripristina(presa.moduli.blocchi); for (const [id, m] of presa.pagine) { messaggi.set(id, m); document.body.append(m); } }
    return presa;
  };
  return { a, document, colonna, inviati, versioni, inMessaggio, apri, torna, genera };
}
const opzioni = (nodo) => nodo.querySelectorAll('.gu-scelte button');
const opzione = (nodo, t) => opzioni(nodo).find((b) => b.dataset.scelta === t);
const libero = (nodo) => opzioni(nodo).every((b) => !spento(b)) && !opzioni(nodo).some((b) => b.hasAttribute('aria-pressed'));
/* a shell's button by its text, in the shell or in its «⋯» menu */
const bottone = (nodo, testo) => {
  const qui = nodo.querySelectorAll('button').find((b) => b.textContent.trim().startsWith(testo));
  if (qui) return qui;
  const piu = nodo.querySelector('button[aria-haspopup="menu"]');
  if (!piu) return undefined;
  if (piu.getAttribute('aria-expanded') !== 'true') clic(piu);
  return nodo.ownerDocument.body.querySelector('#menuDelBlocco')?.querySelectorAll('[role="menuitem"]').find((b) => b.textContent.trim().startsWith(testo));
};
const gesto = (h, chiave, valore) => { h.a.spegni(chiave, { tipo: 'scelte', valore }); h.a.spegni(chiave, { tipo: 'scelte' }); };
const assestato = () => new Promise((fatto) => setImmediate(fatto));
const lato = (h) => h.colonna.querySelector('.gu-lato');
const schermo = (h) => h.document.body.querySelector('.gu-schermo');

const CHIAMANTI = [
  ['avviaRamo', '«Riprova»', 's1-riprova'],
  ['forkSession', 'fork', 's1-ramo'],
  ['startRealSession', 'new chat', 's2'],
  ['avviaSessionePendente', 'new chat', 's2'],
  ['startCustomSession', 'new chat', 's2'],
];

test('G5-0 every chat-change caller reaches the view closing with no `continua`; the resumes keep it', () => {
  for (const [nome] of CHIAMANTI) assert.deepEqual(argomentiDi(nome), [], nome);
  for (const nome of ['resumeSession', 'runDirectShell']) assert.deepEqual(argomentiDi(nome), [{ continua: true }], `${nome}: a resume`);
  assert.equal(PASSA_CHIUDE, true, 'passaASessione keeps its own FE-003 closing (a selection-mode click returns before the generation)');
});

for (const [chiamante, tipo, figlio] of CHIAMANTI) {
  test(`G5-1 ${chiamante} (${tipo}): the side view of the chat left is closed, and nothing in it can answer into ${figlio}`, async () => {
    const h = host();
    const m1 = h.inMessaggio('m1', h.a.blocco(SCELTE, true));
    await assestato();
    clic(bottone(m1, 'Apri a lato'));
    assert.ok(lato(h), 'side view open in s1');
    h.apri(chiamante, figlio);
    if (figlio !== 's2') { h.inMessaggio('m1', h.a.blocco(SCELTE, true)); await assestato(); } // a fork keeps the parent's message ids
    const vista = h.colonna.querySelector('.gu-lato .gu-lato__corpo');
    if (vista) clic(opzione(vista, 'Fermati qui'));
    assert.deepEqual({ lato: Boolean(vista), inviati: h.inviati.map((x) => `${x.chat} ${x.azione.chiave} «${x.testo}»`) },
      { lato: false, inviati: [] }, 'the parent block answered into the other chat');
  });

  test(`G5-2 ${chiamante} (${tipo}): the full-screen view of the chat left is closed too`, async () => {
    const h = host();
    const m1 = h.inMessaggio('m1', h.a.blocco(SCELTE, true));
    await assestato();
    clic(bottone(m1, 'Tutto schermo'));
    assert.ok(schermo(h), 'full screen open in s1');
    h.apri(chiamante, figlio);
    const vista = schermo(h)?.querySelector('.gu-schermo__corpo') ?? null;
    if (vista) clic(opzione(vista, 'Continua'));
    assert.deepEqual({ schermo: Boolean(vista), inviati: h.inviati.length }, { schermo: false, inviati: 0 });
  });
}

test('G5-3 fork: the parked parent comes back as a reload shows it (no echo from a side view locked it)', async () => {
  const h = host();
  const m1 = h.inMessaggio('m1', h.a.blocco(SCELTE, true));
  await assestato();
  clic(bottone(m1, 'Apri a lato'));
  h.apri('forkSession', 's1-ramo');
  const e = h.inMessaggio('m1', h.a.blocco(SCELTE, true)); await assestato();
  const vista = h.colonna.querySelector('.gu-lato .gu-lato__corpo');
  if (vista) { clic(opzione(vista, 'Fermati qui')); const ultimo = h.inviati.at(-1); if (ultimo) gesto(h, ultimo.azione.chiave, 'Fermati qui'); }
  assert.equal(libero(e), true, 'the fork\'s own block was never answered');
  assert.ok(h.torna('s1'));
  assert.equal(h.inviati.filter((x) => x.chat === 's1').length, 0, 'the parent journal has no gesture');
  assert.equal(libero(m1), true, 'so its page stays free, as after a reload');
  clic(opzione(m1, 'Continua'));
  assert.deepEqual(h.inviati.map((x) => x.chat), ['s1'], 'one click in the parent, one message, in the parent');
});

test('G5-4 new chat: a view change on the parent\'s named table never saves a version into the new chat', async () => {
  const h = host();
  const m1 = h.inMessaggio('m1', h.a.blocco(TABELLA.replace(/^(```\S*)?/u, ''), true, 'nome=b1'));
  h.a.aggiornaVersione({ type: 'CUSTOM', name: EVENTO_VERSIONE_DEL_BLOCCO, value: { blocco: 'b1', versione: 1, sorgente: TABELLA, messaggio: 'm1', posizione: 0 } });
  clic(bottone(m1, 'Apri a lato'));
  assert.ok(lato(h));
  h.apri('startRealSession', 's2');
  const dentro = h.colonna.querySelector('.gu-lato .gu-lato__corpo');
  const cambia = dentro ? bottone(dentro, 'Barre') ?? bottone(dentro, 'Grafico') : null;
  if (cambia) clic(cambia);
  await assestato();
  assert.deepEqual({ lato: Boolean(dentro), versioni: h.versioni.filter((x) => x.chat === 's2').map((x) => x.valore.blocco) }, { lato: false, versioni: [] });
});

test('G5-5 a resume of the open chat (continua: true) keeps its side view open, and a click there answers that same chat once', async () => {
  const h = host();
  const m1 = h.inMessaggio('m1', h.a.blocco(SCELTE, true));
  await assestato();
  clic(bottone(m1, 'Apri a lato'));
  const prima = lato(h);
  assert.ok(prima);
  h.genera(argomentiDi('resumeSession'));
  assert.equal(lato(h) === prima, true, 'the same side view is still open');
  clic(opzione(h.colonna.querySelector('.gu-lato .gu-lato__corpo'), 'Fermati qui'));
  assert.deepEqual(h.inviati.map((x) => [x.chat, x.azione.chiave]), [['s1', 'posto:m1@0#prossimo']]);
  clic(opzione(m1, 'Continua'));
  assert.equal(h.inviati.length, 1, 'the block in the chat shares the view\'s state: one click, one message');
});

test('G5-6 the same chat rebuilt (parcheggia: false, a language change) also closes the views: its blocks are redrawn', async () => {
  const h = host();
  const m1 = h.inMessaggio('m1', h.a.blocco(SCELTE, true));
  await assestato();
  clic(bottone(m1, 'Apri a lato'));
  h.genera([{ parcheggia: false }]);
  assert.equal(Boolean(lato(h)), false, 'the side view of the page redrawn is closed');
});
