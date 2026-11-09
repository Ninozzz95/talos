/*
 * R-47 (1/11/2026): una chiamata di attrezzo che si perde in spazi vuoti. Il flusso resta vivo, quindi la sorveglianza del silenzio non scatta.
 * Forma in `in-corso/PROPOSTA-ARGOMENTI-SENZA-FINE-2026-11-01.md`: oltre il tetto il flusso si scarta, la chiamata non parte, si riprova col tetto
 * della caduta. Tutte le strade passano da `consumaFlussoSSE`, e qui si provano per davvero: filo compatibile, filo del piano, collegamento aperto.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { consumaFlussoSSE, talosLavora } from '../src/kernel/talosHarness.mjs';
import { creaSorveglianzaArgomenti, RITENTATIVI_ARGOMENTI_SENZA_FINE, TETTO_SPAZI_NEGLI_ARGOMENTI as TETTO } from '../src/kernel/argomenti-senza-fine.mjs';
import testiDelServer from '../frontend/src/i18n/testi/server.js';
import { nativeProviderResponse } from '../src/native-provider-adapter.mjs';
import { creaFetchDelPiano } from '../src/chatgpt-richiesta.mjs';
import { creaCollegamentiDelPiano } from '../src/chatgpt-collegamento.mjs';
import { cartellaDiProva } from './aiuto/cartelle-di-prova.mjs';

const enc = new TextEncoder();
const fotogramma = (f) => enc.encode(`data: ${JSON.stringify(f)}\n\n`);
const apre = (id = 'call_1', i = 0, nome = 'scrivi') => ({ choices: [{ delta: { tool_calls: [{ index: i, id, type: 'function', function: { name: nome, arguments: '' } }] } }] });
const args = (t, i = 0) => ({ choices: [{ delta: { tool_calls: [{ index: i, function: { arguments: t } }] } }] });
const testo = (t) => ({ choices: [{ delta: { content: t } }] });
const fine = (motivo = 'stop') => ({ choices: [{ delta: {}, finish_reason: motivo }] });

/* Un flusso che non finisce mai da solo, come quello vero: se la regola non lo chiude, la prova resta appesa. */
function senzaFine(prima = [apre(), args('{"percorso":"fuori.txt","testo":"NO"')], stato = {}) {
  let n = 0;
  return new Response(new ReadableStream({
    pull(c) {
      if (n < prima.length) { c.enqueue(fotogramma(prima[n])); n += 1; return; }
      c.enqueue(fotogramma(args(' \n'.repeat(128))));
    },
    cancel() { stato.chiuso = true; },
  }));
}
const intero = (...fotogrammi) => new Response(new ReadableStream({ start(c) { for (const f of fotogrammi) c.enqueue(fotogramma(f)); c.enqueue(enc.encode('data: [DONE]\n\n')); c.close(); } }));
function rete(...risposte) {
  const corpi = [];
  return { corpi, fetch: async (_u, o) => { corpi.push(JSON.parse(o.body)); return risposte[corpi.length - 1](); } };
}
/* I pezzi veri sono corti: la fila si conta fra un pezzo e l'altro, e un pezzo unico non la metterebbe alla prova. */
const aPezzi = (t, i = 0, lungo = 64) => Array.from({ length: Math.ceil(t.length / lungo) }, (_, n) => args(t.slice(n * lungo, (n + 1) * lungo), i));
const base = (extra) => ({ cartella: cartellaDiProva('talos-sen-'), task: { consegna: 'scrivi il file' }, modello: 'x', chiave: 'y', onDelta: () => {}, attesaRitentaMassimaMs: 1, ...extra });

