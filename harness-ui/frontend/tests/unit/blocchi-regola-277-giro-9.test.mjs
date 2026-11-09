/*
 * Cura BG3 round 9 (owner 08/11 14:20 via the judge). The round-8 review (A1 = C1, MEDIO) found two doors that resend a block's answer
 * WITHOUT its block: the refusal card («send with another model», azioneCartaRifiuto) and «Riprova» / the retry command (avviaRamo).
 * For a block the text shown IS the text for the model, so the bubble came out null; after REQUEST_TOO_LARGE the turn no longer knew a
 * block wrote it, and the model's text went back into the composer: Enter ran «!echo …» or raised permissions with no card.
 * Now both doors pass the origin's block to bollaDaInviare and keep it in the drawn bubble (a second «Riprova» still knows it).
 * Hermes keeps the origin of a user row next to it (`display_metadata`, agent/turn_context.py:709-710) and /retry resubmits the real ask
 * so the policy hook decides again (agent/message_metadata.py:91-93); Codex keeps the source of a rejected steer in lockstep with its
 * text (codex-rs/tui/src/chatwidget/input_queue.rs:40-45).
 * The host runs the REAL bodies (the round-8 harness, verbatim, plus azioneCartaRifiuto, vistaDellaCarta, avviaRamo, the lines of
 * appendUserFollowUp) and the REAL server keeper of the bubble. Also here: the tests that kill the live mutants of the round-8 review
 * (R39, R06, V27, V17, V19) and B5.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { documento, clic, orologio, spento } from './aiuto-dom-blocchi.mjs';
import { impostaLingua, t } from '../../src/components/lingua.js';
import { creaAggancioBlocchi, bloccoPerLaBolla, impronta, EVENTO_VERSIONE_DEL_BLOCCO } from '../../src/components/blocchi/aggancio.js';
import { comandoObiettivo } from '../../src/components/obiettivo-carta.js';
import { bollaDaInviare } from '../../src/components/bolla-della-persona.js';
import { vistaCartaRifiuto } from '../../src/components/carta-rifiuto.js';
import { bollaPerLaConsegna } from '../../../src/bolla-della-persona.mjs';
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

function gemelli(testo) {
  const x = app({ stato: 'turn running', chiaveDelMessaggio: 'vecchia' });
  const a = x.disegna(scelte(testo));
  const b = x.disegna(scelte(testo));
  return { x, a, b, chiavi: conChiavi(x), padre: a.parentNode };
}

/* ───────────── round 9, A1 = C1: the refusal card and «Riprova» resend a block's answer WITH its block ───────────── */
/* The REAL bodies: azioneCartaRifiuto, vistaDellaCarta, avviaRamo; the REAL lines of appendUserFollowUp that pick the live bubble, remember
   the block and keep the message's delivery (`resumeSession` runs them before its POST); the REAL server keeper of the bubble, whose result
   the turn's RunStarted gives back (`harness-ui/src/bolla-della-persona.mjs`, `bollaPerLaConsegna`). */
const CARTA_VERA = corpo('azioneCartaRifiuto');
const VISTA_VERA = corpo('vistaDellaCarta');
const RAMO_VERO = corpo('avviaRamo');
const SEGUITO = (() => {
  const i = APP.indexOf('    const daMostrare = bolla !== undefined ? bolla : state.realSession.bollaDaMostrare;');
  const ultima = 'if (bolla === undefined) state.realSession.bollaDaMostrare = null;';
  const fine = APP.indexOf(ultima, i);
  assert.ok(i > 0 && fine > i, 'appendUserFollowUp lines');
  return APP.slice(i, fine + ultima.length);
})();
const CONSERVA = /^ {4}(if \(typeof text === 'string'\) consegnaDelMessaggio\.set\(elementoUtente, .*\);)$/mu.exec(APP)?.[1];
assert.ok(CONSERVA, 'the line that keeps the message delivery');
/* round 10 (review of round 9, B1): the REAL lines of appendUserFollowUp that switch the block off while its answer travels (FE-003,
   app.js `if (bloccoDelMessaggio) aggancioBlocchi().spegni(…)`). A missing spegni line runs as nothing, so the tests below measure the
   block (open or not), not the loader. */
