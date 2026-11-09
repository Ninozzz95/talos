/*
 * 174 (04/11/2026, forma C con gli OK di Performance, CLI e Mobile): il tetto della finestra resta fermo.
 * Lato desktop: l'àncora del fornitore porta la parte esatta e la parte stimata (`anchorTokens`, `estimatedDeltaTokens`), il motore le
 * usa anche nella stima rapida della richiesta piena (`engine.mjs`, la stima che decide il livello 1) e `budgetDellaMisura` restituisce
 * il margine (`marginTokens`) che la scheda e la CLI leggono. Prova dal vivo del giro UX: DeepSeek V4.1 Flash via OpenRouter,
 * finestra 266.667, riserva 32.000, soglia 165.999 col fornitore e 145.999 a stima.
 * Fonti: Hermes `agent/context_breakdown.py:194-213` e `agent/usage_anchor.py:108-120`; Codex
 * `codex-rs/core/src/context_manager/history.rs:1006-1030` (ultimo uso del fornitore + stima dei soli elementi dopo).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { conAncoraDelFornitore } from '../src/context-token-counters.mjs';
import { budgetDellaMisura } from '../src/context-desktop-service.mjs';
import { resolveDesktopDefaultProfile } from '../src/context-runtime.mjs';
import { createContextEngine } from '../../context-engine/src/engine.mjs';
import { createSqliteContextStore } from '../../context-engine/src/node/sqlite-store.mjs';
import { parseContextSettings } from '../../context-engine/src/contracts.mjs';
import { computeContextBudget } from '../../context-engine/src/compaction-planner.mjs';
import { CLEARING_STEP, KEEP_RECENT_TOOL_OUTPUTS } from '../../context-engine/src/tool-output-clearing.mjs';
import { rimuoviCartellaDiProvaAttesa } from './aiuto/rimuovi-cartella-di-prova.mjs';

const now = '2026-11-04T20:00:00.000Z';
const sha = (v) => createHash('sha256').update(JSON.stringify(v)).digest('hex');
const PROFILO = { provider: 'openrouter', model: 'deepseek/deepseek-v4.1-flash', windowTokens: 266_667, responseReserve: 32_000 };

/** il contatore di OpenRouter, che non ha un conteggio: byte/3,5 + 4 a messaggio, la stessa euristica di `context-token-counters.mjs` */
function contatoreDiOpenRouter() {
  const conto = { deleghe: 0 };
  conto.countPreparedContext = async ({ messages, tools = [], model: m }) => {
    conto.deleghe++;
    const inputTokens = Math.ceil(Buffer.byteLength(JSON.stringify({ messages, tools }), 'utf8') / 3.5) + messages.length * 4;
    return { schema: 'talos.context.tokens.v1', inputTokens, windowTokens: m.windowTokens, responseReserve: m.responseReserve, method: 'heuristic', exact: false, requestHash: sha({ messages, tools }), provider: m.provider, model: m.model, estimatedMarginTokens: Math.max(256, Math.ceil(inputTokens * 0.15)) };
  };
  return conto;
}

