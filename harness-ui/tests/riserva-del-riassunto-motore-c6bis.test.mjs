/*
 * C6-bis, la strada del MOTORE del contesto (owner 28/10/2026; OK di CLI e Mobile 30/10): la catena dentro `summarize` dell'adattatore,
 * con le porte facoltative, e la riga del motore che passa la conversazione.
 *   CLI: la riserva passa dalla STESSA porta `callModel`; l'avviso solo per «inutilizzabile»; senza porte tutto come prima.
 *   Mobile: la riserva una volta, nello stesso segnale (nessuna attesa in più); una riserva con la finestra più piccola si salta in silenzio;
 *   la conversazione instrada e basta: non entra mai nella richiesta al modello.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp } from 'node:fs/promises';
import { rimuoviCartellaDiProvaAttesa } from './aiuto/rimuovi-cartella-di-prova.mjs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { createContextModelAdapter, origineDelRiassuntoScelto } from '../src/context-provider-adapter.mjs';
import { createContextEngine } from '../../context-engine/src/engine.mjs';
import { createSqliteContextStore } from '../../context-engine/src/node/sqlite-store.mjs';
import { parseContextSettings } from '../../context-engine/src/contracts.mjs';

const SCELTO = { provider: 'openrouter', model: 'z-ai/glm-4.7-flash', windowTokens: 128_000, responseReserve: 4_096 };
const RISERVA = { provider: 'openrouter', model: 'qwen/qwen3.7-flash', windowTokens: 200_000, responseReserve: 4_096 };
const conStato = (stato) => Object.assign(new Error(`HTTP ${stato}`), { stato });
const reteGiu = () => Object.assign(new TypeError('fetch failed'), { cause: { code: 'ENOTFOUND' } });
const ok = (testo = 'RIASSUNTO') => ({ text: testo, finishReason: 'stop', usage: { inputTokens: 1, outputTokens: 1 } });

function adattatore({ risponde, riserva = RISERVA, memoria = new Map(), conPorte = true, origine = 'persona', usagePolicy = null } = {}) {
  const chiamate = [], avvisi = [], scritti = [];
  const callModel = async (request) => { chiamate.push(request); const r = risponde(request.model, request); if (r instanceof Error) throw r; return r && typeof r === 'object' ? structuredClone(r) : r; };
  const a = createContextModelAdapter({
    resolveModel: async ({ selected }) => ({ ...selected, windowTokens: SCELTO.windowTokens, responseReserve: SCELTO.responseReserve }),
    callModel,
    ...(usagePolicy ? { usagePolicy } : {}),
    ...(origine === 'persona' ? { sceltaDellaPersona: () => ({ provider: SCELTO.provider, model: SCELTO.model }) } : {}),
    ...(conPorte ? {
      memoriaRiassunto: ({ sessionId }) => (sessionId === 'chat' ? memoria : null),
      riservaDelRiassunto: async () => riserva,
      onModelloInutilizzabile: (v) => avvisi.push(v),
      onRiassuntoScritto: (v) => scritti.push(v),
    } : {}),
  });
  return { a, chiamate, avvisi, scritti, memoria };
}
const riassumi = async (x, extra = {}) => {
  await x.a.resolveModel({ sessionModel: { provider: 'openrouter', model: 'z-ai/glm-5.3-flash' }, settings: {} }); // la precedenza dice chi ha scelto
  return x.a.summarize({ model: SCELTO, messages: [{ role: 'user', content: 'riassumi' }], maxOutputTokens: 1_000, operationId: 'op', sessionId: 'chat', ...extra });
};

test('C6BIS-MOTORE-01 — lo scelto risponde 403: avviso una volta, la riserva scrive passando dalla STESSA porta, e lo dice', async () => {
  const x = adattatore({ risponde: (m) => (m === SCELTO.model ? conStato(403) : ok()) });
  const r = await riassumi(x);
  assert.equal(r.text, 'RIASSUNTO');
  assert.deepEqual(x.chiamate.map((c) => c.model), [SCELTO.model, RISERVA.model], 'la riserva passa da callModel, una volta');
  assert.equal(x.chiamate[1].provider, RISERVA.provider);
  assert.equal(x.avvisi.length, 1);
  assert.deepEqual({ modello: x.avvisi[0].modello, motivo: x.avvisi[0].motivo, scelto: x.avvisi[0].scelto, ruolo: x.avvisi[0].ruolo, sessionId: x.avvisi[0].sessionId },
    { modello: SCELTO.model, motivo: 'accesso-negato', scelto: 'persona', ruolo: 'scelto', sessionId: 'chat' });
  assert.deepEqual(x.scritti, [{ sessionId: 'chat', modello: RISERVA.model, dallaRiserva: true }]);
  /* FE-053: chi ha scritto viaggia con la risposta, e il salvataggio lo pubblica (`context.version.committed`) */
  assert.deepEqual(r.provenienza, { riassuntoDi: RISERVA.model, dallaRiserva: true, nonDisponibile: { modello: SCELTO.model, stato: 'inutilizzabile', motivo: 'accesso-negato' } });
  /* la volta dopo, con la stessa memoria: lo scelto non si chiama, l'avviso non si ripete */
  x.chiamate.length = 0;
  await riassumi(x);
  assert.deepEqual(x.chiamate.map((c) => c.model), [RISERVA.model]);
  assert.equal(x.avvisi.length, 1);
});