const TESTO_BOLLA = /^ {4}(const testoBolla = daMostrare && .*;)$/mu.exec(APP)?.[1];
const BLOCCO_DEL_MESSAGGIO = /^ {4}(const bloccoDelMessaggio = daMostrare\?\.blocco .*;)$/mu.exec(APP)?.[1];
assert.ok(TESTO_BOLLA && BLOCCO_DEL_MESSAGGIO, 'the bubble text and the block of appendUserFollowUp');
const SPEGNI = /^ {4}(if \(bloccoDelMessaggio\) aggancioBlocchi\(\)\.spegni\(.*\);)$/mu.exec(APP)?.[1] ?? '';
let giri = 3;

/* the person's bubble of a resent turn, as appendUserFollowUp draws it: the block of the bubble is switched off (SPEGNI) and the element
   keeps its delivery (a later «Riprova» reads it) */
function nuovoMessaggio(x, consegnaDelMessaggio, text) {
  const elementoUtente = { dataset: { giroDi: String(x.state.realSession.id), giro: String(++giri) } };
  new Function('text', 'bolla', 'state', 'consegnaDelMessaggio', 'elementoUtente', 'aggancioBlocchi',
    `${SEGUITO}\n${TESTO_BOLLA}\n${BLOCCO_DEL_MESSAGGIO}\n${SPEGNI}\n${CONSERVA}`)(text, undefined, x.state, consegnaDelMessaggio, elementoUtente, () => x.hook);
  return elementoUtente;
}

/* the two doors with their real bodies; `resumeSession` draws the bubble first, then «posts» (what reached the server is in `inviate`) */
function porteDelRinvio(x, consegnaDelMessaggio) {
  const inviate = [];
  const resumeSession = async (v, immagini, o = {}) => {
    const elemento = nuovoMessaggio(x, consegnaDelMessaggio, v);
    inviate.push({ v, bolla: o.bolla ?? null, elemento });
    return true;
  };
  const vistaDellaCarta = new Function('vistaCartaRifiuto', 'state', 'nomeModelloUmano', `${VISTA_VERA}\nreturn vistaDellaCarta;`)(vistaCartaRifiuto, x.state, (m) => m);
  const carta = new Function('state', 'vistaDellaCarta', 'openSheet', 'aggiornaCartaRifiuto', 'consegnaDelMessaggio', 'bollaDaInviare', 'immaginiDelMessaggio', 'resumeSession',
    `${CARTA_VERA}\nreturn azioneCartaRifiuto;`)(x.state, vistaDellaCarta, (s) => x.n.carte.push(`sheet ${s}`), () => {}, consegnaDelMessaggio, bollaDaInviare, new WeakMap(), resumeSession);
  const amb = {
    toast: (a) => x.n.avvisi.push(a), tr: (k) => k, state: x.state, $: () => ({ querySelectorAll: () => [] }), $$: () => [],
    puntoDelTaglio: ({ giroDi, giro }) => ({ sorgente: giroDi, giro }), ultimoElencoSessioniReali: [], runRealeAttivo: () => false,
    stopRealSession: async () => {}, attendiGiroFermo: async () => true, testiDelleVersioni: new Map(), testoMostratoDelGiro: ({ consegna }) => consegna,
    nuovaGenerazioneSessione: () => x.state.realSession.generation, sessionTitle: {}, aggiornaTestataSessione: () => {}, collegaEventiSessione: async () => {},
    consegnaDelMessaggio, bollaDaInviare, resumeSession, aggiornaElencoSessioniReali: async () => {},
  };
  /* the fork route gives back the cut message (`taglio.messaggio`): the delivery of the element «Riprova» was pressed on */
  amb.apiPost = async () => ({ sessionId: 's2', taglio: { messaggio: amb.taglio ?? '', allegati: [] } });
  const ramo = new Function(...Object.keys(amb), `${RAMO_VERO}\nreturn avviaRamo;`)(...Object.values(amb));
  return {
    inviate,
    /* «send with another model» on the refusal card of the turn of `elemento` (apriCartaRifiuto, app.js: testo = ultimaDomanda) */
    async rifiuto(elemento) {
      x.state.realSession.cartaRifiuto = { nota: null, domanda: elemento, modello: 'm', testo: String(x.state.realSession.ultimaDomanda ?? ''), perche: 'refused', sessione: x.state.realSession.id, inviataCon: null };
      x.state.model = 'm2';
      await carta();
      return inviate.at(-1);
    },
    /* «Riprova» (app.js ~16098) and the retry command (~33138): `avviaRamo(domanda)`, no bubble of its own */
    async riprova(elemento) {
      x.state.realSession.generation = 1;
      amb.taglio = consegnaDelMessaggio.get(elemento)?.consegna ?? '';
      assert.equal(await ramo(elemento), true);
      return inviate.at(-1);
    },
  };
}

