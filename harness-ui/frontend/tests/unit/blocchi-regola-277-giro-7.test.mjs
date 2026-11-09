/*
 * Cura BG3 round 7 (owner decisions 378 and 382: the PC release waits for it). Reviewer A of round 6 (MEDIO, checked by the Desktop and the
 * judge): the answer of a block whose send FAILED went back into the composer (or the chat's draft) with no sign of the block, and the
 * person's next Enter ran it as a command typed by them: «!echo …» started the shell, «/settings conversation.permissions=fullAccess» was
 * applied. Now a failed block answer never goes back into the composer nor into a draft: the block opens again (the answer is taken back,
 * it can be clicked again) and its note says, in the person's language, that the choice was not sent. Hermes rolls a clarify answer back on
 * a failed send and keeps the card answerable (`apps/desktop/src/store/clarify.ts:366-389`,
 * `components/assistant-ui/clarify/pending.tsx:211-216`); Codex answers request_user_input with a typed protocol event, never composer
 * text (`codex-rs/tui/src/bottom_pane/request_user_input/mod.rs:862-906`).
 * The host runs the REAL bodies of legacy/app.js (submitPrompt, accodaMessaggioReale, rimettiInvioFallito, rimettiNelCompositore,
 * avviaSessioneImplicitaSeUnaSolaCartella and the helper that reopens the block), the REAL `consegna` line, the REAL hook and renderer,
 * with every side effect counted. Also here: reviewer A's ↑ recall (round 6, BASSO) and reviewer B's form probe (round 6, MEDIO-1).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { documento, clic, orologio, spento } from './aiuto-dom-blocchi.mjs';
import { impostaLingua, t } from '../../src/components/lingua.js';
import { creaAggancioBlocchi, bloccoPerLaBolla } from '../../src/components/blocchi/aggancio.js';
import { comandoObiettivo } from '../../src/components/obiettivo-carta.js';
import { bollaDaInviare } from '../../src/components/bolla-della-persona.js';
import { destinoInvioFallito } from '../../src/components/invio-fallito.js';
import * as imps from '../../src/components/impostazioni-dalla-chat.js';
import { catalogoPubblico } from '../../../src/impostazioni/catalogo-impostazioni.mjs';

impostaLingua('en');
imps.registraCatalogoImpostazioni({ voci: catalogoPubblico() });
const APP = readFileSync(new URL('../../src/legacy/app.js', import.meta.url), 'utf8');
const inizio = (nome) => APP.search(new RegExp(`\\n  (?:async )?function ${nome}\\(`, 'u'));
const corpo = (nome) => {
  const i = inizio(nome);
  assert.ok(i > 0, nome);
  const j = APP.slice(i + 1).search(/\n {2}(?:async )?function [\w$]+\(/u);
  return APP.slice(i + 1, j > 0 ? i + 1 + j : undefined);
};
const CONSEGNA = /^ {4}consegna: (\(testo, azione\) => \{.*\}),$/mu.exec(APP)?.[1];
const NOMI = ['submitPrompt', 'accodaMessaggioReale', 'rimettiInvioFallito', 'rimettiNelCompositore', 'avviaSessioneImplicitaSeUnaSolaCartella'];
/* the helper that reopens a block, when the code has it (round 7); without it the tests below fail on behaviour, not on a missing name */
const CORPI = [...NOMI, ...(inizio('riapriRispostaDelBlocco') > 0 ? ['riapriRispostaDelBlocco'] : [])].map(corpo).join('\n');
const tick = async (k = 6) => { for (let i = 0; i < k; i++) await new Promise((fatto) => setImmediate(fatto)); };

/*
 * One app: the real bodies, the real hook (its chat is the open chat, as in legacy/app.js), a composer, the drafts of the chats.
 * `resumeSession` and `startCustomSession` are too big to run here: they do what their real catch does on a failure (legacy/app.js,
 * `resumeSession` → `rimettiInvioFallito(sessionId, ripristino, immagini)`; `startCustomSession` → `rimettiNelCompositore(ripristino)`).
 */
