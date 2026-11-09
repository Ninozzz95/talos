/*
 * Blocco 20 (01/11/2026, forma con CLI e Mobile): un modello che rifiuta la conversazione risponde normalmente, con `content` vuoto. Misurato sul banco del 01/11 con
 * un modello Anthropic da OpenRouter: `finish_reason: content_filter`, `native_finish_reason: refusal`, `content: null`. Ritentare dà lo stesso rifiuto e può essere
 * pagato (platform.claude.com, «Refusals and fallback», letta il 01/11). Si esce prima della scala della risposta vuota.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import * as kernel from '../src/kernel/talosHarness.mjs';
import { cartellaDiProva } from './aiuto/cartelle-di-prova.mjs';
import { nativeProviderResponse } from '../src/native-provider-adapter.mjs';
import { avviaSessione } from '../src/agent-service.mjs';

const { talosLavora, consumaFlussoSSE, eRifiutoDelModello } = kernel;
const enc = new TextEncoder();
const flusso = (fotogrammi) => new Response(new ReadableStream({
  start(c) {
    for (const f of fotogrammi) c.enqueue(enc.encode(`data: ${JSON.stringify(f)}\n\n`));
    c.enqueue(enc.encode('data: [DONE]\n\n'));
    c.close();
  },
}));
const uso = { choices: [], usage: { prompt_tokens: 100, completion_tokens: 3, total_tokens: 103 } };
const rifiutoVero = () => flusso([{ choices: [{ index: 0, delta: { content: null }, finish_reason: 'content_filter', native_finish_reason: 'refusal' }] }, uso]);
const rifiutoAPezzi = () => flusso([{ choices: [{ delta: { refusal: 'I cannot ' } }] }, { choices: [{ delta: { refusal: 'help with that.' } }] }, { choices: [{ delta: {}, finish_reason: 'stop' }] }, uso]);
const vuotaQualunque = () => flusso([{ choices: [{ index: 0, delta: { content: '' }, finish_reason: 'stop' }] }, uso]);
const testoPoiFiltro = () => flusso([{ choices: [{ delta: { content: 'Prima parte della risposta' } }] }, { choices: [{ index: 0, delta: {}, finish_reason: 'content_filter', native_finish_reason: 'refusal' }] }, uso]);
const tutto = (...risposte) => {
  const corpi = [];
  return { corpi, fetch: async (_url, o) => { corpi.push(JSON.parse(o.body)); const r = risposte[Math.min(corpi.length, risposte.length) - 1]; return r(); } };
};
const base = (extra) => ({ cartella: cartellaDiProva('talos-rifiuto-del-modello-'), task: { consegna: 'fai una cosa' }, modello: 'x', chiave: 'y', onDelta: () => {}, ...extra });
const errore = (promessa) => promessa.then(() => { throw new Error('doveva rifiutare'); }, (e) => e);

test('RIFIUTO-GIRO-01: il rifiuto vero esce alla prima richiesta, senza spinta né ritentativi, con la classe e la frase con la chiave', async () => {
  const rete = tutto(rifiutoVero);
  const e = await errore(talosLavora(base({ fetchDiRete: rete.fetch })));
  assert.equal(rete.corpi.length, 1, 'ogni gradino sarebbe una richiesta in più, forse pagata');
  assert.equal(e.code, 'PROVIDER_EMPTY_RESPONSE');
  assert.equal(e.classe, 'rifiuto-del-modello');
  assert.equal(e.chiave, 'server.providerOutcome.refused');
  assert.doesNotMatch(e.message, /provider reason/u, 'il motivo grezzo non va a schermo');
});

test('RIFIUTO-GIRO-02: il segnale a pezzi nel flusso conta come il rifiuto vero, e il suo testo non finisce nella risposta', async () => {
  const letto = await consumaFlussoSSE(rifiutoAPezzi(), () => {});
  assert.equal(letto.rifiutoDelModello, true);
  assert.ok(!letto.scelta.content);
  const rete = tutto(rifiutoAPezzi);
  const e = await errore(talosLavora(base({ fetchDiRete: rete.fetch })));
  assert.equal(rete.corpi.length, 1);
  assert.equal(e.classe, 'rifiuto-del-modello');
});

test('RIFIUTO-GIRO-03 — AL CONTRARIO: una vuota qualunque resta sulla scala di prima', async () => {
  const rete = tutto(vuotaQualunque);
  const e = await errore(talosLavora(base({ fetchDiRete: rete.fetch })));
  assert.equal(e.classe, 'risposta-vuota');
  assert.ok(rete.corpi.length > 1, 'la scala ha ritentato');
});

test('RIFIUTO-GIRO-04: testo parziale poi filtro: il testo resta, il giro ha un esito suo e la risposta interrotta resta nel conto', async () => {
  const rete = tutto(testoPoiFiltro);
  const esito = await talosLavora(base({ fetchDiRete: rete.fetch }));
  assert.equal(rete.corpi.length, 1);
  assert.equal(esito.comeFinita, 'rifiuto-del-modello');
  assert.match(esito.detto, /^⛔ the model stopped and refused to continue/u);
  assert.match(esito.detto, /Prima parte della risposta/u, 'il testo resta');
  assert.doesNotMatch(esito.detto, /generation stopped/u, 'una risposta c era');
  assert.equal(esito.usage?.prompt_tokens, 100, 'una risposta pagata resta nel conto (condizione di Performance)');
  assert.equal(esito.usage?.completion_tokens, 3);
});

test('RIFIUTO-GIRO-04d: nell errore del giro solo la frase: il testo sta già nella bolla (richiesta del Mobile); gli altri esiti restano interi', async () => {
  const finisce = async (comeFinita, detto) => {
    const eventi = [];
    await avviaSessione({ cartella: cartellaDiProva('talos-rifiuto-evento-'), task: { consegna: 'prova' }, modello: 'm', chiave: 'k', onEvento: (e) => { eventi.push(e); }, talosLavoraFn: async () => ({ comeFinita, detto }) });
    return eventi.find((e) => e.type === 'RunError');
  };
  const rifiuto = await finisce('rifiuto-del-modello', '⛔ the model stopped and refused to continue: the text that arrived is kept.\nPrima parte');
  assert.equal(rifiuto.code, 'rifiuto-del-modello');
  assert.equal(rifiuto.message, '⛔ the model stopped and refused to continue: the text that arrived is kept.');
  const altro = await finisce('fermato', '⛔ generation stopped without an answer and without exhausting the turns.\nPrima parte');
  assert.match(altro.message, /\nPrima parte$/u);
});

test('RIFIUTO-GIRO-R1 (revisione del blocco): un rifiuto insieme a una chiamata: l attrezzo non parte, il modello non si richiama', async () => {
  const conChiamata = () => flusso([{ choices: [{ delta: { content: 'Scrivo il file', tool_calls: [{ index: 0, id: 'c1', type: 'function', function: { name: 'elenca', arguments: '{}' } }] } }] }, { choices: [{ delta: {}, finish_reason: 'content_filter' }] }, uso]);
  const rete = tutto(conChiamata);
  const annullate = [];
  const esito = await talosLavora(base({ fetchDiRete: rete.fetch, onDelta: (d) => { if (d?.tipo === 'tool-annullato') { assert.match(d.motivo, /refused to continue/u); annullate.push(d.nome); } } }));
  assert.equal(rete.corpi.length, 1);
  assert.equal(esito.comeFinita, 'rifiuto-del-modello');
  assert.deepEqual(annullate, ['elenca']);
});

test('RIFIUTO-GIRO-R1b: senza testo e con una chiamata: è il rifiuto a risposta vuota', async () => {
  const soloChiamata = () => flusso([{ choices: [{ delta: { tool_calls: [{ index: 0, id: 'c1', type: 'function', function: { name: 'elenca', arguments: '{}' } }] } }] }, { choices: [{ delta: {}, finish_reason: 'content_filter' }] }, uso]);
  const rete = tutto(soloChiamata);
  const e = await errore(talosLavora(base({ fetchDiRete: rete.fetch })));
  assert.equal(rete.corpi.length, 1);
  assert.equal(e.classe, 'rifiuto-del-modello');
});

test('RIFIUTO-GIRO-R5: testo poi rifiuto con un messaggio in coda: il modello non si richiama e la coda resta', async () => {
  const rete = tutto(testoPoiFiltro);
  let lette = 0;
  const esito = await talosLavora(base({ fetchDiRete: rete.fetch, codaMessaggiFn: () => { lette += 1; return 'un altro messaggio'; } }));
  assert.equal(rete.corpi.length, 1);
  assert.equal(esito.comeFinita, 'rifiuto-del-modello');
  assert.equal(lette, 0, 'il messaggio non si è consumato');
});

test('RIFIUTO-GIRO-R6: solo spazi poi rifiuto: è il rifiuto a risposta vuota, non una generazione ferma', async () => {
  const spazi = () => flusso([{ choices: [{ delta: { content: '  \n ' } }] }, { choices: [{ delta: {}, finish_reason: 'content_filter' }] }, uso]);
  const e = await errore(talosLavora(base({ fetchDiRete: tutto(spazi).fetch })));
  assert.equal(e.classe, 'rifiuto-del-modello');
});

test('RIFIUTO-GIRO-R7: senza flusso, un rifiuto senza messaggio ha la sua classe', async () => {
  const { onDelta: _via, ...senzaFlusso } = base({});
  const e = await errore(talosLavora({ ...senzaFlusso, fetchDiRete: async () => new Response(JSON.stringify({ choices: [{ finish_reason: 'content_filter' }], usage: uso.usage }), { status: 200, headers: { 'content-type': 'application/json' } }) }));
  assert.equal(e.classe, 'rifiuto-del-modello');
});

test('RIFIUTO-GIRO-04b — AL CONTRARIO: il segnale a parte su una fine normale vale; una fine normale senza segnale no', async () => {
  const conSegnale = () => flusso([{ choices: [{ delta: { content: 'Testo' } }] }, { choices: [{ delta: { refusal: 'no' } }] }, { choices: [{ delta: {}, finish_reason: 'stop' }] }, uso]);
  assert.equal((await talosLavora(base({ fetchDiRete: tutto(conSegnale).fetch }))).comeFinita, 'rifiuto-del-modello');
  const normale = () => flusso([{ choices: [{ delta: { content: 'Testo' } }] }, { choices: [{ delta: {}, finish_reason: 'stop' }] }, uso]);
  const esito = await talosLavora(base({ fetchDiRete: tutto(normale).fetch }));
  assert.equal(esito.comeFinita, 'concluso');
  assert.equal(esito.detto, 'Testo');
});

test('RIFIUTO-GIRO-04c: senza flusso il rifiuto dopo il testo si legge uguale', async () => {
  const corpo = (scelta) => async () => new Response(JSON.stringify({ choices: [scelta], usage: uso.usage }), { status: 200, headers: { 'content-type': 'application/json' } });
  const { onDelta: _via, ...senzaFlusso } = base({});
  const filtro = await talosLavora({ ...senzaFlusso, fetchDiRete: corpo({ message: { role: 'assistant', content: 'Testo' }, finish_reason: 'content_filter' }) });
  assert.equal(filtro.comeFinita, 'rifiuto-del-modello');
  const aParte = await talosLavora({ ...senzaFlusso, fetchDiRete: corpo({ message: { role: 'assistant', content: 'Testo', refusal: 'no' }, finish_reason: 'stop' }) });
  assert.equal(aParte.comeFinita, 'rifiuto-del-modello');
});

test('RIFIUTO-GIRO-05: la regola, voce per voce', () => {
  assert.equal(eRifiutoDelModello({ nativeFinishReason: 'refusal' }), true);
  assert.equal(eRifiutoDelModello({ finishReason: 'content_filter' }), true);
  assert.equal(eRifiutoDelModello({ rifiutoDelModello: true }), true);
  assert.equal(eRifiutoDelModello({ finishReason: 'stop', nativeFinishReason: 'end_turn' }), false);
  assert.equal(eRifiutoDelModello({}), false);
});

test('RIFIUTO-GIRO-06: anche senza streaming il rifiuto esce subito', async () => {
  const corpi = [];
  const fetchDiRete = async (_url, o) => { corpi.push(JSON.parse(o.body)); return new Response(JSON.stringify({ choices: [{ finish_reason: 'content_filter', native_finish_reason: 'refusal', message: { role: 'assistant', content: null, refusal: 'No.' } }], usage: uso.usage }), { headers: { 'content-type': 'application/json' } }); };
  const e = await errore(talosLavora({ ...base({ fetchDiRete }), onDelta: undefined }));
  assert.equal(corpi.length, 1);
  assert.equal(e.classe, 'rifiuto-del-modello');
});

/* Dalla porta vera (Performance, 01/11): la strada diretta passa dall'SDK, e lì il rifiuto è scritto `content-filter` col trattino: una prova sulla sola funzione non lo vede */
const ANTHROPIC_SSE = [
  { type: 'message_start', message: { id: 'msg_1', type: 'message', role: 'assistant', model: 'claude-sonnet-5', content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 10, output_tokens: 0 } } },
  { type: 'message_delta', delta: { stop_reason: 'refusal', stop_sequence: null }, usage: { output_tokens: 1 } },
  { type: 'message_stop' },
].map((e) => `event: ${e.type}
data: ${JSON.stringify(e)}

`).join('');
const ANTHROPIC_JSON = { id: 'msg_1', type: 'message', role: 'assistant', model: 'claude-sonnet-5', content: [], stop_reason: 'refusal', stop_sequence: null, usage: { input_tokens: 10, output_tokens: 1 } };

