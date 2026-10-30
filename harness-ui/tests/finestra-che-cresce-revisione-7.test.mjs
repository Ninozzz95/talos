/* Revisione avversaria del blocco 7 (27/10/2026), portata nel repo con le cure: A-R6 (due soglie, `cresciAlCancelloDelMotore` nella scala di
   chi cresce) e A-R7 (profilo riletto con qualche tentativo dopo la crescita, `modelDopoLaCrescita`). Prove originali in
   handoff/revisione-blocco-7-prove-2026-10-27/A-cancello-motore.test.mjs. */
/*
 * Revisione blocco 7 (27/10/2026) — pezzo A, `feat/finestra-che-cresce` 90a524d81: la crescita decisa dal motore del contesto al suo
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
  /* la cartella dell'archivio SQLite si toglie DOPO `runtime.close()`: con la cartella tolta prima, Windows dà EPERM e la prova resta appesa */
  const cartella = mkdtempSync(join(tmpdir(), 'rev-b7-ce-'));
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
  const cartella = tmp(t, 'rev-b7-fcc-');
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
  const cartella = tmp(t, 'rev-b7-giro-');
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

test('REV-B7-A1 «Chiedimi» con il contatore del motore in stima (motore occupato, 503): fra il 72,5% e il 75% il motore del contesto riassume SENZA la persona', async (t) => {
  const live = { nCtx: 16_384 };
  const { messaggi, servono } = await conversazioneNelBuco(t, live);
  t.diagnostic(`misura del motore (stima dichiarata) ${servono} su 16.384: sopra il limite del motore (11.878), sotto il 75% di chi cresce (12.288)`);
  const motore = motoreLocale(live, { contatore: 503 });
  const { runtime, riassunti } = await scena(t, live, motore);
  const o = ospiteVero(t, live, 'chiedi');
  const a = await giro(t, { messaggi, motore, live, contextHooks: await runtime.service.createKernelHooks({ sessionId: 'chat', runId: 'g1' }), finestraLocale: o.finestraLocale });
  t.diagnostic(`crescite chieste ${JSON.stringify(o.chieste.map((c) => ({ servono: c.servono, esito: c.esito })))}; riassunti ${riassunti.n}; errore ${a.errore?.code ?? '-'}; eventi ${JSON.stringify(a.eventi)}`);
  assert.equal(riassunti.n, 0, `«Chiedimi» non riassume mai senza la persona: chi cresce ha risposto ${JSON.stringify(o.chieste[0]?.esito)} (sotto il SUO 75%), il kernel l'ha letto come «niente da fare» e il motore del contesto ha pagato ${riassunti.n} riassunto/i`);
});

test('REV-B7-A2 «Allarga» nello stesso buco: il motore del contesto riassume invece di allargare (nessun ricaricamento chiesto davvero)', async (t) => {
  const live = { nCtx: 16_384 };
  const { messaggi } = await conversazioneNelBuco(t, live);
  const motore = motoreLocale(live, { contatore: 503 });
  const { runtime, riassunti } = await scena(t, live, motore);
  const o = ospiteVero(t, live, 'allarga');
  const a = await giro(t, { messaggi, motore, live, contextHooks: await runtime.service.createKernelHooks({ sessionId: 'chat', runId: 'g1' }), finestraLocale: o.finestraLocale });
  t.diagnostic(`crescite chieste ${JSON.stringify(o.chieste.map((c) => ({ servono: c.servono, esito: c.esito })))}; caricamenti ${JSON.stringify(o.caricamenti)}; riassunti ${riassunti.n}; errore ${a.errore?.code ?? '-'}`);
  assert.ok(riassunti.n === 0 || o.caricamenti.length > 0, `«allarga, poi riassume»: al cancello del motore la finestra non cresce («già allargata» sotto il 75%) e parte il riassunto (${riassunti.n})`);
});

