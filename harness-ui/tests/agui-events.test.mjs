import assert from 'node:assert/strict';
import test from 'node:test';

import {
  eventiPerRisposta,
  eventoPerEsitoTool,
  eventoPerScrittura,
  runError,
  runFinished,
  runStarted,
  stateDelta,
  textMessageContent,
  textMessageEnd,
  textMessageStart,
  toolCallArgs,
  toolCallResult,
  toolCallStart,
} from '../src/agui-events.mjs';

// Una riga di prova per riga della tabella §1.2 del piano — vedi
// elegant-spinning-dongarra.md. Ogni funzione è pura: nessun mock,
// nessun I/O, solo input finto -> output atteso byte-per-byte.

test('runStarted porta type/threadId/runId, e input solo se presente', () => {
  assert.deepStrictEqual(
    runStarted({ threadId: 't1', runId: 'r1' }),
    { type: 'RunStarted', threadId: 't1', runId: 'r1' },
  );
  assert.deepStrictEqual(
    runStarted({ threadId: 't1', runId: 'r1', input: { consegna: 'fai X' } }),
    { type: 'RunStarted', threadId: 't1', runId: 'r1', input: { consegna: 'fai X' } },
  );
});

test('runStarted porta contesto (workspace/branch) solo se presente — estensione fuori schema AG-UI, dichiarata', () => {
  const contesto = { progetto: 'listino', cartella: '/tmp/x', branch: null };
  assert.deepStrictEqual(
    runStarted({ threadId: 't1', runId: 'r1', contesto }),
    { type: 'RunStarted', threadId: 't1', runId: 'r1', contesto },
  );
  assert.ok(!('contesto' in runStarted({ threadId: 't1', runId: 'r1' })));
});

test('runFinished porta outcome/result solo se presenti', () => {
  assert.deepStrictEqual(
    runFinished({ threadId: 't1', runId: 'r1' }),
    { type: 'RunFinished', threadId: 't1', runId: 'r1' },
  );
  assert.deepStrictEqual(
    runFinished({ threadId: 't1', runId: 'r1', outcome: { type: 'success' } }),
    { type: 'RunFinished', threadId: 't1', runId: 'r1', outcome: { type: 'success' } },
  );
});

test('runError porta message sempre, code solo se presente', () => {
  assert.deepStrictEqual(
    runError({ message: 'giri esauriti' }),
    { type: 'RunError', message: 'giri esauriti' },
  );
  assert.deepStrictEqual(
    runError({ message: 'giri esauriti', code: 'giri-esauriti' }),
    { type: 'RunError', message: 'giri esauriti', code: 'giri-esauriti' },
  );
});

test('textMessageStart/Content/End — ruolo di default assistant', () => {
  assert.deepStrictEqual(
    textMessageStart({ messageId: 'm1' }),
    { type: 'TextMessageStart', messageId: 'm1', role: 'assistant' },
  );
  assert.deepStrictEqual(
    textMessageContent({ messageId: 'm1', delta: 'ciao' }),
    { type: 'TextMessageContent', messageId: 'm1', delta: 'ciao' },
  );
  assert.deepStrictEqual(
    textMessageEnd({ messageId: 'm1' }),
    { type: 'TextMessageEnd', messageId: 'm1' },
  );
});

test('toolCallStart porta parentMessageId solo se presente', () => {
  assert.deepStrictEqual(
    toolCallStart({ toolCallId: 'c1', toolCallName: 'elenca' }),
    { type: 'ToolCallStart', toolCallId: 'c1', toolCallName: 'elenca' },
  );
  assert.deepStrictEqual(
    toolCallStart({ toolCallId: 'c1', toolCallName: 'elenca', parentMessageId: 'm1' }),
    { type: 'ToolCallStart', toolCallId: 'c1', toolCallName: 'elenca', parentMessageId: 'm1' },
  );
});

test('toolCallArgs', () => {
  assert.deepStrictEqual(
    toolCallArgs({ toolCallId: 'c1', delta: '{"percorso":"a.ts"}' }),
    { type: 'ToolCallArgs', toolCallId: 'c1', delta: '{"percorso":"a.ts"}' },
  );
});