test('N174-1 — l\'àncora del fornitore dice la parte esatta e la parte stimata, e la somma è la misura', async () => {
  const base = contatoreDiOpenRouter();
  const contatore = conAncoraDelFornitore(base);
  const storia = [{ role: 'user', content: 'Leggi il file' }];
  contatore.registraAncora({ provider: PROFILO.provider, model: PROFILO.model, messages: storia, usage: { prompt_tokens: 150_000, completion_tokens: 70 } });
  const nuovi = [{ role: 'assistant', content: 'Ecco' }, { role: 'user', content: 'x'.repeat(7_000) }];
  const misura = await contatore.countPreparedContext({ messages: [...storia, ...nuovi], tools: [], model: PROFILO });
  assert.equal(misura.method, 'provider');
  assert.equal(misura.anchorTokens, 150_070, 'prompt_tokens + completion_tokens della risposta ancorata');
  assert.ok(misura.estimatedDeltaTokens > 2_000 && misura.estimatedDeltaTokens < 2_100, String(misura.estimatedDeltaTokens));
  assert.equal(misura.anchorTokens + misura.estimatedDeltaTokens, misura.inputTokens);
  assert.equal(base.deleghe, 0);
  // senza completion_tokens la risposta del modello si stima, e va nella parte stimata
  contatore.registraAncora({ provider: PROFILO.provider, model: PROFILO.model, messages: storia, usage: { prompt_tokens: 150_000 } });
  const senza = await contatore.countPreparedContext({ messages: [...storia, ...nuovi], tools: [], model: PROFILO });
  assert.equal(senza.anchorTokens, 150_000);
  assert.equal(senza.anchorTokens + senza.estimatedDeltaTokens, senza.inputTokens);
  assert.ok(senza.estimatedDeltaTokens > misura.estimatedDeltaTokens);
  // la stessa stima, senza contare: il motore la usa per decidere il livello 1 (null quando l'àncora non combacia)
  assert.deepEqual(contatore.anchoredEstimate({ messages: [...storia, ...nuovi], model: PROFILO }), { inputTokens: senza.inputTokens, anchorTokens: senza.anchorTokens, estimatedDeltaTokens: senza.estimatedDeltaTokens });
  assert.equal(contatore.anchoredEstimate({ messages: [{ role: 'user', content: 'altro' }], model: PROFILO }), null);
  assert.equal(contatore.anchoredEstimate({ messages: [...storia, ...nuovi], model: { ...PROFILO, model: 'altro' } }), null);
  assert.equal(base.deleghe, 0, 'la stima ancorata non chiama mai il contatore');
});

test('N174-2 — CLI: `budgetDellaMisura` restituisce il margine, e con l\'àncora la soglia resta quella del fornitore', () => {
  const fornitore = budgetDellaMisura({ measurement: { tokens: { ...PROFILO, inputTokens: 150_000, method: 'provider', exact: false } }, settings: {} });
  assert.equal(fornitore.triggerTokens, 165_999);
  assert.equal(fornitore.marginTokens, 13_334);
  const ancorata = budgetDellaMisura({ measurement: { tokens: { ...PROFILO, inputTokens: 152_000, method: 'heuristic', exact: false, anchorTokens: 150_000, estimatedDeltaTokens: 2_000 } }, settings: {} });
  assert.equal(ancorata.triggerTokens, 165_999, 'oggi 145.999');
  assert.equal(ancorata.marginTokens, 13_334);
  assert.equal(ancorata.anchorTokens, 150_000);
  assert.equal(ancorata.estimatedDeltaTokens, 2_000);
  const stimata = budgetDellaMisura({ measurement: { tokens: { ...PROFILO, inputTokens: 150_000, method: 'heuristic', exact: false } }, settings: {} });
  assert.equal(stimata.triggerTokens, 145_999, 'tutta stimata: come oggi');
  assert.equal(stimata.marginTokens, 40_001);
  assert.equal(Object.hasOwn(stimata, 'anchorTokens'), false);
});

test('N174-3 — cambiato il modello, il margine salvato con la misura vecchia non si riusa: si ricalcola sulla finestra nuova', () => {
  const vecchia = { ...PROFILO, inputTokens: 150_000, method: 'provider', exact: false, marginTokens: 13_334 };
  const nuovo = { provider: 'openrouter', model: 'altro/1m', windowTokens: 1_000_000, responseReserve: 32_000 };
  const b = budgetDellaMisura({ measurement: { tokens: vecchia }, settings: {} }, nuovo);
  assert.equal(b.marginTokens, 50_000);
  assert.equal(b.windowTokens, 1_000_000);
  // stesso modello: il margine della misura, identico a quello che il motore ha usato
  assert.equal(budgetDellaMisura({ measurement: { tokens: vecchia }, settings: {} }).marginTokens, 13_334);
});