/* the resent turn starts (RunStarted with what the server kept) and the kernel refuses it as too large */
function partiETroppoGrande(x, mandata) {
  const bolla = bollaPerLaConsegna(mandata.bolla, mandata.v);
  x.giroIniziato({ consegna: mandata.v, ...(bolla ? { bolla } : {}) });
  return x.troppoGrande();
}

/* a block answered (its turn started, the server echoed the bubble); its element keeps that delivery, as appendUserFollowUp does */
async function bloccoRisposto(testo) {
  const x = app({ stato: 'chat finished' });
  x.rete.errore = null;
  const nodo = x.disegna(scelte(testo));
  await tick();
  clic(tasti(nodo)[0]);
  await tick();
  const bollaBlocco = x.n.bolle.at(-1);
  assert.ok(bollaBlocco?.blocco?.chiave, 'the first send carries the block');
  /* the first send's bubble is drawn by the REAL appendUserFollowUp lines, which consume the live bubble as resumeSession does before
     its POST: a door that forgot to draw its own bubble would otherwise pick up this stale one (mutants G12, G13 of round 9) */
  const consegnaDelMessaggio = new Map();
  const elemento = nuovoMessaggio(x, consegnaDelMessaggio, testo);
  assert.equal(x.state.realSession.bollaDaMostrare, null, 'the first bubble was drawn (consumed)');
  assert.equal(consegnaDelMessaggio.get(elemento)?.bolla?.blocco?.chiave, bollaBlocco.blocco.chiave, 'the element keeps the block');
  x.giroIniziato({ consegna: testo, bolla: bollaPerLaConsegna(bollaBlocco, testo) });
  x.state.realSession.giroDellaPersona = true;
  return { x, nodo, bollaBlocco, elemento, consegnaDelMessaggio, porte: porteDelRinvio(x, consegnaDelMessaggio) };
}

function nienteDaInvio(x, nodo, spiegazione, chiave, via) {
  assert.equal(x.composerInput.value, '', `${via}: the composer stays empty`);
  assert.deepEqual(x.composerInput.eventi, [], `${via}: no input event`);
  assert.equal(spiegazione.testoNonInviato, '', `${via}: nothing for «Send as attachment»`);
  assert.ok(aperto(nodo), `${via}: the block opens again`);
  assert.equal(notaScelte(nodo), t('blocchi.choices.notSent'), `${via}: and says it was not sent`);
  const prima = { shell: x.n.shell.length, imp: x.n.impostazioni.length, carte: x.n.carte.length, post: x.n.post.length };
  invioDellaPersona(x);
  assert.equal(x.n.shell.length, prima.shell, `${via}: Enter runs no shell`);
  assert.equal(x.n.impostazioni.length, prima.imp, `${via}: Enter changes no setting (permissions unchanged)`);
  assert.equal(x.n.carte.length, prima.carte, `${via}: Enter opens nothing`);
  assert.equal(x.n.post.length, prima.post, `${via}: Enter sends nothing`);
  assert.equal(x.state.permissions, 'onRequest');
  void chiave;
}

