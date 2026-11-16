/*
 * P018 in 0.2.2 (owner 12/11/2026 19:21; judge v1505 of 11/11 17:40, still binding):
 * (a) A «No» for the same call (same tool, same arguments) is not asked again in the same turn, in EVERY mode, as it already was in
 *     «Read only». It gives no permission: it only removes a duplicate card; the automatic refusal tells the model the person already
 *     said no. A call with other arguments still asks; a yes is never remembered by this; a new turn asks again.
 * (b) D8: «Allow all» (the sum of «once», `approvabileFuori`) never counts a card of an outside tool (connector, plugin, Tool Forge),
 *     on purpose and not because today's card happens to carry no command, path or address.
 */
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { talosLavora } from '../src/kernel/talosHarness.mjs';
import { approvabileFuori, datoDellAzione } from '../src/approvabile-fuori.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

const TOOL_MCP = [
  { name: 'mcp__github__create_issue', serverId: 'github', nomeOriginale: 'create_issue', description: 'opens an issue', inputSchema: { type: 'object', properties: { title: { type: 'string' } } } },
];
const TOOL_PLUGIN = [
  { nome: 'plugin__lint__check', pluginId: 'lint', nomeOriginale: 'check', descrizione: 'checks the code', parametri: { type: 'object', properties: { file: { type: 'string' } } } },
];
const TOOL_FORGE = [
  { name: 'forge_daily_note', description: 'writes the daily note', inputSchema: { type: 'object', properties: { day: { type: 'string' } } } },
];
const FINE = { role: 'assistant', content: 'done', tool_calls: [] };
const chiama = (id, nome, argomenti = {}) => ({ role: 'assistant', content: null, tool_calls: [{ id, type: 'function', function: { name: nome, arguments: JSON.stringify(argomenti) } }] });
const DI_FUORI = new Set(['mcp_tool', 'plugin_tool', 'forge_tool']);

/** One turn (one talosLavora) with an MCP, a plugin and a Forge tool. `ospite(azione)` answers every card. */
async function giro(t, { chiamate, ospite = async () => false, ...altro }) {
  const dir = mkdtempSync(join(tmpdir(), 'p018-022-'));
  t.after(() => { try { rimuoviCartellaDiProva(dir); } catch { /* already gone */ } });
  const risposte = [...chiamate.map(([id, nome, argomenti]) => chiama(id, nome, argomenti)), FINE];
  const corpi = [], chieste = [], eseguite = [];
  await talosLavora({
    cartella: dir, task: { consegna: 'work' }, modello: 'x', chiave: 'finta', toolMcp: TOOL_MCP, toolPlugin: TOOL_PLUGIN, toolForge: TOOL_FORGE,
    chiamaToolMcpFn: async (nome) => { eseguite.push(nome); return { content: [{ type: 'text', text: `ok from ${nome}` }], isError: false }; },
    eseguiToolPluginFn: async (nome) => { eseguite.push(nome); return `ok from ${nome}`; },
    eseguiToolForgeFn: async (nome) => { eseguite.push(nome); return { status: 'succeeded', output: `ok from ${nome}` }; },
    chiediApprovazioneFn: async (a) => { chieste.push(a); return ospite(a); },
    fetchDiRete: async (_u, o) => {
      const scelta = risposte[Math.min(corpi.length, risposte.length - 1)];
      corpi.push(JSON.parse(o.body));
      return { ok: true, status: 200, json: async () => ({ choices: [{ message: scelta }], usage: { prompt_tokens: 1, completion_tokens: 1 } }), text: async () => '' };
    },
    ...altro,
  });
  const esiti = corpi.at(-1).messages.filter((m) => m.role === 'tool').map((m) => String(m.content));
  return { carte: chieste.filter((a) => DI_FUORI.has(a.tipo)), esiti, eseguite };
}

const STESSE_DUE_VOLTE = [
  ['c1', 'mcp__github__create_issue', { title: 'a' }], ['c2', 'mcp__github__create_issue', { title: 'a' }],
  ['p1', 'plugin__lint__check', { file: 'x.js' }], ['p2', 'plugin__lint__check', { file: 'x.js' }],
  ['f1', 'forge_daily_note', { day: 'mon' }], ['f2', 'forge_daily_note', { day: 'mon' }],
];

/* ── (a) the No is not asked twice ─────────────────────────────────────────────────────────────────────────────────────────── */

