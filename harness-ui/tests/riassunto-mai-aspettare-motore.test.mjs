/*
 * ⭐ Owner 27/10/2026 notte, «Sì, mai aspettare» — contratto C1/C4 con la CLI (`handoff-talos-2026-09-27/CONTRATTO-RIASSUNTO-MAI-
 * ASPETTARE-2026-10-27.md`). Nel file dell'owner (sessione 9eea8edf) il giro aspettava un riassunto del motore del contesto fermo 30
 * minuti sul limite del piano. Ora, quando la richiesta non entra e il riassunto del motore non è pronto:
 *   - la richiesta parte SUBITO col riassunto senza modello (riga con la ragione 'in-arrivo', nessuna riga di guasto);
 *   - il riassunto del motore continua in sottofondo, non annullato, e nessuno ne paga un secondo;
 *   - la richiesta dopo usa quello del modello.
 * Guscio vero + servizio vero + archivio vero + motore vero; il riassuntore del motore resta fermo finché la prova non lo lascia andare,
 * il fornitore della chat è finto. Nessuna rete.
 */
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { talosLavora } from '../src/kernel/talosHarness.desktop-hotfix.mjs';
import { createDesktopContextService } from '../src/context-desktop-service.mjs';
import { createSqliteContextStore } from '../../context-engine/src/node/sqlite-store.mjs';
import { createContextEngine } from '../../context-engine/src/engine.mjs';
import { VARIABILE_TETTO_TOKEN } from '../src/kernel/compattazione-desktop.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

const contatore = { countPreparedContext: async ({ messages, tools, model }) => ({ schema: 'talos.context.tokens.v1', inputTokens: Math.ceil(JSON.stringify({ messages, tools }).length / 4), windowTokens: model.windowTokens, responseReserve: model.responseReserve, method: 'heuristic', exact: false, requestHash: 'a'.repeat(64), provider: model.provider, model: model.model }) };
/* un modello a chiave, NON a posto unico: lì il riassunto in sottofondo può correre accanto alla chat */
const MODELLO = { provider: 'openrouter', model: 'z-ai/glm-5.3-flash', windowTokens: 16_384, responseReserve: 2_048 };
const ATTIVI = (jobs) => (jobs ?? []).filter((j) => !['committed', 'failed', 'cancelled', 'paused'].includes(j.state));

/** La storia di prima: scambi lunghi di testo (le uscite d'attrezzo le toglierebbero le regole del livello 1) che non entrano più nei 16K. */
const storiaLunga = (coppie = 14, parole = 400) => Array.from({ length: coppie }, (_, i) => [
  { role: 'user', content: `Domanda ${i}: ${'parola '.repeat(parole)}` },
  { role: 'assistant', content: `Risposta ${i}: ${'parola '.repeat(parole)}` },
]).flat();

/** Il riassuntore del motore: fermo finché la prova non lo lascia andare; poi una sintesi valida che cita un record vero. */
function riassuntoreTenuto() {
  let lascia;
  const via = new Promise((r) => { lascia = r; });
  const stato = { chiamate: 0 };
  /* ⛔ 28/10/2026 (MOTORE-10, una volta su tre appesa): il motore passa il segnale DENTRO la richiesta (`engine.mjs:255`,
     `model.summarize({ …, signal, operationId })`), non come secondo argomento. Il finto lo cercava nel secondo: un annullo arrivato dopo
     l'inizio del riassunto non lo raggiungeva mai, e la prova restava appesa. E come `fetch`, un segnale già annullato rifiuta subito. */
  const summarize = async (request, opzioni = {}) => {
    const signal = request?.signal ?? opzioni.signal;
    stato.chiamate += 1;
    await new Promise((risolvi, rifiuta) => {
      if (signal?.aborted) { rifiuta(signal.reason ?? new Error('aborted')); return; }
      via.then(risolvi);
      signal?.addEventListener?.('abort', () => rifiuta(signal.reason ?? new Error('aborted')), { once: true });
    });
    /* come il riassuntore di `finestra-che-cresce-motore-del-contesto`: un segmento cita il suo ultimo record, la fusione dei segmenti
       cita una fonte già verificata; ogni scambio della storia contiene «parola parola parola» */
    const ultimo = JSON.parse(request.messages.at(-1).content);
    let fonte;
    try { fonte = JSON.parse(ultimo.untrustedSource); } catch { fonte = null; }
    const recordId = fonte?.verifiedSegments ? fonte.verifiedSegments[0].sources[0].recordId : (ultimo.sourceIds ?? []).at(-1);
    return { text: JSON.stringify({ schema: 'talos.context.summary.v1', text: 'Letti i file del progetto.', goal: 'Analizzare i file', decisions: [], constraints: [], completed: ['letture'], pending: [], resources: [],
      sources: [{ recordId, quote: 'parola parola parola' }] }), finishReason: 'stop', usage: { inputTokens: 50, outputTokens: 30 } };
  };
  return { summarize, lascia: () => lascia(), stato };
}