const OPZIONI = ['!echo resent', '/settings conversation.permissions=fullAccess', '/compact', 'Use the first option'];
for (const opzione of OPZIONI) {
  test(`G9-A1 refusal card, send with another model, then REQUEST_TOO_LARGE: nothing back in the composer (${opzione})`, async () => {
    const { x, nodo, bollaBlocco, elemento, porte } = await bloccoRisposto(opzione);
    const mandata = await porte.rifiuto(elemento);
    assert.equal(mandata.v, opzione);
    assert.equal(x.state.realSession.bollaDaMostrare, null, 'the live bubble was drawn (consumed)');
    const spiegazione = partiETroppoGrande(x, mandata);
    nienteDaInvio(x, nodo, spiegazione, bollaBlocco.blocco.chiave, 'refusal');
    assert.equal(mandata.bolla?.blocco?.chiave, bollaBlocco.blocco.chiave, 'the resent bubble carries the clicked block');
  });

  test(`G9-A1 «Riprova» of a block's answer, then REQUEST_TOO_LARGE: nothing back in the composer (${opzione})`, async () => {
    const { x, nodo, bollaBlocco, elemento, porte } = await bloccoRisposto(opzione);
    const mandata = await porte.riprova(elemento);
    assert.equal(mandata.v, opzione);
    const spiegazione = partiETroppoGrande(x, mandata);
    nienteDaInvio(x, nodo, spiegazione, bollaBlocco.blocco.chiave, 'Riprova');
    assert.equal(mandata.bolla?.blocco?.chiave, bollaBlocco.blocco.chiave, 'the resent bubble carries the clicked block');
  });
}

/* the drawn bubble of the resent turn keeps the block too: a SECOND «Riprova» (or a card after a «Riprova») still knows it, before any RunStarted */
for (const [primo, secondo] of [['rifiuto', 'riprova'], ['riprova', 'riprova'], ['riprova', 'rifiuto']]) {
  test(`G9-A1c ${primo} then ${secondo} of the same block's answer, then REQUEST_TOO_LARGE: still nothing in the composer`, async () => {
    const { x, bollaBlocco, elemento, consegnaDelMessaggio, porte } = await bloccoRisposto('!echo chained');
    const una = await porte[primo](elemento);
    const ricordato = x.state.realSession.ultimaDomandaBlocco?.chiave;
    partiETroppoGrande(x, una);
    await tick();
    assert.ok(aperto(x.messaggio.children[0]), 'the first REQUEST_TOO_LARGE opened the block again');
    x.giroIniziato({ consegna: '!echo chained', bolla: bollaPerLaConsegna(una.bolla, '!echo chained') });
    const due = await porte[secondo](una.elemento);
    await tick();
    /* round 10 (B1): the second door switches the reopened block off while its answer travels, before any outcome */
    assert.equal(aperto(x.messaggio.children[0]), false, `${secondo}: the block is closed while its answer travels`);
    x.composerInput.eventi.length = 0;
    const spiegazione = partiETroppoGrande(x, due);
    /* round 11 (review of round 10, point 3): spegni redraws the block, so the first `nodo` is no longer on screen; the checks
       «opens again» and «says it was not sent» read the block the person sees now */
    const aSchermo = x.messaggio.children[0];
    assert.equal(x.messaggio.children.length, 1, 'one block on screen');
    nienteDaInvio(x, aSchermo, spiegazione, bollaBlocco.blocco.chiave, `${primo}+${secondo}`);
    assert.equal(ricordato, bollaBlocco.blocco.chiave, 'the drawn bubble remembered the block before RunStarted');
    assert.equal(consegnaDelMessaggio.get(una.elemento)?.bolla?.blocco?.chiave, bollaBlocco.blocco.chiave, 'the new bubble keeps the block');
    assert.equal(due.bolla?.blocco?.chiave, bollaBlocco.blocco.chiave);
  });
}

