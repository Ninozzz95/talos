/*
 * Il piano su collegamento aperto (forma chiusa dalle tre sessioni il 31/10/2026). Un finto `WebSocket`: niente rete.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { calcolaContinuazione, creaCollegamentiDelPiano, statoDopoRisposta, INATTIVITA_MS, ATTESA_PRIMO_EVENTO_MS, DURATA_MASSIMA_MS, PAUSA_DOPO_CADUTA_MS, collegamentiDelProcesso } from '../src/chatgpt-collegamento.mjs';

class Finto extends EventTarget {
  static aperti = [];
  static rifiuta = false;
  static lancia = false;
  static maiAperto = false;
  readyState = 0;
  mandati = [];
  constructor(indirizzo, opzioni) {
    if (Finto.lancia) throw new TypeError('headers not supported');
    super();
    this.indirizzo = indirizzo;
    this.opzioni = opzioni;
    Finto.aperti.push(this);
    if (Finto.maiAperto) return;
    queueMicrotask(() => {
      if (Finto.rifiuta) { this.dispatchEvent(new Event('error')); return; }
      this.readyState = 1;
      this.dispatchEvent(new Event('open'));
    });
  }
  send(testo) { this.mandati.push(JSON.parse(testo)); }
  close() { if (this.readyState === 3) return; this.readyState = 3; this.dispatchEvent(new Event('close')); }
  arriva(evento) { this.dispatchEvent(new MessageEvent('message', { data: JSON.stringify(evento) })); }
  cade() { this.readyState = 3; this.dispatchEvent(new Event('close')); }
}

function banco() {
  Finto.aperti = [];
  Finto.rifiuta = false;
  Finto.lancia = false;
  Finto.maiAperto = false;
  const timer = [];
  let adesso = 1_000;
  const c = creaCollegamentiDelPiano({
    webSocketFn: Finto,
    ora: () => adesso,
    pianifica: (fn, ms) => { const t = { fn, ms }; timer.push(t); return t; },
    annulla: (t) => { const i = timer.indexOf(t); if (i >= 0) timer.splice(i, 1); },
  });
  return { c, timer, avanza: (ms) => { adesso += ms; }, scatta: (ms) => { const t = timer.find((x) => x.ms === ms); assert.ok(t, `timer ${ms}`); timer.splice(timer.indexOf(t), 1); t.fn(); } };
}

const INT = () => new Headers({ authorization: 'Bearer a', 'session-id': 'k', 'content-type': 'application/json' });
const corpo = (input, extra = {}) => ({ model: 'm', stream: true, store: false, prompt_cache_key: 'k', input, ...extra });
const U = { role: 'user', content: 'a' };
const NOTA = { role: 'developer', content: 'nota' };
const pausa = () => new Promise((r) => setImmediate(r));
const chiamata = (id) => ({ type: 'function_call', call_id: id, name: 't', arguments: '{}' });
const esito = (id) => ({ type: 'function_call_output', call_id: id, output: 'ok' });

async function primoGiro(b, input = [U, NOTA], id = 'r1', uscite = [chiamata('c1')]) {
  const p = b.c.invia('https://api.openai.com/v1/responses', {}, corpo(input), INT());
  await pausa(); await pausa();
  const ws = Finto.aperti.at(-1);
  ws.arriva({ type: 'response.created' });
  const r = await p;
  for (const item of uscite) ws.arriva({ type: 'response.output_item.done', item });
  ws.arriva({ type: 'response.completed', response: { id } });
  return { ws, r };
}

test('COLL-01 the next step sends only what is new, without the note at the tail and without the model output', async () => {
  const b = banco();
  const { ws, r } = await primoGiro(b);
  assert.match(await r.text(), /response\.completed/u);
  assert.equal(ws.mandati[0].stream, undefined);
  assert.equal(ws.mandati[0].input.length, 2);
  const p = b.c.invia('x', {}, corpo([U, { type: 'reasoning', id: 'z' }, chiamata('c1'), esito('c1'), NOTA]), INT());
  await pausa();
  assert.equal(ws.mandati[1].previous_response_id, 'r1');
  assert.deepEqual(ws.mandati[1].input, [esito('c1')]);
  assert.equal(Finto.aperti.length, 1);
  ws.arriva({ type: 'response.created' });
  await p;
});

test('COLL-02 a changed history, a changed field or an unknown call send the whole input', () => {
  const primo = corpo([U]);
  const s = statoDopoRisposta(primo, 'r1', [chiamata('c1')]);
  const dopo = [U, chiamata('c1'), esito('c1')];
  assert.deepEqual(calcolaContinuazione(s, corpo(dopo)), { previous_response_id: 'r1', input: [esito('c1')] });
  assert.equal(calcolaContinuazione(s, corpo([{ role: 'user', content: 'b' }, ...dopo.slice(1)])), null, 'storia cambiata');
  assert.equal(calcolaContinuazione(s, corpo(dopo, { model: 'n' })), null, 'campo cambiato');
  assert.equal(calcolaContinuazione(s, corpo([U, chiamata('zz'), esito('zz')])), null, 'chiamata sconosciuta');
  assert.equal(calcolaContinuazione(s, corpo([U])), null, 'niente di nuovo');
  assert.equal(calcolaContinuazione(null, corpo([U])), null, 'primo passo');
  const conNota = statoDopoRisposta(corpo([U, NOTA]), 'r2', [chiamata('c1')]);
  assert.equal(calcolaContinuazione(conNota, corpo([U, chiamata('c1'), esito('c1'), { role: 'developer', content: 'altra' }])), null, 'nota cambiata');
});

test('COLL-03 the state keeps fingerprints, not the history (Mobile)', () => {
  const s = statoDopoRisposta(corpo([U, { role: 'user', content: 'x'.repeat(10_000) }]), 'r1', []);
  assert.ok(JSON.stringify({ ...s, chiamate: [] }).length < 500);
});

test('COLL-04 a refused connection answers null, so HTTP shows the true 429, and retries after a pause (Mobile: a network drop is not a refusal)', async () => {
  const b = banco();
  Finto.rifiuta = true;
  assert.equal(await b.c.invia('x', {}, corpo([U]), INT()), null);
  assert.equal(Finto.aperti.length, 1);
  Finto.rifiuta = false;
  assert.equal(await b.c.invia('x', {}, corpo([U]), INT()), null, 'in pausa non si riprova');
  assert.equal(Finto.aperti.length, 1);
  b.avanza(PAUSA_DOPO_CADUTA_MS + 1);
  const p = b.c.invia('x', {}, corpo([U]), INT());
  await pausa(); await pausa();
  assert.equal(Finto.aperti.length, 2);
  Finto.aperti[1].arriva({ type: 'response.created' });
  assert.ok(await p);
});

test('COLL-05 a WebSocket without headers falls back to HTTP without errors, for the whole session (installed app)', async () => {
  const b = banco();
  Finto.lancia = true;
  assert.equal(await b.c.invia('x', {}, corpo([U]), INT()), null);
  Finto.lancia = false;
  b.avanza(PAUSA_DOPO_CADUTA_MS * 10);
  assert.equal(await b.c.invia('x', {}, corpo([U]), INT()), null);
  assert.equal(Finto.aperti.length, 0);
});

test('COLL-06 a silent connection: after the wait it closes and HTTP takes over with the whole input (Mobile)', async () => {
  const b = banco();
  const { ws } = await primoGiro(b);
  const p = b.c.invia('x', {}, corpo([U, chiamata('c1'), esito('c1'), NOTA]), INT());
  await pausa();
  b.scatta(ATTESA_PRIMO_EVENTO_MS);
  assert.equal(await p, null);
  assert.equal(ws.readyState, 3);
  assert.equal(b.c.aperti, 0);
  const q = b.c.invia('x', {}, corpo([U, chiamata('c1'), esito('c1'), NOTA]), INT());
  await pausa(); await pausa();
  assert.equal(Finto.aperti.length, 2, 'dopo una caduta, un collegamento nuovo');
  assert.equal(Finto.aperti[1].mandati[0].previous_response_id, undefined, 'e input intero');
  Finto.aperti[1].arriva({ type: 'response.created' });
  await q;
});

test('COLL-07 previous_response_not_found: the same request again with the whole input, once', async () => {
  const b = banco();
  const { ws } = await primoGiro(b);
  const p = b.c.invia('x', {}, corpo([U, chiamata('c1'), esito('c1'), NOTA]), INT());
  await pausa();
  ws.arriva({ type: 'error', status: 400, error: { code: 'previous_response_not_found' } });
  await pausa();
  assert.equal(ws.mandati.length, 3);
  assert.equal(ws.mandati[2].previous_response_id, undefined);
  assert.equal(ws.mandati[2].input.length, 4);
  ws.arriva({ type: 'response.created' });
  assert.ok(await p);
});

test('COLL-08 any other error before the first event goes to HTTP, with its status and headers', async () => {
  const b = banco();
  const p = b.c.invia('x', {}, corpo([U]), INT());
  await pausa(); await pausa();
  Finto.aperti[0].arriva({ type: 'error', status: 429, error: { code: 'rate_limit_exceeded' } });
  assert.equal(await p, null);
  assert.equal(b.c.aperti, 0);
});

test('COLL-09 a drop in the middle is an interrupted stream, and the next attempt sends the whole input', async () => {
  const b = banco();
  const p = b.c.invia('x', {}, corpo([U]), INT());
  await pausa(); await pausa();
  const ws = Finto.aperti[0];
  ws.arriva({ type: 'response.created' });
  const r = await p;
  ws.cade();
  await assert.rejects(r.text(), (errore) => { assert.match(errore.message, /closed before the response finished/u); assert.equal(errore.code, 'PROVIDER_STREAM_INCOMPLETE'); return true; });
  assert.equal(b.c.aperti, 0);
});

test('COLL-10 Stop closes the connection and clears the state', async () => {
  const b = banco();
  const stop = new AbortController();
  const p = b.c.invia('x', { signal: stop.signal }, corpo([U]), INT());
  await pausa(); await pausa();
  const ws = Finto.aperti[0];
  ws.arriva({ type: 'response.created' });
  const r = await p;
  stop.abort();
  await assert.rejects(r.text(), /Aborted/u);
  assert.equal(ws.readyState, 3);
  assert.equal(b.c.aperti, 0);
});

test('COLL-11 two requests together: the second goes to HTTP', async () => {
  const b = banco();
  const p = b.c.invia('x', {}, corpo([U]), INT());
  await pausa(); await pausa();
  assert.equal(await b.c.invia('x', {}, corpo([U]), INT()), null);
  Finto.aperti[0].arriva({ type: 'response.created' });
  await p;
});

test('COLL-12 an idle connection closes on its own (Desktop), and so does one past its time, or with a renewed token', async () => {
  const b = banco();
  const { ws } = await primoGiro(b);
  b.scatta(INATTIVITA_MS);
  assert.equal(ws.readyState, 3);
  assert.equal(b.c.aperti, 0);
  const secondo = await primoGiro(b);
  b.avanza(DURATA_MASSIMA_MS + 1);
  const p = b.c.invia('x', {}, corpo([U, chiamata('c1'), esito('c1'), NOTA]), INT());
  await pausa(); await pausa();
  assert.equal(secondo.ws.readyState, 3);
  Finto.aperti.at(-1).arriva({ type: 'response.created' });
  const r = await p;
  Finto.aperti.at(-1).arriva({ type: 'response.completed', response: { id: 'r9' } });
  await r.text();
  const terzo = Finto.aperti.at(-1);
  const q = b.c.invia('x', {}, corpo([U, chiamata('c1'), esito('c1'), chiamata('c2'), esito('c2'), NOTA]), new Headers({ authorization: 'Bearer nuovo' }));
  await pausa(); await pausa();
  assert.equal(terzo.readyState, 3, 'token rinnovato: collegamento nuovo');
  Finto.aperti.at(-1).arriva({ type: 'response.created' });
  await q;
});

test('COLL-13 closing everything leaves nothing open and no timer running (CLI: -p must exit)', async () => {
  const b = banco();
  const { ws } = await primoGiro(b);
  assert.equal(b.c.aperti, 1);
  b.c.chiudiTutti();
  assert.equal(ws.readyState, 3);
  assert.equal(b.c.aperti, 0);
  assert.equal(b.timer.length, 0);
});

test('COLL-14 the phone stays on HTTP with its variable', () => {
  assert.equal(collegamentiDelProcesso({ TALOS_PIANO_SENZA_COLLEGAMENTO: '1' }), null);
});

test('COLL-15 inside the plan fetch: a Response from the connection goes back as it is, null goes to HTTP, and no connection without the port (CLI)', async () => {
  const { creaFetchDelPiano } = await import('../src/chatgpt-richiesta.mjs');
  const chieste = [];
  const fetchFinta = async () => { chieste.push('http'); return new Response('data: {}\n\n', { status: 429, headers: { 'retry-after': '7' } }); };
  const richiesta = { method: 'POST', headers: { authorization: 'Bearer a' }, body: JSON.stringify({ model: 'm', stream: true, input: [U] }) };
  const giaPronta = new Response('flusso');
  const conRisposta = creaFetchDelPiano(fetchFinta, { collegamenti: { invia: async () => giaPronta } });
  assert.equal(await conRisposta('https://api.openai.com/v1/responses', richiesta), giaPronta);
  assert.deepEqual(chieste, []);
  const conNull = creaFetchDelPiano(fetchFinta, { collegamenti: { invia: async () => null } });
  const r = await conNull('https://api.openai.com/v1/responses', richiesta);
  assert.equal(r.status, 429, 'il 429 vero lo mostra HTTP');
  assert.equal(r.headers.get('retry-after'), '7');
  assert.deepEqual(chieste, ['http']);
  const senza = creaFetchDelPiano(fetchFinta);
  await senza('https://api.openai.com/v1/responses', richiesta);
  assert.deepEqual(chieste, ['http', 'http']);
});

test('COLL-16 nothing goes to HTTP on a timer: the official route declares no limits on a good answer, so a periodic read would only cost the whole input', async () => {
  const b = banco();
  const { r: prima } = await primoGiro(b);
  await prima.text();
  b.avanza(600_001);
  const p = b.c.invia('x', {}, corpo([U, chiamata('c1'), esito('c1'), NOTA]), INT());
  await pausa(); await pausa();
  assert.equal(Finto.aperti.length, 1, 'same connection');
  assert.equal(Finto.aperti[0].mandati.at(-1).previous_response_id, 'r1');
  Finto.aperti[0].arriva({ type: 'response.created' });
  const r = await p;
  Finto.aperti[0].arriva({ type: 'response.completed', response: { id: 'r2' } });
  await r.text();
  b.c.chiudiTutti();
});

test('COLL-17 Stop already pressed sends nothing, and a Stop after HTTP does not close a later connection (Desktop)', async () => {
  const b = banco();
  const fermo = new AbortController();
  fermo.abort();
  const prima = await primoGiro(b);
  const fine = await b.c.invia('x', { signal: fermo.signal }, corpo([U, chiamata('c1'), esito('c1'), NOTA]), INT());
  assert.equal(fine, null);
  assert.equal(prima.ws.mandati.length, 1, 'niente di mandato');
  const stop = new AbortController();
  const p = b.c.invia('x', { signal: stop.signal }, corpo([U]), INT());
  await pausa(); await pausa();
  const ws = Finto.aperti.at(-1);
  ws.arriva({ type: 'error', status: 429, error: { code: 'rate_limit_exceeded' } });
  assert.equal(await p, null);
  const nuovo = await primoGiro(b);
  stop.abort();
  assert.notEqual(nuovo.ws.readyState, 3, 'il vecchio Stop non tocca il collegamento nuovo');
});

test('COLL-18 without a cache key there is no connection, and a send that throws goes to HTTP (Desktop)', async () => {
  const b = banco();
  assert.equal(await b.c.invia('x', {}, { model: 'm', input: [U] }, INT()), null);
  assert.equal(Finto.aperti.length, 0);
  const { ws } = await primoGiro(b);
  ws.send = () => { throw new Error('caduto'); };
  assert.equal(await b.c.invia('x', {}, corpo([U, chiamata('c1'), esito('c1'), NOTA]), INT()), null);
  assert.equal(b.c.aperti, 0);
});

test('COLL-19 the connection comes from the host: through the real router, with the fetch wrapped, it carries the request; without the port it is HTTP', async () => {
  const { creaFetchMultiProvider } = await import('../src/runtime-owner-adapter.mjs');
  const { chiamaConRitenta } = await import('../src/kernel/talosHarness.mjs');
  const risposta = { id: 'resp_1', object: 'response', created_at: 1791700000, status: 'completed', model: 'gpt-6-luna', output: [{ id: 'msg_1', type: 'message', role: 'assistant', status: 'completed', content: [{ type: 'output_text', text: 'ok', annotations: [] }] }], usage: { input_tokens: 3, input_tokens_details: { cached_tokens: 0 }, output_tokens: 2, output_tokens_details: { reasoning_tokens: 0 }, total_tokens: 5 } };
  const flusso = () => new Response([{ type: 'response.created', response: { id: 'resp_1', created_at: 1791700000, model: 'gpt-6-luna' } }, { type: 'response.output_item.added', output_index: 0, item: { id: 'msg_1', type: 'message', role: 'assistant', content: [] } }, { type: 'response.output_text.delta', item_id: 'msg_1', output_index: 0, content_index: 0, delta: 'ok' }, { type: 'response.output_item.done', output_index: 0, item: risposta.output[0] }, { type: 'response.completed', response: risposta }].map((e) => `event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`).join(''), { status: 200, headers: { 'content-type': 'text/event-stream' } });
  const gira = async (collegamentiDelPiano) => {
    const conteggi = { rete: 0 };
    const avvolta = async () => { conteggi.rete += 1; return flusso(); };
    const dipendenze = { leggiChiave: () => null, leggiRuntime: () => ({}), leggiTokenDelPiano: async () => 'TOKEN', registraUsoDelPiano: async () => {}, registraLimitiDelPiano: () => {}, ...(collegamentiDelPiano ? { collegamentiDelPiano } : {}) };
    const fetchDiRete = creaFetchMultiProvider(avvolta, { dipendenze });
    await chiamaConRitenta({ modello: 'chatgpt:gpt-6-luna', chiave: 'x', messaggi: [{ role: 'user', content: 'ciao' }], attrezzi: [], maxOutputTokens: 77, fetchDiRete, onDelta: () => {}, dormi: async () => {}, caso: () => 0 });
    return conteggi.rete;
  };
  let inviate = 0;
  assert.equal(await gira({ invia: async () => { inviate += 1; return flusso(); } }), 0, 'nothing goes over HTTP');
  assert.equal(inviate, 1);
  assert.equal(await gira(null), 1, 'no port, HTTP');
});

/* Il motore vero delle richieste con un collegamento finto che cade: `pezzi` sono gli eventi che arrivano prima della caduta. */
async function cadeDopo(pezzi, { poi = null } = {}) {
  const { creaFetchMultiProvider } = await import('../src/runtime-owner-adapter.mjs');
  const { chiamaConRitenta } = await import('../src/kernel/talosHarness.mjs');
  let inviate = 0;
  const caduta = () => Object.assign(new Error('The connection closed before the response finished.'), { code: 'PROVIDER_STREAM_INCOMPLETE' });
  const sse = (e) => new TextEncoder().encode(`event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`);
  const invia = async () => {
    inviate += 1;
    if (inviate > 1 && poi) return poi();
    return new Response(new ReadableStream({ start(c) { for (const e of pezzi) c.enqueue(sse(e)); setTimeout(() => c.error(caduta()), 5); } }), { status: 200, headers: { 'content-type': 'text/event-stream' } });
  };
  const dipendenze = { leggiChiave: () => null, leggiRuntime: () => ({}), leggiTokenDelPiano: async () => 'TOKEN', registraUsoDelPiano: async () => {}, registraLimitiDelPiano: () => {}, collegamentiDelPiano: { invia } };
  const fetchDiRete = creaFetchMultiProvider(async () => { throw new Error('nothing goes over HTTP here'); }, { dipendenze, providerStore: { hasKey: () => false, elencaPool: () => [], scegliChiave: () => null } });
  const esito = await chiamaConRitenta({ modello: 'chatgpt:gpt-6-luna', chiave: 'x', messaggi: [{ role: 'user', content: 'ciao' }], attrezzi: [], maxOutputTokens: 77, fetchDiRete, onDelta: () => {}, dormi: async () => {}, caso: () => 0 }).then((valore) => ({ valore }), (errore) => ({ errore }));
  return { ...esito, inviate: () => inviate };
}
const CREATA = { type: 'response.created', response: { id: 'resp_1', created_at: 1791700000, model: 'gpt-6-luna' } };
const TESTO = [CREATA, { type: 'response.output_item.added', output_index: 0, item: { id: 'msg_1', type: 'message', role: 'assistant', content: [] } }, { type: 'response.output_text.delta', item_id: 'msg_1', output_index: 0, content_index: 0, delta: 'Sto' }];