function scena(t, { singleSlot = false } = {}) {
  const prima = process.env[VARIABILE_TETTO_TOKEN];
  delete process.env[VARIABILE_TETTO_TOKEN];
  t.after(() => { if (prima !== undefined) process.env[VARIABILE_TETTO_TOKEN] = prima; });
  const cartella = mkdtempSync(join(tmpdir(), 'talos-mai-aspettare-'));
  writeFileSync(join(cartella, 'uno.txt'), 'x');
  const store = createSqliteContextStore({ databasePath: ':memory:' });
  const riassuntore = riassuntoreTenuto();
  const motore = createContextEngine({ store, model: { resolveModel: async ({ sessionModel }) => sessionModel, summarize: riassuntore.summarize }, tokenCounter: contatore, clock: () => '2026-10-28T08:00:00.000Z' });
  /* il motore è congelato: per far DURARE un annullo (MOTORE-10) il servizio riceve una copia con l'annullo ritardabile */
  const ritardi = { annullo: 0 };
  const engine = { ...motore, cancelCompaction: async (o) => { if (ritardi.annullo) await new Promise((r) => setTimeout(r, ritardi.annullo)); return motore.cancelCompaction(o); } };
  const service = createDesktopContextService({ store, engine, readSession: (id) => (id === 'chat' ? { sessionId: id, modello: 'openrouter:z-ai/glm-5.3-flash' } : null), isSessionEnabled: (id) => id === 'chat', resolveSessionModel: async () => (singleSlot ? { ...MODELLO, singleSlot: true } : MODELLO), clock: () => '2026-10-28T08:00:00.000Z' });
  t.after(async () => { riassuntore.lascia(); await service.close(); store.close(); await rimuoviCartellaDiProva(cartella); });
  return { cartella, store, engine, service, riassuntore, ritardi };
}

/** Il fornitore della chat: risponde subito; conta le richieste con gli attrezzi (la chat) e quelle senza (un riassunto del guscio). */
function fornitore() {
  const corpi = [];
  const fetchDiRete = async (_url, init) => {
    corpi.push(JSON.parse(init.body));
    return Response.json({ choices: [{ message: { role: 'assistant', content: 'Fatto.' }, finish_reason: 'stop' }], usage: { prompt_tokens: 3_000, completion_tokens: 5 } });
  };
  return { fetchDiRete, corpi, riassuntiDelGuscio: () => corpi.filter((c) => !Array.isArray(c.tools) || c.tools.length === 0).length };
}

async function giro(s, runId, { istantanea = false, modello = 'z-ai/glm-5.3-flash', messaggiIniziali = storiaLunga() } = {}) {
  const f = fornitore();
  const eventi = [];
  const contextHooks = await s.service.createKernelHooks({ sessionId: 'chat', runId });
  const inizio = Date.now();
  let esito = null; let errore = null;
  try {
    esito = await talosLavora({
      cartella: s.cartella, task: { consegna: 'Riassumi cosa hai trovato.' }, modello, chiave: 'fixture', fetchDiRete: f.fetchDiRete,
      contestoDelProgetto: 'PREAMBOLO', comandoProva: 'node -e 0', messaggiIniziali, finestraToken: MODELLO.windowTokens, scartoMisurato: 0,
      contextHooks, ...(istantanea ? { compattazioneIstantanea: true } : {}),
      onGiro: (e) => { if (typeof e?.tipo === 'string' && e.tipo.startsWith('compattazione-') && e.tipo !== 'compattazione-progresso') eventi.push(e); },
    });
  } catch (e) { errore = e; }
  return { esito, errore, eventi, f, durata: Date.now() - inizio };
}