test('N174-4 — Performance: `TALOS_COMPACTION_TOKEN_CAP` resta prioritario sul margine nuovo', async () => {
  const profilo = await resolveDesktopDefaultProfile({ provider: 'openrouter', model: 'm', finestraFn: () => 1_048_576, env: { TALOS_COMPACTION_TOKEN_CAP: '60000' } });
  assert.equal(profilo.windowTokens, 80_000);
  for (const estimatedDeltaTokens of [0, 500, 2_000, 20_000, 60_000]) {
    const b = computeContextBudget({ ...profilo, method: 'heuristic', inputTokens: 1_000 + estimatedDeltaTokens, anchorTokens: 1_000, estimatedDeltaTokens });
    const oggiFornitore = computeContextBudget({ ...profilo, method: 'provider', inputTokens: 1 });
    assert.ok(b.triggerTokens <= 60_000 && b.triggerTokens <= oggiFornitore.triggerTokens, `${estimatedDeltaTokens}: ${b.triggerTokens}`);
  }
});

/** una persona, poi coppie chiamata/uscita grandi abbastanza da arrivare a `token` stimati (byte/3,5) */
function storia(token) {
  const coppie = CLEARING_STEP + KEEP_RECENT_TOOL_OUTPUTS + 4;
  const lunga = Math.floor((token * 3.5) / coppie);
  const messaggi = [{ role: 'system', content: 'sistema' }, { role: 'user', content: 'Leggi tutti i file e dimmi cosa non va' }];
  for (let i = 0; i < coppie; i++) {
    const id = `c-${i}`;
    messaggi.push({ role: 'assistant', content: '', tool_calls: [{ id, type: 'function', function: { name: 'leggi', arguments: JSON.stringify({ percorso: `src/f${i}.mjs` }) } }] });
    messaggi.push({ role: 'tool', content: `riga ${i}\n`.repeat(Math.ceil(lunga / 8)).slice(0, lunga), tool_call_id: id });
  }
  messaggi.push({ role: 'assistant', content: 'fatto' });
  return messaggi;
}

/* `storia(142_000)`: ~155k token stimati col JSON vero (le andate a capo raddoppiano i byte) */
async function banco(t, { conAncora, guasta = null, prima = storia(142_000) }) {
  const dir = await mkdtemp(join(tmpdir(), 'nucleo-174-'));
  const store = createSqliteContextStore({ databasePath: join(dir, 'context.sqlite') });
  t.after(async () => { await store.close(); await rimuoviCartellaDiProvaAttesa(dir); });
  const base = contatoreDiOpenRouter();
  const contatore = conAncoraDelFornitore(base);
  const model = { resolveModel: async ({ sessionModel }) => sessionModel, summarize: async () => { throw new Error('nessun riassunto in questa prova'); } };
  const engine = createContextEngine({ store, model, tokenCounter: guasta ? { ...contatore, anchoredEstimate: guasta } : contatore, clock: () => now, clearedToolPointer: 'Recover it with conversation_search.' });
  const sessionId = 'chat-174';
  await store.initSession({ sessionId, settings: parseContextSettings({}) });
  for (const [i, message] of prima.entries()) await engine.appendOriginal({ sessionId, record: { id: `r${i}`, message, createdAt: now } });
  if (conAncora) {
    // il giro di prima: la richiesta spedita (con una finestra larga, così non si tocca niente) e la risposta del fornitore
    const spedita = await engine.prepareForRequest({ sessionId, messages: prima, tools: [], sessionModel: { ...PROFILO, windowTokens: 1_000_000 } });
    assert.deepEqual(spedita.messages, prima, 'la richiesta di prima è la storia intera');
    const stima = await base.countPreparedContext({ messages: spedita.messages, tools: [], model: PROFILO });
    assert.ok(contatore.registraAncora({ provider: PROFILO.provider, model: PROFILO.model, messages: spedita.messages, usage: { prompt_tokens: stima.inputTokens, completion_tokens: 5 } }));
  }
  // la persona scrive ~2k token in più
  const nuovo = { role: 'user', content: 'Adesso correggi. ' + 'dettaglio '.repeat(700) };
  await engine.appendOriginal({ sessionId, record: { id: `r${prima.length}`, message: nuovo, createdAt: now } });
  const messaggi = [...prima, nuovo];
  const preparata = await engine.prepareForRequest({ sessionId, messages: messaggi, tools: [], sessionModel: PROFILO });
  const snapshot = await store.readContextSnapshot({ sessionId });
  return { preparata, snapshot, messaggi };
}