function app({ stato = 'turn running', chiaveDelMessaggio = 'vecchia' } = {}) {
  const n = { shell: [], impostazioni: [], carte: [], avvisi: [], post: [], messaggi: [], ricordati: [], bozze: new Map() };
  const rete = { errore: 'ECONNRESET', primaDiFallire: null, progetti: [] };
  const state = { realSession: { id: stato === 'no chat' || stato === 'new chat' ? null : 's1', bollaDaMostrare: null, codaMessaggi: [] },
    pendingCustomSession: stato === 'new chat' ? { cartellaId: 'c1', nomeCartella: 'p' } : null, model: 'm', permissions: 'onRequest' };
  const composerInput = { value: '' };
  const document = documento();
  const messaggio = document.createElement('article');
  document.body.append(messaggio);
  let hook = null;
  const amb = {
    state, tr: (k) => k, composerInput, allegatiComposer: [],
    attendiUploadAllegati: () => false, comandoObiettivo, toast: (a) => n.avvisi.push(a), ricordaTestoInviato: (x) => n.ricordati.push(x),
    gestisciComandoObiettivo: (c) => n.carte.push(`/goal ${c.tipo}`), apriChatALato: () => ({ fai: () => n.carte.push('/btw') }),
    collegaDispositivoDallaChat: () => n.carte.push('/connect'), suggerimentiImpostazioni: imps.suggerimentiImpostazioni,
    aggiornaSuggerimentoComandi: () => {}, comandoImpostazioniDaApplicare: imps.comandoImpostazioniDaApplicare,
    applicaImpostazioniDallaPersona: (c) => n.impostazioni.push(JSON.stringify(c.changes ?? c)), compattaSubitoDallAvviso: () => n.carte.push('/compact'),
    setView: () => {}, runDirectShell: (c) => n.shell.push(c), runRealeAttivo: () => stato === 'turn running', bollaDaInviare,
    resumeSession: (v, immagini, o = {}) => {
      n.messaggi.push(v);
      const sid = state.realSession.id;
      if (rete.errore) { n.avvisi.push('app.run.sendFailed'); if (o.ripristino) f.rimettiInvioFallito(sid, o.ripristino, immagini); return Promise.resolve(false); }
      n.post.push(['resume', v]);
      return Promise.resolve(true);
    },
    modelloScelto: () => true, openSheet: (s) => n.carte.push(`sheet ${s}`),
    startCustomSession: (o) => {
      n.messaggi.push(o.consegna);
      if (!rete.errore) { n.post.push(['new chat', o.consegna]); return; }
      n.avvisi.push('app.run.startFailed');
      if (o.ripristino) { state.pendingCustomSession = state.pendingCustomSession ?? o.ripristino.pendente; f.rimettiNelCompositore(o.ripristino); }
    },
    progettiConfigurati: async () => rete.progetti,
    mappaPerUnaSessioneNuova: (x) => x, avvisaModelloMancanteSenzaSessione: () => n.avvisi.push('no model'),
    allineaLinguaDellaSessione: async () => {},
    apiPost: async (url, corpo) => {
      if (rete.primaDiFallire) { const prima = rete.primaDiFallire; rete.primaDiFallire = null; prima(); }
      if (rete.errore) { const e = new Error('network'); e.code = rete.errore; throw e; }
      n.post.push(['queue', corpo.messaggio]);
      return { posizione: 1 };
    },
    paginaBrowserDelMessaggio: () => null, payloadImmagini: (x) => x, applicaStatoCoda: () => {}, renderizzaBannerCoda: () => {},
    syncRunComposerState: () => {}, autoGrowTextarea: () => {}, ripristinaImmagini: () => {},
    destinoInvioFallito, chiaveBozzaAllegati: () => `sessione:${state.realSession.id}`,
    bozzaDi: (k) => { if (!n.bozze.has(k)) n.bozze.set(k, { allegati: [], testo: '' }); return n.bozze.get(k); }, salvaBozze: () => {},
    aggiungiAllegato: () => {}, aggiornaModalitaShell: () => {},
    aggancioBlocchi: () => hook,
  };
  const f = new Function(...Object.keys(amb), `${CORPI}\nreturn { submitPrompt, rimettiInvioFallito, rimettiNelCompositore };`)(...Object.values(amb));
  const consegna = new Function('submitPrompt', 'bloccoPerLaBolla', `return ${CONSEGNA};`)(f.submitPrompt, bloccoPerLaBolla);
  hook = creaAggancioBlocchi({ document, sessione: () => state.realSession.id, timer: orologio().timer, consegna,
    elementoDelMessaggio: (m) => (chiaveDelMessaggio === 'posto' && m === 'm1' ? messaggio : null), messaggioDelNodo: () => 'm1' });
  /* a block of the model in the open chat: the answer key is the old one (no message), the place key or the fence name (`nome=b1`) */
  const disegna = (sorgente) => {
    const nodo = hook.blocco(sorgente, true, chiaveDelMessaggio === 'nome' ? 'nome=b1' : '');
    messaggio.append(nodo);
    return nodo;
  };
  return { n, f, state, rete, composerInput, hook, disegna };
}

