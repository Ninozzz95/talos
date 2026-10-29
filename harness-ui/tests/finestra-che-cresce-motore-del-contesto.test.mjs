/*
 * ⭐ L1 1.3, revisione blocco 6 (26/10/2026 notte tarda) — la finestra che cresce col motore del contesto VERO.
 *   Motore del contesto vero (`createDesktopContextRuntime`, archivio SQLite vero, contatore vero `createContextTokenCounter` che parla a un
 *   llama-server finto, profilo vero `resolveDesktopDefaultProfile` con la finestra viva), kernel desktop vero, adattatore vero, motore
 *   locale finto che conta e rifiuta come llama-server. Nessuna porta, nessun fornitore vero, nessuna chiave.
 *   Le REV-B6-* sono del revisore (`handoff/revisione-blocco-6-prove-2026-10-26/A-motore-vero.test.mjs`), coi titoli del comportamento
 *   GIUSTO: la crescita la chiede il motore al suo cancello (`growWindow`), sulla sua proiezione, mai sulla storia grezza del kernel.
 *   Le FC-B6-* sono mie: la crescita che c'è DAVVERO col motore vero («Allarga»), e la carta coi numeri del motore («Chiedimi»).
 */
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

const imp = (p) => import(new URL(`../${p}`, import.meta.url).href);
const { talosLavora } = await imp('src/kernel/talosHarness.desktop-hotfix.mjs');
const { stimaTokenConversazione: stima } = await imp('src/kernel/talosHarness.mjs');
const { creaFetchMultiProvider } = await imp('src/runtime-owner-adapter.mjs');
const { createDesktopContextRuntime, resolveDesktopDefaultProfile } = await imp('src/context-runtime.mjs');
const { createContextTokenCounter, credenzialeDelContatore } = await imp('src/context-token-counters.mjs');
const { VARIABILE_TETTO_TOKEN } = await imp('src/kernel/compattazione-desktop.mjs');
const { rimuoviCartellaDiProva } = await imp('tests/aiuto/rimuovi-cartella-di-prova.mjs');

const cartellaTemp = (t, prefisso) => { const c = mkdtempSync(join(tmpdir(), prefisso)); t.after(() => rimuoviCartellaDiProva(c)); return c; };
const senzaTetto = (t) => {
  const prima = process.env[VARIABILE_TETTO_TOKEN];
  delete process.env[VARIABILE_TETTO_TOKEN];
  t.after(() => { if (prima !== undefined) process.env[VARIABILE_TETTO_TOKEN] = prima; });
};

