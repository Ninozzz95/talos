/*
 * Cura BG3 round 6 (owner decision 378: the PC release waits for it). Reviewer C of round 5 (ALTO, already in the candidate): an option
 * of an interactive block is written by the MODEL, and a click on it went `consegna` (legacy/app.js) → `submitPrompt`, which read it as
 * a command typed by the person: `!echo x` ran the shell with no card, `/settings conversation.permissions=fullAccess` and
 * `/settings tools.computerUse=true` were applied with no card in the installed app, `/goal`, `/connect`, `/compact` and `/btw` started.
 * Now the answer of a block is ALWAYS a plain message to the chat, shown as written, whatever its first character. Hermes returns the
 * pick of a clarify card as the tool's result (`tools/clarify_tool.py:107-112`), Claude Code's AskUserQuestion resolves to the label
 * chosen (`mods/types/claude-code.d.ts:2114-2119`), Codex serializes request_user_input's answers into the tool output
 * (`core/src/tools/handlers/request_user_input.rs:96-98`): none of them sends a pick back through the prompt's command parser.
 * The host runs the REAL `submitPrompt` and the REAL `consegna` line of legacy/app.js, with every side effect counted (cards, sheets,
 * notices, stops, shell commands, settings applied, messages), the REAL block renderer and the REAL settings catalogue.
 * Also here: R5A-1 of reviewer A (runDirectShell re-attached the chat left during the POST /shell), run on the REAL body.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { documento, clic, orologio } from './aiuto-dom-blocchi.mjs';
import { impostaLingua } from '../../src/components/lingua.js';
import { creaAggancioBlocchi, bloccoPerLaBolla } from '../../src/components/blocchi/aggancio.js';
import { creaVisteDelBlocco } from '../../src/components/blocchi/viste.js';
import { comandoObiettivo } from '../../src/components/obiettivo-carta.js';
import { bollaDaInviare } from '../../src/components/bolla-della-persona.js';
import * as imps from '../../src/components/impostazioni-dalla-chat.js';
import { catalogoPubblico } from '../../../src/impostazioni/catalogo-impostazioni.mjs';

impostaLingua('en');
imps.registraCatalogoImpostazioni({ voci: catalogoPubblico() });
const SCELTE = readFileSync(new URL('../../../tests/fixtures/blocchi/03-scelte.txt', import.meta.url), 'utf8').trim();
const APP = readFileSync(new URL('../../src/legacy/app.js', import.meta.url), 'utf8');
const corpo = (nome) => {
  const i = APP.search(new RegExp(`\\n  (?:async )?function ${nome}\\(`, 'u'));
  assert.ok(i > 0, nome);
  const j = APP.slice(i + 1).search(/\n {2}(?:async )?function [\w$]+\(/u);
  return APP.slice(i + 1, j > 0 ? i + 1 + j : undefined);
};
/* the REAL delivery of a block's answer, as the hook is wired in legacy/app.js */
const CONSEGNA = /^ {4}consegna: (\(testo, azione\) => \{.*\}),$/mu.exec(APP)?.[1];
const SUBMIT = corpo('submitPrompt');
const STATI = ['turn running', 'chat finished', 'no chat'];

