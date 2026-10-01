import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { creaFetchMultiProvider, creaFetchOpenRouterResiliente } from '../src/runtime-owner-adapter.mjs';
import { createProviderCredentialStore } from '../src/provider-credential-store.mjs';
import { chiamaConRitenta, talosLavora, consumaFlussoSSE } from '../src/kernel/talosHarness.mjs';
import { avviaSessione } from '../src/agent-service.mjs';
import { classeDelFallimento } from '../src/workflow/adapters/agent-session.mjs';
import { classificaErroreDiCorsa } from '../src/research-orchestrator.mjs';
import { cartellaDiProva } from './aiuto/cartelle-di-prova.mjs';

async function banco(t, respond) {
  const requests = [], changes = [], usage = [];
  const server = createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    requests.push({ url: req.url, body: JSON.parse(Buffer.concat(chunks)) });
    if (req.url.startsWith('/zai')) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ choices: [{ message: { content: 'Unexpected fallback' } }] }));
    } else respond(res);
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
  assert.notEqual(server.address().port, 4174);
  const store = createProviderCredentialStore({ env: { DEEPSEEK_API_KEY: 'local-fixture', OPENAI_API_KEY: 'local-fixture', ZAI_API_KEY: 'local-fixture' } });
  for (const p of ['deepseek', 'openai', 'zai']) store.setRuntime(p, { endpoint: `http://127.0.0.1:${server.address().port}/${p}` });
  const transport = creaFetchMultiProvider(fetch, {
    providerStore: store,
    dipendenze: { leggiChiave: p => store.getKey(p), leggiRuntime: p => store.getRuntime(p) },
    fallbackProviders: [{ provider: 'zai', model: 'glm-4.7-flash' }],
    onCambioFornitore: e => changes.push(e), onConsumoFornitore: e => usage.push(e),
  });
  const run = extra => chiamaConRitenta({ modello: 'deepseek:deepseek-chat', chiave: 'unused',
    messaggi: [{ role: 'user', content: 'contnua dalla nota' }], attrezzi: [],
    fetchDiRete: transport, dormi: async () => {}, ...extra });
  return { requests, changes, usage, store, transport, run };
}
function unknown(error) {
  assert.equal(error.code, 'PROVIDER_OUTCOME_UNKNOWN');
  assert.equal(error.esitoIncerto, true);
  assert.equal(error.transitorio, false);
  assert.match(error.message, /Riprendi esplicitamente/u);
  return true;
}
function noReplay(b, provider = 'deepseek') {
  assert.equal(b.requests.length, 1, 'una sola richiesta effettiva ricevuta dal server');
  assert.deepEqual(b.changes, [], 'nessun cambio fornitore');
  assert.equal(b.store.elencaPool(provider)[0].inPanchinaFino, null, 'una perdita di risposta non invalida la chiave');
  assert.equal(b.usage.length, 1);
  assert.equal(b.usage[0].usage, null);
  assert.equal(b.usage[0].costoDichiarato, null);
}
test('PROVIDER-UNKNOWN-ACCEPTED-DISCONNECT: POST ricevuto, socket perso prima degli header', async t => {
  const b = await banco(t, res => res.destroy());
  await assert.rejects(b.run(), unknown);
  noReplay(b);
});
test('PROVIDER-UNKNOWN-NATIVE: SDK reale senza retry interni né fallback', async t => {
  const b = await banco(t, res => res.destroy());
  await assert.rejects(b.run({ modello: 'openai:gpt-5-nano' }), unknown);
  noReplay(b, 'openai');
  assert.equal(b.requests[0].url, '/openai/responses');
});
test('PROVIDER-UNKNOWN-JSON: risposta HTTP 200 con corpo troncato non autorizza un altro invio', async t => {
  const b = await banco(t, res => { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end('{"choices":'); });
  await assert.rejects(b.run(), unknown);
  noReplay(b);
});
for (const ending of ['socket', 'EOF', 'error']) test(`PROVIDER-UNKNOWN-AGUI-${ending}: testo parziale e codice restano nel giro fallito serializzabile`, async t => {
  const b = await banco(t, res => {
    res.writeHead(200, { 'Content-Type': 'text/event-stream' });
    res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: 'Testo già ricevuto.' } }] })}\n\n`);
    if (ending === 'socket') setTimeout(() => res.destroy(), 20);
    else if (ending === 'EOF') res.end();
    else res.end('data: {"error":{"code":502},"choices":[{"delta":{},"finish_reason":"error"}]}\n\ndata: [DONE]\n\n');
  });
  const events = [];
  const result = await avviaSessione({
    cartella: cartellaDiProva('provider-unknown-'), task: { consegna: 'riepiloga la nota' },
    modello: 'deepseek:deepseek-chat', chiave: 'unused', onEvento: e => events.push(e),
    talosLavoraFn: input => talosLavora({ ...input, fetchDiRete: b.transport }),
  });
  noReplay(b);
  assert.equal(result.ok, false);
  assert.equal(result.codiceErrore, 'PROVIDER_OUTCOME_UNKNOWN');
  const replay = JSON.parse(JSON.stringify(events));
  assert.equal(replay.at(-1).type, 'RunError');
  assert.equal(replay.at(-1).code, 'PROVIDER_OUTCOME_UNKNOWN');
  assert.match(replay.at(-1).message, /Riprendi esplicitamente/u);
  assert.equal(replay.filter(e => e.type === 'TextMessageContent').map(e => e.delta).join(''), 'Testo già ricevuto.');
  assert.equal(replay.filter(e => e.type === 'TextMessageEnd').length, 1);
  assert.ok(result.messaggiDelGiro.some(m => m.role === 'assistant' && m.content === 'Testo già ricevuto.'));
  assert.equal(JSON.stringify([events, result]).includes('local-fixture'), false);
});
test('PROVIDER-UNKNOWN-WORKFLOW: codice persistito prevale sulla vecchia classe transitoria', () => {
  for (const classeErrore of ['rete', 'flusso-interrotto', 'timeout-fornitore', 'guasto-fornitore']) {
    assert.deepEqual(classeDelFallimento({ codiceErrore: 'PROVIDER_OUTCOME_UNKNOWN', classeErrore }), { errorClass: 'internal', retryable: false });
  }
});
test('PROVIDER-UNKNOWN-RESEARCH: il codice prevale su un messaggio che contiene timeout', () => {
  assert.deepEqual(classificaErroreDiCorsa({ codice: 'PROVIDER_OUTCOME_UNKNOWN', messaggio: 'upstream timeout' }), { classe: 'esito-incerto', transitorio: false });
});

const frame = packet => `data: ${JSON.stringify(packet)}\n\n`;
const textFrame = frame({ choices: [{ delta: { content: 'Testo già ricevuto.' } }] });
const errorFrame = frame({ error: { code: 502, message: 'private-fixture-do-not-expose', metadata: { error_type: 'provider_unavailable' } }, choices: [{ delta: {}, finish_reason: 'error' }] });
for (const [name, body] of [
  ['EOF', textFrame],
  ['ERROR', textFrame + errorFrame + 'data: [DONE]\n\n'],
  ['ERROR-NO-TEXT', errorFrame + 'data: [DONE]\n\n'],
  ['FINISH-ERROR', textFrame + frame({ choices: [{ delta: {}, finish_reason: 'error' }] }) + 'data: [DONE]\n\n'],
  ['ERROR-THEN-STOP', textFrame + frame({ choices: [{ delta: {}, finish_reason: 'error' }] }) + frame({ choices: [{ delta: {}, finish_reason: 'stop' }] }) + 'data: [DONE]\n\n'],
  ['INVALID', textFrame + 'data: {broken}\n\ndata: [DONE]\n\n'],
]) test(`STREAM-${name}: HTTP200 non è prova di completamento`, async t => {
  const b = await banco(t, res => { res.writeHead(200, { 'Content-Type': 'text/event-stream' }); res.end(body); });
  await assert.rejects(b.run({ onDelta: () => {}, accettaVuota: true }), e => {
    unknown(e);
    assert.equal(e.parziale.content, name === 'ERROR-NO-TEXT' ? '' : 'Testo già ricevuto.');
    assert.equal(JSON.stringify(e).includes('private-fixture'), false);
    return true;
  });
  noReplay(b);
});
test('STREAM-JSON-ERROR: messaggio parziale nel JSON con errore non diventa successo', async t => {
  const b = await banco(t, res => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ choices: [{ message: { content: 'Testo già ricevuto.' }, finish_reason: 'error', error: { code: 502 } }] }));
  });
  await assert.rejects(b.run(), e => { unknown(e); assert.equal(e.parziale.content, 'Testo già ricevuto.'); return true; });
  noReplay(b);
});
test('STREAM-USAGE: token e costo dichiarati restano nella ricevuta fallita', async t => {
  const b = await banco(t, res => {
    res.writeHead(200, { 'Content-Type': 'text/event-stream' });
    res.end(textFrame + errorFrame + frame({ usage: { prompt_tokens: 50, completion_tokens: 6, cost: 0.001, raw: 'private-fixture' } }) + 'data: [DONE]\n\n');
  });
  await assert.rejects(b.run({ onDelta: () => {} }), unknown);
  assert.equal(b.requests.length, 1);
  assert.deepEqual(b.usage[0].usage, { prompt_tokens: 50, completion_tokens: 6, cost: 0.001 });
  assert.equal(b.usage[0].costoDichiarato, 0.001);
  assert.equal(b.usage[0].esito, 'interrotto');
});
test('STREAM-FRAMING: parser upstream, CRLF spezzato, data multilinea, UTF8, commenti', async () => {
  const bytes = new TextEncoder().encode(': keepalive\r\ndata:{"choices":\r\ndata:[{"delta":{"content":"caffè ☕"},"finish_reason":"stop"}]}\r\n\r\ndata:[DONE]\r\n\r\n');
  const r = new Response(new ReadableStream({ start(c) { for (const b of bytes) c.enqueue(Uint8Array.of(b)); c.close(); } }));
  const result = await consumaFlussoSSE(r);
  assert.equal(result.scelta.content, 'caffè ☕');
  assert.equal(result.finishReason, 'stop');
});
test('STREAM-EOF-READER: evento finale senza riga vuota non viene inventato', async () => {
  await assert.rejects(consumaFlussoSSE(new Response(textFrame + 'data: [DONE]')), e => {
    assert.equal(e.code, 'PROVIDER_STREAM_INCOMPLETE');
    assert.equal(e.parziale.content, 'Testo già ricevuto.'); return true;
  });
});
test('STREAM-DONE: il terminatore chiude anche se il server mantiene aperto il socket', async () => {
  let cancelled = false;
  const r = new Response(new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode(textFrame + 'data: [DONE]\n\n')); }, cancel() { cancelled = true; } }));
  const stop = new AbortController();
  const deadline = setTimeout(() => stop.abort(), 300);
  try {
    const result = await consumaFlussoSSE(r, null, { segnaleStop: stop.signal });
    assert.equal(result.scelta.content, 'Testo già ricevuto.'); assert.equal(cancelled, true);
  } finally { clearTimeout(deadline); }
});
test('STREAM-OPENROUTER-ERROR: errore nel corpo prima dei token conserva HTTP200, senza retry', async t => {
  const b = await banco(t, res => { res.writeHead(200, { 'Content-Type': 'text/event-stream' }); res.end(errorFrame + 'data: [DONE]\n\n'); });
  let calls = 0;
  const resilient = creaFetchOpenRouterResiliente(async (_url, init) => {
    calls++;
    return fetch(b.store.getRuntime('deepseek').endpoint, init);
  });
  await assert.rejects(chiamaConRitenta({ modello: 'x', chiave: 'fixture', messaggi: [], attrezzi: [], onDelta: () => {},
    fetchDiRete: resilient, dormi: async () => {}, accettaVuota: true }), unknown);
  assert.equal(calls, 1); assert.equal(b.requests.length, 1);
});
test('STREAM-TOOL-ABORT: tool mutante completo seguito da errore non scrive il file', async t => {
  const cartella = cartellaDiProva('provider-tool-error-');
  const b = await banco(t, res => {
    res.writeHead(200, { 'Content-Type': 'text/event-stream' });
    res.end(frame({ choices: [{ delta: { tool_calls: [{ index: 0, id: 'write_1', type: 'function', function: { name: 'scrivi', arguments: JSON.stringify({ percorso: 'should-not-exist.txt', testo: 'NO' }) } }] } }] }) + errorFrame + 'data: [DONE]\n\n');
  });
  const events = [];
  const result = await avviaSessione({ cartella, task: { consegna: 'scrivi il file di prova' }, modello: 'deepseek:deepseek-chat', chiave: 'unused',
    onEvento: e => events.push(e), talosLavoraFn: input => talosLavora({ ...input, fetchDiRete: b.transport }) });
  assert.equal(result.ok, false);
  assert.equal(result.codiceErrore, 'PROVIDER_OUTCOME_UNKNOWN');
  assert.equal(existsSync(join(cartella, 'should-not-exist.txt')), false);
  assert.ok(events.some(e => e.type === 'ToolCallResult' && e.toolCallId === 'write_1'));
  assert.equal(result.messaggiDelGiro.some(m => m.tool_calls?.length), false);
  noReplay(b);
});
test('STREAM-CHOICE-ERROR: errore dentro choice non autorizza testo riuscito', async t => {
  const b = await banco(t, res => { res.writeHead(200, { 'Content-Type': 'text/event-stream' });
    res.end(textFrame + frame({ choices: [{ delta: {}, error: { code: 502 } }] }) + 'data: [DONE]\n\n'); });
  await assert.rejects(b.run({ onDelta: () => {} }), unknown); noReplay(b);
});
test('STREAM-UNKNOWN-FINISH: un motivo finale sconosciuto senza DONE non certifica la chiusura', async () => {
  await assert.rejects(consumaFlussoSSE(new Response(textFrame + frame({ choices: [{ delta: {}, finish_reason: 'unexpected' }] }))), { code: 'PROVIDER_STREAM_INCOMPLETE' });
});
test('STREAM-FINISH-COMPAT: finali noti e messaggio intero locale restano supportati', async () => {
  for (const finish_reason of ['stop', 'length', 'tool_calls', 'function_call', 'content_filter']) {
    const r = await consumaFlussoSSE(new Response(frame({ choices: [{ message: { content: 'locale' }, finish_reason }] })));
    assert.equal(r.scelta.content, 'locale'); assert.equal(r.finishReason, finish_reason);
  }
});
test('STREAM-BUFFER-BOUND: evento incompleto oltre limite chiude il reader', async () => {
  let cancelled = false;
  const response = new Response(new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode('data: ' + 'x'.repeat(1_048_577))); }, cancel() { cancelled = true; } }));
  await assert.rejects(consumaFlussoSSE(response), { code: 'PROVIDER_STREAM_INVALID' });
  assert.equal(cancelled, true);
});
