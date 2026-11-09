/*
 * Spesa di servizio, parte 2 B (30/10/2026; OK di CLI, Mobile, Performance sulla forma): i riassunti del MOTORE del contesto.
 *   - una riga `consumo-di-servizio` per chiamata pagata (scelto e riserva), col SUO uso, `scopo:'motore'`, il `jobId` del lavoro;
 *   - `inPrimoPiano` con la regola della CLI: attese in corso all'inizio, cambiate durante, in corso alla fine;
 *   - un guasto della porta non ferma mai il riassunto;
 *   - l'attesa del giro su un riassunto del motore: `talos.attesa-del-motore` v1 DUREVOLE {jobId, inizioAt, at, esito}, una per attesa,
 *     con esito in una lista chiusa; `talos.compattazione` 'inizio' resta NON durevole (+ jobId, at).
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createContextModelAdapter } from '../src/context-provider-adapter.mjs';
import { avviaSessione } from '../src/agent-service.mjs';
import { ESITI_ATTESA_DEL_MOTORE } from '../src/kernel/talosHarness.desktop-hotfix.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

const SCELTO = { provider: 'openrouter', model: 'z-ai/glm-4.7-flash', windowTokens: 128_000, responseReserve: 4_096 };
const RISERVA = { provider: 'openrouter', model: 'qwen/qwen3.7-flash', windowTokens: 200_000, responseReserve: 4_096 };
const MESSAGGI = [{ role: 'user', content: 'riassumi' }];

function adattatore({ risponde, riserva = null, porta }) {
  const righe = [];
  const a = createContextModelAdapter({
    resolveModel: async ({ selected }) => ({ ...selected, windowTokens: SCELTO.windowTokens, responseReserve: SCELTO.responseReserve }),
    callModel: async (request) => { const r = await risponde(request); if (r instanceof Error) throw r; return structuredClone(r); },
    sceltaDellaPersona: () => ({ provider: SCELTO.provider, model: SCELTO.model }),
    ...(riserva ? { riservaDelRiassunto: async () => riserva, memoriaRiassunto: () => new Map() } : {}),
    onConsumoDiServizio: porta ?? ((input) => { righe.push(input); }),
  });
  return { a, righe };
}
const ok = (usage) => ({ text: 'RIASSUNTO', finishReason: 'stop', usage });
const riassumi = (a, extra = {}) => a.summarize({ model: SCELTO, messages: MESSAGGI, maxOutputTokens: 2_000, operationId: 'op', sessionId: 'chat', jobId: 'job-7', ...extra });

test('SERVIZIO-MOTORE-01 — una chiamata riuscita: UNA riga scopo «motore», col suo uso, il jobId, la conversazione; nessuno aspetta ⇒ non in primo piano', async () => {
  const { a, righe } = adattatore({ risponde: async () => ok({ prompt_tokens: 900, completion_tokens: 80, cost: 0.0004 }) });
  await riassumi(a, { attese: () => ({ inCorso: 0, totale: 0 }) });
  assert.equal(righe.length, 1, JSON.stringify(righe));
  const { sessionId, valore } = righe[0];
  assert.equal(sessionId, 'chat');
  assert.equal(valore.schema, 'talos.consumo-di-servizio.v1');
  assert.equal(valore.scopo, 'motore');
  assert.equal(valore.jobId, 'job-7');
  assert.equal(valore.fonte, 'openrouter');
  assert.equal(valore.modelloRemoto, SCELTO.model);
  assert.equal(valore.usage.prompt_tokens, 900);
  assert.equal(valore.costoDichiarato, 0.0004);
  assert.equal(valore.esito, 'completato');
  assert.equal(valore.inPrimoPiano, false);
  assert.equal('riserva' in valore, false);
  assert.ok(Number.isSafeInteger(valore.durataMs));
});

test('SERVIZIO-MOTORE-02 (CLI) — in primo piano nei tre casi: attesa già in corso, attesa cominciata durante, attesa in corso alla fine', async () => {
  const casi = [
    ['in corso all\'inizio (il /compact)', [{ inCorso: 1, totale: 1 }, { inCorso: 1, totale: 1 }]],
    ['cominciata e finita durante', [{ inCorso: 0, totale: 0 }, { inCorso: 0, totale: 1 }]],
    ['cominciata durante, in corso alla fine', [{ inCorso: 0, totale: 0 }, { inCorso: 1, totale: 1 }]],
  ];
  for (const [nome, letture] of casi) {
    let i = 0;
    const { a, righe } = adattatore({ risponde: async () => ok({ prompt_tokens: 1, completion_tokens: 1 }) });
    await riassumi(a, { attese: () => letture[Math.min(i++, letture.length - 1)] });
    assert.equal(righe[0].valore.inPrimoPiano, true, nome);
  }
});

test('SERVIZIO-MOTORE-03 — scelto rifiutato (403) e riserva: DUE righe, ognuna col SUO uso, la seconda «riserva»; la somma C1b resta solo al motore', async () => {
  const { a, righe } = adattatore({
    riserva: RISERVA,
    risponde: async (request) => (request.model === SCELTO.model
      ? Object.assign(new Error('HTTP 403'), { stato: 403, usage: { prompt_tokens: 7, completion_tokens: 0 } })
      : ok({ prompt_tokens: 500, completion_tokens: 50 })),
  });
  const risposta = await riassumi(a, { attese: () => ({ inCorso: 0, totale: 0 }) });
  assert.equal(righe.length, 2, JSON.stringify(righe));
  assert.deepEqual(righe.map((r) => [r.valore.modelloRemoto, r.valore.riserva === true, r.valore.esito]),
    [[SCELTO.model, false, 'interrotto'], [RISERVA.model, true, 'completato']]);
  assert.equal(righe[0].valore.usage.prompt_tokens, 7);
  assert.equal(righe[1].valore.usage.prompt_tokens, 500, 'la riga della riserva NON porta la somma');
  assert.equal(risposta.usage.prompt_tokens, 507, 'premessa: il motore riceve la somma, come prima (C1b)');
});

test('SERVIZIO-MOTORE-04 — la porta che lancia (anche in modo asincrono) non ferma mai il riassunto', async () => {
  for (const porta of [() => { throw new Error('porta rotta'); }, async () => { throw new Error('porta rotta, asincrona'); }]) {
    const { a } = adattatore({ risponde: async () => ok({ prompt_tokens: 1, completion_tokens: 1 }), porta });
    const r = await riassumi(a);
    assert.equal(r.text, 'RIASSUNTO');
  }
});

test('SERVIZIO-MOTORE-05 — AL CONTRARIO: senza porta nessuna riga e il riassunto è quello di prima; senza jobId il campo resta assente', async () => {
  const senza = createContextModelAdapter({
    resolveModel: async ({ selected }) => ({ ...selected, windowTokens: SCELTO.windowTokens, responseReserve: SCELTO.responseReserve }),
    callModel: async () => ok({ prompt_tokens: 1, completion_tokens: 1 }),
  });
  assert.equal((await senza.summarize({ model: SCELTO, messages: MESSAGGI, maxOutputTokens: 100, operationId: 'op' })).text, 'RIASSUNTO');
  const { a, righe } = adattatore({ risponde: async () => ok({ prompt_tokens: 1, completion_tokens: 1 }) });
  await a.summarize({ model: SCELTO, messages: MESSAGGI, maxOutputTokens: 100, operationId: 'op', sessionId: 'chat' });
  assert.equal('jobId' in righe[0].valore, false);
  assert.equal(righe[0].valore.inPrimoPiano, false, 'senza lettura delle attese: nessuno aspettava');
});

test('SERVIZIO-MOTORE-06 — l\'attesa del motore: una riga DUREVOLE talos.attesa-del-motore v1; l\'inizio resta NON durevole con jobId e at', async (t) => {
  const cartella = mkdtempSync(join(tmpdir(), 'talos-attesa-motore-'));
  t.after(() => rimuoviCartellaDiProva(cartella));
  const visti = [];
  await avviaSessione({ cartella, task: { consegna: 'prova' }, modello: 'm', chiave: 'k',
    onEvento: (evento, opzioni) => { visti.push({ evento, opzioni }); },
    talosLavoraFn: async (input) => {
      input.onGiro?.({ giro: 0, tipo: 'compattazione-inizio', tokenMisurati: null, soglia: null, motivo: 'soglia', origine: 'motore', at: '2026-10-30T15:00:00.000Z', jobId: 'job-9' });
      input.onGiro?.({ giro: 0, tipo: 'compattazione-fine', compattato: false, motivo: 'motore', origine: 'motore' });
      input.onGiro?.({ giro: 0, tipo: 'attesa-del-motore', inizioAt: '2026-10-30T15:00:00.000Z', at: '2026-10-30T15:00:12.000Z', esito: 'committed', jobId: 'job-9' });
      return { comeFinita: 'concluso', detto: 'fatto', messaggiFinali: [], usage: {} };
    } });
  const inizio = visti.find((v) => v.evento?.name === 'talos.compattazione' && v.evento.value?.fase === 'inizio');
  assert.equal(inizio.evento.value.jobId, 'job-9');
  assert.equal(inizio.evento.value.at, '2026-10-30T15:00:00.000Z');
  assert.notEqual(inizio.opzioni?.durable, true, 'l\'inizio resta fuori dal giornale (Mobile: nessun orfano appeso)');
  const attese = visti.filter((v) => v.evento?.name === 'talos.attesa-del-motore');
  assert.equal(attese.length, 1);
  assert.equal(attese[0].opzioni?.durable, true);
  const v = attese[0].evento.value;
  assert.equal(v.schema, 'talos.attesa-del-motore.v1');
  assert.deepEqual([v.jobId, v.inizioAt, v.at, v.esito], ['job-9', '2026-10-30T15:00:00.000Z', '2026-10-30T15:00:12.000Z', 'committed']);
  assert.equal(typeof v.runId, 'string');
  assert.equal(v.richiestaDelGiro, 0, 'N1 di Performance: indice della richiesta col nome della riga di servizio');
  assert.equal('giro' in v, false);
});

test('SERVIZIO-MOTORE-07 (CLI) — gli esiti dell\'attesa sono una lista CHIUSA', () => {
  assert.deepEqual([...ESITI_ATTESA_DEL_MOTORE], ['committed', 'failed', 'cancelled', 'paused', 'timeout', 'abandoned', 'unknown']);
  assert.ok(Object.isFrozen(ESITI_ATTESA_DEL_MOTORE));
});

/* Il filo VERO del kernel: registro, avviaSessione e adattatore desktop veri; finti solo il motore del contesto e la rete (scena di
   `riga-viva-motore-21-10.test.mjs`). Il motore annuncia l'attesa col suo jobId; lo Skip la chiude con l'esito del motore. */
