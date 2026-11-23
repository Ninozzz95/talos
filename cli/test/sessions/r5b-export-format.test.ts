/*
 * R5b D1 (owner decision Q-R5-12, gate E16): a Markdown export never loses the person's messages and names tools in English.
 * Measured by the R5 gate (§5): `session-cli.ts` exportMarkdown wrote the model's text deltas and `> Tool: leggi`, and
 * nothing the person typed (their prompt lives only in `RunStarted.input`, R1 lane R). The shared redaction applies.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {exportMarkdown} from '../../src/sessions/export-format.ts';

const payload={schema:'talos.harness-ui.session-export.v1',sessionId:'s-123',eventi:[
  {type:'RunStarted',runId:'r1',input:{consegna:'read the README please'}},
  {type:'TextMessageStart',messageId:'a1',role:'assistant'},{type:'TextMessageContent',messageId:'a1',delta:'Reading '},{type:'TextMessageContent',messageId:'a1',delta:'it now.'},{type:'TextMessageEnd',messageId:'a1'},
  {type:'ToolCallStart',toolCallId:'t1',toolCallName:'leggi'},{type:'ToolCallArgs',toolCallId:'t1',delta:'{"percorso":"README.md"}'},{type:'ToolCallEnd',toolCallId:'t1'},
  {type:'ToolCallResult',toolCallId:'t1',content:'# demo'},
  {type:'TextMessageStart',messageId:'a2',role:'assistant'},{type:'TextMessageContent',messageId:'a2',delta:'It says demo. The key is sk-test-SECRET123.'},{type:'TextMessageEnd',messageId:'a2'},
  {type:'RunFinished',runId:'r1'},
  {type:'RunStarted',runId:'r2',input:{prompt:'thanks'}},
  {type:'TextMessageStart',messageId:'a3',role:'assistant'},{type:'TextMessageContent',messageId:'a3',delta:'You are welcome.'},{type:'TextMessageEnd',messageId:'a3'},
  {type:'RunFinished',runId:'r2'},
]};

test('R5b D1: the Markdown export keeps the person\'s messages, in order, with the answers',()=>{
  const md=exportMarkdown(payload,{secrets:['sk-test-SECRET123']});
  const you=md.indexOf('read the README please'),first=md.indexOf('Reading it now.'),second=md.indexOf('thanks'),last=md.indexOf('You are welcome.');
  assert.ok(you>=0,`the person's first message is missing:\n${md}`);
  assert.ok(second>=0,`the person's second message is missing:\n${md}`);
  assert.ok(you<first&&first<second&&second<last,`the order is lost:\n${md}`);
  assert.match(md,/^## You$/mu);assert.match(md,/^## TALOS$/mu);
});

test('R5b D1: tools are named in English with their target, never the kernel id; secrets are redacted',()=>{
  const md=exportMarkdown(payload,{secrets:['sk-test-SECRET123']});
  assert.match(md,/Read file README\.md/u,md);
  assert.doesNotMatch(md,/\bleggi\b|percorso/u,'no kernel names in the export');
  assert.doesNotMatch(md,/SECRET123/u,'the shared redaction applies (E16)');
  assert.match(md,/^# TALOS session s-123/mu);
});
