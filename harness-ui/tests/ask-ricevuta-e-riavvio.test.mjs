/*
 * ⛔ 24/09/2026 — Ask completa, lato registro (fetta F3-20 della mappa `.claude/F3-MAPPA-WORKFLOW-PLAN-ASK-2026-09-23.md`).
 *
 * Decisioni dell'owner che queste prove fissano (memoria `decisioni-owner-f3-workflow-plan-ask-23-09.md`):
 *   10: la ricevuta nasce ALLA RICHIESTA — domanda, perché conta, opzioni, consigliata, risposta/esito, chi e quando;
 *   29: una domanda aperta SOPRAVVIVE al riavvio del server e resta rispondibile; la risposta fa ripartire il giro da lì;
 *   30: dove nessuna interfaccia può rispondere (automazioni), l'attrezzo risponde subito con l'ipotesi prudente dichiarata.
 * Ricerca: `.claude/RICERCA-ASK-D35-D37-2026-09-24.md` (LangGraph interrupt + checkpointer, OpenAI Agents SDK RunState,
 * Cline «Riprendi»; Hermes, OpenCode e Codex la perdono).
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

import { createSessionRegistry as createSessionRegistryReale } from '../src/session-registry.mjs';
import { attendiScritture } from '../src/session-store.mjs';
import { TaskCatalogError } from '../src/task-catalog.mjs';
import { cartellaDiProva } from './aiuto/cartelle-di-prova.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

function createSessionRegistry(opzioni) {
  return createSessionRegistryReale({ guardaWorkspaceFn: () => () => {}, modello: 'm', chiave: 'k',
    preparaEsecuzioneFn: preparaEsecuzioneFinta, cartellaEsisteFn: () => true, ...opzioni });
}

function preparaEsecuzioneFinta(taskId) {
  if (taskId !== 'task-vero') throw new TaskCatalogError(`Task non ammesso: ${taskId}`);
  return { cartella: '/tmp/x', comandoProva: 'npm test', task: { id: taskId, consegna: 'scegli la strada' } };
}

/** Giri finti che non finiscono da soli: il test decide quando (o se) concluderli. */
function giriFinti() {
  const giri = [];
  return {
    avviaSessioneFn(input) {
      let risolvi;
      const promessa = new Promise((resolve) => { risolvi = resolve; });
      giri.push({ input, risolvi });
      input.onEvento({ type: 'RunStarted', threadId: `t${giri.length}`, runId: `r${giri.length}` });
      return promessa;
    },
    giro(i) { return giri[i]; },
    concludi(i, risultato = { ok: true }) { giri[i].input.onEvento({ type: 'RunFinished' }); giri[i].risolvi(risultato); },
    get quanti() { return giri.length; },
  };
}

async function svuota(cartellaStore) {
  for (let i = 0; i < 3; i += 1) {
    try { await attendiScritture({ cartellaStore }); } catch { /* il cancello dei residui dirà il resto */ }
    await new Promise((r) => setImmediate(r));
  }
}

const DOMANDE = [{
  id: 'scelta', question: 'Quale strada?', why: 'Decide quale file cambia per primo.',
  options: [{ label: 'B', description: 'Seconda', recommended: true }, { label: 'A', description: 'Prima' }],
}];
const STORIA_ALLA_DOMANDA = [
  { role: 'system', content: 'istruzioni' },
  { role: 'user', content: 'scegli la strada' },
  { role: 'assistant', content: 'Ti chiedo una cosa.', tool_calls: [
    { id: 'call_ask', type: 'function', function: { name: 'ask_user_question', arguments: JSON.stringify({ questions: DOMANDE }) } },
    { id: 'call_dopo', type: 'function', function: { name: 'elenca', arguments: '{}' } },
  ] },
];