test('COLL-20 the connection drops in the middle of a response: an uncertain outcome the kernel can repeat, never a plan error that ends the turn', async () => {
  const { errore, inviate } = await cadeDopo(TESTO);
  assert.equal(errore?.code, 'PROVIDER_OUTCOME_UNKNOWN');
  assert.equal(errore.esitoIncerto, true);
  assert.equal(inviate(), 1, 'text already delivered: nothing is repeated behind the turn');
});

test('COLL-21 the connection drops before anything reached the turn: the same request goes again, once', async () => {
  const risposta = { id: 'resp_2', object: 'response', created_at: 1791700000, status: 'completed', model: 'gpt-6-luna', output: [{ id: 'msg_2', type: 'message', role: 'assistant', status: 'completed', content: [{ type: 'output_text', text: 'ok', annotations: [] }] }], usage: { input_tokens: 3, input_tokens_details: { cached_tokens: 0 }, output_tokens: 2, output_tokens_details: { reasoning_tokens: 0 }, total_tokens: 5 } };
  const poi = () => new Response([CREATA, { type: 'response.output_item.added', output_index: 0, item: { id: 'msg_2', type: 'message', role: 'assistant', content: [] } }, { type: 'response.output_text.delta', item_id: 'msg_2', output_index: 0, content_index: 0, delta: 'ok' }, { type: 'response.output_item.done', output_index: 0, item: risposta.output[0] }, { type: 'response.completed', response: risposta }].map((e) => `event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`).join(''), { status: 200, headers: { 'content-type': 'text/event-stream' } });
  const { errore, valore, inviate } = await cadeDopo([CREATA], { poi });
  assert.equal(errore, undefined, String(errore?.code));
  assert.ok(valore);
  assert.equal(inviate(), 2);
});

