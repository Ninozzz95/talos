/*
 * E1, decision 121 (owner 03/11/2026, option (d); form FORMA-CARTA-EMULATI-D-2026-11-03.md, plan PIANO-E1-CARTA-EMULATI-2026-11-04.md).
 * Server tests 10-13 of the form: «yes for this tool in this conversation» = `ambito: 'strumento'`.
 * - Valid only with a yes, and only on a pending question that is the card of an emulated call (`emulata: true` with a `nome`).
 * - The NAME comes from the pending question, never from the client (same discipline as F4-03 and BUG-A).
 * - It goes into `consensiSessione.strumentiEmulatiConsentiti`: a child sees the yes of its parent (the chain view), a new
 *   conversation does not.
 * - The `ApprovalResolved` event carries the scope, like 'cartella' and 'percorso'.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createSessionRegistry } from '../src/session-registry.mjs';
import { attendiScritture } from '../src/session-store.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

const CARTA = { tipo: 'chiamata-dal-testo', emulata: true, nome: 'scrivi', toolCallId: 'emulata-1', argomenti: { percorso: 'b.txt' } };

async function scena(t) {
  const cartellaStore = mkdtempSync(join(tmpdir(), 'talos-e1-server-'));
  const runs = [];
  const registro = createSessionRegistry({
    cartellaStore, modello: 'm', chiave: 'k', cartellaEsisteFn: () => true,
    preparaEsecuzioneFn: () => ({ cartella: '/tmp/x', comandoProva: 'npm test', task: { id: 'task', consegna: 'lavora' } }),
    avviaSessioneFn(input) {
      let resolve;
      const promise = new Promise((r) => { resolve = r; });
      runs.push({ input, resolve });
      input.onEvento({ type: 'RunStarted', threadId: `t${runs.length}`, runId: `r${runs.length}` });
      return promise;
    },
  });
  t.after(async () => {
    for (const [i, run] of runs.entries()) {
      try {
        run.input.onEvento({ type: 'RunFinished', threadId: `t${i}`, runId: `r${i}` });
        run.resolve({ ok: true, esito: { detto: 'ok', comeFinita: 'concluso', messaggiFinali: [{ role: 'user', content: 'x' }, { role: 'assistant', content: 'ok' }] } });
      } catch { /* already closed */ }
    }
    await registro.chiudi?.();
    try { await attendiScritture({ cartellaStore }); } catch { /* cleanup anyway */ }
    rimuoviCartellaDiProva(cartellaStore);
  });
  const { sessionId } = registro.avvia('task', { permessiScelto: 'Workspace write', modalitaOperativaScelta: 'normale' });
  const ricevuti = [];
  registro.iscriviti(sessionId, (e) => ricevuti.push(e));
  return { registro, runs, sessionId, ricevuti, input: runs[0].input };
}
/** Opens a real question on the session `id` and gives back its request id and the promise of the kernel. */
async function domanda(registro, id, input, azione) {
  const promessa = input.chiediApprovazioneFn(azione);
  await new Promise((r) => setTimeout(r, 10));
  const requestId = registro.domandaInAttesa(id)?.requestId;
  assert.ok(requestId, `premise: ${id} has an open question`);
  return { promessa, requestId };
}
const consentiti = (input) => [...(input.consensiSessione?.strumentiEmulatiConsentiti ?? [])];

test('E1-10: «yes for this tool» on a question that is NOT an emulated card is refused, and the question stays open', async (t) => {
  const s = await scena(t);
  for (const azione of [
    { tipo: 'scrivi', percorso: 'b.txt' },
    { tipo: 'chiamata-dal-testo', nome: 'scrivi', toolCallId: 'call_1' },
    { tipo: 'chiamata-dal-testo', emulata: true, toolCallId: 'emulata-x' },
  ]) {
    const { promessa, requestId } = await domanda(s.registro, s.sessionId, s.input, azione);
    const r = s.registro.rispondiApprovazione(s.sessionId, requestId, true, { ambito: 'strumento' });
    assert.notEqual(r.ok, true, JSON.stringify(azione));
    assert.equal(r.code, 'QUERY_INVALID', JSON.stringify(azione));
    assert.equal(s.registro.domandaInAttesa(s.sessionId)?.requestId, requestId, 'the person can still answer');
    assert.deepEqual(s.registro.rispondiApprovazione(s.sessionId, requestId, false), { ok: true });
    await promessa;
  }
  assert.deepEqual(consentiti(s.input), []);
});