for (const livelloAccesso of ['scrittura-progetto', 'su-richiesta']) {
  test(`P022-A1 (${livelloAccesso}): after a No, the same call in the same turn gets the No at once, no second card, never run`, async (t) => {
    const r = await giro(t, { livelloAccesso, chiamate: STESSE_DUE_VOLTE });
    assert.deepEqual(r.carte.map((a) => a.toolCallId), ['c1', 'p1', 'f1']);
    assert.deepEqual(r.eseguite, []);
    for (const i of [1, 3, 5]) {
      assert.match(r.esiti[i], /^REFUSED/u, r.esiti[i]);
      assert.match(r.esiti[i], /the person already said no to this same call in this turn/u, r.esiti[i]);
    }
  });
}

test('P022-A2: a call with other arguments still asks after a No (default and «On request»)', async (t) => {
  for (const livelloAccesso of ['scrittura-progetto', 'su-richiesta']) {
    const r = await giro(t, {
      livelloAccesso,
      chiamate: [
        ['c1', 'mcp__github__create_issue', { title: 'a' }], ['c2', 'mcp__github__create_issue', { title: 'b' }],
        ['p1', 'plugin__lint__check', { file: 'x.js' }], ['p2', 'plugin__lint__check', { file: 'y.js' }],
        ['f1', 'forge_daily_note', { day: 'mon' }], ['f2', 'forge_daily_note', { day: 'tue' }],
      ],
    });
    assert.deepEqual(r.carte.map((a) => a.toolCallId), ['c1', 'c2', 'p1', 'p2', 'f1', 'f2'], livelloAccesso);
  }
});

test('P022-A3: it gives no permission — a yes «once» is not remembered: the same call asks again and runs again', async (t) => {
  const r = await giro(t, { livelloAccesso: 'scrittura-progetto', ospite: async () => true, chiamate: STESSE_DUE_VOLTE });
  assert.deepEqual(r.carte.map((a) => a.toolCallId), ['c1', 'c2', 'p1', 'p2', 'f1', 'f2']);
  assert.equal(r.eseguite.length, 6);
});

test('P022-A4: the No lasts the turn only: a new turn asks again for the same call', async (t) => {
  /* the same conversation: the yeses «for this tool» live in `consensiSessione`, the No of a turn must not */
  const consensiSessione = {};
  const uno = await giro(t, { livelloAccesso: 'scrittura-progetto', consensiSessione, chiamate: [['c1', 'mcp__github__create_issue', { title: 'a' }]] });
  const due = await giro(t, { livelloAccesso: 'scrittura-progetto', consensiSessione, chiamate: [['c1', 'mcp__github__create_issue', { title: 'a' }]] });
  assert.equal(uno.carte.length, 1);
  assert.equal(due.carte.length, 1);
});

test('P022-A5: «Read only» keeps the same behaviour, with the same words to the model', async (t) => {
  const r = await giro(t, { livelloAccesso: 'lettura', chiamate: STESSE_DUE_VOLTE });
  assert.deepEqual(r.carte.map((a) => a.toolCallId), ['c1', 'p1', 'f1']);
  assert.deepEqual(r.eseguite, []);
  assert.match(r.esiti[1], /the person already said no to this same call in this turn/u, r.esiti[1]);
});

/* ── (b) D8: «Allow all» never counts an outside-tool card ─────────────────────────────────────────────────────────────────── */

test('P022-B1: an outside-tool card is never «approvable outside», even if it carried a command or a path', () => {
  for (const tipo of ['mcp_tool', 'plugin_tool', 'forge_tool']) {
    for (const dato of [{ percorso: 'src/a.js' }, { comando: 'ls' }]) {
      const azione = { tipo, server: 'github', plugin: 'lint', attrezzo: 'create_issue', ...dato };
      assert.equal(approvabileFuori(azione, datoDellAzione(azione)), false, `${tipo} ${JSON.stringify(dato)}`);
    }
  }
  /* the control: the same path on a file card is approvable, so B1 is not the «no data» case */
  const scrivi = { tipo: 'scrivi', percorso: 'src/a.js' };
  assert.equal(approvabileFuori(scrivi, datoDellAzione(scrivi)), true);
});

test('P022-B2: the cards the kernel really builds for the three kinds are not «approvable outside»', async (t) => {
  const r = await giro(t, { livelloAccesso: 'scrittura-progetto', chiamate: [['c1', 'mcp__github__create_issue', { title: 'a' }], ['p1', 'plugin__lint__check', { file: 'x.js' }], ['f1', 'forge_daily_note', { day: 'mon' }]] });
  assert.deepEqual(r.carte.map((a) => a.tipo), ['mcp_tool', 'plugin_tool', 'forge_tool']);
  for (const a of r.carte) assert.equal(approvabileFuori(a, datoDellAzione(a)), false, a.tipo);
});