const scelte = (opzione) => `root = Scelte("prossimo", null, "How should I go on?", [{testo: ${JSON.stringify(opzione)}}, {testo: "Cancel"}])`;
const modulo = (etichetta) => `root = Modulo("mm", null, [{id: "x", etichetta: ${JSON.stringify(etichetta)}, tipo: "scelta", opzioni: [{testo: "yes"}]}], "Send")`;
const tasti = (nodo) => nodo.querySelectorAll('.gu-scelte button');
const notaScelte = (nodo) => nodo.querySelector('.gu-scelte__nota')?.textContent;
const notaModulo = (nodo) => nodo.querySelector('.gq-nota')?.textContent;
const vuote = (bozze) => [...bozze.values()].every((b) => !b.testo && !b.allegati.length);

/* what the person can do after the failure: Enter on what the composer now holds (the composer's own door: no block) */
function invioDellaPersona(x) {
  const testo = x.composerInput.value.trim();
  if (testo) x.f.submitPrompt(testo, { mostra: testo, allegati: [] });
}

/* the failure paths of a block answer: where it fails, and what the page does meanwhile */
const VIE = {
  'queue (turn running)': { stato: 'turn running' },
  'queue refused as not running, then resume (SESSION_NOT_READY)': { stato: 'turn running', errore: 'SESSION_NOT_READY' },
  'resume (chat finished)': { stato: 'chat finished' },
  'implicit start (no chat, no single folder)': { stato: 'no chat' },
  'new chat start (pending chat)': { stato: 'new chat' },
};
const OPZIONI = ['!echo g7', '/settings conversation.permissions=fullAccess'];

for (const [via, { stato, errore = 'ECONNRESET' }] of Object.entries(VIE)) for (const chiave of ['vecchia', 'posto', 'nome']) {
  test(`G7-1 a block answer whose send fails never goes back into the composer: the block opens again and says so (${via}, ${chiave} key)`, async () => {
    for (const opzione of OPZIONI) {
      const x = app({ stato, chiaveDelMessaggio: chiave });
      x.rete.errore = errore;
      const nodo = x.disegna(scelte(opzione));
      await tick();
      clic(tasti(nodo)[0]);
      await tick();
      assert.equal(x.composerInput.value, '', `${opzione}: the model's option is not put in the composer`);
      assert.ok(vuote(x.n.bozze), `${opzione}: nor in a draft`);
      assert.equal(x.state.realSession.bollaDaMostrare, null, `${opzione}: the next message does not pick up the block's bubble`);
      assert.ok(tasti(nodo).every((b) => !spento(b) && !b.hasAttribute('aria-pressed')), `${opzione}: the block can be clicked again`);
      assert.equal(notaScelte(nodo), t('blocchi.choices.notSent'), `${opzione}: the block says the choice was not sent`);
      assert.notEqual(t('blocchi.choices.notSent'), 'blocchi.choices.notSent', 'the sentence is in the dictionary');
      invioDellaPersona(x);
      assert.deepEqual([x.n.shell, x.n.impostazioni, x.n.carte], [[], [], []], `${opzione}: nothing typed by the model runs as a command`);
      assert.equal(x.n.avvisi.filter((a) => a !== 'app.queue.notQueued' && a !== 'app.run.sendFailed' && a !== 'app.run.startFailed'
        && a !== 'app.common.noActiveSession').length, 0, `${opzione}: no notice beyond the failure one already there (decision 375)`);
      /* the network is back: the same click sends the answer as a message, once, and the block is answered */
      x.rete.errore = null;
      x.rete.progetti = [{ id: 'c1', nome: 'p' }];
      clic(tasti(nodo)[0]);
      await tick();
      assert.equal(x.n.post.length, 1, `${opzione}: one send on the second click`);
      assert.equal(x.n.post[0][1], opzione, `${opzione}: the option goes as text`);
      assert.equal(tasti(nodo)[0].getAttribute('aria-pressed'), 'true', `${opzione}: the block is answered now`);
      assert.equal(notaScelte(nodo), t('blocchi.choices.sent'), `${opzione}: the note says the choice was sent (decision 398)`);
      clic(tasti(nodo)[1]);
      await tick();
      assert.equal(x.n.post.length, 1, `${opzione}: one click, one message: the block is closed again`);
      assert.deepEqual([x.n.shell, x.n.impostazioni, x.n.carte], [[], [], []]);
    }
  });
}

