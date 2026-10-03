import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { comeSonoFinitiIGiri, compattaConversazione, talosLavora } from '../src/kernel/talosHarness.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

test('CTX-LEGACY-FINAL-ANSWER-AT-CAP — completed final turn is not reported as exhausted', () => {
  assert.deepEqual(
    comeSonoFinitiIGiri({ giroRaggiunto: 9, giriMassimi: 9, haRisposto: true }),
    { esito: 'concluso', detto: null },
  );
  assert.equal(
    comeSonoFinitiIGiri({ giroRaggiunto: 9, giriMassimi: 9, haRisposto: false }).esito,
    'giri-esauriti',
  );
});

test('CTX-LEGACY-TOOL-TEXT-AT-CAP — text accompanying an unfinished tool call is not completion', async (t) => {
  const cartella = mkdtempSync(join(tmpdir(), 'talos-ctx-tool-cap-'));
  t.after(() => rimuoviCartellaDiProva(cartella));
  const result = await talosLavora({
    cartella,
    task: { consegna: 'Elenca il progetto e poi riferisci il risultato.' },
    modello: 'z-ai/glm-5.3-flash', chiave: 'fixture',
    _giriMassimiInterno: 1,
    fetchDiRete: async () => Response.json({
      choices: [{ message: {
        role: 'assistant', content: 'Sto controllando i file.',
        tool_calls: [{ id: 'call_1', type: 'function', function: { name: 'elenca', arguments: '{"percorso":"."}' } }],
      }, finish_reason: 'tool_calls' }],
    }),
  });
  assert.equal(result.comeFinita, 'giri-esauriti');
  assert.match(result.detto, /turns exhausted/i);
});

test('CTX-LEGACY-WHITESPACE-AT-CAP — blank model output cannot complete a capped task', async (t) => {
  const cartella = mkdtempSync(join(tmpdir(), 'talos-ctx-blank-cap-'));
  t.after(() => rimuoviCartellaDiProva(cartella));
  const result = await talosLavora({
    cartella, task: { consegna: 'Rispondi con un risultato completo.' },
    modello: 'z-ai/glm-5.3-flash', chiave: 'fixture', _giriMassimiInterno: 1,
    fetchDiRete: async () => Response.json({
      choices: [{ message: { role: 'assistant', content: '   ' }, finish_reason: 'stop' }],
    }),
  });
  assert.equal(result.comeFinita, 'giri-esauriti');
});

test('CTX-LEGACY-TRUNCATED-FINAL-AT-CAP — nonstream length finish is incomplete', async (t) => {
  const cartella = mkdtempSync(join(tmpdir(), 'talos-ctx-length-cap-'));
  t.after(() => rimuoviCartellaDiProva(cartella));
  const result = await talosLavora({
    cartella, task: { consegna: 'Rispondi con un risultato completo.' },
    modello: 'z-ai/glm-5.3-flash', chiave: 'fixture', _giriMassimiInterno: 1,
    fetchDiRete: async () => Response.json({
      choices: [{ message: { role: 'assistant', content: 'Risposta troncata' }, finish_reason: 'length' }],
    }),
  });
  assert.equal(result.comeFinita, 'giri-esauriti');
});

test('CTX-LEGACY-TRUNCATED-FINAL-AT-CAP-SSE — streamed length finish is incomplete', async (t) => {
  const cartella = mkdtempSync(join(tmpdir(), 'talos-ctx-length-sse-'));
  t.after(() => rimuoviCartellaDiProva(cartella));
  const sse = [
    'data: {"choices":[{"delta":{"content":"Risposta troncata"},"finish_reason":null}]}',
    '',
    'data: {"choices":[{"delta":{},"finish_reason":"length"}]}',
    '',
    'data: [DONE]',
    '',
    '',
  ].join('\n');
  const result = await talosLavora({
    cartella, task: { consegna: 'Rispondi con un risultato completo.' },
    modello: 'z-ai/glm-5.3-flash', chiave: 'fixture', _giriMassimiInterno: 1,
    onDelta: () => {},
    fetchDiRete: async () => new Response(sse, { headers: { 'Content-Type': 'text/event-stream' } }),
  });
  assert.equal(result.comeFinita, 'giri-esauriti');
});

test('CTX-LEGACY-TRUNCATED-FINAL-AT-CAP-SSE-DELTA-REASON — gateway delta reason is incomplete', async (t) => {
  const cartella = mkdtempSync(join(tmpdir(), 'talos-ctx-length-sse-delta-'));
  t.after(() => rimuoviCartellaDiProva(cartella));
  const sse = [
    'data: {"choices":[{"delta":{"content":"Risposta troncata"}}]}',
    '',
    'data: {"choices":[{"delta":{"finish_reason":"length"}}]}',
    '',
    'data: [DONE]',
    '',
    '',
  ].join('\n');
  const result = await talosLavora({
    cartella, task: { consegna: 'Rispondi con un risultato completo.' },
    modello: 'z-ai/glm-5.3-flash', chiave: 'fixture', _giriMassimiInterno: 1,
    onDelta: () => {},
    fetchDiRete: async () => new Response(sse, { headers: { 'Content-Type': 'text/event-stream' } }),
  });
  assert.equal(result.comeFinita, 'giri-esauriti');
});

