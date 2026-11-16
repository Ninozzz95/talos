/*
 * P018 round 2 (owner 11/11/2026 13:08-13:10 via judge v1458; 13:34 «Sì, stessa cura» for Forge; 13:50 v1465 «Come Claude Code»).
 * - A plugin tool and a Tool Forge tool ran WITHOUT the gate (`talosHarness.mjs`, plugin and Forge branches): they pass the same gate
 *   as an MCP tool now. Card in «Read only», «On request» and by default; none in «Full access»; «for this tool» on the pair, with the
 *   kind in the key (a plugin «github» is not the connector «github»).
 * - «Read only»: a card «only once» instead of the refusal, for MCP, plugin and Forge; no «for this tool» there; a no is not asked again
 *   for the same call in the same turn.
 * - «Like Claude Code» (13:50): in «Read only» an MCP tool that its server declares read-only when it connects (`readOnlyHint`) runs
 *   without a card. The sign counts ONLY in «Read only»; a sign that changes after the first use brings the card back.
 * - The phone (until it draws server and tool): an outside-tool card offers only «once» and «No» (`sempreNonBasta`), the PC keeps its
 *   «for this tool» outside «Read only».
 */
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import * as K from '../src/kernel/talosHarness.mjs';
import { createSessionRegistry } from '../src/session-registry.mjs';
import { attendiScritture } from '../src/session-store.mjs';
import { preparaToolMcpPerSessione } from '../src/mcp-session.mjs';
import { preparaToolPluginPerSessione } from '../src/plugin-session.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

const { talosLavora } = K;
const chiaveMcp = (server, attrezzo) => JSON.stringify([server, attrezzo]);
const chiaveTipo = (tipo, origine, attrezzo) => JSON.stringify([tipo, origine, attrezzo]);

const TOOL_MCP = [
  { name: 'mcp__github__create_issue', serverId: 'github', nomeOriginale: 'create_issue', description: 'opens an issue', inputSchema: { type: 'object', properties: { title: { type: 'string' } } } },
  { name: 'mcp__github__list_issues', serverId: 'github', nomeOriginale: 'list_issues', description: 'lists issues', inputSchema: { type: 'object', properties: {} } },
];
/* `segno` undefined = the server declares no sign at all (no `annotations`) */
const MCP_DI_LETTURA = (segno) => TOOL_MCP.map((t) => (t.nomeOriginale === 'list_issues' && segno !== undefined ? { ...t, annotations: { readOnlyHint: segno } } : t));
const TOOL_PLUGIN = [
  { nome: 'plugin__lint__check', pluginId: 'lint', nomeOriginale: 'check', descrizione: 'checks the code', parametri: { type: 'object', properties: {} } },
  { nome: 'plugin__lint__fix', pluginId: 'lint', nomeOriginale: 'fix', descrizione: 'fixes the code', parametri: { type: 'object', properties: {} } },
  { nome: 'plugin__github__create_issue', pluginId: 'github', nomeOriginale: 'create_issue', descrizione: 'opens an issue', parametri: { type: 'object', properties: {} } },
];
const TOOL_FORGE = [
  { name: 'forge_daily_note', description: 'writes the daily note', inputSchema: { type: 'object', properties: {} } },
  { name: 'forge_weekly_tasks', description: 'lists the week', inputSchema: { type: 'object', properties: {} } },
];
const FINE = { role: 'assistant', content: 'done', tool_calls: [] };
const chiama = (id, nome, argomenti = {}) => ({ role: 'assistant', content: null, tool_calls: [{ id, type: 'function', function: { name: nome, arguments: JSON.stringify(argomenti) } }] });

function cartella(t) {
  const c = mkdtempSync(join(tmpdir(), 'p018-g2-'));
  t.after(() => { try { rimuoviCartellaDiProva(c); } catch { /* already gone */ } });
  return c;
}

