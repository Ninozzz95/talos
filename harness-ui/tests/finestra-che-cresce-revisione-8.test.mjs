/* Revisione avversaria del blocco 8 (27/10/2026), portata nel repo: A-R8 (lo Stop durante i tentativi dopo la crescita, REV-B8-A4) e le
   misure della crescita scalata (A1-A3, A5). Originale in handoff/revisione-blocco-8-prove-2026-10-27/A-finestra-b8.test.mjs. */
/*
 * Revisione blocco 8 (27/10/2026) — pezzo A, `feat/finestra-che-cresce` 2b81568ff (aiuti copiati dal blocco 7): la crescita decisa dal motore del contesto al suo
 * cancello (`growWindow`). Motore del contesto VERO (createDesktopContextRuntime, SQLite vero), kernel vero, adattatore vero, e chi
 * ospita la crescita VERO (`creaFinestraCheCresce`, con supervisore/motore/intestazione finti). Nessuna porta, nessun fornitore, nessuna
 * chiave. `R4=<cartella harness-ui>` cambia il codice provato (di serie: r4-finestra).
 */
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

const imp = (p) => import(new URL(`../${p}`, import.meta.url).href);
const { rimuoviCartellaDiProva } = await imp('tests/aiuto/rimuovi-cartella-di-prova.mjs');
const { talosLavora } = await imp('src/kernel/talosHarness.desktop-hotfix.mjs');
const { stimaTokenConversazione: stima } = await imp('src/kernel/talosHarness.mjs');
const { creaFetchMultiProvider } = await imp('src/runtime-owner-adapter.mjs');
const { createDesktopContextRuntime, resolveDesktopDefaultProfile } = await imp('src/context-runtime.mjs');
const { createContextTokenCounter, credenzialeDelContatore } = await imp('src/context-token-counters.mjs');
const { VARIABILE_TETTO_TOKEN } = await imp('src/kernel/compattazione-desktop.mjs');
const { creaFinestraCheCresce } = await imp('src/finestra-che-cresce.mjs');

const tmp = (t, p) => { const c = mkdtempSync(join(tmpdir(), p)); t.after(() => rimuoviCartellaDiProva(c)); return c; };
const senzaTetto = (t) => {
  const prima = process.env[VARIABILE_TETTO_TOKEN];
  delete process.env[VARIABILE_TETTO_TOKEN];
  t.after(() => { if (prima !== undefined) process.env[VARIABILE_TETTO_TOKEN] = prima; });
};

/* motore locale finto: conta con lo stimatore del kernel, rifiuta oltre n_ctx come llama-server; il contatore del motore del contesto
   risponde come gli si dice (`contatore`: 'esatto' ⇒ input_tokens; un numero HTTP ⇒ quello stato, cioè la stima dichiarata) */
