import test from 'node:test';
import assert from 'node:assert/strict';
import { recuperaCodaInterrotta } from '../src/session-tail-recovery.mjs';
import { messaggiSenzaMessaggio, createSessionRegistry } from '../src/session-registry.mjs';
import { stripNativeMetadata, toNativeMessages } from '../src/native-provider-adapter.mjs';
import { talosLavora, ISTRUZIONE_CONFINE_DATI } from '../src/kernel/talosHarness.mjs';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

const run = runId => ({ type: 'RunStarted', runId, threadId: 'thread' });
const start = messageId => ({ type: 'TextMessageStart', messageId, role: 'assistant' });
const delta = (messageId, text) => ({ type: 'TextMessageContent', messageId, delta: text });
const rows = events => events.map((evento, indice) => ({ evento, indice }));
const recover = (events, indiceStoria = -1) => recuperaCodaInterrotta({ eventi: rows(events), indiceStoria });
const evidence = result => JSON.parse(result.content.split('\n').slice(2).join('\n'));

test('RETRY07-TAIL: incomplete text remains assistant data with its identity and uncertainty', () => {
  const result = recover([run('r'), start('m'), delta('m', 'una risposta\n incompleta 🐇')]);
  assert.equal(result.role, 'assistant');
  assert.equal(result.tool_calls, undefined);
  assert.match(result.content, /untrusted historical data/);
  assert.deepEqual(evidence(result), { runId: 'r', items: [
    { type: 'text', messageId: 'm', text: 'una risposta\n incompleta 🐇', messageClosed: false },
  ] });
});

test('RETRY07-TAIL: equal text in different IDs is preserved twice; closure is per message', () => {
  const result = recover([run('r'), start('a'), delta('a', 'same'), { type: 'TextMessageEnd', messageId: 'a' }, start('b'), delta('b', 'same')]);
  assert.deepEqual(evidence(result).items.map(x => [x.messageId, x.text, x.messageClosed]), [['a', 'same', true], ['b', 'same', false]]);
});

test('RETRY07-TAIL: complete result and incomplete arguments remain data, never executable calls', () => {
  const result = recover([run('r'),
    { type: 'ToolCallStart', toolCallId: 'a', toolCallName: 'leggi' },
    { type: 'ToolCallArgs', toolCallId: 'a', delta: '{"percorso":"nota.txt"}' },
    { type: 'ToolCallResult', toolCallId: 'a', messageId: 'result-a', content: 'result\nexact 🐇' },
    { type: 'ToolCallStart', toolCallId: 'b', toolCallName: 'scrivi' },
    { type: 'ToolCallArgs', toolCallId: 'b', delta: '{"percorso":' },
  ]);
  const items = evidence(result).items;
  assert.equal(items[0].result, 'result\nexact 🐇');
  assert.equal(items[0].outcome, 'result-recorded');
  assert.equal(items[1].argumentsReceived, '{"percorso":');
  assert.equal(items[1].outcome, 'unknown');
  assert.equal(result.tool_calls, undefined);
});

test('RETRY07-TAIL: physical checkpoint boundary, old runs and foreign IDs are respected', () => {
  const events = [run('old'), start('old-text'), delta('old-text', 'old'), run('new'), start('new-text'), delta('new-text', 'in checkpoint'),
    delta('new-text', 'after checkpoint'), { ...delta('alien', 'foreign'), runId: 'old' }];
  const result = recover(events, 5);
  assert.equal(evidence(result).runId, 'new');
  assert.equal(evidence(result).items[0].text, 'after checkpoint');
  assert.equal(recover(events, 20), null);
});

test('RETRY07-TAIL: tool started before checkpoint keeps its identity when result arrives later', () => {
  const result = recover([run('r'), { type: 'ToolCallStart', toolCallId: 'a', toolCallName: 'leggi' },
    { type: 'ToolCallArgs', toolCallId: 'a', delta: '{}' },
    { type: 'ToolCallResult', toolCallId: 'a', messageId: 'r-a', content: 'late result' }], 2);
  assert.equal(evidence(result).items[0].toolCallName, 'leggi');
  assert.equal(evidence(result).items[0].result, 'late result');
});