test('COLL-22 it drops twice before anything arrives: no loop, and not a plan error', async () => {
  const { errore, inviate } = await cadeDopo([CREATA]);
  assert.equal(inviate(), 2);
  assert.equal(errore?.code, 'PROVIDER_OUTCOME_UNKNOWN');
});

const bot = (testo) => ({ role: 'assistant', content: [{ type: 'output_text', text: testo }] });
const uscitaDi = (testo) => ({ type: 'message', role: 'assistant', content: [{ type: 'output_text', text: testo }] });
async function rispondi(b, input, id, testo) {
  const p = b.c.invia('https://api.openai.com/v1/responses', {}, corpo(input), INT());
  await pausa(); await pausa();
  const ws = Finto.aperti.at(-1);
  ws.arriva({ type: 'response.created' });
  await p;
  ws.arriva({ type: 'response.output_item.done', item: uscitaDi(testo) });
  ws.arriva({ type: 'response.completed', response: { id } });
  return ws;
}

test('COLL-23 two conversations with the same first message never continue from each other (the branch of Retry)', async () => {
  const b = banco();
  await rispondi(b, [U], 'resp_A', 'answer of A');
  const ws = await rispondi(b, [U], 'resp_B', 'answer of B');
  assert.equal(Finto.aperti.length, 1);
  const nuova = { role: 'user', content: 'and now?' };
  b.c.invia('https://api.openai.com/v1/responses', {}, corpo([U, bot('answer of A'), nuova]), INT());
  await pausa(); await pausa();
  const mandato = ws.mandati.at(-1);
  assert.equal(mandato.previous_response_id, undefined, 'A must not continue from the answer of B');
  assert.equal(mandato.input.length, 3, 'A sends its whole history');
  b.c.chiudiTutti();
});