/* the person's OWN text resent with «Riprova» or the card still comes back into the composer, as before */
for (const [via, testo] of [['riprova', '!echo typed by me'], ['riprova', 'my own long question'], ['rifiuto', 'my own question']]) {
  test(`G9-A1d the person's own text resent by ${via}, then REQUEST_TOO_LARGE: it comes back into the composer`, async () => {
    const x = app({ stato: 'chat finished' });
    x.giroIniziato({ consegna: testo });
    const elemento = { dataset: { giroDi: 's1', giro: '3' } };
    const consegnaDelMessaggio = new Map([[elemento, { consegna: testo, bolla: null }]]);
    x.state.realSession.giroDellaPersona = true;
    const porte = porteDelRinvio(x, consegnaDelMessaggio);
    const mandata = await porte[via](elemento);
    assert.equal(mandata.bolla, null);
    const spiegazione = partiETroppoGrande(x, mandata);
    assert.equal(x.composerInput.value, testo);
    assert.deepEqual(x.composerInput.eventi, ['input']);
    assert.equal(spiegazione.testoNonInviato, testo);
  });
}

/* the person's OWN message with a file chip has a bubble (phrase + chip) but no block: resent by either door it never gains one, so
   nothing marks it as a block's answer before RunStarted, and a REQUEST_TOO_LARGE puts the person's text back (mutants G09, G10) */
for (const via of ['riprova', 'rifiuto']) {
  test(`G9-A1e the person's message with a file, resent by ${via}: its bubble never gains a block, the text comes back`, async () => {
    const x = app({ stato: 'chat finished' });
    const consegna = 'my question about the file\n\n--- notes.txt ---\nhello';
    const bolla = { testo: 'my question about the file', allegati: [{ tipo: 'file', nome: 'notes.txt' }] };
    x.giroIniziato({ consegna, bolla: bollaPerLaConsegna(bolla, consegna) });
    const elemento = { dataset: { giroDi: 's1', giro: '3' } };
    const consegnaDelMessaggio = new Map([[elemento, { consegna, bolla }]]);
    x.state.realSession.giroDellaPersona = true;
    const porte = porteDelRinvio(x, consegnaDelMessaggio);
    const mandata = await porte[via](elemento);
    assert.equal(mandata.bolla?.testo, 'my question about the file', 'the resent bubble is the phrase, not the text for the model');
    assert.equal('blocco' in (mandata.bolla ?? {}), false, 'the resent bubble carries no block');
    assert.equal('blocco' in (consegnaDelMessaggio.get(mandata.elemento)?.bolla ?? {}), false, 'the drawn bubble carries no block');
    assert.equal(x.state.realSession.ultimaDomandaBlocco, null, 'nothing marks it as a block before RunStarted');
    const spiegazione = partiETroppoGrande(x, mandata);
    assert.ok(x.composerInput.value.startsWith('my question about the file'), 'the person\'s text comes back into the composer');
    assert.notEqual(spiegazione.testoNonInviato, '');
  });
}

/* «Riprova» on an OLDER block answer, after a turn the person typed: the block comes from the resent message itself, never from the
   last turn's mark (mutant G14) */
test('G9-A1f «Riprova» on an older block answer after the person\'s own turn, then REQUEST_TOO_LARGE: nothing in the composer', async () => {
  const { x, nodo, bollaBlocco, elemento, porte } = await bloccoRisposto('!echo older');
  x.giroIniziato({ consegna: 'my own later question' });
  assert.equal(x.state.realSession.ultimaDomandaBlocco, null, 'the last turn is the person\'s');
  const mandata = await porte.riprova(elemento);
  assert.equal(mandata.bolla?.blocco?.chiave, bollaBlocco.blocco.chiave, 'the older message keeps its own block');
  const spiegazione = partiETroppoGrande(x, mandata);
  nienteDaInvio(x, nodo, spiegazione, bollaBlocco.blocco.chiave, 'older Riprova');
});