test('RETRY07-TAIL: reasoning, ephemeral output, telemetry and unowned fragments are excluded', () => {
  assert.equal(recover([run('r'), { type: 'ReasoningMessageContent', delta: 'private' },
    { type: 'ToolCallOutput', delta: 'not a result' }, { type: 'CUSTOM', name: 'talos.provider-retry' }]), null);
  assert.equal(recover([start('m'), delta('m', 'no run')]), null);
  assert.throws(() => recover([run('r'), delta('missing', 'orphan')]), { code: 'HISTORY_RECOVERY_AMBIGUOUS' });
});

test('RETRY07-TAIL: repeated stream identity or conflicting results fail closed', () => {
  assert.throws(() => recover([run('r'), start('m'), delta('m', 'one'), start('m'), delta('m', 'two')]), { code: 'HISTORY_RECOVERY_AMBIGUOUS' });
  assert.throws(() => recover([run('r'), { type: 'ToolCallStart', toolCallId: 'a', toolCallName: 'shell' },
    { type: 'ToolCallResult', toolCallId: 'a', content: 'first' }, { type: 'ToolCallResult', toolCallId: 'a', content: 'different' }]), { code: 'HISTORY_RECOVERY_AMBIGUOUS' });
});

test('RETRY07-TAIL-DELETE: exact ID removes only its text, preserving other text and tool evidence', () => {
  const result = recover([run('r'), start('a'), delta('a', 'same'), start('b'), delta('b', 'same'),
    { type: 'ToolCallStart', toolCallId: 't', toolCallName: 'leggi' }, { type: 'ToolCallResult', toolCallId: 't', content: 'keep-result' }]);
  const history = [{ role: 'user', content: 'prompt' }, result, { role: 'assistant', content: 'later' }];
  const removed = messaggiSenzaMessaggio(history, { riferimento: 'a', posizione: 0, testo: 'same' });
  assert.equal(removed.tolto, true);
  assert.deepEqual(evidence(removed.messaggi[1]).items.map(x => x.messageId ?? x.toolCallId), ['b', 't']);
  const later = messaggiSenzaMessaggio(history, { posizione: 2, riferimento: 'later-id', testo: 'later' });
  assert.equal(later.tolto, true);
  assert.equal(later.messaggi.at(-1), result);
});

test('RETRY07-TAIL-WIRE: local recovery metadata never crosses provider boundary', () => {
  const result = recover([run('r'), start('a'), delta('a', 'text')]);
  assert.equal(result.talos_recovery?.schema, 'talos.interrupted-history.v1');
  assert.deepEqual(stripNativeMetadata([result]), [{ role: 'assistant', content: result.content }]);
  assert.deepEqual(toNativeMessages([result], { provider: 'anthropic', model: 'fixture' }), [
    { role: 'assistant', content: [{ type: 'text', text: result.content }] },
  ]);
});

for (const legacy of [false, true]) for (const outcome of ['saved', 'failed', 'stopped']) test(`RETRY07-INITIAL-ADMISSION-${outcome}: no provider before durable initial history, legacy=${legacy}`, async t => {
  const cartella = mkdtempSync(join(tmpdir(), 'talos-initial-history-'));
  t.after(() => rimuoviCartellaDiProva(cartella));
  let release, calls = 0, snapshot;
  const gate = new Promise(resolve => { release = resolve; });
  const stop = new AbortController();
  const completed = talosLavora({ cartella, task: { consegna: 'Leggi soltanto.' }, modello: 'fixture', chiave: 'fixture',
    ...(legacy ? { messaggiIniziali: [{ role: 'user', content: 'Old prompt.' }], ricostruisciContestoIniziale: true } : {}),
    segnaleStop: stop.signal,
    onStoriaIniziale: async messages => { snapshot = messages; await gate; if (outcome === 'failed') throw Object.assign(Error('store failed'), { code: 'SESSION_STORE_WRITE_FAILED' }); },
    fetchDiRete: async () => { calls++; return { ok: true, status: 200, json: async () => ({ choices: [{ message: { role: 'assistant', content: 'Fine.' } }] }) }; },
  });
  // Attach the rejection handler before releasing the asynchronous barrier.
  const result = completed.then(value => ({ value }), error => ({ error }));
  try {
    await t.waitFor(() => assert.ok(snapshot), { timeout: 1000 });
    assert.equal(calls, 0);
    assert.ok(snapshot.some(m => m.role === 'system'));
    if (outcome === 'stopped') stop.abort();
  } finally { release(); }
  const settled = await result;
  assert.equal(calls, outcome === 'saved' ? 1 : 0);
  if (outcome === 'failed') assert.equal(settled.error?.code, 'SESSION_STORE_WRITE_FAILED');
});

