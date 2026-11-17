/*
 * Port of the long-task cards A and B onto 0.2.3 (16/11/2026): the card of several calls carries the arguments of EACH call masked,
 *   as the card of one call does since the twin repair of 0.2.2, round 3 (`argomentiPerLaCarta`, talosHarness.mjs). The branch was
 *   written before that repair and put `m.argomenti` (the real ones) in `azione.gruppo.chiamate`: after the merge the card of one
 *   call showed «[redacted]» while the list of the same card carried the password and the token in clear, in the question the
 *   registry broadcasts (ApprovalRequested: the stream, the journal, the phone). Measured on the merge before this fix: the list
 *   carried both. As Hermes masks before showing (`tools/mcp_tool_handlers.py:85`, `_mask_secret_fields`) and redacts before
 *   truncating (`:114`). The model and the executor keep the real arguments (the check on what ran).
 * Through the real kernel (`talosLavora`): fake model, fake tool, no key.
 */
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { talosLavora } from '../src/kernel/talosHarness.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

const SCHEMA = { type: 'object', properties: { title: { type: 'string' }, password: { type: 'string' } } };
const TOOL_MCP = [{ name: 'mcp__github__create_issue', serverId: 'github', nomeOriginale: 'create_issue', description: 'c', inputSchema: SCHEMA, annotations: { destructiveHint: false } }];
const SEGRETO = 'hunter2-only-for-this-test';
const TOKEN = `ghp_${'a1B2c3D4e5'.repeat(4)}`;
const tc = (id, args) => ({ id, type: 'function', function: { name: 'mcp__github__create_issue', arguments: JSON.stringify(args) } });

async function giro(t, risposta) {
  const dir = mkdtempSync(join(tmpdir(), 'porto-gruppo-oscurato-'));
  t.after(() => { try { rimuoviCartellaDiProva(dir); } catch { /* already gone */ } });
  const risposte = [{ role: 'assistant', content: null, tool_calls: [tc('a1', { title: `fix ${TOKEN}`, password: SEGRETO }), tc('a2', { title: 'two', password: SEGRETO })] },
    { role: 'assistant', content: 'done', tool_calls: [] }];
  let n = 0;
  const chieste = [];
  const eseguite = [];
  await talosLavora({
    cartella: dir, task: { consegna: 'w' }, modello: 'x', chiave: 'finta', toolMcp: TOOL_MCP, livelloAccesso: 'scrittura-progetto',
    chiamaToolMcpFn: async (_nome, a) => { eseguite.push(a); return { content: [{ type: 'text', text: 'ok' }], isError: false }; },
    chiediApprovazioneFn: async (a) => { chieste.push(a); return risposta; },
    fetchDiRete: async () => { const s = risposte[Math.min(n++, 1)]; return { ok: true, status: 200, json: async () => ({ choices: [{ message: s }], usage: { prompt_tokens: 1, completion_tokens: 1 } }), text: async () => '' }; },
  });
  return { carte: chieste.filter((a) => a.tipo === 'mcp_tool'), eseguite };
}

test('PCL-G1: the list of a card of several calls never carries a secret the card of one call masks', async (t) => {
  const { carte } = await giro(t, false);
  const carta = carte[0];
  assert.equal(carta?.gruppo?.totale, 2, 'premise: one card for the two equal calls');
  const testo = JSON.stringify(carta);
  assert.equal(testo.includes(SEGRETO), false, 'the password is masked everywhere in the question');
  assert.equal(testo.includes(TOKEN), false, 'the token is masked everywhere in the question');
  assert.deepEqual(carta.gruppo.chiamate.map((c) => c.toolCallId), ['a1', 'a2']);
  assert.deepEqual(carta.gruppo.chiamate[0].argomenti, carta.argomenti, 'the first call of the list reads as the card of that call');
  assert.equal(carta.gruppo.chiamate[1].argomenti.title, 'two', 'what is no secret stays readable');
});

test('PCL-G2 (opposite): «allow all» still runs every call with its REAL arguments', async (t) => {
  const { carte, eseguite } = await giro(t, { approvato: true, perTutteLeChiamate: true });
  assert.equal(carte.length, 1, 'one card for both calls');
  assert.deepEqual(eseguite, [{ title: `fix ${TOKEN}`, password: SEGRETO }, { title: 'two', password: SEGRETO }]);
});
