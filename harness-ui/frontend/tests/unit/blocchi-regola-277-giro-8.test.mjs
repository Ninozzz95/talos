/*
 * Cura BG3 round 8 (owner decision 387). The reviewers of round 7 found, on the REAL bodies of legacy/app.js:
 *   A1 (MEDIO) a turn born from a block that the kernel refused as too large (REQUEST_TOO_LARGE) put the block's answer back into the
 *      composer, with an `input` event: «!echo …» written by the model ran on the person's next Enter (long and short text alike);
 *   A2 (MEDIO) `consegna` ignored the `false` of `submitPrompt` (a file still uploading, no model): the block stayed answered and nothing
 *      was sent, with no way to send it again;
 *   B1 (BASSO) twins under one old key: A sent, then B failed, and A opened again saying «not sent» (a new click sent it twice);
 *   C1 (BASSO) the note under a Choices block said that anything that changes something still asks first: false in Full access.
 * Now a block's answer never enters the composer, a draft or the ↑ history; when it is not sent (refused in the page, failed, too large)
 * the block opens again and says so. Hermes rolls a clarify answer back and keeps the card answerable
 * (`apps/desktop/src/store/clarify.ts:366-389`); Codex answers request_user_input with a protocol event and keeps only composer
 * submissions in its history (`codex-rs/tui/src/bottom_pane/request_user_input/mod.rs:862-906`,
 * `codex-rs/tui/src/bottom_pane/chat_composer_history.rs:316-322`).
 * The host runs the REAL bodies (submitPrompt and its helpers, the `consegna` line, the RunStarted lines, the REQUEST_TOO_LARGE branch),
 * the REAL hook and renderers. Also here: the probes of reviewers A and B of round 7 (S1, S3, S4, S5, S6, RB1-RB5) and the tests that
 * close their live mutants.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { documento, clic, orologio, spento } from './aiuto-dom-blocchi.mjs';
import { impostaLingua, t } from '../../src/components/lingua.js';
import { creaAggancioBlocchi, bloccoPerLaBolla, impronta, EVENTO_VERSIONE_DEL_BLOCCO } from '../../src/components/blocchi/aggancio.js';
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
const NOMI = ['submitPrompt', 'accodaMessaggioReale', 'rimettiInvioFallito', 'rimettiNelCompositore', 'avviaSessioneImplicitaSeUnaSolaCartella', 'riapriRispostaDelBlocco'];
const CORPI = NOMI.map(corpo).join('\n');
/* the RunStarted lines that remember the turn's question (and, now, whether a block wrote it) */
const RUN_STARTED = (() => {
  const i = APP.indexOf('        const domandaDelGiro = ');
  const fine = APP.indexOf('state.realSession.giroDellaPersona = giroDellaPersona;', i);
  assert.ok(i > 0 && fine > i, 'RunStarted lines');
  return APP.slice(i, fine + 'state.realSession.giroDellaPersona = giroDellaPersona;'.length);
})();
/* the REQUEST_TOO_LARGE branch of the failed turn */
const TROPPO_GRANDE = (() => {
  const i = APP.indexOf("if (evento.code === 'REQUEST_TOO_LARGE' && delGiroDellaPersona) {");
  assert.ok(i > 0, 'REQUEST_TOO_LARGE branch');
  return APP.slice(i, APP.indexOf('\n        }\n', i) + 10);
})();
const tick = async (k = 6) => { for (let i = 0; i < k; i++) await new Promise((fatto) => setImmediate(fatto)); };

/*
 * One app: the real bodies, the real hook (its chat is the open chat), a composer that counts its events, the drafts. `resumeSession` and
 * `startCustomSession` do what their real catch does on a failure. `bolle` keeps every bubble that reached the server (queue, resume, new
 * chat): the server keeps `bolla.blocco` and gives it back in the turn's RunStarted (`harness-ui/src/bolla-della-persona.mjs`).
 */