test('REV-B7-A3 (controllo) col conteggio esatto del motore lo stesso cancello non ha il buco: il limite del motore è l\'82,5%, sopra il 75%', async (t) => {
  const live = { nCtx: 16_384 };
  const { messaggi } = await conversazioneNelBuco(t, live);
  const motore = motoreLocale(live, { contatore: 'esatto' });
  const { runtime, riassunti } = await scena(t, live, motore);
  const o = ospiteVero(t, live, 'chiedi');
  const a = await giro(t, { messaggi, motore, live, contextHooks: await runtime.service.createKernelHooks({ sessionId: 'chat', runId: 'g1' }), finestraLocale: o.finestraLocale });
  assert.equal(a.errore, null, a.errore?.message);
  assert.equal(riassunti.n, 0);
  assert.equal(o.chieste.length, 0, 'la richiesta entra nel limite esatto: il cancello non scatta');
});

test('REV-B7-A4 il profilo non si rilegge dopo la crescita (motore che riparte, `CTX_RUNTIME_PROFILE_MISMATCH`): la richiesta non muore, ma esce dal motore con la riga del ripiego', async (t) => {
  const live = { nCtx: 16_384 };
  let dopoLaCrescita = false; let letture = 0;
  const motore = motoreLocale(live);
  const { runtime, riassunti } = await scena(t, live, motore, { leggiRuntime: async () => {
    if (dopoLaCrescita && letture++ === 0) return { state: 'starting' }; // un'altra conversazione ha appena chiesto di riaprire il motore
    return { state: 'ready', modelId: 'm1', windowTokens: live.nCtx };
  } });
  const grande = [...storiaTesto(30), { role: 'user', content: 'Continua.' }];
  const fl = { attuale: () => live.nCtx, puoCrescere: async () => true, cresci: async () => { const p = live.nCtx; live.nCtx = 65_536; dopoLaCrescita = true; return { ok: true, prima: p, dopo: 65_536, proattiva: true }; } };
  const a = await giro(t, { messaggi: grande, motore, live, contextHooks: await runtime.service.createKernelHooks({ sessionId: 'chat', runId: 'g1' }), finestraLocale: fl });
  t.diagnostic(`errore ${a.errore?.code ?? '-'}; eventi ${JSON.stringify(a.eventi)}; richieste ${JSON.stringify(motore.stato.chiamate.map((c) => c.n))}; riassunti ${riassunti.n}`);
  assert.equal(a.errore, null, `la richiesta muore: ${a.errore?.code} ${a.errore?.message}`);
  assert.deepEqual(a.eventi.filter((e) => /ripiego/u.test(e)), [], 'dopo una crescita riuscita la chat dice «il motore del contesto è caduto»: il profilo non letto per un attimo diventa un guasto del motore');
});

test('REV-B7-A5 (misura) «Chiedimi» fra il limite del motore e la finestra vera: la richiesta parte, il motore la ACCETTA con poco spazio per la risposta, nessuna carta', async (t) => {
  const live = { nCtx: 16_384 };
  for (let coppie = 8; coppie <= 20; coppie += 1) {
    for (let l = 1400; l <= 3000; l += 60) {
      const messaggi = [...storiaTesto(coppie, l), { role: 'user', content: 'Continua.' }];
      if (stima(messaggi) < 10_000 || stima(messaggi) > 16_000) continue;
      const motore = motoreLocale(live);
      const { runtime, riassunti } = await scena(t, live, motore);
      const o = ospiteVero(t, live, 'chiedi');
      const a = await giro(t, { messaggi, motore, live, contextHooks: await runtime.service.createKernelHooks({ sessionId: 'chat', runId: 'g1' }), finestraLocale: o.finestraLocale });
      const n = motore.stato.chiamate[0]?.n;
      if (!(n > 13_516 && n < live.nCtx - 200)) continue;
      t.diagnostic(`richiesta partita ${n} su ${live.nCtx}: restano ${live.nCtx - n} token per la risposta (la riserva del motore è 2.048); errore ${a.errore?.code ?? '-'}; riassunti ${riassunti.n}; esito della crescita al cancello ${JSON.stringify(o.chieste.map((c) => c.esito?.motivo ?? c.esito?.ok))}`);
      assert.equal(riassunti.n, 0);
      assert.equal(a.errore, null, 'nessuna carta: il motore ha accettato');
      return;
    }
  }
  assert.fail('nessuna conversazione nella fascia');
});