for (const istantanea of [false, true]) {
  test(`MAI-ASPETTARE-MOTORE-01${istantanea ? 'b' : ''} — the engine summary is not ready: the request leaves at once with the quick summary, the engine one goes on${istantanea ? ' (instant compaction on)' : ''}`, async (t) => {
    const s = scena(t);
    const g = await giro(s, 'giro-1', { istantanea });
    assert.equal(g.errore, null, `the turn did not fail: ${g.errore?.code ?? g.errore?.message}`);
    assert.ok(g.durata < 10_000, `the turn did not wait for the summary: ${g.durata} ms`);
    assert.ok(g.f.corpi.length >= 1, 'the chat request left');
    const rapido = g.eventi.find((e) => e.tipo === 'compattazione-fine' && e.compattato === true && e.ripiego === true);
    assert.ok(rapido, `a quick summary without the model was applied: ${JSON.stringify(g.eventi.map((e) => [e.tipo, e.motivo, e.ragione, e.codice]))}`);
    assert.equal(rapido.ragione, 'in-arrivo', 'and its line says the model\'s one is on its way');
    assert.ok(!g.eventi.some((e) => e.motivo === 'ripiego'), 'no technical «fallback» line: nothing broke');
    assert.equal(g.f.riassuntiDelGuscio(), 0, 'the shell did not pay a second summary');
    assert.equal(s.riassuntore.stato.chiamate, 1, 'one model summary, the engine one');
    assert.equal(ATTIVI((await s.store.readContextSnapshot({ sessionId: 'chat' }))?.jobs).length, 1, 'the engine summary is still running, not cancelled');
  });
}

test('MAI-ASPETTARE-MOTORE-02 — the engine summary that arrives during the turn is used by the next request, without the quick one', async (t) => {
  const s = scena(t);
  const corpi = [];
  /* la prima risposta chiede una lettura; prima di darla, il riassunto del motore finisce: la seconda richiesta del giro deve usarlo */
  const fetchDiRete = async (_url, init) => {
    corpi.push(JSON.parse(init.body));
    if (corpi.length === 1) {
      const [lavoro] = ATTIVI((await s.store.readContextSnapshot({ sessionId: 'chat' }))?.jobs);
      assert.ok(lavoro, 'the engine summary is running during the first request');
      s.riassuntore.lascia();
      const finito = await s.engine.waitForCompaction({ sessionId: 'chat', jobId: lavoro.id });
      assert.equal(finito.state, 'committed', JSON.stringify(finito.error ?? null));
      return Response.json({ choices: [{ message: { role: 'assistant', content: null, tool_calls: [{ id: 'l1', type: 'function', function: { name: 'leggi', arguments: JSON.stringify({ percorso: 'uno.txt' }) } }] }, finish_reason: 'tool_calls' }], usage: { prompt_tokens: 3_000, completion_tokens: 5 } });
    }
    return Response.json({ choices: [{ message: { role: 'assistant', content: 'Fatto.' }, finish_reason: 'stop' }], usage: { prompt_tokens: 3_000, completion_tokens: 5 } });
  };
  const eventi = [];
  const contextHooks = await s.service.createKernelHooks({ sessionId: 'chat', runId: 'giro-1' });
  let errore = null;
  try {
    await talosLavora({
      cartella: s.cartella, task: { consegna: 'Riassumi cosa hai trovato.' }, modello: 'z-ai/glm-5.3-flash', chiave: 'fixture', fetchDiRete,
      contestoDelProgetto: 'PREAMBOLO', comandoProva: 'node -e 0', messaggiIniziali: storiaLunga(), finestraToken: MODELLO.windowTokens, scartoMisurato: 0,
      contextHooks, onGiro: (e) => { if (typeof e?.tipo === 'string' && e.tipo.startsWith('compattazione-') && e.tipo !== 'compattazione-progresso') eventi.push(e); },
    });
  } catch (e) { errore = e; }
  assert.equal(errore, null, String(errore?.code ?? errore?.message));
  assert.ok(corpi.length >= 2, 'the turn made a second request');
  assert.ok(!JSON.stringify(corpi[0].messages).includes('talos-context-memory'), 'the first request went with the quick summary');
  assert.ok(JSON.stringify(corpi[1].messages).includes('talos-context-memory'), 'the second request carries the model summary');
  assert.equal(eventi.filter((e) => e.tipo === 'compattazione-fine' && e.ripiego === true).length, 1, 'only the first request needed the quick summary');
});