test('C6BIS-MOTORE-02 (Mobile) — senza rete: la riserva, NESSUN avviso, niente memoria; il segnale è lo stesso (nessuna attesa nuova)', async () => {
  const x = adattatore({ risponde: (m) => (m === SCELTO.model ? reteGiu() : ok()) });
  const segnale = new AbortController().signal;
  await riassumi(x, { signal: segnale });
  assert.deepEqual(x.chiamate.map((c) => c.model), [SCELTO.model, RISERVA.model]);
  assert.equal(x.chiamate[0].signal, segnale);
  assert.equal(x.chiamate[1].signal, segnale, 'la riserva vive nello stesso tempo dello scelto');
  assert.equal(x.avvisi.length, 0);
  assert.equal(x.memoria.has(SCELTO.model), false);
});

test('C6BIS-MOTORE-03 (Mobile) — una riserva con la finestra più piccola si salta in silenzio: l’errore di prima, nessun avviso per lei', async () => {
  const piccola = { ...RISERVA, windowTokens: 32_000 };
  const x = adattatore({ risponde: (m) => (m === SCELTO.model ? reteGiu() : ok()), riserva: piccola });
  await assert.rejects(riassumi(x), (e) => e instanceof TypeError && /fetch failed/u.test(e.message));
  assert.deepEqual(x.chiamate.map((c) => c.model), [SCELTO.model], 'la riserva non si chiama');
  assert.equal(x.avvisi.length, 0);
});

test('C6BIS-MOTORE-04 (verso contrario) — senza porte l’adattatore fa quello di prima: l’errore dello scelto, nient’altro', async () => {
  const x = adattatore({ risponde: (m) => (m === SCELTO.model ? conStato(403) : ok()), conPorte: false });
  await assert.rejects(riassumi(x), (e) => e.stato === 403);
  assert.deepEqual(x.chiamate.map((c) => c.model), [SCELTO.model]);
  const bene = adattatore({ risponde: () => ok('BENE'), conPorte: false });
  assert.equal((await riassumi(bene)).text, 'BENE');
});

test('C6BIS-MOTORE-05 — lo scelto noto come fermo e nessuna riserva: niente chiamata pagata, un errore che dice perché', async () => {
  const memoria = new Map([[SCELTO.model, { stato: 'inutilizzabile', motivo: 'non-trovato', scadeAlle: Date.now() + 60_000 }]]);
  const x = adattatore({ risponde: () => ok(), riserva: null, memoria });
  await assert.rejects(riassumi(x), { code: 'CTX_SUMMARY_MODEL_UNAVAILABLE', stato: 'inutilizzabile', motivo: 'non-trovato' });
  assert.equal(x.chiamate.length, 0);
});

