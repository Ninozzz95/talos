/*
 * Lane CLI, 03/10/2026 — `compaction.progress` (decisione dell'owner «foglio subito + patch per il conteggio»): mentre una
 * compattazione succede, i suoi passi VERI arrivano a chi è connesso — `lettura` della conversazione, `riassunto` contato
 * mentre si scrive (streaming, ~4 caratteri per token dichiarato `stimato: true`, poi il numero del fornitore), `sostituzione`
 * della storia — al massimo quattro al secondo, mai scritti su disco. Tre strade: la compattazione DEL GIRO (adapter
 * desktop, via `onGiro`), quella IN BACKGROUND a fine giro (registro) e quella MANUALE (`registro.compatta`).
 * Tutto ermetico: fornitore finto (JSON per il lavoro, SSE per il riassunto), TEMP privata, nessuna porta.
 */
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { talosLavora } from '../src/kernel/talosHarness.desktop-hotfix.mjs';
import {
  INTERVALLO_PROGRESSO_RIASSUNTO_MS, MARCATORE_RIASSUNTO, NOME_EVENTO_PROGRESSO_COMPATTAZIONE, VARIABILE_TETTO_TOKEN,
  creaContatoreRiassunto,
} from '../src/kernel/compattazione-desktop.mjs';
import { avviaSessione, compattaSessione } from '../src/agent-service.mjs';
import { createSessionRegistry as createSessionRegistryReale } from '../src/session-registry.mjs';
import { attendiScritture } from '../src/session-store.mjs';
import { TaskCatalogError } from '../src/task-catalog.mjs';
import { cartellaDiProva as cartellaTemporanea } from './aiuto/cartelle-di-prova.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

const ePasso = (e) => e?.type === 'CUSTOM' && e.name === NOME_EVENTO_PROGRESSO_COMPATTAZIONE;

/* ─── Il contatore ─────────────────────────────────────────────────────────────────────────────────── */

test('CP-CONTATORE-01 — al massimo un avviso ogni 250 ms, il primo subito, la stima a ~4 caratteri per token', () => {
  let adesso = 0;
  const avvisi = [];
  const contatore = creaContatoreRiassunto({ emetti: (v) => avvisi.push({ ...v, t: adesso }), ora: () => adesso });
  assert.equal(INTERVALLO_PROGRESSO_RIASSUNTO_MS, 250, 'quattro al secondo, come ha chiesto la CLI');
  /* un secondo di pezzi da 8 caratteri ogni 10 ms: 100 pezzi */
  for (adesso = 0; adesso < 1_000; adesso += 10) contatore.onDelta({ tipo: 'testo', delta: 'abcdefgh' });
  assert.deepEqual(avvisi.map((a) => a.t), [0, 250, 500, 750], 'quattro avvisi in un secondo, il primo al primo pezzo');
  assert.equal(avvisi[0].tokenRiassunto, 2, '8 caratteri ≈ 2 token');
  assert.equal(avvisi[3].tokenRiassunto, Math.ceil((76 * 8) / 4), 'al 76° pezzo: 608 caratteri ≈ 152 token');
  assert.ok(avvisi.every((a) => a.fase === 'riassunto' && a.stimato === true && a.tentativo === 1));
  /* i pezzi di ragionamento contano (sono token in uscita), gli altri no */
  adesso = 2_000;
  contatore.onDelta({ tipo: 'tool-annullato', delta: 'x'.repeat(4_000) });
  assert.equal(avvisi.length, 4, 'un pezzo che non è testo non si conta e non avvisa');
  contatore.onDelta({ tipo: 'ragionamento', delta: 'pppp' });
  assert.equal(avvisi.at(-1).tokenRiassunto, Math.ceil((100 * 8 + 4) / 4));
});