test('E1-11: «for this tool» with a no is refused; nothing is remembered', async (t) => {
  const s = await scena(t);
  const { promessa, requestId } = await domanda(s.registro, s.sessionId, s.input, CARTA);
  const r = s.registro.rispondiApprovazione(s.sessionId, requestId, false, { ambito: 'strumento' });
  assert.equal(r.code, 'QUERY_INVALID');
  assert.deepEqual(s.registro.rispondiApprovazione(s.sessionId, requestId, false), { ok: true });
  await promessa;
  assert.deepEqual(consentiti(s.input), []);
});

test('E1-12: the name comes from the QUESTION, never from the client; the event carries the scope', async (t) => {
  const s = await scena(t);
  const { promessa, requestId } = await domanda(s.registro, s.sessionId, s.input, CARTA);
  /* the client tries to slip in another tool: it is ignored, the card says «scrivi» */
  assert.deepEqual(s.registro.rispondiApprovazione(s.sessionId, requestId, true, { ambito: 'strumento', nome: 'shell' }), { ok: true });
  assert.equal(await promessa, true, 'the kernel receives a plain yes');
  assert.deepEqual(consentiti(s.input), ['scrivi']);
  const evento = s.ricevuti.find((e) => e.type === 'ApprovalResolved' && e.requestId === requestId);
  assert.equal(evento?.ambito, 'strumento');
  /* the same tool twice is stored once */
  const due = await domanda(s.registro, s.sessionId, s.input, { ...CARTA, toolCallId: 'emulata-2' });
  assert.deepEqual(s.registro.rispondiApprovazione(s.sessionId, due.requestId, true, { ambito: 'strumento' }), { ok: true });
  await due.promessa;
  assert.deepEqual(consentiti(s.input), ['scrivi']);
});

test('E1-13: a child sees the yes for the tool of its parent; a new conversation does not; the child yes does not climb', async (t) => {
  const s = await scena(t);
  const { promessa, requestId } = await domanda(s.registro, s.sessionId, s.input, CARTA);
  assert.deepEqual(s.registro.rispondiApprovazione(s.sessionId, requestId, true, { ambito: 'strumento' }), { ok: true });
  await promessa;
  await s.input.onDelega('figlia: scrivi un file', '/tmp/x');
  const figliaId = s.registro.elenca().find((x) => x.padreId === s.sessionId)?.sessionId;
  assert.ok(figliaId, 'premise: the child exists');
  const inputFiglia = s.runs[1].input;
  assert.deepEqual(consentiti(inputFiglia), ['scrivi'], 'the child sees the yes of the parent');
  /* the child gives its own yes for another tool: it stays in the child */
  const f = await domanda(s.registro, figliaId, inputFiglia, { ...CARTA, nome: 'shell', toolCallId: 'emulata-f' });
  assert.deepEqual(s.registro.rispondiApprovazione(figliaId, f.requestId, true, { ambito: 'strumento' }), { ok: true });
  await f.promessa;
  assert.deepEqual(consentiti(inputFiglia).sort(), ['scrivi', 'shell']);
  assert.deepEqual(consentiti(s.input), ['scrivi'], 'the yes of the child does not climb to the parent');
  /* a new conversation starts with nothing */
  const { sessionId: altra } = s.registro.avvia('task', { permessiScelto: 'Workspace write', modalitaOperativaScelta: 'normale' });
  const inputAltra = s.runs.at(-1).input;
  assert.notEqual(altra, s.sessionId);
  assert.deepEqual(consentiti(inputAltra), []);
});