function motoreLocale(live, { contatore = 'esatto', allargaSulRifiuto = null } = {}) {
  const stato = { chiamate: [] };
  const chiamaLocale = async (_p, opzioni) => {
    const corpo = JSON.parse(opzioni.body);
    const n = Math.ceil(stima(corpo.messages));
    stato.chiamate.push({ n, nCtx: live.nCtx, riassunto: JSON.stringify(corpo.messages).includes('talos.context.summary') || JSON.stringify(corpo.messages).includes('Riassunto breve') });
    if (n > live.nCtx) return new Response(JSON.stringify({ error: { code: 400, message: 'the request exceeds the available context size, try increasing it', type: 'exceed_context_size_error', n_prompt_tokens: n, n_ctx: live.nCtx } }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    return Response.json({ choices: [{ index: 0, message: { role: 'assistant', content: 'fatto' }, finish_reason: 'stop' }], usage: { prompt_tokens: n, completion_tokens: 1 } });
  };
  const dipendenze = { leggiChiave: () => null, leggiRuntime: () => ({}), localePronto: () => true, chiamaLocale,
    allargaFinestraLocale: allargaSulRifiuto ?? (async () => ({ ok: false, motivo: 'memoria' })) };
  const conta = async (_url, init) => {
    if (contatore !== 'esatto') return new Response('busy', { status: contatore });
    return Response.json({ input_tokens: Math.ceil(stima(JSON.parse(init.body).messages)) });
  };
  return { stato, conta, fetchDiRete: creaFetchMultiProvider(fetch, { dipendenze }) };
}

function riassuntore() {
  const conta = { n: 0 };
  const callModel = async (request) => {
    conta.n += 1;
    const ultimo = JSON.parse(request.messages.at(-1).content);
    let fonte; try { fonte = JSON.parse(ultimo.untrustedSource); } catch { fonte = null; }
    const sources = fonte?.verifiedSegments ? [{ recordId: fonte.verifiedSegments[0].sources[0].recordId, quote: 'parola parola parola parola' }]
      : [{ recordId: ultimo.sourceIds[0], quote: 'parola parola parola parola' }];
    return { text: JSON.stringify({ schema: 'talos.context.summary.v1', text: 'Riassunto breve.', goal: 'Continuare', decisions: [], constraints: [], completed: [], pending: [], resources: [], sources }), finishReason: 'stop', usage: { prompt_tokens: 100, completion_tokens: 20 } };
  };
  return { conta, callModel };
}

async function scena(t, live, motore, { leggiRuntime = null } = {}) {
  senzaTetto(t);
  const cartella = mkdtempSync(join(tmpdir(), 'rev-b8-ce-')); // tolta DOPO runtime.close: prima, EPERM e prova appesa
  const r = riassuntore();
  const misure = [];
  const runtime = await createDesktopContextRuntime({
    sessionDirectory: cartella, enabledSessionIds: ['chat'],
    readSession: (id) => (id === 'chat' ? { sessionId: id, modello: 'local:m1', provider: 'local', modelId: 'm1', conclusa: false } : null),
    resolveModelProfile: (selected) => resolveDesktopDefaultProfile({ ...selected, readLocalRuntime: leggiRuntime ?? (async () => ({ state: 'ready', modelId: 'm1', windowTokens: live.nCtx })) }),
    tokenCounter: (() => { const base = createContextTokenCounter({
      resolveProfile: async (model) => credenzialeDelContatore(model.provider, { leggiRuntime: () => ({}), leggiChiave: () => null, baseLocale: 'http://127.0.0.1:1/v1' }),
      fetchFn: motore.conta,
    }); return { countPreparedContext: async (req) => { const r = await base.countPreparedContext(req); misure.push(r.inputTokens); return r; } }; })(),
    callModel: r.callModel,
  });
  t.after(async () => { await runtime.close(); await rimuoviCartellaDiProva(cartella); });
  return { runtime, riassunti: r.conta, misure };
}

/* chi ospita la crescita VERO (`finestra-che-cresce.mjs`), con la scelta della persona scritta nel suo file */
function ospiteVero(t, live, scelta) {
  const cartella = tmp(t, 'rev-b8-fcc-');
  mkdirSync(cartella, { recursive: true });
  writeFileSync(join(cartella, 'finestra-piena.json'), JSON.stringify({ quandoLaFinestraSiRiempie: scelta }));
  const caricamenti = [];
  const host = creaFinestraCheCresce({
    supervisor: { status: () => ({ state: 'ready', modelId: 'm1', windowTokens: live.nCtx }), request: async (p) => (p === '/slots' ? Response.json([{ is_processing: false }]) : new Response('', { status: 404 })) },
    motore: { unload: async () => {}, load: async ({ contextLength }) => { caricamenti.push(contextLength); live.nCtx = contextLength; } },
    modello: async () => ({ modelPath: 'C:/finto/m1.gguf', nome: 'm1' }),
    leggiIntestazione: async () => ({ trainedContext: 131_072, kvCacheBytesPerToken: 1_000 }),
    misuraMacchina: async () => ({ memory: { freeBytes: 64 * 1024 ** 3 } }),
    cartella,
  });
  const chieste = [];
  const finestraLocale = {
    attuale: () => live.nCtx,
    puoCrescere: () => host.puoCrescere('m1'),
    cresci: async ({ servono }) => { const esito = await host.allarga({ modelId: 'm1', servono, proattiva: true }); chieste.push({ servono, esito }); return esito; },
  };
  return { finestraLocale, chieste, caricamenti };
}

async function giro(t, { messaggi, motore, live, contextHooks, finestraLocale }) {
  const cartella = tmp(t, 'rev-b8-giro-');
  writeFileSync(join(cartella, 'uno.txt'), 'x');
  let errore = null; let esito = null; const eventi = [];
  try {
    esito = await talosLavora({ cartella, modello: 'local:m1', chiave: 'finta', task: { consegna: 'x' }, messaggiIniziali: messaggi, scartoMisurato: 0,
      contestoDelProgetto: 'Project files:\n', fetchDiRete: motore.fetchDiRete, permessi: 'Full access', finestraToken: live.nCtx, contextHooks,
      ...(finestraLocale ? { finestraLocale } : {}),
      onGiro: (e) => { if (String(e?.tipo).startsWith('compattazione-') && e.tipo !== 'compattazione-progresso') eventi.push(`${e.tipo}:${e.motivo ?? e.fase ?? ''}${e.codice ? `(${e.codice})` : ''}`); } });
  } catch (e) { errore = e; }
  return { errore, esito, eventi };
}

const storiaTesto = (coppie, lunghezza = 1600) => Array.from({ length: coppie }, (_, i) => [
  { role: 'user', content: `Domanda ${i}: ${'parola '.repeat(Math.floor(lunghezza / 7))}` },
  { role: 'assistant', content: `Risposta ${i}: ${'parola '.repeat(Math.floor(lunghezza / 7))}` },
]).flat();

/* La conversazione la cui misura del motore (stima dichiarata, margine 15%) cade fra il limite del motore (72,5% di 16.384 = 11.878) e il
   75% di chi ospita la crescita (12.288): la si cerca misurando con una sonda che registra «servono» e risponde «Riassumi». */
async function conversazioneNelBuco(t, live) {
  const traccia = [];
  for (let coppie = 6; coppie <= 30; coppie += 1) {
    for (let lunghezza = 1400; lunghezza <= 3000; lunghezza += 40) {
      const messaggi = [...storiaTesto(coppie, lunghezza), { role: 'user', content: 'Continua.' }];
      if (stima(messaggi) < 7_000 || stima(messaggi) > 9_000) continue;
      const motore = motoreLocale(live, { contatore: 503 });
      const { runtime, misure } = await scena(t, live, motore);
      const sonda = []; const fl = { attuale: () => live.nCtx, puoCrescere: async () => true, cresci: async ({ servono }) => { sonda.push(servono); return { ok: false, motivo: 'scelta' }; } };
      await giro(t, { messaggi, motore, live, contextHooks: await runtime.service.createKernelHooks({ sessionId: 'chat', runId: 'sonda' }), finestraLocale: fl });
      traccia.push(`${coppie}x${lunghezza}: stima ${stima(messaggi)} misura ${misure[0] ?? '-'}`);
      if (misure[0] > 11_878 && misure[0] < 12_288) return { messaggi, servono: misure[0] };
    }
  }
  throw new Error(`nessuna conversazione nel buco: la prova va ritarata\n${traccia.join('\n')}`);
}

/* ─────────────────────────── Prove nuove del blocco 8 ─────────────────────────── */

const { validateContextProfile } = await import(new URL('../../context-engine/src/profiles.mjs', import.meta.url).href);
/* il limite del motore del contesto su una finestra, col profilo VERO del motore locale (riserva = finestra/8, `context-runtime.mjs:79`) */
const limiteDelMotore = (finestra, method) => {
  const p = validateContextProfile({ windowTokens: finestra, responseReserve: Math.min(16_384, Math.floor(finestra / 8)), method });
  return finestra - p.responseReserve - p.safetyMarginTokens;
};

test('REV-B8-A1 la finestra scelta con un conteggio STIMATO (misura scalata) contro quella col conteggio ESATTO, e se la richiesta entra dopo', async (t) => {
  const righe = []; const problemi = [];
  for (const finestra of [4_096, 8_192, 12_288, 16_384, 24_576, 32_768, 65_536, 98_304]) {
    for (const [caso, vero] of [['al cancello', null], ['incolla grande (1,3×)', Math.floor(finestra * 1.3)]]) {
      const limStima = limiteDelMotore(finestra, 'heuristic');
      const limEsatto = limiteDelMotore(finestra, 'runtime');
      const reale = vero ?? limStima + 1;
      const scalato = Math.max(reale, Math.ceil(reale * finestra * 0.75 / limStima));
      const conScala = ospiteVero(t, { nCtx: finestra }, 'allarga');
      const eScala = await conScala.finestraLocale.cresci({ servono: scalato });
      const realeEsatto = vero ?? limEsatto + 1;
      const conEsatto = ospiteVero(t, { nCtx: finestra }, 'allarga');
      const eEsatto = await conEsatto.finestraLocale.cresci({ servono: realeEsatto });
      const dopoS = eScala.ok ? eScala.dopo : null;
      const entraS = dopoS ? reale <= limiteDelMotore(dopoS, 'heuristic') : null;
      const entraSEsatto = dopoS ? reale <= limiteDelMotore(dopoS, 'runtime') : null;
      const dopoE = eEsatto.ok ? eEsatto.dopo : null;
      const entraE = dopoE ? realeEsatto <= limiteDelMotore(dopoE, 'heuristic') : null;
      righe.push(`${finestra} ${caso}: stima reale ${reale} scalata ${scalato} ⇒ ${dopoS ?? eScala.motivo} (entra in stima ${entraS}, esatto ${entraSEsatto}) | esatto ${realeEsatto} ⇒ ${dopoE ?? eEsatto.motivo} (entra anche in stima dopo il ricaricamento ${entraE})`);
      if (dopoS && !entraS) problemi.push(`${finestra} ${caso}: cresciuta a ${dopoS} con la stima e la richiesta (${reale}) NON entra nel limite stimato (${limiteDelMotore(dopoS, 'heuristic')})`);
      if (dopoE && !entraE) problemi.push(`${finestra} ${caso}: cresciuta a ${dopoE} col conteggio esatto; dopo il ricaricamento il contatore va in stima (503) e ${realeEsatto} NON entra nel limite stimato ${limiteDelMotore(dopoE, 'heuristic')}`);
      if (dopoS && dopoE && dopoS > dopoE * 1.5) problemi.push(`${finestra} ${caso}: con la stima si apre ${dopoS}, col conteggio esatto ${dopoE}`);
    }
  }
  for (const r of righe) t.diagnostic(r);
  /* L'eccezione dichiarata dal revisore (rapporto del blocco 8, A): una richiesta oltre ciò che il modello regge anche al MASSIMO della
     sua finestra addestrata (127.795 su 131.072, col margine del motore) non entra comunque: lì crescere oltre non si può, e si riassume.
     È di prima della cura e il comportamento è giusto. Ogni altro caso resta un difetto. */
  const oltreIlMassimo = (p) => /cresciuta a 131072 col conteggio esatto/u.test(p);
  assert.deepEqual(problemi.filter((p) => !oltreIlMassimo(p)), []);
});

/* il kernel VERO con un motore del contesto finto che chiama `growWindow` con i numeri che gli si danno */
async function cancelloCon(t, info) {
  const live = { nCtx: 16_384 };
  const motore = motoreLocale(live);
  const chieste = [];
  const contextHooks = { prepare: async ({ messages, growWindow }) => {
    if (typeof growWindow === 'function' && chieste.length === 0) chieste.push({ info, esito: await growWindow(info) });
    return { messages };
  } };
  const finestraLocale = { attuale: () => live.nCtx, puoCrescere: async () => true, cresci: async ({ servono }) => { chieste.push({ servono }); return { ok: false, motivo: 'scelta' }; } };
  const a = await giro(t, { messaggi: [{ role: 'user', content: 'ciao' }], motore, live, contextHooks, finestraLocale });
  return { servono: chieste.find((c) => 'servono' in c)?.servono, errore: a.errore };
}

test('REV-B8-A2 il gancio del cancello con numeri storti dal motore del contesto: «servono» resta un intero ≥ i token veri, e niente lancia', async (t) => {
  const casi = [
    ['inputLimit 0', { inputTokens: 12_000, windowTokens: 16_384, inputLimit: 0 }, 12_000],
    ['inputLimit assente', { inputTokens: 12_000, windowTokens: 16_384 }, 12_000],
    ['inputLimit NaN', { inputTokens: 12_000, windowTokens: 16_384, inputLimit: Number.NaN }, 12_000],
    ['inputLimit negativo', { inputTokens: 12_000, windowTokens: 16_384, inputLimit: -5 }, 12_000],
    ['inputLimit Infinity', { inputTokens: 12_000, windowTokens: 16_384, inputLimit: Number.POSITIVE_INFINITY }, 12_000],
    ['windowTokens assente', { inputTokens: 12_000, inputLimit: 11_878 }, 12_000],
    ['inputTokens assente', { windowTokens: 16_384, inputLimit: 11_878 }, null],
    ['tutto normale', { inputTokens: 12_000, windowTokens: 16_384, inputLimit: 11_878 }, 12_414],
  ];
  const visti = {};
  for (const [nome, info] of casi) visti[nome] = await cancelloCon(t, info);
  t.diagnostic(JSON.stringify(Object.fromEntries(Object.entries(visti).map(([k, v]) => [k, { servono: v.servono, errore: v.errore?.code ?? v.errore?.message ?? null }]))));
  for (const [nome, , atteso] of casi) {
    assert.equal(visti[nome].errore, null, `${nome}: ${visti[nome].errore?.message}`);
    if (atteso !== null) assert.ok(Number.isSafeInteger(visti[nome].servono) && visti[nome].servono >= atteso, `${nome}: servono ${visti[nome].servono}`);
  }
  assert.ok(!Number.isNaN(visti['inputTokens assente'].servono), 'senza inputTokens arriva «servono: NaN» a chi cresce, che lo legge come «cresci di un gradino» (NaN < soglia è falso)');
});

/* la scena del REV-B7-A4, ma il profilo dopo la crescita non torna MAI pronto (un guasto vero, non un attimo) */
async function scenaGuastoVero(t, { stopDopoMs = null } = {}) {
  const live = { nCtx: 16_384 };
  let dopoLaCrescita = false; let quandoCresciuta = 0;
  const motore = motoreLocale(live);
  const { runtime } = await scena(t, live, motore, { leggiRuntime: async () => (dopoLaCrescita ? { state: 'starting' } : { state: 'ready', modelId: 'm1', windowTokens: live.nCtx }) });
  const stop = new AbortController();
  const fl = { attuale: () => live.nCtx, puoCrescere: async () => true, cresci: async () => {
    const p = live.nCtx; live.nCtx = 65_536; dopoLaCrescita = true; quandoCresciuta = Date.now();
    if (stopDopoMs !== null) setTimeout(() => stop.abort(new Error('stop della persona')), stopDopoMs);
    return { ok: true, prima: p, dopo: 65_536, proattiva: true };
  } };
  const grande = [...storiaTesto(30), { role: 'user', content: 'Continua.' }];
  const cartella = tmp(t, 'rev-b8-giro-');
  writeFileSync(join(cartella, 'uno.txt'), 'x');
  const eventi = []; let errore = null;
  const hooks = await runtime.service.createKernelHooks({ sessionId: 'chat', runId: 'g1' });
  try {
    await talosLavora({ cartella, modello: 'local:m1', chiave: 'finta', task: { consegna: 'x' }, messaggiIniziali: grande, scartoMisurato: 0,
      contestoDelProgetto: 'Project files:\n', fetchDiRete: motore.fetchDiRete, permessi: 'Full access', finestraToken: live.nCtx, contextHooks: hooks,
      finestraLocale: fl, segnaleStop: stop.signal,
      onGiro: (e) => { if (String(e?.tipo).startsWith('compattazione-') && e.tipo !== 'compattazione-progresso') eventi.push(`${e.tipo}:${e.motivo ?? e.fase ?? ''}${e.codice ? `(${e.codice})` : ''}`); } });
  } catch (e) { errore = e; }
  return { msDopoLaCrescita: Date.now() - quandoCresciuta, eventi, errore, richieste: motore.stato.chiamate.length };
}

test('REV-B8-A3 (misura) un guasto VERO dopo la crescita: quanto aspetta la richiesta prima del ripiego, e che cosa dice la chat', async (t) => {
  const s = await scenaGuastoVero(t);
  t.diagnostic(`ripiego dopo ${s.msDopoLaCrescita} ms dalla crescita; eventi ${JSON.stringify(s.eventi)}; errore ${s.errore?.code ?? '-'}; richieste partite ${s.richieste}`);
  assert.equal(s.errore, null, s.errore?.message);
  assert.ok(s.msDopoLaCrescita < 4_000, `il ripiego arriva dopo ${s.msDopoLaCrescita} ms`);
});

test('REV-B8-A4 lo Stop durante i tentativi dopo la crescita ferma il giro subito (entro 600 ms), senza la riga del ripiego', async (t) => {
  const s = await scenaGuastoVero(t, { stopDopoMs: 700 });
  const dopoLoStop = s.msDopoLaCrescita - 700;
  t.diagnostic(`fermo ${dopoLoStop} ms dopo lo Stop; errore ${s.errore?.name ?? "-"} ${s.errore?.code ?? ""} ${s.errore?.message ?? ""} STACK ${String(s.errore?.stack).split(String.fromCharCode(10)).slice(0, 8).join(" | ")}; eventi ${JSON.stringify(s.eventi)}; richieste partite ${s.richieste}`);
  assert.notEqual(s.errore, null, 'lo Stop non ha fermato il giro: la richiesta è partita col ripiego');
  assert.ok(dopoLoStop < 600, `fermo dopo ${dopoLoStop} ms`);
  assert.deepEqual(s.eventi.filter((e) => /ripiego/u.test(e)), []);
});

test('REV-B8-A5 (controllo) lo Stop durante la richiesta al modello, senza crescita: con che errore finisce il giro col motore del contesto', async (t) => {
  const live = { nCtx: 65_536 };
  const motore = motoreLocale(live);
  const { runtime } = await scena(t, live, motore);
  const stop = new AbortController();
  const lento = async (url, opzioni) => {
    await new Promise((risolvi, rifiuta) => { const timer = setTimeout(risolvi, 3_000); opzioni?.signal?.addEventListener('abort', () => { clearTimeout(timer); rifiuta(opzioni.signal.reason); }, { once: true }); });
    return motore.fetchDiRete(url, opzioni);
  };
  const cartella = tmp(t, 'rev-b8-giro-');
  writeFileSync(join(cartella, 'uno.txt'), 'x');
  setTimeout(() => stop.abort(new Error('stop della persona')), 500);
  let errore = null;
  try {
    await talosLavora({ cartella, modello: 'local:m1', chiave: 'finta', task: { consegna: 'x' }, messaggiIniziali: [...storiaTesto(4), { role: 'user', content: 'Continua.' }], scartoMisurato: 0,
      contestoDelProgetto: 'Project files:\n', fetchDiRete: lento, permessi: 'Full access', finestraToken: live.nCtx,
      contextHooks: await runtime.service.createKernelHooks({ sessionId: 'chat', runId: 'g1' }), segnaleStop: stop.signal });
  } catch (e) { errore = e; }
  t.diagnostic(`errore ${errore?.name ?? '-'} ${errore?.code ?? ''} ${errore?.message ?? ''}`);
});
