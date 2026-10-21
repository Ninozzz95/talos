/*
 * Revisione del lotto (21/10/2026): una finestra piena a metà flusso (l'errore col marcatore che dà l'adattatore nativo) non è un esito
 * incerto: niente reinvii a contesto pieno, niente pezzo rimesso in storia, e il marcatore arriva a chi compatta e ritenta.
 */
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { talosLavora } from '../src/kernel/talosHarness.mjs';
import { classificaErroreFornitore } from '../src/kernel/compattazione-desktop.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

const finestraPiena = () => Object.assign(new Error('The request is larger than the model context window (context_length_exceeded).'),
  { code: 'NATIVE_CONTEXT_WINDOW_EXCEEDED', finestraPiena: true });

/** Un flusso SSE che consegna `testo` (se c'è) e poi si interrompe con `errore`. */
function flussoInterrotto(testo, errore) {
  const enc = new TextEncoder();
  let consegnato = !testo;
  const body = new ReadableStream({
    pull(controller) {
      /* il testo arriva a una lettura, l'errore alla lettura DOPO: il kernel ha davvero consegnato il pezzo prima del guasto */
      if (!consegnato) { consegnato = true; controller.enqueue(enc.encode(`data: ${JSON.stringify({ choices: [{ index: 0, delta: { role: 'assistant', content: testo } }] })}\n\n`)); return; }
      controller.error(errore);
    },
  });
  return new Response(body, { headers: { 'content-type': 'text/event-stream' } });
}

async function giro(t, { testo, errore = finestraPiena() }) {
  const cartella = mkdtempSync(join(tmpdir(), 'talos-finestra-piena-'));
  t.after(() => rimuoviCartellaDiProva(cartella));
  let chiamate = 0;
  const corpi = [];
  const fetchDiRete = async (_url, init) => { chiamate += 1; corpi.push(JSON.parse(init.body)); return flussoInterrotto(testo, errore); };
  let errorePreso = null;
  let esito = null;
  const risposte = [];
  try {
    esito = await talosLavora({ cartella, modello: 'anthropic:claude-opus-5-5', chiave: 'finta', task: { consegna: 'Scrivi tanto.' }, fetchDiRete,
      onDelta: () => {}, attesaRitentaMassimaMs: 1, onGiro: (e) => { if (e?.tipo === 'risposta') risposte.push(e.risposta); } });
  } catch (e) { errorePreso = e; }
  return { chiamate, corpi, risposte, errore: errorePreso ?? esito?.errore ?? null, esito };
}

test('KFP-01 senza testo visibile: UNA richiesta sola (prima erano 11), e l\'errore porta il marcatore del contesto pieno', async (t) => {
  const r = await giro(t, {});
  assert.equal(r.chiamate, 1, 'nessun reinvio a contesto pieno');
  const errore = r.errore;
  assert.ok(errore, JSON.stringify(r.esito ?? null).slice(0, 300));
  assert.equal(errore.code, 'PROVIDER_REQUEST_ERROR');
  assert.equal(errore.classe, 'contesto');
  assert.equal(classificaErroreFornitore({ message: errore.message }), 'contesto-pieno');
});

test('KFP-02 con testo già consegnato: niente esito incerto e il pezzo non torna in storia', async (t) => {
  const r = await giro(t, { testo: 'Parziale' });
  assert.equal(r.chiamate, 1);
  assert.equal(r.errore?.code, 'PROVIDER_REQUEST_ERROR');
  assert.notEqual(r.errore?.code, 'PROVIDER_OUTCOME_UNKNOWN');
  assert.equal(r.risposte.some((m) => m?.content === 'Parziale'), false, 'the partial piece does not go back into the history');
  assert.equal(classificaErroreFornitore({ message: r.errore.message }), 'contesto-pieno');
});

test('KFP-03 verso contrario: un flusso interrotto per un altro motivo resta un esito incerto, come prima', async (t) => {
  const r = await giro(t, { testo: 'Parziale', errore: Object.assign(new Error('socket hang up'), { code: 'ECONNRESET' }) });
  assert.notEqual(r.errore?.classe, 'contesto');
  assert.match(String(r.errore?.code), /^PROVIDER_OUTCOME_UNKNOWN/u);
});

test('KFP-04 ognuno dei due segnali basta da solo: il campo strutturato senza marcatore, o il marcatore senza campo', async (t) => {
  const soloCampo = Object.assign(new Error('window full'), { finestraPiena: true });
  const soloMarcatore = new Error('upstream: prompt is too long (context_length_exceeded)');
  for (const errore of [soloCampo, soloMarcatore]) {
    const r = await giro(t, { errore });
    assert.equal(r.chiamate, 1, errore.message);
    assert.equal(r.errore?.classe, 'contesto', errore.message);
  }
});

/*
 * Contratto del Mobile (21/10/2026): dopo la sua coda, il motore dell'app non può più rispondere 400; la finestra piena arriva come
 * pacchetto d'errore alla OpenRouter dentro il flusso, poi [DONE]. Prima della cura era un PROVIDER_STREAM_ERROR (esito incerto).
 */
