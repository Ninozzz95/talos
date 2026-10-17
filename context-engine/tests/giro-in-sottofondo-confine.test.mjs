/*
 * Il CONFINE della guardia del riassunto in sottofondo (owner 16/10/2026, «In sottofondo, con una guardia»; revisione ROSSA del
 * bugfixer, SOTT-REV-01/02, e i suoi mutanti sopravvissuti: una guardia del 20% più severa passava tutte le prove).
 *
 * La guardia stima ciò che resta dopo il riassunto sulla composizione vera (`compiled` con un riassunto segnaposto lungo metà
 * della riserva di risposta) più ciò che la misura conta fuori dai messaggi (gli attrezzi). Qui il contatore usa la stessa
 * euristica (byte/3,5) e il riassunto finto è lungo quanto il segnaposto: la stima deve stare a pochi punti dalla misura VERA
 * dopo il riassunto. Prima la si misura (un riassunto vero, poi la richiesta dopo); poi, su un motore nuovo con la stessa
 * storia, un obiettivo appena SOPRA quella misura deve far partire il riassunto, uno appena SOTTO no.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { computeContextBudget } from '../src/compaction-planner.mjs';
import { createContextEngine } from '../src/engine.mjs';
import { createSqliteContextStore } from '../src/node/sqlite-store.mjs';
import { parseContextSettings } from '../src/contracts.mjs';

const modelProfile = { provider: 'local', model: 'controlled-fixture', windowTokens: 16384, responseReserve: 2048, local: true };
const now = '2026-10-01T00:00:00.000Z';
const TASK = 'Database SQLite: leggi i dieci file e dimmi cosa contengono.';
const SEGNAPOSTO_CARATTERI = Math.ceil((modelProfile.responseReserve / 2) * 3.5); // quello della guardia, engine.mjs
// attrezzi grandi (~3.000 token): la parte della misura che sta FUORI dai messaggi, e che il riassunto non tocca
const ATTREZZI = Array.from({ length: 6 }, (_, i) => ({ type: 'function', function: { name: `attrezzo_${i}`, description: 'Descrizione lunga di un attrezzo. '.repeat(50), parameters: { type: 'object', properties: {} } } }));

async function engineFixture(t, targetRatio) {
  const directory = await mkdtemp(join(tmpdir(), 'tcec-bg-confine-'));
  const store = createSqliteContextStore({ databasePath: join(directory, 'context.sqlite') });
  t.after(async () => { await store.close(); await rm(directory, { recursive: true, force: true }); });
  await store.initSession({ sessionId: 'turn', settings: parseContextSettings({ auto: true, triggerRatio: 0.5, targetRatio }) });
  const model = { resolveModel: async ({ sessionModel }) => sessionModel, summarize: async request => {
    const sourceIds = JSON.parse(request.messages.at(-1).content).sourceIds ?? [];
    const sourceId = sourceIds.find(id => id === 'u0' || id.startsWith('t')) ?? 'u0';
    const quote = sourceId === 'u0' ? 'Database SQLite' : `file ${sourceId.slice(1)}:`;
    const base = { schema: 'talos.context.summary.v1', text: '', goal: 'Leggere i dieci file', decisions: [], constraints: [], completed: ['letti i primi file'], pending: ['leggere gli altri'], resources: [], sources: [{ recordId: sourceId, quote }] };
    // un riassunto lungo quanto il segnaposto della guardia
    const summary = { ...base, text: 'r'.repeat(Math.max(0, SEGNAPOSTO_CARATTERI - JSON.stringify(base).length)) };
    return { text: JSON.stringify(summary), finishReason: 'stop', usage: { inputTokens: 50, outputTokens: 30 } };
  } };
  const tokenCounter = { async countPreparedContext({ messages, tools, model: profile }) { return { schema: 'talos.context.tokens.v1', inputTokens: Math.ceil(JSON.stringify({ messages, tools }).length / 3.5), windowTokens: profile.windowTokens, responseReserve: profile.responseReserve, method: 'heuristic', exact: false, requestHash: createHash('sha256').update(JSON.stringify({ messages, tools })).digest('hex'), provider: profile.provider, model: profile.model }; } };
  const engine = createContextEngine({ store, model, tokenCounter, clock: () => now });
  const append = (id, message) => engine.appendOriginal({ sessionId: 'turn', record: { id, message, createdAt: now } });
  await append('s0', { role: 'system', content: 'Sei un assistente.' });
  await append('u0', { role: 'user', content: TASK });
  for (let k = 1; k <= 7; k++) {
    await append(`a${k}`, { role: 'assistant', content: null, tool_calls: [{ id: `c${k}`, type: 'function', function: { name: 'leggi', arguments: JSON.stringify({ percorso: `f${k}.txt` }) } }] });
    await append(`t${k}`, { role: 'tool', tool_call_id: `c${k}`, content: [{ type: 'text', text: `file ${k}: ` + 'riga di contenuto '.repeat(100) }] });
  }
  return engine;
}
const prepara = (engine) => engine.prepareForRequest({ sessionId: 'turn', sessionModel: modelProfile, tools: ATTREZZI });
const lavoriDiSottofondo = async (engine) => (await engine.getContextState({ sessionId: 'turn' })).jobs.filter(j => /-turn-bg$/u.test(j.idempotencyKey));
const limite = computeContextBudget({ ...modelProfile, method: 'heuristic', inputTokens: 0, settings: { triggerRatio: 0.5, targetRatio: 0.49 } }).inputLimit;
const rapportoPer = (obiettivo) => (obiettivo + 0.5) / limite; // `targetTokens = floor(limite × rapporto)`

test('SOTT-CONFINE — la guardia stima ciò che resta a pochi punti dalla misura vera: obiettivo appena sopra ⇒ parte, appena sotto ⇒ no', async t => {
  // 1. la misura VERA dopo un riassunto, con un obiettivo largo
  const largo = await engineFixture(t, 0.49);
  const prima = await prepara(largo);
  const budget = computeContextBudget({ ...modelProfile, method: prima.measurement.method, inputTokens: prima.measurement.inputTokens, settings: { triggerRatio: 0.5, targetRatio: 0.49 } });
  assert.ok(budget.shouldPrepare && budget.fits, `premessa: sopra la soglia morbida, dentro il limite (${prima.measurement.inputTokens} su ${budget.inputLimit})`);
  const [lavoro] = await lavoriDiSottofondo(largo);
  assert.ok(lavoro, 'premessa: con un obiettivo largo il riassunto parte');
  assert.equal((await largo.waitForCompaction({ sessionId: 'turn', jobId: lavoro.id })).state, 'committed');
  const dopo = (await prepara(largo)).measurement.inputTokens;
  assert.ok(dopo < prima.measurement.inputTokens * 0.8, `premessa: il riassunto fa spazio (${prima.measurement.inputTokens} → ${dopo})`);

  // 2. obiettivo appena SOPRA la misura vera: la guardia lo concede
  const sopra = await engineFixture(t, rapportoPer(Math.ceil(dopo * 1.06)));
  await prepara(sopra);
  assert.equal((await lavoriDiSottofondo(sopra)).length, 1, `obiettivo ${Math.ceil(dopo * 1.06)}, ciò che resta davvero ${dopo}: il riassunto deve partire`);

  // 3. AL CONTRARIO: obiettivo appena SOTTO la misura vera, la guardia lo nega (il riassunto non porterebbe sotto l'obiettivo)
  const sotto = await engineFixture(t, rapportoPer(Math.floor(dopo * 0.94)));
  await prepara(sotto);
  assert.deepEqual(await lavoriDiSottofondo(sotto), [], `obiettivo ${Math.floor(dopo * 0.94)}, ciò che resta davvero ${dopo}: niente riassunto`);
});
