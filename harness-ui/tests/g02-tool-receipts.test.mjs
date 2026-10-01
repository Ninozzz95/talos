/*
 * G02 feature 2 (CLI lane a7dfe1193 + b82fa22a2 + 6fccf0b5c, M4-E): the kernel already emits `onGiro({tipo:'ricevuta'})`
 * for every gated action; agent-service now correlates it by `toolCallId` and forwards it, uninterpreted, as the optional
 * `receipt` field of that tool's ToolCallResult, next to stdout/stderr/exitCode/isError — never replacing them. A receipt is
 * consumed once; without one the event is byte-identical to before. The CLI shows who allowed or refused each action.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, resolve, relative, isAbsolute} from 'node:path';
import {toolCallResult, eventoPerEsitoTool} from '../src/agui-events.mjs';
import {avviaSessione} from '../src/agent-service.mjs';
import {talosLavora} from '../src/kernel/talosHarness.mjs';
import {rimuoviCartellaDiProva} from './aiuto/rimuovi-cartella-di-prova.mjs';

const RECEIPT = {schema_version: 1, azione: 'scrivi', percorso: 'out.txt', toolCallId: 'c1', consentito: true, via: 'livello'};

test('G02-2 toolCallResult carries an object receipt next to the existing fields, and nothing else changes', () => {
  const plain = toolCallResult({messageId: 'm', toolCallId: 'c1', content: 'ok', stdout: 'out', exitCode: 0, isError: false});
  const withReceipt = toolCallResult({messageId: 'm', toolCallId: 'c1', content: 'ok', stdout: 'out', exitCode: 0, isError: false, receipt: RECEIPT});
  assert.deepEqual(withReceipt, {...plain, receipt: RECEIPT});
  assert.equal('receipt' in plain, false, 'without a receipt the event is identical to before');
  for (const bad of [null, 'x', 7, [RECEIPT]]) assert.equal('receipt' in toolCallResult({messageId: 'm', toolCallId: 'c1', content: 'ok', receipt: bad}), false, String(bad));
  assert.deepEqual(eventoPerEsitoTool({messageId: 'm', toolCallId: 'c1', content: 'ok', receipt: RECEIPT}).receipt, RECEIPT, 'the helper forwards it');
});

async function session(steps) {
  const events = [];
  await avviaSessione({cartella: tmpdir(), task: {consegna: 'x'}, modello: 'm', chiave: 'k', comandoProva: 'npm test', onEvento: (e) => events.push(e),
    talosLavoraFn: async ({onGiro}) => {for (const step of steps) onGiro(step); return {detto: 'ok', comeFinita: 'concluso', messaggiFinali: []};}});
  return events.filter((e) => e.type === 'ToolCallResult');
}

test('G02-2 avviaSessione correlates the receipt by toolCallId, once, and leaves other results alone', async () => {
  const results = await session([
    {giro: 0, tipo: 'ricevuta', ricevuta: RECEIPT},
    {giro: 0, tipo: 'ricevuta', ricevuta: {azione: 'scrivi'}},
    {giro: 0, tipo: 'tool-esito', toolCallId: 'c2', content: 'other', isError: false},
    {giro: 0, tipo: 'tool-esito', toolCallId: 'c1', content: 'ok', isError: false, exitCode: 0},
    {giro: 1, tipo: 'tool-esito', toolCallId: 'c1', content: 'again'},
  ]);
  const byContent = Object.fromEntries(results.map((r) => [r.content, r]));
  assert.deepEqual(byContent.ok.receipt, RECEIPT);
  assert.equal(byContent.ok.isError, false, 'the desktop fields stay');
  assert.equal(byContent.ok.exitCode, 0);
  assert.equal('receipt' in byContent.other, false, 'another tool gets no receipt');
  assert.equal('receipt' in byContent.again, false, 'a receipt is consumed once');
});

test('G02-2 the real kernel: a gated write reaches the UI with its own receipt', async (t) => {
  const root = mkdtempSync(join(tmpdir(), 'talos-g02-receipt-'));
  t.after(() => {const p = relative(resolve(tmpdir()), resolve(root)); assert.ok(p && !p.startsWith('..') && !isAbsolute(p)); rimuoviCartellaDiProva(root);});
  let calls = 0;
  const fetchDiRete = async () => {
    const message = calls++ === 0 ? {role: 'assistant', content: '', tool_calls: [{id: 'call_w', type: 'function', function: {name: 'scrivi', arguments: '{"percorso":"out.txt","contenuto":"hi"}'}}]} : {role: 'assistant', content: 'done'};
    return Response.json({choices: [{message, finish_reason: message.tool_calls ? 'tool_calls' : 'stop'}]});
  };
  const events = [];
  await avviaSessione({cartella: root, task: {consegna: 'x'}, modello: 'm', chiave: 'k', comandoProva: 'npm test', onEvento: (e) => events.push(e),
    talosLavoraFn: (input) => talosLavora({...input, onDelta: undefined, fetchDiRete, livelloAccesso: 'completo', _giriMassimiInterno: 3})});
  const result = events.find((e) => e.type === 'ToolCallResult' && e.toolCallId === 'call_w');
  assert.ok(result, 'the write produced a ToolCallResult');
  assert.equal(result.receipt?.toolCallId, 'call_w');
  assert.equal(result.receipt?.azione, 'scrivi');
  assert.equal(result.receipt?.consentito, true);
});
