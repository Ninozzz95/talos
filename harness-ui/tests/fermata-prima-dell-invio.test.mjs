/*
 * S4 della CLI (quarta revisione della 0.6.7, 16/10/2026): un Esc mentre TALOS contava la richiesta — dentro `contextHooks.prepare`,
 * cioè il conteggio dei token o l'attesa del motore del contesto — diceva «stopped on request: while the model was answering, at
 * round 1», ma il modello non era ancora stato chiamato. Ora la fase dice il vero: «before the request was sent». AL CONTRARIO: uno
 * Stop a richiesta partita dice ancora «while the model was answering». Kernel vero, fornitore finto, nessuna rete.
 */
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { talosLavora } from '../src/kernel/talosHarness.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

const interrotto = () => Object.assign(new Error('The operation was aborted.'), { name: 'AbortError' });

async function giro(t, { fermaNellaPreparazione, conInfer = true, motoreInCaricamentoFn, modello = 'z-ai/glm-5.3-flash' }) {
  const cartella = mkdtempSync(join(tmpdir(), 'talos-fermata-invio-'));
  writeFileSync(join(cartella, 'uno.txt'), 'x');
  t.after(() => rimuoviCartellaDiProva(cartella));
  const stop = new AbortController();
  let richieste = 0;
  const contextHooks = {
    prepare: async ({ messages }) => {
      if (fermaNellaPreparazione) { stop.abort(); throw interrotto(); } // Esc mentre si conta la richiesta
      return { messages };
    },
    ...(conInfer ? { infer: ({ signal }, operazione) => operazione(signal) } : {}), // il servizio del contesto ha `infer`
  };
  const fetchDiRete = async () => { richieste += 1; stop.abort(); throw interrotto(); }; // Esc mentre il modello risponde
  const esito = await talosLavora({
    cartella, task: { consegna: 'Elenca la cartella.' }, modello, chiave: 'fixture',
    fetchDiRete, contestoDelProgetto: 'PREAMBOLO', comandoProva: 'node -e 0', contextHooks, segnaleStop: stop.signal,
    ...(motoreInCaricamentoFn ? { motoreInCaricamentoFn } : {}),
  });
  return { testo: JSON.stringify(esito), richieste };
}

/* 01/11/2026 (contratto di Desktop, Frontend e Mobile): uno Stop mentre il motore locale si apriva diceva «while the model was answering». */
test('FERMATA-INVIO-07 — Stop mentre il motore locale si apre: «while the model was still loading», frase ESATTA (il telefono la legge)', async (t) => {
  const chiesti = [];
  const { testo, richieste } = await giro(t, { fermaNellaPreparazione: false, modello: 'local:qwen', motoreInCaricamentoFn: (m) => { chiesti.push(m); return true; } });
  assert.equal(richieste, 1);
  assert.match(testo, /stopped on request: while the model was still loading, at round 1\./u);
  assert.deepEqual(chiesti, ['local:qwen'], 'asked once, with the model of the turn');
});

test('FERMATA-INVIO-08 — AL CONTRARIO: il motore già aperto, una funzione che lancia o un «sì» non booleano dicono ancora «answering»; prima dell\'invio non si chiede', async (t) => {
  for (const motoreInCaricamentoFn of [() => false, () => { throw new Error('rotto'); }, () => 'si']) {
    const { testo } = await giro(t, { fermaNellaPreparazione: false, modello: 'local:qwen', motoreInCaricamentoFn });
    assert.match(testo, /stopped on request: while the model was answering, at round 1\./u);
  }
  let chiesto = false;
  const { testo } = await giro(t, { fermaNellaPreparazione: true, modello: 'local:qwen', motoreInCaricamentoFn: () => { chiesto = true; return true; } });
  assert.match(testo, /before the request was sent, at round 1\./u);
  assert.equal(chiesto, false);
});

/* D8 (forma b, concordata il 03/11/2026 con Mobile, Frontend e CLI): uno Stop fra «motore aperto» e la prima parola diceva «while the
   model was answering», ma il modello stava ancora leggendo la conversazione (sul motore locale è la fase lunga). Con il flusso acceso
   (onDelta) il nucleo sa se la prima parola è arrivata; senza flusso non lo sa, e la frase resta «answering» (FERMATA-INVIO-08). */
