/*
 * Port of the long-task permission cards A and B (owner request 126, 13/11/2026 04:35) onto the 0.2.3 candidate (16/11/2026, judge 19:16).
 *   The branch added two answers on the old form of `rispondiApprovazione` (the yes read as `approvato`, truthy): «for every call of
 *   the card» (`ambito: 'risposta'`) and «No to this tool until your next message» (`ambito: 'strumento'` with a no). The twin
 *   (P018 in 0.2.2, decision 373 round 2) reads a yes ONCE, `si = approvato === true`, and resolves and broadcasts with it.
 *   - PCL-01..04 fall with the twin's side alone (the two answers do not exist: QUERY_INVALID);
 *   - PCL-02 and the opposite PCL-C3 fall with the branch's side taken as it is (a 1 is a yes for the event or for the kernel);
 *   - PCL-C1..C3 (the opposite): «only this time», the edited research question and the strict yes still do what the twin did.
 *   Like Hermes (`tools/approval.py:936-940`): one answer, read once, and every surface tells the same answer.
 * Fake runtime, temporary store, no key.
 */
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { createSessionRegistry } from '../src/session-registry.mjs';

const GRUPPO = { totale: 2, chiamate: [{ toolCallId: 'c1', argomenti: { title: 'a' } }, { toolCallId: 'c2', argomenti: { title: 'b' } }] };
const CARTA_MCP = { tipo: 'mcp_tool', toolCallId: 'c1', nome: 'mcp__github__create_issue', server: 'github', attrezzo: 'create_issue' };
/** a pending card must never hang the file: after 2 s the answer counts as missing */
const conTetto = (p) => Promise.race([p, new Promise((r) => { const h = setTimeout(() => r('nessuna-risposta'), 2000); h.unref?.(); })]);

async function scena(t, carta) {
  const runs = [];
  const eventi = [];
  const registry = createSessionRegistry({ cartellaStore: mkdtempSync(join(tmpdir(), 'porto-carte-lunghi-')), modello: 'm', chiave: 'k', cartellaEsisteFn: () => true,
    preparaEsecuzioneFn: () => ({ cartella: 'C:/progetto', comandoProva: null, task: { id: 'task', consegna: 'x' } }),
    avviaSessioneFn: (input) => { input.onEvento({ type: 'RunStarted', threadId: 't', runId: 'r' }); runs.push(input); return new Promise(() => {}); } });
  t.after(() => registry.chiudi?.());
  const { sessionId } = registry.avvia('task', { permessiScelto: 'Workspace write', modalitaOperativaScelta: 'normale' });
  const smetti = registry.iscriviti(sessionId, (e) => eventi.push(e));
  t.after(() => smetti?.());
  const domanda = runs[0].chiediApprovazioneFn(carta);
  await new Promise((r) => setTimeout(r, 10));
  /** the last ApprovalResolved the clients read */
  const risolta = () => eventi.map((e) => (e?.name === 'ApprovalResolved' ? e.value : e?.type === 'ApprovalResolved' ? e : null)).filter(Boolean).at(-1);
  return { registry, sessionId, domanda, risolta, requestId: registry.domandaInAttesa(sessionId)?.requestId, input: runs[0] };
}

test('PCL-01: «allow all» on a group card reaches the kernel as a yes for every call, and the event says yes with its scope', async (t) => {
  const s = await scena(t, { ...CARTA_MCP, gruppo: GRUPPO });
  assert.deepEqual(s.registry.rispondiApprovazione(s.sessionId, s.requestId, true, { ambito: 'risposta' }), { ok: true });
  assert.deepEqual(await conTetto(s.domanda), { approvato: true, perTutteLeChiamate: true });
  assert.equal(s.risolta()?.approvato, true);
  assert.equal(s.risolta()?.ambito, 'risposta');
});