function portaAnthropic() {
  const chiamate = [];
  const fetchDiRete = async (_url, o) => {
    const body = JSON.parse(o.body);
    chiamate.push(body);
    return nativeProviderResponse({ provider: 'anthropic', model: 'claude-sonnet-5', apiKey: 'test-only-key', body,
      fetchFn: async () => (body.stream ? new Response(ANTHROPIC_SSE, { headers: { 'content-type': 'text/event-stream' } }) : new Response(JSON.stringify(ANTHROPIC_JSON), { headers: { 'content-type': 'application/json' } })) });
  };
  return { chiamate, fetchDiRete };
}

test('RIFIUTO-GIRO-07: stop_reason refusal su Anthropic diretto, in streaming: una richiesta sola, classe del rifiuto', async () => {
  const p = portaAnthropic();
  const e = await errore(talosLavora(base({ fetchDiRete: p.fetchDiRete })));
  assert.equal(p.chiamate.length, 1, e.message);
  assert.equal(e.classe, 'rifiuto-del-modello', e.message);
});

test('RIFIUTO-GIRO-08: la stessa cosa senza streaming', async () => {
  const p = portaAnthropic();
  const e = await errore(talosLavora({ ...base({ fetchDiRete: p.fetchDiRete }), onDelta: undefined }));
  assert.equal(p.chiamate.length, 1, e.message);
  assert.equal(e.classe, 'rifiuto-del-modello', e.message);
});