test('COLL-24 the same conversation still continues: the local history may hold the text as a string, or with other spaces around it', () => {
  const stato = statoDopoRisposta(corpo([U]), 'r1', [uscitaDi('  the answer\n')]);
  const nuova = { role: 'user', content: 'next' };
  for (const voce of [bot('the answer'), { role: 'assistant', content: 'the answer' }, bot('  the answer\n')]) {
    assert.deepEqual(calcolaContinuazione(stato, corpo([U, voce, nuova])), { previous_response_id: 'r1', input: [nuova] });
  }
  assert.equal(calcolaContinuazione(stato, corpo([U, bot('another answer'), nuova])), null);
  assert.equal(calcolaContinuazione(stato, corpo([U, nuova])), null, 'the model wrote something the history does not hold');
});

test('COLL-25 two requests with the same key while it opens: one connection, the second goes to HTTP, nothing is left open', async () => {
  const b = banco();
  Finto.maiAperto = true;
  const primo = b.c.invia('https://api.openai.com/v1/responses', {}, corpo([U]), INT());
  assert.equal(await b.c.invia('https://api.openai.com/v1/responses', {}, corpo([U]), INT()), null);
  assert.equal(Finto.aperti.length, 1);
  const ws = Finto.aperti[0];
  ws.readyState = 1;
  ws.dispatchEvent(new Event('open'));
  await pausa();
  ws.arriva({ type: 'response.created' });
  assert.ok(await primo);
  b.c.chiudiTutti();
  assert.equal(ws.readyState, 3);
  assert.equal(b.c.aperti, 0);
});

