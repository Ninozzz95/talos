/*
 * ⛔⛔ STREAM-JSON-INTERO (08/10/2026, bugfixer; trovato indagando BC76-07) — un fornitore, un proxy o un server locale compatibile
 *   OpenAI che IGNORA `stream: true` e risponde con un `application/json` completo. Il lettore SSE non vedeva nessun evento, il
 *   flusso risultava «finito senza evento finale» (PROVIDER_STREAM_INCOMPLETE), cioè un esito INCERTO: da BUG-16 (7f8978489)
 *   si ritenta fino a 10 volte. Dieci richieste, forse pagate, per una risposta che era buona.
 * ⇒ Un corpo `application/json` senza cornice SSE, che si legge come oggetto JSON, è la risposta INTERA: si legge come il
 *   messaggio intero che il lettore già accetta dentro un fotogramma (il caso llama-server). Un JSON che non si legge resta
 *   incompleto, come prima: un flusso davvero rotto non diventa un successo.
 * Concorrenti, nel codice: Hermes non legge il JSON in streaming — zero frammenti ⇒ `EmptyStreamError`
 *   (`agent/chat_completion_helpers.py:3365-3367`), che finisce nei ritentativi per risposta vuota; OpenCode guarda il
 *   `content-type` solo per mettere la scadenza al flusso SSE (`packages/opencode/src/provider/provider.ts:40`).
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { chiamaConRitenta, consumaFlussoSSE } from '../src/kernel/talosHarness.mjs';

const completa = (extra = {}) => ({
  id: 'x', object: 'chat.completion', choices: [{ index: 0, message: { role: 'assistant', content: 'risposta intera' }, finish_reason: 'stop' }],
  usage: { prompt_tokens: 10, completion_tokens: 3 }, ...extra,
});
const json = (corpo, tipo = 'application/json') => new Response(typeof corpo === 'string' ? corpo : JSON.stringify(corpo), { headers: { 'content-type': tipo } });

test('STREAM-JSON-01 — una risposta application/json completa a una richiesta in streaming si legge, non è un flusso rotto', async () => {
  const r = await consumaFlussoSSE(json(completa()));
  assert.equal(r.scelta.content, 'risposta intera');
  assert.equal(r.finishReason, 'stop');
  assert.deepEqual(r.usage, { prompt_tokens: 10, completion_tokens: 3 });
});

test('STREAM-JSON-02 — anche con le chiamate ad attrezzo, e con «; charset=utf-8» nel content-type', async () => {
  const conAttrezzo = completa({ choices: [{ index: 0, finish_reason: 'tool_calls', message: { role: 'assistant', content: null,
    tool_calls: [{ id: 'c1', type: 'function', function: { name: 'leggi', arguments: '{"percorso":"a.txt"}' } }] } }] });
  const r = await consumaFlussoSSE(json(conAttrezzo, 'application/json; charset=utf-8'));
  assert.equal(r.finishReason, 'tool_calls');
  assert.equal(r.scelta.tool_calls?.[0]?.function?.name, 'leggi');
});

test('STREAM-JSON-02b — un JSON intero SENZA finish_reason (alcuni server lo omettono) è comunque completo: il corpo è finito', async () => {
  const r = await consumaFlussoSSE(json({ choices: [{ index: 0, message: { role: 'assistant', content: 'senza motivo finale' } }] }));
  assert.equal(r.scelta.content, 'senza motivo finale');
});

test('STREAM-JSON-03 — un errore del fornitore in JSON resta un errore del fornitore, con il suo motivo', async () => {
  const r = await consumaFlussoSSE(json({ error: { message: 'model overloaded', code: 503 } })).catch((e) => ({ errore: e }));
  const motivo = JSON.stringify(r.erroreFornitore ?? r.errore?.message ?? r);
  assert.match(motivo, /overloaded/u, `il motivo del fornitore deve arrivare: ${motivo}`);
});

test('STREAM-JSON-04 — al contrario: un JSON MOZZATO resta incompleto (incerto), non un successo inventato', async () => {
  await assert.rejects(consumaFlussoSSE(json('{"choices":[{"message":{"role":"assistant","content":"a metà')), { code: 'PROVIDER_STREAM_INCOMPLETE' });
});

test('STREAM-JSON-05 — al contrario: un flusso SSE davvero troncato (text/event-stream, niente fine) resta incompleto', async () => {
  const troncato = 'data: {"choices":[{"delta":{"content":"a metà"}}]}\n\n';
  await assert.rejects(consumaFlussoSSE(new Response(troncato, { headers: { 'content-type': 'text/event-stream' } })), { code: 'PROVIDER_STREAM_INCOMPLETE' });
});

test('STREAM-JSON-07 — lo Stop vince anche su un corpo JSON lento: esce subito, come l\'SSE, e il corpo vero viene annullato', async () => {
  // Review desktop 08/10: con `response.text()` fuori dalla gara lo Stop aspettava la fine del corpo (3 s) e finiva INCOMPLETO.
  let annullato = false
  let chiusura = null
  // Il corpo si chiude da solo dopo 3 s (come nella sonda della review): senza la gara la prova è ROSSA, non appesa.
  const lento = (tipo) => new Response(new ReadableStream({
    start(c) {
      c.enqueue(new TextEncoder().encode('{"choices":[{"index":0,"message":{"role":"assistant","content":"lento'))
      chiusura = setTimeout(() => { try { c.enqueue(new TextEncoder().encode('"}}]}')); c.close() } catch { /* già annullato */ } }, 3000)
    },
    cancel() { annullato = true; clearTimeout(chiusura) },
  }), { headers: { 'content-type': tipo } })
  for (const tipo of ['application/json', 'text/event-stream']) {
    annullato = false
    const ctrl = new AbortController()
    setTimeout(() => ctrl.abort(), 200)
    const t0 = Date.now()
    const esito = await consumaFlussoSSE(lento(tipo), () => {}, { segnaleStop: ctrl.signal }).then(() => null, (e) => e)
    const ms = Date.now() - t0
    assert.equal(esito?.fermatoSuRichiesta, true, `${tipo}: deve essere lo stop, non ${esito?.code ?? esito}`)
    assert.match(esito.message, /stopped on request/u)
    assert.ok(ms < 1000, `${tipo}: lo stop deve uscire subito, non dopo ${ms} ms`)
    assert.equal(annullato, true, `${tipo}: il corpo vero deve essere annullato, o la connessione resta aperta`)
  }
});