test('MAI-ASPETTARE-MOTORE-03 — while the engine summary is on its way, later requests of the turn never pay a summary of their own', async (t) => {
  const s = scena(t);
  for (let i = 1; i <= 5; i += 1) writeFileSync(join(s.cartella, `grande${i}.txt`), Array.from({ length: 300 }, (_, r) => `riga ${r} del file ${i}: ${'parola '.repeat(12)}`).join('\n'));
  const corpi = [];
  /* cinque letture lunghe dopo il riassunto rapido: la coda cresce oltre l'avviso, dove la compattazione semplice preparerebbe un riassunto
     in sottofondo; il riassunto del motore resta fermo per tutto il giro */
  const fetchDiRete = async (_url, init) => {
    corpi.push(JSON.parse(init.body));
    const chat = corpi.filter((c) => Array.isArray(c.tools) && c.tools.length > 0).length;
    if (chat <= 5) {
      return Response.json({ choices: [{ message: { role: 'assistant', content: null, tool_calls: [{ id: `l${chat}`, type: 'function', function: { name: 'leggi', arguments: JSON.stringify({ percorso: `grande${chat}.txt` }) } }] }, finish_reason: 'tool_calls' }], usage: { prompt_tokens: Math.ceil(JSON.stringify(corpi.at(-1).messages).length / 4), completion_tokens: 5 } });
    }
    return Response.json({ choices: [{ message: { role: 'assistant', content: 'Fatto.' }, finish_reason: 'stop' }], usage: { prompt_tokens: Math.ceil(JSON.stringify(corpi.at(-1).messages).length / 4), completion_tokens: 5 } });
  };
  const contextHooks = await s.service.createKernelHooks({ sessionId: 'chat', runId: 'giro-1' });
  let errore = null; let esito = null;
  try {
    esito = await talosLavora({
      cartella: s.cartella, task: { consegna: 'Leggi i cinque file grandi.' }, modello: 'z-ai/glm-5.3-flash', chiave: 'fixture', fetchDiRete,
      contestoDelProgetto: 'PREAMBOLO', comandoProva: 'node -e 0', messaggiIniziali: storiaLunga(), finestraToken: MODELLO.windowTokens, scartoMisurato: 0,
      contextHooks, compattazioneIstantanea: true,
    });
  } catch (e) { errore = e; }
  assert.equal(errore, null, String(errore?.code ?? errore?.message));
  /* una preparazione in sottofondo partita nel giro arriva al fornitore dopo la sua fine: si aspetta, così la si conta */
  await esito?.compattazioneInPreparazione;
  assert.ok(corpi.length >= 6, `the turn made its six requests: ${corpi.length}`);
  assert.equal(corpi.filter((c) => !Array.isArray(c.tools) || c.tools.length === 0).length, 0, 'no summary paid by the shell, not even in the background');
  assert.equal(s.riassuntore.stato.chiamate, 1, 'one model summary for the whole turn: the engine one');
});

/*
 * Anche dopo il «contesto pieno» del fornitore (C1): la richiesta mandata senza aspettare e rifiutata si ripreparava chiedendo al motore
 * di ASPETTARE il riassunto in volo (`waitForInFlight`, fino a 10 minuti). Ora la seconda preparazione dice al motore di non aspettare.
 * Il motore qui è simulato solo alla seconda preparazione: risponde come quello vero con un riassunto in volo (`in-turn-no-wait`
 * nel motore lo prova da solo); se gli chiedessero di aspettare, aspetterebbe per sempre.
 */
