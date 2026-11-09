/*
 * Un rifiuto detto da un altro fornitore dentro il flusso (revisione del blocco 17, N1). SDK e adattatore veri, solo la rete è finta: la forma
 * dell'errore la decide l'SDK, e una prova con un oggetto scritto a mano passava su un caso che non esiste.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { creaFetchMultiProvider } from '../src/runtime-owner-adapter.mjs';
import { createProviderCredentialStore } from '../src/provider-credential-store.mjs';
import { talosLavora } from '../src/kernel/talosHarness.mjs';
import { cartellaDiProva } from './aiuto/cartelle-di-prova.mjs';

const sse = (righe) => new Response(new ReadableStream({ start(c) { for (const r of righe) c.enqueue(new TextEncoder().encode(`event: ${r.type}\ndata: ${JSON.stringify(r)}\n\n`)); c.close(); } }), { status: 200, headers: { 'content-type': 'text/event-stream' } });
const INIZIO = { type: 'message_start', message: { id: 'msg_1', type: 'message', role: 'assistant', model: 'claude-x', content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 5, output_tokens: 1 } } };
const errore = (tipo) => ({ type: 'error', error: { type: tipo, message: 'MOTIVO-DEL-FORNITORE' } });
const BUONA = [INIZIO, { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } }, { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Fatto.' } }, { type: 'content_block_stop', index: 0 }, { type: 'message_delta', delta: { stop_reason: 'end_turn', stop_sequence: null }, usage: { output_tokens: 3 } }, { type: 'message_stop' }];
const RAGIONA = [INIZIO, { type: 'content_block_start', index: 0, content_block: { type: 'thinking', thinking: '', signature: '' } }, { type: 'content_block_delta', index: 0, delta: { type: 'thinking_delta', thinking: 'penso' } }];
const CHIAMATA = [INIZIO, { type: 'content_block_start', index: 0, content_block: { type: 'tool_use', id: 'toolu_1', name: 'scrivi', input: {} } }, { type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: '{"percorso":"a' } }];
const TESTO = [INIZIO, { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } }, { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Ecco. ' } }];

async function corsa(prima, tipo, { poiBuona = false } = {}) {
  let invii = 0;
  const risposte = [];
  const store = createProviderCredentialStore({ env: { ANTHROPIC_API_KEY: 'local-fixture' } });
  const trasporto = creaFetchMultiProvider(async () => { invii += 1; return invii === 1 || !poiBuona ? sse([...prima, errore(tipo)]) : sse(BUONA); }, { providerStore: store, dipendenze: { leggiChiave: (p) => store.getKey(p), leggiRuntime: (p) => store.getRuntime(p) } });
  const esito = await talosLavora({ cartella: cartellaDiProva('talos-rifiuto-altri-'), task: { consegna: 'fai' }, modello: 'anthropic:claude-opus-4-5', chiave: 'x', onDelta: () => {}, onGiro: (g) => { if (g.tipo === 'risposta') risposte.push(g.risposta?.content); }, fetchDiRete: trasporto, attesaRitentaMassimaMs: 1 }).then((v) => ({ v }), (e) => ({ e }));
  return { invii, risposte, ...esito };
}

for (const [nome, prima] of [['chiamata annunciata', CHIAMATA], ['ragionamento', RAGIONA]]) {
  for (const [tipo, classe, frase] of [['invalid_request_error', undefined, /did not accept the request/u], ['billing_error', 'credito', /Credit not available/u]]) {
    test(`RIFIUTO-ALTRI: ${tipo} dopo ${nome}: un invio solo, col motivo e non come risposta interrotta`, async () => {
      const { invii, e } = await corsa(prima, tipo);
      assert.equal(invii, 1);
      assert.equal(e?.code, 'PROVIDER_REQUEST_ERROR');
      assert.match(e?.message ?? '', frase);
      if (classe) assert.equal(e?.classe, classe);
      assert.notEqual(e?.esitoIncerto, true);
      assert.equal(e?.causaDiTrasporto, 'PROVIDER_STREAM_ERROR');
      assert.equal(e?.dichiarato, true);
      assert.equal(e?.transitorio, false);
      assert.doesNotMatch(JSON.stringify({ messaggio: e?.message, ...e }), /MOTIVO-DEL-FORNITORE/u, 'come un rifiuto HTTP, il testo del fornitore non passa');
    });
  }
  test(`RIFIUTO-ALTRI-CONTRARIO: overloaded_error dopo ${nome}: si ritenta`, async () => {
    assert.equal((await corsa(prima, 'overloaded_error')).invii, 11);
  });
}

test('RIFIUTO-ALTRI-TESTO: dopo del testo il frammento resta nella storia, e un rifiuto non si ripete', async () => {
  const r = await corsa(TESTO, 'invalid_request_error');
  assert.equal(r.invii, 1);
  assert.equal(r.e?.code, 'PROVIDER_REQUEST_ERROR');
  assert.match(r.e?.parziale?.content ?? '', /Ecco/u);
  assert.ok(r.risposte.some((t) => /Ecco/u.test(t ?? '')));
});

test('RIFIUTO-ALTRI-RIPRESA: un sovraccarico, poi la risposta buona: il giro finisce da solo', async () => {
  const r = await corsa(RAGIONA, 'overloaded_error', { poiBuona: true });
  assert.equal(r.invii, 2);
  assert.equal(r.v?.comeFinita, 'concluso');
});

test('RIFIUTO-ALTRI-CLASSE: un tipo che suona di passaggio, ma che il fornitore non dice ripetibile: un invio solo', async () => {
  const { invii, e } = await corsa(CHIAMATA, 'timeout_error');
  assert.equal(invii, 1);
  assert.equal(e?.transitorio, false);
});

