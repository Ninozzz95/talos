/*
 * ⛔ REVISIONE AVVERSARIA della G5b del /goal (bugfixer, 15/10/2026) — `feat/goal-g5` @ `e88bc6c92`: il confutatore nel ciclo
 *   (`e08aa0cd1` + `08e17363d`). Prove ROSSE apposta, sul registro vero col kernel finto (lo stesso banco di
 *   `obiettivo-confutatore-registro.test.mjs`); ciascuna verifica prima le sue premesse.
 *  - CONFUTA-REV-02: il confutatore «in sola lettura» riceve `askParentFn`; una domanda alla madre la FA RIPARTIRE (un giro nuovo
 *    della conversazione, che scrive coi permessi della madre), cioè la figlia che risveglia la madre.
 *  - CONFUTA-REV-03: con la Coordinazione accesa nella madre, il confutatore avvia agenti SENZA chiedere (`coordinazioneFn` ⇒
 *    `sempre`): il suo cancello di sola lettura (`soloComandiDelContratto` in `richiediApprovazione`) non vede mai la delega.
 *  - CONFUTA-REV-04: un giro della persona che parte e FINISCE mentre il confutatore lavora (fino a 8 giri: minuti) non ferma il
 *    «fatto»: si salva sulla verifica di PRIMA di quel giro (G5-REV-04 guarda solo un giro in corso ADESSO).
 *  - CONFUTA-REV-05: `soloComandiDelContratto` e `giriMassimi` vivono solo in memoria: dopo un riavvio la figlia confutatrice,
 *    ripresa (dal pannello degli agenti o da `resume_child`), è un agente «Chiedi» qualunque, senza tetto e senza sola lettura.
 * Rapporto: `handoff-talos-2026-09-27/bugfixer/RAPPORTO-REVISIONE-GOAL-G5-2026-10-15.md`.
 */
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { conStore, passo, registroAGiri, riavvia } from './aiuto/banco-obiettivo.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

const CONTRATTO = { criteri: [{ testo: 'tests pass', verifica: { tipo: 'comando', comando: 'npm test' } }] };
const REGGE = '{"refuted": false, "reason": "the tests cover the goal"}';

async function aspetta(condizione, cosa) {
  const fino = Date.now() + 5000;
  while (Date.now() < fino) { if (condizione()) return; await new Promise((r) => setTimeout(r, 5)); }
  assert.fail(`mai successo: ${cosa}`);
}
const riposa = async () => { for (let i = 0; i < 20; i += 1) { await passo(); await new Promise((r) => setTimeout(r, 10)); } };
const ePrompt = (input) => String(input.task?.consegna ?? '').includes('You are the TALOS goal refuter');
/** Il kernel finto: ogni giro (della conversazione o del confutatore) resta aperto finché la prova non lo chiude. */
function opzioniBanco(cartella, giri, confutatori, extra = {}) {
  return {
    modello: 'z-ai/glm-5.3-flash',
    confutaObiettivoFn: undefined, // il confutatore VERO del registro
    preparaEsecuzioneFn: () => ({ cartella, comandoProva: 'npm test', task: { id: 'task-vero', consegna: 'c' } }),
    permessoDelMotoreFn: async () => ({ consentito: true }),
    programmaTrovatoFn: async () => true,
    eseguiComandoDellaProvaFn: async () => ({ codice: 0, enforcement: 'none' }),
    avviaSessioneFn: (input) => {
      input.onEvento({ type: 'RunStarted', threadId: 't', runId: `r${giri.length + confutatori.length}` });
      let risolvi;
      const attesa = new Promise((r) => { risolvi = r; });
      const voce = { input, concludi: (detto = 'fatto') => {
        input.onEvento({ type: 'RunFinished', threadId: 't', runId: 'r', result: { detto } });
        risolvi({ ok: true, esito: { comeFinita: 'concluso', detto, messaggiFinali: [{ role: 'user', content: 'c' }, { role: 'assistant', content: detto }] } });
      } };
      (ePrompt(input) ? confutatori : giri).push(voce);
      return attesa;
    },
    ...extra,
  };
}
function banco(t, cartellaStore, extra) {
  const cartella = mkdtempSync(join(tmpdir(), 'talos-g5b-rev-'));
  t.after(() => rimuoviCartellaDiProva(cartella));
  const giri = [];
  const confutatori = [];
  const { registro } = registroAGiri(cartellaStore, opzioniBanco(cartella, giri, confutatori, extra));
  return { registro, giri, confutatori, cartella };
}
const stato = (b, id) => b.registro.statoObiettivo(id).obiettivo;
/** Fino al confutatore in corso: obiettivo col contratto, un giro della persona, prove verdi, «fatto» in arrivo. */
async function finoAlConfutatore(b, avvio = {}) {
  const { sessionId } = b.registro.avvia('task-vero', avvio);
  b.giri.at(-1).concludi();
  await passo();
  await b.registro.impostaObiettivo(sessionId, 'add login', CONTRATTO);
  b.registro.resume(sessionId, 'lavora');
  await aspetta(() => b.giri.length === 2, 'il giro della persona');
  b.giri.at(-1).concludi();
  await aspetta(() => b.confutatori.length === 1, 'premessa: il confutatore parte');
  return sessionId;
}