function app({ stato = 'turn running', chiaveDelMessaggio = 'vecchia', upload = false, modello = 'm' } = {}) {
  const n = { shell: [], impostazioni: [], carte: [], avvisi: [], post: [], messaggi: [], ricordati: [], bozze: new Map(), bolle: [], ricevutiDalServer: [] };
  const rete = { errore: 'ECONNRESET', ambiguo: false, primaDiFallire: null, progetti: [] };
  const state = { realSession: { id: stato === 'no chat' || stato === 'new chat' ? null : 's1', bollaDaMostrare: null, codaMessaggi: [] },
    pendingCustomSession: stato === 'new chat' ? { cartellaId: 'c1', nomeCartella: 'p' } : null, model: modello, permissions: 'onRequest' };
  const composerInput = { value: '', eventi: [], dispatchEvent(e) { this.eventi.push(e.type); } };
  const document = documento();
  const messaggio = document.createElement('article');
  document.body.append(messaggio);
  let hook = null;
  const sonda = { upload };
  const amb = {
    state, tr: (k) => k, composerInput, allegatiComposer: [],
    attendiUploadAllegati: () => { if (sonda.upload) { n.avvisi.push('app.attachments.loading'); return true; } return false; },
    comandoObiettivo, toast: (a) => n.avvisi.push(a), ricordaTestoInviato: (x) => n.ricordati.push(x),
    gestisciComandoObiettivo: (c) => n.carte.push(`/goal ${c.tipo}`), apriChatALato: () => ({ fai: () => n.carte.push('/btw') }),
    collegaDispositivoDallaChat: () => n.carte.push('/connect'), suggerimentiImpostazioni: imps.suggerimentiImpostazioni,
    aggiornaSuggerimentoComandi: () => {}, comandoImpostazioniDaApplicare: imps.comandoImpostazioniDaApplicare,
    applicaImpostazioniDallaPersona: (c) => n.impostazioni.push(JSON.stringify(c.changes ?? c)), compattaSubitoDallAvviso: () => n.carte.push('/compact'),
    setView: () => {}, runDirectShell: (c) => n.shell.push(c), runRealeAttivo: () => stato === 'turn running', bollaDaInviare,
    resumeSession: (v, immagini, o = {}) => {
      n.messaggi.push(v);
      const sid = state.realSession.id;
      if (rete.errore) { n.avvisi.push('app.run.sendFailed'); if (o.ripristino) f.rimettiInvioFallito(sid, o.ripristino, immagini); return Promise.resolve(false); }
      n.bolle.push(o.bolla ?? null);
      n.post.push(['resume', v]);
      return Promise.resolve(true);
    },
    modelloScelto: () => typeof state.model === 'string' && state.model.trim() !== '', openSheet: (s) => n.carte.push(`sheet ${s}`),
    startCustomSession: (o) => {
      n.messaggi.push(o.consegna);
      if (!rete.errore) { n.bolle.push(o.bolla ?? null); n.post.push(['new chat', o.consegna]); return; }
      n.avvisi.push('app.run.startFailed');
      if (o.ripristino) { state.pendingCustomSession = state.pendingCustomSession ?? o.ripristino.pendente; f.rimettiNelCompositore(o.ripristino); }
    },
    progettiConfigurati: async () => rete.progetti,
    mappaPerUnaSessioneNuova: (x) => x, avvisaModelloMancanteSenzaSessione: () => n.avvisi.push('no model'),
    allineaLinguaDellaSessione: async () => {},
    apiPost: async (url, corpoPost) => {
      if (rete.primaDiFallire) { const prima = rete.primaDiFallire; rete.primaDiFallire = null; prima(); }
      if (rete.ambiguo) { n.ricevutiDalServer.push(corpoPost.messaggio); const e = new Error('timeout'); e.code = 'ETIMEDOUT'; throw e; }
      if (rete.errore) { const e = new Error('network'); e.code = rete.errore; throw e; }
      n.ricevutiDalServer.push(corpoPost.messaggio);
      n.bolle.push(corpoPost.bolla ?? null);
      n.post.push(['queue', corpoPost.messaggio]);
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
  const consegna = new Function('submitPrompt', 'bloccoPerLaBolla', 'aggancioBlocchi', 'state', `return ${CONSEGNA};`)(
    f.submitPrompt, bloccoPerLaBolla, () => hook, state);
  hook = creaAggancioBlocchi({ document, sessione: () => state.realSession.id, timer: orologio().timer, consegna,
    elementoDelMessaggio: (m) => (chiaveDelMessaggio === 'posto' && m === 'm1' ? messaggio : null), messaggioDelNodo: () => 'm1' });
  const disegna = (sorgente) => {
    const nodo = hook.blocco(sorgente, true, chiaveDelMessaggio === 'nome' ? 'nome=b1' : '');
    messaggio.append(nodo);
    return nodo;
  };
  /* the turn's events as legacy/app.js runs them: RunStarted (the question it remembers), then the failure REQUEST_TOO_LARGE */
  const giroIniziato = (input) => new Function('evento', 'state', 'eDialogoAgente', RUN_STARTED)({ type: 'RunStarted', input }, state, () => false);
  const troppoGrande = () => {
    const spiegazione = {};
    new Function('evento', 'delGiroDellaPersona', 'state', 'composerInput', 'spiegazione', 'segnaUltimaBollaNonInviata', 'aggancioBlocchi', TROPPO_GRANDE)(
      { code: 'REQUEST_TOO_LARGE' }, true, state, composerInput, spiegazione, () => n.carte.push('bubble not sent'), () => hook);
    return spiegazione;
  };
  return { n, f, state, rete, composerInput, hook, disegna, sonda, messaggio, giroIniziato, troppoGrande };
}

const scelte = (opzione) => `root = Scelte("prossimo", null, "How should I go on?", [{testo: ${JSON.stringify(opzione)}}, {testo: "Cancel"}])`;
const modulo = (etichetta) => `root = Modulo("mm", null, [{id: "x", etichetta: ${JSON.stringify(etichetta)}, tipo: "scelta", opzioni: [{testo: "yes"}]}], "Send")`;
const tasti = (nodo) => nodo.querySelectorAll('.gu-scelte button');
const notaScelte = (nodo) => nodo.querySelector('.gu-scelte__nota')?.textContent;
const notaModulo = (nodo) => nodo.querySelector('.gq-nota')?.textContent;
const aperto = (nodo) => tasti(nodo).every((b) => !spento(b));
const vuote = (bozze) => [...bozze.values()].every((b) => !b.testo && !b.allegati.length);
function invioDellaPersona(x) {
  const testo = x.composerInput.value.trim();
  if (testo) x.f.submitPrompt(testo, { mostra: testo, allegati: [] });
}
const conChiavi = (x) => {
  const chiavi = [];
  const riapri = x.hook.riapri;
  x.hook.riapri = (k, c) => { chiavi.push(k); return riapri(k, c); };
  return chiavi;
};

/* ───────────── A2: `submitPrompt` refuses in the page (file uploading, no model): the block opens again and says so ───────────── */
for (const caso of [
  { nome: 'a file still uploading, turn running', stato: 'turn running', upload: true },
  { nome: 'a file still uploading, chat finished', stato: 'chat finished', upload: true },
  { nome: 'no model, no chat', stato: 'no chat', modello: '' },
  { nome: 'no model, pending new chat', stato: 'new chat', modello: '' },
]) {
  test(`G8-S1 ${caso.nome}: the click is refused in the page, the block opens again and says not sent; the next click sends once`, async () => {
    const x = app(caso);
    x.rete.errore = null;
    const nodo = x.disegna(scelte('!echo s1'));
    await tick();
    clic(tasti(nodo)[0]);
    await tick();
    assert.equal(x.n.post.length, 0, 'nothing sent');
    assert.ok(aperto(nodo), 'the block can be clicked again');
    assert.equal(notaScelte(nodo), t('blocchi.choices.notSent'), 'the block says the choice was not sent');
    assert.equal(x.composerInput.value, '', 'nothing in the composer');
    assert.ok(vuote(x.n.bozze), 'nor in a draft');
    assert.deepEqual(x.n.ricordati, [], 'nor in the ↑ history');
    assert.equal(x.state.realSession.bollaDaMostrare, null, 'the next message does not pick up the block bubble');
    x.sonda.upload = false; x.state.model = 'm'; x.rete.progetti = [{ id: 'c1', nome: 'p' }];
    clic(tasti(nodo)[0]);
    clic(tasti(nodo)[0]);
    await tick();
    assert.equal(x.n.post.length, 1, 'the re-click sends once');
    assert.ok(!aperto(nodo), 'answered');
    assert.equal(notaScelte(nodo), t('blocchi.choices.sent')); // decision 398: an answered block says so
    assert.deepEqual([x.n.shell, x.n.impostazioni, x.n.carte.filter((c) => !c.startsWith('sheet'))], [[], [], []], 'nothing ran as a command');
  });
}

test('G8-S1b a form refused in the page (file uploading) opens again with its values and says not sent', async () => {
  const x = app({ stato: 'turn running', upload: true });
  x.rete.errore = null;
  const nodo = x.disegna(modulo('!echo form'));
  await tick();
  clic(nodo.querySelector('.talos-chip[data-valore="yes"]'));
  clic(nodo.querySelector('button[data-invia-modulo]'));
  await tick();
  assert.equal(x.n.post.length, 0);
  assert.ok(!spento(nodo.querySelector('button[data-invia-modulo]')), 'the form can be sent again');
  assert.equal(notaModulo(nodo), t('blocchi.form.notSent'));
  x.sonda.upload = false;
  clic(nodo.querySelector('button[data-invia-modulo]'));
  await tick();
  assert.deepEqual(x.n.post, [['queue', '!echo form: yes']]);
});

/* ───────────── A1: a turn born from a block, refused as too large: nothing goes to the composer, the block opens again ───────────── */
for (const [nome, opzione] of [['long', `!echo pwned #${'x'.repeat(9_100)}`], ['short', '!echo short']]) {
  for (const stato of ['turn running', 'chat finished']) {
    test(`G8-S3 (${nome} text, ${stato}) REQUEST_TOO_LARGE on a turn born from a block: composer empty, no Enter runs it, the block opens again`, async () => {
      const x = app({ stato });
      x.rete.errore = null;
      const nodo = x.disegna(scelte(opzione));
      await tick();
      clic(tasti(nodo)[0]);
      await tick();
      assert.equal(x.n.post.length, 1, 'the answer left');
      const bolla = x.n.bolle.at(-1);
      assert.ok(bolla?.blocco?.chiave, 'the bubble carries its block');
      x.giroIniziato({ consegna: opzione, bolla });
      const spiegazione = x.troppoGrande();
      assert.equal(x.composerInput.value, '', 'the model\'s text is not put in the composer');
      assert.deepEqual(x.composerInput.eventi, [], 'no input event');
      assert.ok(!spiegazione.testoNonInviato, '«Send as attachment» does not carry the block\'s text');
      invioDellaPersona(x);
      assert.deepEqual(x.n.shell, [], 'Enter runs nothing');
      assert.deepEqual(x.n.carte, ['bubble not sent'], 'the bubble still says not sent');
      assert.ok(aperto(nodo), 'the block opens again');
      assert.equal(notaScelte(nodo), t('blocchi.choices.notSent'));
      assert.deepEqual(x.n.ricordati, [], 'nothing in the ↑ history');
      assert.ok(vuote(x.n.bozze), 'nor in a draft');
      clic(tasti(nodo)[0]);
      clic(tasti(nodo)[0]);
      await tick();
      assert.equal(x.n.post.length, 2, 'the re-click sends once more');
    });
  }
}

test('G8-S3b REQUEST_TOO_LARGE replayed after a reload: the block of that turn opens again, the composer stays empty', async () => {
  const x = app({ stato: 'chat finished' });
  x.rete.errore = null;
  const sorgente = scelte('!echo replay');
  const nodo = x.disegna(sorgente);
  await tick();
  clic(tasti(nodo)[0]);
  await tick();
  const bolla = x.n.bolle.at(-1);
  /* the reload: a fresh hook state, the block drawn again from the history and locked by its replayed answer */
  x.hook.azzera();
  nodo.remove();
  const dopo = x.disegna(sorgente);
  await tick();
  x.hook.spegni(bolla.blocco.chiave, { tipo: 'scelte', valore: '!echo replay' });
  await tick();
  const ora = x.messaggio.children[x.messaggio.children.length - 1];
  assert.ok(!aperto(ora), 'locked by the replayed answer');
  x.state.realSession.inRigiocata = true;
  x.giroIniziato({ consegna: '!echo replay', bolla });
  x.troppoGrande();
  const fine = x.messaggio.children[x.messaggio.children.length - 1];
  assert.equal(x.composerInput.value, '');
  assert.ok(aperto(fine), 'the history says it was not sent: the block is open');
  assert.ok(dopo);
});

test('G8-S3c the person\'s own text refused as too large still goes back into the empty composer, with the attach button', async () => {
  const x = app({ stato: 'chat finished' });
  const testo = `!echo mine ${'y'.repeat(9_100)}`;
  x.giroIniziato({ consegna: testo });
  const spiegazione = x.troppoGrande();
  assert.equal(x.composerInput.value, testo);
  assert.deepEqual(x.composerInput.eventi, ['input']);
  assert.equal(spiegazione.testoNonInviato, testo);
});

/* kills N12: the replay keeps its old rule for the person's own text too (the history is not a live failure: nothing goes back) */
test('G8-S3e the person\'s own text replayed as too large after a reload: the composer stays empty', async () => {
  const x = app({ stato: 'chat finished' });
  x.state.realSession.inRigiocata = true;
  x.giroIniziato({ consegna: '!echo typed by me' });
  const spiegazione = x.troppoGrande();
  assert.equal(x.composerInput.value, '');
  assert.deepEqual(x.composerInput.eventi, []);
  assert.equal(spiegazione.testoNonInviato, '');
});

test('G8-S3d a person\'s turn after a block\'s turn forgets the block: its REQUEST_TOO_LARGE refills the composer', async () => {
  const x = app({ stato: 'chat finished' });
  x.rete.errore = null;
  const nodo = x.disegna(scelte('Continue'));
  await tick();
  clic(tasti(nodo)[0]);
  await tick();
  x.giroIniziato({ consegna: 'Continue', bolla: x.n.bolle.at(-1) });
  x.giroIniziato({ consegna: 'my own long text' });
  x.troppoGrande();
  assert.equal(x.composerInput.value, 'my own long text');
  assert.ok(!aperto(nodo), 'the block of the earlier turn stays answered');
});

test('G8-A1 every door that sends a block answer carries the block in its bubble (queue, resume, new chat, implicit start)', async () => {
  for (const [stato, via] of [['turn running', 'queue'], ['chat finished', 'resume'], ['new chat', 'new chat'], ['no chat', 'new chat']]) {
    const x = app({ stato });
    x.rete.errore = null;
    x.rete.progetti = [{ id: 'c1', nome: 'p' }];
    const nodo = x.disegna(scelte('Go'));
    await tick();
    clic(tasti(nodo)[0]);
    await tick();
    assert.equal(x.n.post[0]?.[0], via, stato);
    assert.equal(typeof x.n.bolle[0]?.blocco?.chiave, 'string', `${stato}: the bubble carries the block`);
  }
});

test('G8-A1b ↑ recalls the person\'s text and never a block answer', async () => {
  const x = app({ stato: 'turn running' });
  x.rete.errore = null;
  const nodo = x.disegna(scelte('!echo block'));
  await tick();
  clic(tasti(nodo)[0]);
  await tick();
  x.f.submitPrompt('typed by me', { mostra: 'typed by me', allegati: [] });
  await tick();
  assert.deepEqual(x.n.ricordati, ['typed by me']);
});

/* ───────────── probes of reviewer A, round 7 ───────────── */
test('G8-S4 New chat while the answer is on its way, then the failure: composer and drafts stay empty, Enter runs nothing', async () => {
  const x = app({ stato: 'turn running' });
  const nodo = x.disegna(scelte('!echo away'));
  await tick();
  x.rete.primaDiFallire = () => { x.hook.azzera(); x.state.realSession.id = null; x.state.pendingCustomSession = { cartellaId: 'c1', nomeCartella: 'p' }; };
  clic(tasti(nodo)[0]);
  await tick();
  invioDellaPersona(x);
  assert.equal(x.composerInput.value, '');
  assert.ok(vuote(x.n.bozze));
  assert.deepEqual(x.n.shell, []);
  assert.equal(x.state.realSession.bollaDaMostrare, null);
});

test('G8-S5 after the failure the person reloads: the block drawn again is open and two clicks send once', async () => {
  const x = app({ stato: 'turn running' });
  const nodo = x.disegna(scelte('Continue'));
  await tick();
  clic(tasti(nodo)[0]);
  await tick();
  x.hook.azzera();
  nodo.remove();
  const dopo = x.disegna(scelte('Continue'));
  await tick();
  assert.ok(aperto(dopo));
  x.rete.errore = null;
  clic(tasti(dopo)[0]);
  clic(tasti(dopo)[0]);
  await tick();
  assert.equal(x.n.post.length, 1);
});

test('G8-S6 twins: A sent for real (echo), then B fails: A stays answered and a click on A sends nothing', async () => {
  const x = app({ stato: 'turn running' });
  const a = x.disegna(scelte('Merge it'));
  x.disegna(scelte('Merge it'));
  const padre = a.parentNode;
  await tick();
  x.rete.errore = null;
  clic(tasti(a)[0]);
  await tick();
  const k = x.state.realSession.bollaDaMostrare?.blocco?.chiave ?? x.n.bolle.at(-1)?.blocco?.chiave;
  assert.ok(k);
  x.hook.spegni(k, { tipo: 'scelte', valore: 'Merge it' });
  await tick();
  const [, b1] = padre.children;
  x.rete.errore = 'ECONNRESET';
  if (aperto(b1)) clic(tasti(b1)[0]);
  await tick();
  const [a2] = padre.children;
  assert.ok(!aperto(a2), 'A, already delivered, stays answered');
  assert.notEqual(notaScelte(a2), t('blocchi.choices.notSent'));
  x.rete.errore = null;
  const prima = x.n.post.length;
  clic(tasti(a2)[0]);
  await tick();
  assert.equal(x.n.post.length, prima, 'no second send of A');
});

/* ───────────── probes of reviewer B, round 7 ───────────── */
function gemelli(testo) {
  const x = app({ stato: 'turn running', chiaveDelMessaggio: 'vecchia' });
  const a = x.disegna(scelte(testo));
  const b = x.disegna(scelte(testo));
  return { x, a, b, chiavi: conChiavi(x), padre: a.parentNode };
}

test('G8-RB1 twins under one old key: A is sent (and its echo arrives), then B fails: A stays answered and does not say not sent', async () => {
  const prova = gemelli('!echo twin ok');
  await tick();
  clic(tasti(prova.b)[0]);
  await tick();
  const K = prova.chiavi[0];
  assert.ok(K, 'key learnt');
  const { x, a, padre } = gemelli('!echo twin ok');
  await tick();
  x.rete.errore = null;
  clic(tasti(a)[0]);
  await tick();
  assert.deepEqual(x.n.post, [['queue', '!echo twin ok']]);
  x.hook.spegni(K, { tipo: 'scelte', valore: '!echo twin ok' });
  await tick();
  const [, b1] = padre.children;
  x.rete.errore = 'ECONNRESET';
  clic(tasti(b1)[0]);
  await tick();
  const [aOra, bOra] = padre.children;
  assert.equal(aperto(aOra), false, 'A stays answered');
  assert.notEqual(notaScelte(aOra), t('blocchi.choices.notSent'), 'A does not say not sent');
  assert.equal(aperto(bOra), true, 'B, whose send failed, opens again');
  assert.equal(notaScelte(bOra), t('blocchi.choices.notSent'));
  x.rete.errore = null;
  clic(tasti(aOra)[0]);
  await tick();
  assert.equal(x.n.post.length, 1, 'no second send of A');
});

/* kills R25: a turn whose answer came back from the journal (K) and then failed as too large reopens K; a block that ANOTHER gesture of the
   chat still answers (here the parent's replayed key of a fork, same words) stays answered and never says «not sent» */
test('G8-R25 a journal key reopened after the turn failed: a block still answered by another key of the chat stays answered', async () => {
  const prova = gemelli('!echo two keys');
  await tick();
  clic(tasti(prova.a)[0]);
  await tick();
  const K = prova.chiavi[0];
  assert.ok(K && /^s1:/u.test(K), 'old key learnt');
  const x = app({ stato: 'turn running', chiaveDelMessaggio: 'vecchia' });
  x.disegna(scelte('!echo two keys'));
  const nodo = () => x.messaggio.children[0];
  await tick();
  x.hook.spegni(K, { tipo: 'scelte', valore: '!echo two keys' });
  x.hook.spegni(K.replace(/^s1:/u, 'genitore:'), { tipo: 'scelte', valore: '!echo two keys' });
  await tick();
  assert.equal(aperto(nodo()), false, 'answered by the journal');
  x.hook.riapri(K, 's1');
  await tick();
  assert.equal(aperto(nodo()), false, 'the other key still answers it');
  assert.notEqual(notaScelte(nodo()), t('blocchi.choices.notSent'));
  x.rete.errore = null;
  clic(tasti(nodo())[0]);
  await tick();
  assert.equal(x.n.post.length, 0, 'no send');
});

for (const chiave of ['posto', 'nome', 'vecchia']) {
  test(`G8-RB2 (${chiave} key) fail, re-click OK, echo, then a whole redraw: the block stays answered, no second send`, async () => {
    const x = app({ stato: 'turn running', chiaveDelMessaggio: chiave });
    const sorgente = scelte('!echo redo');
    const nodo = x.disegna(sorgente);
    await tick();
    const chiavi = conChiavi(x);
    clic(tasti(nodo)[0]);
    await tick();
    x.rete.errore = null;
    clic(tasti(nodo)[0]);
    await tick();
    assert.equal(x.n.post.length, 1);
    x.hook.spegni(chiavi[0], { tipo: 'scelte', valore: '!echo redo' });
    await tick();
    nodo.remove();
    const nuovo = x.disegna(sorgente);
    await tick();
    assert.equal(aperto(nuovo), false);
    clic(tasti(nuovo)[0]);
    await tick();
    assert.equal(x.n.post.length, 1);
  });
  test(`G8-RB3 (${chiave} key) fail, re-click OK with no echo yet, then a whole redraw: the block stays answered`, async () => {
    const x = app({ stato: 'turn running', chiaveDelMessaggio: chiave });
    const sorgente = scelte('!echo redo2');
    const nodo = x.disegna(sorgente);
    await tick();
    clic(tasti(nodo)[0]);
    await tick();
    x.rete.errore = null;
    clic(tasti(nodo)[0]);
    await tick();
    nodo.remove();
    const nuovo = x.disegna(sorgente);
    await tick();
    assert.equal(aperto(nuovo), false);
  });
  test(`G8-RB4 (${chiave} key) ambiguous failure, then its echo: the block closes, never says not sent, a click sends nothing`, async () => {
    const x = app({ stato: 'turn running', chiaveDelMessaggio: chiave });
    const nodo = x.disegna(scelte('!echo ambiguous'));
    await tick();
    const chiavi = conChiavi(x);
    clic(tasti(nodo)[0]);
    await tick();
    assert.ok(chiavi[0]);
    const padre = nodo.parentNode;
    const indice = [...padre.children].indexOf(nodo);
    const prima = x.n.post.length;
    x.hook.spegni(chiavi[0], { tipo: 'scelte', valore: '!echo ambiguous' });
    await tick();
    const ora = padre.children[indice];
    clic(tasti(ora)[0]);
    await tick();
    assert.equal(x.n.post.length - prima, 0);
    assert.equal(aperto(ora), false);
    assert.doesNotMatch(String(notaScelte(ora)), /not sent/u);
  });
  test(`G8-RB5 (${chiave} key) ambiguous failure on a parked page: the echo locks it and, back on screen, it does not say not sent`, async () => {
    const x = app({ stato: 'turn running', chiaveDelMessaggio: chiave });
    const nodo = x.disegna(scelte('!echo parked'));
    await tick();
    const chiavi = conChiavi(x);
    clic(tasti(nodo)[0]);
    await tick();
    const padre = nodo.parentNode;
    nodo.remove();
    x.hook.spegni(chiavi[0], { tipo: 'scelte', valore: '!echo parked' });
    await tick();
    padre.append(nodo);
    await tick();
    const ora = padre.children[padre.children.length - 1];
    assert.doesNotMatch(String(notaScelte(ora)), /not sent/u);
  });
  test(`G8-RB5f (${chiave} key) the same for a FORM: answered by its echo, its note never says not sent`, async () => {
    const x = app({ stato: 'turn running', chiaveDelMessaggio: chiave });
    const nodo = x.disegna(modulo('!echo form parked'));
    await tick();
    const chiavi = conChiavi(x);
    clic(nodo.querySelector('.talos-chip[data-valore="yes"]'));
    clic(nodo.querySelector('button[data-invia-modulo]'));
    await tick();
    assert.equal(notaModulo(nodo), t('blocchi.form.notSent'));
    const padre = nodo.parentNode;
    nodo.remove();
    x.hook.spegni(chiavi[0], { tipo: 'modulo', valore: { x: 'yes' } });
    await tick();
    padre.append(nodo);
    await tick();
    const ora = padre.children[padre.children.length - 1];
    assert.ok(spento(ora.querySelector('button[data-invia-modulo]')), 'answered');
    assert.doesNotMatch(String(notaModulo(ora)), /not sent/iu);
  });
}

/* ───────────── the mutants left alive by reviewers A and B of round 7 ───────────── */
test('G8-M05 the memory of clicked blocks keeps the NEWEST 200: the 201st block whose send fails still opens again', async () => {
  const x = app({ stato: 'turn running' });
  x.rete.errore = null;
  const nodi = [];
  for (let i = 0; i < 201; i++) nodi.push(x.disegna(scelte(`option ${i}`)));
  await tick();
  for (let i = 0; i < 200; i++) clic(tasti(nodi[i])[0]);
  await tick(10);
  assert.equal(x.n.post.length, 200);
  x.rete.errore = 'ECONNRESET';
  clic(tasti(nodi[200])[0]);
  await tick(10);
  assert.ok(aperto(nodi[200]), 'the newest failed block opens again');
  assert.equal(notaScelte(nodi[200]), t('blocchi.choices.notSent'));
});

test('G8-M08 a named block: fail, re-click OK, then its name binds to the message and the shell is drawn again: still answered', async () => {
  const x = app({ stato: 'turn running', chiaveDelMessaggio: 'nome' });
  const sorgente = scelte('!echo named');
  const nodo = x.disegna(sorgente);
  await tick();
  clic(tasti(nodo)[0]);
  await tick();
  assert.ok(aperto(nodo), 'failed: open');
  x.rete.errore = null;
  clic(tasti(nodo)[0]);
  await tick();
  assert.equal(x.n.post.length, 1);
  x.hook.aggiornaVersione({ type: 'CUSTOM', name: EVENTO_VERSIONE_DEL_BLOCCO, _sequenza: 1, value: { conversazione: 's1', messaggio: 'm1', posizione: 0,
    blocco: 'b1', versione: 1, sorgente, impronta: impronta(sorgente), cosaECambiato: '', origine: 'modello' } });
  await tick();
  nodo.remove();
  const nuovo = x.disegna(sorgente);
  await tick();
  assert.equal(aperto(nuovo), false, 'the redrawn named block is answered');
  clic(tasti(nuovo)[0]);
  await tick();
  assert.equal(x.n.post.length, 1, 'no second send');
});

/* kills R08: the second shell has no predecessor to take over (the first is still on the page), so only the `~` index of its name finds the
   re-click; a taken-back gesture left there would hide it and the copy would send the same answer again */
test('G8-M08b a named block: fail, re-click OK, v1 binds, then the same block drawn in another place (side view): answered, no second send', async () => {
  const x = app({ stato: 'turn running', chiaveDelMessaggio: 'nome' });
  const sorgente = scelte('!echo named side');
  const nodo = x.disegna(sorgente);
  await tick();
  clic(tasti(nodo)[0]);
  await tick();
  assert.ok(aperto(nodo), 'failed: open');
  x.rete.errore = null;
  clic(tasti(nodo)[0]);
  await tick();
  assert.equal(x.n.post.length, 1);
  x.hook.aggiornaVersione({ type: 'CUSTOM', name: EVENTO_VERSIONE_DEL_BLOCCO, _sequenza: 1, value: { conversazione: 's1', messaggio: 'm1', posizione: 0,
    blocco: 'b1', versione: 1, sorgente, impronta: impronta(sorgente), cosaECambiato: '', origine: 'modello' } });
  await tick();
  const lato = x.messaggio.ownerDocument.createElement('aside');
  x.messaggio.ownerDocument.body.append(lato);
  const copia = x.hook.blocco(sorgente, true, 'nome=b1');
  lato.append(copia);
  await tick();
  assert.equal(aperto(copia), false, 'the copy in another place is answered too');
  clic(tasti(copia)[0]);
  await tick();
  assert.equal(x.n.post.length, 1, 'no second send');
});

test('G8-M34 a failed block answer never clears the bubble another message is waiting with', async () => {
  const x = app({ stato: 'turn running' });
  const nodo = x.disegna(scelte('Go'));
  await tick();
  const altra = { testo: 'typed by me', allegati: [] };
  x.rete.primaDiFallire = () => { x.state.realSession.bollaDaMostrare = altra; };
  clic(tasti(nodo)[0]);
  await tick();
  assert.ok(aperto(nodo));
  assert.equal(x.state.realSession.bollaDaMostrare, altra);
});

test('G8-ARIA the notes of Choices and Form are read aloud when they change (aria-live polite)', async () => {
  const x = app();
  const s = x.disegna(scelte('Go'));
  const m = x.disegna(modulo('Pick'));
  await tick();
  assert.equal(s.querySelector('.gu-scelte__nota').getAttribute('aria-live'), 'polite');
  assert.equal(m.querySelector('.gq-nota').getAttribute('aria-live'), 'polite');
});

/* C5: the live note is written only when its sentence changes (a screen reader reads every write of an aria-live region) */
const scritture = (nodo) => {
  let quante = 0;
  let p = Object.getPrototypeOf(nodo);
  while (p && !Object.getOwnPropertyDescriptor(p, 'textContent')) p = Object.getPrototypeOf(p);
  const d = Object.getOwnPropertyDescriptor(p, 'textContent');
  Object.defineProperty(nodo, 'textContent', { configurable: true, get() { return d.get.call(this); }, set(v) { quante += 1; d.set.call(this, v); } });
  return () => quante;
};
test('G8-C5 the live note of Choices and Form is written only when its sentence changes', async () => {
  const x = app({ stato: 'turn running' });
  x.rete.errore = null;
  const s = x.disegna(scelte('Go'));
  const m = x.disegna(modulo('Pick'));
  await tick();
  const ns = scritture(s.querySelector('.gu-scelte__nota'));
  const nm = scritture(m.querySelector('.gq-nota'));
  clic(tasti(s)[0]);
  clic(m.querySelector('.talos-chip[data-valore="yes"]'));
  clic(m.querySelector('button[data-invia-modulo]'));
  await tick();
  assert.equal(x.n.post.length, 2);
  assert.equal(notaScelte(s), t('blocchi.choices.sent')); // decision 398: the sentence changes once, to «already sent»
  assert.equal(ns(), 1, 'Choices: written once when it changes, never again for the same sentence');
  assert.equal(nm(), 0, 'Form: the same sentence is not written again');
});

/* ───────────── C1: the note says what is true at every permission level, English first, then Italian ───────────── */
test('G8-C1 the Choices note says that what happens next follows the permissions (EN and IT), and the not-sent sentences stay', () => {
  try {
    impostaLingua('en');
    assert.equal(t('blocchi.choices.note'), 'A click sends your choice as a message. What TALOS does next follows your permissions. In Full access it can change things without asking.');
    assert.equal(t('blocchi.form.notSent'), 'Not sent. Send it again when you are ready.');
    impostaLingua('it');
    assert.equal(t('blocchi.choices.note'), 'Un clic manda la tua scelta come messaggio. Ciò che TALOS fa dopo segue i tuoi permessi. In Accesso pieno può cambiare le cose senza chiedere.');
    assert.equal(t('blocchi.form.notSent'), 'Non inviato. Invialo di nuovo quando vuoi.');
    assert.equal(t('blocchi.choices.notSent'), 'La tua scelta non è partita. Sceglila di nuovo per mandarla.');
  } finally {
    impostaLingua('en');
  }
});