test('ASK-RECEIPT-BORN-AT-REQUEST: la richiesta porta quando, quale chiamata, da quale modo e agente; la risposta porta chi e quando', async () => {
  const giri = giriFinti();
  const orologio = ['2026-09-24T15:00:00.000Z', '2026-09-24T15:00:07.000Z'];
  let tic = 0;
  const registro = createSessionRegistry({ avviaSessioneFn: giri.avviaSessioneFn, clock: () => new Date(orologio[Math.min(tic++, 1)]) });
  const { sessionId } = registro.avvia('task-vero');
  const attesa = giri.giro(0).input.chiediDomandaFn(DOMANDE, { toolCallId: 'call_ask', messaggi: STORIA_ALLA_DOMANDA });
  const richiesta = registro.esporta(sessionId).eventi.find((e) => e.type === 'UserQuestionRequested');
  assert.equal(typeof richiesta.at, 'string');
  assert.equal(richiesta.toolCallId, 'call_ask');
  assert.deepEqual(richiesta.origine, { modalita: 'normale', agente: 'principale' });
  assert.equal(richiesta.questions[0].why, 'Decide quale file cambia per primo.');
  assert.equal(richiesta.questions[0].options[0].recommended, true);
  assert.deepEqual(await registro.rispondiDomanda(sessionId, richiesta.requestId, { requestId: richiesta.requestId, status: 'answered', answers: { scelta: 'A' } }), { ok: true });
  assert.deepEqual(await attesa, { status: 'answered', answers: { scelta: 'A' } });
  const risolta = registro.esporta(sessionId).eventi.find((e) => e.type === 'UserQuestionResolved');
  assert.equal(risolta.da, 'persona');
  assert.equal(typeof risolta.at, 'string');
  assert.deepEqual(risolta.answers, { scelta: 'A' });
});

test('ASK-SURVIVES-RESTART: dopo un riavvio la domanda resta aperta, la risposta fa ripartire il giro dalla chiamata della domanda', async () => {
  const cartellaStore = cartellaDiProva('talos-ask-riavvio-');
  try {
    const prima = giriFinti();
    const registro = createSessionRegistry({ cartellaStore, avviaSessioneFn: prima.avviaSessioneFn });
    const { sessionId } = registro.avvia('task-vero');
    void prima.giro(0).input.chiediDomandaFn(DOMANDE, { toolCallId: 'call_ask', messaggi: STORIA_ALLA_DOMANDA });
    const requestId = registro.esporta(sessionId).eventi.find((e) => e.type === 'UserQuestionRequested').requestId;
    await svuota(cartellaStore);

    // ⇒ il processo muore qui: nessuna risposta, nessuna fine del giro.
    const dopo = giriFinti();
    const riavviato = createSessionRegistry({ cartellaStore, avviaSessioneFn: dopo.avviaSessioneFn });
    await riavviato.ripristina();
    const eventi = riavviato.esporta(sessionId).eventi;
    assert.equal(eventi.some((e) => e.type === 'UserQuestionResolved' && e.requestId === requestId), false, 'mai annullata al riavvio');
    assert.equal(riavviato.elenca().find((s) => s.sessionId === sessionId).inAttesaDomanda, true);

    assert.deepEqual(await riavviato.rispondiDomanda(sessionId, requestId, { requestId, status: 'answered', answers: { scelta: 'B' } }), { ok: true });
    assert.equal(dopo.quanti, 1, 'la risposta fa partire UN giro');
    const iniziali = dopo.giro(0).input.messaggiIniziali;
    const i = iniziali.findIndex((m) => m.role === 'assistant' && m.tool_calls?.some((c) => c.id === 'call_ask'));
    assert.ok(i >= 0, 'la storia riparte dalla chiamata della domanda');
    // Gli esiti seguono l'assistant; l'ordine fra loro lo decide `chiudiChiamateOrfane` (chiusure prima dei presenti).
    const esiti = iniziali.slice(i + 1);
    assert.equal(esiti.every((m) => m.role === 'tool'), true);
    const risposta = esiti.find((m) => m.tool_call_id === 'call_ask');
    assert.deepEqual(JSON.parse(risposta.content), { status: 'answered', answers: { scelta: 'B' } });
    assert.match(esiti.find((m) => m.tool_call_id === 'call_dopo').content, /SESSION_INTERRUPTED/u,
      'la chiamata rimasta a metà riceve la sua chiusura sintetica');
    assert.equal(iniziali.at(-1).role, 'tool', 'nessun messaggio della persona inventato');
    const nuovoAvvio = riavviato.esporta(sessionId).eventi.filter((e) => e.type === 'RunStarted').at(-1);
    assert.equal(nuovoAvvio.input?.seguito, undefined, 'la ripresa non si disegna come un messaggio nuovo della persona');
    dopo.concludi(0);
    await svuota(cartellaStore);

    const terzo = createSessionRegistry({ cartellaStore, avviaSessioneFn: giriFinti().avviaSessioneFn });
    await terzo.ripristina();
    assert.equal(terzo.elenca().find((s) => s.sessionId === sessionId).inAttesaDomanda, false, 'ASK-RESOLVED-NOT-REPLAYED-AS-OPEN');
    assert.equal(terzo.esporta(sessionId).eventi.filter((e) => e.type === 'UserQuestionResolved' && e.requestId === requestId).length, 1);
  } finally {
    await svuota(cartellaStore);
    rimuoviCartellaDiProva(cartellaStore);
  }
});

