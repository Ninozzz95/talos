/*
 * ⭐ L1 1.3, revisione blocco 5 (26/10/2026 notte) — le cure della finestra che cresce, provate nei due versi.
 *   Le prove REV-B5-* sono quelle del revisore (`handoff/revisione-blocco-5-prove-2026-10-26/A-nuove.test.mjs`), portate qui coi titoli
 *   che dicono il comportamento GIUSTO; A7 (la lista degli attrezzi della CLI) resta là, perché legge il sorgente della CLI.
 *   Le prove FC-B5-* sono mie, per ciò che le sue non coprivano:
 *   - A-3 (rifatta nel blocco 6): col motore del contesto acceso la crescita la chiede il MOTORE al suo cancello, con la sua misura
 *     (`growWindow`); «Chiedimi» ⇒ il motore manda la sua proiezione com'è; «Riassumi» ⇒ il motore riassume come sempre;
 *   - A-4 (owner 26/10 notte, tre consigliate): senza la persona davanti «Chiedimi» vale «Riassumi» — nell'adattatore, nel kernel, in
 *     chi ospita la crescita — e con «Allarga» si riapre il motore solo se nessun'altra conversazione lo sta usando; il registro e il
 *     servizio dell'agente portano il segno fino al kernel e all'adattatore;
 *   - A-6: `stop()` non aspetta, è il prossimo avvio ad aspettare che il motore vecchio sia uscito.
 *   Nessuna porta, nessun fornitore vero, nessuna chiave: motori, supervisori e riassuntori finti.
 */
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { talosLavora } from '../src/kernel/talosHarness.desktop-hotfix.mjs';
import { stimaTokenConversazione as stima } from '../src/kernel/talosHarness.mjs';
import { creaFetchMultiProvider, createOwnerRuntimeAdapter } from '../src/runtime-owner-adapter.mjs';
import { creaFinestraCheCresce, prossimoGradino } from '../src/finestra-che-cresce.mjs';
import { createSessionRegistry } from '../src/session-registry.mjs';
import { attendiScritture } from '../src/session-store.mjs';
import { VARIABILE_TETTO_TOKEN } from '../src/kernel/compattazione-desktop.mjs';
import { TaskCatalogError } from '../src/task-catalog.mjs';
import { createLlamaServerSupervisor } from '../src/llama-server-supervisor.mjs';
import { createLlamaServerRuntime } from '../src/local-runtime-llama-server.mjs';
import { readGgufHeader } from '../src/gguf-header.mjs';
import { avviaSessione } from '../src/agent-service.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';
import { corpoSenzaMarcatori } from './aiuto/corpo-senza-marcatori.mjs'; // 28/10: cache, punto 1

const cartellaTemp = (t, prefisso) => { const c = mkdtempSync(join(tmpdir(), prefisso)); t.after(() => rimuoviCartellaDiProva(c)); return c; };
const senzaTetto = (t) => {
  const prima = process.env[VARIABILE_TETTO_TOKEN];
  delete process.env[VARIABILE_TETTO_TOKEN];
  t.after(() => { if (prima !== undefined) process.env[VARIABILE_TETTO_TOKEN] = prima; });
};

/* ───────── banco del giro (kernel vero + adattatore vero + motore finto che conta come llama-server) ───────── */
const storia = (coppie, lunghezza = 1600) => Array.from({ length: coppie }, (_, i) => [
  { role: 'user', content: `Domanda ${i}: ${'parola '.repeat(lunghezza / 7)}` },
  { role: 'assistant', content: `Risposta ${i}: ${'parola '.repeat(lunghezza / 7)}` },
]).flat();