test('C6BIS-MOTORE-06 (Mobile) — la conversazione instrada e basta: non entra nella richiesta al modello', async () => {
  const x = adattatore({ risponde: (m) => (m === SCELTO.model ? conStato(403) : ok()) });
  await riassumi(x, { sessionId: 'chat' });
  for (const c of x.chiamate) {
    assert.equal(Object.hasOwn(c, 'sessionId'), false);
    assert.equal(JSON.stringify(c.messages).includes('chat'), false);
  }
});

test('C6BIS-MOTORE-07 — chi ha scelto: la persona, l’ospite, o nessuno (il modello della conversazione); l’ospite col 404 avvisa come «ospite»', async () => {
  const s = { provider: 'openrouter', model: 'conv' };
  assert.equal(origineDelRiassuntoScelto({ settings: {}, sessionModel: s }), null);
  assert.equal(origineDelRiassuntoScelto({ settings: {}, sceltaDellaPersona: { provider: 'openrouter', model: 'x' }, sessionModel: s }), 'persona');
  assert.equal(origineDelRiassuntoScelto({ settings: { model: { mode: 'explicit', provider: 'openrouter', model: 'leggero' } }, sessionModel: s }), 'ospite');
  assert.equal(origineDelRiassuntoScelto({ settings: { model: { mode: 'explicit', origine: 'persona', provider: 'openrouter', model: 'y' } }, sessionModel: s }), 'persona');
  const conversazione = adattatore({ risponde: () => conStato(404), riserva: null, origine: null });
  await assert.rejects(conversazione.a.summarize({ model: { provider: 'openrouter', model: 'z-ai/glm-5.3-flash', windowTokens: 128_000 }, messages: [{ role: 'user', content: 'x' }], maxOutputTokens: 100, operationId: 'op', sessionId: 'chat' }), (e) => e.stato === 404);
  assert.equal(conversazione.avvisi.length, 0, 'il modello della conversazione come riassuntore non ha una scelta da cambiare');
});

test('C6BIS-MOTORE-08 — il motore passa la conversazione a summarize (riga di engine.mjs, OK di CLI e Mobile)', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'c6bis-motore-'));
  const store = createSqliteContextStore({ databasePath: join(dir, 'context.sqlite') });
  t.after(async () => { await store.close(); await rimuoviCartellaDiProvaAttesa(dir); });
  const visti = [];
  const conta = (messages) => Math.ceil(JSON.stringify({ messages, tools: [] }).length / 4);
  const sha = (v) => createHash('sha256').update(JSON.stringify(v)).digest('hex');
  const model = { resolveModel: async ({ sessionModel }) => sessionModel, summarize: async (request) => { visti.push(request.sessionId); throw Object.assign(new Error('basta così'), { code: 'CTX_USAGE_DENIED' }); } };
  const tokenCounter = { async countPreparedContext({ messages, tools, model: m }) { return { schema: 'talos.context.tokens.v1', inputTokens: conta(messages), windowTokens: m.windowTokens, responseReserve: m.responseReserve, method: 'heuristic', exact: false, requestHash: sha({ messages, tools }), provider: m.provider, model: m.model }; } };
  const now = '2026-10-30T00:00:00.000Z';
  const engine = createContextEngine({ store, model, tokenCounter, clock: () => now, clearedToolPointer: 'x' });
  await store.initSession({ sessionId: 'chat', settings: parseContextSettings({}) });
  let n = 0;
  for (let i = 0; i < 6; i += 1) { // 31/10: sei scambi, abbastanza da guadagnare il 30% (contratto «niente da compattare»)
    for (const message of [{ role: 'user', content: `Domanda ${i} ${'parola '.repeat(400)}` }, { role: 'assistant', content: `Risposta ${i} ${'parola '.repeat(400)}` }]) {
      n += 1; await engine.appendOriginal({ sessionId: 'chat', record: { id: `r${n}`, message, createdAt: now } });
    }
  }
  const lavoro = await engine.startCompaction({ sessionId: 'chat', sessionModel: { provider: 'local', model: 'fixture', windowTokens: 64_000, responseReserve: 2_048, local: true }, idempotencyKey: 'k' });
  await engine.waitForCompaction({ sessionId: 'chat', jobId: lavoro.id });
  assert.ok(visti.length >= 1, 'il motore ha chiesto un riassunto');
  assert.ok(visti.every((s) => s === 'chat'), JSON.stringify(visti));
});