test('ASK-RESTART-NEW-MESSAGE-CLOSES-QUESTION: dopo il riavvio un messaggio nuovo al posto della risposta chiude la domanda e lo dice al modello', async () => {
  const cartellaStore = cartellaDiProva('talos-ask-riavvio-messaggio-');
  try {
    const prima = giriFinti();
    const registro = createSessionRegistry({ cartellaStore, avviaSessioneFn: prima.avviaSessioneFn });
    const { sessionId } = registro.avvia('task-vero');
    void prima.giro(0).input.chiediDomandaFn(DOMANDE, { toolCallId: 'call_ask', messaggi: STORIA_ALLA_DOMANDA });
    const requestId = registro.esporta(sessionId).eventi.find((e) => e.type === 'UserQuestionRequested').requestId;
    await svuota(cartellaStore);
    const dopo = giriFinti();
    const riavviato = createSessionRegistry({ cartellaStore, avviaSessioneFn: dopo.avviaSessioneFn });
    await riavviato.ripristina();
    const esito = riavviato.resume(sessionId, 'lascia stare, fai la terza strada');
    assert.equal(esito.erroreAvvio, undefined);
    const risolta = riavviato.esporta(sessionId).eventi.find((e) => e.type === 'UserQuestionResolved' && e.requestId === requestId);
    assert.equal(risolta.status, 'cancelled');
    assert.equal(risolta.motivo, 'nuovo-messaggio');
    const iniziali = dopo.giro(0).input.messaggiIniziali;
    const risultato = iniziali.find((m) => m.role === 'tool' && m.tool_call_id === 'call_ask');
    assert.match(risultato.content, /"status":"cancelled"/u);
    assert.match(risultato.content, /new message/u);
    assert.equal(iniziali.at(-1).content, 'lascia stare, fai la terza strada');
    dopo.concludi(0);
  } finally {
    await svuota(cartellaStore);
    rimuoviCartellaDiProva(cartellaStore);
  }
});

test('ASK-RESTART-WITHOUT-SNAPSHOT: una domanda salvata senza storia (sessioni di prima) si chiude al riavvio come «interrotta», non come una scelta', async () => {
  const cartellaStore = cartellaDiProva('talos-ask-riavvio-vecchia-');
  try {
    const prima = giriFinti();
    const registro = createSessionRegistry({ cartellaStore, avviaSessioneFn: prima.avviaSessioneFn });
    const { sessionId } = registro.avvia('task-vero');
    void prima.giro(0).input.chiediDomandaFn(DOMANDE); // nessun contesto: come il registro di prima del 24/09
    const requestId = registro.esporta(sessionId).eventi.find((e) => e.type === 'UserQuestionRequested').requestId;
    await svuota(cartellaStore);
    const riavviato = createSessionRegistry({ cartellaStore, avviaSessioneFn: giriFinti().avviaSessioneFn });
    await riavviato.ripristina();
    const risolta = riavviato.esporta(sessionId).eventi.find((e) => e.type === 'UserQuestionResolved' && e.requestId === requestId);
    assert.equal(risolta.status, 'cancelled');
    assert.equal(risolta.motivo, 'interrotta');
    assert.equal(risolta.da, 'sistema');
    assert.equal(riavviato.elenca().find((s) => s.sessionId === sessionId).inAttesaDomanda, false);
  } finally {
    await svuota(cartellaStore);
    rimuoviCartellaDiProva(cartellaStore);
  }
});