test('CTX-LEGACY-TRUNCATED-SUMMARY-PRESERVES-HISTORY — partial summary cannot replace source messages', async () => {
  const original = [{ role: 'system', content: 'Regole' }, { role: 'user', content: 'Task' }, { role: 'assistant', content: 'Passi completati' }];
  const result = await compattaConversazione(original, async () => ({
    scelta: { role: 'assistant', content: 'Riassunto parziale' }, finishReason: 'length', usage: null,
  }));
  assert.equal(result.compattato, false);
  assert.strictEqual(result.messaggi, original);
});

test('CTX-LEGACY-SHORT-HISTORY-NO-SUMMARY — uno storico senza sistema e compito non diventa un array con buchi', async () => {
  const original = [{ role: 'user', content: 'solo un messaggio' }];
  let chiamate = 0;
  const result = await compattaConversazione(original, async () => {
    chiamate += 1;
    return { scelta: { role: 'assistant', content: 'sintesi' }, finishReason: 'stop', usage: null };
  });
  assert.equal(result.compattato, false);
  assert.strictEqual(result.messaggi, original);
  assert.equal(chiamate, 0, 'non spendere token se non esistono i due messaggi da conservare');
});

test('CTX-LEGACY-STOP-DURING-SUMMARY — stop reaches summary request and prevents fallback', async (t) => {
  const cartella = mkdtempSync(join(tmpdir(), 'talos-ctx-summary-stop-'));
  t.after(() => rimuoviCartellaDiProva(cartella));
  const controller = new AbortController();
  let calls = 0;
  let summarySignal = null;
  let abortObserved = false;
  const fetchDiRete = async (_url, options) => {
    calls += 1;
    if (calls <= 8) return Response.json({
      choices: [{ message: { role: 'assistant', content: '', tool_calls: [{
        id: 'call_' + calls, type: 'function',
        function: { name: 'elenca', arguments: '{"percorso":"."}' },
      }] }, finish_reason: 'tool_calls' }],
    });
    if (calls !== 9) throw new Error('ordinary request must not start after Stop');
    summarySignal = options.signal ?? null;
    queueMicrotask(() => controller.abort());
    return await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => resolve(Response.json({
        choices: [{ message: { role: 'assistant', content: '   ' }, finish_reason: 'stop' }],
      })), 50);
      options.signal?.addEventListener('abort', () => {
        abortObserved = true;
        clearTimeout(timeout);
        reject(new Error('summary request aborted'));
      }, { once: true });
    });
  };
  const result = await talosLavora({
    cartella,
    task: { consegna: 'Esegui otto passi. ' + 'contesto '.repeat(1_200) },
    modello: 'z-ai/glm-5.3-flash', chiave: 'fixture', fetchDiRete,
    segnaleStop: controller.signal, _giriMassimiInterno: 9,
  });
  assert.equal(summarySignal, controller.signal);
  assert.equal(abortObserved, true);
  assert.equal(calls, 9);
  assert.equal(result.comeFinita, 'fermato');
  assert.match(result.detto, /compaction/i);
});

async function provaTurnoDopoRiassuntoFallito(t, erroreHttp) {
  const cartella = mkdtempSync(join(tmpdir(), 'talos-ctx-legacy-'));
  t.after(() => rimuoviCartellaDiProva(cartella));
  let calls = 0;
  const requests = [];
  const fetchDiRete = async (_url, options) => {
    calls += 1;
    requests.push(JSON.parse(options.body));
    if (calls <= 8) {
      return Response.json({
        choices: [{ message: { role: 'assistant', content: '', tool_calls: [{
          id: `call_${calls}`, type: 'function',
          function: { name: 'elenca', arguments: JSON.stringify({ percorso: '.', nota: `passo ${calls}` }) },
        }] }, finish_reason: 'tool_calls' }],
        usage: { prompt_tokens: 10, completion_tokens: 5 },
      });
    }
    if (calls === 9) {
      if (erroreHttp) return new Response('provider rejected summary request', { status: 401 });
      return Response.json({ choices: [{ message: { role: 'assistant', content: '   ' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 10, completion_tokens: 5 } });
    }
    return Response.json({ choices: [{ message: { role: 'assistant', content: 'Compito concluso dopo il checkpoint.' }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 10, completion_tokens: 5 } });
  };

  const result = await talosLavora({
    cartella,
    task: { consegna: `Esegui otto passi e poi concludi. ${'contesto '.repeat(1_200)}` },
    modello: 'z-ai/glm-5.3-flash', chiave: 'fixture', fetchDiRete,
    _giriMassimiInterno: 9,
  });

  assert.equal(calls, 10, 'the empty summary must be followed by ordinary work in the same last iteration');
  assert.equal(result.comeFinita, 'concluso');
  assert.match(result.detto, /Compito concluso dopo il checkpoint/);
  assert.equal(result.compattazioni, 0, 'an empty summary cannot claim a successful compaction');
  assert.doesNotMatch(result.detto, /provider rejected summary request/);
  return requests;
}

test('CTX-LEGACY-COMPACTION-FAILURE-NO-LOST-TURN — empty optional summary leaves the last work turn usable', async (t) => {
  await provaTurnoDopoRiassuntoFallito(t, false);
});

test('CTX-LEGACY-COMPACTION-HTTP-FAILURE-NO-LOST-TURN — rejected summary leaves the last work turn usable', async (t) => {
  await provaTurnoDopoRiassuntoFallito(t, true);
});

test('CTX-LEGACY-HISTORY-ON-FAILED-SUMMARY — original messages and tool results reach the next request', async (t) => {
  const requests = await provaTurnoDopoRiassuntoFallito(t, false);
  assert.deepEqual(requests[9].messages, requests[8].messages.slice(0, -1),
    'failed optional summary must preserve every original model message and tool result');
});