test('MAI-ASPETTARE-MOTORE-04 — after the provider says «context full», the second preparation does not wait for the summary in flight either', async (t) => {
  const s = scena(t);
  const veri = await s.service.createKernelHooks({ sessionId: 'chat', runId: 'giro-1' });
  const seconde = [];
  let appesa = null;
  t.after(() => appesa?.());
  const contextHooks = { ...veri, prepare: async (payload) => {
    if (payload.waitForInFlight !== true) return { ...(await veri.prepare(payload)), sentWithoutWaiting: true };
    seconde.push(payload.summaryCeilingMs);
    if (payload.summaryCeilingMs === 0) throw Object.assign(new Error('The summary is still being written.'), { code: 'CTX_SUMMARY_NOT_READY' });
    return new Promise((_, rifiuta) => { appesa = () => rifiuta(new Error('liberata a fine prova')); });
  } };
  const corpi = [];
  const fetchDiRete = async (_url, init) => {
    corpi.push(JSON.parse(init.body));
    if (corpi.length === 1) return new Response(JSON.stringify({ error: { code: 400, message: "This endpoint's maximum context length is 16384 tokens. However, you requested about 17000 tokens." } }), { status: 400, headers: { 'content-type': 'application/json' } });
    return Response.json({ choices: [{ message: { role: 'assistant', content: 'Fatto.' }, finish_reason: 'stop' }], usage: { prompt_tokens: 3_000, completion_tokens: 5 } });
  };
  const eventi = [];
  const inizio = Date.now();
  const lavoro = talosLavora({
    cartella: s.cartella, task: { consegna: 'Riassumi cosa hai trovato.' }, modello: 'z-ai/glm-5.3-flash', chiave: 'fixture', fetchDiRete,
    contestoDelProgetto: 'PREAMBOLO', comandoProva: 'node -e 0', finestraToken: MODELLO.windowTokens, scartoMisurato: 0, contextHooks,
    onGiro: (e) => { if (typeof e?.tipo === 'string' && e.tipo.startsWith('compattazione-')) eventi.push(e); },
  }).then(() => null, (e) => e);
  const esito = await Promise.race([lavoro, new Promise((r) => { setTimeout(() => r('appeso'), 8_000); })]);
  assert.notEqual(esito, 'appeso', 'the turn waited for the summary in flight');
  assert.equal(esito, null, String(esito?.code ?? esito?.message));
  assert.ok(Date.now() - inizio < 8_000);
  assert.deepEqual(seconde, [0], 'the second preparation asked the engine not to wait');
  assert.equal(corpi.length, 2, 'and the request was retried');
  assert.ok(!eventi.some((e) => e.motivo === 'ripiego'), 'no technical «fallback» line');
});

/*
 * ⛔ Misura della CLI sul 6f2147c3c (28/10/2026, sonda «zz-no-wait-probe», deepseek-flash a 65.536 col motore del contesto): il giro
 *   aspettava ancora 40 s. La sequenza: il motore dice «non pronto» (il guscio segna che il riassunto del motore arriva), poi a una
 *   richiesta dopo cade con un ALTRO errore (contesto oltre la finestra, senza un lavoro in volo). La compattazione semplice, con la
 *   bandierina ancora accesa, non forzava il riassunto rapido e chiamava il modello dentro il giro. Ganci finti: la sequenza esatta.
 */