/* ---------------------------------------------------------------------------------------------------- il runtime del desktop */
const { createDesktopContextRuntime } = await import('../src/context-runtime.mjs');
async function runtimeDiProva(t, extra) {
  const directory = await mkdtemp(join(tmpdir(), 'c6bis-runtime-'));
  const runtime = await createDesktopContextRuntime({ sessionDirectory: directory, enabledSessionIds: ['chat'],
    readSession: (id) => (id === 'chat' ? { sessionId: id, modello: 'local:fixture', conclusa: true } : null),
    resolveModelProfile: async (selected) => ({ ...selected, windowTokens: selected.model === 'qwen/qwen3.7-flash' ? 200_000 : 16_384, responseReserve: 2_048 }),
    tokenCounter: { countPreparedContext: async ({ messages, model }) => ({ schema: 'talos.context.tokens.v1', inputTokens: Math.ceil(JSON.stringify(messages).length / 4), windowTokens: model.windowTokens, responseReserve: model.responseReserve, method: 'heuristic', exact: false, requestHash: createHash('sha256').update(JSON.stringify(messages)).digest('hex'), provider: model.provider, model: model.model }) },
    ...extra });
  t.after(async () => { await runtime.close(); await rimuoviCartellaDiProvaAttesa(directory); });
  return runtime;
}
const storiaLunga = Array.from({ length: 6 }, (_, i) => [{ role: 'user', content: `richiesta ${i} ` + 'dati '.repeat(300) }, { role: 'assistant', content: `risposta ${i} ` + 'testo '.repeat(300) }]).flat();

test('C6BIS-RUNTIME-01 — dalle Impostazioni al motore: lo scelto 403, la riserva risolta col suo profilo; memoria e avviso della conversazione', async (t) => {
  const chiamati = [], avvisi = [];
  const memoria = new Map();
  const runtime = await runtimeDiProva(t, {
    callModel: async (r) => { chiamati.push(`${r.provider}:${r.model}`); if (r.model === 'z-ai/glm-5.3-air') throw conStato(403); return { text: 'non un riassunto', finishReason: 'stop', usage: { inputTokens: 5, outputTokens: 2 } }; },
    modelloDelRiassuntoFn: () => 'openrouter:z-ai/glm-5.3-air',
    riservaDelRiassuntoFn: () => ({ provider: 'openrouter', model: 'qwen/qwen3.7-flash' }),
    memoriaRiassuntoFn: (sessionId) => (sessionId === 'chat' ? memoria : null),
    onModelloInutilizzabile: (v) => avvisi.push(v),
  });
  await runtime.service.compact({ sessionId: 'chat', messages: storiaLunga }).catch(() => null);
  assert.deepEqual(chiamati.slice(0, 2), ['openrouter:z-ai/glm-5.3-air', 'openrouter:qwen/qwen3.7-flash'], JSON.stringify(chiamati));
  assert.equal(memoria.get('z-ai/glm-5.3-air')?.stato, 'inutilizzabile', 'la memoria della conversazione, la stessa della strada legacy');
  assert.equal(avvisi.length, 1);
  assert.deepEqual({ sessionId: avvisi[0].sessionId, modello: avvisi[0].modello, scelto: avvisi[0].scelto }, { sessionId: 'chat', modello: 'z-ai/glm-5.3-air', scelto: 'persona' });
});

test('C6BIS-RUNTIME-02 (Mobile b) — una riserva locale DIVERSA dal modello della conversazione non si usa (mai scaricare la chat)', async (t) => {
  const chiamati = [];
  const runtime = await runtimeDiProva(t, {
    callModel: async (r) => { chiamati.push(`${r.provider}:${r.model}`); if (r.model === 'z-ai/glm-5.3-air') throw reteGiu(); return { text: 'x', finishReason: 'stop', usage: { inputTokens: 1, outputTokens: 1 } }; },
    modelloDelRiassuntoFn: () => 'openrouter:z-ai/glm-5.3-air',
    riservaDelRiassuntoFn: () => ({ provider: 'local', model: 'un-altro-locale' }),
    memoriaRiassuntoFn: () => new Map(),
  });
  await runtime.service.compact({ sessionId: 'chat', messages: storiaLunga }).catch(() => null);
  assert.ok(chiamati.length >= 1);
  assert.equal(chiamati.some((c) => c === 'local:un-altro-locale'), false, JSON.stringify(chiamati));
});