/*
 * D3 of the Desktop's adversarial review (04/11/2026, security): REV8-01 closed an automatic yes (a rule, the mode, the classifier:
 * `MOTIVI_DEL_SI_SENZA_PERSONA`) only on `CARTA_SEMPRE` cards. An emulated card is `semprePersona` («no host approves it by
 * itself»): an automatic yes with `ambito: 'strumento'` would open the tool for the whole conversation, children included.
 */
test('E1-19 (D3): an automatic yes on a semprePersona card is a no; nothing is remembered; the person yes still works', async (t) => {
  const s = await scena(t);
  /* a semprePersona card reaches only a client that can show it (like the CLI declares) */
  const CAPACE = { capacita: ['chiamata-dal-testo'] };
  s.registro.iscriviti(s.sessionId, () => {}, 0, CAPACE);
  const domandaCapace = async (azione) => {
    const promessa = s.input.chiediApprovazioneFn(azione);
    await new Promise((r) => setTimeout(r, 10));
    const requestId = s.registro.domandaInAttesa(s.sessionId, CAPACE)?.requestId;
    assert.ok(requestId, `premise: an open question for ${azione.toolCallId}`);
    return { promessa, requestId };
  };
  for (const motivo of ['regola', 'modalita']) {
    const { promessa, requestId } = await domandaCapace( { ...CARTA, semprePersona: true, nome: 'shell', toolCallId: `emulata-a-${motivo}` });
    assert.deepEqual(s.registro.rispondiApprovazione(s.sessionId, requestId, true, { ambito: 'strumento', motivo }), { ok: true });
    const esito = await promessa;
    assert.notEqual(esito === true || esito?.approvato === true, true, `${motivo}: the kernel receives a no`);
    const evento = s.ricevuti.find((e) => e.type === 'ApprovalResolved' && e.requestId === requestId);
    assert.equal(evento?.approvato, false, motivo);
    assert.equal(evento?.motivo, 'nessuna-interfaccia', motivo);
  }
  assert.deepEqual(consentiti(s.input), [], 'a rule does not give the yes for the tool');
  /* the same automatic yes without the scope: still a no (R-34 card, semprePersona too) */
  const r34 = await domandaCapace({ tipo: 'chiamata-dal-testo', semprePersona: true, nome: 'scrivi', toolCallId: 'daTesto-1' });
  assert.deepEqual(s.registro.rispondiApprovazione(s.sessionId, r34.requestId, true, { motivo: 'regola' }), { ok: true });
  const esitoR34 = await r34.promessa;
  assert.notEqual(esitoR34 === true || esitoR34?.approvato === true, true);
  /* CLI condition: the forced card that inherits semprePersona (D2 b) is closed the same way */
  const forzata = await domandaCapace({ tipo: 'scrivi', toolCallId: 'emulata-f', percorso: '.env', segreto: { classe: 'segreto', percorso: '.env' }, semprePersona: true, nome: 'scrivi' });
  assert.deepEqual(s.registro.rispondiApprovazione(s.sessionId, forzata.requestId, true, { motivo: 'modalita' }), { ok: true });
  const esitoForzata = await forzata.promessa;
  assert.notEqual(esitoForzata === true || esitoForzata?.approvato === true, true, 'the mode does not approve the secret of an emulated call');
  /* AL CONTRARIO: the yes of the person (no motivo) still opens the tool */
  const p = await domandaCapace({ ...CARTA, semprePersona: true, toolCallId: 'emulata-p' });
  assert.deepEqual(s.registro.rispondiApprovazione(s.sessionId, p.requestId, true, { ambito: 'strumento' }), { ok: true });
  assert.equal(await p.promessa, true);
  assert.deepEqual(consentiti(s.input), ['scrivi']);
});