test('STREAM-JSON-08 — caratteri di più byte spezzati fra un pezzo e l\'altro arrivano interi', async () => {
  // Review desktop 08/10: senza `{ stream: true }` nel decode di ogni pezzo «é» e «🙂» tagliati a metà diventavano «�».
  const testo = 'Perché sì: è fatto 🙂 — ünïcødé ✓';
  const byte = new TextEncoder().encode(JSON.stringify(completa({ choices: [{ index: 0, finish_reason: 'stop', message: { role: 'assistant', content: testo } }] })));
  const corpo = new ReadableStream({
    start(c) { for (let i = 0; i < byte.length; i += 3) c.enqueue(byte.slice(i, i + 3)); c.close(); },
  });
  const r = await consumaFlussoSSE(new Response(corpo, { headers: { 'content-type': 'application/json' } }));
  assert.equal(r.scelta.content, testo);
});

test('STREAM-JSON-06 — capo a capo: un server che ignora stream:true riceve UNA richiesta, non dieci, e il giro ha la risposta', async (t) => {
  const richieste = [];
  const server = createServer(async (req, res) => {
    const pezzi = [];
    for await (const p of req) pezzi.push(p);
    richieste.push(JSON.parse(Buffer.concat(pezzi)));
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(completa()));
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise((ok) => { server.closeAllConnections(); server.close(ok); }));
  const indirizzo = `http://127.0.0.1:${server.address().port}/v1/chat/completions`;
  const r = await chiamaConRitenta({ modello: 'prova/modello', chiave: 'finta', messaggi: [{ role: 'user', content: 'ciao' }], attrezzi: [],
    fetchDiRete: (_url, opzioni) => fetch(indirizzo, opzioni), dormi: async () => {}, onDelta: () => {} });
  assert.equal(richieste.length, 1, `una risposta completa non si ritenta: ${richieste.length} richieste`);
  assert.equal(richieste[0].stream, true, 'premessa: la richiesta era in streaming');
  assert.equal(JSON.stringify(r).includes('risposta intera'), true, JSON.stringify(r).slice(0, 300));
});
