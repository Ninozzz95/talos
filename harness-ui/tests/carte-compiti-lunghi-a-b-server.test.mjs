/*
 * Long tasks, permission cards A and B (owner 13/11/2026 04:35; judge v1759) — the server's side: what the person's answer on the card
 *   becomes for the kernel, and what the `/approve` route accepts.
 *   - `ambito: 'risposta'` (yes or no): the answer covers every call the card lists (`azione.gruppo`); only on a card that has a group,
 *     only from the person (never with an automatic reason);
 *   - `ambito: 'strumento'` with a no: «No to this tool until your next message»; only on the card of an outside tool (connector,
 *     plugin, Tool Forge), «Read only» included, only from the person. The tool comes from the QUESTION, never from the client.
 * Fake runtime, temporary store, no key.
 */
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { createHttpApp } from '../src/http-app.mjs';
import { createSessionRegistry } from '../src/session-registry.mjs';

const GRUPPO = { totale: 3, chiamate: [{ toolCallId: 'c1', argomenti: { title: 'a' } }, { toolCallId: 'c2', argomenti: { title: 'b' } }, { toolCallId: 'c3', argomenti: { title: 'c' } }] };
/** a pending card must never hang the file: after 2 s the answer counts as missing */
const conTetto = (p) => Promise.race([p, new Promise((r) => { const h = setTimeout(() => r('nessuna-risposta'), 2000); h.unref?.(); })]);
const CARTA_MCP = { tipo: 'mcp_tool', toolCallId: 'c1', nome: 'mcp__github__create_issue', server: 'github', attrezzo: 'create_issue' };

async function scena(t, carta) {
  const runs = [];
  const eventi = [];
  const registry = createSessionRegistry({ cartellaStore: mkdtempSync(join(tmpdir(), 'talos-carte-ab-')), modello: 'm', chiave: 'k', cartellaEsisteFn: () => true,
    preparaEsecuzioneFn: () => ({ cartella: 'C:/progetto', comandoProva: null, task: { id: 'task', consegna: 'x' } }),
    avviaSessioneFn: (input) => { input.onEvento({ type: 'RunStarted', threadId: 't', runId: 'r' }); runs.push(input); return new Promise(() => {}); } });
  t.after(() => registry.chiudi?.());
  const { sessionId } = registry.avvia('task', { permessiScelto: 'Workspace write', modalitaOperativaScelta: 'normale' });
  /* the events the clients read (ApprovalResolved and its scope): the registry's own subscription (`iscriviti`, as P018-20) */
  const smetti = registry.iscriviti(sessionId, (e) => eventi.push(e));
  t.after(() => smetti?.());
  const domanda = runs[0].chiediApprovazioneFn(carta);
  await new Promise((r) => setTimeout(r, 10));
  return { registry, sessionId, domanda, eventi, requestId: registry.domandaInAttesa(sessionId)?.requestId, voce: () => registry.domandaInAttesa(sessionId), input: runs[0] };
}

test('AB-S1: «allow all» (`ambito: risposta`) on a group card reaches the kernel as a yes for every call of the card', async (t) => {
  const { registry, sessionId, domanda, requestId } = await scena(t, { ...CARTA_MCP, gruppo: GRUPPO });
  assert.ok(requestId);
  assert.deepEqual(registry.rispondiApprovazione(sessionId, requestId, true, { ambito: 'risposta' }), { ok: true });
  assert.deepEqual(await conTetto(domanda), { approvato: true, perTutteLeChiamate: true });
});

test('AB-S2: «No» for all (`ambito: risposta`, no) reaches the kernel as a no for every call of the card', async (t) => {
  const { registry, sessionId, domanda, requestId } = await scena(t, { ...CARTA_MCP, gruppo: GRUPPO });
  assert.deepEqual(registry.rispondiApprovazione(sessionId, requestId, false, { ambito: 'risposta' }), { ok: true });
  assert.deepEqual(await conTetto(domanda), { approvato: false, perTutteLeChiamate: true });
});

test('AB-S3: `ambito: risposta` on a card WITHOUT a group is refused, and the card stays pending for the person', async (t) => {
  for (const carta of [CARTA_MCP, { tipo: 'shell', comando: 'npm test', toolCallId: 's1' }]) {
    const { registry, sessionId, requestId } = await scena(t, carta);
    for (const approvato of [true, false]) assert.equal(registry.rispondiApprovazione(sessionId, requestId, approvato, { ambito: 'risposta' }).code, 'QUERY_INVALID');
    assert.equal(registry.domandaInAttesa(sessionId)?.requestId, requestId);
  }
});