const { createSessionRegistry } = await import('../src/session-registry.mjs');
const { talosLavora } = await import('../src/kernel/talosHarness.desktop-hotfix.mjs');
const { TaskCatalogError } = await import('../src/task-catalog.mjs');
const attendi = async (cond, ms = 10_000) => { const fine = Date.now() + ms; while (!cond() && Date.now() < fine) await new Promise((r) => { setTimeout(r, 10); }); return cond(); };
function motoreCheAspetta({ esito = 'cancelled' } = {}) {
  const stato = { inAttesa: false, chiamate: 0 };
  const hooks = {
    captureProviderResponse: async () => undefined,
    prepare: async ({ messages, signal, onInTurnWait }) => {
      stato.chiamate += 1;
      if (stato.chiamate > 1) return { messages };
      onInTurnWait?.({ state: 'waiting', jobId: 'job-1', ceilingMs: 600_000 });
      stato.inAttesa = true;
      try { await new Promise((_, no) => { const via = () => no(Object.assign(new Error('aborted'), { name: 'AbortError' })); if (signal?.aborted) via(); else signal?.addEventListener('abort', via, { once: true }); }); }
      finally { stato.inAttesa = false; onInTurnWait?.({ state: 'done', jobId: 'job-1', outcome: esito }); }
      return { messages };
    },
  };
  return { hooks, stato };
}
const registroConMotore = (motore, extra = {}) => createSessionRegistry({
  guardaWorkspaceFn: () => () => {},
  avviaSessioneFn: (input) => avviaSessione({ ...input, talosLavoraFn: (ri) => talosLavora({ ...ri, fetchDiRete: async () => Response.json({ choices: [{ index: 0, message: { role: 'assistant', content: 'fatto' }, finish_reason: 'stop' }], usage: { prompt_tokens: 100, completion_tokens: 2 } }) }) }),
  contextHooksFn: async () => motore.hooks,
  preparaEsecuzioneFn: (taskId) => { if (taskId !== 'task-vero') throw new TaskCatalogError(`Task non ammesso: ${taskId}`); return { cartella: process.cwd(), comandoProva: null, task: { id: taskId, consegna: 'Rispondi.' } }; },
  modello: 'z-ai/glm-5.3-flash', chiave: 'k', ...extra,
});
const eventiDi = (registro, sessionId, nome) => (registro.esporta(sessionId)?.eventi ?? []).filter((e) => e.type === 'CUSTOM' && e.name === nome).map((e) => e.value);