test('COLL-26 Stop while it opens comes back at once, closes the socket and does not count as a network failure', async () => {
  const b = banco();
  Finto.maiAperto = true;
  const stop = new AbortController();
  const p = b.c.invia('https://api.openai.com/v1/responses', { signal: stop.signal }, corpo([U]), INT());
  await pausa();
  stop.abort();
  assert.equal(await p, null);
  assert.equal(Finto.aperti[0].readyState, 3);
  assert.equal(b.c.aperti, 0);
  assert.deepEqual(b.timer, [], 'the opening timer is gone');
  Finto.maiAperto = false;
  b.c.invia('https://api.openai.com/v1/responses', {}, corpo([U]), INT());
  await pausa(); await pausa();
  assert.equal(Finto.aperti.length, 2, 'no pause after a Stop: the next request opens at once');
  b.c.chiudiTutti();
});

test('COLL-27 closing everything while it opens leaves nothing behind (CLI: -p must exit)', async () => {
  const b = banco();
  Finto.maiAperto = true;
  const p = b.c.invia('https://api.openai.com/v1/responses', {}, corpo([U]), INT());
  await pausa();
  b.c.chiudiTutti();
  assert.equal(await p, null);
  assert.equal(Finto.aperti[0].readyState, 3);
  assert.deepEqual(b.timer, []);
  assert.equal(b.c.aperti, 0);
});