test('CP-CONTATORE-02 — alla fine vale il numero del fornitore (stimato:false); senza, l\'ultima stima resta dichiarata', () => {
  const avvisi = [];
  const conUso = creaContatoreRiassunto({ emetti: (v) => avvisi.push(v), tentativo: 2 });
  conUso.onDelta({ tipo: 'testo', delta: 'x'.repeat(40) });
  conUso.chiudi({ prompt_tokens: 900, completion_tokens: 77 });
  assert.deepEqual(avvisi.at(-1), { fase: 'riassunto', tentativo: 2, tokenRiassunto: 77, stimato: false });
  const senzaUso = creaContatoreRiassunto({ emetti: (v) => avvisi.push(v) });
  senzaUso.onDelta({ tipo: 'testo', delta: 'x'.repeat(40) });
  senzaUso.chiudi(null);
  assert.deepEqual(avvisi.at(-1), { fase: 'riassunto', tentativo: 1, tokenRiassunto: 10, stimato: true });
  /* un osservatore che lancia non decide l'esito */
  const rotto = creaContatoreRiassunto({ emetti: () => { throw new Error('osservatore rotto'); } });
  assert.doesNotThrow(() => { rotto.onDelta({ tipo: 'testo', delta: 'x' }); rotto.chiudi({ completion_tokens: 1 }); });
});

/* ─── La compattazione del giro (adapter desktop) ──────────────────────────────────────────────────── */

const CONSEGNA = 'CONSEGNA-ORIGINALE-MARKER: leggi grande.txt più volte e riferisci.';
const RIASSUNTO_IN_STREAMING = 'RIASSUNTO-IN-STREAMING: ho letto grande.txt più volte e ne ho riferito il contenuto.';

function cartellaDiProva(t) {
  const dir = mkdtempSync(join(tmpdir(), 'talos-compattazione-progresso-'));
  writeFileSync(join(dir, 'grande.txt'), `${'g'.repeat(79)}\n`.repeat(50));
  t.after(() => rimuoviCartellaDiProva(dir));
  return dir;
}

function conTetto(t, valore) {
  const prima = process.env[VARIABILE_TETTO_TOKEN];
  process.env[VARIABILE_TETTO_TOKEN] = String(valore);
  t.after(() => { if (prima === undefined) delete process.env[VARIABILE_TETTO_TOKEN]; else process.env[VARIABILE_TETTO_TOKEN] = prima; });
}

const eRichiestaDiRiassunto = (body) => {
  const ultimo = String(body.messages.at(-1)?.content ?? '');
  return ultimo.includes('CONTEXT COMPACTION') || ultimo.includes('summarize your progress');
};

/** Un flusso SSE come lo manda OpenRouter con `stream_options.include_usage`: i pezzi, la fine, l'uso, [DONE]. */
function rispostaSse(pezzi, { finishReason = 'stop', completionTokens = 77, promptTokens = 1_000, delta = null } = {}) {
  const righe = [
    ...pezzi.map((p) => `data: ${JSON.stringify({ choices: [{ index: 0, delta: { content: p } }] })}\n\n`),
    ...(delta ? [`data: ${JSON.stringify({ choices: [{ index: 0, delta }] })}\n\n`] : []),
    `data: ${JSON.stringify({ choices: [{ index: 0, delta: {}, finish_reason: finishReason }] })}\n\n`,
    `data: ${JSON.stringify({ choices: [], usage: { prompt_tokens: promptTokens, completion_tokens: completionTokens } })}\n\n`,
    'data: [DONE]\n\n',
  ];
  const codifica = new TextEncoder();
  const corpo = new ReadableStream({ start(c) { for (const r of righe) c.enqueue(codifica.encode(r)); c.close(); } });
  return new Response(corpo, { status: 200, headers: { 'content-type': 'text/event-stream' } });
}