const fineQuandoFermata = (signal) => new Promise((_, ko) => {
  if (signal?.aborted) ko(interrotto()); else signal?.addEventListener('abort', () => ko(interrotto()), { once: true });
});
/* un flusso che manda UNA parola e poi resta appeso finché lo Stop non lo chiude */
const unaParolaPoiAppeso = (signal) => new Response(new ReadableStream({
  start(c) {
    c.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({ choices: [{ delta: { content: 'Ciao' } }] })}\n\n`));
    const via = () => { try { c.error(interrotto()); } catch { /* già chiuso */ } };
    if (signal?.aborted) via(); else signal?.addEventListener('abort', via, { once: true });
  },
}), { status: 200, headers: { 'Content-Type': 'text/event-stream' } });

async function giroAFlusso(t, { modello = 'local:qwen', fetchFatto, dopoLaParola = false }) {
  const cartella = mkdtempSync(join(tmpdir(), 'talos-fermata-invio-'));
  writeFileSync(join(cartella, 'uno.txt'), 'x');
  t.after(() => rimuoviCartellaDiProva(cartella));
  const stop = new AbortController();
  let richieste = 0;
  const delta = [];
  const fetchDiRete = async (url, init) => {
    richieste += 1;
    if (!dopoLaParola) setTimeout(() => stop.abort(), 20); // Stop mentre il modello legge: nessuna parola arrivata
    return fetchFatto(init?.signal);
  };
  const esito = await talosLavora({
    cartella, task: { consegna: 'Elenca la cartella.' }, modello, chiave: 'fixture', fetchDiRete, contestoDelProgetto: 'PREAMBOLO',
    comandoProva: 'node -e 0', segnaleStop: stop.signal, motoreInCaricamentoFn: () => false,
    onDelta: (e) => { delta.push(e); if (dopoLaParola && e?.tipo === 'testo') setTimeout(() => stop.abort(), 0); },
  });
  return { testo: JSON.stringify(esito), richieste, delta };
}

test('FERMATA-INVIO-09 — D8: motore locale aperto, Stop prima della prima parola: «while the model was reading the conversation», frase ESATTA', async (t) => {
  const { testo, richieste, delta } = await giroAFlusso(t, { fetchFatto: fineQuandoFermata });
  assert.equal(richieste, 1, 'premessa: la richiesta è partita');
  assert.equal(delta.length, 0, 'premessa: nessuna parola arrivata');
  assert.match(testo, /stopped on request: while the model was reading the conversation, at round 1\./u);
});

test('FERMATA-INVIO-10 — D8 AL CONTRARIO: arrivata una parola, lo Stop dice «answering»; e un modello a chiave non dice mai «reading»', async (t) => {
  const dopo = await giroAFlusso(t, { fetchFatto: unaParolaPoiAppeso, dopoLaParola: true });
  assert.ok(dopo.delta.some((e) => e?.tipo === 'testo'), 'premessa: la prima parola è arrivata');
  assert.match(dopo.testo, /stopped on request: while the model was answering, at round 1\./u);
  const remoto = await giroAFlusso(t, { modello: 'z-ai/glm-5.3-flash', fetchFatto: fineQuandoFermata });
  assert.match(remoto.testo, /stopped on request: while the model was answering, at round 1\./u);
});

test('FERMATA-INVIO-01 — Esc mentre si contava la richiesta: «before the request was sent», e nessuna richiesta al modello', async (t) => {
  const { testo, richieste } = await giro(t, { fermaNellaPreparazione: true });
  assert.equal(richieste, 0, 'premessa: il modello non è stato chiamato');
  assert.match(testo, /stopped on request: before the request was sent, at round 1\./u);
  assert.doesNotMatch(testo, /while the model was answering/u);
});

test('FERMATA-INVIO-02 — AL CONTRARIO: Esc a richiesta partita dice ancora «while the model was answering»', async (t) => {
  const { testo, richieste } = await giro(t, { fermaNellaPreparazione: false });
  assert.equal(richieste, 1);
  assert.match(testo, /stopped on request: while the model was answering, at round 1\./u);
});

test('FERMATA-INVIO-02b — AL CONTRARIO anche senza il gancio `infer` (la seconda strada del kernel)', async (t) => {
  const { testo, richieste } = await giro(t, { fermaNellaPreparazione: false, conInfer: false });
  assert.equal(richieste, 1);
  assert.match(testo, /stopped on request: while the model was answering, at round 1\./u);
});

test('FERMATA-INVIO-04 — Esc mentre si ri-prepara dopo un «contesto pieno» (il ritentativo): la richiesta nuova non era ancora partita', async (t) => {
  const cartella = mkdtempSync(join(tmpdir(), 'talos-fermata-invio-'));
  writeFileSync(join(cartella, 'uno.txt'), 'x');
  t.after(() => rimuoviCartellaDiProva(cartella));
  const stop = new AbortController();
  let richieste = 0;
  const fetchDiRete = async () => { richieste += 1; return new Response(JSON.stringify({ error: { code: 400, message: "This endpoint's maximum context length is 60000 tokens." } }), { status: 400, headers: { 'content-type': 'application/json' } }); };
  const contextHooks = { prepare: async ({ messages }) => ({ messages }), infer: async ({ signal }, operazione) => {
    try { return await operazione(signal); } catch { stop.abort(); throw interrotto(); } // come il ritentativo: Esc mentre si ri-prepara
  } };
  const esito = await talosLavora({ cartella, task: { consegna: 'Elenca la cartella.' }, modello: 'z-ai/glm-5.3-flash', chiave: 'fixture',
    fetchDiRete, contestoDelProgetto: 'PREAMBOLO', comandoProva: 'node -e 0', contextHooks, segnaleStop: stop.signal });
  assert.equal(richieste, 1, 'premessa: la prima richiesta è partita ed è stata rifiutata');
  assert.match(JSON.stringify(esito), /stopped on request: before the request was sent, at round 1\./u);
});

test('FERMATA-INVIO-05 — Esc durante la capture INIZIALE: il giro finisce «stopped on request: before round 1», non lancia', async (t) => {
  const cartella = mkdtempSync(join(tmpdir(), 'talos-fermata-invio-'));
  writeFileSync(join(cartella, 'uno.txt'), 'x');
  t.after(() => rimuoviCartellaDiProva(cartella));
  const stop = new AbortController();
  let richieste = 0;
  const contextHooks = { capture: async ({ reason }) => { if (reason === 'start') { stop.abort(); throw interrotto(); } }, prepare: async ({ messages }) => ({ messages }) };
  const esito = await talosLavora({ cartella, task: { consegna: 'Elenca la cartella.' }, modello: 'z-ai/glm-5.3-flash', chiave: 'fixture',
    fetchDiRete: async () => { richieste += 1; throw interrotto(); }, contestoDelProgetto: 'PREAMBOLO', comandoProva: 'node -e 0', contextHooks, segnaleStop: stop.signal });
  assert.equal(richieste, 0);
  assert.match(JSON.stringify(esito), /stopped on request: before round 1\./u);
});

/* 29/10/2026: «passa com'era» voleva dire «lancia». Ora un errore vero della capture, senza Stop, si dice una volta e il giro va avanti
   (regola dell'owner del 12/10, forma concordata con la CLI; tests/capture-nativo-non-ferma.test.mjs). Il verso contrario resta: NON
   diventa uno Stop, cioè la richiesta parte. */
test('FERMATA-INVIO-06 — AL CONTRARIO: un errore vero della capture iniziale, senza Stop, non diventa uno Stop: la richiesta parte', async (t) => {
  const cartella = mkdtempSync(join(tmpdir(), 'talos-fermata-invio-'));
  writeFileSync(join(cartella, 'uno.txt'), 'x');
  t.after(() => rimuoviCartellaDiProva(cartella));
  const contextHooks = { capture: async ({ reason }) => { if (reason === 'start') throw Object.assign(new Error('archivio rotto'), { code: 'CTX_STORE_BROKEN' }); }, prepare: async ({ messages }) => ({ messages }) };
  let richieste = 0;
  const esito = await talosLavora({ cartella, task: { consegna: 'Elenca la cartella.' }, modello: 'z-ai/glm-5.3-flash', chiave: 'fixture',
    fetchDiRete: async () => { richieste += 1; return Response.json({ choices: [{ message: { role: 'assistant', content: 'Fatto.' }, finish_reason: 'stop' }] }); },
    contestoDelProgetto: 'PREAMBOLO', comandoProva: 'node -e 0', contextHooks });
  assert.equal(richieste, 1);
  assert.doesNotMatch(JSON.stringify(esito), /stopped on request/u);
});

/*
 * Revisione avversaria di D8 del Desktop (04/11/2026, `desktop/in-corso/REVISIONE-D8-MOTORE-2026-11-04.md`): con le prove qui sopra restavano
 *   vivi 3 mutanti su 9 del nucleo. Buchi: col flusso acceso nessuna prova teneva «still loading» davanti a «reading», e il segno «prima parola»
 *   non era provato col solo ragionamento, con una chiamata nel testo trattenuta dal filtro, né con un attrezzo nativo che comincia.
 *   Le quattro prove sono quelle della sua sonda (S1, S2, S3, S5), portate qui.
 */
const pezziPoiAppeso = (pezzi) => (signal) => new Response(new ReadableStream({
  start(c) {
    for (const delta of pezzi) c.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({ choices: [{ delta }] })}\n\n`));
    const via = () => { try { c.error(Object.assign(new Error('The operation was aborted.'), { name: 'AbortError' })); } catch { /* già chiuso */ } };
    if (signal?.aborted) via(); else signal?.addEventListener('abort', via, { once: true });
  },
}), { status: 200, headers: { 'Content-Type': 'text/event-stream' } });