test('toolCallResult — ruolo di default tool', () => {
  assert.deepStrictEqual(
    toolCallResult({ messageId: 'm2', toolCallId: 'c1', content: 'written: a.ts' }),
    { type: 'ToolCallResult', messageId: 'm2', toolCallId: 'c1', content: 'written: a.ts', role: 'tool' },
  );
});

test('stateDelta porta il delta RFC 6902 così com\'è', () => {
  const delta = [{ op: 'replace', path: '/file/a.ts', value: 'x' }];
  assert.deepStrictEqual(stateDelta({ delta }), { type: 'StateDelta', delta });
});

test('eventiPerRisposta — solo testo, nessun tool_call', () => {
  const risposta = { role: 'assistant', content: 'ho finito', tool_calls: [] };
  assert.deepStrictEqual(
    eventiPerRisposta(risposta, { messageId: 'm1' }),
    [
      { type: 'TextMessageStart', messageId: 'm1', role: 'assistant' },
      { type: 'TextMessageContent', messageId: 'm1', delta: 'ho finito' },
      { type: 'TextMessageEnd', messageId: 'm1' },
    ],
  );
});

test('eventiPerRisposta — nessun testo, un tool_call: niente eventi di testo', () => {
  const risposta = {
    role: 'assistant',
    content: '',
    tool_calls: [{ id: 'c1', function: { name: 'elenca', arguments: '{}' } }],
  };
  assert.deepStrictEqual(
    eventiPerRisposta(risposta, { messageId: 'm1', parentMessageId: 'm0' }),
    [
      { type: 'ToolCallStart', toolCallId: 'c1', toolCallName: 'elenca', parentMessageId: 'm0' },
      { type: 'ToolCallArgs', toolCallId: 'c1', delta: '{}' },
    ],
  );
});

test('eventiPerRisposta — testo E due tool_call insieme, nell\'ordine: testo poi tool in ordine di array', () => {
  const risposta = {
    role: 'assistant',
    content: 'guardo due file',
    tool_calls: [
      { id: 'c1', function: { name: 'leggi', arguments: '{"percorso":"a.ts"}' } },
      { id: 'c2', function: { name: 'leggi', arguments: '{"percorso":"b.ts"}' } },
    ],
  };
  const eventi = eventiPerRisposta(risposta, { messageId: 'm1' });
  assert.equal(eventi.length, 3 + 2 * 2);
  assert.equal(eventi[0].type, 'TextMessageStart');
  assert.equal(eventi[3].type, 'ToolCallStart');
  assert.equal(eventi[3].toolCallId, 'c1');
  assert.equal(eventi[5].type, 'ToolCallStart');
  assert.equal(eventi[5].toolCallId, 'c2');
});

test('eventiPerRisposta — risposta assente o senza contenuto e senza tool_calls: array vuoto', () => {
  assert.deepStrictEqual(eventiPerRisposta(undefined, { messageId: 'm1' }), []);
  assert.deepStrictEqual(eventiPerRisposta({ role: 'assistant', content: '' }, { messageId: 'm1' }), []);
});

test('eventoPerEsitoTool traduce l\'esito di un attrezzo in ToolCallResult', () => {
  assert.deepStrictEqual(
    eventoPerEsitoTool({ messageId: 'm2', toolCallId: 'c1', content: 'exit 0\nok' }),
    { type: 'ToolCallResult', messageId: 'm2', toolCallId: 'c1', content: 'exit 0\nok', role: 'tool' },
  );
});

test('eventoPerScrittura — file nuovo produce "add", file esistente produce "replace"', () => {
  assert.deepStrictEqual(
    eventoPerScrittura({ percorso: 'nuovo.ts', contenuto: 'x', esisteva: false }),
    { type: 'StateDelta', delta: [{ op: 'add', path: '/file/nuovo.ts', value: 'x' }] },
  );
  assert.deepStrictEqual(
    eventoPerScrittura({ percorso: 'gia-li.ts', contenuto: 'y', esisteva: true }),
    { type: 'StateDelta', delta: [{ op: 'replace', path: '/file/gia-li.ts', value: 'y' }] },
  );
});