/* ───────────── round 9: tests for the live mutants of the round-8 review ───────────── */
/* R39 (probe P6 of reviewer A): twins reopened by REQUEST_TOO_LARGE, A clicked again and sent, then B's send fails: A stays answered */
test('G9-R39 twins reopened, A sent again, then B fails: A stays answered and a click on A sends nothing', async () => {
  const prova = gemelli('!echo r39');
  await tick();
  clic(tasti(prova.a)[0]);
  await tick();
  const K = prova.chiavi[0];
  assert.ok(K, 'old key learnt');
  const x = app({ stato: 'turn running', chiaveDelMessaggio: 'vecchia' });
  const sorgente = scelte('!echo r39');
  x.disegna(sorgente); x.disegna(sorgente);
  await tick();
  x.hook.spegni(K, { tipo: 'scelte', valore: '!echo r39' });
  await tick();
  x.giroIniziato({ consegna: '!echo r39', bolla: { testo: '!echo r39', blocco: { chiave: K } } });
  x.troppoGrande();
  await tick();
  let [a, b] = x.messaggio.children;
  assert.ok(aperto(a) && aperto(b), 'both twins open again');
  x.rete.errore = null;
  clic(tasti(a)[0]);
  await tick();
  const p0 = x.n.post.length;
  assert.equal(p0, 1, 'A sent again, once');
  x.rete.errore = 'ECONNRESET';
  [a, b] = x.messaggio.children;
  assert.ok(aperto(b), 'B is open to be clicked');
  clic(tasti(b)[0]);
  await tick(10);
  [a, b] = x.messaggio.children;
  assert.equal(aperto(a), false, 'A, delivered, stays answered');
  assert.notEqual(notaScelte(a), t('blocchi.choices.notSent'));
  assert.equal(aperto(b), true, 'B, failed, opens again');
  x.rete.errore = null;
  clic(tasti(a)[0]);
  await tick();
  assert.equal(x.n.post.length, p0, 'no second send of A');
});

/* R06 (probe P2 of reviewer B): a key taken back in the parent chat does not reopen the same key replayed in a branch (aggancio.js keys by chat) */
test('G9-R06 a key taken back in the parent s1: the branch f where the parent replayed it keeps its block answered', async () => {
  const prova = gemelli('!echo fork');
  await tick();
  clic(tasti(prova.a)[0]);
  await tick();
  const K = prova.chiavi[0];
  assert.ok(K && /^s1:/u.test(K));
  const x = app({ stato: 'turn running', chiaveDelMessaggio: 'vecchia' });
  x.hook.riapri(K, 's1');
  x.hook.azzera();
  x.state.realSession.id = 'f';
  x.disegna(scelte('!echo fork'));
  await tick();
  x.hook.spegni(K, { tipo: 'scelte', valore: '!echo fork' });
  await tick();
  const [a] = x.messaggio.children;
  assert.equal(aperto(a), false, 'the branch block stays answered');
  assert.notEqual(notaScelte(a), t('blocchi.choices.notSent'));
  x.rete.errore = null;
  clic(tasti(a)[0]);
  await tick();
  assert.deepEqual(x.n.post, [], 'nothing sent again');
});

/* V27: G8-A1 checked only that the key is a string; here the key of each door is THE key of the clicked block (it reopens that block) */
test('G9-V27 every door\'s bubble carries the clicked block\'s own key: that key reopens exactly that block', async () => {
  for (const [stato, via] of [['turn running', 'queue'], ['chat finished', 'resume'], ['new chat', 'new chat'], ['no chat', 'new chat']]) {
    const x = app({ stato });
    x.rete.errore = null;
    x.rete.progetti = [{ id: 'c1', nome: 'p' }];
    const altro = x.disegna(scelte('Other'));
    const nodo = x.disegna(scelte('Go'));
    await tick();
    const chiavi = conChiavi(x);
    clic(tasti(nodo)[0]);
    await tick();
    assert.equal(x.n.post[0]?.[0], via, stato);
    const k = x.n.bolle[0]?.blocco?.chiave;
    assert.equal(x.hook.riapri(k, x.state.realSession.id), true, `${stato}: the bubble's key is the clicked block's`);
    assert.deepEqual(chiavi, [k]);
    assert.ok(aperto(nodo), `${stato}: that block opens`);
    assert.equal(notaScelte(nodo), t('blocchi.choices.notSent'));
    assert.notEqual(notaScelte(altro), t('blocchi.choices.notSent'), `${stato}: the other block is untouched`);
  }
});