/** One turn with MCP, plugin and Forge tools. `ospite(azione)` answers every card; `null` = no channel. */
async function giro(t, { chiamate, ospite = async () => true, toolMcp = TOOL_MCP, ...altro }) {
  const dir = cartella(t);
  const risposte = [...chiamate.map(([id, nome, argomenti]) => chiama(id, nome, argomenti)), FINE];
  const corpi = [], chieste = [], eseguite = [];
  await talosLavora({
    cartella: dir, task: { consegna: 'work' }, modello: 'x', chiave: 'finta', toolMcp, toolPlugin: TOOL_PLUGIN, toolForge: TOOL_FORGE,
    chiamaToolMcpFn: async (nome) => { eseguite.push(nome); return { content: [{ type: 'text', text: `ok from ${nome}` }], isError: false }; },
    eseguiToolPluginFn: async (nome) => { eseguite.push(nome); return `ok from ${nome}`; },
    eseguiToolForgeFn: async (nome) => { eseguite.push(nome); return { status: 'succeeded', output: `ok from ${nome}` }; },
    ...(ospite === null ? {} : { chiediApprovazioneFn: async (a) => { chieste.push(a); return ospite(a); } }),
    fetchDiRete: async (_u, o) => {
      const scelta = risposte[Math.min(corpi.length, risposte.length - 1)];
      corpi.push(JSON.parse(o.body));
      return { ok: true, status: 200, json: async () => ({ choices: [{ message: scelta }], usage: { prompt_tokens: 1, completion_tokens: 1 } }), text: async () => '' };
    },
    ...altro,
  });
  const esiti = corpi.at(-1).messages.filter((m) => m.role === 'tool').map((m) => String(m.content));
  const DI_FUORI = new Set(['mcp_tool', 'plugin_tool', 'forge_tool']);
  return { chieste, carte: chieste.filter((a) => DI_FUORI.has(a.tipo)), esiti, eseguite };
}

/* ── plugin ─────────────────────────────────────────────────────────────────────────────────────────────────────────────── */

test('G2-01: plugin, by default: a card that names plugin and tool; a no means the plugin never runs', async (t) => {
  const r = await giro(t, { livelloAccesso: 'scrittura-progetto', ospite: async () => false, chiamate: [['p1', 'plugin__lint__check']] });
  assert.equal(r.carte.length, 1, JSON.stringify(r.chieste));
  const carta = r.carte[0];
  assert.equal(carta.tipo, 'plugin_tool');
  assert.equal(carta.plugin, 'lint');
  assert.equal(carta.attrezzo, 'check');
  assert.equal(carta.toolCallId, 'p1');
  assert.equal(carta.fraseChiave, 'server.approval.pluginTool');
  assert.match(carta.frase, /«check»/u);
  assert.match(carta.frase, /«lint»/u);
  assert.notEqual(carta.soloUnaVolta, true, 'outside Read only the card can keep a yes for the tool');
  assert.deepEqual(r.eseguite, []);
  assert.match(r.esiti[0], /^(REFUSED|DECLINED)/u);
  assert.match(r.esiti[0], /lint/u);
});

test('G2-02: plugin, «On request»: a card; with a yes it runs', async (t) => {
  const r = await giro(t, { livelloAccesso: 'su-richiesta', chiamate: [['p1', 'plugin__lint__check']] });
  assert.equal(r.carte.length, 1);
  assert.deepEqual(r.eseguite, ['plugin__lint__check']);
});

test('G2-03: plugin and Forge, «Full access»: like the other tools, no card', async (t) => {
  const r = await giro(t, { livelloAccesso: 'accesso-pieno', chiamate: [['p1', 'plugin__lint__check'], ['f1', 'forge_daily_note']] });
  assert.deepEqual(r.chieste, []);
  assert.deepEqual(r.eseguite, ['plugin__lint__check', 'forge_daily_note']);
});

test('G2-04: «for this tool» on a plugin is the (plugin, tool) pair, with the kind: same tool silent, other tool asks, same name elsewhere asks', async (t) => {
  for (const livelloAccesso of ['scrittura-progetto', 'su-richiesta']) {
    const r = await giro(t, {
      livelloAccesso,
      consensiSessione: { attrezziMcpConsentiti: [chiaveTipo('plugin_tool', 'lint', 'check'), chiaveMcp('github', 'create_issue')] },
      chiamate: [
        ['p1', 'plugin__lint__check'], ['p2', 'plugin__lint__check'], ['p3', 'plugin__lint__fix'],
        ['p4', 'plugin__github__create_issue'], // the connector «github» has the yes for create_issue: a plugin «github» does not
      ],
    });
    assert.deepEqual(r.carte.map((a) => [a.tipo, a.plugin, a.attrezzo]), [['plugin_tool', 'lint', 'fix'], ['plugin_tool', 'github', 'create_issue']], livelloAccesso);
    assert.equal(r.eseguite.length, 4, livelloAccesso);
  }
  /* and the other way round: the yes of the plugin «github» does not open the connector «github» */
  const r = await giro(t, {
    livelloAccesso: 'scrittura-progetto', consensiSessione: { attrezziMcpConsentiti: [chiaveTipo('plugin_tool', 'github', 'create_issue')] },
    ospite: async () => false, chiamate: [['c1', 'mcp__github__create_issue']],
  });
  assert.deepEqual(r.carte.map((a) => a.tipo), ['mcp_tool']);
});