test('COLL-28 through the real turn: after text and a call, the next request still continues from the response (the text in the local history matches)', async () => {
  const { creaFetchMultiProvider } = await import('../src/runtime-owner-adapter.mjs');
  const { talosLavora } = await import('../src/kernel/talosHarness.mjs');
  const { cartellaDiProva } = await import('./aiuto/cartelle-di-prova.mjs');
  const { writeFileSync } = await import('node:fs');
  const { join } = await import('node:path');
  const cartella = cartellaDiProva('talos-coll-28-');
  writeFileSync(join(cartella, 'a.txt'), 'contenuto\n');
  const uso = { input_tokens: 10, output_tokens: 5, total_tokens: 15, input_tokens_details: { cached_tokens: 0 }, output_tokens_details: { reasoning_tokens: 0 } };
  const creata = (id) => ({ type: 'response.created', response: { id, created_at: 1791700000, model: 'gpt-6-luna' } });
  const finita = (id) => ({ type: 'response.completed', response: { id, object: 'response', created_at: 1791700000, status: 'completed', model: 'gpt-6-luna', output: [], usage: uso } });
  const messaggio = (id, testo) => [
    { type: 'response.output_item.added', output_index: 0, item: { id, type: 'message', role: 'assistant', status: 'in_progress', content: [] } },
    { type: 'response.output_text.delta', item_id: id, output_index: 0, content_index: 0, delta: testo },
    { type: 'response.output_item.done', output_index: 0, item: { id, type: 'message', role: 'assistant', status: 'completed', content: [{ type: 'output_text', text: testo, annotations: [] }] } },
  ];
  const chiamata = { id: 'fc_1', type: 'function_call', status: 'completed', call_id: 'call_1', name: 'leggi', arguments: '{"percorso":"a.txt"}' };
  const copioni = [
    [creata('resp_1'), ...messaggio('msg_1', '  Leggo il file.\n\n'),
      { type: 'response.output_item.added', output_index: 1, item: { ...chiamata, status: 'in_progress', arguments: '' } },
      { type: 'response.function_call_arguments.delta', item_id: 'fc_1', output_index: 1, delta: chiamata.arguments },
      { type: 'response.output_item.done', output_index: 1, item: chiamata }, finita('resp_1')],
    [creata('resp_2'), ...messaggio('msg_2', 'Fatto.'), finita('resp_2')],
  ];
  class Attore extends Finto {
    send(testo) {
      super.send(testo);
      const copione = copioni[this.mandati.length - 1];
      setImmediate(() => { for (const evento of copione ?? []) this.arriva(evento); });
    }
  }
  banco(); // azzera il finto: la prova prima lascia un collegamento che non si apre
  const collegamentiDelPiano = creaCollegamentiDelPiano({ webSocketFn: Attore });
  const dipendenze = { leggiChiave: () => null, leggiRuntime: () => ({}), leggiTokenDelPiano: async () => 'TOKEN', registraUsoDelPiano: async () => {}, registraLimitiDelPiano: () => {}, collegamentiDelPiano };
  const fetchDiRete = creaFetchMultiProvider(async () => { throw new Error('nothing goes over HTTP here'); }, { dipendenze, providerStore: { hasKey: () => false, elencaPool: () => [], scegliChiave: () => null } });
  await talosLavora({ cartella, task: { consegna: 'leggi a.txt' }, modello: 'chatgpt:gpt-6-luna', chiave: 'x', onDelta: () => {}, fetchDiRete });
  collegamentiDelPiano.chiudiTutti();
  const [ws] = Finto.aperti;
  assert.equal(ws.mandati.length, 2);
  assert.equal(ws.mandati[1].previous_response_id, 'resp_1', 'the next step continues: the comparison of the text must not switch the gain off');
  assert.ok(ws.mandati[1].input.every((voce) => voce.role !== 'assistant' && voce.type !== 'function_call'), 'only what is new');
  assert.equal(ws.mandati[1].input.some((voce) => voce.type === 'function_call_output'), true);
});

test('COLL-29 closing everything in the same tick as the open event: the socket closes all the same', async () => {
  const b = banco();
  Finto.maiAperto = true;
  const p = b.c.invia('https://api.openai.com/v1/responses', {}, corpo([U]), INT());
  await pausa();
  const ws = Finto.aperti[0];
  ws.readyState = 1;
  ws.dispatchEvent(new Event('open'));
  b.c.chiudiTutti();
  assert.equal(await p, null);
  assert.equal(ws.readyState, 3);
  assert.equal(ws.mandati.length, 0, 'nothing is sent');
  assert.equal(b.c.aperti, 0);
});