test('N174-5 — il salto 166k → 146k: misura del fornitore, poi 2k stimati in più sotto la soglia vera ⇒ niente pulitura, il tetto resta 165.999', async (t) => {
  const { preparata, snapshot, messaggi } = await banco(t, { conAncora: true });
  const misura = snapshot.measurement.tokens;
  assert.ok(misura.inputTokens > 145_999 && misura.inputTokens < 165_999, `la richiesta sta fra le due soglie: ${misura.inputTokens}`);
  assert.equal(preparata.toolOutputsCleared ?? 0, 0, 'oggi la stima rapida al 15% puliva le uscite vecchie a 146k');
  assert.deepEqual(preparata.messages, messaggi);
  assert.equal(misura.method, 'provider');
  // CLI: la misura salvata porta àncora, parte stimata e margine
  assert.ok(misura.anchorTokens > 150_000);
  assert.ok(misura.estimatedDeltaTokens > 1_500 && misura.estimatedDeltaTokens < 2_500, String(misura.estimatedDeltaTokens));
  assert.equal(misura.marginTokens, 13_334);
  const budget = budgetDellaMisura(snapshot);
  assert.equal(budget.triggerTokens, 165_999);
  assert.equal(budget.marginTokens, 13_334);
});

test('N174-6 — AL CONTRARIO: la stessa storia senza un\'àncora (tutta stimata) resta prudente come oggi: pulisce a 146k', async (t) => {
  const { preparata, snapshot } = await banco(t, { conAncora: false });
  assert.ok(preparata.toolOutputsCleared > 0, 'la stima tutta locale sopra 145.999 pulisce, come oggi');
  const misura = snapshot.measurement.tokens;
  assert.equal(misura.method, 'heuristic');
  assert.equal(Object.hasOwn(misura, 'anchorTokens'), false);
  assert.equal(misura.marginTokens, 40_001);
  assert.equal(budgetDellaMisura(snapshot).triggerTokens, 145_999);
});

test('N174-7 — una stima ancorata che lancia o dice un numero rotto non fa cadere la richiesta: si stima come prima', async (t) => {
  for (const guasta of [() => { throw new Error('rotta'); }, () => ({ inputTokens: 'tanti', anchorTokens: 1, estimatedDeltaTokens: 1 })]) {
    const { preparata, snapshot } = await banco(t, { conAncora: true, guasta });
    assert.ok(preparata.toolOutputsCleared > 0, 'senza una stima ancorata valida: la stima tutta locale, come oggi');
    assert.equal(snapshot.measurement.tokens.method, 'heuristic');
  }
});

/** poche uscite grandi: il livello 1 non ha niente da togliere (servono più di CLEARING_STEP + KEEP_RECENT_TOOL_OUTPUTS uscite) e si accorcia sotto pressione */
function storiaCorta() {
  const messaggi = [{ role: 'system', content: 'sistema' }, { role: 'user', content: 'Leggi questi file' }];
  for (let i = 0; i < 10; i++) {
    messaggi.push({ role: 'assistant', content: '', tool_calls: [{ id: `p-${i}`, type: 'function', function: { name: 'leggi', arguments: JSON.stringify({ percorso: `big${i}.txt` }) } }] });
    messaggi.push({ role: 'tool', content: `parola${i} `.repeat(7_600), tool_call_id: `p-${i}` });
  }
  messaggi.push({ role: 'assistant', content: 'fatto' });
  return messaggi;
}

test('N174-8 — sopra la soglia senza niente da togliere: quanto accorciare si misura sulla stima ancorata (oggi sulla stima al 15%)', async (t) => {
  const ancorata = await banco(t, { conAncora: true, prima: storiaCorta() });
  const stimata = await banco(t, { conAncora: false, prima: storiaCorta() });
  assert.equal(ancorata.preparata.level1?.cleared ?? 0, 0);
  assert.ok(ancorata.preparata.level1?.shortened >= 1, JSON.stringify(ancorata.preparata.level1));
  assert.ok(stimata.preparata.level1.shortened > ancorata.preparata.level1.shortened, `${stimata.preparata.level1.shortened} contro ${ancorata.preparata.level1.shortened}: con l'àncora si accorcia solo quanto serve sopra 165.999`);
});