test('G2-05: plugin and Forge without a channel to ask (an automation): refused, never run in silence', async (t) => {
  const r = await giro(t, { livelloAccesso: 'scrittura-progetto', ospite: null, chiamate: [['p1', 'plugin__lint__check'], ['f1', 'forge_daily_note']] });
  assert.deepEqual(r.eseguite, []);
  assert.match(r.esiti[0], /^REFUSED/u);
  assert.match(r.esiti[1], /^REFUSED/u);
});

test('G2-06: plugin trifecta: private data seen, then the plugin twice with a kept yes: the second call asks again', async (t) => {
  const sicurezza = K.SICUREZZA_PER_ATTREZZO.plugin_tool;
  assert.ok(sicurezza, 'the plugin tool is in the security catalog');
  assert.equal(sicurezza.readsUntrustedContent, true);
  assert.equal(sicurezza.canTransmit, true);
  const r = await giro(t, {
    livelloAccesso: 'scrittura-progetto', consensiSessione: { attrezziMcpConsentiti: [chiaveTipo('plugin_tool', 'lint', 'check')] },
    chiamate: [['w1', 'scrivi', { percorso: 'note.txt', contenuto: 'privato' }], ['p1', 'plugin__lint__check'], ['p2', 'plugin__lint__check']],
  });
  assert.deepEqual(r.carte.map((a) => [a.toolCallId, a.trifecta === true]), [['p2', true]]);
});

test('G2-07: plugin-session passes the plugin id and the original name with each tool (never cut from the exposed name)', async () => {
  const { toolPlugin } = await preparaToolPluginPerSessione({ cartella: '/tmp/x', cartellaTrust: '/tmp/t' }, {
    caricaPluginFn: async () => ({ plugin: [{ id: 'a__b', hash: 'h', tools: [{ nome: 'c', descrizione: 'd', parametri: {}, comando: 'node x.js' }], hooks: [] }], falliti: [] }),
    verificaTrustPluginFn: async () => true,
    eseguiComandoPluginFn: async () => 'ok',
  });
  assert.deepEqual(toolPlugin.map((t) => [t.nome, t.pluginId, t.nomeOriginale]), [['plugin__a__b__c', 'a__b', 'c']]);
});

/* ── Forge ──────────────────────────────────────────────────────────────────────────────────────────────────────────────── */

test('G2-10: Forge asks by default, on «On request» and in «Read only»; «for this tool» holds for that forged tool only', async (t) => {
  for (const livelloAccesso of ['scrittura-progetto', 'su-richiesta', 'lettura']) {
    const r = await giro(t, { livelloAccesso, ospite: async () => false, chiamate: [['f1', 'forge_daily_note']] });
    assert.equal(r.carte.length, 1, livelloAccesso);
    assert.equal(r.carte[0].tipo, 'forge_tool', livelloAccesso);
    assert.equal(r.carte[0].attrezzo, 'daily_note', livelloAccesso);
    assert.deepEqual(r.eseguite, [], livelloAccesso);
  }
  const r = await giro(t, {
    livelloAccesso: 'scrittura-progetto', consensiSessione: { attrezziMcpConsentiti: [chiaveTipo('forge_tool', null, 'daily_note')] },
    chiamate: [['f1', 'forge_daily_note'], ['f2', 'forge_weekly_tasks']],
  });
  assert.deepEqual(r.carte.map((a) => a.attrezzo), ['weekly_tasks']);
  assert.deepEqual(r.eseguite, ['forge_daily_note', 'forge_weekly_tasks']);
});

/* ── «Read only»: a card «only once» ─────────────────────────────────────────────────────────────────────────────────────── */