/* one run of the real submitPrompt, every side effect stubbed and counted */
function chat(stato) {
  const n = { carte: [], avvisi: [], shell: [], impostazioni: [], messaggi: [], fermate: 0 };
  const state = { realSession: { id: stato === 'no chat' ? null : 's1', bollaDaMostrare: null }, pendingCustomSession: null, model: 'm', permissions: 'onRequest' };
  const messaggio = (via) => (v, _immagini, bolla) => n.messaggi.push({ via, v, bolla: bolla && typeof bolla === 'object' && 'testo' in bolla ? bolla : state.realSession.bollaDaMostrare });
  const amb = {
    state, tr: (k) => k,
    attendiUploadAllegati: () => false,
    comandoObiettivo,
    toast: (a) => n.avvisi.push(a),
    ricordaTestoInviato: () => {},
    gestisciComandoObiettivo: (c) => n.carte.push(`/goal ${c.tipo}`),
    apriChatALato: () => ({ fai: () => n.carte.push('/btw side chat') }),
    collegaDispositivoDallaChat: () => n.carte.push('/connect card'),
    suggerimentiImpostazioni: imps.suggerimentiImpostazioni,
    aggiornaSuggerimentoComandi: () => {},
    comandoImpostazioniDaApplicare: imps.comandoImpostazioniDaApplicare,
    applicaImpostazioniDallaPersona: (c) => n.impostazioni.push(JSON.stringify(c.changes ?? c)),
    compattaSubitoDallAvviso: () => n.carte.push('/compact now'),
    setView: () => {},
    runDirectShell: (c) => n.shell.push(c),
    runRealeAttivo: () => stato === 'turn running',
    accodaMessaggioReale: messaggio('queue'),
    bollaDaInviare,
    resumeSession: (v, immagini, o) => messaggio('resume')(v, immagini, o?.bolla),
    modelloScelto: () => true,
    openSheet: (s) => n.carte.push(`sheet ${s}`),
    startCustomSession: (o) => messaggio('new chat')(o.consegna, o.immagini, o.bolla),
    mappaPerUnaSessioneNuova: (x) => x,
    avvisaModelloMancanteSenzaSessione: () => n.avvisi.push('no model'),
    avviaSessioneImplicitaSeUnaSolaCartella: (v, immagini, _ripristino, bolla) => messaggio('implicit start')(v, immagini, bolla),
  };
  const submitPrompt = new Function(...Object.keys(amb), `${SUBMIT}\nreturn submitPrompt;`)(...Object.values(amb));
  const consegna = new Function('submitPrompt', 'bloccoPerLaBolla', `return ${CONSEGNA};`)((...a) => {
    const esito = submitPrompt(...a);
    if (esito === false) n.fermate += 1;
    return esito;
  }, bloccoPerLaBolla);
  return { n, consegna, submitPrompt };
}

/* a block whose first option the model wrote, rendered by the REAL renderer and clicked: the text the hook delivers */
async function clicSu(opzione, consegna) {
  const document = documento();
  const a = creaAggancioBlocchi({ document, sessione: () => 's1', timer: orologio().timer, consegna,
    elementoDelMessaggio: () => null, messaggioDelNodo: () => 'm1' });
  const nodo = a.blocco(`root = Scelte("prossimo", null, "How should I go on?", [{testo: ${JSON.stringify(opzione)}}, {testo: "Cancel"}])`, true);
  document.body.append(nodo);
  await new Promise((fatto) => setImmediate(fatto));
  const [b, annulla] = nodo.querySelectorAll('.gu-scelte button'); // the model's option first (invisible characters are dropped by the reader)
  assert.ok(b && annulla?.dataset.scelta === 'Cancel', `the option ${JSON.stringify(opzione)} is drawn`);
  clic(b);
}

/* BG3 round 7 (reviewer B of round 6, MEDIO-1): the same option as the LABEL of a form field the model wrote; the form delivers
   «label: value», so the text starts with what the model wrote. A gate keyed on the choice kind only let it through (B05). */
async function clicSulModulo(etichetta, consegna) {
  const document = documento();
  const a = creaAggancioBlocchi({ document, sessione: () => 's1', timer: orologio().timer, consegna,
    elementoDelMessaggio: () => null, messaggioDelNodo: () => 'm1' });
  const nodo = a.blocco(`root = Modulo("mm", null, [{id: "x", etichetta: ${JSON.stringify(etichetta)}, tipo: "scelta", opzioni: [{testo: "yes"}]}], "Send")`, true);
  document.body.append(nodo);
  await new Promise((fatto) => setImmediate(fatto));
  const si = nodo.querySelector('.talos-chip[data-valore="yes"]');
  assert.ok(si, `the form with the label ${JSON.stringify(etichetta)} is drawn`);
  clic(si);
  clic(nodo.querySelector('button[data-invia-modulo]'));
}

const conta = (n) => ({ messaggi: n.messaggi.length, carte: n.carte, avvisi: n.avvisi, fermate: n.fermate, shell: n.shell, impostazioni: n.impostazioni });
const SOLO_UN_MESSAGGIO = { messaggi: 1, carte: [], avvisi: [], fermate: 0, shell: [], impostazioni: [] };

