/*
 * G02 feature 4 (CLI lane 6167226e9 + 872fe5502): a tool call the kernel cancelled ('tool-annullato': the run stopped
 * before it ran) reaches the UI with the explicit `outcome: 'cancelled'` on its ToolCallResult, next to the existing
 * `isError: true`. The desktop has `outcome` on RunFinished only; the CLI draws "cancelled" instead of "failed" for that row.
 * Only the value 'cancelled' is carried; any other value, or none, leaves the event unchanged.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {tmpdir} from 'node:os';
import {toolCallResult, eventoPerEsitoTool} from '../src/agui-events.mjs';
import {avviaSessione} from '../src/agent-service.mjs';

test('G02-4 toolCallResult carries only outcome "cancelled"', () => {
  assert.equal(toolCallResult({messageId: 'm', toolCallId: 'c', content: 'x', outcome: 'cancelled'}).outcome, 'cancelled');
  for (const other of [undefined, 'failed', 'ok', true]) assert.equal('outcome' in toolCallResult({messageId: 'm', toolCallId: 'c', content: 'x', outcome: other}), false, String(other));
  assert.equal(eventoPerEsitoTool({messageId: 'm', toolCallId: 'c', content: 'x', outcome: 'cancelled'}).outcome, 'cancelled', 'the helper forwards it');
});

test('G02-4 a cancelled tool call is marked cancelled; a normal result is not', async () => {
  const events = [];
  await avviaSessione({cartella: tmpdir(), task: {consegna: 'x'}, modello: 'm', chiave: 'k', comandoProva: 'npm test', onEvento: (e) => events.push(e),
    talosLavoraFn: async ({onGiro, onDelta}) => {
      onDelta({giro: 0, tipo: 'tool-annullato', indice: 0, toolCallId: 'c1', nome: 'scrivi', motivo: 'Stopped before it ran.'});
      onGiro({giro: 0, tipo: 'tool-esito', toolCallId: 'c2', content: 'ok', isError: false});
      return {detto: 'ok', comeFinita: 'concluso', messaggiFinali: []};
    }});
  const results = Object.fromEntries(events.filter((e) => e.type === 'ToolCallResult').map((e) => [e.toolCallId, e]));
  assert.equal(results.c1.outcome, 'cancelled');
  assert.equal(results.c1.isError, true, 'the desktop flag stays');
  assert.equal(results.c1.content, 'Stopped before it ran.');
  assert.equal('outcome' in results.c2, false);
});