/* V17: a block's turn too large while the person has a draft in the composer: the draft stays as it is and the block still opens again */
test('G9-V17 a block\'s turn too large with the person\'s draft in the composer: draft untouched, block open again', async () => {
  const x = app({ stato: 'chat finished' });
  x.rete.errore = null;
  const nodo = x.disegna(scelte('!echo full'));
  await tick();
  clic(tasti(nodo)[0]);
  await tick();
  x.giroIniziato({ consegna: '!echo full', bolla: x.n.bolle.at(-1) });
  x.composerInput.value = 'my draft';
  const spiegazione = x.troppoGrande();
  assert.equal(x.composerInput.value, 'my draft');
  assert.deepEqual(x.composerInput.eventi, []);
  assert.equal(spiegazione.testoNonInviato, '');
  assert.ok(aperto(nodo), 'the block opens again');
  assert.equal(notaScelte(nodo), t('blocchi.choices.notSent'));
});

/* V19: two different blocks clicked while both sends are on their way; both fail: both open again, and each click sends once */
test('G9-V19 two different blocks in flight together, both fail: both open again saying not sent, each re-click sends once', async () => {
  const x = app({ stato: 'turn running' });
  const a = x.disegna(scelte('!echo one'));
  const b = x.disegna(scelte('Continue'));
  await tick();
  clic(tasti(a)[0]);
  clic(tasti(b)[0]);
  assert.ok(!aperto(a) && !aperto(b), 'both answered while on their way');
  await tick(10);
  assert.ok(aperto(a), 'A opens again');
  assert.ok(aperto(b), 'B opens again');
  assert.equal(notaScelte(a), t('blocchi.choices.notSent'));
  assert.equal(notaScelte(b), t('blocchi.choices.notSent'));
  x.rete.errore = null;
  clic(tasti(a)[0]); clic(tasti(a)[0]);
  clic(tasti(b)[0]); clic(tasti(b)[0]);
  await tick();
  assert.deepEqual(x.n.post, [['queue', '!echo one'], ['queue', 'Continue']]);
});

/* B5 (reviewer B): G8-S6 clicked B only if open; here B is open and IS clicked */
test('G9-B5 twins: A delivered (echo), B open and clicked, its send fails: A stays answered, B opens saying not sent', async () => {
  const x = app({ stato: 'turn running' });
  const a = x.disegna(scelte('Merge it'));
  x.disegna(scelte('Merge it'));
  const padre = a.parentNode;
  await tick();
  x.rete.errore = null;
  clic(tasti(a)[0]);
  await tick();
  const k = x.n.bolle.at(-1)?.blocco?.chiave;
  assert.ok(k);
  x.hook.spegni(k, { tipo: 'scelte', valore: 'Merge it' });
  await tick();
  const [, b1] = padre.children;
  assert.ok(aperto(b1), 'B is open');
  x.rete.errore = 'ECONNRESET';
  clic(tasti(b1)[0]);
  await tick();
  const [a2, b2] = padre.children;
  assert.ok(!aperto(a2));
  assert.ok(aperto(b2));
  assert.equal(notaScelte(b2), t('blocchi.choices.notSent'));
});

/* ───────────── round 10 (review of round 9, B1 + B2): «Riprova» on the REAL branch ───────────── */
/* «Riprova» always opens a branch. The real collegaEventiSessione (app.js) writes state.realSession.id = the new chat, the real
   nuovaGenerazioneSessione empties the hook (`aggancioDeiBlocchi?.azzera()`), and the history before the cut is replayed in the branch: the
   block is drawn again with its s1 key, unanswered there. The resent bubble is drawn by the REAL appendUserFollowUp lines (SPEGNI included),
   then REQUEST_TOO_LARGE reopens the block in the chat open NOW (app.js `riapri(dalBlocco.chiave, state.realSession.id)`). Hermes forks the
   session on /branch and copies the parent's history into the child (`gateway/platforms/api_server.py:2782-2794`). */