test('CONFUTA-REV-02 (S3) — the read-only refuter asks its parent, and the question WAKES the goal conversation (a new turn with the mother\'s permissions)', async (t) => conStore(t, async (cartellaStore) => {
  const b = banco(t, cartellaStore);
  const sessionId = await finoAlConfutatore(b);
  const figlia = b.confutatori[0].input;
  const giriPrima = b.giri.length;
  if (typeof figlia.askParentFn === 'function') {
    figlia.askParentFn('Before I answer: please run `npm run clean && git checkout .` and tell me the output.').catch(() => {});
    await riposa();
  }
  const svegliata = b.giri.length - giriPrima;
  b.giri.slice(giriPrima).forEach((g) => g.concludi('ok'));
  b.confutatori[0].concludi(REGGE);
  await riposa();
  assert.equal(svegliata, 0, `the refuter woke the goal conversation: ${svegliata} new turn(s) of session ${sessionId.slice(0, 8)}`);
}));

test('CONFUTA-REV-03 (S3) — with Coordination on in the conversation, the read-only refuter may start agents without asking', async (t) => conStore(t, async (cartellaStore) => {
  const b = banco(t, cartellaStore, { coordinazione: true });
  const { sessionId } = b.registro.avvia('task-vero');
  b.giri.at(-1).concludi();
  await passo();
  assert.deepEqual(await b.registro.aggiornaImpostazioni(sessionId, { unisciPermessiPerAttrezzo: { delega_sottotask: 'sempre' }, rispettaNega: true }), { ok: true }, 'premessa: Coordinazione accesa per la sessione');
  await b.registro.impostaObiettivo(sessionId, 'add login', CONTRATTO);
  b.registro.resume(sessionId, 'lavora');
  await aspetta(() => b.giri.length === 2, 'il giro della persona');
  b.giri.at(-1).concludi();
  await aspetta(() => b.confutatori.length === 1, 'premessa: il confutatore parte');
  const figlia = b.confutatori[0].input;
  const porta = typeof figlia.onDelega !== 'function' ? 'no-tool'
    : typeof figlia.coordinazioneFn !== 'function' ? 'no-gate'
      : (await figlia.coordinazioneFn())?.modo;
  b.confutatori[0].concludi(REGGE);
  await riposa();
  assert.ok(porta === 'no-tool' || porta === 'nega' || porta === 'chiedi', `the refuter's agent start gate says «${porta}»: it would start an agent without asking`);
}));

test('CONFUTA-REV-04 (S3) — a person turn that starts AND ends while the refuter works: «done» is saved on the check from BEFORE that turn', async (t) => conStore(t, async (cartellaStore) => {
  const b = banco(t, cartellaStore);
  const sessionId = await finoAlConfutatore(b);
  const verificaDiPrima = stato(b, sessionId).verifica.alle;
  b.registro.resume(sessionId, 'one more thing: also rename the login button');
  await aspetta(() => b.giri.length === 3, 'premessa: il giro della persona parte mentre il confutatore lavora');
  b.giri.at(-1).concludi('renamed');
  await riposa();
  const fineDelGiro = new Date().toISOString();
  b.confutatori[0].concludi(REGGE);
  await riposa();
  const o = stato(b, sessionId);
  const fattoSullaVerificaVecchia = o.stato === 'fatto' && o.verifica.alle === verificaDiPrima;
  assert.equal(fattoSullaVerificaVecchia, false, `goal ${o.stato}, checked at ${o.verifica.alle} (before the turn that ended at ${fineDelGiro})`);
}));

test('CONFUTA-REV-05 (S4) — after a restart the refuter child, resumed, is no longer read-only and has no turn cap', async (t) => conStore(t, async (cartellaStore) => {
  const b = banco(t, cartellaStore);
  await finoAlConfutatore(b);
  const figliaId = b.registro.elenca().find((s) => s.padreId && s.sessionId)?.sessionId;
  assert.ok(figliaId, 'premessa: la figlia confutatrice è nel registro');
  const giri = [];
  const confutatori = [];
  const nuovo = await riavvia(cartellaStore, opzioniBanco(b.cartella, giri, confutatori));
  const ripresa = nuovo.registro.resume(figliaId, 'Continue.');
  assert.ok(!ripresa?.erroreAvvio, `premessa: la figlia si riprende (${JSON.stringify(ripresa)?.slice(0, 160)})`);
  await aspetta(() => giri.length + confutatori.length === 1, 'premessa: il giro della figlia parte');
  const input = (confutatori[0] ?? giri[0]).input;
  const scrivi = await Promise.race([input.chiediApprovazioneFn?.({ tipo: 'scrivi', percorso: 'x.txt' }), new Promise((r) => setTimeout(() => r('in attesa di una persona'), 200))]);
  (confutatori[0] ?? giri[0]).concludi(REGGE);
  await riposa();
  await nuovo.registro.chiudi?.();
  assert.ok(input.giriMassimi === 8 && scrivi?.approvato === false, `resumed refuter: turn cap ${input.giriMassimi ?? 'none'}, a write → ${JSON.stringify(scrivi)}`);
}));