test('G7-2 a block answer that fails after the person moved to another chat goes into NO draft: back in its chat, the block is open again and says so', async () => {
  for (const chiave of ['vecchia', 'posto', 'nome']) {
    const x = app({ stato: 'turn running', chiaveDelMessaggio: chiave });
    const nodo = x.disegna(scelte('!echo g7 away'));
    await tick();
    let parcheggiato = null;
    x.rete.primaDiFallire = () => { parcheggiato = x.hook.parcheggia(); x.state.realSession.id = 's2'; }; // the person opens s2 meanwhile
    clic(tasti(nodo)[0]);
    await tick();
    assert.equal(x.composerInput.value, '', `${chiave}: not in the composer of s2`);
    assert.ok(vuote(x.n.bozze), `${chiave}: not in the draft of s1 either`);
    x.hook.azzera();
    x.state.realSession.id = 's1';
    assert.ok(x.hook.ripristina(parcheggiato), `${chiave}: the page of s1 comes back with no replay`);
    assert.ok(tasti(nodo).every((b) => !spento(b)), `${chiave}: the block of s1 can be clicked again`);
    assert.equal(notaScelte(nodo), t('blocchi.choices.notSent'), `${chiave}: and says the choice was not sent`);
    x.rete.errore = null;
    clic(tasti(nodo)[0]);
    await tick();
    assert.deepEqual(x.n.post, [['queue', '!echo g7 away']], `${chiave}: the second click sends it, as a message`);
    assert.deepEqual(x.n.shell, []);
  }
});

test('G7-3 a FORM answer whose send fails: the form opens again with its values, says it was not sent, and sends on the next click', async () => {
  for (const etichetta of ['!echo m7', '/settings conversation.permissions=fullAccess', '/compact']) for (const chiave of ['vecchia', 'posto']) {
    const x = app({ stato: 'turn running', chiaveDelMessaggio: chiave });
    const nodo = x.disegna(modulo(etichetta));
    await tick();
    clic(nodo.querySelector('.talos-chip[data-valore="yes"]'));
    clic(nodo.querySelector('button[data-invia-modulo]'));
    await tick();
    assert.equal(x.composerInput.value, '', `${etichetta}: the form's text is not put in the composer`);
    assert.ok(!spento(nodo.querySelector('button[data-invia-modulo]')), `${etichetta}: the form can be sent again`);
    assert.equal(notaModulo(nodo), t('blocchi.form.notSent'), `${etichetta}: the form says it was not sent`);
    assert.notEqual(t('blocchi.form.notSent'), 'blocchi.form.notSent');
    invioDellaPersona(x);
    assert.deepEqual([x.n.shell, x.n.impostazioni, x.n.carte], [[], [], []], `${etichetta}: no command`);
    x.rete.errore = null;
    clic(nodo.querySelector('button[data-invia-modulo]'));
    await tick();
    assert.deepEqual(x.n.post, [['queue', `${etichetta}: yes`]], `${etichetta}: one message with the form's text`);
    assert.equal(notaModulo(nodo), t('blocchi.form.note'));
    assert.ok(spento(nodo.querySelector('button[data-invia-modulo]')), `${etichetta}: answered`);
  }
});

