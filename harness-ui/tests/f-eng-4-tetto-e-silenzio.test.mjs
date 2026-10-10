/*
 * F-ENG-4 (stress test of 0.5.0, 08/10/2026, session b7fb2459): a response showed 53 characters, then 20 silent minutes,
 * then the provider billed 32,000 completion tokens — the output cap — and the turn ended as `fermato` («generation
 * stopped without an answer»), with nothing retried. Owner decisions of 09/10/2026:
 *   · a response that ends on the output cap says so and is continued automatically, up to 3 times (Hermes
 *     agent/turn_truncation.py `_continue_text`, 4); after that the turn ends with its own outcome, `tetto-uscita`;
 *   · a stream that sends no text, reasoning or tool call for 5 minutes is cut and retried (Codex stream_idle_timeout_ms
 *     300000, OpenCode chunkTimeout 300000; Hermes 120 s). Keep-alive comments are not data. Before the first datum the
 *     transport guards stay as they were (a long local prefill sends nothing for minutes, llama.cpp#22997).
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { consumaFlussoSSE, talosLavora } from '../src/kernel/talosHarness.mjs';
import { cartellaDiProva } from './aiuto/cartelle-di-prova.mjs';

const enc = new TextEncoder();
const frame = (f) => enc.encode(`data: ${JSON.stringify(f)}\n\n`);
function flusso(fotogrammi) {
  return new Response(new ReadableStream({ start(c) { for (const f of fotogrammi) c.enqueue(frame(f)); c.enqueue(enc.encode('data: [DONE]\n\n')); c.close(); } }));
}
/* Data first, then only SSE comments (": OPENROUTER PROCESSING") every 40 ms until the reader lets go. */
function datiPoiSoloCommenti(fotogrammi, { finiscaDopoMs = null, poi = [] } = {}) {
  let timer = null; const inizio = Date.now();
  return new Response(new ReadableStream({
    start(c) {
      for (const f of fotogrammi) c.enqueue(frame(f));
      timer = setInterval(() => {
        if (finiscaDopoMs !== null && Date.now() - inizio >= finiscaDopoMs) {
          clearInterval(timer); for (const f of poi) c.enqueue(frame(f)); c.enqueue(enc.encode('data: [DONE]\n\n')); c.close(); return;
        }
        c.enqueue(enc.encode(': OPENROUTER PROCESSING\n\n'));
      }, 40);
    },
    cancel() { clearInterval(timer); },
  }));
}
const testo = (t, fine) => ({ choices: [{ delta: { content: t }, ...(fine ? { finish_reason: fine } : {}) }] });

test('F-ENG-4 SILENCE: after a datum, comments alone for the limit cut the stream as a provider silence, keeping the text', async () => {
  await assert.rejects(
    consumaFlussoSSE(datiPoiSoloCommenti([testo('I need a listing tool')]), () => {}, { inattivitaDatiMs: 300 }),
    (e) => e?.code === 'PROVIDER_SILENCE' && e.parziale?.content === 'I need a listing tool',
  );
});

test('F-ENG-4 SILENCE: before the first datum comments do not start the clock (a long prefill is not a dead stream)', async () => {
  const esito = await consumaFlussoSSE(datiPoiSoloCommenti([], { finiscaDopoMs: 700, poi: [testo('late but fine', 'stop')] }), () => {}, { inattivitaDatiMs: 300 });
  assert.equal(esito.scelta.content, 'late but fine');
});

test('F-ENG-4 SILENCE: data that keeps coming never trips the limit', async () => {
  let n = 0; let timer = null;
  const vivo = new Response(new ReadableStream({
    start(c) { timer = setInterval(() => { n += 1; if (n > 12) { clearInterval(timer); c.enqueue(frame(testo('.', 'stop'))); c.enqueue(enc.encode('data: [DONE]\n\n')); c.close(); return; } c.enqueue(frame(testo('x'))); }, 50); },
    cancel() { clearInterval(timer); },
  }));
  const esito = await consumaFlussoSSE(vivo, () => {}, { inattivitaDatiMs: 300 });
  assert.equal(esito.scelta.content, 'xxxxxxxxxxxx.');
});

async function lavora(risposte) {
  const richieste = []; const eventi = [];
  const esito = await talosLavora({
    cartella: cartellaDiProva('talos-f-eng-4-'), task: { consegna: 'write the answer' }, modello: 'x', chiave: 'y',
    onDelta: () => {}, onGiro: (e) => eventi.push(e),
    fetchDiRete: async (_url, init) => {
      richieste.push(JSON.parse(init.body));
      const prossima = risposte[Math.min(richieste.length - 1, risposte.length - 1)];
      return typeof prossima === 'function' ? prossima() : flusso(prossima);
    },
  });
  return { esito, richieste, eventi };
}
const ultimoUtente = (richiesta) => [...richiesta.messages].reverse().find((m) => m.role === 'user')?.content ?? '';

test('F-ENG-4 LENGTH: a text answer cut by the output cap is continued, and the turn ends when the answer does', async () => {
  const { esito, richieste } = await lavora([[testo('part one', 'length')], [testo(' part two', 'length')], [testo(' end', 'stop')]]);
  assert.equal(richieste.length, 3, 'two continuations, then the answer ended');
  assert.match(ultimoUtente(richieste[1]), /output length limit/u, 'the continuation tells the model why');
  const assistenti = richieste[2].messages.filter((m) => m.role === 'assistant').map((m) => m.content);
  assert.deepEqual(assistenti, ['part one', ' part two'], 'every cut part stays in the history, in order');
  assert.equal(esito.comeFinita, 'concluso');
});

test('F-ENG-4 LENGTH: after 3 continuations the turn ends with its own outcome, not «fermato»', async () => {
  const { esito, richieste } = await lavora([[testo('again', 'length')]]);
  assert.equal(richieste.length, 4, 'the first answer and 3 continuations');
  assert.equal(esito.comeFinita, 'tetto-uscita');
  assert.match(esito.detto, /output limit/u);
});

test('F-ENG-4 SILENCE: a stream that goes silent after its text is continued like a cut answer', async () => {
  const precedente = process.env.TALOS_STREAM_IDLE_MS;
  process.env.TALOS_STREAM_IDLE_MS = '300';
  try {
    const { esito, richieste } = await lavora([() => datiPoiSoloCommenti([testo('I need a listing tool')]), [testo(' — done.', 'stop')]]);
    assert.equal(richieste.length, 2, 'the silent request was cut and the answer continued');
    assert.match(ultimoUtente(richieste[1]), /went silent/u);
    assert.deepEqual(richieste[1].messages.filter((m) => m.role === 'assistant').map((m) => m.content), ['I need a listing tool']);
    assert.equal(esito.comeFinita, 'concluso');
  } finally {
    if (precedente === undefined) delete process.env.TALOS_STREAM_IDLE_MS; else process.env.TALOS_STREAM_IDLE_MS = precedente;
  }
});