async function giroDellaRevisione(t, { fetchFatto, motoreInCaricamentoFn = () => false }) {
  const cartella = mkdtempSync(join(tmpdir(), 'talos-fermata-d8-'));
  writeFileSync(join(cartella, 'uno.txt'), 'x');
  t.after(() => rimuoviCartellaDiProva(cartella));
  const stop = new AbortController();
  const delta = [];
  const fetchDiRete = async (url, init) => { setTimeout(() => stop.abort(), 60); return fetchFatto(init?.signal); };
  const esito = await talosLavora({
    cartella, task: { consegna: 'Elenca la cartella.' }, modello: 'local:qwen', chiave: 'fixture', fetchDiRete, contestoDelProgetto: 'PREAMBOLO',
    comandoProva: 'node -e 0', segnaleStop: stop.signal, motoreInCaricamentoFn, onDelta: (e) => { delta.push(e); },
  });
  return { testo: JSON.stringify(esito), delta };
}

test('FERMATA-INVIO-11 — D8 (revisione S1): flusso acceso e motore ancora in apertura, «still loading» vince su «reading»', async (t) => {
  const { testo } = await giroDellaRevisione(t, { fetchFatto: fineQuandoFermata, motoreInCaricamentoFn: () => true });
  assert.match(testo, /stopped on request: while the model was still loading, at round 1\./u);
});