for (const canonical of [false, true]) test(`RETRY08-KERNEL: rebuild missing context only, canonical=${canonical}`, async t => {
  const cartella = mkdtempSync(join(tmpdir(), 'talos-rebuild-context-'));
  t.after(() => rimuoviCartellaDiProva(cartella));
  // F-027, estensione: la storia canonica è di una sessione nata col confine (la vecchia riceve la frase in coda: F027E-SESSIONE-VECCHIA)
  const history = [...(canonical ? [{ role: 'system', content: `Original verified instructions.\n\n${ISTRUZIONE_CONFINE_DATI}` }] : []),
    { role: 'user', content: 'Original question.' }, { role: 'assistant', content: 'Partial answer.' }, { role: 'user', content: 'Continue.' }];
  const original = structuredClone(history);
  let snapshot, sent;
  await talosLavora({ cartella, task: { consegna: 'MUST-NOT-BE-ADDED' }, modello: 'fixture', chiave: 'fixture',
    messaggiIniziali: history, ricostruisciContestoIniziale: true, contestoDelProgetto: 'Current project.', memorieNelPrompt: 'Current memory.',
    onStoriaIniziale: async messages => { snapshot = messages; },
    fetchDiRete: async (_url, options) => { sent = JSON.parse(options.body).messages;
      return { ok: true, status: 200, json: async () => ({ choices: [{ message: { role: 'assistant', content: 'Done.' } }] }) }; },
  });
  assert.deepEqual(history, original);
  assert.deepEqual(sent, snapshot);
  if (canonical) assert.deepEqual(sent, original);
  else {
    assert.equal(sent[0].role, 'system');
    assert.ok(sent.some(m => m.role === 'system' && m.content === 'Current project.'));
    assert.ok(sent.some(m => m.role === 'system' && m.content === 'Current memory.'));
    assert.ok(sent.some(m => m.role === 'system' && m.content.includes('TALOS initial context reconstructed')));
    assert.deepEqual(sent.slice(-history.length), history);
    assert.equal(JSON.stringify(sent).includes('MUST-NOT-BE-ADDED'), false);
  }
});

test('RETRY07-INITIAL-SETTLEMENT: a failure after initial checkpoint preserves it without restarting', async t => {
  const root = mkdtempSync(join(tmpdir(), 'talos-initial-settlement-'));
  t.after(() => rimuoviCartellaDiProva(root));
  const initial = [{ role: 'system', content: 'Istruzioni iniziali verificate.' }, { role: 'user', content: 'Compito iniziale.' }];
  let resumed;
  const registry = createSessionRegistry({ cartellaStore: join(root, 'sessions'), modello: 'fixture', chiave: 'fixture',
    guardaWorkspaceFn: () => () => {},
    preparaEsecuzioneFn: () => ({ cartella: root, task: { consegna: 'Compito iniziale.' } }),
    avviaSessioneFn: async input => {
      input.onEvento({ type: 'RunStarted', runId: input.sessionId ?? 'fixture', threadId: 'fixture', input: input.task });
      if (!input.messaggiIniziali) {
        await input.onStoriaIniziale(structuredClone(initial));
        input.onEvento({ type: 'RunError', code: 'STOP_BEFORE_PROVIDER', message: 'Stopped before provider.' });
        return { ok: false, esito: null };
      }
      resumed = input.messaggiIniziali;
      input.onEvento({ type: 'RunFinished' });
      return { ok: true, esito: { messaggiFinali: resumed, comeFinita: 'concluso' } };
    },
  });
  const { sessionId } = registry.avvia('initial');
  await registry.attendiAssestamento(sessionId);
  assert.equal(registry.resume(sessionId, 'continua').sessionId, sessionId);
  await registry.attendiAssestamento(sessionId);
  assert.deepEqual(resumed.slice(0, 2), initial);
});