test('G7-8 the message is drawn again while the answer is on its way: after the failure the NEW shell is open and says so', async () => {
  for (const chiave of ['vecchia', 'posto', 'nome']) {
    const x = app({ stato: 'turn running', chiaveDelMessaggio: chiave });
    const sorgente = scelte('!echo g7 redraw');
    const vecchio = x.disegna(sorgente);
    await tick();
    let nuovo = null;
    x.rete.primaDiFallire = () => { vecchio.remove(); nuovo = x.disegna(sorgente); }; // a whole redraw of the message tail
    clic(tasti(vecchio)[0]);
    await tick();
    assert.ok(nuovo, `${chiave}: redrawn`);
    assert.equal(x.composerInput.value, '', `${chiave}: not in the composer`);
    assert.ok(tasti(nuovo).every((b) => !spento(b) && !b.hasAttribute('aria-pressed')), `${chiave}: the new shell can be clicked again`);
    assert.equal(notaScelte(nuovo), t('blocchi.choices.notSent'), `${chiave}: and says the choice was not sent`);
    x.rete.errore = null;
    clic(tasti(nuovo)[0]);
    await tick();
    assert.deepEqual(x.n.post, [['queue', '!echo g7 redraw']], `${chiave}: one message on the next click`);
    assert.deepEqual(x.n.shell, []);
  }
});

test('G7-4 a block answer that IS sent stays answered: one click, one message, no "not sent" note', async () => {
  for (const chiave of ['vecchia', 'posto', 'nome']) {
    const x = app({ stato: 'turn running', chiaveDelMessaggio: chiave });
    x.rete.errore = null;
    const nodo = x.disegna(scelte('Continue'));
    await tick();
    clic(tasti(nodo)[0]);
    await tick();
    clic(tasti(nodo)[1]);
    await tick();
    assert.deepEqual(x.n.post, [['queue', 'Continue']]);
    assert.equal(notaScelte(nodo), t('blocchi.choices.sent')); // decision 398: an answered block says so
    assert.ok(tasti(nodo).every(spento));
  }
});

test('G7-5 a failed send of what the PERSON typed is unchanged: it goes back into the composer', async () => {
  const x = app({ stato: 'turn running' });
  x.f.submitPrompt('my own words', { mostra: 'my own words', allegati: [] });
  await tick();
  assert.equal(x.composerInput.value, 'my own words');
});

/* ---- reviewer A round 6 (BASSO): ↑ recalled a block's answer as if the person had written it ---- */
test('G7-6 ↑ recalls what the person wrote, never the answer of a block', async () => {
  const x = app({ stato: 'turn running' });
  x.rete.errore = null;
  const nodo = x.disegna(scelte('!echo recalled'));
  await tick();
  clic(tasti(nodo)[0]);
  await tick();
  assert.deepEqual(x.n.ricordati, [], 'a block answer is not in the composer history');
  x.f.submitPrompt('typed by me', { mostra: 'typed by me', allegati: [] });
  assert.deepEqual(x.n.ricordati, ['typed by me'], 'the person\'s own text is');
});

/* ---- reviewer B round 6 probe (MEDIO-1): a FORM block whose label the model wrote; the delivered text starts with the label ---- */
for (const etichetta of ['!echo m6', '/compact', '/connect']) {
  test(`G7-7 (reviewer B probe) a form block whose label is ${JSON.stringify(etichetta)} is a plain message`, async () => {
    for (const stato of ['turn running', 'chat finished', 'no chat']) {
      const x = app({ stato });
      x.rete.errore = null;
      x.rete.progetti = [{ id: 'c1', nome: 'p' }];
      const nodo = x.disegna(modulo(etichetta));
      await tick();
      clic(nodo.querySelector('.talos-chip[data-valore="yes"]'));
      clic(nodo.querySelector('button[data-invia-modulo]'));
      await tick();
      assert.deepEqual(x.n.messaggi.length + x.n.post.length >= 1, true, `${stato}: it went as a message`);
      assert.equal(x.n.shell.length + x.n.carte.length + x.n.impostazioni.length, 0, `${stato}: no command from a form label`);
    }
  });
}