test('C6BIS-REGISTRO-01 — una sola memoria per conversazione sulle due strade, e l’avviso del motore è lo stesso CUSTOM durevole', async () => {
  const { createSessionRegistry } = await import('../src/session-registry.mjs');
  const { TaskCatalogError } = await import('../src/task-catalog.mjs');
  const ingressi = [];
  const registro = createSessionRegistry({ guardaWorkspaceFn: () => () => {},
    avviaSessioneFn: async (input) => { ingressi.push(input); input.onEvento({ type: 'RunStarted', threadId: 't', runId: 'r1' }); return new Promise(() => {}); },
    preparaEsecuzioneFn: (taskId) => { if (taskId !== 'task-vero') throw new TaskCatalogError('no'); return { cartella: process.cwd(), comandoProva: null, task: { id: taskId, consegna: 'c' } }; },
    modello: 'z-ai/glm-5.3-flash', chiave: 'k', riassuntoDiFineGiro: false, finestraTokenFn: () => 1_000_000 });
  const { sessionId } = registro.avvia('task-vero');
  for (let i = 0; i < 200 && ingressi.length < 1; i += 1) await new Promise((r) => { setTimeout(r, 10); });
  assert.equal(registro.memoriaRiassuntoDi(sessionId), ingressi[0].statoModelliRiassunto, 'il motore e il giro legacy leggono la stessa memoria');
  assert.equal(registro.memoriaRiassuntoDi('non-esiste'), null);
  const visti = [];
  const smetti = registro.iscriviti(sessionId, (e) => visti.push(e));
  await registro.pubblicaModelloRiassuntoInutilizzabile({ sessionId, at: '2026-10-30T12:00:00.000Z', modello: 'z-ai/glm-5.3-air', motivo: 'accesso-negato', scelto: 'persona', ruolo: 'scelto' });
  const avviso = visti.find((e) => e?.name === 'talos.riassunto-modello-inutilizzabile');
  assert.ok(avviso, 'l’avviso è fra gli eventi della conversazione');
  assert.deepEqual({ schema: avviso.value.schema, modello: avviso.value.modello, motivo: avviso.value.motivo, scelto: avviso.value.scelto },
    { schema: 'talos.riassunto-modello-inutilizzabile.v1', modello: 'z-ai/glm-5.3-air', motivo: 'accesso-negato', scelto: 'persona' });
  assert.equal(await registro.pubblicaModelloRiassuntoInutilizzabile({ sessionId: 'non-esiste', at: 'x', modello: 'm', motivo: 'non-trovato', scelto: 'persona' }), null);
  smetti();
  registro.ferma?.(sessionId);
});

/* ---------------------------------------------------------------------------------------------------- le sei correzioni del 30/10 */
test('C6BIS-FIX-CLI1 — il tetto d’uscita della riserva è il SUO (dopo R-31 lo scelto può chiederne 32.000)', async () => {
  const x = adattatore({ risponde: (m) => (m === SCELTO.model ? conStato(403) : ok()), riserva: { ...RISERVA, responseReserve: 2_048 } });
  await x.a.summarize({ model: { ...SCELTO, responseReserve: 32_000 }, messages: [{ role: 'user', content: 'x' }], maxOutputTokens: 32_000, operationId: 'op', sessionId: 'chat' });
  assert.equal(x.chiamate[0].maxOutputTokens, 32_000);
  assert.equal(x.chiamate[1].maxOutputTokens, 2_048);
  const larga = adattatore({ risponde: (m) => (m === SCELTO.model ? conStato(403) : ok()), riserva: { ...RISERVA, responseReserve: 64_000 } });
  await larga.a.summarize({ model: SCELTO, messages: [{ role: 'user', content: 'x' }], maxOutputTokens: 1_000, operationId: 'op', sessionId: 'chat' });
  assert.equal(larga.chiamate[1].maxOutputTokens, 1_000, 'verso contrario: mai più di quanto il motore ha chiesto');
});