/** Lavoro in JSON (il giro di prova non va in streaming), riassunto in SSE se la richiesta lo chiede, in JSON altrimenti. */
function fintoFornitore({ chiamateTool = 10, finishReason = 'stop' } = {}) {
  const corpi = [];
  let lavoro = 0;
  const fetchDiRete = async (_url, init) => {
    const body = JSON.parse(init.body);
    corpi.push(body);
    const usage = { prompt_tokens: Math.ceil(JSON.stringify(body.messages).length / 4), completion_tokens: 5 };
    if (eRichiestaDiRiassunto(body)) {
      if (body.stream === true) return rispostaSse(RIASSUNTO_IN_STREAMING.match(/.{1,6}/gsu), { finishReason });
      return Response.json({ choices: [{ message: { role: 'assistant', content: RIASSUNTO_IN_STREAMING }, finish_reason: finishReason }], usage });
    }
    lavoro += 1;
    const chiamata = { id: `call_${lavoro}`, type: 'function', function: { name: 'leggi', arguments: '{"percorso":"grande.txt"}' } };
    /* Un giro con `onDelta` va in streaming anche lui: il lavoro risponde nella stessa forma che ha chiesto. */
    if (body.stream === true) {
      const delta = lavoro <= chiamateTool ? { tool_calls: [{ index: 0, ...chiamata }] } : { content: 'Fatto.' };
      return rispostaSse([], { delta, finishReason: lavoro <= chiamateTool ? 'tool_calls' : 'stop', completionTokens: 5, promptTokens: usage.prompt_tokens });
    }
    if (lavoro <= chiamateTool) {
      return Response.json({ choices: [{ message: { role: 'assistant', content: '', tool_calls: [chiamata] }, finish_reason: 'tool_calls' }], usage });
    }
    return Response.json({ choices: [{ message: { role: 'assistant', content: 'Fatto.' }, finish_reason: 'stop' }], usage });
  };
  return { fetchDiRete, corpi, riassunti: () => corpi.filter(eRichiestaDiRiassunto) };
}

async function giro({ cartella, fornitore, ...resto }) {
  const eventi = [];
  const esito = await talosLavora({
    cartella, task: { consegna: CONSEGNA }, modello: 'z-ai/glm-5.3-flash', chiave: 'fixture',
    fetchDiRete: fornitore.fetchDiRete, contestoDelProgetto: `PREAMBOLO ${'x'.repeat(12_000)}`, comandoProva: 'node -e 0',
    onGiro: (e) => eventi.push(e),
    ...resto,
  });
  return { esito, eventi, passi: eventi.filter((e) => e.tipo === 'compattazione-progresso') };
}

test('CP-GIRO-01 — acceso: il riassunto viaggia in streaming e i passi arrivano in ordine, lettura → riassunto → sostituzione', async (t) => {
  conTetto(t, 8_000);
  const cartella = cartellaDiProva(t);
  const fornitore = fintoFornitore();
  const delte = [];
  const { esito, passi } = await giro({ cartella, fornitore, progressoCompattazione: true, onDelta: (e) => delte.push(e) });
  assert.equal(esito.comeFinita, 'concluso');
  const riassunti = fornitore.riassunti();
  assert.ok(riassunti.length >= 1, 'almeno un riassunto');
  for (const body of riassunti) {
    assert.equal(body.stream, true, 'il riassunto viaggia in streaming');
    assert.equal(body.stream_options?.include_usage, true, 'col numero del fornitore in coda');
  }
  /* la prima compattazione, passo per passo */
  const primo = passi[0].giro;
  const suoi = passi.filter((p) => p.giro === primo);
  assert.equal(suoi[0].fase, 'lettura');
  assert.ok(suoi[0].messaggi > 0 && suoi[0].tokenPrima > 0, `lettura coi numeri: ${JSON.stringify(suoi[0])}`);
  const conteggi = suoi.filter((p) => p.fase === 'riassunto');
  assert.ok(conteggi.length >= 2, `almeno una stima e il numero finale: ${conteggi.length}`);
  assert.ok(conteggi.slice(0, -1).every((p) => p.stimato === true && p.tokenRiassunto > 0));
  assert.deepEqual({ tokenRiassunto: conteggi.at(-1).tokenRiassunto, stimato: conteggi.at(-1).stimato }, { tokenRiassunto: 77, stimato: false },
    'alla fine vale usage.completion_tokens del fornitore');
  assert.equal(suoi.at(-1).fase, 'sostituzione');
  assert.ok(suoi.at(-1).tokenDopo > 0);
  assert.ok(suoi.every((p) => typeof p.motivo === 'string' && p.motivo.length > 0), 'ogni passo dice quale compattazione');
  /* il riassunto arrivato a pezzi è quello che entra nella storia, e la persona non lo vede come risposta */
  assert.ok(fornitore.corpi.some((b) => b.messages.some((m) => typeof m.content === 'string' && m.content.startsWith(MARCATORE_RIASSUNTO) && m.content.includes('RIASSUNTO-IN-STREAMING'))),
    'la proiezione porta il riassunto ricomposto dai pezzi');
  assert.equal(delte.some((d) => String(d?.delta ?? '').includes('RIASSUNTO')), false, 'i pezzi del riassunto non passano dall\'onDelta del giro');
});