function ramoVero(x, consegnaDelMessaggio, testo) {
  const inviate = [];
  const resumeSession = async (v, immagini, o = {}) => {
    const elemento = nuovoMessaggio(x, consegnaDelMessaggio, v);
    inviate.push({ v, bolla: o.bolla ?? null, elemento });
    return true;
  };
  const amb = {
    toast: (a) => x.n.avvisi.push(a), tr: (k) => k, state: x.state, $: () => ({ querySelectorAll: () => [] }), $$: () => [],
    puntoDelTaglio: ({ giroDi, giro }) => ({ sorgente: giroDi, giro }), ultimoElencoSessioniReali: [], runRealeAttivo: () => false,
    stopRealSession: async () => {}, attendiGiroFermo: async () => true, testiDelleVersioni: new Map(), testoMostratoDelGiro: ({ consegna }) => consegna,
    nuovaGenerazioneSessione: () => { x.hook.azzera(); return x.state.realSession.generation; }, sessionTitle: {}, aggiornaTestataSessione: () => {},
    collegaEventiSessione: async (sid) => { x.state.realSession.id = sid; x.messaggio.replaceChildren(); x.disegna(scelte(testo)); await tick(); },
    consegnaDelMessaggio, bollaDaInviare, resumeSession, aggiornaElencoSessioniReali: async () => {},
  };
  amb.apiPost = async () => ({ sessionId: 's2', taglio: { messaggio: amb.taglio ?? '', allegati: [] } });
  const ramo = new Function(...Object.keys(amb), `${RAMO_VERO}\nreturn avviaRamo;`)(...Object.values(amb));
  return async (elemento) => {
    x.state.realSession.generation = 1;
    amb.taglio = consegnaDelMessaggio.get(elemento)?.consegna ?? '';
    assert.equal(await ramo(elemento), true);
    return inviate.at(-1);
  };
}

for (const opzione of ['!echo branch', '/settings conversation.permissions=fullAccess', 'Use the first option']) {
  test(`G10-B «Riprova» on the real branch s2: block closed while its answer travels, REQUEST_TOO_LARGE reopens it there (${opzione})`, async () => {
    const { x, bollaBlocco, elemento, consegnaDelMessaggio } = await bloccoRisposto(opzione);
    const nodo = () => x.messaggio.children[0];
    const riprova = ramoVero(x, consegnaDelMessaggio, opzione);
    const mandata = await riprova(elemento);
    await tick();
    assert.equal(x.state.realSession.id, 's2', 'the branch is the open chat');
    assert.equal(mandata.bolla?.blocco?.chiave, bollaBlocco.blocco.chiave, 'the resent bubble carries the clicked block (its s1 key)');
    /* B1: the block replayed in the branch is switched off while the answer travels, before any outcome */
    assert.equal(aperto(nodo()), false, 'B1: the branch block is closed while its answer travels');
    /* round 11 (review of round 10, R2): spegni carries the gesture, so the closed block shows which option left */
    assert.equal(tasti(nodo()).find((b) => b.dataset.scelta === opzione)?.getAttribute('aria-pressed'), 'true', 'B1: the chosen option is shown');
    const spiegazione = partiETroppoGrande(x, mandata);
    await tick();
    /* B2: the reopening happens in the branch (the open chat), not in s1 */
    assert.equal(x.composerInput.value, '', 'the composer stays empty');
    assert.equal(spiegazione.testoNonInviato, '', 'nothing for «Send as attachment»');
    assert.equal(aperto(nodo()), true, 'B2: the branch block opens again');
    assert.equal(notaScelte(nodo()), t('blocchi.choices.notSent'), 'B2: and says it was not sent');
    const prima = x.n.bolle.length;
    x.rete.errore = null;
    clic(tasti(nodo())[0]);
    await tick();
    assert.equal(x.n.bolle.length, prima + 1, 'one click on the reopened block, one send');
  });
}