test('SEN-01 oltre il tetto il flusso si chiude, la chiamata è annullata e dice perché', async () => {
  const stato = {}, eventi = [];
  await assert.rejects(consumaFlussoSSE(senzaFine(undefined, stato), (e) => eventi.push(e)), (e) => {
    assert.equal(e.code, 'PROVIDER_STREAM_INVALID');
    assert.equal(e.argomentiSenzaFine, true);
    return true;
  });
  assert.equal(stato.chiuso, true, 'la connessione si chiude: è ciò che libera il fornitore e il motore locale');
  const annullata = eventi.find((e) => e.tipo === 'tool-annullato');
  assert.ok(annullata, 'la chiamata annunciata si chiude a schermo');
  assert.match(JSON.stringify(annullata), /blank space/u);
  assert.doesNotMatch(JSON.stringify(annullata), /connection/u);
});

test('SEN-02 AL CONTRARIO: una riga da 5.000 spazi in un file è contenuto, il falso positivo trovato sulla PR di Hermes', async () => {
  const dentro = `{"percorso":"a.txt","testo":"${' '.repeat(5000)}y\\n${' '.repeat(5000)}\\nz"}`;
  const r = await consumaFlussoSSE(intero(apre(), ...aPezzi(dentro), fine('tool_calls')), () => {});
  assert.equal(r.scelta.tool_calls[0].function.arguments, dentro);
});

test('SEN-03 AL CONTRARIO: 50 KB di codice rientrato con righe vuote passano', async () => {
  const riga = `chiave:\\n\\n\\n${' '.repeat(40)}valore\\n`;
  const dentro = `{"percorso":"a.yaml","testo":"${riga.repeat(900)}"}`;
  assert.ok(dentro.length > 50_000);
  const r = await consumaFlussoSSE(intero(apre(), ...aPezzi(dentro), fine('tool_calls')), () => {});
  assert.equal(r.scelta.tool_calls[0].function.arguments, dentro);
});

test('SEN-04 il conto è per chiamata', async () => {
  const fila = ' '.repeat(TETTO - 1);
  const due = await consumaFlussoSSE(intero(apre('a', 0), apre('b', 1), args('{}', 0), args('{}', 1), ...aPezzi(fila, 0), ...aPezzi(fila, 1), fine('tool_calls')), () => {});
  assert.equal(due.scelta.tool_calls.length, 2, 'due chiamate sotto il tetto non si sommano');
});

/* Le forme viste fuori e da noi: ogni forma a pezzi di ogni misura, perché il conto attraversa i pezzi. */
const scatta = (testo, lungo) => { const s = creaSorveglianzaArgomenti(); for (let n = 0; n < testo.length; n += lungo) if (s(testo.slice(n, n + lungo))) return true; return false; };
const lunghezze = [1, 2, 3, 7, 64, 4096];
const apertura = '{"percorso":"a","testo":"';

test('SEN-10 le forme guaste scattano, a ogni misura di pezzo', () => {
  const forme = {
    'spazi e a capo fuori dalla stringa, R-47': `${apertura}x" ${' \n'.repeat(3000)}`,
    'solo spazi fuori dalla stringa': `{"a":1${' '.repeat(TETTO + 1)}`,
    'a capo grezzi dentro la stringa, Hermes': `${apertura}x${'\n    '.repeat(1000)}`,
    'ciclo a capo scritto più quattro spazi, useomnia': `${apertura}x${'\\n    '.repeat(1000)}`,
    'solo a capo scritti dentro la stringa': `${apertura}x${'\\n'.repeat(3000)}`,
    'ritorno, a capo e tabulazione scritti': `${apertura}x${'\\r\\n\\t'.repeat(1000)}`,
  };
  for (const [nome, testo] of Object.entries(forme)) for (const lungo of lunghezze) assert.equal(scatta(testo, lungo), true, `${nome}, pezzi da ${lungo}`);
});