test('ASK-NO-INTERFACE-AUTOMATION: in una sessione senza interfaccia la domanda si chiude subito con l\'ipotesi prudente dichiarata, e la ricevuta lo registra', async () => {
  const giri = giriFinti();
  const registro = createSessionRegistry({ avviaSessioneFn: giri.avviaSessioneFn });
  const { sessionId } = registro.avvia('task-vero', { senzaInterfaccia: true });
  const esito = await giri.giro(0).input.chiediDomandaFn(DOMANDE, { toolCallId: 'call_ask', messaggi: STORIA_ALLA_DOMANDA });
  assert.equal(esito.status, 'unanswerable');
  assert.match(esito.instruction, /most prudent assumption/u);
  const eventi = registro.esporta(sessionId).eventi;
  const richiesta = eventi.find((e) => e.type === 'UserQuestionRequested');
  const risolta = eventi.find((e) => e.type === 'UserQuestionResolved');
  assert.equal(risolta.requestId, richiesta.requestId);
  assert.equal(risolta.status, 'unanswerable');
  assert.equal(risolta.da, 'sistema');
  assert.equal(risolta.motivo, 'nessuna-interfaccia');
  assert.equal(registro.elenca().find((s) => s.sessionId === sessionId).inAttesaDomanda, false);
});

test('ASK-SURVIVES-RESTART-SECOND-TURN: anche nel secondo giro (storia della domanda scritta come delta) la domanda sopravvive al riavvio', async () => {
  const cartellaStore = cartellaDiProva('talos-ask-riavvio-secondo-');
  try {
    const prima = giriFinti();
    const registro = createSessionRegistry({ cartellaStore, avviaSessioneFn: prima.avviaSessioneFn });
    const { sessionId } = registro.avvia('task-vero');
    // Una storia lunga: il checkpoint del primo giro è grande, e la storia della domanda del secondo si scrive come DELTA
    // (con storie piccole la regola della dimensione la trasformerebbe in checkpoint e il ramo a delta resterebbe scoperto).
    const primoGiro = [{ role: 'system', content: 'istruzioni' }, { role: 'user', content: 'scegli la strada' }, { role: 'assistant', content: 'Fatto il primo passo. ' + 'x'.repeat(20_000) }];
    prima.concludi(0, { ok: true, esito: { comeFinita: 'concluso', messaggiFinali: primoGiro } });
    await new Promise((r) => setImmediate(r));
    await svuota(cartellaStore);
    assert.equal(registro.resume(sessionId, 'ora il secondo passo').erroreAvvio, undefined);
    const storiaSecondo = [...primoGiro, { role: 'user', content: 'ora il secondo passo' },
      { role: 'assistant', content: '', tool_calls: [{ id: 'call_ask2', type: 'function', function: { name: 'ask_user_question', arguments: '{}' } }] }];
    void prima.giro(1).input.chiediDomandaFn(DOMANDE, { toolCallId: 'call_ask2', messaggi: storiaSecondo });
    const requestId = registro.esporta(sessionId).eventi.findLast((e) => e.type === 'UserQuestionRequested').requestId;
    await svuota(cartellaStore);
    const righe = readFileSync(join(cartellaStore, `${sessionId}.jsonl`), 'utf8').trim().split(/\r?\n/u).map((r) => JSON.parse(r));
    assert.equal(righe.find((r) => r.fase === 'domanda')?.tipo, 'messaggi-delta', 'la prova deve passare dal ramo a delta');
    const dopo = giriFinti();
    const riavviato = createSessionRegistry({ cartellaStore, avviaSessioneFn: dopo.avviaSessioneFn });
    await riavviato.ripristina();
    assert.equal(riavviato.esporta(sessionId).eventi.some((e) => e.type === 'UserQuestionResolved' && e.requestId === requestId), false);
    assert.deepEqual(await riavviato.rispondiDomanda(sessionId, requestId, { requestId, status: 'skipped' }), { ok: true });
    const iniziali = dopo.giro(0).input.messaggiIniziali;
    assert.deepEqual(JSON.parse(iniziali.find((m) => m.tool_call_id === 'call_ask2').content), { status: 'skipped' });
    assert.equal(iniziali.filter((m) => m.role === 'user').length, 2, 'le due richieste della persona, nessuna inventata');
    dopo.concludi(0);
  } finally {
    await svuota(cartellaStore);
    rimuoviCartellaDiProva(cartellaStore);
  }
});