test('AB-S4: an automatic yes or no (a rule, the mode, a reason) can never answer «for all»', async (t) => {
  const { registry, sessionId, requestId } = await scena(t, { ...CARTA_MCP, gruppo: GRUPPO });
  for (const motivo of ['regola', 'modalita', 'classificatore']) assert.equal(registry.rispondiApprovazione(sessionId, requestId, true, { ambito: 'risposta', motivo }).code, 'QUERY_INVALID');
  assert.equal(registry.rispondiApprovazione(sessionId, requestId, false, { ambito: 'risposta', motivo: 'Denied: not interactive.' }).code, 'QUERY_INVALID');
  assert.equal(registry.domandaInAttesa(sessionId)?.requestId, requestId);
});

for (const [nome, carta] of [
  ['connector', CARTA_MCP],
  ['connector, «Read only» (only once)', { ...CARTA_MCP, soloUnaVolta: true }],
  ['plugin', { tipo: 'plugin_tool', toolCallId: 'p1', nome: 'plugin__lint__check', plugin: 'lint', attrezzo: 'check' }],
  ['Tool Forge', { tipo: 'forge_tool', toolCallId: 'f1', nome: 'forge_daily_note', attrezzo: 'daily_note' }],
]) {
  test(`AB-S5 (${nome}): «No to this tool until your next message» (\`ambito: strumento\`, no) reaches the kernel marked, never as a yes`, async (t) => {
    const { registry, sessionId, domanda, requestId } = await scena(t, carta);
    assert.deepEqual(registry.rispondiApprovazione(sessionId, requestId, false, { ambito: 'strumento' }), { ok: true });
    assert.deepEqual(await conTetto(domanda), { approvato: false, noAlloStrumento: true });
  });
}

test('AB-S6: B is refused on a card that is not an outside tool (shell, critical delete) and with an automatic reason', async (t) => {
  for (const carta of [{ tipo: 'shell', comando: 'npm test', toolCallId: 's1' }, { tipo: 'shell', comando: 'rd /s /q C:\\Users\\nino', toolCallId: 's2', cancellazioneCritica: { percorso: 'C:\\Users\\nino', perche: 'casa' } }]) {
    const { registry, sessionId, requestId } = await scena(t, carta);
    assert.equal(registry.rispondiApprovazione(sessionId, requestId, false, { ambito: 'strumento' }).code, 'QUERY_INVALID');
    assert.equal(registry.domandaInAttesa(sessionId)?.requestId, requestId);
  }
  const { registry, sessionId, requestId } = await scena(t, CARTA_MCP);
  assert.equal(registry.rispondiApprovazione(sessionId, requestId, false, { ambito: 'strumento', motivo: 'Denied: not interactive.' }).code, 'QUERY_INVALID');
});

test('AB-S7: B remembers nothing for the session: no «yes for this tool» is written', async (t) => {
  const { registry, sessionId, domanda, requestId, input } = await scena(t, CARTA_MCP);
  assert.deepEqual(registry.rispondiApprovazione(sessionId, requestId, false, { ambito: 'strumento' }), { ok: true });
  await conTetto(domanda);
  /* where «for this tool» writes its yes (the session consents the kernel reads, P018-20): nothing there */
  assert.deepEqual([...(input.consensiSessione?.attrezziMcpConsentiti ?? [])], []);
  assert.deepEqual([...(input.consensiSessione?.strumentiEmulatiConsentiti ?? [])], []);
});

/* ── second tests after the mutants (R1, R2, R5, H2 were killed by one test only) ──────────────────────────────────────────────── */

const CARTA_PLUGIN = { tipo: 'plugin_tool', toolCallId: 'p1', nome: 'plugin__lint__check', plugin: 'lint', attrezzo: 'check' };

test('AB-S2b (plugin): «Deny all» on a plugin group card reaches the kernel as a no for all, never as a yes', async (t) => {
  const { registry, sessionId, domanda, requestId } = await scena(t, { ...CARTA_PLUGIN, gruppo: GRUPPO });
  assert.deepEqual(registry.rispondiApprovazione(sessionId, requestId, false, { ambito: 'risposta' }), { ok: true });
  assert.deepEqual(await conTetto(domanda), { approvato: false, perTutteLeChiamate: true });
});

test('AB-S4b (plugin): a rule or the mode never answers «for all» on a plugin group card either; the card waits for the person', async (t) => {
  const { registry, sessionId, requestId } = await scena(t, { ...CARTA_PLUGIN, gruppo: GRUPPO });
  assert.equal(registry.rispondiApprovazione(sessionId, requestId, true, { ambito: 'risposta', motivo: 'regola' }).code, 'QUERY_INVALID');
  assert.equal(registry.domandaInAttesa(sessionId)?.requestId, requestId);
});

test('AB-S6b: B is refused on the card of a write, and on a connector card that names no tool (the tool comes from the question only)', async (t) => {
  for (const carta of [{ tipo: 'scrivi', toolCallId: 'w1', percorso: 'note.md' },
    { tipo: 'mcp_tool', toolCallId: 'm0', nome: 'mcp__github__', server: 'github', attrezzo: '' }]) {
    const { registry, sessionId, requestId } = await scena(t, carta);
    assert.equal(registry.rispondiApprovazione(sessionId, requestId, false, { ambito: 'strumento' }).code, 'QUERY_INVALID', carta.tipo);
    assert.equal(registry.domandaInAttesa(sessionId)?.requestId, requestId);
  }
});