test('SEN-11 AL CONTRARIO: le forme buone non scattano, a ogni misura di pezzo', () => {
  const forme = {
    'virgolette scritte non chiudono la stringa': `${apertura}${'\\"'.repeat(3000)}${' '.repeat(TETTO * 2)}y"}`,
    'barra scritta prima delle virgolette': `${apertura}x\\\\" , "b":"${' '.repeat(TETTO * 2)}y"}`,
    'sette righe vuote sopra una riga lunghissima': `${apertura}${'\\n'.repeat(7)}${' '.repeat(TETTO * 2)}y"}`,
    'unicode scritto azzera': `${apertura}${`${' '.repeat(TETTO)}\\u0041`.repeat(3)}"}`,
    'al tetto esatto, misurato e scritto a mano, fuori dalla stringa': `{"a":1${' '.repeat(4096)}}`,
    'un escape che non è uno spazio azzera': `${apertura}${'\n'.repeat(8)}${' '.repeat(3000)}\\"${' '.repeat(3000)}y"}`,
  };
  for (const [nome, testo] of Object.entries(forme)) for (const lungo of lunghezze) assert.equal(scatta(testo, lungo), false, `${nome}, pezzi da ${lungo}`);
});

test('SEN-05 si riprova: la chiamata guasta non parte mai e il giro finisce', async () => {
  const cartella = cartellaDiProva('talos-sen-');
  const r = rete(() => senzaFine(), () => intero(testo('Fatto.'), fine()));
  const retry = [];
  const esito = await talosLavora(base({ cartella, fetchDiRete: r.fetch, onGiro: (e) => { if (e.tipo === 'provider-retry') retry.push(e); } }));
  assert.equal(esito.comeFinita, 'concluso');
  assert.equal(r.corpi.length, 2);
  assert.equal(retry.length, 1);
  assert.equal(existsSync(join(cartella, 'fuori.txt')), false, 'nemmeno a pezzi');
  assert.deepEqual(r.corpi[0].messages, r.corpi[1].messages, 'il reinvio non porta la chiamata guasta nella storia');
});

test("SEN-06 due ritentativi e poi il messaggio vero: non è partito niente, l'esito non è incerto", async () => {
  assert.equal(RITENTATIVI_ARGOMENTI_SENZA_FINE, 2, 'dieci giri da 75 secondi sono il difetto che si cura');
  const r = rete(...Array.from({ length: 13 }, () => () => senzaFine()));
  const retry = [];
  await assert.rejects(talosLavora(base({ fetchDiRete: r.fetch, onGiro: (e) => { if (e.tipo === 'provider-retry') retry.push(e); } })), (e) => {
    assert.equal(e.code, 'PROVIDER_OUTCOME_UNKNOWN_ESAURITO');
    assert.equal(e.ritentabile, true);
    assert.equal(e.chiave, 'server.providerOutcome.blankToolCall');
    assert.match(e.message, /blank space, so that call was not run/u);
    assert.doesNotMatch(e.message, /uncertain/u);
    return true;
  });
  assert.equal(r.corpi.length, 3, 'il tentativo più due reinvii');
  assert.deepEqual(retry.map((e) => e.tentativiMassimi), [2, 2]);
});

test('SEN-12 con del testo già consegnato non si riprova, e il messaggio resta vero', async () => {
  const r = rete(() => senzaFine([testo('Scrivo il file.'), apre(), args('{"percorso":"a"')]), () => intero(testo('mai'), fine()));
  await assert.rejects(talosLavora(base({ fetchDiRete: r.fetch })), (e) => {
    assert.equal(e.code, 'PROVIDER_OUTCOME_UNKNOWN');
    assert.equal(e.chiave, 'server.providerOutcome.blankToolCall');
    return true;
  });
  assert.equal(r.corpi.length, 1);
});

test("SEN-13 la frase c'è in italiano e in inglese", () => {
  const lingue = Object.values(testiDelServer).filter((v) => v && typeof v === 'object');
  const frasi = lingue.map((v) => v['providerOutcome.blankToolCall']).filter(Boolean);
  assert.equal(frasi.length, 2);
  assert.notEqual(frasi[0], frasi[1]);
});

