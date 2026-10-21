/*
 * 21/10/2026 — il conteggio ESATTO del motore dell'app (`POST /tokenize`, contratto del Mobile del 21/10: lo stesso corpo della chat,
 * risposta `{count, max_model_len}`). Esatto quando risponde; la stima dichiarata quando è vecchio (404/405/501), occupato, lento o
 * risponde male — mai un giro fallito. Nessuna chiamata va in rete: la funzione passa dall'accesso dell'ospite.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { createContextTokenCounter, credenzialeDelContatore } from '../src/context-token-counters.mjs';

const messages = [{ role: 'system', content: 'Help.' }, { role: 'user', content: 'Ciao' }];
const tools = [{ type: 'function', function: { name: 'read', description: 'Read a file', parameters: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] } } }];
const modello = { provider: 'locale-ospite', model: 'lfm2.5-2.6b-q4_0.gguf', windowTokens: 32_768, responseReserve: 4_096 };

function contatore(contaOspite, { tempoMassimoMs } = {}) {
  const rete = [];
  const c = createContextTokenCounter({
    resolveProfile: async (m) => credenzialeDelContatore(m.provider, { leggiRuntime: () => ({}), leggiChiave: () => null, baseLocale: null, contaOspite }),
    fetchFn: async (url) => { rete.push(String(url)); throw new Error('nessuna rete'); },
    ...(tempoMassimoMs ? { tempoMassimoMs } : {}),
  });
  return { c, rete };
}

test('OSPITE-CONTA-01 il motore dell\'app risponde: il conteggio è esatto, col corpo della chat, senza rete', async () => {
  let visto = null;
  const { c, rete } = contatore(async (corpo, segnale) => { visto = { corpo, segnale }; return Response.json({ count: 23_851, max_model_len: 32_768 }); });
  const conto = await c.countPreparedContext({ messages, tools, model: modello });
  assert.equal(conto.inputTokens, 23_851);
  assert.equal(conto.method, 'runtime');
  assert.equal(conto.exact, true);
  assert.equal(conto.fallback, undefined);
  assert.deepEqual(visto.corpo.messages, messages, 'lo stesso corpo della chat');
  assert.ok(visto.corpo.tools?.length >= 1);
  assert.ok(visto.segnale instanceof AbortSignal, 'col tetto di tempo del contatore');
  assert.deepEqual(rete, []);
});

test('OSPITE-CONTA-02 verso contrario: app vecchia, occupata, rotta, lenta o senza funzione ⇒ la stima, mai un errore', async () => {
  const casi = [
    ['vecchia 404', async () => new Response('', { status: 404 }), undefined],
    ['vecchia 405', async () => new Response('', { status: 405 }), undefined],
    ['occupata 409', async () => Response.json({ error: { code: 'LOCAL_ENGINE_BUSY' } }, { status: 409 }), 'CTX_TOKEN_HTTP'],
    ['non pronta 503', async () => Response.json({ error: { code: 'LOCAL_RUNTIME_NOT_READY' } }, { status: 503 }), 'CTX_TOKEN_HTTP'],
    ['conto non intero', async () => Response.json({ count: 12.5 }), 'CTX_TOKEN_RESPONSE_INVALID'],
    ['conto negativo', async () => Response.json({ count: -1 }), 'CTX_TOKEN_RESPONSE_INVALID'],
    ['non JSON', async () => new Response('<html>', { status: 200 }), 'CTX_TOKEN_RESPONSE_INVALID'],
    ['socket chiuso', async () => { throw Object.assign(new Error('The local engine in the app does not answer.'), { code: 'LOCAL_RUNTIME_NOT_READY' }); }, 'CTX_TOKEN_NETWORK'],
  ];
  for (const [nome, conta, fallback] of casi) {
    const { c, rete } = contatore(conta);
    const conto = await c.countPreparedContext({ messages, tools, model: modello });
    assert.equal(conto.method, 'heuristic', nome);
    assert.equal(conto.exact, false, nome);
    assert.equal(conto.fallback, fallback, nome);
    assert.deepEqual(rete, [], nome);
  }
  const senza = contatore(null);
  assert.equal((await senza.c.countPreparedContext({ messages, tools, model: modello })).method, 'heuristic');
});

test('OSPITE-CONTA-03 lento: oltre il tetto del contatore vale la stima, col motivo CTX_TOKEN_TIMEOUT', async () => {
  const { c } = contatore((_corpo, segnale) => new Promise((_, rifiuta) => { segnale.addEventListener('abort', () => rifiuta(segnale.reason), { once: true }); }), { tempoMassimoMs: 50 });
  const conto = await c.countPreparedContext({ messages, tools, model: modello });
  assert.equal(conto.fallback, 'CTX_TOKEN_TIMEOUT');
});

test('OSPITE-CONTA-04 uno Stop durante il conteggio resta uno Stop', async () => {
  const stop = new AbortController();
  const { c } = contatore((_corpo, segnale) => new Promise((_, rifiuta) => { stop.abort(); segnale.addEventListener('abort', () => rifiuta(new Error('aborted')), { once: true }); if (segnale.aborted) rifiuta(new Error('aborted')); }));
  await assert.rejects(c.countPreparedContext({ messages, tools, model: modello, signal: stop.signal }), { name: 'AbortError' });
});