test('FERMATA-INVIO-12 — D8 (revisione S2): arrivato solo il ragionamento, poi Stop: «answering»', async (t) => {
  const { testo, delta } = await giroDellaRevisione(t, { fetchFatto: pezziPoiAppeso([{ reasoning_content: 'Penso a cosa fare' }]) });
  assert.ok(delta.some((e) => e?.tipo === 'ragionamento'), 'premessa: il ragionamento è arrivato');
  assert.match(testo, /stopped on request: while the model was answering, at round 1\./u);
});

test('FERMATA-INVIO-13 — D8 (revisione S3): una chiamata nel testo trattenuta dal filtro, niente a schermo, poi Stop: «answering»', async (t) => {
  const { testo, delta } = await giroDellaRevisione(t, { fetchFatto: pezziPoiAppeso([{ content: 'shell<arg_key>comando</arg_key><arg_value>node -e "' + 'console.log(1); '.repeat(50) }]) });
  assert.ok(!delta.some((e) => e?.tipo === 'testo'), 'premessa: niente testo a schermo');
  assert.match(testo, /stopped on request: while the model was answering, at round 1\./u);
});

test('FERMATA-INVIO-14 — D8 (revisione S5): un attrezzo nativo che comincia, poi Stop: «answering»', async (t) => {
  const { testo } = await giroDellaRevisione(t, { fetchFatto: pezziPoiAppeso([{ tool_calls: [{ index: 0, id: 'c1', type: 'function', function: { name: 'shell', arguments: '{"com' } }] }]) });
  assert.match(testo, /stopped on request: while the model was answering, at round 1\./u);
});