test('SERVIZIO-MOTORE-08 — il filo del kernel: il motore aspetta col jobId, lo Skip la chiude ⇒ UNA talos.attesa-del-motore con jobId, i due orari, esito del motore', async () => {
  const motore = motoreCheAspetta();
  const registro = registroConMotore(motore);
  const { sessionId } = registro.avvia('task-vero');
  assert.ok(await attendi(() => motore.stato.inAttesa));
  const inizio = eventiDi(registro, sessionId, 'talos.compattazione').find((v) => v.fase === 'inizio');
  assert.equal(inizio?.jobId, 'job-1', JSON.stringify(inizio));
  assert.match(inizio.at, /^\d{4}-\d{2}-\d{2}T/u);
  assert.deepEqual(registro.saltaRiassunto(sessionId), { saltato: true });
  assert.ok(await attendi(() => eventiDi(registro, sessionId, 'talos.attesa-del-motore').length === 1), JSON.stringify(registro.esporta(sessionId)?.eventi?.map((e) => e.name ?? e.type)));
  const [attesa] = eventiDi(registro, sessionId, 'talos.attesa-del-motore');
  assert.equal(attesa.jobId, 'job-1');
  assert.equal(attesa.esito, 'cancelled');
  assert.equal(attesa.inizioAt, inizio.at);
  assert.ok(Date.parse(attesa.at) >= Date.parse(attesa.inizioAt));
  assert.ok(await attendi(() => (registro.esporta(sessionId)?.eventi ?? []).some((e) => e.type === 'RunFinished' || e.type === 'RunError')));
  assert.equal(eventiDi(registro, sessionId, 'talos.attesa-del-motore').length, 1, 'una sola riga per attesa');
});