/* ---- twins under one OLD key (the same words drawn twice, no name): the failed answer of one must not move to the other ---- */
function gemelli(testo) {
  const x = app({ stato: 'turn running', chiaveDelMessaggio: 'vecchia' });
  const a = x.disegna(scelte(testo));
  const b = x.disegna(scelte(testo));
  const chiavi = [];
  const riapri = x.hook.riapri;
  x.hook.riapri = (k, c) => { chiavi.push(k); return riapri(k, c); };
  return { x, a, b, chiavi, padre: a.parentNode };
}

test('G7-9 twins: B\'s answer fails, then the person answers A: A is answered and B stays open (the taken-back copy keeps no owner)', async () => {
  const { x, a, b, chiavi, padre } = gemelli('!echo twin');
  await tick();
  clic(tasti(b)[0]);
  await tick();
  assert.equal(chiavi.length, 1, 'the failed answer was taken back');
  assert.ok([a, b].every((n) => tasti(n).every((t2) => !spento(t2))), 'both twins are open after the failure');
  x.rete.errore = null;
  clic(tasti(a)[0]);
  await tick();
  assert.deepEqual(x.n.post, [['queue', '!echo twin']], 'one message, from A');
  assert.equal(tasti(a)[0].getAttribute('aria-pressed'), 'true', 'A is answered');
  const bOra = padre.children[1];
  assert.ok(tasti(bOra).every((t2) => !spento(t2) && !t2.hasAttribute('aria-pressed')), 'B is still open: A\'s answer is not B\'s');
  x.hook.spegni(chiavi[0], { tipo: 'scelte', valore: '!echo twin' }); // the server's echo of A's answer
  const bDopo = padre.children[1];
  assert.ok(tasti(bDopo).every((t2) => !spento(t2)), 'and the echo of A\'s answer does not lock B either');
  assert.deepEqual(x.n.shell, []);
});

test('G7-10 twins: B\'s send fails ambiguously (the server got it) and its event arrives: only B is locked, A stays open', async () => {
  const { x, chiavi, b, padre } = gemelli('!echo ambiguous');
  await tick();
  clic(tasti(b)[0]);
  await tick();
  assert.equal(chiavi.length, 1, 'the failed answer was taken back');
  x.hook.spegni(chiavi[0], { tipo: 'scelte', valore: '!echo ambiguous' }); // the server did get B's answer: its event comes
  const [aOra, bOra] = padre.children; // a locked shell is redrawn in its place
  assert.ok(tasti(bOra).every(spento), 'B, whose answer the server got, is locked');
  assert.ok(tasti(aOra).every((t2) => !spento(t2)), 'A, never clicked, stays open (cura 288: a click\'s owner is the clicked twin)');
  assert.deepEqual(x.n.shell, []);
});

test('G7-11 a WHOLE redraw (new shell drawn while the old one is still on the page, then swapped in) before the failure: the new shell opens again', async () => {
  const x = app({ stato: 'turn running', chiaveDelMessaggio: 'vecchia' });
  const sorgente = scelte('!echo g7 swap');
  const vecchio = x.disegna(sorgente);
  await tick();
  let nuovo = null;
  /* legacy/app.js `renderizzaMarkdownIncrementale` draws the new shell first and then replaces the children: the new shell takes the
     clicked one's answer at its place (`prendeIlPosto`, a microtask), and only then the send fails */
  x.rete.primaDiFallire = () => { nuovo = x.hook.blocco(sorgente, true, ''); vecchio.replaceWith(nuovo); };
  clic(tasti(vecchio)[0]);
  await tick();
  assert.ok(nuovo?.isConnected, 'swapped in');
  assert.equal(x.composerInput.value, '', 'not in the composer');
  assert.ok(tasti(nuovo).every((b) => !spento(b) && !b.hasAttribute('aria-pressed')), 'the new shell can be clicked again');
  assert.equal(notaScelte(nuovo), t('blocchi.choices.notSent'), 'and says the choice was not sent');
  x.rete.errore = null;
  clic(tasti(nuovo)[0]);
  await tick();
  assert.deepEqual(x.n.post, [['queue', '!echo g7 swap']], 'one message on the next click');
  assert.deepEqual(x.n.shell, []);
});