test('CP-GIRO-02 — AL CONTRARIO, spento (il default): niente streaming e nessun passo, come prima', async (t) => {
  conTetto(t, 8_000);
  const cartella = cartellaDiProva(t);
  const fornitore = fintoFornitore();
  const { esito, passi } = await giro({ cartella, fornitore });
  assert.equal(esito.comeFinita, 'concluso');
  assert.ok(fornitore.riassunti().length >= 1, 'la compattazione c\'è stata');
  assert.ok(fornitore.riassunti().every((b) => b.stream === undefined), 'senza il permesso il riassunto non va in streaming');
  assert.equal(passi.length, 0);
});

test('CP-GIRO-03 — un riassunto troncato si ferma al riassunto: niente sostituzione, e la fine dice dove', async (t) => {
  conTetto(t, 8_000);
  const cartella = cartellaDiProva(t);
  const fornitore = fintoFornitore({ finishReason: 'length' });
  const { eventi, passi } = await giro({ cartella, fornitore, progressoCompattazione: true });
  const fine = eventi.find((e) => e.tipo === 'compattazione-fine');
  assert.ok(fine, 'la compattazione è finita');
  assert.equal(fine.compattato, false);
  assert.equal(fine.motivo, 'troncato');
  assert.equal(fine.interrottaIn, 'riassunto');
  const suoi = passi.filter((p) => p.giro === fine.giro);
  assert.deepEqual([...new Set(suoi.map((p) => p.fase))], ['lettura', 'riassunto'], 'nessuna sostituzione finta');
});

/* ─── agent-service: dal giro all'evento AG-UI ─────────────────────────────────────────────────────── */

test('CP-SERVIZIO-01 — il servizio accende i passi e li traduce in CUSTOM talos.compattazione-progresso; la fine dice dove si è fermata', async () => {
  const eventi = [];
  let inputVisto = null;
  await avviaSessione({
    cartella: '/tmp/x', task: { consegna: 'prova' }, modello: 'm', chiave: 'k',
    onEvento: (e) => { eventi.push(e); },
    talosLavoraFn: async (input) => {
      inputVisto = input;
      input.onGiro({ giro: 3, tipo: 'compattazione-inizio', tokenMisurati: 9_500, soglia: 8_000, motivo: 'soglia' });
      input.onGiro({ giro: 3, tipo: 'compattazione-progresso', fase: 'lettura', messaggi: 12, tokenPrima: 9_500, motivo: 'soglia' });
      input.onGiro({ giro: 3, tipo: 'compattazione-progresso', fase: 'riassunto', tentativo: 1, tokenRiassunto: 40, stimato: true, motivo: 'soglia' });
      input.onGiro({ giro: 3, tipo: 'compattazione-fine', compattato: false, motivo: 'troncato', interrottaIn: 'riassunto' });
      return { comeFinita: 'concluso', detto: 'fatto', messaggiFinali: [] };
    },
  });
  assert.equal(inputVisto.progressoCompattazione, true, 'il servizio chiede i passi al kernel');
  const passi = eventi.filter(ePasso);
  assert.deepEqual(passi.map((e) => e.value), [
    { giro: 3, fase: 'lettura', messaggi: 12, tokenPrima: 9_500, motivo: 'soglia' },
    { giro: 3, fase: 'riassunto', tentativo: 1, tokenRiassunto: 40, stimato: true, motivo: 'soglia' },
  ]);
  const fine = eventi.find((e) => e.type === 'CUSTOM' && e.name === 'talos.compattazione' && e.value.fase === 'fine');
  assert.equal(fine.value.interrottaIn, 'riassunto');
});

