/*
 * Port of the long-task cards onto 0.2.3, reviewer finding R1 (17/11/2026): a call can be inside the limit of the group
 *   (`argomentiEntroLaCarta` counts characters) and still be CUT by the copy the card shows (`argomentiPerLaCarta`: depth beyond 8,
 *   or control characters, which the mask counts as JSON writes them, six each). The list of the card of several calls showed that
 *   call with «…» and no count of the cuts, while the card of one call says how many parts it left out. So a call whose shown copy
 *   is cut never enters a group: each call of that tool asks on its own card, with its count.
 *   As Hermes redacts before truncating and shows the truncation (`tools/mcp_tool_handlers.py:114`) and Codex shows every parameter
 *   of the approval, one line each (`codex-rs/tui/src/bottom_pane/mcp_server_elicitation.rs:499-503`).
 * Through the real kernel (`talosLavora`): fake model, fake tool, no key.
 */
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { argomentiEntroLaCarta, argomentiPerLaCarta, talosLavora } from '../src/kernel/talosHarness.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

const TOOL_MCP = [{ name: 'mcp__gh__op', serverId: 'gh', nomeOriginale: 'op', description: 'c', inputSchema: { type: 'object' }, annotations: { destructiveHint: false } }];
const tc = (id, args) => ({ id, type: 'function', function: { name: 'mcp__gh__op', arguments: JSON.stringify(args) } });
const CTL = '\u0001'.repeat(299);
const CASI = {
  'deeper than 8 levels': { a: { b: { c: { d: { e: { f: { g: { h: { i: { j: 'DELETE EVERYTHING' } } } } } } } } } },
  'control characters': { a: CTL, b: CTL, c: CTL, d: `${CTL.slice(0, 280)} rm -rf /` },
};

async function giro(t, primo, secondo) {
  const dir = mkdtempSync(join(tmpdir(), 'porto-gruppo-tagliato-'));
  t.after(() => { try { rimuoviCartellaDiProva(dir); } catch { /* already gone */ } });
  const risposte = [{ role: 'assistant', content: null, tool_calls: [tc('a1', primo), tc('a2', secondo)] }, { role: 'assistant', content: 'done', tool_calls: [] }];
  let n = 0;
  const chieste = [];
  const eseguite = [];
  await talosLavora({
    cartella: dir, task: { consegna: 'w' }, modello: 'x', chiave: 'finta', toolMcp: TOOL_MCP, livelloAccesso: 'scrittura-progetto',
    chiamaToolMcpFn: async (_nome, a) => { eseguite.push(a); return { content: [{ type: 'text', text: 'ok' }], isError: false }; },
    /* a host that answers «for all» ONLY to a card that carries the group: a card without it gets a plain yes for its own call */
    chiediApprovazioneFn: async (a) => { chieste.push(a); return a.gruppo ? { approvato: true, perTutteLeChiamate: true } : true; },
    fetchDiRete: async () => { const s = risposte[Math.min(n++, 1)]; return { ok: true, status: 200, json: async () => ({ choices: [{ message: s }], usage: { prompt_tokens: 1, completion_tokens: 1 } }), text: async () => '' }; },
  });
  return { carte: chieste.filter((a) => a.tipo === 'mcp_tool'), eseguite };
}

for (const [nome, tagliata] of Object.entries(CASI)) {
  test(`PCL-T1 (${nome}): a call whose shown copy is cut never enters a card of several calls`, async (t) => {
    assert.equal(argomentiEntroLaCarta(tagliata), true, 'premise: the call is inside the limit of the group');
    assert.ok(argomentiPerLaCarta(tagliata).tagliati > 0, 'premise: the copy the card shows is cut');
    const { carte, eseguite } = await giro(t, { title: 'one' }, tagliata);
    assert.equal(carte.length, 2, 'each call asks on its own card');
    assert.equal(carte.some((c) => c.gruppo !== undefined), false, 'no card carries a list of calls');
    assert.deepEqual(eseguite, [{ title: 'one' }, tagliata], 'both calls ran with their real arguments');
  });
}

test('PCL-T2 (opposite): two calls shown whole still ask on one card', async (t) => {
  const { carte, eseguite } = await giro(t, { title: 'one' }, { title: 'two', nested: { a: { b: 'c' } } });
  assert.equal(carte.length, 1, 'one card for both calls');
  assert.equal(carte[0].gruppo?.totale, 2);
  assert.equal(eseguite.length, 2);
});