test('PCL-02: a loose yes (1, "yes") «for all» is a no for the kernel AND for the event: they never disagree (decision 373 round 2)', async (t) => {
  for (const sciolto of [1, 'yes']) {
    const s = await scena(t, { ...CARTA_MCP, gruppo: GRUPPO });
    assert.deepEqual(s.registry.rispondiApprovazione(s.sessionId, s.requestId, sciolto, { ambito: 'risposta' }), { ok: true }, String(sciolto));
    assert.deepEqual(await conTetto(s.domanda), { approvato: false, perTutteLeChiamate: true }, String(sciolto));
    assert.equal(s.risolta()?.approvato, false, `event for ${String(sciolto)}`);
  }
});

test('PCL-03: «No to this tool until your next message» on a connector card reaches the kernel marked, writes nothing for the session', async (t) => {
  const s = await scena(t, CARTA_MCP);
  assert.deepEqual(s.registry.rispondiApprovazione(s.sessionId, s.requestId, false, { ambito: 'strumento' }), { ok: true });
  assert.deepEqual(await conTetto(s.domanda), { approvato: false, noAlloStrumento: true });
  assert.equal(s.risolta()?.approvato, false);
  assert.equal(s.risolta()?.ambito, 'strumento');
  assert.deepEqual(s.input.consensiSessione?.attrezziMcpConsentiti ?? [], []);
});

test('PCL-04: a loose no (0, "no", null) with `ambito: strumento` is no «No to this tool»: refused, the card stays pending', async (t) => {
  const s = await scena(t, CARTA_MCP);
  for (const sciolto of [0, 'no', null]) assert.equal(s.registry.rispondiApprovazione(s.sessionId, s.requestId, sciolto, { ambito: 'strumento' }).code, 'QUERY_INVALID', String(sciolto));
  assert.equal(s.registry.domandaInAttesa(s.sessionId)?.requestId, s.requestId);
  assert.deepEqual(s.registry.rispondiApprovazione(s.sessionId, s.requestId, false, { ambito: 'strumento' }), { ok: true });
  assert.deepEqual(await conTetto(s.domanda), { approvato: false, noAlloStrumento: true });
});

test('PCL-C1 (opposite): «only this time» on the root card still resolves as the twin did', async (t) => {
  const s = await scena(t, { tipo: 'shell', comando: 'ls', toolCallId: 'r1', wslRoot: { distro: 'Ubuntu', utente: 'root', frase: 'root' } });
  assert.deepEqual(s.registry.rispondiApprovazione(s.sessionId, s.requestId, true, { ambito: 'volta' }), { ok: true });
  assert.deepEqual(await conTetto(s.domanda), { approvato: true, soloQuestaVolta: true });
  assert.equal(s.risolta()?.ambito, 'volta');
});

test('PCL-C2 (opposite): the edited research question still reaches the kernel on one line', async (t) => {
  const s = await scena(t, { tipo: 'research_start', toolCallId: 'q1', domanda: 'Hermes?' });
  assert.deepEqual(s.registry.rispondiApprovazione(s.sessionId, s.requestId, true, { domandaModificata: '  Solo   Hermes\ne Codex ' }), { ok: true });
  assert.deepEqual(await conTetto(s.domanda), { approvato: true, domandaModificata: 'Solo Hermes e Codex' });
});

test('PCL-C3 (opposite): a loose yes without a scope is still a no for the kernel and the event; a strict yes still a plain true', async (t) => {
  const s = await scena(t, CARTA_MCP);
  assert.deepEqual(s.registry.rispondiApprovazione(s.sessionId, s.requestId, 1), { ok: true });
  assert.equal(await conTetto(s.domanda), false);
  assert.equal(s.risolta()?.approvato, false);
  const v = await scena(t, CARTA_MCP);
  assert.deepEqual(v.registry.rispondiApprovazione(v.sessionId, v.requestId, true), { ok: true });
  assert.equal(await conTetto(v.domanda), true);
  assert.equal(v.risolta()?.approvato, true);
});