test('G2-20: «Read only», MCP and plugin: a card «only once» with the Read-only sentence; yes runs, no does not', async (t) => {
  const si = await giro(t, { livelloAccesso: 'lettura', chiamate: [['c1', 'mcp__github__create_issue'], ['p1', 'plugin__lint__check']] });
  assert.deepEqual(si.carte.map((a) => [a.tipo, a.soloUnaVolta]), [['mcp_tool', true], ['plugin_tool', true]]);
  assert.equal(si.carte[0].fraseChiave, 'server.approval.mcpToolReadOnly');
  assert.match(si.carte[0].frase, /Read only/u);
  assert.match(si.carte[0].frase, /outside this PC/u);
  assert.equal(si.carte[1].fraseChiave, 'server.approval.pluginToolReadOnly');
  assert.match(si.carte[1].frase, /outside it/u);
  assert.deepEqual(si.eseguite, ['mcp__github__create_issue', 'plugin__lint__check']);
  const no = await giro(t, { livelloAccesso: 'lettura', ospite: async () => false, chiamate: [['c1', 'mcp__github__create_issue'], ['p1', 'plugin__lint__check']] });
  assert.equal(no.carte.length, 2);
  assert.deepEqual(no.eseguite, []);
});

test('G2-21: «Read only» with a remembered yes for the tool: the card is there all the same', async (t) => {
  const r = await giro(t, {
    livelloAccesso: 'lettura', ospite: async () => false,
    consensiSessione: { attrezziMcpConsentiti: [chiaveMcp('github', 'create_issue'), chiaveTipo('plugin_tool', 'lint', 'check')] },
    chiamate: [['c1', 'mcp__github__create_issue'], ['p1', 'plugin__lint__check']],
  });
  assert.deepEqual(r.carte.map((a) => [a.tipo, a.soloUnaVolta]), [['mcp_tool', true], ['plugin_tool', true]]);
  assert.deepEqual(r.eseguite, []);
});

test('G2-22: «Read only», a no is not asked again in the turn: the same call gets the no at once, another call asks', async (t) => {
  const r = await giro(t, {
    livelloAccesso: 'lettura', ospite: async () => false,
    chiamate: [
      ['c1', 'mcp__github__create_issue', { title: 'a' }], ['c2', 'mcp__github__create_issue', { title: 'a' }],
      ['c3', 'mcp__github__create_issue', { title: 'b' }],
      ['p1', 'plugin__lint__check'], ['p2', 'plugin__lint__check'],
    ],
  });
  assert.deepEqual(r.carte.map((a) => a.toolCallId), ['c1', 'c3', 'p1']);
  assert.deepEqual(r.eseguite, []);
  assert.match(r.esiti[1], /^(REFUSED|DECLINED)/u);
  assert.match(r.esiti[4], /^(REFUSED|DECLINED)/u);
});

test('G2-23: «Research» and workspace-only writes still refuse an outside tool, with no card', async (t) => {
  for (const livelloAccesso of ['ricerca', 'scrittura-area']) {
    const r = await giro(t, { livelloAccesso, chiamate: [['c1', 'mcp__github__create_issue'], ['p1', 'plugin__lint__check'], ['f1', 'forge_daily_note']] });
    assert.deepEqual(r.chieste, [], livelloAccesso);
    assert.deepEqual(r.eseguite, [], livelloAccesso);
  }
});

test('G2-24: «Read only» with nobody to ask: refused', async (t) => {
  const r = await giro(t, { livelloAccesso: 'lettura', ospite: null, chiamate: [['c1', 'mcp__github__create_issue'], ['p1', 'plugin__lint__check']] });
  assert.deepEqual(r.eseguite, []);
  assert.match(r.esiti[0], /^REFUSED/u);
});

/* ── «Read only», like Claude Code: the read-only sign of the server ─────────────────────────────────────────────────────── */

test('G2-30: «Read only»: an MCP tool its server declares read-only runs without a card; the other tools of the server keep the card', async (t) => {
  const r = await giro(t, { livelloAccesso: 'lettura', toolMcp: MCP_DI_LETTURA(true), ospite: async () => false, chiamate: [['c1', 'mcp__github__list_issues'], ['c2', 'mcp__github__create_issue']] });
  assert.deepEqual(r.carte.map((a) => a.toolCallId), ['c2']);
  assert.deepEqual(r.eseguite, ['mcp__github__list_issues']);
});