test('AB-S8: the plain answers of today are unchanged on a group card (a yes is `true`, a no is `false`)', async (t) => {
  const a = await scena(t, { ...CARTA_MCP, gruppo: GRUPPO });
  a.registry.rispondiApprovazione(a.sessionId, a.requestId, true);
  assert.equal(await conTetto(a.domanda), true);
  const b = await scena(t, { ...CARTA_MCP, gruppo: GRUPPO });
  b.registry.rispondiApprovazione(b.sessionId, b.requestId, false);
  assert.equal(await conTetto(b.domanda), false);
});

/* ── the route ───────────────────────────────────────────────────────────────────────────────────────────────────────────────── */

async function rotta(t) {
  const ricevute = [];
  const sessionRegistry = { rispondiApprovazione: (sessionId, requestId, approvato, opzioni) => { ricevute.push({ approvato, ambito: opzioni?.ambito }); return { ok: true }; } };
  const server = createServer(createHttpApp({ senzaGettone: 'prove', staticHandler: async () => null, sessionRegistry, listaTaskDisponibili: () => [] }));
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  t.after(() => new Promise((r) => server.close(() => r())));
  const base = `http://127.0.0.1:${server.address().port}`;
  const invia = (corpo) => fetch(`${base}/api/v1/sessions/s1/approve`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) });
  return { invia, ricevute };
}

test('AB-S9: the route takes `ambito: risposta` with a yes or a no, and `ambito: strumento` with a no; every other new form is 400', async (t) => {
  const { invia, ricevute } = await rotta(t);
  for (const corpo of [{ approvato: true, ambito: 'risposta' }, { approvato: false, ambito: 'risposta' }, { approvato: false, ambito: 'strumento' }]) {
    const r = await invia({ requestId: 'r1', ...corpo });
    assert.equal(r.status, 200, JSON.stringify(corpo));
    assert.deepEqual(ricevute.pop(), corpo);
  }
  for (const corpo of [
    { approvato: false, ambito: 'cartella' }, { approvato: false, ambito: 'percorso' }, { approvato: false, ambito: 'volta' },
    { approvato: true, ambito: 'gruppo' }, { approvato: false, ambito: 'strumento', nome: 'shell' }, { approvato: false, ambito: 'risposta', motivo: 'x' },
  ]) {
    const r = await invia({ requestId: 'r1', ...corpo });
    assert.equal(r.status, 400, JSON.stringify(corpo));
  }
  assert.deepEqual(ricevute, []);
});

test('AB-S10: the route gives «Allow all» (`ambito: risposta`, yes) to the registry as it came, with its request', async (t) => {
  const { invia, ricevute } = await rotta(t);
  const r = await invia({ requestId: 'r7', approvato: true, ambito: 'risposta' });
  assert.equal(r.status, 200);
  assert.deepEqual(ricevute, [{ approvato: true, ambito: 'risposta' }]);
});

/* ── the reviewer's living mutants V12 (a group of one) and V13 (the scope on ApprovalResolved): each dies by two tests ─────────── */

const GRUPPO_DI_UNA = { totale: 1, chiamate: [{ toolCallId: 'c1', argomenti: { title: 'a' } }] };
for (const [nome, carta] of [['connector', CARTA_MCP], ['plugin', CARTA_PLUGIN]]) {
  test(`AB-S11 (${nome}): «for all» on a card whose group counts ONE call is refused, yes or no, and the card waits for the person`, async (t) => {
    const { registry, sessionId, requestId } = await scena(t, { ...carta, gruppo: GRUPPO_DI_UNA });
    for (const approvato of [true, false]) assert.equal(registry.rispondiApprovazione(sessionId, requestId, approvato, { ambito: 'risposta' }).code, 'QUERY_INVALID');
    assert.equal(registry.domandaInAttesa(sessionId)?.requestId, requestId);
  });
}

for (const approvato of [true, false]) {
  test(`AB-S12 (${approvato ? 'yes' : 'no'}): the event every client reads (ApprovalResolved) says the answer was «for all» (\`ambito: risposta\`)`, async (t) => {
    const { registry, sessionId, requestId, eventi, domanda } = await scena(t, { ...CARTA_MCP, gruppo: GRUPPO });
    assert.deepEqual(registry.rispondiApprovazione(sessionId, requestId, approvato, { ambito: 'risposta' }), { ok: true });
    await conTetto(domanda);
    const evento = eventi.find((e) => e.type === 'ApprovalResolved' && e.requestId === requestId);
    assert.equal(evento?.ambito, 'risposta', JSON.stringify(evento));
    assert.equal(evento?.approvato, approvato);
  });
}