test('CP-SERVIZIO-02 — «Compatta ora»: con onProgresso il riassunto si conta mentre si scrive; senza, la richiesta è quella di sempre', async () => {
  const storia = [
    { role: 'system', content: 's' }, { role: 'user', content: 'compito' },
    { role: 'assistant', content: 'lavoro '.repeat(200) }, { role: 'user', content: 'continua' },
  ];
  const corpi = [];
  const fetchDiRete = async (_url, init) => {
    const body = JSON.parse(init.body);
    corpi.push(body);
    if (body.stream === true) return rispostaSse(['RIASSUNTO ', 'MANUALE ', 'A PEZZI']);
    return Response.json({ choices: [{ message: { role: 'assistant', content: 'RIASSUNTO MANUALE' }, finish_reason: 'stop' }], usage: { prompt_tokens: 10, completion_tokens: 3 } });
  };
  const passi = [];
  const conPassi = await compattaSessione({ messaggiFinali: storia, modello: 'z-ai/glm-5.3-flash', chiave: 'k', fetchDiRete, onProgresso: (p) => passi.push(p) });
  assert.equal(conPassi.compattato, true);
  assert.ok(conPassi.messaggi.some((m) => String(m.content).includes('RIASSUNTO MANUALE A PEZZI')), 'il riassunto ricomposto entra nella storia');
  assert.equal(corpi[0].stream, true);
  assert.ok(passi.length >= 2 && passi.every((p) => p.fase === 'riassunto' && p.tentativo === 1));
  assert.deepEqual({ tokenRiassunto: passi.at(-1).tokenRiassunto, stimato: passi.at(-1).stimato }, { tokenRiassunto: 77, stimato: false });

  const senzaPassi = await compattaSessione({ messaggiFinali: storia, modello: 'z-ai/glm-5.3-flash', chiave: 'k', fetchDiRete });
  assert.equal(senzaPassi.compattato, true);
  assert.equal(corpi[1].stream, undefined, 'senza chi ascolta, niente streaming');
});

/* ─── Il registro: manuale e in background ─────────────────────────────────────────────────────────── */

const createSessionRegistry = (opzioni) => createSessionRegistryReale({ guardaWorkspaceFn: () => () => {}, ...opzioni });
const preparaEsecuzioneFinta = (taskId) => {
  if (taskId !== 'task-vero') throw new TaskCatalogError(`Task non ammesso: ${taskId}`);
  return { cartella: '/tmp/x', comandoProva: 'npm test', task: { id: 'task-vero', consegna: 'c' } };
};
function giriFinti(n) {
  const giri = Array.from({ length: n }, () => {
    let fine; let onEvento;
    return {
      avvia: async (input) => { onEvento = input.onEvento; onEvento({ type: 'RunStarted', threadId: 't1', runId: 'r1' }); return new Promise((ok) => { fine = ok; }); },
      concludi(esito) { onEvento({ type: 'RunFinished', threadId: 't1', runId: 'r1' }); fine({ ok: true, esito }); },
    };
  });
  let i = 0;
  return { giri, avviaSessioneFn: (input) => giri[i++].avvia(input) };
}
const STORIA = [
  { role: 'system', content: 's' }, { role: 'user', content: 'ciao' }, { role: 'assistant', content: 'parola '.repeat(4_000) },
  { role: 'user', content: 'continua' }, { role: 'assistant', content: 'parola '.repeat(4_000) },
];
const RIASSUNTA = [{ role: 'system', content: 's' }, { role: 'user', content: 'Riassunto: abbiamo parlato.' }];
const righeDelJournal = (cartellaStore, sessionId) => readFileSync(join(cartellaStore, `${sessionId}.jsonl`), 'utf8').trim().split('\n').map((r) => JSON.parse(r));