test('G2-31: the sign counts ONLY in «Read only»: by default and on «On request» a declared read-only tool still asks', async (t) => {
  for (const livelloAccesso of ['scrittura-progetto', 'su-richiesta']) {
    const r = await giro(t, { livelloAccesso, toolMcp: MCP_DI_LETTURA(true), ospite: async () => false, chiamate: [['c1', 'mcp__github__list_issues']] });
    assert.equal(r.carte.length, 1, livelloAccesso);
    assert.deepEqual(r.eseguite, [], livelloAccesso);
  }
});

test('G2-32: only a declared `readOnlyHint: true` counts: false, a string, or no sign keep the card', async (t) => {
  for (const segno of [false, 'true', undefined]) {
    const r = await giro(t, { livelloAccesso: 'lettura', toolMcp: MCP_DI_LETTURA(segno), ospite: async () => false, chiamate: [['c1', 'mcp__github__list_issues']] });
    assert.equal(r.carte.length, 1, String(segno));
  }
});

test('G2-33: a sign that changes after the first use brings the card back, and keeps it (a reconnection that says something else)', async (t) => {
  const consensiSessione = {};
  const primo = await giro(t, { livelloAccesso: 'lettura', consensiSessione, toolMcp: MCP_DI_LETTURA(true), ospite: async () => false, chiamate: [['c1', 'mcp__github__list_issues']] });
  assert.deepEqual(primo.carte, []);
  const cambiato = await giro(t, { livelloAccesso: 'lettura', consensiSessione, toolMcp: MCP_DI_LETTURA(false), ospite: async () => false, chiamate: [['c2', 'mcp__github__list_issues']] });
  assert.equal(cambiato.carte.length, 1);
  const tornato = await giro(t, { livelloAccesso: 'lettura', consensiSessione, toolMcp: MCP_DI_LETTURA(true), ospite: async () => false, chiamate: [['c3', 'mcp__github__list_issues']] });
  assert.equal(tornato.carte.length, 1, 'once changed, the sign is not trusted again in this conversation');
  /* first use without the sign, then the server starts to declare it: that is a change too */
  const altro = {};
  await giro(t, { livelloAccesso: 'lettura', consensiSessione: altro, toolMcp: MCP_DI_LETTURA(undefined), chiamate: [['c1', 'mcp__github__list_issues']] });
  const dopo = await giro(t, { livelloAccesso: 'lettura', consensiSessione: altro, toolMcp: MCP_DI_LETTURA(true), ospite: async () => false, chiamate: [['c2', 'mcp__github__list_issues']] });
  assert.equal(dopo.carte.length, 1);
});

test('G2-34: mcp-session passes the read-only sign the server declared when it connected, and the model never receives it', async () => {
  const { toolMcp } = await preparaToolMcpPerSessione({ cartella: '/tmp/x', cartellaTrust: '/tmp/t' }, {
    serverMcpFidatiFn: async () => ({ fidati: [{ id: 'github', comando: 'npx', argomenti: [], allowlist: ['list_issues', 'create_issue'], hash: 'h' }], nonFidati: [] }),
    connettiServerMcpFn: async () => ({ client: {}, chiudi: async () => {} }),
    elencaToolMcpFn: async () => [
      { name: 'list_issues', description: 'l', inputSchema: { type: 'object' }, annotations: { readOnlyHint: true, title: 'x' } },
      { name: 'create_issue', description: 'c', inputSchema: { type: 'object' }, annotations: { readOnlyHint: 'yes' } },
    ],
    filtraToolMcpFn: (tool, allowlist) => tool.filter((x) => allowlist.includes(x.name)),
  });
  assert.deepEqual(toolMcp.map((x) => [x.nomeOriginale, x.annotations?.readOnlyHint === true]), [['list_issues', true], ['create_issue', false]]);
  assert.equal(toolMcp[0].annotations.title, undefined, 'only the sign travels, nothing else the server wrote');
  /* the model: name, description, schema; no annotations */
  const corpi = [];
  const dir = mkdtempSync(join(tmpdir(), 'p018-g2-'));
  try {
    await talosLavora({
      cartella: dir, task: { consegna: 'x' }, modello: 'x', chiave: 'finta', toolMcp, chiamaToolMcpFn: async () => ({ content: [], isError: false }),
      fetchDiRete: async (_u, o) => { corpi.push(JSON.parse(o.body)); return { ok: true, status: 200, json: async () => ({ choices: [{ message: FINE }], usage: { prompt_tokens: 1, completion_tokens: 1 } }), text: async () => '' }; },
    });
  } finally { rimuoviCartellaDiProva(dir); }
  assert.doesNotMatch(JSON.stringify(corpi[0].tools ?? []), /readOnlyHint|annotations/u);
});

