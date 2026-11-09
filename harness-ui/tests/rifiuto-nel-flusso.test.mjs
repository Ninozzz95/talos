/*
 * Un errore detto dal servizio dentro il flusso è un esito noto: non si ripete, nemmeno dopo una chiamata annunciata (revisione del blocco 17, A1).
 * Una caduta resta un esito incerto, e ogni invio conta nel tetto dei reinvii.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { creaFetchMultiProvider, erroreDichiaratoNelFlusso } from '../src/runtime-owner-adapter.mjs';
import { erroreDelPiano } from '../src/chatgpt-richiesta.mjs';
import { talosLavora } from '../src/kernel/talosHarness.mjs';
import { cartellaDiProva } from './aiuto/cartelle-di-prova.mjs';

const sse = (e) => new TextEncoder().encode(`event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`);
const CREATA = { type: 'response.created', response: { id: 'r1', created_at: 1791700000, model: 'gpt-6-luna' } };
const CHIAMATA = [CREATA,
  { type: 'response.output_item.added', output_index: 0, item: { id: 'fc1', type: 'function_call', call_id: 'call_1', name: 'scrivi', arguments: '' } },
  { type: 'response.function_call_arguments.delta', item_id: 'fc1', output_index: 0, delta: '{"percorso":"a' }];
const caduta = () => Object.assign(new Error('closed'), { code: 'PROVIDER_STREAM_INCOMPLETE' });
const flusso = (pezzi, fine) => new Response(new ReadableStream({
  start(c) { for (const p of pezzi) c.enqueue(sse(p)); setTimeout(() => { if (fine) fine(c); else c.error(caduta()); }, 2); },
}), { status: 200, headers: { 'content-type': 'text/event-stream' } });
function piano(invia) {
  const dipendenze = { leggiChiave: () => null, leggiRuntime: () => ({}), leggiTokenDelPiano: async () => 'TOKEN', registraUsoDelPiano: async () => {}, registraLimitiDelPiano: () => {}, collegamentiDelPiano: { invia } };
  return creaFetchMultiProvider(async () => { throw new Error('niente HTTP'); }, { dipendenze, providerStore: { hasKey: () => false, elencaPool: () => [], scegliChiave: () => null } });
}
const lavora = (fetchDiRete, extra = {}) => talosLavora({ cartella: cartellaDiProva('talos-rifiuto-'), task: { consegna: 'fai' }, modello: 'chatgpt:gpt-6-luna', chiave: 'x', onDelta: () => {}, fetchDiRete, attesaRitentaMassimaMs: 1, ...extra }).then((v) => ({ v }), (e) => ({ e }));

for (const [nome, fine] of [
  ['evento error valido', { type: 'error', sequence_number: 4, code: 'invalid_prompt', message: 'no', param: null }],
  ['evento error che lo schema non riconosce', { type: 'error', code: 'invalid_prompt', message: 'no' }],
  ['response.failed valido', { type: 'response.failed', sequence_number: 4, response: { error: { code: 'invalid_prompt', message: 'no' } } }],
  ['response.failed che lo schema non riconosce', { type: 'response.failed', response: { id: 'r1', status: 'failed', error: { code: 'invalid_prompt', message: 'no' } } }],
]) {
  test(`RIFIUTO: ${nome}, dopo una chiamata annunciata: un invio solo, col motivo`, async () => {
    let invii = 0;
    const { e } = await lavora(piano(async () => { invii += 1; return flusso([...CHIAMATA, fine], (c) => c.close()); }));
    assert.equal(invii, 1);
    assert.equal(e?.code, 'CHATGPT_ERRORE');
    assert.equal(e?.codiceOpenAi, 'invalid_prompt');
  });
}

test('RIFIUTO-CONTRARIO: una caduta dopo la chiamata annunciata resta incerta e si rifà da sola (R-44)', async () => {
  let invii = 0;
  const { e } = await lavora(piano(async () => { invii += 1; return flusso(CHIAMATA); }));
  assert.equal(invii, 11);
  assert.equal(e?.code, 'PROVIDER_OUTCOME_UNKNOWN_ESAURITO');
});

test('TETTO: il rilancio della caduta prima del primo pezzo conta nei reinvii del giro', async () => {
  let invii = 0;
  const { e } = await lavora(piano(async () => { invii += 1; return invii % 2 ? flusso([CREATA]) : flusso(CHIAMATA); }));
  assert.equal(e?.code, 'PROVIDER_OUTCOME_UNKNOWN_ESAURITO');
  assert.ok(invii <= 12, `al più 10 reinvii più il primo giro e il suo rilancio: ${invii}`);
});

test('DICHIARATO: conta solo il rifiuto che l\'SDK dice non ripetibile', () => {
  const dal = (isRetryable) => Object.assign(new Error('x'), { name: 'AI_StreamProviderError', isRetryable });
  assert.equal(erroreDichiaratoNelFlusso(dal(false)), true);
  assert.equal(erroreDichiaratoNelFlusso(dal(true)), false, 'un sovraccarico si ritenta');
  assert.equal(erroreDichiaratoNelFlusso(caduta()), false);
  assert.equal(erroreDichiaratoNelFlusso(new TypeError('terminated')), false);
  assert.equal(erroreDichiaratoNelFlusso(null), false);
});

test('PIANO-CONTRARIO: una caduta non ha un motivo del servizio', () => {
  assert.equal(erroreDelPiano(caduta()).dichiarato, false);
  assert.equal(erroreDelPiano({ value: { type: 'error', code: 'invalid_prompt', message: 'no' } }).codiceOpenAi, 'invalid_prompt');
});

const TESTO = [CREATA,
  { type: 'response.output_item.added', output_index: 0, item: { id: 'm1', type: 'message', role: 'assistant', content: [] } },
  { type: 'response.content_part.added', item_id: 'm1', output_index: 0, content_index: 0, part: { type: 'output_text', text: '' } },
  { type: 'response.output_text.delta', item_id: 'm1', output_index: 0, content_index: 0, delta: 'Ecco la prima parte. ' }];

for (const [nome, fine, codice, attesi] of [
  ['detto dal servizio', { type: 'response.failed', sequence_number: 9, response: { error: { code: 'server_error', message: 'no' } } }, 'CHATGPT_ERRORE', 1],
  ['una caduta', null, 'PROVIDER_OUTCOME_UNKNOWN', 1],
]) {
  test(`TESTO-CONSERVATO: ${nome} dopo del testo: il testo resta nella storia, ${attesi} invio`, async () => {
    let invii = 0;
    const risposte = [];
    const { e } = await lavora(piano(async () => { invii += 1; return fine ? flusso([...TESTO, fine], (c) => c.close()) : flusso(TESTO); }), { onGiro: (g) => { if (g.tipo === 'risposta') risposte.push(g.risposta?.content); } });
    assert.equal(invii, attesi);
    assert.equal(e?.code, codice);
    assert.match(e?.parziale?.content ?? '', /Ecco la prima parte/u);
    assert.ok(risposte.some((t) => /Ecco la prima parte/u.test(t ?? '')), 'il frammento entra nella storia');
  });
}