test('CP-REGISTRO-01 — «Compatta ora»: lettura → riassunto → sostituzione a chi ascolta, con sessionId e motivo, e niente su disco', async () => {
  const cartellaStore = cartellaTemporanea('talos-compattazione-progresso-');
  try {
    const { giri, avviaSessioneFn } = giriFinti(1);
    let argomenti = null;
    const registro = createSessionRegistry({
      cartellaStore, avviaSessioneFn, preparaEsecuzioneFn: preparaEsecuzioneFinta, modello: 'z-ai/glm-5.3-flash', chiave: 'k',
      compattaSessioneFn: async (a) => {
        argomenti = a;
        a.onProgresso({ fase: 'riassunto', tentativo: 1, tokenRiassunto: 12, stimato: true });
        a.onProgresso({ fase: 'riassunto', tentativo: 1, tokenRiassunto: 30, stimato: false });
        return { compattato: true, messaggi: RIASSUNTA, usage: null };
      },
    });
    const { sessionId } = registro.avvia('task-vero');
    giri[0].concludi({ comeFinita: 'concluso', messaggiFinali: STORIA });
    await attendiScritture({ cartellaStore, sessionId });
    const eventi = [];
    registro.iscriviti(sessionId, (e) => eventi.push(e));
    const esito = await registro.compatta(sessionId);
    assert.equal(esito.compattato, true, JSON.stringify(esito));
    assert.equal(typeof argomenti.onProgresso, 'function', 'il registro passa chi ascolta al riassuntore');
    const passi = eventi.filter(ePasso).map((e) => e.value);
    assert.deepEqual(passi.map((p) => p.fase), ['lettura', 'riassunto', 'riassunto', 'sostituzione']);
    assert.ok(passi.every((p) => p.sessionId === sessionId && p.motivo === 'manuale'), JSON.stringify(passi));
    assert.equal(passi[0].messaggi, STORIA.length);
    assert.ok(passi[0].tokenPrima > passi[3].tokenDopo && passi[3].tokenDopo > 0);
    const iPassoFinale = eventi.findIndex((e) => ePasso(e) && e.value.fase === 'sostituzione');
    const iFine = eventi.findIndex((e) => e.type === 'CUSTOM' && e.name === 'talos.compattazione' && e.value.fase === 'fine');
    assert.ok(iPassoFinale >= 0 && iPassoFinale < iFine, 'la sostituzione si annuncia prima della fine');
    /* effimeri: non stanno nel journal, e chi si iscrive dopo non li rivede */
    await attendiScritture({ cartellaStore, sessionId });
    assert.equal(righeDelJournal(cartellaStore, sessionId).some((r) => r.name === NOME_EVENTO_PROGRESSO_COMPATTAZIONE), false, 'mai su disco');
    const dopo = [];
    registro.iscriviti(sessionId, (e) => dopo.push(e));
    assert.ok(dopo.some((e) => e.type === 'CUSTOM' && e.name === 'talos.compattazione' && e.value.fase === 'fine'), 'la fine durevole si rigioca');
    assert.equal(dopo.some(ePasso), false, 'i passi no: sono avanzamento, non storia');
  } finally {
    await attendiScritture({ cartellaStore });
    rimuoviCartellaDiProva(cartellaStore);
  }
});