/* ── the server and the phone ───────────────────────────────────────────────────────────────────────────────────────────── */

async function scena(t) {
  const cartellaStore = mkdtempSync(join(tmpdir(), 'p018-g2-server-'));
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
  return { registro, sessionId, ricevuti, input: runs[0].input };
}
async function domanda(s, azione) {
  const promessa = s.input.chiediApprovazioneFn(azione);
  await new Promise((r) => setTimeout(r, 10));
  const requestId = s.registro.domandaInAttesa(s.sessionId)?.requestId;
  assert.ok(requestId, 'premise: an open question');
  return { promessa, requestId, evento: s.ricevuti.find((e) => e.type === 'ApprovalRequested' && e.requestId === requestId) };
}
const consentiti = (input) => [...(input.consensiSessione?.attrezziMcpConsentiti ?? [])];
const CARTA_PLUGIN = { tipo: 'plugin_tool', toolCallId: 'p1', nome: 'plugin__lint__check', plugin: 'lint', attrezzo: 'check' };
const CARTA_FORGE = { tipo: 'forge_tool', toolCallId: 'f1', nome: 'forge_daily_note', attrezzo: 'daily_note' };
const CARTA_MCP = { tipo: 'mcp_tool', toolCallId: 'c1', nome: 'mcp__github__create_issue', server: 'github', attrezzo: 'create_issue' };

test('G2-40: «for this tool» on a plugin or Forge card keeps the typed pair from the QUESTION, never from the client', async (t) => {
  const s = await scena(t);
  const p = await domanda(s, CARTA_PLUGIN);
  assert.deepEqual(s.registro.rispondiApprovazione(s.sessionId, p.requestId, true, { ambito: 'strumento', nome: 'plugin__other__x' }), { ok: true });
  assert.equal(await p.promessa, true);
  const f = await domanda(s, CARTA_FORGE);
  assert.deepEqual(s.registro.rispondiApprovazione(s.sessionId, f.requestId, true, { ambito: 'strumento' }), { ok: true });
  await f.promessa;
  assert.deepEqual(consentiti(s.input), [chiaveTipo('plugin_tool', 'lint', 'check'), chiaveTipo('forge_tool', null, 'daily_note')]);
});

test('G2-41: a «Read only» card (only once) refuses «for this tool» on the server, and nothing is remembered', async (t) => {
  const s = await scena(t);
  for (const carta of [{ ...CARTA_MCP, soloUnaVolta: true }, { ...CARTA_PLUGIN, toolCallId: 'p2', soloUnaVolta: true }]) {
    const d = await domanda(s, carta);
    assert.equal(s.registro.rispondiApprovazione(s.sessionId, d.requestId, true, { ambito: 'strumento' }).code, 'QUERY_INVALID', carta.tipo);
    assert.deepEqual(s.registro.rispondiApprovazione(s.sessionId, d.requestId, true), { ok: true });
    assert.equal(await d.promessa, true);
  }
  assert.deepEqual(consentiti(s.input), []);
});

test('G2-42: the phone gets the card of a plugin, Forge and MCP tool with plugin or server and tool, and only «once» and «No» (sempreNonBasta)', async (t) => {
  const s = await scena(t);
  for (const carta of [CARTA_PLUGIN, CARTA_FORGE, CARTA_MCP]) {
    const d = await domanda(s, carta);
    assert.equal(d.evento?.azione?.tipo, carta.tipo);
    assert.equal(d.evento?.azione?.attrezzo, carta.attrezzo);
    if (carta.plugin) assert.equal(d.evento.azione.plugin, carta.plugin);
    if (carta.server) assert.equal(d.evento.azione.server, carta.server);
    assert.equal(d.evento?.azione?.sempreNonBasta, true, `${carta.tipo}: the phone shows no «for this session» it cannot keep`);
    s.registro.rispondiApprovazione(s.sessionId, d.requestId, false);
    await d.promessa;
  }
});