test('SEN-07 sui motori locali il flusso si ferma e resta la scheda di oggi', async () => {
  const stato = {};
  const r = rete(() => senzaFine(undefined, stato), () => intero(testo('mai'), fine()));
  await assert.rejects(talosLavora(base({ modello: 'locale-ospite:qwen', fetchDiRete: r.fetch })), { code: 'PROVIDER_OUTCOME_UNKNOWN' });
  assert.equal(r.corpi.length, 1);
  assert.equal(stato.chiuso, true, 'chiudere libera il motore');
});

/* Il filo del piano: eventi Responses, adattatore nativo, filtro del piano e poi `consumaFlussoSSE`, la stessa catena del server. */
const eventoPiano = (e) => `event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`;
const eventiChiamata = [
  { type: 'response.created', response: { id: 'r1', created_at: 1, model: 'm' } },
  { type: 'response.output_item.added', output_index: 0, item: { type: 'function_call', id: 'fc1', call_id: 'c1', name: 'scrivi', arguments: '' } },
  { type: 'response.function_call_arguments.delta', item_id: 'fc1', output_index: 0, delta: '{"percorso":"a"' },
];
const spaziPiano = { type: 'response.function_call_arguments.delta', item_id: 'fc1', output_index: 0, delta: ' \n'.repeat(128) };
const nativa = (fetchFn) => nativeProviderResponse({ provider: 'chatgpt', model: 'm', apiKey: 'x', baseURL: 'https://api.openai.com/v1', fetchFn,
  body: { model: 'm', stream: true, messages: [{ role: 'user', content: 'ciao' }], tools: [{ type: 'function', function: { name: 'scrivi', description: 'd', parameters: { type: 'object', properties: {} } } }] } });

test('SEN-08 sul filo del piano in HTTP la regola scatta uguale', async () => {
  let segnale = null;
  const rispondi = async (_u, opzioni) => {
    segnale = opzioni.signal;
    let n = 0;
    return new Response(new ReadableStream({
      pull(c) { c.enqueue(enc.encode(eventoPiano(eventiChiamata[n] ?? spaziPiano))); n += 1; },
    }), { status: 200, headers: { 'content-type': 'text/event-stream' } });
  };
  const r = await nativa(creaFetchDelPiano(rispondi));
  await assert.rejects(consumaFlussoSSE(r, () => {}), { argomentiSenzaFine: true });
  assert.equal(segnale?.aborted, true, 'la richiesta alla rete si annulla: il modello smette di generare');
});

class Finto extends EventTarget {
  static aperti = [];
  readyState = 0;
  constructor() { super(); Finto.aperti.push(this); queueMicrotask(() => { this.readyState = 1; this.dispatchEvent(new Event('open')); }); }
  send() { /* il corpo non interessa qui */ }
  close() { if (this.readyState === 3) return; this.readyState = 3; this.dispatchEvent(new Event('close')); }
  arriva(evento) { this.dispatchEvent(new MessageEvent('message', { data: JSON.stringify(evento) })); }
}

test('SEN-09 sul collegamento aperto del piano, la strada della corsa vera, la regola scatta uguale', async () => {
  Finto.aperti = [];
  const collegamenti = creaCollegamentiDelPiano({ webSocketFn: Finto });
  const reteMai = async () => { throw new Error('non deve passare da HTTP'); };
  const risposta = nativa(creaFetchDelPiano(reteMai, { collegamenti }));
  for (let i = 0; i < 20 && !Finto.aperti.length; i += 1) await new Promise((f) => setImmediate(f));
  await new Promise((f) => setImmediate(f));
  const ws = Finto.aperti.at(-1);
  assert.ok(ws, 'la richiesta è passata dal collegamento aperto');
  for (const e of eventiChiamata) ws.arriva(e);
  for (let i = 0; i < 20; i += 1) ws.arriva(spaziPiano);
  const r = await risposta;
  await assert.rejects(consumaFlussoSSE(r, () => {}), { argomentiSenzaFine: true });
  await new Promise((f) => setImmediate(f));
  assert.equal(ws.readyState, 3, 'il collegamento si chiude: il modello smette di generare');
});