test('MAI-ASPETTARE-MOTORE-05 — «not ready», then another engine error: the simple compaction still never waits for a model summary', async (t) => {
  const prima = process.env[VARIABILE_TETTO_TOKEN];
  process.env[VARIABILE_TETTO_TOKEN] = '6000';
  t.after(() => { if (prima === undefined) delete process.env[VARIABILE_TETTO_TOKEN]; else process.env[VARIABILE_TETTO_TOKEN] = prima; });
  const cartella = mkdtempSync(join(tmpdir(), 'talos-mai-aspettare-'));
  t.after(() => rimuoviCartellaDiProva(cartella));
  for (let i = 1; i <= 8; i += 1) writeFileSync(join(cartella, `f${i}.txt`), Array.from({ length: 120 }, (_, r) => `riga ${r} del file ${i}: ${'parola '.repeat(10)}`).join('\n'));
  let lascia;
  const via = new Promise((r) => { lascia = r; });
  t.after(() => lascia());
  const riassunti = []; let lavori = 0;
  const fetchDiRete = async (_u, o) => {
    const c = JSON.parse(o.body);
    if (!c.tools?.length) { riassunti.push(c); await via; return Response.json({ choices: [{ message: { role: 'assistant', content: 'R' }, finish_reason: 'stop' }], usage: { prompt_tokens: 10, completion_tokens: 10 } }); }
    lavori += 1;
    if (lavori <= 8) return Response.json({ choices: [{ message: { role: 'assistant', content: null, tool_calls: [{ id: `l${lavori}`, type: 'function', function: { name: 'leggi', arguments: JSON.stringify({ percorso: `f${lavori}.txt` }) } }] }, finish_reason: 'tool_calls' }], usage: { prompt_tokens: Math.ceil(JSON.stringify(c.messages).length / 4), completion_tokens: 5 } });
    return Response.json({ choices: [{ message: { role: 'assistant', content: 'fatto' }, finish_reason: 'stop' }], usage: { prompt_tokens: 100, completion_tokens: 1 } });
  };
  let preparazioni = 0;
  const contextHooks = { prepare: async () => { preparazioni += 1; throw Object.assign(new Error('engine'), { code: preparazioni === 1 ? 'CTX_SUMMARY_NOT_READY' : 'CTX_CONTEXT_OVERFLOW' }); }, capture: async () => {} };
  const eventi = [];
  const giro = talosLavora({ cartella, modello: 'deepseek:deepseek-flash', chiave: 'k', task: { consegna: 'leggi tutti i file' }, contestoDelProgetto: 'P', fetchDiRete,
    contextHooks, compattazioneIstantanea: true, onGiro: (e) => { if (typeof e?.tipo === 'string' && e.tipo.startsWith('compattazione-')) eventi.push(e); } })
    .then(() => 'ok', (e) => `err ${e?.code ?? e?.message}`);
  const esito = await Promise.race([giro, new Promise((r) => { setTimeout(() => r('APPESO'), 5_000); })]);
  assert.equal(esito, 'ok', `the turn waited for a model summary (${riassunti.length} held)`);
  assert.ok(lavori >= 9, 'all the reads went through');
  const rapidi = eventi.filter((e) => e.tipo === 'compattazione-fine' && e.compattato === true && e.ripiego === true);
  assert.ok(rapidi.length >= 1 && rapidi.every((e) => e.ragione === 'in-arrivo'), JSON.stringify(eventi.map((e) => [e.giro, e.tipo, e.motivo, e.ragione])));
  /* «in arrivo» deve essere vero: dopo l'altro errore il motore non sta scrivendo niente, quindi il riassunto del modello lo avvia la
     compattazione semplice, in sottofondo (prima: la bandierina restava accesa e non partiva nessun riassunto) */
  assert.ok(riassunti.length >= 1, 'the model summary really started, in the background');
});

/*
 * Contratto C5 sulla strada del MOTORE del contesto (di serie per le conversazioni nuove), correlazione concordata con la CLI il 28/10: il
 * «non pronto» dice quale lavoro scrive il riassunto (`details.jobId`), e il record del rapido nato da lì lo porta (`lavoroDelMotore`),
 * anche nel suo evento. Solo la versione pubblicata da QUEL lavoro (`context.version.committed` col suo jobId) migliora la riga del rapido.
 */
test('MAI-ASPETTARE-MOTORE-06 — the quick summary born from «not ready» carries the engine job that writes the model one; the job id reaches the line through the service', async (t) => {
  const s = scena(t);
  const g = await giro(s, 'giro-1');
  assert.equal(g.errore, null, String(g.errore?.code ?? g.errore?.message));
  const rapido = g.eventi.find((e) => e.tipo === 'compattazione-fine' && e.compattato === true && e.ragione === 'in-arrivo');
  assert.ok(rapido?.record, 'the quick summary');
  const [lavoro] = ATTIVI((await s.store.readContextSnapshot({ sessionId: 'chat' }))?.jobs);
  assert.ok(lavoro?.id, 'the engine job is still writing');
  assert.equal(rapido.record.lavoroDelMotore, lavoro.id, 'the quick record names the engine job');
  // il servizio lo passa all'evento della chat (lista a campi ammessi: senza la riga si perdeva)
  const { avviaSessione } = await import('../src/agent-service.mjs');
  const eventi = [];
  await avviaSessione({ cartella: s.cartella, task: { consegna: 'prova' }, modello: 'm', chiave: 'k', onEvento: (e) => { eventi.push(e); },
    talosLavoraFn: async ({ onGiro }) => { onGiro(rapido); return { comeFinita: 'concluso', detto: 'fatto', messaggiFinali: [], recordDiCompattazione: [rapido.record] }; } });
  const fine = eventi.find((e) => e.type === 'CUSTOM' && e.name === 'talos.compattazione' && e.value.fase === 'fine')?.value;
  assert.equal(fine?.lavoroDelMotore, lavoro.id);
});