test('CP-REGISTRO-02 — «Compatta ora» che non riassume: si ferma al riassunto e lo dice (`fase`), senza sostituzione', async () => {
  const { giri, avviaSessioneFn } = giriFinti(1);
  const registro = createSessionRegistry({
    avviaSessioneFn, preparaEsecuzioneFn: preparaEsecuzioneFinta, modello: 'z-ai/glm-5.3-flash', chiave: 'k',
    compattaSessioneFn: async () => ({ compattato: false, messaggi: STORIA, usage: null }),
  });
  const { sessionId } = registro.avvia('task-vero');
  giri[0].concludi({ comeFinita: 'concluso', messaggiFinali: STORIA });
  await new Promise((r) => setImmediate(r));
  const eventi = [];
  registro.iscriviti(sessionId, (e) => eventi.push(e));
  assert.deepEqual(await registro.compatta(sessionId), { ok: true, compattato: false, fase: 'riassunto' });
  assert.deepEqual(eventi.filter(ePasso).map((e) => e.value.fase), ['lettura']);
});

test('CP-REGISTRO-03 — in background a fine giro: lettura → riassunto → sostituzione, motivo «background», niente su disco', async (t) => {
  const prima = process.env[VARIABILE_TETTO_TOKEN];
  process.env[VARIABILE_TETTO_TOKEN] = '2000';
  t.after(() => { if (prima === undefined) delete process.env[VARIABILE_TETTO_TOKEN]; else process.env[VARIABILE_TETTO_TOKEN] = prima; });
  const cartellaStore = cartellaTemporanea('talos-compattazione-progresso-');
  try {
    const storia = [{ role: 'system', content: 'You are a coding agent' }, { role: 'user', content: 'Consegna: analizza tutto' }];
    for (let i = 0; i < 6; i += 1) {
      storia.push({ role: 'assistant', content: '', tool_calls: [{ id: `call_${i}`, type: 'function', function: { name: 'leggi', arguments: JSON.stringify({ percorso: `file${i}.txt` }) } }] });
      storia.push({ role: 'tool', tool_call_id: `call_${i}`, content: 'x'.repeat(3_000) });
    }
    storia.push({ role: 'assistant', content: 'Fatto.' });
    const chiamate = [];
    const riassumiPerCompattazioneFn = async (input) => {
      chiamate.push(input);
      input.onProgresso({ fase: 'riassunto', tentativo: input.tentativo, tokenRiassunto: 10, stimato: false });
      return { scelta: { role: 'assistant', content: 'RIASSUNTO DAL MODELLO' }, finishReason: 'stop', usage: { prompt_tokens: 100, completion_tokens: 10 } };
    };
    const { giri, avviaSessioneFn } = giriFinti(1);
    const registro = createSessionRegistry({ cartellaStore, avviaSessioneFn, preparaEsecuzioneFn: preparaEsecuzioneFinta, modello: 'z-ai/glm-5.3-flash', chiave: 'k', riassumiPerCompattazioneFn });
    const { sessionId } = registro.avvia('task-vero');
    const eventi = [];
    registro.iscriviti(sessionId, (e) => eventi.push(e));
    giri[0].concludi({ comeFinita: 'concluso', messaggiFinali: storia, recordDiCompattazione: [] });
    for (let i = 0; i < 400 && !eventi.some((e) => e.type === 'CUSTOM' && e.name === 'talos.compattazione' && e.value.fase === 'fine'); i += 1) {
      await new Promise((r) => setTimeout(r, 10));
    }
    assert.equal(chiamate.length, 1, 'una richiesta di riassunto');
    assert.equal(chiamate[0].tentativo, 1);
    const passi = eventi.filter(ePasso).map((e) => e.value);
    assert.deepEqual(passi.map((p) => p.fase), ['lettura', 'riassunto', 'sostituzione'], JSON.stringify(passi));
    assert.ok(passi.every((p) => p.sessionId === sessionId && p.motivo === 'background'));
    assert.equal(passi[0].messaggi, storia.length);
    await attendiScritture({ cartellaStore, sessionId });
    assert.equal(righeDelJournal(cartellaStore, sessionId).some((r) => r.name === NOME_EVENTO_PROGRESSO_COMPATTAZIONE), false, 'mai su disco');
  } finally {
    await attendiScritture({ cartellaStore });
    rimuoviCartellaDiProva(cartellaStore);
  }
});
