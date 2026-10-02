/*
 * ⛔ 24/09/2026 — PIANO approvabile, lato registro (fetta F3-30 della mappa `.claude/F3-MAPPA-WORKFLOW-PLAN-ASK-2026-09-23.md`).
 * Decisioni dell'owner (memoria `decisioni-owner-f3-workflow-plan-ask-23-09.md`): 3 e 37 le quattro scelte come Claude Code, il
 * permesso resta alla sessione; 36 il piano si presenta con un attrezzo e lo stesso giro prosegue; 38 il piano approvato resta
 * nella conversazione con revisione e impronta; 39 un piano in attesa sopravvive al riavvio.
 * Ricerca: `.claude/RICERCA-10x4-WORKFLOW-PLAN-ASK-2026-09-23.md` (Q1, Q2, D1, R2, R6).
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { improntaPiano } from '../src/plan-contract.mjs';
import { createSessionRegistry as createSessionRegistryReale } from '../src/session-registry.mjs';
import { attendiScritture } from '../src/session-store.mjs';
import { TaskCatalogError } from '../src/task-catalog.mjs';
import { cartellaDiProva } from './aiuto/cartelle-di-prova.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

function createSessionRegistry(opzioni) {
  return createSessionRegistryReale({ guardaWorkspaceFn: () => () => {}, modello: 'm', chiave: 'k',
    preparaEsecuzioneFn: preparaEsecuzioneFinta, preparaEsecuzioneLiberaFn: preparaLiberaFinta, cartellaEsisteFn: () => true, ...opzioni });
}
function preparaEsecuzioneFinta(taskId) {
  if (taskId !== 'task-vero') throw new TaskCatalogError(`Task non ammesso: ${taskId}`);
  return { cartella: '/tmp/x', comandoProva: 'npm test', task: { id: taskId, consegna: 'pianifica il riassunto' } };
}
function preparaLiberaFinta(_cartelle, { cartellaLibera, consegna }) {
  return { cartella: cartellaLibera, comandoProva: null, task: { id: 'libero:x', consegna, consegnaCorta: String(consegna).slice(0, 80) } };
}
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

const PIANO = '## Piano\n1. Leggo `a.txt`.\n2. Scrivo `b.txt` con il riassunto.';
const STORIA = [
  { role: 'system', content: 'istruzioni' },
  { role: 'user', content: 'pianifica il riassunto' },
  { role: 'assistant', content: '', tool_calls: [{ id: 'call_piano', type: 'function', function: { name: 'present_plan', arguments: JSON.stringify({ plan: PIANO }) } }] },
];
const eventiPiano = (registro, sessionId) => registro.esporta(sessionId).eventi.filter((e) => e.name === 'talos.plan').map((e) => e.value);
const sommario = (registro, sessionId) => registro.elenca().find((s) => s.sessionId === sessionId);

function inPiano(opzioni = {}) {
  const giri = giriFinti();
  const registro = createSessionRegistry({ avviaSessioneFn: giri.avviaSessioneFn, ...opzioni });
  const { sessionId } = registro.avvia('task-vero', { modalitaOperativaScelta: 'piano', permessiScelto: 'Read only' });
  return { giri, registro, sessionId };
}

test('PLAN-PRESENT-BORN-DURABLE: la presentazione nasce con revisione, impronta, chiamata e richiesta, e la sessione aspetta te', () => {
  const { giri, registro, sessionId } = inPiano();
  assert.equal(typeof giri.giro(0).input.presentaPianoFn, 'function');
  void giri.giro(0).input.presentaPianoFn({ plan: PIANO, toolCallId: 'call_piano', messaggi: STORIA });
  const [proposta] = eventiPiano(registro, sessionId);
  assert.equal(proposta.status, 'proposed');
  assert.equal(proposta.revision, 1);
  assert.equal(proposta.hash, improntaPiano(PIANO));
  assert.equal(proposta.toolCallId, 'call_piano');
  assert.equal(typeof proposta.requestId, 'string');
  assert.equal(proposta.content, PIANO);
  assert.equal(sommario(registro, sessionId).inAttesaPiano, true);
});

test('PLAN-APPROVE-EXACT-HASH: un\'impronta diversa è rifiutata; «accettando le modifiche» porta a Normale con scritture senza chiedere', async () => {
  const { giri, registro, sessionId } = inPiano();
  const attesa = giri.giro(0).input.presentaPianoFn({ plan: PIANO, toolCallId: 'call_piano', messaggi: STORIA });
  const { requestId, hash } = eventiPiano(registro, sessionId)[0];
  const vecchia = await registro.rispondiPiano(sessionId, { requestId, decisione: 'procedi-accetta-modifiche', hash: 'sha256:' + '0'.repeat(64) });
  assert.equal(vecchia.code, 'PLAN_STALE');
  assert.deepEqual(await registro.rispondiPiano(sessionId, { requestId, decisione: 'procedi-accetta-modifiche', hash }), { ok: true });
  const scelta = await attesa;
  assert.equal(scelta.decisione, 'procedi-accetta-modifiche');
  assert.equal(scelta.revision, 1);
  assert.equal(scelta.hash, hash);
  // F4-03 (01/10/2026): «Workspace write» porta il suo livello — dentro la cartella scrive senza chiedere, fuori chiede.
  assert.equal(scelta.livelloAccesso, 'scrittura-progetto', 'Workspace write: scrittura nel progetto');
  const s = sommario(registro, sessionId);
  assert.equal(s.modalitaOperativa, 'normale');
  assert.equal(s.permessi, 'Workspace write');
  assert.equal(s.inAttesaPiano, false);
  const decisione = eventiPiano(registro, sessionId).at(-1);
  assert.equal(decisione.status, 'approved');
  assert.equal(decisione.decisione, 'procedi-accetta-modifiche');
  assert.equal(decisione.da, 'persona');
  assert.equal(typeof decisione.at, 'string');
  assert.deepEqual(registro.esporta(sessionId).eventi.findLast((e) => e.name === 'talos.impostazioni-sessione')?.value,
    { modalitaOperativa: 'normale', permessi: 'Workspace write', motivo: 'piano-approvato' }, 'l\'interfaccia aggiorna modo e permesso');
});

test('PLAN-APPROVE-WITH-CONFIRMATIONS: «chiedendo conferma» porta a Normale con ogni scrittura da confermare', async () => {
  const { giri, registro, sessionId } = inPiano();
  const attesa = giri.giro(0).input.presentaPianoFn({ plan: PIANO, toolCallId: 'call_piano', messaggi: STORIA });
  const { requestId, hash } = eventiPiano(registro, sessionId)[0];
  await registro.rispondiPiano(sessionId, { requestId, decisione: 'procedi-con-conferma', hash });
  assert.equal((await attesa).livelloAccesso, 'su-richiesta');
  assert.equal(sommario(registro, sessionId).permessi, 'On request');
});

test('PLAN-KEEP-PLANNING: «continua a pianificare» resta in Piano e porta la correzione; la revisione dopo è la 2', async () => {
  const { giri, registro, sessionId } = inPiano();
  const attesa = giri.giro(0).input.presentaPianoFn({ plan: PIANO, toolCallId: 'call_piano', messaggi: STORIA });
  const { requestId, hash } = eventiPiano(registro, sessionId)[0];
  await registro.rispondiPiano(sessionId, { requestId, decisione: 'continua-a-pianificare', hash, feedback: 'Aggiungi i test.' });
  const scelta = await attesa;
  assert.equal(scelta.decisione, 'continua-a-pianificare');
  assert.equal(scelta.feedback, 'Aggiungi i test.');
  assert.equal(sommario(registro, sessionId).modalitaOperativa, 'piano');
  assert.equal(eventiPiano(registro, sessionId).at(-1).status, 'changes-requested');
  void giri.giro(0).input.presentaPianoFn({ plan: PIANO + '\n3. Test.', toolCallId: 'call_piano_2', messaggi: STORIA });
  assert.equal(eventiPiano(registro, sessionId).at(-1).revision, 2);
});

test('PLAN-CLEAN-SESSION: «conversazione pulita» apre una sessione nuova che parte dal solo piano; questa resta in Piano', async () => {
  const { giri, registro, sessionId } = inPiano();
  const attesa = giri.giro(0).input.presentaPianoFn({ plan: PIANO, toolCallId: 'call_piano', messaggi: STORIA });
  const { requestId, hash } = eventiPiano(registro, sessionId)[0];
  assert.deepEqual(await registro.rispondiPiano(sessionId, { requestId, decisione: 'conversazione-pulita', hash }), { ok: true });
  assert.equal((await attesa).decisione, 'conversazione-pulita');
  const decisione = eventiPiano(registro, sessionId).at(-1);
  assert.equal(typeof decisione.nuovaSessionId, 'string');
  const nuova = sommario(registro, decisione.nuovaSessionId);
  assert.ok(nuova, 'la sessione nuova esiste');
  assert.equal(nuova.modalitaOperativa, 'normale');
  assert.match(giri.giro(1).input.task?.consegna ?? '', /Scrivo `b\.txt`/u, 'la sessione nuova parte dal piano');
  assert.equal(sommario(registro, sessionId).modalitaOperativa, 'piano');
});

test('PLAN-DECISION-IDEMPOTENT: la stessa scelta ripetuta ha lo stesso esito; una scelta diversa dopo è rifiutata', async () => {
  const { giri, registro, sessionId } = inPiano();
  void giri.giro(0).input.presentaPianoFn({ plan: PIANO, toolCallId: 'call_piano', messaggi: STORIA });
  const { requestId, hash } = eventiPiano(registro, sessionId)[0];
  const corpo = { requestId, decisione: 'procedi-accetta-modifiche', hash };
  assert.deepEqual(await registro.rispondiPiano(sessionId, corpo), { ok: true });
  assert.deepEqual(await registro.rispondiPiano(sessionId, corpo), { ok: true });
  assert.equal((await registro.rispondiPiano(sessionId, { ...corpo, decisione: 'continua-a-pianificare' })).code, 'PLAN_NOT_PENDING');
  assert.equal(eventiPiano(registro, sessionId).filter((v) => v.status !== 'proposed').length, 1, 'una sola decisione sul disco');
});

test('PLAN-STOP-CANCELS: fermare il giro chiude il piano in attesa, e il modello lo sa', async () => {
  const { giri, registro, sessionId } = inPiano();
  const attesa = giri.giro(0).input.presentaPianoFn({ plan: PIANO, toolCallId: 'call_piano', messaggi: STORIA });
  registro.ferma(sessionId);
  const scelta = await attesa;
  assert.equal(scelta.decisione, undefined);
  assert.equal(scelta.reason, 'run-cancelled');
  const ultimo = eventiPiano(registro, sessionId).at(-1);
  assert.equal(ultimo.status, 'cancelled');
  assert.equal(ultimo.motivo, 'fermato');
});

test('PLAN-SURVIVES-RESTART: dopo un riavvio il piano resta approvabile e la scelta fa ripartire il giro in Normale dalla presentazione', async () => {
  const cartellaStore = cartellaDiProva('talos-piano-riavvio-');
  try {
    const prima = giriFinti();
    const registro = createSessionRegistry({ cartellaStore, avviaSessioneFn: prima.avviaSessioneFn });
    const { sessionId } = registro.avvia('task-vero', { modalitaOperativaScelta: 'piano', permessiScelto: 'Read only' });
    void prima.giro(0).input.presentaPianoFn({ plan: PIANO, toolCallId: 'call_piano', messaggi: STORIA });
    const { requestId, hash } = eventiPiano(registro, sessionId)[0];
    await svuota(cartellaStore);
    const dopo = giriFinti();
    const riavviato = createSessionRegistry({ cartellaStore, avviaSessioneFn: dopo.avviaSessioneFn });
    await riavviato.ripristina();
    assert.equal(sommario(riavviato, sessionId).inAttesaPiano, true);
    assert.deepEqual(await riavviato.rispondiPiano(sessionId, { requestId, decisione: 'procedi-accetta-modifiche', hash }), { ok: true });
    assert.equal(dopo.quanti, 1, 'la scelta fa partire UN giro');
    const input = dopo.giro(0).input;
    assert.equal(input.modalitaOperativa, 'normale');
    const esito = input.messaggiIniziali.find((m) => m.role === 'tool' && m.tool_call_id === 'call_piano');
    assert.match(esito.content, /approved plan revision 1/u);
    dopo.concludi(0);
    await svuota(cartellaStore);
    const terzo = createSessionRegistry({ cartellaStore, avviaSessioneFn: giriFinti().avviaSessioneFn });
    await terzo.ripristina();
    assert.equal(sommario(terzo, sessionId).inAttesaPiano, false);
    assert.equal(sommario(terzo, sessionId).modalitaOperativa, 'normale', 'il modo scelto sopravvive');
    assert.equal(sommario(terzo, sessionId).permessi, 'Workspace write', 'il permesso scelto resta alla sessione');
  } finally {
    await svuota(cartellaStore);
    rimuoviCartellaDiProva(cartellaStore);
  }
});
