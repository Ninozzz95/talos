/*
 * ⭐ L1 1.3 — la finestra che cresce, lungo l'adattatore (`creaFetchMultiProvider`): un 400 «exceed_context_size_error» del motore
 *   locale di questo PC ⇒ il server riapre più grande (dipendenza `allargaFinestraLocale`), la STESSA richiesta riparte una volta,
 *   e la conversazione ha una riga di stato (onAvviso con `riga: 'finestra-locale'`). Al contrario: se non si può, l'errore sale
 *   com'era (il kernel riassume, come oggi); mai il motore dell'app; mai due allargamenti per una richiesta; senza la dipendenza
 *   (la CLI) tutto come prima.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { creaFetchMultiProvider } from '../src/runtime-owner-adapter.mjs';

const PIENO = JSON.stringify({ error: { code: 400, message: 'request (17432 tokens) exceeds the available context size (16384 tokens), try increasing it', type: 'exceed_context_size_error', n_prompt_tokens: 17432, n_ctx: 16384 } });
const RISPOSTA = { choices: [{ message: { role: 'assistant', content: 'fatto' }, finish_reason: 'stop' }] };

function banco({ risposte, allarga = async () => ({ ok: true, prima: 16_384, dopo: 24_576, massimo: 131_072, memoriaInPiu: 409_600_000, nome: 'LFM2.5 24B' }), senzaDipendenza = false } = {}) {
  const corpi = [];
  const allargamenti = [];
  const avvisi = [];
  const dipendenze = {
    leggiChiave: () => null, leggiRuntime: () => ({}), localePronto: () => true,
    chiamaLocale: async (_percorso, opzioni) => {
      corpi.push(opzioni.body);
      const prossima = risposte.shift() ?? 'ok';
      return prossima === 'pieno' ? new Response(PIENO, { status: 400, headers: { 'Content-Type': 'application/json' } }) : Response.json(RISPOSTA);
    },
    ...(senzaDipendenza ? {} : { allargaFinestraLocale: async (richiesta) => { allargamenti.push(richiesta); return allarga(richiesta); } }),
  };
  const f = creaFetchMultiProvider(fetch, { dipendenze, onAvviso: async (messaggio, opzioni) => { avvisi.push({ messaggio, opzioni }); } });
  const chiedi = (attrezzi = []) => f('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST', headers: { Authorization: 'Bearer x' },
    body: JSON.stringify({ model: 'local:lfm25-24b', messages: [{ role: 'user', content: 'rifattorizza il modulo' }], ...(attrezzi.length ? { tools: attrezzi } : {}) }),
  });
  return { chiedi, corpi, allargamenti, avvisi };
}
const ATTREZZO = { type: 'function', function: { name: 'leggi', description: 'legge', parameters: { type: 'object', properties: {} } } };

for (const [nome, attrezzi] of [['senza attrezzi', []], ['con attrezzi', [ATTREZZO]]]) {
  test(`FC-ADATT-01 (${nome}) pieno ⇒ allargata, la STESSA richiesta riparte una volta, e c'è la riga di stato`, async () => {
    const b = banco({ risposte: ['pieno', 'ok'] });
    const r = await b.chiedi(attrezzi);
    assert.equal(r.status, 200);
    assert.deepEqual(b.allargamenti, [{ modelId: 'lfm25-24b', servono: 17_432 }]);
    assert.equal(b.corpi.length, 2);
    assert.equal(b.corpi[1], b.corpi[0], 'riparte la stessa richiesta, byte per byte');
    assert.equal(b.avvisi.length, 1);
    assert.equal(b.avvisi[0].opzioni.riga, 'finestra-locale');
    assert.deepEqual(b.avvisi[0].opzioni.dati, { prima: 16_384, dopo: 24_576, massimo: 131_072, memoriaInPiu: 409_600_000, modello: 'LFM2.5 24B' });
    assert.match(b.avvisi[0].messaggio.testo, /^Window enlarged to 24,576 tokens to fit the conversation\.$/u);
    assert.equal(b.avvisi[0].messaggio.testoChiave, 'server.runtime.notice.windowEnlarged');
  });
}

test('FC-ADATT-02 AL CONTRARIO: non si può allargare ⇒ l\'errore sale com\'era (il kernel riassume), una richiesta sola, nessuna riga', async () => {
  const b = banco({ risposte: ['pieno'], allarga: async () => ({ ok: false, motivo: 'gia-al-massimo' }) });
  await assert.rejects(() => b.chiedi(), { code: 'LOCAL_CONTEXT_EXCEEDED' });
  assert.equal(b.corpi.length, 1);
  assert.equal(b.avvisi.length, 0);
});

test('FC-ADATT-03 AL CONTRARIO: anche la finestra nuova non basta ⇒ UN allargamento solo, poi l\'errore (niente giri)', async () => {
  const b = banco({ risposte: ['pieno', 'pieno', 'ok'] });
  await assert.rejects(() => b.chiedi(), { code: 'LOCAL_CONTEXT_EXCEEDED' });
  assert.equal(b.allargamenti.length, 1);
  assert.equal(b.corpi.length, 2);
});

test('FC-ADATT-04 AL CONTRARIO: chi non dà la dipendenza (la CLI, le prove vecchie) resta byte per byte com\'era', async () => {
  const b = banco({ risposte: ['pieno', 'ok'], senzaDipendenza: true });
  await assert.rejects(() => b.chiedi(), { code: 'LOCAL_CONTEXT_EXCEEDED' });
  assert.equal(b.corpi.length, 1);
});

test('FC-ADATT-05 un\'altra richiesta l\'aveva già allargata ⇒ si rimanda senza una seconda riga', async () => {
  const b = banco({ risposte: ['pieno', 'ok'], allarga: async () => ({ ok: true, giaAllargata: true, prima: 24_576, dopo: 24_576 }) });
  assert.equal((await b.chiedi()).status, 200);
  assert.equal(b.corpi.length, 2);
  assert.equal(b.avvisi.length, 0);
});

test('FC-ADATT-06 se il server non riesce a rispondere (eccezione), si torna al riassunto: l\'errore originale sale', async () => {
  const b = banco({ risposte: ['pieno'], allarga: async () => { throw new Error('boom'); } });
  await assert.rejects(() => b.chiedi(), { code: 'LOCAL_CONTEXT_EXCEEDED' });
});

test('FC-ADATT-07 «Chiedimi»: si può allargare ma la persona decide ⇒ errore SUO coi numeri, nessun riassunto automatico, nessuna riapertura', async () => {
  const { classificaErroreFornitore } = await import('../src/kernel/compattazione-desktop.mjs');
  const b = banco({ risposte: ['pieno', 'ok'], allarga: async () => ({ ok: false, motivo: 'chiedi', prima: 16_384, dopo: 24_576, memoriaInPiu: 409_600_000, nome: 'LFM2.5 24B' }) });
  const errore = await b.chiedi().then(() => null, (e) => e);
  assert.equal(errore?.code, 'LOCAL_WINDOW_ASK');
  assert.deepEqual({ promptToken: errore.promptToken, finestraToken: errore.finestraToken, finestraProposta: errore.finestraProposta }, { promptToken: 17_432, finestraToken: 16_384, finestraProposta: 24_576 });
  assert.match(errore.message, /\(17432 tokens\).*\(16384 tokens\).*with 24576 tokens/u, 'la carta legge i numeri dal messaggio');
  assert.equal(classificaErroreFornitore(errore), null, 'il kernel NON lo prende per un contesto pieno: non riassume da solo');
  assert.equal(b.corpi.length, 1, 'nessun rimando');
  assert.equal(b.avvisi.length, 0);
});

test('FC-ADATT-08 AL CONTRARIO: Ollama e LM Studio non sono il nostro motore ⇒ mai un allargamento, l\'errore sale com\'era', async () => {
  for (const fonte of ['ollama', 'lmstudio']) {
    const allargamenti = [];
    let chiamate = 0;
    const rete = async () => { chiamate += 1; return new Response(PIENO, { status: 400, headers: { 'Content-Type': 'application/json' } }); };
    const dipendenze = {
      leggiChiave: () => null, leggiRuntime: () => ({ endpoint: 'http://127.0.0.1:9/v1' }), localePronto: () => true,
      allargaFinestraLocale: async (r) => { allargamenti.push(r); return { ok: true, prima: 16_384, dopo: 24_576 }; },
    };
    const f = creaFetchMultiProvider(rete, { dipendenze });
    const esito = await f('https://openrouter.ai/api/v1/chat/completions', { method: 'POST', headers: { Authorization: 'Bearer x' },
      body: JSON.stringify({ model: `${fonte}:qwen3`, messages: [{ role: 'user', content: 'ciao' }] }) }).then((r) => r, (e) => e);
    assert.ok(chiamate >= 1, `${fonte}: premessa, la richiesta è partita`);
    assert.deepEqual(allargamenti, [], `${fonte}: nessun allargamento`);
    assert.ok(esito instanceof Error || esito?.status === 400, `${fonte}: l'errore sale com'era`);
  }
});

/* Revisione blocco 4 (A-6): lo Stop durante la riapertura del motore (decine di secondi dal vivo) ferma la richiesta SUBITO */
test('FC-ADATT-09 Stop mentre il motore si riapre: la richiesta si ferma subito, non riparte, e la riapertura finisce da sé', async () => {
  let corpi = 0;
  let riaperta = false;
  const dipendenze = {
    leggiChiave: () => null, leggiRuntime: () => ({}), localePronto: () => true,
    chiamaLocale: async () => { corpi += 1; return corpi === 1 ? new Response(PIENO, { status: 400, headers: { 'Content-Type': 'application/json' } }) : Response.json(RISPOSTA); },
    allargaFinestraLocale: () => new Promise((risolvi) => setTimeout(() => { riaperta = true; risolvi({ ok: true, prima: 16_384, dopo: 24_576 }); }, 600)),
  };
  const f = creaFetchMultiProvider(fetch, { dipendenze });
  const stop = new AbortController();
  const partenza = Date.now();
  setTimeout(() => stop.abort(new Error('fermato dalla persona')), 50);
  await assert.rejects(() => f('https://openrouter.ai/api/v1/chat/completions', { method: 'POST', headers: { Authorization: 'Bearer x' }, signal: stop.signal,
    body: JSON.stringify({ model: 'local:lfm25-24b', messages: [{ role: 'user', content: 'x' }] }) }), /fermato dalla persona/u);
  assert.ok(Date.now() - partenza < 400, `fermata dopo ${Date.now() - partenza} ms: aspettava la riapertura`);
  await new Promise((r) => setTimeout(r, 700));
  assert.equal(riaperta, true, 'la riapertura finisce da sé (il motore resta pronto per la prossima)');
  assert.equal(corpi, 1, 'la richiesta NON riparte dopo lo Stop');
});

test('FC-ADATT-10 richiesta già fermata quando arriva il rifiuto: nessuna riapertura del motore', async () => {
  const allargamenti = [];
  const stop = new AbortController();
  const dipendenze = {
    leggiChiave: () => null, leggiRuntime: () => ({}), localePronto: () => true,
    chiamaLocale: async () => { stop.abort(new Error('fermato')); return new Response(PIENO, { status: 400, headers: { 'Content-Type': 'application/json' } }); },
    allargaFinestraLocale: async (r) => { allargamenti.push(r); return { ok: true, prima: 16_384, dopo: 24_576 }; },
  };
  const f = creaFetchMultiProvider(fetch, { dipendenze });
  /* l'esito di una richiesta fermata lo decide il kernel (qui il 400 risale com'è, misurato): conta che il motore non si riapra */
  await f('https://openrouter.ai/api/v1/chat/completions', { method: 'POST', headers: { Authorization: 'Bearer x' }, signal: stop.signal,
    body: JSON.stringify({ model: 'local:lfm25-24b', messages: [{ role: 'user', content: 'x' }] }) }).catch(() => null);
  assert.deepEqual(allargamenti, [], 'uno Stop già dato non riapre il motore');
});