test('ASK-REUSED-CALL-ID: con un id di chiamata riusato («call_0» a ogni risposta) dopo il riavvio vale la risposta della domanda GIUSTA', async () => {
  // Alcuni fornitori numerano le chiamate da capo a ogni risposta: l'id NON è unico nella sessione.
  const cartellaStore = cartellaDiProva('talos-ask-id-riusati-');
  try {
    const prima = giriFinti();
    const registro = createSessionRegistry({ cartellaStore, avviaSessioneFn: prima.avviaSessioneFn });
    const { sessionId } = registro.avvia('task-vero');
    const chiamataDomanda = { id: 'call_0', type: 'function', function: { name: 'ask_user_question', arguments: '{}' } };
    const storia1 = [{ role: 'user', content: 'scegli la strada' }, { role: 'assistant', content: '', tool_calls: [chiamataDomanda] }];
    const attesa1 = prima.giro(0).input.chiediDomandaFn(DOMANDE, { toolCallId: 'call_0', messaggi: storia1 });
    const primaDomanda = registro.esporta(sessionId).eventi.find((e) => e.type === 'UserQuestionRequested').requestId;
    await registro.rispondiDomanda(sessionId, primaDomanda, { requestId: primaDomanda, status: 'answered', answers: { scelta: 'B' } });
    await attesa1;
    const fine1 = [...storia1, { role: 'tool', tool_call_id: 'call_0', content: '{"status":"answered","answers":{"scelta":"B"}}' },
      { role: 'assistant', content: 'Fatto. ' + 'x'.repeat(20_000) }];
    prima.concludi(0, { ok: true, esito: { comeFinita: 'concluso', messaggiFinali: fine1 } });
    await new Promise((r) => setImmediate(r));
    await svuota(cartellaStore);

    // Secondo giro: «call_0» è prima un «elenca», poi di nuovo una domanda. La persona risponde A, e il processo muore
    // PRIMA della fine del giro: sul disco c'è la storia della domanda e la risposta, non la fine.
    assert.equal(registro.resume(sessionId, 'rifallo per il secondo file').erroreAvvio, undefined);
    const storia2 = [...fine1, { role: 'user', content: 'rifallo per il secondo file' },
      { role: 'assistant', content: '', tool_calls: [{ id: 'call_0', type: 'function', function: { name: 'elenca', arguments: '{}' } }] },
      { role: 'tool', tool_call_id: 'call_0', content: 'a.txt' },
      { role: 'assistant', content: '', tool_calls: [chiamataDomanda] }];
    const attesa2 = prima.giro(1).input.chiediDomandaFn(DOMANDE, { toolCallId: 'call_0', messaggi: storia2 });
    const secondaDomanda = registro.esporta(sessionId).eventi.findLast((e) => e.type === 'UserQuestionRequested').requestId;
    await registro.rispondiDomanda(sessionId, secondaDomanda, { requestId: secondaDomanda, status: 'answered', answers: { scelta: 'A' } });
    await attesa2;
    await svuota(cartellaStore);

    const dopo = giriFinti();
    const riavviato = createSessionRegistry({ cartellaStore, avviaSessioneFn: dopo.avviaSessioneFn });
    await riavviato.ripristina();
    assert.equal(riavviato.resume(sessionId, 'continua').erroreAvvio, undefined);
    const iniziali = dopo.giro(0).input.messaggiIniziali;
    const ultimoAssistant = iniziali.findLastIndex((m) => m.role === 'assistant');
    const esito = iniziali.slice(ultimoAssistant + 1).find((m) => m.role === 'tool' && m.tool_call_id === 'call_0');
    assert.deepEqual(JSON.parse(esito.content), { status: 'answered', answers: { scelta: 'A' } },
      'la risposta della domanda del secondo giro, non quella del primo');
    dopo.concludi(0);
  } finally {
    await svuota(cartellaStore);
    rimuoviCartellaDiProva(cartellaStore);
  }
});

test('ASK-EXPIRED-STOPS-THE-TURN: una domanda scaduta si chiude dal sistema, il modello lo sa e il giro si ferma', async () => {
  const giri = giriFinti();
  const registro = createSessionRegistry({ avviaSessioneFn: giri.avviaSessioneFn });
  const { sessionId } = registro.avvia('task-vero');
  const attesa = giri.giro(0).input.chiediDomandaFn(DOMANDE, { toolCallId: 'call_ask', messaggi: STORIA_ALLA_DOMANDA });
  const requestId = registro.esporta(sessionId).eventi.find((e) => e.type === 'UserQuestionRequested').requestId;
  assert.deepEqual(await registro.rispondiDomanda(sessionId, requestId, { requestId, status: 'expired' }), { ok: true });
  assert.deepEqual(await attesa, { status: 'expired' });
  const risolta = registro.esporta(sessionId).eventi.find((e) => e.type === 'UserQuestionResolved');
  assert.equal(risolta.status, 'expired');
  assert.equal(risolta.da, 'sistema', 'la scadenza è della tua impostazione, non una scelta fatta nella scheda');
  assert.equal(giri.giro(0).input.segnaleStop.aborted, true, 'decisione owner 9: scaduta ⇒ il giro si ferma');
  giri.concludi(0);
});