test('MAI-ASPETTARE-MOTORE-07 (reverse) — a quick summary of the simple compaction alone (no engine job behind it) carries no job', async (t) => {
  const { avviaSessione } = await import('../src/agent-service.mjs');
  const eventi = [];
  const record = { schema: 'talos.compattazione.v1', coveredThrough: 4, riassunto: [], at: '2026-10-28T09:00:00.000Z', tokenPrima: 10, tokenDopo: 5 };
  await avviaSessione({ cartella: '/tmp/x', task: { consegna: 'prova' }, modello: 'm', chiave: 'k', onEvento: (e) => { eventi.push(e); },
    talosLavoraFn: async ({ onGiro }) => {
      onGiro({ giro: 1, tipo: 'compattazione-fine', compattato: true, record, ripiego: true, ragione: 'in-arrivo' });
      onGiro({ giro: 2, tipo: 'compattazione-fine', compattato: true, record: { ...record, at: '2026-10-28T09:01:00.000Z', lavoroDelMotore: 'x'.repeat(300) }, ripiego: true, ragione: 'in-arrivo' });
      return { comeFinita: 'concluso', detto: 'fatto', messaggiFinali: [] };
    } });
  const fini = eventi.filter((e) => e.type === 'CUSTOM' && e.name === 'talos.compattazione' && e.value.fase === 'fine').map((e) => e.value);
  assert.equal('lavoroDelMotore' in fini[0], false, 'no job: no field');
  assert.equal('lavoroDelMotore' in fini[1], false, 'a job id longer than 256 does not pass');
});

/*
 * Owner 28/10/2026, «Rapido subito, il modello dopo» (contratto P4 con la CLI): sul motore a POSTO UNICO il motore del contesto risponde
 * «non pronto» SENZA avviare un lavoro (`details: { jobId: null, aFineGiro: true }`). Il guscio manda la richiesta col rapido, e il record
 * del rapido dice che il riassunto del modello lo avvia il fine giro (`aFineGiro`), senza un lavoro a cui legarsi (`lavoroDelMotore`).
 */
test('MAI-ASPETTARE-MOTORE-08 — single slot: «not ready» with aFineGiro, the quick record says so and names no job; the engine stays free, no summary asked', async (t) => {
  const s = scena(t, { singleSlot: true });
  const g = await giro(s, 'giro-1', { modello: 'local:qwen3-8b.gguf' });
  assert.equal(g.errore, null, String(g.errore?.code ?? g.errore?.message));
  const rapido = g.eventi.find((e) => e.tipo === 'compattazione-fine' && e.compattato === true && e.ragione === 'in-arrivo');
  assert.ok(rapido?.record, `the quick summary: ${JSON.stringify(g.eventi.map((e) => `${e.tipo}/${e.ragione ?? e.motivo ?? ''}`))}`);
  assert.equal(rapido.record.aFineGiro, true, 'the model summary comes from the end of the turn');
  assert.equal('lavoroDelMotore' in rapido.record, false, 'no engine job to wait for');
  assert.deepEqual(ATTIVI((await s.store.readContextSnapshot({ sessionId: 'chat' }))?.jobs), [], 'no job in the only slot');
  assert.equal(s.riassuntore.stato.chiamate, 0, 'no summary asked while the turn has the slot');
});