function motoreFinto({ live, passiAttrezzo = 0, allargaSulRifiuto = null, senzaPersona = false } = {}) {
  const stato = { chiamate: [], riassunti: 0 };
  const chiamaLocale = async (_percorso, opzioni) => {
    const corpo = corpoSenzaMarcatori(opzioni.body);
    const n = Math.ceil(stima(corpo.messages));
    const eRiassunto = !corpo.tools?.length;
    stato.chiamate.push({ n, nCtx: live.nCtx, riassunto: eRiassunto });
    if (n > live.nCtx) {
      return new Response(JSON.stringify({ error: { code: 400, message: 'the request exceeds the available context size, try increasing it', type: 'exceed_context_size_error', n_prompt_tokens: n, n_ctx: live.nCtx } }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }
    if (eRiassunto) {
      stato.riassunti += 1;
      return Response.json({ choices: [{ index: 0, message: { role: 'assistant', content: '## Riassunto\nIn breve: parole.' }, finish_reason: 'stop' }], usage: { prompt_tokens: n, completion_tokens: 10 } });
    }
    const passiFatti = stato.chiamate.filter((c) => !c.riassunto && c.n <= c.nCtx).length;
    if (passiFatti <= passiAttrezzo) {
      return Response.json({ choices: [{ index: 0, message: { role: 'assistant', content: null, tool_calls: [{ id: `c${passiFatti}`, type: 'function', function: { name: 'leggi', arguments: '{"percorso":"grande.txt"}' } }] }, finish_reason: 'tool_calls' }], usage: { prompt_tokens: n, completion_tokens: 5 } });
    }
    return Response.json({ choices: [{ index: 0, message: { role: 'assistant', content: 'fatto' }, finish_reason: 'stop' }], usage: { prompt_tokens: n, completion_tokens: 1 } });
  };
  const dipendenze = {
    leggiChiave: () => null, leggiRuntime: () => ({}), localePronto: () => true, chiamaLocale,
    allargaFinestraLocale: allargaSulRifiuto ?? (async () => ({ ok: false, motivo: 'memoria' })),
  };
  return { stato, fetchDiRete: creaFetchMultiProvider(fetch, { dipendenze, ...(senzaPersona ? { senzaPersona: true } : {}) }) };
}

async function giro(t, { messaggi, motore, finestraToken, finestraLocale = null, contextHooks = null, nessunoDavanti = false, senzaPersona = false, righeFile = 200 }) {
  const cartella = cartellaTemp(t, 'rev-b5-giro-');
  writeFileSync(join(cartella, 'grande.txt'), 'riga del file grande da leggere, abbastanza lunga.\n'.repeat(righeFile));
  const eventi = [];
  let errore = null;
  try {
    await talosLavora({ cartella, modello: 'local:m1', chiave: 'finta', task: { consegna: 'x' }, messaggiIniziali: messaggi, scartoMisurato: 0,
      contestoDelProgetto: 'Project files:\n', fetchDiRete: motore.fetchDiRete, permessi: 'Full access', finestraToken,
      ...(finestraLocale ? { finestraLocale } : {}), ...(contextHooks ? { contextHooks } : {}), ...(nessunoDavanti ? { nessunoDavanti: true } : {}), ...(senzaPersona ? { senzaPersona: true } : {}),
      onGiro: (e) => { if (String(e?.tipo).startsWith('compattazione-') && e.tipo !== 'compattazione-progresso') eventi.push(`${e.tipo}:${e.motivo ?? e.fase ?? ''}`); } });
  } catch (e) { errore = e; }
  return { errore, eventi };
}

/* ───────── banco del registro (come tests/finestra-che-cresce-registro.test.mjs, ma a più giri) ───────── */
function preparaEsecuzioneFinta(taskId) {
  if (taskId !== 'task-vero') throw new TaskCatalogError(`Task non ammesso: ${taskId}`);
  return { cartella: '/tmp/x', comandoProva: 'npm test', task: { id: taskId, consegna: 'c' } };
}
function sessioneAPiuGiri() {
  const giri = [];
  return {
    avviaSessioneFn: async (input) => {
      let risolvi;
      const attesa = new Promise((r) => { risolvi = r; });
      giri.push({ input, risolvi });
      input.onEvento({ type: 'RunStarted', threadId: 't1', runId: `r${giri.length}` });
      return attesa;
    },
    concludi(i, risultato) { giri[i].input.onEvento({ type: 'RunFinished' }); giri[i].risolvi(risultato); },
    get giri() { return giri; },
  };
}
async function attendi(condizione, { tentativi = 400, intervalloMs = 10, messaggio = 'condizione non raggiunta' } = {}) {
  for (let i = 0; i < tentativi; i += 1) { if (await condizione()) return; await new Promise((r) => setTimeout(r, intervalloMs)); }
  throw new Error(messaggio);
}
const storiaConAttrezzi = (n) => {
  const s = [{ role: 'system', content: 'You are a coding agent' }, { role: 'user', content: 'Consegna: analizza tutto' }];
  for (let i = 0; i < n; i += 1) {
    s.push({ role: 'assistant', content: '', tool_calls: [{ id: `call_${i}`, type: 'function', function: { name: 'leggi', arguments: JSON.stringify({ percorso: `file${i}.txt` }) } }] });
    s.push({ role: 'tool', tool_call_id: `call_${i}`, content: `contenuto ${i}: ${'parola '.repeat(430)}` });
  }
  s.push({ role: 'assistant', content: 'Fatto.' });
  return s;
};

/* ═════════════════════════════════════════════ PROVE ═════════════════════════════════════════════ */

test('REV-B5-A1 due crescite alla soglia nello stesso momento ⇒ UN ricaricamento: la seconda rifà i conti sulla finestra nuova e non sale ancora', async (t) => {
  const cartella = cartellaTemp(t, 'rev-b5-a1-');
  const stato = { state: 'ready', modelId: 'm1', windowTokens: 65_536 };
  const caricamenti = [];
  const supervisor = {
    status: () => ({ ...stato }),
    request: async (percorso) => (percorso === '/metrics' ? new Response('', { status: 404 }) : Response.json([{ id: 0, is_processing: false }])),
  };
  const motore = {
    unload: async () => { stato.state = 'stopped'; },
    load: async ({ modelId, contextLength }) => {
      caricamenti.push(contextLength);
      await new Promise((r) => setTimeout(r, 30)); // un ricaricamento vero dura secondi
      Object.assign(stato, { state: 'ready', modelId, windowTokens: contextLength });
    },
  };
  const f = creaFinestraCheCresce({ supervisor, motore, gpuLayers: 99, cartella,
    modello: async (id) => ({ modelPath: `C:/modelli/${id}.gguf`, nome: 'LFM2.5 24B' }),
    leggiIntestazione: async () => ({ trainedContext: 262_144, kvCacheBytesPerToken: 50_000 }),
    misuraMacchina: async () => ({ memory: { freeBytes: 64e9 } }) });
  /* due conversazioni sullo stesso modello passano la soglia del 75% di 64K (49.152) nello stesso giro di orologio:
     il registro a fine giro di una, il kernel nel giro dell'altra (o il giro dopo, partito subito da un messaggio in coda) */
  const [uno, due] = await Promise.all([
    f.allarga({ modelId: 'm1', servono: 50_000, proattiva: true }),
    f.allarga({ modelId: 'm1', servono: 50_000, proattiva: true }),
  ]);
  assert.equal(uno.ok, true, JSON.stringify(uno));
  assert.equal(uno.dopo, 98_304, 'premessa: un gradino, 64K × 1,5');
  /* 50.000 su 98.304 = 51%: sotto la soglia del 75% della finestra nuova ⇒ la seconda non ha niente da fare */
  assert.deepEqual(caricamenti, [98_304], `il motore si è ricaricato ${caricamenti.length} volte (${JSON.stringify(caricamenti)}); seconda: ${JSON.stringify(due)}`);
});

test('REV-B5-A2 (registro vero) dopo una crescita il rifiuto ricordato più piccolo cede alla finestra viva: il giro dopo non ricarica e non riassume', async (t) => {
  senzaTetto(t);
  const cartellaStore = cartellaTemp(t, 'rev-b5-a2-');
  t.after(async () => { await attendiScritture({ cartellaStore }).catch(() => {}); });
  const live = { nCtx: 8_192 };
  const crescite = [];
  const riassuntiFineGiro = [];
  const finta = sessioneAPiuGiri();
  const registro = createSessionRegistry({
    guardaWorkspaceFn: () => () => {}, cartellaStore, avviaSessioneFn: finta.avviaSessioneFn, preparaEsecuzioneFn: preparaEsecuzioneFinta, modello: 'local:m1', chiave: 'k',
    finestraTokenFn: (m) => (String(m).startsWith('local:') ? live.nCtx : null), // il supervisore: la finestra con cui il motore è acceso
    riassumiPerCompattazioneFn: async (input) => { riassuntiFineGiro.push(input); return { scelta: { role: 'assistant', content: 'RIASSUNTO' }, finishReason: 'stop', usage: { prompt_tokens: 100, completion_tokens: 10 } }; },
    finestraLocaleFn: (perRete) => (!String(perRete).startsWith('local:') ? null : {
      puoCrescere: async () => prossimoGradino({ prima: live.nCtx, massimo: 131_072 }) !== null,
      cresci: async ({ servono }) => { const prima = live.nCtx; live.nCtx = prossimoGradino({ prima, massimo: 131_072 }); crescite.push({ servono, prima, dopo: live.nCtx }); return { ok: true, prima, dopo: live.nCtx, massimo: 131_072, proattiva: true }; },
    }),
  });
  const messaggi = storiaConAttrezzi(9);
  const s = stima(messaggi);
  assert.ok(s > 6_144 && s < 8_192, `premessa: la storia (${s}) sta fra il 75% di 8.192 e 8.192`);
  const { sessionId } = registro.avvia('task-vero');
  /* giro 1: il motore aveva rifiutato una richiesta a 8.192 (la persona aveva scelto «Riassumi», o il motore era occupato da un'altra
     conversazione): il kernel lo riporta (`rifiutoDelFornitore`, R11-7) e il registro lo ricorda per questa conversazione */
  finta.concludi(0, { ok: true, esito: { comeFinita: 'concluso', messaggiFinali: messaggi, recordDiCompattazione: [], rifiutoDelFornitore: { finestra: 8_192, scala: 1 } } });
  await attendi(() => registro.statoCompattazione(sessionId)?.inCorso !== true);
  await new Promise((r) => setTimeout(r, 50));
  await attendi(() => registro.statoCompattazione(sessionId)?.inCorso !== true);
  assert.equal(crescite.length, 1, `premessa: a fine giro 1 la finestra cresce una volta (${JSON.stringify(crescite)})`);
  assert.equal(live.nCtx, 12_288);
  /* giro 2: la stessa storia (nessun messaggio nuovo grande). La conversazione sta al 57% della finestra viva di 12.288 */
  registro.resume(sessionId, 'ok');
  await attendi(() => finta.giri.length === 2, { messaggio: 'il giro 2 non parte' });
  const input2 = finta.giri[1].input;
  const vistaDalGiro = input2.finestraLocale?.attuale?.();
  /* il kernel del giro 2, con la finestra viva che il registro gli passa: un motore finto che conta come llama-server, a 12.288 */
  const motore = motoreFinto({ live });
  const r = await giro(t, { messaggi: [...messaggi, { role: 'user', content: 'ok' }], motore, finestraToken: input2.finestraToken, finestraLocale: input2.finestraLocale });
  const cresciteNelGiro = crescite.length - 1;
  finta.concludi(1, { ok: true, esito: { comeFinita: 'concluso', messaggiFinali: messaggi, recordDiCompattazione: [] } });
  await attendi(() => registro.statoCompattazione(sessionId)?.inCorso !== true);
  await new Promise((r2) => setTimeout(r2, 50));
  await attendi(() => registro.statoCompattazione(sessionId)?.inCorso !== true);
  await attendiScritture({ cartellaStore, sessionId });
  const diagnosi = `finestra vista dal giro 2 ${vistaDalGiro} (viva ${live.nCtx}); crescite ${JSON.stringify(crescite)}; riassunti nel giro ${motore.stato.riassunti}; eventi ${JSON.stringify(r.eventi)}`;
  assert.equal(vistaDalGiro, 12_288, `attuale() resta ferma sulla finestra del rifiuto: ${diagnosi}`);
  assert.equal(cresciteNelGiro, 0, `il giro 2 ha ricaricato il motore per una conversazione al 57%: ${diagnosi}`);
  assert.equal(motore.stato.riassunti, 0, `il giro 2 ha riassunto: ${diagnosi}`);
});

test('REV-B5-A3 col motore del contesto ACCESO la finestra locale cresce: il kernel dà al motore il gancio della crescita, e il motore lo chiama al suo cancello', async (t) => {
  const live = { nCtx: 16_384 };
  const messaggi = [...storia(3), { role: 'user', content: 'Continua.' }];
  const crescite = [];
  const finestraLocale = {
    attuale: () => live.nCtx,
    puoCrescere: async () => true,
    cresci: async ({ servono }) => { crescite.push(servono); const prima = live.nCtx; live.nCtx = prossimoGradino({ prima, massimo: 131_072 }); return { ok: true, prima, dopo: live.nCtx, proattiva: true }; },
  };
  const esiti = [];
  /* il motore del contesto finto: la sua richiesta non entra (la misura è SUA), e chiede di crescere come fa quello vero */
  const contextHooks = { prepare: async (p) => { esiti.push(await p.growWindow({ inputTokens: 15_000, windowTokens: 16_384, inputLimit: 13_517 })); return { messages: p.messages }; } };
  const r = await giro(t, { messaggi, motore: motoreFinto({ live }), finestraToken: live.nCtx, finestraLocale, contextHooks });
  assert.equal(r.errore, null, r.errore?.message);
  assert.deepEqual(crescite, [15_000], 'la crescita chiesta con la misura del motore');
  assert.deepEqual(esiti, [{ grown: true }]);
});

test('REV-B5-A4 «Chiedimi» con NESSUNO davanti (automazione): alla soglia si riassume e il giro finisce, mai LOCAL_WINDOW_ASK', async (t) => {
  const messaggi = [...storia(17), { role: 'user', content: 'Continua.' }];
  const s = stima(messaggi);
  assert.ok(s > 12_288 && s < 16_384, `premessa: ${s} fra la soglia e la finestra`);
  const chiedi = async ({ servono }) => ({ ok: false, motivo: 'chiedi', prima: 16_384, dopo: prossimoGradino({ prima: 16_384, massimo: 131_072 }), servono });
  const finestraLocale = { attuale: () => 16_384, puoCrescere: async () => true, cresci: chiedi };
  /* B (com'era su r4 prima di af4c: nessuna finestra viva nel giro) */
  const base = motoreFinto({ live: { nCtx: 16_384 }, passiAttrezzo: 2, allargaSulRifiuto: chiedi });
  const rBase = await giro(t, { messaggi, motore: base, finestraToken: 16_384, nessunoDavanti: true, righeFile: 300 });
  assert.equal(rBase.errore, null, `premessa: senza finestra viva il giro finisce (riassume alla soglia): ${rBase.errore?.code} ${rBase.errore?.message}`);
  /* A (af4c: il registro passa la finestra viva a ogni giro `local:`, anche a chi non ha nessuno davanti) */
  const ora = motoreFinto({ live: { nCtx: 16_384 }, passiAttrezzo: 2, allargaSulRifiuto: chiedi });
  const r = await giro(t, { messaggi, motore: ora, finestraToken: 16_384, finestraLocale, nessunoDavanti: true, righeFile: 300 });
  assert.equal(r.errore, null, `il giro senza nessuno davanti muore: ${r.errore?.code ?? r.errore?.name} — ${String(r.errore?.message).slice(0, 160)}; chiamate ${JSON.stringify(ora.stato.chiamate)}; eventi ${JSON.stringify(r.eventi)}`);
});

/* ───────── supervisore vero, processi e fitter finti (come il blocco 4, A3) ───────── */
function gguf(cartella, { addestrata, esperti } = {}) {
  const parti = [];
  const u32 = (n) => { const b = Buffer.alloc(4); b.writeUInt32LE(n); parti.push(b); };
  const u64 = (n) => { const b = Buffer.alloc(8); b.writeBigUInt64LE(BigInt(n)); parti.push(b); };
  const str = (s) => { const b = Buffer.from(s, 'utf8'); u64(b.length); parti.push(b); };
  const kv = [['general.architecture', 8, 'prova'], ['prova.context_length', 4, addestrata], ['prova.embedding_length', 4, 2048], ['prova.block_count', 4, 24]];
  if (esperti) kv.push(['prova.expert_count', 4, esperti]);
  parti.push(Buffer.from('GGUF', 'ascii')); u32(3); u64(0); u64(kv.length);
  for (const [chiave, tipo, valore] of kv) { str(chiave); u32(tipo); if (tipo === 8) str(valore); else u32(valore); }
  const percorso = join(cartella, 'moe.gguf');
  writeFileSync(percorso, Buffer.concat(parti));
  return percorso;
}
/* il fitter finto: «tutto sulla scheda» mai sopra 16K (un MoE da 15 GB su 16 GB) */
const fitter = async (_exe, args) => {
  if (args.includes('--help')) return 'usage: --offline --spec-type ngram-mod';
  const c = Number(args[args.indexOf('-c') + 1]);
  return c <= 16_384 ? '-ngl 99' : '-ngl 20';
};
function bancoScheda(t, { varianteCpu = false, fallisce } = {}) {
  const cartella = cartellaTemp(t, 'rev-b5-sup-');
  const modelPath = gguf(cartella, { addestrata: 131_072, esperti: 64 });
  const avvii = [];
  let vivo = null;
  const spawnImpl = (_b, a) => {
    const c = new EventEmitter(); c.stdout = new EventEmitter(); c.stderr = new EventEmitter();
    const ctx = Number(a[a.indexOf('-c') + 1]);
    const ngl = a.includes('-ngl') ? a[a.indexOf('-ngl') + 1] : null;
    c.ctx = ctx; avvii.push({ ctx, ngl, offline: a.includes('--offline') });
    c.kill = () => { setTimeout(() => c.emit('close', 0), 1); return true; };
    if (fallisce({ ctx, ngl })) {
      c.condannato = true;
      setTimeout(() => { c.stderr.emit('data', varianteCpu ? 'ggml_backend_cpu_buffer_type_alloc_buffer: failed to allocate buffer\n' : 'ggml_vulkan: ErrorOutOfDeviceMemory\n'); c.emit('close', 1); }, 5);
    }
    vivo = c;
    return c;
  };
  const fetchImpl = async (url) => {
    if (vivo?.condannato) return { status: 503, ok: false };
    if (String(url).endsWith('/props')) return { status: 200, ok: true, json: async () => ({ default_generation_settings: { n_ctx: vivo.ctx } }) };
    if (String(url).endsWith('/slots')) return new Response(JSON.stringify([{ id: 0, is_processing: false }]), { status: 200 });
    if (String(url).endsWith('/metrics')) return new Response('', { status: 404 });
    return { status: 200, ok: true };
  };
  const supervisor = createLlamaServerSupervisor({
    binaryPath: 'C:\\talos\\llama-server.exe', motore: { variante: varianteCpu ? 'cpu' : 'vulkan', dispositivi: [] },
    spawnImpl, fetchImpl, portAllocator: async () => 18100, pollIntervalMs: 1, gpuLayers: varianteCpu ? 0 : 99, sondaBinario: fitter,
  });
  const llama = createLlamaServerRuntime({ supervisor });
  return { cartella, modelPath, avvii, supervisor, llama };
}

test('REV-B5-A5 (controllo, riscrittura legittima di A3/A3b del blocco 4) MoE sulla scheda, nessuna finestra più grande entra nemmeno con --fit ⇒ si torna a 64K con --fit, motore acceso, e quel gradino non si riprova', async (t) => {
  const b = bancoScheda(t, { fallisce: ({ ctx }) => ctx > 65_536 });
  const avvioDiSempre = () => b.llama.load({ modelId: 'm1', modelPath: b.modelPath, finestraDiRiserva: 16_384 }); // server.mjs, con la scheda
  const f = creaFinestraCheCresce({ supervisor: b.supervisor, cartella: b.cartella, gpuLayers: 99,
    motore: { load: (o) => b.llama.load(o), unload: () => b.llama.unload(), riapri: () => avvioDiSempre() },
    modello: async () => ({ modelPath: b.modelPath, nome: 'MoE finto' }), leggiIntestazione: (p) => readGgufHeader(p),
    misuraMacchina: async () => ({ memory: { freeBytes: 64e9 } }) });
  await avvioDiSempre();
  assert.deepEqual({ ctx: b.avvii[0].ctx, ngl: b.avvii[0].ngl }, { ctx: 65_536, ngl: null }, 'premessa: 64K con --fit');
  const esito = await f.allarga({ modelId: 'm1', servono: 50_000, proattiva: true });
  assert.equal(esito.ok, false, JSON.stringify(esito));
  assert.equal(esito.spento, undefined, 'il ritorno è riuscito');
  const stato = b.supervisor.status();
  assert.equal(stato.state, 'ready');
  assert.equal(stato.windowTokens, 65_536);
  assert.deepEqual({ ctx: b.avvii.at(-1).ctx, ngl: b.avvii.at(-1).ngl }, { ctx: 65_536, ngl: null }, `il ritorno è l'avvio di prima: ${JSON.stringify(b.avvii)}`);
  assert.equal(b.avvii[1].ngl, null, 'e anche il tentativo grande lascia decidere --fit (A-2)');
  const n = b.avvii.length;
  assert.equal(await f.puoCrescere('m1'), false, 'il gradino fallito non si propone più');
  const ancora = await f.allarga({ modelId: 'm1', servono: 50_000, proattiva: true });
  assert.equal(ancora.ok, false);
  assert.equal(b.avvii.length, n, 'nessun ricaricamento in più');
});

test('REV-B5-A6 (controllo, riscrittura legittima di A4 del blocco 4) sul processore la finestra ricordata che non entra più in RAM si dimentica (RUNTIME_PROCESS_FAILED)', async (t) => {
  const b = bancoScheda(t, { varianteCpu: true, fallisce: ({ ctx }) => ctx >= 40_000 });
  const f = creaFinestraCheCresce({ supervisor: b.supervisor, cartella: b.cartella, gpuLayers: 0,
    motore: { load: (o) => b.llama.load(o), unload: () => b.llama.unload() },
    modello: async () => ({ modelPath: b.modelPath, nome: 'finto' }), leggiIntestazione: (p) => readGgufHeader(p),
    misuraMacchina: async () => ({ memory: { freeBytes: 64e9 } }) });
  writeFileSync(join(b.cartella, 'finestre-preferite.json'), JSON.stringify({ m1: 49_152 }));
  assert.equal(await f.finestraPreferita('m1'), 49_152, 'premessa: ricordata');
  const esito = await f.conLaPreferita('m1', (preferita) => b.llama.load({ modelId: 'm1', modelPath: b.modelPath, contextLength: preferita }));
  assert.equal(esito.avviato, false);
  assert.equal(esito.errore?.code, 'RUNTIME_PROCESS_FAILED', 'premessa: sul processore il guasto non è RUNTIME_OUT_OF_MEMORY');
  assert.equal(esito.dimenticata, 49_152);
  assert.equal(await f.finestraPreferita('m1'), null, 'dimenticata');
});

test('REV-B5-A8 (A-6) stop() torna subito anche con un processo che non esce: allo spegnimento il flush del registro non aspetta', async (t) => {
  const cartella = cartellaTemp(t, 'rev-b5-a8-');
  const modelPath = gguf(cartella, { addestrata: 32_768 });
  let figlio = null;
  const supervisor = createLlamaServerSupervisor({
    binaryPath: 'C:\\talos\\llama-server.exe', motore: { variante: 'cpu', dispositivi: [] },
    spawnImpl: () => { const c = new EventEmitter(); c.stdout = new EventEmitter(); c.stderr = new EventEmitter(); c.kill = () => true; figlio = c; return c; },
    fetchImpl: async (url) => (String(url).endsWith('/props') ? { status: 200, ok: true, json: async () => ({ default_generation_settings: { n_ctx: 8192 } }) } : { status: 200, ok: true }),
    portAllocator: async () => 18101, pollIntervalMs: 1, gpuLayers: 0, sondaBinario: async () => '',
  });
  await supervisor.start({ modelId: 'm1', modelPath, contextLength: 8_192 });
  const t0 = Date.now();
  const tieni = setInterval(() => {}, 1_000);
  try { await supervisor.stop(); } finally { clearInterval(tieni); }
  const durata = Date.now() - t0;
  figlio.emit('close', 0);
  t.diagnostic(`stop() è tornato dopo ${durata} ms`);
  assert.ok(durata < 1_000, `stop() ha aspettato ${durata} ms: allo spegnimento questa attesa viene prima del flush del registro (server.mjs, closeRuntimeResources poi sessionRegistry.chiudi) e il guscio uccide il server a 5.000 ms (desktop/main.mjs:188)`);
});

/* ═════════════════════════════════════════════ PROVE NUOVE (FC-B5) ═════════════════════════════════════════════ */

/* il motore del contesto finto: chiama il gancio della crescita come quello vero, al suo cancello, con la SUA misura (`inputTokens`) */
const motoreDelContestoCheChiede = (inputTokens) => {
  const esiti = []; const offerto = [];
  return { esiti, offerto, contextHooks: { prepare: async (p) => {
    offerto.push(typeof p.growWindow === 'function');
    if (typeof p.growWindow === 'function' && inputTokens) esiti.push(await p.growWindow({ inputTokens, windowTokens: 16_384, inputLimit: 13_517 }));
    return { messages: p.messages };
  } } };
};
const finestraCheRisponde = (live, esito) => {
  const crescite = [];
  return {
    crescite,
    finestraLocale: {
      attuale: () => live.nCtx,
      puoCrescere: async () => true,
      cresci: async ({ servono }) => {
        crescite.push(servono);
        if (esito) return esito;
        const prima = live.nCtx; live.nCtx = prossimoGradino({ prima, massimo: 131_072 });
        return { ok: true, prima, dopo: live.nCtx, proattiva: true };
      },
    },
  };
};

test('FC-B5-01 (A-3, blocco 6) motore del contesto acceso: la crescita la chiede il motore con la SUA misura; cresciuta, il motore lo sa', async (t) => {
  const live = { nCtx: 16_384 };
  const messaggi = [...storia(3), { role: 'user', content: 'Continua.' }];
  const { crescite, finestraLocale } = finestraCheRisponde(live);
  const m = motoreDelContestoCheChiede(15_000);
  const r = await giro(t, { messaggi, motore: motoreFinto({ live }), finestraToken: 16_384, finestraLocale, contextHooks: m.contextHooks });
  assert.equal(r.errore, null, r.errore?.message);
  assert.deepEqual(crescite, [15_000], 'la misura del motore, non la storia del kernel');
  assert.deepEqual(m.esiti, [{ grown: true }]);
  assert.equal(live.nCtx, 24_576, 'un gradino');
});

test('FC-B5-02 (A-3, blocco 6) motore del contesto acceso e «Chiedimi»: il motore manda la sua proiezione com\'è (la carta, se non entra, la chiede il rifiuto)', async (t) => {
  const live = { nCtx: 16_384 };
  const messaggi = [...storia(3), { role: 'user', content: 'Continua.' }];
  const { finestraLocale } = finestraCheRisponde(live, { ok: false, motivo: 'chiedi', prima: 16_384, dopo: 24_576 });
  const m = motoreDelContestoCheChiede(15_000);
  const motore = motoreFinto({ live });
  const r = await giro(t, { messaggi, motore, finestraToken: 16_384, finestraLocale, contextHooks: m.contextHooks });
  assert.equal(r.errore, null, r.errore?.message);
  assert.deepEqual(m.esiti, [{ sendAsIs: true }]);
  assert.equal(motore.stato.riassunti, 0, 'nessun riassunto senza la persona');
});

test('FC-B5-03 (A-3, blocco 6) AL CONTRARIO: «Riassumi» (o nessun gradino) ⇒ il motore riassume come sempre', async (t) => {
  const live = { nCtx: 16_384 };
  const messaggi = [...storia(3), { role: 'user', content: 'Continua.' }];
  const { finestraLocale } = finestraCheRisponde(live, { ok: false, motivo: 'scelta' });
  const m = motoreDelContestoCheChiede(15_000);
  const r = await giro(t, { messaggi, motore: motoreFinto({ live }), finestraToken: 16_384, finestraLocale, contextHooks: m.contextHooks });
  assert.equal(r.errore, null, r.errore?.message);
  assert.deepEqual(m.esiti, [{ grown: false }]);
});

test('FC-B5-04 (A-3, blocco 6) AL CONTRARIO: senza la finestra viva (la CLI, un modello in cloud) il motore non riceve il gancio; il kernel non misura niente da sé', async (t) => {
  const live = { nCtx: 16_384 };
  const messaggi = [...storia(12), { role: 'user', content: 'Continua.' }];
  const senza = motoreDelContestoCheChiede(15_000);
  const r = await giro(t, { messaggi, motore: motoreFinto({ live }), finestraToken: 16_384, contextHooks: senza.contextHooks });
  assert.equal(r.errore, null, r.errore?.message);
  assert.ok(senza.offerto.length >= 1 && senza.offerto.every((x) => x === false), 'nessun gancio senza la finestra viva');
  /* con la finestra viva e una richiesta che il motore fa entrare, nessuna crescita: decide il motore, non la storia del kernel */
  const { crescite, finestraLocale } = finestraCheRisponde(live);
  const entra = motoreDelContestoCheChiede(0);
  const r2 = await giro(t, { messaggi, motore: motoreFinto({ live }), finestraToken: 16_384, finestraLocale, contextHooks: entra.contextHooks });
  assert.equal(r2.errore, null, r2.errore?.message);
  assert.ok(entra.offerto.every((x) => x === true), 'il gancio c\'è');
  assert.deepEqual(crescite, [], 'nessuna crescita chiesta dal kernel per la sua storia');
});

test('FC-B5-05 (A-4) adattatore: senza la persona davanti, sul rifiuto del motore locale non chiede a chi ospita di riaprire e non chiede alla persona', async (t) => {
  const messaggi = [...storia(17), { role: 'user', content: 'Continua.' }];
  const chiamate = [];
  const chiedi = async ({ servono }) => { chiamate.push(servono); return { ok: false, motivo: 'chiedi', prima: 16_384, dopo: 24_576, servono }; };
  /* il kernel crede la finestra più grande di quella con cui il motore è acceso: il rifiuto arriva all'adattatore */
  const conPersona = motoreFinto({ live: { nCtx: 16_384 }, passiAttrezzo: 2, allargaSulRifiuto: chiedi });
  const rPersona = await giro(t, { messaggi, motore: conPersona, finestraToken: 32_768, righeFile: 300 });
  assert.equal(rPersona.errore?.code, 'LOCAL_WINDOW_ASK', `premessa: con la persona davanti la carta chiede (${rPersona.errore?.code} ${rPersona.errore?.message})`);
  const primaDiSenza = chiamate.length;
  assert.ok(primaDiSenza >= 1, 'premessa: con la persona chi ospita è stato interpellato');
  const senza = motoreFinto({ live: { nCtx: 16_384 }, passiAttrezzo: 2, allargaSulRifiuto: chiedi, senzaPersona: true });
  const r = await giro(t, { messaggi, motore: senza, finestraToken: 32_768, righeFile: 300 });
  assert.equal(chiamate.length, primaDiSenza, 'senza la persona l\'adattatore non chiede di riaprire il motore');
  assert.notEqual(r.errore?.code, 'LOCAL_WINDOW_ASK', `senza la persona nessuna carta: ${r.errore?.code} ${r.errore?.message}`);
});

test('FC-B5-06 (A-4) il kernel col segno «senza persona» (sotto-agente, passo di Workflow): «Chiedimi» alla soglia riassume e il giro finisce', async (t) => {
  const messaggi = [...storia(17), { role: 'user', content: 'Continua.' }];
  const chiedi = async ({ servono }) => ({ ok: false, motivo: 'chiedi', prima: 16_384, dopo: prossimoGradino({ prima: 16_384, massimo: 131_072 }), servono });
  const finestraLocale = { attuale: () => 16_384, puoCrescere: async () => true, cresci: chiedi };
  const motore = motoreFinto({ live: { nCtx: 16_384 }, passiAttrezzo: 2, allargaSulRifiuto: chiedi });
  const r = await giro(t, { messaggi, motore, finestraToken: 16_384, finestraLocale, senzaPersona: true, righeFile: 300 });
  assert.equal(r.errore, null, `${r.errore?.code ?? r.errore?.name} — ${String(r.errore?.message).slice(0, 160)}; chiamate ${JSON.stringify(motore.stato.chiamate)}`);
  assert.ok(motore.stato.riassunti >= 1, 'alla soglia si è riassunto');
  /* AL CONTRARIO: con la persona davanti «Chiedimi» non riassume senza di lei */
  const conPersona = motoreFinto({ live: { nCtx: 16_384 }, passiAttrezzo: 2, allargaSulRifiuto: chiedi });
  const rPersona = await giro(t, { messaggi, motore: conPersona, finestraToken: 16_384, finestraLocale, righeFile: 300 });
  assert.equal(conPersona.stato.riassunti, 0, 'con la persona nessun riassunto fatto senza di lei');
  assert.equal(rPersona.errore?.code, 'LOCAL_WINDOW_ASK', 'con la persona la carta chiede');
});

test('FC-B5-07 (A-4) chi ospita la crescita: senza la persona «Chiedimi» vale «Riassumi»; con la persona resta una domanda; «Allarga» cresce', async (t) => {
  const cartella = cartellaTemp(t, 'fc-b5-07-');
  const stato = { state: 'ready', modelId: 'm1', windowTokens: 65_536 };
  const caricamenti = [];
  const supervisor = {
    status: () => ({ ...stato }),
    request: async (percorso) => (percorso === '/metrics' ? new Response('', { status: 404 }) : Response.json([{ id: 0, is_processing: false }])),
  };
  const motore = {
    unload: async () => { stato.state = 'stopped'; },
    load: async ({ modelId, contextLength }) => { caricamenti.push(contextLength); Object.assign(stato, { state: 'ready', modelId, windowTokens: contextLength }); },
  };
  const f = creaFinestraCheCresce({ supervisor, motore, gpuLayers: 99, cartella,
    modello: async (id) => ({ modelPath: `C:/modelli/${id}.gguf`, nome: 'LFM2.5 24B' }),
    leggiIntestazione: async () => ({ trainedContext: 262_144, kvCacheBytesPerToken: 50_000 }),
    misuraMacchina: async () => ({ memory: { freeBytes: 64e9 } }) });
  await f.salvaScelta('chiedi');
  assert.equal(await f.puoCrescere('m1', { senzaPersona: true }), false, 'senza la persona «Chiedimi» non cresce');
  assert.equal(await f.puoCrescere('m1'), true, 'con la persona c\'è un gradino da offrire');
  const senza = await f.allarga({ modelId: 'm1', servono: 50_000, proattiva: true, senzaPersona: true });
  assert.deepEqual({ ok: senza.ok, motivo: senza.motivo }, { ok: false, motivo: 'scelta' });
  const con = await f.allarga({ modelId: 'm1', servono: 50_000, proattiva: true });
  assert.equal(con.motivo, 'chiedi', JSON.stringify(con));
  assert.deepEqual(caricamenti, [], 'nessuna riapertura');
  await f.salvaScelta('allarga');
  const allarga = await f.allarga({ modelId: 'm1', servono: 50_000, proattiva: true, senzaPersona: true });
  assert.equal(allarga.ok, true, `«Allarga» senza la persona cresce (se il motore è condiviso lo decide il registro): ${JSON.stringify(allarga)}`);
  assert.deepEqual(caricamenti, [98_304]);
});

test('FC-B5-08 (A-4, registro vero) un\'automazione porta «senza persona» fino al giro e a chi ospita; col motore usato da un\'altra conversazione non cresce', async (t) => {
  senzaTetto(t);
  const cartellaStore = cartellaTemp(t, 'fc-b5-08-');
  t.after(async () => { await attendiScritture({ cartellaStore }).catch(() => {}); });
  const chiesto = [];
  const finta = sessioneAPiuGiri();
  const registro = createSessionRegistry({
    guardaWorkspaceFn: () => () => {}, cartellaStore, avviaSessioneFn: finta.avviaSessioneFn, preparaEsecuzioneFn: preparaEsecuzioneFinta, modello: 'local:m1', chiave: 'k',
    finestraTokenFn: (m) => (String(m).startsWith('local:') ? 16_384 : null),
    finestraLocaleFn: (perRete) => (!String(perRete).startsWith('local:') ? null : {
      puoCrescere: async (o) => { chiesto.push({ puoCrescere: o }); return true; },
      cresci: async (o) => { chiesto.push({ cresci: o }); return { ok: true, giaAllargata: true, prima: 16_384, dopo: 16_384 }; },
    }),
  });
  registro.avvia('task-vero');
  await attendi(() => finta.giri.length === 1, { messaggio: 'il giro della persona non parte' });
  registro.avvia('task-vero', { senzaInterfaccia: true });
  await attendi(() => finta.giri.length === 2, { messaggio: 'il giro dell\'automazione non parte' });
  const inPersona = finta.giri[0].input; const inAuto = finta.giri[1].input;
  assert.equal(inPersona.senzaPersona, undefined, 'con la persona davanti: nessun segno');
  assert.equal(inAuto.senzaPersona, true, 'l\'automazione porta il segno al servizio dell\'agente (e da lì all\'adattatore)');
  assert.equal(inAuto.nessunoDavanti, true);
  /* la conversazione della persona sta girando sullo stesso motore locale: l'automazione non lo riapre e non interpella chi ospita */
  assert.equal(await inAuto.finestraLocale.puoCrescere(), false);
  assert.deepEqual(await inAuto.finestraLocale.cresci({ servono: 13_000 }), { ok: false, motivo: 'motore-condiviso' });
  assert.deepEqual(chiesto, [], `chi ospita non è stato interpellato: ${JSON.stringify(chiesto)}`);
  /* la persona invece cresce, e chiede SENZA il segno */
  await inPersona.finestraLocale.cresci({ servono: 13_000 });
  assert.deepEqual(chiesto.at(-1), { cresci: { servono: 13_000, senzaPersona: false } });
  /* finito il giro della persona il motore è libero: l'automazione chiede, col segno */
  finta.concludi(0, { ok: true, esito: { comeFinita: 'concluso', messaggiFinali: [], recordDiCompattazione: [] } });
  await attendi(async () => (await inAuto.finestraLocale.puoCrescere()) === true, { messaggio: 'libero il motore, l\'automazione resta ferma' });
  await inAuto.finestraLocale.cresci({ servono: 13_000 });
  assert.deepEqual(chiesto.at(-1), { cresci: { servono: 13_000, senzaPersona: true } });
  finta.concludi(1, { ok: true, esito: { comeFinita: 'concluso', messaggiFinali: [], recordDiCompattazione: [] } });
});

test('FC-B5-09 (A-4) il servizio dell\'agente porta «senza persona» e «nessuno davanti» al kernel; senza, nessuna chiave in più', async () => {
  const visti = [];
  const finto = async (input) => {
    visti.push({ senzaPersona: input.senzaPersona, nessunoDavanti: input.nessunoDavanti });
    return { comeFinita: 'concluso', detto: 'fatto', messaggiFinali: [], recordDiCompattazione: [] };
  };
  await avviaSessione({ cartella: '/tmp/x', task: { consegna: 'prova' }, modello: 'm', chiave: 'k', onEvento: () => {}, senzaPersona: true, nessunoDavanti: true, talosLavoraFn: finto });
  await avviaSessione({ cartella: '/tmp/x', task: { consegna: 'prova' }, modello: 'm', chiave: 'k', onEvento: () => {}, talosLavoraFn: finto });
  assert.deepEqual(visti, [{ senzaPersona: true, nessunoDavanti: true }, { senzaPersona: undefined, nessunoDavanti: undefined }]);
});

test('FC-B5-10 (A-6) stop() non aspetta: è il prossimo avvio ad aspettare che il motore vecchio sia uscito', async (t) => {
  const cartella = cartellaTemp(t, 'fc-b5-10-');
  const modelPath = gguf(cartella, { addestrata: 32_768 });
  const eventi = [];
  const figli = [];
  const supervisor = createLlamaServerSupervisor({
    binaryPath: 'C:\\talos\\llama-server.exe', motore: { variante: 'cpu', dispositivi: [] },
    spawnImpl: () => {
      const c = new EventEmitter(); c.stdout = new EventEmitter(); c.stderr = new EventEmitter();
      c.n = figli.length + 1; figli.push(c); eventi.push(`spawn#${c.n}`);
      c.kill = () => { eventi.push(`kill#${c.n}`); return true; };
      return c;
    },
    fetchImpl: async (url) => (String(url).endsWith('/props') ? { status: 200, ok: true, json: async () => ({ default_generation_settings: { n_ctx: 8192 } }) } : { status: 200, ok: true }),
    portAllocator: async () => 18102, pollIntervalMs: 1, gpuLayers: 0, sondaBinario: async () => '', attesaChiusuraMs: 2_000,
  });
  await supervisor.start({ modelId: 'm1', modelPath, contextLength: 8_192 });
  const t0 = Date.now();
  await supervisor.stop();
  assert.ok(Date.now() - t0 < 500, `stop() ha aspettato ${Date.now() - t0} ms`);
  setTimeout(() => { eventi.push('close#1'); figli[0].emit('close', 0); }, 60);
  await supervisor.start({ modelId: 'm1', modelPath, contextLength: 8_192 });
  assert.deepEqual(eventi, ['spawn#1', 'kill#1', 'close#1', 'spawn#2'], 'il secondo motore parte solo dopo l\'uscita del primo');
  const fermo = supervisor.stop();
  figli[1].emit('close', 0);
  await fermo;
});

test('FC-B5-11 (A-4) il segno «senza persona» passa dall\'adattatore vero al rifiuto del motore locale: niente riapertura, niente carta', async () => {
  const richiesta = JSON.stringify({ model: 'local:m1', messages: [{ role: 'system', content: 'Sei TALOS.' }, { role: 'user', content: 'Continua.' }], tools: [{ type: 'function', function: { name: 'leggi', description: 'leggi', parameters: { type: 'object', properties: {} } } }] });
  const esegui = async (conSegno) => {
    const allargamenti = [];
    const adapter = createOwnerRuntimeAdapter({ modulePath: 'C:/fixture/runtime.mjs',
      destinazioneModelloDeps: {
        leggiChiave: () => null, leggiRuntime: () => ({}), localePronto: () => true,
        chiamaLocale: async () => new Response(JSON.stringify({ error: { code: 400, message: 'the request exceeds the available context size, try increasing it', type: 'exceed_context_size_error', n_prompt_tokens: 20_000, n_ctx: 16_384 } }), { status: 400, headers: { 'Content-Type': 'application/json' } }),
        allargaFinestraLocale: async (o) => { allargamenti.push(o); return { ok: false, motivo: 'chiedi', prima: 16_384, dopo: 32_768 }; },
      },
      importFn: async () => ({ talosLavora: (input) => input.fetchDiRete('https://openrouter.ai/api/v1/chat/completions', { method: 'POST', body: richiesta }) }) });
    let errore = null;
    try { await adapter.talosLavora({ contextHooks: {}, ...(conSegno ? { senzaPersona: true } : {}), fetchDiRete: async () => { throw new Error('la rete vera non si tocca'); } }); }
    catch (e) { errore = e; }
    return { allargamenti, errore };
  };
  const conPersona = await esegui(false);
  assert.equal(conPersona.allargamenti.length, 1, 'premessa: con la persona davanti l\'adattatore chiede a chi ospita');
  assert.equal(conPersona.errore?.code, 'LOCAL_WINDOW_ASK', `premessa: e la carta chiede (${conPersona.errore?.code} ${conPersona.errore?.message})`);
  const senza = await esegui(true);
  assert.equal(senza.allargamenti.length, 0, 'senza la persona chi ospita non è interpellato');
  assert.notEqual(senza.errore?.code, 'LOCAL_WINDOW_ASK', `senza la persona nessuna carta: ${senza.errore?.code}`);
});