/* ⛔ 14/10/2026, owner (CLI e desktop): una domanda scaduta NON ferma il giro; il modello sa che nessuno ha risposto e prosegue
   col suo giudizio, dichiarando l'ipotesi, senza inventare preferenze. Opzione dell'ospite `domandaScadutaFerma`, di serie
   `true` (il comportamento della decisione 9) finché l'ospite non la passa. Fonti: Codex `request_user_input/mod.rs`
   `submit_empty_auto_resolution`; Hermes `run_turn_runner_clarify_delivery.py` («the user did not respond»); zcode
   `ask-user-question.ts` («use your best judgment … do not invent user preferences»). */
test('ASK-EXPIRED-GOES-ON: con domandaScadutaFerma:false la domanda scaduta si chiude dal sistema, il modello prosegue e il giro NON si ferma', async () => {
  const giri = giriFinti();
  const registro = createSessionRegistry({ avviaSessioneFn: giri.avviaSessioneFn, domandaScadutaFerma: false });
  const { sessionId } = registro.avvia('task-vero');
  const attesa = giri.giro(0).input.chiediDomandaFn(DOMANDE, { toolCallId: 'call_ask', messaggi: STORIA_ALLA_DOMANDA });
  const requestId = registro.esporta(sessionId).eventi.find((e) => e.type === 'UserQuestionRequested').requestId;
  assert.deepEqual(await registro.rispondiDomanda(sessionId, requestId, { requestId, status: 'expired' }), { ok: true });
  const esito = await attesa;
  assert.equal(esito.status, 'expired');
  assert.match(esito.instruction, /did not answer in time/u);
  assert.match(esito.instruction, /do not invent/u);
  const risolta = registro.esporta(sessionId).eventi.find((e) => e.type === 'UserQuestionResolved');
  assert.equal(risolta.status, 'expired');
  assert.equal(risolta.da, 'sistema');
  assert.equal(Object.hasOwn(risolta, 'instruction'), false, 'la ricevuta per lo schermo resta quella di prima');
  assert.equal(giri.giro(0).input.segnaleStop.aborted, false, 'il giro prosegue');
  giri.concludi(0);
});

/*
 * «Nessuno davanti» per GIRO (CLI, 16/10/2026, compito 50): `talos -p` lo dice a ogni giro e non si salva; la TUI che riprende la
 * stessa sessione non lo passa, e la persona davanti ha di nuovo domande, carta del piano, elicitazione e file adottati. L'opzione
 * del giro vince su quella salvata; le riprese interne (senza opzione) tengono quella del giro prima.
 */
const concludiGiro = async (giri, i) => {
  giri.concludi(i, { ok: true, esito: { comeFinita: 'concluso', messaggiFinali: [{ role: 'system', content: 'istruzioni' }, { role: 'user', content: 'scegli la strada' }, { role: 'assistant', content: 'Fatto.' }] } });
  for (let k = 0; k < 5; k += 1) await new Promise((r) => setImmediate(r));
};