/*
 * P4 (contratto con la CLI, 28/10/2026): il fine giro avvia il lavoro del motore con `compact` del servizio. `onLavoro(jobId)` gli dice
 * l'id SUBITO, appena nato e prima di aspettarlo (l'aggancio della riga va nel giornale prima del commit); un segnale lo annulla quando
 * un giro prende il posto unico (P3), e la preparazione del giro dopo aspetta che l'annullo sia finito — senza, il motore vedeva il
 * lavoro ancora in volo, lo aspettava, lo trovava annullato, e la chat diceva un guasto che non c'era.
 */
test('MAI-ASPETTARE-MOTORE-09 — compact tells the job id at once (before waiting), then the engine version of that job', async (t) => {
  const s = scena(t, { singleSlot: true });
  await giro(s, 'giro-1', { modello: 'local:qwen3-8b.gguf' });
  const nati = [];
  const fatto = s.service.compact({ sessionId: 'chat', onLavoro: (id) => nati.push(id) });
  for (let i = 0; i < 200 && !nati.length; i += 1) await new Promise((r) => setTimeout(r, 5));
  assert.equal(nati.length, 1, 'the id arrives while the job is still running');
  assert.equal(typeof nati[0], 'string');
  assert.equal(s.riassuntore.stato.chiamate >= 1 || ATTIVI((await s.store.readContextSnapshot({ sessionId: 'chat' }))?.jobs).length === 1, true, 'the job is alive');
  s.riassuntore.lascia();
  const esito = await fatto;
  assert.equal(esito.jobId, nati[0]);
  assert.equal(esito.compattato, true);
});

test('MAI-ASPETTARE-MOTORE-10 — the signal cancels the end-of-turn job; the next turn waits for the cancellation, not for the job: no false fault line, the quick summary again', async (t) => {
  const s = scena(t, { singleSlot: true });
  const g1 = await giro(s, 'giro-1', { modello: 'local:qwen3-8b.gguf' });
  /* il giro dopo continua la STESSA conversazione, come `agent-service.mjs` (storia del giro + messaggio nuovo): con una storia diversa
     l'archivio si ripara da solo e annulla i lavori attivi per conto suo (`annullaLavoriVecchi`), e la prova passerebbe per quella strada */
  const storiaDopo = [...g1.esito.messaggiFinali, { role: 'user', content: 'Continua.' }];
  /* l'annullo DURA (sul disco vero lo fa un esecutore che deve accorgersene): senza l'attesa della preparazione, il giro vedrebbe il
     lavoro ancora vivo e ci legherebbe la riga del rapido — a un lavoro che sta morendo */
  s.ritardi.annullo = 300;
  const ferma = new AbortController();
  const nati = [];
  const fatto = s.service.compact({ sessionId: 'chat', onLavoro: (id) => nati.push(id), segnale: ferma.signal });
  for (let i = 0; i < 200 && !nati.length; i += 1) await new Promise((r) => setTimeout(r, 5));
  ferma.abort('ceduta');
  const g = await giro(s, 'giro-2', { modello: 'local:qwen3-8b.gguf', messaggiIniziali: storiaDopo });
  assert.equal(g.errore, null, String(g.errore?.code ?? g.errore?.message));
  assert.equal(g.eventi.some((e) => e.tipo === 'compattazione-fine' && e.motivo === 'ripiego'), false, `no fault line: ${JSON.stringify(g.eventi.map((e) => `${e.tipo}/${e.motivo ?? e.ragione ?? ''}/${e.codice ?? ''}`))}`);
  const rapido = g.eventi.find((e) => e.tipo === 'compattazione-fine' && e.record?.aFineGiro === true);
  assert.ok(rapido, 'the quick summary, waiting for the end of the turn again');
  assert.equal(rapido.record.lavoroDelMotore ?? null, null, 'and its line is not tied to the job being cancelled');
  const esito = await fatto;
  assert.equal(esito.compattato, false);
  assert.equal(esito.annullato, true, 'it says it was cancelled');
  const lavoro = await s.store.readContextJob({ sessionId: 'chat', jobId: nati[0] });
  assert.equal(lavoro?.state, 'cancelled', JSON.stringify({ lavoro, jobs: (await s.store.readContextSnapshot({ sessionId: 'chat' }))?.jobs?.map((j) => [j.id, j.state]) }));
});