test('C6BIS-FIX-CLI2+PERF-C2 — la riserva si autorizza (col SUO modello e un operationId suo); se la politica dice no, l’errore di prima e nessuna chiamata', async () => {
  const autorizzate = [];
  const politica = (risposta) => ({ authorize: async (v) => { autorizzate.push(v); return v.operationId.endsWith(':riserva') ? risposta : true; } });
  const si = adattatore({ risponde: (m) => (m === SCELTO.model ? conStato(403) : ok()), usagePolicy: politica(true) });
  await riassumi(si);
  const perRiserva = autorizzate.find((v) => v.operationId === 'op:riserva');
  assert.ok(perRiserva, JSON.stringify(autorizzate.map((v) => v.operationId)));
  assert.equal(perRiserva.model.model, RISERVA.model);
  assert.equal(si.chiamate[1].operationId, 'op:riserva', 'due chiamate pagate restano due');
  autorizzate.length = 0;
  const no = adattatore({ risponde: (m) => (m === SCELTO.model ? conStato(403) : ok()), usagePolicy: politica(false) });
  await assert.rejects(riassumi(no), (e) => e.stato === 403, 'l’errore dello scelto, non un altro');
  assert.deepEqual(no.chiamate.map((c) => c.model), [SCELTO.model], 'la riserva non autorizzata non si chiama');
});

test('C6BIS-FIX-PIANO (CLI e Mobile) — limite del PIANO: la riserva sullo stesso fornitore non si chiama; su un altro fornitore sì', async () => {
  const piano = Object.assign(new Error('HTTP 429 after 1 attempt: {"error":{"code":"subscription_sharing_usage_limit_exceeded"}}'), { stato: 429 });
  const MINI = { provider: 'chatgpt', model: 'gpt-6-mini', windowTokens: 128_000 };
  const chiedi = (x) => x.a.summarize({ model: MINI, messages: [{ role: 'user', content: 'x' }], maxOutputTokens: 100, operationId: 'op', sessionId: 'chat' });
  const stessoPiano = adattatore({ risponde: (m) => (m === 'gpt-6-mini' ? piano : ok()), riserva: { provider: 'chatgpt', model: 'gpt-6-nano', windowTokens: 200_000, responseReserve: 4_096 } });
  await assert.rejects(chiedi(stessoPiano), (e) => e.stato === 429);
  assert.deepEqual(stessoPiano.chiamate.map((c) => c.model), ['gpt-6-mini'], 'nessuna chiamata sprecata sullo stesso piano');
  const altrove = adattatore({ risponde: (m) => (m === 'gpt-6-mini' ? piano : ok()) });
  await chiedi(altrove);
  assert.deepEqual(altrove.chiamate.map((c) => c.model), ['gpt-6-mini', RISERVA.model], 'su un altro fornitore la riserva serve');
  const perModello = adattatore({ risponde: (m) => (m === 'gpt-6-mini' ? conStato(429) : ok()), riserva: { provider: 'chatgpt', model: 'gpt-6-nano', windowTokens: 200_000 } });
  await chiedi(perModello);
  assert.deepEqual(perModello.chiamate.map((c) => c.model), ['gpt-6-mini', 'gpt-6-nano'], 'verso contrario: un 429 del MODELLO lascia provare un altro modello dello stesso fornitore');
});

test('C6BIS-FIX-PERF-C1 — i token del tentativo fallito restano nel conto: si sommano a quelli della riserva', async () => {
  const tagliato = Object.assign(new Error('stream cut'), { stato: 502, usage: { inputTokens: 100, outputTokens: 10 } });
  const x = adattatore({ risponde: (m) => (m === SCELTO.model ? tagliato : { text: 'R', finishReason: 'stop', usage: { inputTokens: 1, outputTokens: 2 } }) });
  const r = await riassumi(x);
  assert.deepEqual(r.usage, { inputTokens: 101, outputTokens: 12 });
  const senza = adattatore({ risponde: (m) => (m === SCELTO.model ? conStato(403) : { text: 'R', finishReason: 'stop', usage: { inputTokens: 1, outputTokens: 2 } }) });
  assert.deepEqual((await riassumi(senza)).usage, { inputTokens: 1, outputTokens: 2 }, 'verso contrario: un rifiuto senza uso non aggiunge niente');
});