/* ───────── il motore locale finto: conta come llama-server (con lo stesso stimatore), rifiuta oltre n_ctx, sa contare (/chat/completions/input_tokens) ───────── */
function motoreLocale(live, { allargaSulRifiuto = null } = {}) {
  const stato = { chiamate: [], riassunti: 0 };
  const chiamaLocale = async (_percorso, opzioni) => {
    const corpo = JSON.parse(opzioni.body);
    const n = Math.ceil(stima(corpo.messages));
    const conRimandi = JSON.stringify(corpo.messages).includes('conversation_search with this_conversation');
    stato.chiamate.push({ n, nCtx: live.nCtx, conRimandi });
    if (n > live.nCtx) {
      return new Response(JSON.stringify({ error: { code: 400, message: 'the request exceeds the available context size, try increasing it', type: 'exceed_context_size_error', n_prompt_tokens: n, n_ctx: live.nCtx } }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }
    return Response.json({ choices: [{ index: 0, message: { role: 'assistant', content: 'fatto' }, finish_reason: 'stop' }], usage: { prompt_tokens: n, completion_tokens: 1 } });
  };
  const dipendenze = {
    leggiChiave: () => null, leggiRuntime: () => ({}), localePronto: () => true, chiamaLocale,
    allargaFinestraLocale: allargaSulRifiuto ?? (async () => ({ ok: false, motivo: 'memoria' })),
  };
  /* il contatore del motore del contesto: POST /chat/completions/input_tokens del motore locale (esatto, method 'runtime') */
  const conta = async (_url, init) => {
    const corpo = JSON.parse(init.body);
    return Response.json({ input_tokens: Math.ceil(stima(corpo.messages)) });
  };
  return { stato, conta, fetchDiRete: creaFetchMultiProvider(fetch, { dipendenze }) };
}

/* il riassuntore del motore del contesto: una sintesi valida che cita il primo record del segmento */
function riassuntore() {
  const conta = { n: 0 };
  const callModel = async (request) => {
    conta.n += 1;
    if (process.env.DBG) console.error("RIASS", JSON.stringify(request.messages.map((m) => [m.role, String(m.content).slice(0, 300)])));
    const ultimo = JSON.parse(request.messages.at(-1).content);
    let fonte;
    try { fonte = JSON.parse(ultimo.untrustedSource); } catch { fonte = null; }
    /* ogni record della storia di prova contiene «parola parola parola parola»: la citazione è vera per qualunque record */
    const sources = fonte?.verifiedSegments ? [{ recordId: fonte.verifiedSegments[0].sources[0].recordId, quote: 'parola parola parola parola' }]
      : [{ recordId: ultimo.sourceIds[0], quote: 'parola parola parola parola' }];
    return { text: JSON.stringify({ schema: 'talos.context.summary.v1', text: 'Riassunto breve.', goal: 'Continuare', decisions: [], constraints: [], completed: [], pending: [], resources: [], sources }), finishReason: 'stop', usage: { prompt_tokens: 100, completion_tokens: 20 } };
  };
  return { conta, callModel };
}

async function scena(t, live, motore) {
  senzaTetto(t);
  const cartellaSessioni = mkdtempSync(join(tmpdir(), 'rev-b6-ce-'));
  const r = riassuntore();
  const runtime = await createDesktopContextRuntime({
    sessionDirectory: cartellaSessioni,
    enabledSessionIds: ['chat'],
    readSession: (id) => (id === 'chat' ? { sessionId: id, modello: 'local:m1', provider: 'local', modelId: 'm1', conclusa: false } : null),
    resolveModelProfile: (selected) => resolveDesktopDefaultProfile({ ...selected, readLocalRuntime: async () => ({ state: 'ready', modelId: 'm1', windowTokens: live.nCtx }) }),
    tokenCounter: createContextTokenCounter({
      resolveProfile: async (model) => credenzialeDelContatore(model.provider, { leggiRuntime: () => ({}), leggiChiave: () => null, baseLocale: 'http://127.0.0.1:1/v1' }),
      fetchFn: motore.conta,
    }),
    callModel: r.callModel,
  });
  t.after(async () => { await runtime.close(); await rimuoviCartellaDiProva(cartellaSessioni); }); // prima si chiude l'archivio SQLite, poi la cartella
  return { runtime, riassunti: r.conta };
}

const storiaConAttrezzi = (n, parole = 430) => {
  const s = [{ role: 'user', content: 'Consegna: analizza tutto' }];
  for (let i = 0; i < n; i += 1) {
    s.push({ role: 'assistant', content: '', tool_calls: [{ id: `call_${i}`, type: 'function', function: { name: 'leggi', arguments: JSON.stringify({ percorso: `file${i}.txt` }) } }] });
    s.push({ role: 'tool', tool_call_id: `call_${i}`, content: `contenuto ${i}: ${'parola '.repeat(parole)}` });
  }
  s.push({ role: 'assistant', content: 'Fatto.' });
  return s;
};

const storiaTesto = (coppie, lunghezza = 1600) => Array.from({ length: coppie }, (_, i) => [
  { role: 'user', content: `Domanda ${i}: ${'parola '.repeat(lunghezza / 7)}` },
  { role: 'assistant', content: `Risposta ${i}: ${'parola '.repeat(lunghezza / 7)}` },
]).flat();

async function giro(t, { messaggi, motore, live, contextHooks, finestraLocale }) {
  const cartella = cartellaTemp(t, 'rev-b6-giro-');
  writeFileSync(join(cartella, 'uno.txt'), 'x');
  let errore = null; let esito = null;
  const eventi = [];
  try {
    esito = await talosLavora({ cartella, modello: 'local:m1', chiave: 'finta', task: { consegna: 'x' }, messaggiIniziali: messaggi, scartoMisurato: 0,
      contestoDelProgetto: 'Project files:\n', fetchDiRete: motore.fetchDiRete, permessi: 'Full access', finestraToken: live.nCtx,
      contextHooks, ...(finestraLocale ? { finestraLocale } : {}),
      onGiro: (e) => { if (String(e?.tipo).startsWith('compattazione-') && e.tipo !== 'compattazione-progresso') eventi.push(`${e.tipo}:${e.motivo ?? e.fase ?? ''}${e.codice ? `(${e.codice})` : ''}`); } });
  } catch (e) { errore = e; }
  return { errore, esito, eventi };
}

/* chi ospita la crescita, finto: registra ciò che gli si chiede; `esito` decide la risposta */
const ospite = (live, esitoDi) => {
  const crescite = [];
  return {
    crescite,
    finestraLocale: {
      attuale: () => live.nCtx,
      puoCrescere: async () => true,
      cresci: async ({ servono }) => {
        crescite.push(servono);
        return esitoDi({ servono, live });
      },
    },
  };
};

/* ═════════════════════════════════════════════ PROVE ═════════════════════════════════════════════ */

test('REV-B6-A1 motore del contesto VERO sul motore locale: una conversazione al 59% che il motore non tocca non chiede di crescere', async (t) => {
  const live = { nCtx: 16_384 };
  const motore = motoreLocale(live);
  const { runtime, riassunti } = await scena(t, live, motore);
  /* una conversazione al ~58% della finestra (stima del kernel): sopra la soglia copiata (54,4%), sotto quella vera del motore col
     conteggio esatto del motore locale (margine 5%: 61,9%) */
  let n = 4; let messaggi;
  for (; n < 40; n += 1) { messaggi = [...storiaConAttrezzi(n, 300), { role: 'user', content: 'Continua.' }]; if (stima(messaggi) > 16_384 * 0.565) break; }
  const s = stima(messaggi);
  assert.ok(s < 16_384 * 0.61, `premessa: fra le due soglie (${s})`);
  t.diagnostic(`stima ${s} su 16.384 (${(s / 16_384 * 100).toFixed(1)}%)`);
  /* 1) crescita rifiutata («Riassumi»): che cosa fa il motore del contesto vero con questa conversazione? */
  const rifiuta = ospite(live, () => ({ ok: false, motivo: 'scelta' }));
  const a = await giro(t, { messaggi, motore, live, contextHooks: await runtime.service.createKernelHooks({ sessionId: 'chat', runId: 'g1' }), finestraLocale: rifiuta.finestraLocale });
  assert.equal(a.errore, null, a.errore?.message);
  const primaRichiesta = motore.stato.chiamate[0];
  t.diagnostic(`senza crescita: crescite chieste ${rifiuta.crescite.length}, riassunti del motore ${riassunti.n}, rimandi nel corpo ${primaRichiesta.conRimandi}, richiesta ${primaRichiesta.n}`);
  /* il fatto: il motore del contesto non riassume e non mette rimandi — la crescita è chiesta dove il motore non farebbe niente */
  assert.equal(riassunti.n, 0, 'il motore del contesto non riassume a questa altezza (posto unico, la richiesta entra)');
  assert.equal(primaRichiesta.conRimandi, false, 'e non toglie le uscite vecchie (livello 1): col conteggio esatto la sua soglia è più in alto');
  /* quindi con «Allarga» qui si ricarica il motore per niente: la crescita va chiesta alla soglia VERA del motore */
  assert.equal(rifiuta.crescite.length, 0, `la crescita si chiede a ${Math.round(16_384 * 0.544)} token (soglia copiata col margine dell'euristica 15%), mentre il motore del contesto del motore locale conta esatto (margine 5%) e non agirebbe prima di ~${Math.round(16_384 * 0.619)}: un ricaricamento del motore dove non serviva niente`);
});

test('REV-B6-A2 «Chiedimi» dopo un riassunto del motore del contesto: parte il riassunto già pagato, mai la storia grezza, e nessuna carta', async (t) => {
  const live = { nCtx: 16_384 };
  const motore = motoreLocale(live, { allargaSulRifiuto: async ({ servono }) => ({ ok: false, motivo: 'chiedi', prima: live.nCtx, dopo: 65_536, servono }) });
  const { runtime, riassunti } = await scena(t, live, motore);
  /* giro 1: «Riassumi» (o una crescita non riuscita: memoria, motore occupato, lento): la storia non entra, il motore del contesto riassume */
  const grande = [...storiaTesto(48), { role: 'user', content: 'Continua.' }];
  t.diagnostic(`storia grezza ${stima(grande)} su 16.384`);
  const r1 = ospite(live, () => ({ ok: false, motivo: 'scelta' }));
  const a = await giro(t, { messaggi: grande, motore, live, contextHooks: await runtime.service.createKernelHooks({ sessionId: 'chat', runId: 'g1' }), finestraLocale: r1.finestraLocale });
  assert.equal(a.errore, null, `premessa (giro 1): ${a.errore?.code} ${a.errore?.message}`);
  assert.ok(riassunti.n >= 1, 'premessa: il motore del contesto ha riassunto nel giro 1');
  const inviata1 = motore.stato.chiamate.at(-1).n;
  t.diagnostic(`giro 1: riassunti ${riassunti.n}, ultima richiesta ${inviata1}`);
  /* giro 2: la persona sceglie «Chiedimi» (Impostazioni → Modelli locali). La storia è la stessa più un messaggio. */
  const prima = motore.stato.chiamate.length;
  const r2 = ospite(live, ({ live: l }) => ({ ok: false, motivo: 'chiedi', prima: l.nCtx, dopo: 65_536 }));
  const b = await giro(t, { messaggi: [...a.esito.messaggiFinali, { role: 'user', content: 'Ancora una cosa.' }], motore, live, contextHooks: await runtime.service.createKernelHooks({ sessionId: 'chat', runId: 'g2' }), finestraLocale: r2.finestraLocale });
  const giro2 = motore.stato.chiamate.slice(prima);
  t.diagnostic(`giro 2: richieste ${JSON.stringify(giro2.map((c) => c.n))}, errore ${b.errore?.code ?? '-'} ${b.errore?.message ?? ''} eventi ${JSON.stringify(b.eventi)}`);
  assert.notEqual(b.errore?.code, 'LOCAL_WINDOW_ASK', `il giro 2 muore in carta: la richiesta è partita con ${giro2[0]?.n} token (la storia grezza) invece del riassunto del motore (~${inviata1})`);
  assert.ok(giro2.every((c) => c.n <= live.nCtx), `il motore del contesto aveva già una versione che entra: nessuna richiesta oltre la finestra (${JSON.stringify(giro2.map((c) => c.n))})`);
});

test('REV-B6-A3 «Allarga» dopo un riassunto del motore del contesto: il motore locale non si ricarica per una storia che il motore del contesto non manda più', async (t) => {
  const live = { nCtx: 16_384 };
  const motore = motoreLocale(live);
  const { runtime, riassunti } = await scena(t, live, motore);
  const grande = [...storiaTesto(48), { role: 'user', content: 'Continua.' }];
  /* giro 1: la crescita non riesce (memoria del momento, motore occupato, velocità): il motore del contesto riassume */
  const r1 = ospite(live, () => ({ ok: false, motivo: 'memoria' }));
  const a = await giro(t, { messaggi: grande, motore, live, contextHooks: await runtime.service.createKernelHooks({ sessionId: 'chat', runId: 'g1' }), finestraLocale: r1.finestraLocale });
  assert.equal(a.errore, null, `premessa (giro 1): ${a.errore?.code} ${a.errore?.message}`);
  assert.ok(riassunti.n >= 1, 'premessa: il motore del contesto ha riassunto');
  const prima = motore.stato.chiamate.length;
  /* giro 2: ora la crescita riuscirebbe (la memoria si è liberata). Che cosa chiede il kernel? */
  const r2 = ospite(live, ({ servono, live: l }) => { const p = l.nCtx; l.nCtx = 65_536; return { ok: true, prima: p, dopo: l.nCtx, proattiva: true, servono }; });
  const b = await giro(t, { messaggi: [...a.esito.messaggiFinali, { role: 'user', content: 'Ancora una cosa.' }], motore, live, contextHooks: await runtime.service.createKernelHooks({ sessionId: 'chat', runId: 'g2' }), finestraLocale: r2.finestraLocale });
  assert.equal(b.errore, null, b.errore?.message);
  const giro2 = motore.stato.chiamate.slice(prima);
  t.diagnostic(`giro 2: crescite chieste ${JSON.stringify(r2.crescite)}, richieste ${JSON.stringify(giro2.map((c) => c.n))}, eventi ${JSON.stringify(b.eventi)}, giro1 eventi ${JSON.stringify(a.eventi)}`);
  assert.deepEqual(r2.crescite, [], `il kernel chiede di crescere con «servono» = ${r2.crescite[0]} (la storia grezza, riassunta dal motore), mentre la richiesta che parte è di ${giro2[0]?.n} token: motore ricaricato per niente`);
});

test('REV-B6-A4 (controllo) «Chiedimi» col motore del contesto acceso: la richiesta che salta il motore resta nel suo archivio, e dopo la crescita il motore riprende senza divergenze né ripieghi', async (t) => {
  const live = { nCtx: 16_384 };
  const motore = motoreLocale(live);
  const { runtime, riassunti } = await scena(t, live, motore);
  let n = 4; let messaggi;
  for (; n < 40; n += 1) { messaggi = [...storiaConAttrezzi(n, 300), { role: 'user', content: 'Continua.' }]; if (stima(messaggi) > 16_384 * 0.6) break; }
  const r1 = ospite(live, ({ live: l }) => ({ ok: false, motivo: 'chiedi', prima: l.nCtx, dopo: 24_576 }));
  const a = await giro(t, { messaggi, motore, live, contextHooks: await runtime.service.createKernelHooks({ sessionId: 'chat', runId: 'g1' }), finestraLocale: r1.finestraLocale });
  assert.equal(a.errore, null, a.errore?.message);
  const archivio1 = (await runtime.store.readOriginals({ sessionId: 'chat' })).length;
  /* la persona sceglie «Allarga» dalla carta: la finestra è 32K; il giro dopo passa dal motore */
  live.nCtx = 32_768;
  const r2 = ospite(live, () => ({ ok: false, motivo: 'gia-al-massimo' }));
  const b = await giro(t, { messaggi: [...a.esito.messaggiFinali, { role: 'user', content: 'Ancora.' }], motore, live, contextHooks: await runtime.service.createKernelHooks({ sessionId: 'chat', runId: 'g2' }), finestraLocale: r2.finestraLocale });
  const archivio2 = (await runtime.store.readOriginals({ sessionId: 'chat' })).length;
  t.diagnostic(`archivio dopo il giro 1: ${archivio1} (messaggi finali ${a.esito.messaggiFinali.length}); dopo il giro 2: ${archivio2}; eventi giro 2 ${JSON.stringify(b.eventi)}; riassunti ${riassunti.n}`);
  assert.equal(b.errore, null, b.errore?.message);
  assert.ok(archivio1 >= a.esito.messaggiFinali.length - 1, 'l\'archivio ha ricevuto la richiesta che ha saltato il motore');
  assert.deepEqual(b.eventi.filter((e) => /ripiego|riallineato/u.test(e)), [], 'nessuna divergenza, nessun ripiego');
});

/* ═════════════════════════════════════════════ PROVE NUOVE (FC-B6) ═════════════════════════════════════════════ */

test('FC-B6-01 «Allarga» col motore del contesto VERO: la richiesta non entra, il motore chiede di crescere sulla SUA misura, la finestra cresce e nessun riassunto', async (t) => {
  const live = { nCtx: 16_384 };
  const motore = motoreLocale(live);
  const { runtime, riassunti } = await scena(t, live, motore);
  const grande = [...storiaTesto(30), { role: 'user', content: 'Continua.' }];
  assert.ok(stima(grande) > 16_384 && stima(grande) < 49_152, `premessa: non entra in 16K, entra in 64K (${stima(grande)})`);
  const cresce = ospite(live, ({ live: l }) => { const p = l.nCtx; l.nCtx = 65_536; return { ok: true, prima: p, dopo: l.nCtx, proattiva: true }; });
  const a = await giro(t, { messaggi: grande, motore, live, contextHooks: await runtime.service.createKernelHooks({ sessionId: 'chat', runId: 'g1' }), finestraLocale: cresce.finestraLocale });
  assert.equal(a.errore, null, `${a.errore?.code} ${a.errore?.message}`);
  assert.equal(cresce.crescite.length, 1, `una crescita: ${JSON.stringify(cresce.crescite)}`);
  assert.ok(cresce.crescite[0] > 16_384 * 0.8, `«servono» è la misura del motore della richiesta che non entra (${cresce.crescite[0]})`);
  assert.equal(riassunti.n, 0, 'nessun riassunto: si è allargato prima');
  assert.ok(motore.stato.chiamate.every((c) => c.n <= c.nCtx), `nessuna richiesta oltre la finestra: ${JSON.stringify(motore.stato.chiamate)}`);
});

test('FC-B6-02 «Chiedimi» col motore del contesto VERO: niente riassunto senza la persona; la proiezione del motore parte e la carta porta i SUOI numeri', async (t) => {
  const live = { nCtx: 16_384 };
  const carte = [];
  const motore = motoreLocale(live, { allargaSulRifiuto: async ({ servono }) => { carte.push(servono); return { ok: false, motivo: 'chiedi', prima: live.nCtx, dopo: 65_536, servono }; } });
  const { runtime, riassunti } = await scena(t, live, motore);
  const grande = [...storiaTesto(30), { role: 'user', content: 'Continua.' }];
  const chiedi = ospite(live, ({ live: l }) => ({ ok: false, motivo: 'chiedi', prima: l.nCtx, dopo: 65_536 }));
  const a = await giro(t, { messaggi: grande, motore, live, contextHooks: await runtime.service.createKernelHooks({ sessionId: 'chat', runId: 'g1' }), finestraLocale: chiedi.finestraLocale });
  assert.equal(riassunti.n, 0, 'nessun riassunto senza la persona');
  assert.equal(a.errore?.code, 'LOCAL_WINDOW_ASK', `la carta: ${a.errore?.code} ${a.errore?.message}`);
  const inviata = motore.stato.chiamate.at(-1).n;
  assert.ok(inviata > live.nCtx, 'premessa: la richiesta partita non entrava');
  assert.match(String(a.errore?.message), new RegExp(`\\(${inviata} tokens\\)`, 'u'), 'la carta dice la richiesta VERA, quella del motore');
});

test('FC-B6-03 (A-R5) il riassunto del motore del contesto è una chiamata di servizio: sul rifiuto del motore locale non lo riapre e non chiede una carta', async () => {
  const { createOwnerRuntimeAdapter } = await imp('src/runtime-owner-adapter.mjs');
  const allargamenti = [];
  const adapter = createOwnerRuntimeAdapter({ modulePath: 'C:/fixture/runtime.mjs', importFn: async () => ({ talosLavora: async () => ({}) }),
    destinazioneModelloDeps: {
      leggiChiave: () => null, leggiRuntime: () => ({}), localePronto: () => true,
      chiamaLocale: async () => new Response(JSON.stringify({ error: { code: 400, message: 'the request exceeds the available context size, try increasing it', type: 'exceed_context_size_error', n_prompt_tokens: 20_000, n_ctx: 16_384 } }), { status: 400, headers: { 'Content-Type': 'application/json' } }),
      allargaFinestraLocale: async (o) => { allargamenti.push(o); return { ok: false, motivo: 'chiedi', prima: 16_384, dopo: 32_768 }; },
    } });
  let errore = null;
  try { await adapter.callContextModel({ provider: 'local', model: 'm1', messages: [{ role: 'user', content: 'riassumi' }], maxOutputTokens: 100 }); }
  catch (e) { errore = e; }
  assert.ok(errore, 'premessa: il motore ha rifiutato');
  assert.equal(allargamenti.length, 0, 'chi ospita non è interpellato');
  assert.notEqual(errore.code, 'LOCAL_WINDOW_ASK', `nessuna carta dentro un riassunto: ${errore.code}`);
});

test('FC-B6-04 (A-R5) il trasporto dei riassunti del registro e del giudice porta lo stesso segno (cavo in server.mjs)', async () => {
  const { readFileSync } = await import('node:fs');
  const sorgente = readFileSync(new URL('../server.mjs', import.meta.url), 'utf8');
  assert.match(sorgente, /fetchModelloFn: \(\) => creaFetchMultiProvider\(fetch, \{ dipendenze: destinazioneModelloDeps, senzaPersona: true \}\)/u);
});