const PACCHETTO_FINESTRA_PIENA = { error: { code: 'CONTEXT_LENGTH_EXCEEDED', message: 'The prompt does not fit the context of the open model.', type: 'server_error' },
  object: 'chat.completion.chunk', choices: [{ index: 0, delta: {}, finish_reason: 'error' }] };

function flussoConPacchetto(pacchetto) {
  const enc = new TextEncoder();
  return new Response(new ReadableStream({ start(c) { c.enqueue(enc.encode(': ping\n\n')); c.enqueue(enc.encode(`data: ${JSON.stringify(pacchetto)}\n\n`)); c.enqueue(enc.encode('data: [DONE]\n\n')); c.close(); } }),
    { headers: { 'content-type': 'text/event-stream' } });
}

async function giroCon(t, risposta, { flusso = true, modello = 'locale-ospite:lfm2.5-2.6b-q4_0.gguf' } = {}) {
  const cartella = mkdtempSync(join(tmpdir(), 'talos-finestra-piena-'));
  t.after(() => rimuoviCartellaDiProva(cartella));
  let chiamate = 0;
  const fetchDiRete = async () => { chiamate += 1; return risposta(); };
  let errorePreso = null; let esito = null;
  try {
    esito = await talosLavora({ cartella, modello, chiave: 'finta', task: { consegna: 'Scrivi.' }, fetchDiRete,
      ...(flusso ? { onDelta: () => {} } : {}), attesaRitentaMassimaMs: 1 });
  } catch (e) { errorePreso = e; }
  return { chiamate, errore: errorePreso ?? esito?.errore ?? null };
}

test('KFP-05 il pacchetto d\'errore del motore dell\'app (CONTEXT_LENGTH_EXCEEDED, maiuscolo, dopo un ping) è contesto pieno, non esito incerto', async (t) => {
  const r = await giroCon(t, () => flussoConPacchetto(PACCHETTO_FINESTRA_PIENA));
  assert.equal(r.chiamate, 1);
  assert.equal(r.errore?.code, 'PROVIDER_REQUEST_ERROR');
  assert.equal(r.errore?.classe, 'contesto');
  assert.equal(classificaErroreFornitore({ message: r.errore.message }), 'contesto-pieno');
});

test('KFP-06 senza flusso: un corpo JSON con error context_length_exceeded è contesto pieno', async (t) => {
  const r = await giroCon(t, () => Response.json({ error: { code: 'context_length_exceeded', message: 'too long' } }), { flusso: false });
  assert.equal(r.chiamate, 1);
  assert.equal(r.errore?.classe, 'contesto');
});

test('KFP-07 verso contrario: un pacchetto d\'errore con un altro codice resta un esito incerto, come prima', async (t) => {
  const r = await giroCon(t, () => flussoConPacchetto({ ...PACCHETTO_FINESTRA_PIENA, error: { code: 'SOMETHING_ELSE', message: 'The open model changed.', type: 'server_error' } }));
  assert.notEqual(r.errore?.classe, 'contesto');
  assert.match(String(r.errore?.code), /^PROVIDER_OUTCOME_UNKNOWN/u);
});

/* I rifiuti del motore dell'app dentro il flusso (LOS-12 li prova dal registro): il codice vale solo per lui, e solo prima del testo. */
test('KFP-08 verso contrario: LOCAL_MODEL_CHANGED da un fornitore che non è il motore dell\'app resta un esito incerto', async (t) => {
  const r = await giroCon(t, () => flussoConPacchetto({ ...PACCHETTO_FINESTRA_PIENA, error: { code: 'LOCAL_MODEL_CHANGED', message: 'x', type: 'server_error' } }),
    { modello: 'z-ai/glm-5.3-flash' });
  assert.match(String(r.errore?.code), /^PROVIDER_OUTCOME_UNKNOWN/u);
});

test('KFP-09 verso contrario: LOCAL_ENGINE_BUSY DOPO del testo già consegnato resta un esito incerto (la generazione era partita)', async (t) => {
  const enc = new TextEncoder();
  const r = await giroCon(t, () => new Response(new ReadableStream({ start(c) {
    c.enqueue(enc.encode(`data: ${JSON.stringify({ choices: [{ index: 0, delta: { role: 'assistant', content: 'Parziale' } }] })}\n\n`));
    c.enqueue(enc.encode(`data: ${JSON.stringify({ ...PACCHETTO_FINESTRA_PIENA, error: { code: 'LOCAL_ENGINE_BUSY', message: 'x', type: 'server_error' } })}\n\ndata: [DONE]\n\n`));
    c.close();
  } }), { headers: { 'content-type': 'text/event-stream' } }));
  assert.notEqual(r.errore?.code, 'LOCAL_ENGINE_BUSY');
  assert.match(String(r.errore?.code), /^PROVIDER_OUTCOME_UNKNOWN/u);
});