test('G6-0 the host runs the real lines: the block delivery and submitPrompt are found in legacy/app.js', () => {
  assert.ok(CONSEGNA, 'the `consegna:` line of the hook');
  assert.match(CONSEGNA, /submitPrompt\(/u, 'a block answer is still a message of the chat');
  assert.match(SUBMIT, /runDirectShell\(/u, 'the shell branch is in submitPrompt: the person can still type `!cmd`');
});

const PERICOLOSE = [
  '!echo g6', '!!echo g6', '  !echo g6', '​!echo g6', '！echo g6', '\t!echo g6',
  '/settings conversation.permissions=fullAccess', '/settings tools.computerUse=true', ' /settings tools.computerUse=true',
  '/settings conversation.permissions=nonsense', '/goal finish everything', '/connect', '/compact', '/btw a question', '  /compact',
];
for (const opzione of PERICOLOSE) {
  test(`G6-1 a block option written by the model is a plain message, never a command: ${JSON.stringify(opzione)}`, async () => {
    for (const stato of STATI) {
      const { n, consegna } = chat(stato);
      let consegnato = null;
      await clicSu(opzione, (testo, azione) => { consegnato = testo; consegna(testo, azione); });
      assert.deepEqual(conta(n), SOLO_UN_MESSAGGIO, `${stato}: 1 message, 0 cards, 0 notices, 0 stops, 0 shell, 0 settings`);
      const [m] = n.messaggi;
      assert.equal(m.bolla?.testo, consegnato, `${stato}: the bubble shows the option as written`);
      assert.equal(m.bolla?.blocco?.tipo, 'scelte', `${stato}: the bubble says it came from the block`);
      assert.equal(m.v, consegnato.trim(), `${stato}: the model gets the option as text`);
    }
    for (const stato of STATI) {
      const { n, consegna } = chat(stato);
      let consegnato = null;
      await clicSulModulo(opzione, (testo, azione) => { consegnato = testo; consegna(testo, azione); });
      assert.ok(consegnato?.startsWith(opzione.replace(/[\s​]/gu, '').slice(0, 2)), `form, ${stato}: the delivered text starts with the label (${JSON.stringify(consegnato)})`);
      assert.deepEqual(conta(n), SOLO_UN_MESSAGGIO, `form, ${stato}: 1 message, 0 cards, 0 notices, 0 stops, 0 shell, 0 settings`);
      const [m] = n.messaggi;
      assert.equal(m.bolla?.testo, consegnato, `form, ${stato}: the bubble shows the answer as written`);
      assert.equal(m.bolla?.blocco?.tipo, 'modulo', `form, ${stato}: the bubble says it came from the form`);
      assert.equal(m.v, consegnato.trim(), `form, ${stato}: the model gets the answer as text`);
    }
  });
}

test('G6-2 a normal option is unchanged: Continua and Fermati qui are one message in each state, 0 cards, 0 notices, 0 stops', async () => {
  for (const stato of STATI) for (const opzione of ['Continua', 'Fermati qui']) {
    const { n, consegna } = chat(stato);
    const document = documento();
    const a = creaAggancioBlocchi({ document, sessione: () => 's1', timer: orologio().timer, consegna, elementoDelMessaggio: () => null, messaggioDelNodo: () => 'm1' });
    const nodo = a.blocco(SCELTE, true);
    document.body.append(nodo);
    await new Promise((fatto) => setImmediate(fatto));
    clic(nodo.querySelectorAll('.gu-scelte button').find((x) => x.dataset.scelta === opzione));
    assert.deepEqual(conta(n), SOLO_UN_MESSAGGIO, `${stato} ${opzione}`);
    assert.equal(n.messaggi[0].v, opzione);
    assert.equal(n.messaggi[0].via, { 'turn running': 'queue', 'chat finished': 'resume', 'no chat': 'implicit start' }[stato]);
  }
});

test('G6-3 the person typing a command is unchanged: `!cmd`, `/settings`, `/goal`, `/connect`, `/compact`, `/btw` still work', () => {
  /* BG3 round 7 (reviewer B of round 6, B12-B15): the return value is pinned too. The send handler empties the composer only on
     `true`; a settings command answers `false` (the settings sheet takes over), and an invalid one is a stop with nothing sent. */
  const scritti = {
    '!echo typed': [true, (n) => assert.deepEqual(n.shell, ['echo typed'])],
    '/settings tools.computerUse=true': [false, (n) => assert.equal(n.impostazioni.length, 1)],
    '/settings conversation.permissions=nonsense': [false, (n) => assert.deepEqual([n.impostazioni, n.carte, n.shell], [[], [], []], 'an invalid setting applies nothing')],
    '/goal finish everything': [true, (n) => assert.equal(n.carte.length, 1)],
    '/connect': [true, (n) => assert.deepEqual(n.carte, ['/connect card'])],
    '/compact': [true, (n) => assert.deepEqual(n.carte, ['/compact now'])],
    '/btw a question': [true, (n) => assert.deepEqual(n.carte, ['/btw side chat'])],
  };
  for (const [testo, [atteso, controlla]] of Object.entries(scritti)) {
    const { n, submitPrompt } = chat('chat finished');
    const esito = submitPrompt(testo, { mostra: testo, allegati: [] }); // the composer's door (legacy/app.js, the send handler): no block
    assert.equal(esito, atteso, `${testo}: returns ${atteso}`);
    controlla(n);
    assert.equal(n.messaggi.length, 0, `${testo}: a command typed by the person is not a message`);
  }
  /* `/btw` needs an open chat: with none, what the person typed goes to the model as a message (no side chat, no card) */
  const { n, submitPrompt } = chat('no chat');
  submitPrompt('/btw a question', { mostra: '/btw a question', allegati: [] });
  assert.deepEqual(conta(n), SOLO_UN_MESSAGGIO, '/btw with no chat: 1 message, 0 cards');
  assert.equal(n.messaggi[0].v, '/btw a question');
});

/* ---- R5A-1 (reviewer A, MEDIO): `!cmd` re-attached the chat the person had left during the POST /shell ---- */
test('G6-4 runDirectShell: a chat change during the POST /shell await keeps the open chat; a click in the new chat answers the new chat', async () => {
  const document = documento();
  const colonna = document.createElement('aside');
  document.body.append(colonna);
  const viste = creaVisteDelBlocco({ document, colonna: () => colonna, apriColonna() {} });
  const state = { realSession: { id: 's1', taskId: 't1', generation: 1 } };
  const inviati = [];
  let pagina = 's1';
  const a = creaAggancioBlocchi({ document, sessione: () => state.realSession.id, timer: orologio().timer,
    azioni: { lato: viste.lato, schermo: viste.schermo },
    consegna: () => inviati.push(`${state.realSession.id} (page ${pagina})`), elementoDelMessaggio: () => null, messaggioDelNodo: () => 'm1' });
  const nuovaGenerazioneSessione = (o = {}) => { if (!o.continua) { viste.chiudi(); a.azzera?.(); state.realSession.id = null; } return ++state.realSession.generation; };
  const collegaEventiSessione = (sid) => { state.realSession.id = sid; };
  let rilascia;
  const ambiente = { state, toast() {}, tr: (k) => k, aggiornaElencoSessioniReali() {}, runRealeAttivo: () => false,
    apiPost: () => new Promise((r) => { rilascia = r; }), nuovaGenerazioneSessione, collegaEventiSessione };
  const runDirectShell = new Function(...Object.keys(ambiente), `return ${corpo('runDirectShell').trim()}`)(...Object.values(ambiente));
  const corsa = runDirectShell('ls', false); // `!ls` typed in s1
  viste.chiudi(); nuovaGenerazioneSessione(); collegaEventiSessione('s2'); pagina = 's2'; // passaASessione('s2') while the POST is in flight
  const nodo = a.blocco(SCELTE, true);
  document.body.append(nodo);
  await new Promise((fatto) => setImmediate(fatto));
  rilascia({});
  await corsa;
  assert.equal(state.realSession.id, 's2', 'the open chat is still s2 after the POST /shell of s1 returned');
  clic(nodo.querySelectorAll('.gu-scelte button').find((x) => x.dataset.scelta === 'Fermati qui'));
  assert.deepEqual(inviati, ['s2 (page s2)'], 'the click answers the chat on screen');
});

test('G6-5 runDirectShell in the same chat still re-attaches the stream (`continua`) after the POST /shell', async () => {
  const state = { realSession: { id: 's1', taskId: 't1', generation: 1 } };
  const fatti = [];
  const ambiente = { state, toast() {}, tr: (k) => k, aggiornaElencoSessioniReali() {}, runRealeAttivo: () => false,
    apiPost: () => Promise.resolve({}), nuovaGenerazioneSessione: (o) => { fatti.push(`generation ${JSON.stringify(o)}`); return 2; },
    collegaEventiSessione: (sid, g) => fatti.push(`attach ${sid} ${g}`) };
  const runDirectShell = new Function(...Object.keys(ambiente), `return ${corpo('runDirectShell').trim()}`)(...Object.values(ambiente));
  await runDirectShell('ls', false);
  assert.deepEqual(fatti, ['generation {"continua":true}', 'attach s1 2']);
});

/* ---- BG3 round 7 (reviewer B of round 6, MEDIO-2, probes SONDA-B16/B17 ported): what G6-4 did not pin about the guard of
   runDirectShell. It must come BEFORE the new generation and the taskId write, and «New chat» (id null) is a change of chat too. ---- */
function shellEnv() {
  const state = { realSession: { id: 's1', taskId: 't1', generation: 1, eventSource: { di: 's1', aperto: true } } };
  const fatti = [];
  let rilascia;
  /* modelled on the real nuovaGenerazioneSessione (legacy/app.js): a new chat resets the id; EVERY call bumps the generation and closes the stream */
  const nuovaGenerazioneSessione = (o = {}) => {
    if (!o.continua) state.realSession.id = null;
    if (state.realSession.eventSource) { state.realSession.eventSource.aperto = false; state.realSession.eventSource = null; }
    fatti.push(`generation ${o.continua ? 'continua' : 'new'}`);
    return ++state.realSession.generation;
  };
  const collegaEventiSessione = (sid) => { state.realSession.id = sid; state.realSession.eventSource = { di: sid, aperto: true }; fatti.push(`attach ${sid}`); };
  const ambiente = { state, toast() {}, tr: (k) => k, aggiornaElencoSessioniReali() {}, runRealeAttivo: () => false,
    apiPost: () => new Promise((r) => { rilascia = r; }), nuovaGenerazioneSessione, collegaEventiSessione };
  const runDirectShell = new Function(...Object.keys(ambiente), `return ${corpo('runDirectShell').trim()}`)(...Object.values(ambiente));
  return { state, fatti, runDirectShell, rilascia: (x) => rilascia(x) };
}

test('G6-6 `!cmd` then «New chat» during the POST /shell: the empty new chat stays empty, the old chat is not re-attached', async () => {
  const e = shellEnv();
  const corsa = e.runDirectShell('ls', false);
  // «New chat» (avviaSessionePendente): its own generation, no task, the id goes null
  e.state.realSession.eventSource.aperto = false; e.state.realSession.eventSource = null;
  e.state.realSession.taskId = null; e.state.realSession.generation = 10; e.state.realSession.id = null;
  e.rilascia({});
  await corsa;
  assert.equal(e.state.realSession.id, null, 'the new empty chat is still empty');
  assert.deepEqual(e.fatti, [], 'nothing re-attached, no generation taken');
  assert.deepEqual([e.state.realSession.generation, e.state.realSession.taskId, e.state.realSession.eventSource], [10, null, null]);
});

test('G6-7 `!cmd` then a switch to s2 during the POST /shell: s2 keeps its stream, its generation and its task', async () => {
  const e = shellEnv();
  const corsa = e.runDirectShell('ls', false);
  // passaASessione('s2'): the stream of s1 closes, s2 is attached with its own generation and task
  e.state.realSession.eventSource.aperto = false; e.state.realSession.eventSource = null;
  e.state.realSession.generation = 5; e.state.realSession.taskId = 't2';
  e.state.realSession.id = 's2'; e.state.realSession.eventSource = { di: 's2', aperto: true };
  const es = e.state.realSession.eventSource;
  e.rilascia({});
  await corsa;
  assert.equal(e.state.realSession.id, 's2');
  assert.equal(e.state.realSession.eventSource, es, 'the stream of s2 is the same object');
  assert.equal(es.aperto, true, 'the stream of s2 is still open');
  assert.equal(e.state.realSession.generation, 5, 'the generation of s2 is untouched');
  assert.equal(e.state.realSession.taskId, 't2', 'the task of s2 is untouched');
  assert.deepEqual(e.fatti, []);
});