test('C6BIS-FIX-PERF-C1b — falliti TUTTI E DUE: l\'errore della riserva porta la somma dei due usi (il motore conta entrambi)', async () => {
  const x = adattatore({ risponde: (m) => (m === SCELTO.model
    ? Object.assign(new Error('stream cut'), { stato: 502, usage: { inputTokens: 100, outputTokens: 10 } })
    : Object.assign(new Error('stream cut'), { stato: 502, usage: { inputTokens: 3, outputTokens: 4 } })) });
  const errore = await riassumi(x).then(() => null, (e) => e);
  assert.ok(errore, 'premessa: tutti e due falliscono');
  assert.deepEqual(errore.usage, { inputTokens: 103, outputTokens: 14 });
});

test('C6BIS-FIX-PERF-Q1 (runtime) — con la chat su un modello REMOTO una riserva locale si può usare: non toglie il posto a nessuno', async (t) => {
  const chiamati = [];
  const runtime = await runtimeDiProva(t, {
    readSession: (id) => (id === 'chat' ? { sessionId: id, modello: 'openrouter:z-ai/glm-5.3-flash', conclusa: true } : null),
    callModel: async (r) => { chiamati.push(`${r.provider}:${r.model}`); if (r.model === 'z-ai/glm-5.3-air') throw reteGiu(); return { text: 'x', finishReason: 'stop', usage: { inputTokens: 1, outputTokens: 1 } }; },
    modelloDelRiassuntoFn: () => 'openrouter:z-ai/glm-5.3-air',
    riservaDelRiassuntoFn: () => ({ provider: 'local', model: 'qwen-locale' }),
    resolveModelProfile: async (selected) => ({ ...selected, windowTokens: selected.provider === 'local' ? 32_768 : 16_384, responseReserve: 2_048 }),
    memoriaRiassuntoFn: () => new Map(),
  });
  await runtime.service.compact({ sessionId: 'chat', messages: storiaLunga }).catch(() => null);
  assert.ok(chiamati.includes('local:qwen-locale'), JSON.stringify(chiamati));
});

/* M12 della revisione del Blocco 21: una riserva che ha risposto non è più quella che la persona era stata avvisata di non poter usare */
test('C6BIS-MOTORE-09 — la riserva che risponde si dimentica come lo scelto: l\'avviso vale di nuovo, e il successo cancella ciò che le altre conversazioni sapevano', async () => {
  const stato = { riservaSenzaChiave: true, scelto: conStato(403) };
  const x = adattatore({ risponde: (m) => {
    if (m === SCELTO.model) return stato.scelto;
    return stato.riservaSenzaChiave ? conStato(401) : ok();
  } });
  await assert.rejects(riassumi(x), { stato: 401 });
  const perLaRiserva = () => x.avvisi.filter((a) => a.ruolo === 'riserva');
  assert.equal(perLaRiserva().length, 1, 'premessa: avvisata');
  assert.equal(x.memoria.has(RISERVA.model), true, 'premessa: ricordata');
  x.memoria.delete(RISERVA.model); // i 15 minuti della memoria sono passati; l'avviso resta
  stato.riservaSenzaChiave = false;
  await riassumi(x);
  assert.ok(x.memoria.riusciti?.get(RISERVA.model) > 0, 'il successo si data: `statoPerTuttoIlPc` lo confronta con ciò che sanno le altre');
  assert.equal(x.memoria.avvisati.has(RISERVA.model), false);
  assert.equal(x.memoria.avvisatiCon.has(RISERVA.model), false);
  stato.riservaSenzaChiave = true;
  await assert.rejects(riassumi(x), { stato: 401 });
  assert.equal(perLaRiserva().length, 2, 'dopo una risposta un guasto futuro si dice di nuovo');
});