test('SERVIZIO-MOTORE-09 — il registro scrive la riga del motore nella SUA conversazione, solo con l\'interruttore acceso; e mai per una conversazione che non c\'è', async () => {
  const valore = { schema: 'talos.consumo-di-servizio.v1', scopo: 'motore', usage: null, esito: 'completato', at: '2026-10-30T15:00:00.000Z', inPrimoPiano: false, jobId: 'job-2' };
  for (const acceso of [true, false]) {
    const motore = motoreCheAspetta(); motore.stato.chiamate = 1; // non aspetta: il giro finisce subito
    const registro = registroConMotore(motore, { consumoDiServizioDurevole: acceso });
    const { sessionId } = registro.avvia('task-vero');
    assert.ok(await attendi(() => (registro.esporta(sessionId)?.eventi ?? []).some((e) => e.type === 'RunFinished' || e.type === 'RunError')));
    registro.pubblicaSpesaDelMotore({ sessionId, valore });
    assert.equal(registro.pubblicaSpesaDelMotore({ sessionId: 'nessuna', valore }), null);
    const righe = eventiDi(registro, sessionId, 'consumo-di-servizio').filter((v) => v.scopo === 'motore');
    assert.equal(righe.length, acceso ? 1 : 0, `interruttore ${acceso}`);
    if (acceso) assert.equal(righe[0].jobId, 'job-2');
  }
});

test('SERVIZIO-MOTORE-10 (Mobile) — una attesa ABBANDONATA (Skip su un lavoro di prima) scrive lo stesso la sua riga, esito «abandoned»: nessuna riga vuol dire solo «processo morto»', async () => {
  const motore = motoreCheAspetta({ esito: 'abandoned' });
  const registro = registroConMotore(motore);
  const { sessionId } = registro.avvia('task-vero');
  assert.ok(await attendi(() => motore.stato.inAttesa));
  assert.deepEqual(registro.saltaRiassunto(sessionId), { saltato: true });
  assert.ok(await attendi(() => eventiDi(registro, sessionId, 'talos.attesa-del-motore').length === 1));
  assert.equal(eventiDi(registro, sessionId, 'talos.attesa-del-motore')[0].esito, 'abandoned');
});