test('NESSUNO-PER-GIRO-01: per giro senza nessuno davanti la domanda si chiude subito, e NON si salva: dopo un riavvio la ripresa ha la persona davanti', async () => {
  const cartellaStore = cartellaDiProva('talos-nessuno-per-giro-');
  try {
    const prima = giriFinti();
    const registro = createSessionRegistry({ cartellaStore, avviaSessioneFn: prima.avviaSessioneFn });
    const { sessionId } = registro.avvia('task-vero', { senzaInterfacciaNelGiro: true });
    const input = prima.giro(0).input;
    assert.equal(input.nessunoDavanti, true);
    assert.equal(input.presentaPianoFn, undefined, 'niente carta del piano');
    assert.equal(input.onElicitazioneMcp, undefined, 'niente elicitazione MCP');
    assert.equal((await input.chiediDomandaFn(DOMANDE, { toolCallId: 'call_ask', messaggi: STORIA_ALLA_DOMANDA })).status, 'unanswerable');
    await concludiGiro(prima, 0);
    await svuota(cartellaStore);
    const dopo = giriFinti();
    const riavviato = createSessionRegistry({ cartellaStore, avviaSessioneFn: dopo.avviaSessioneFn });
    await riavviato.ripristina();
    assert.equal(riavviato.resume(sessionId, 'continua').erroreAvvio, undefined);
    const ripresa = dopo.giro(0).input;
    assert.notEqual(ripresa.nessunoDavanti, true, 'il «nessuno davanti» del giro non era salvato');
    assert.equal(typeof ripresa.presentaPianoFn, 'function', 'la persona davanti ha la carta del piano');
    assert.equal(typeof ripresa.onElicitazioneMcp, 'function');
    dopo.concludi(0);
    await svuota(cartellaStore);
  } finally {
    rimuoviCartellaDiProva(cartellaStore);
  }
});

test('NESSUNO-PER-GIRO-02: l\'opzione del giro vince su quella salvata (una sessione nata senza interfaccia ripresa con la persona davanti)', async () => {
  const giri = giriFinti();
  const registro = createSessionRegistry({ avviaSessioneFn: giri.avviaSessioneFn });
  const { sessionId } = registro.avvia('task-vero', { senzaInterfaccia: true });
  assert.equal(giri.giro(0).input.nessunoDavanti, true, 'premessa: salvata senza interfaccia');
  await concludiGiro(giri, 0);
  assert.equal(registro.resume(sessionId, 'continua', [], { senzaInterfacciaNelGiro: false }).erroreAvvio, undefined);
  const input = giri.giro(1).input;
  assert.notEqual(input.nessunoDavanti, true);
  assert.equal(typeof input.presentaPianoFn, 'function');
  const domanda = input.chiediDomandaFn(DOMANDE, { toolCallId: 'call_ask2', messaggi: STORIA_ALLA_DOMANDA });
  assert.equal(registro.elenca().find((s) => s.sessionId === sessionId).inAttesaDomanda, true, 'la domanda aspetta la persona');
  void domanda;
});

test('NESSUNO-PER-GIRO-03: una ripresa senza opzione (interna: la coda, il padre che riparte) tiene il valore del giro prima', async () => {
  const giri = giriFinti();
  const registro = createSessionRegistry({ avviaSessioneFn: giri.avviaSessioneFn });
  const { sessionId } = registro.avvia('task-vero', { senzaInterfacciaNelGiro: true });
  await concludiGiro(giri, 0);
  assert.equal(registro.resume(sessionId, 'continua').erroreAvvio, undefined);
  assert.equal(giri.giro(1).input.nessunoDavanti, true);
});

test('NESSUNO-PER-GIRO-04 (R2, CLI 0.6.8): `forka` porta il «nessuno davanti» del giro come `resume`; AL CONTRARIO senza opzione il fork ha la persona davanti', async () => {
  const giri = giriFinti();
  const registro = createSessionRegistry({ avviaSessioneFn: giri.avviaSessioneFn });
  const { sessionId } = registro.avvia('task-vero');
  await concludiGiro(giri, 0);
  const forcata = registro.forka(sessionId, { senzaInterfacciaNelGiro: true });
  assert.equal(forcata.erroreAvvio, undefined, JSON.stringify(forcata));
  const input = giri.giro(1).input;
  assert.equal(input.nessunoDavanti, true, '`talos -p --fork`: nessuno può rispondere');
  assert.equal((await input.chiediDomandaFn(DOMANDE, { toolCallId: 'call_ask', messaggi: STORIA_ALLA_DOMANDA })).status, 'unanswerable', 'the question closes at once, it does not wait for RUN_TIMEOUT');
  assert.equal(input.onElicitazioneMcp, undefined);
  await concludiGiro(giri, 1);
  const normale = registro.forka(sessionId);
  assert.equal(normale.erroreAvvio, undefined, JSON.stringify(normale));
  assert.notEqual(giri.giro(2).input.nessunoDavanti, true, 'a fork from the app has the person in front');
  assert.equal(typeof giri.giro(2).input.onElicitazioneMcp, 'function');
});
