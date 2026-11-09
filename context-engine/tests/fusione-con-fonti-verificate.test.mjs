/*
 * 05/11/2026 — cura della compattazione per Luna 6, voci B1 e B2 (forma `FORMA-CURA-COMPATTAZIONE-LUNA-2026-11-05.md`, §2a e §3; OK di CLI,
 * Performance e Mobile, §8; B2-bis no).
 * Reperto del banco (04/11, ripetizioni 1, 5, 7 e 10): ogni segmento passava il controllo, e il lavoro moriva nella FUSIONE dei riassunti
 * con CTX_INVALID_SOURCE. La richiesta di fusione dava al modello solo i riassunti, con `sourceIds: []` e l'istruzione di citare
 * «the original», che lì non vede: Luna citava alla lettera il `text` di un segmento («The provided data contains a request to read
 * report1.txt and report2.txt, but on…», id inventato «user-message»). Il controllo fa la cosa giusta e NON si allenta: la richiesta
 * dice la verità (B1) e, se la fusione cita lo stesso un testo che non sta negli originali, si ritenta UNA volta, solo lì (B2).
 * Testi veri: sessione dffd904a, lavoro 0bea12bd (dati finti del banco).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { buildSummaryRequest, validateSummary } from '../src/summary.mjs';
import { createContextEngine } from '../src/engine.mjs';
import { createSqliteContextStore } from '../src/node/sqlite-store.mjs';
import { parseContextSettings } from '../src/contracts.mjs';

const banco = JSON.parse(await readFile(new URL('./fixtures/banco-luna-0bea12bd-fusione.json', import.meta.url), 'utf8'));
const FRASE_FUSIONE = "The data are summaries whose sources are already verified. Copy `sources` only from their `sources` lists, unchanged (same recordId, same quote). Never quote the summaries' own text.";
const FRASE_RIPRESA = 'The previous answer quoted text that is not in the originals: copy sources only from the verified sources listed.';
const segmenti = banco.segmenti.map(s => s.summary);

test('B1-01 (bench 0bea12bd, red before the cure): the merge request carries the verified sources\' recordIds and says to copy them', () => {
  const richiesta = buildSummaryRequest({ summaries: segmenti, maxOutputTokens: 8192 });
  const dati = JSON.parse(richiesta.messages.at(-1).content);
  assert.deepEqual(dati.sourceIds, ['message-4', 'message-6'], 'the union of the recordIds of the segments\' VERIFIED sources, in order, without repeats');
  assert.ok(!dati.sourceIds.includes('message-5'), 'a dropped (unverified) source is not offered');
  assert.ok(richiesta.messages[0].content.includes(FRASE_FUSIONE), 'the merge says where its quotes come from');
  assert.ok(!richiesta.messages[0].content.includes(FRASE_RIPRESA), 'the first request is not a retry');
});

test('B1-02 (the other way): a segment request is unchanged — its own sourceIds, no merge sentence', () => {
  const segment = { id: 'segment-0', text: 'message-4 (user)\nThere are 2 text files', sourceIds: ['message-4'] };
  const richiesta = buildSummaryRequest({ segment, maxOutputTokens: 8192 });
  assert.deepEqual(JSON.parse(richiesta.messages.at(-1).content).sourceIds, ['message-4']);
  assert.ok(!richiesta.messages[0].content.includes(FRASE_FUSIONE));
  assert.ok(!richiesta.messages[0].content.includes(FRASE_RIPRESA));
});

test('B1-03: the check is NOT loosened — Luna\'s recorded merge quote (the text of segment 0) is still rejected on the originals', () => {
  const risposta = { text: JSON.stringify({ ...segmenti[0], sources: [banco.citazioneDellaFusione] }), finishReason: 'stop' };
  assert.throws(() => validateSummary(risposta, { records: banco.records }), error => error.code === 'CTX_INVALID_SOURCE');
});

async function fixture(t, rispondiFusione) {
  const directory = await mkdtemp(join(tmpdir(), 'tcec-b2-'));
  const store = createSqliteContextStore({ databasePath: join(directory, 'context.sqlite') });
  t.after(async () => { await store.close(); await rm(directory, { recursive: true, force: true }); });
  await store.initSession({ sessionId: 'b10', settings: parseContextSettings({}) });
  const chiamate = [];
  const model = { resolveModel: async ({ sessionModel }) => sessionModel, summarize: async request => {
    const dati = JSON.parse(request.messages.at(-1).content);
    const fusione = String(dati.untrustedSource).startsWith('{"verifiedSegments"');
    chiamate.push({ fusione, sistema: request.messages[0].content, sourceIds: dati.sourceIds });
    // the segments: the two summaries Luna really wrote and the engine verified (the second one for every later segment)
    const riassunto = fusione ? rispondiFusione(chiamate.filter(c => c.fusione).length, request) : segmenti[Math.min(1, chiamate.filter(c => !c.fusione).length - 1)];
    return { text: JSON.stringify(riassunto), finishReason: 'stop', usage: { inputTokens: 50, outputTokens: 30 } };
  } };
  const tokenCounter = { async countPreparedContext({ messages, tools, model: m }) {
    return { schema: 'talos.context.tokens.v1', inputTokens: Math.ceil(JSON.stringify({ messages, tools }).length / 4), windowTokens: m.windowTokens, responseReserve: m.responseReserve, method: 'heuristic', exact: false, requestHash: createHash('sha256').update(JSON.stringify({ messages, tools })).digest('hex'), provider: m.provider, model: m.model };
  } };
  const engine = createContextEngine({ store, model, tokenCounter, clock: () => '2026-11-05T03:27:59.791Z' });
  for (const record of banco.records) await engine.appendOriginal({ sessionId: 'b10', record });
  // a window that splits the covered read (22k characters) in two segments, as on the bench
  const sessionModel = { provider: 'chatgpt', model: 'gpt-6-luna', windowTokens: 9000, responseReserve: 1024, safetyMarginTokens: 0 };
  const job = await engine.startCompaction({ sessionId: 'b10', idempotencyKey: 'auto-6-luna-turn', sessionModel, withinTurn: true });
  const fine = await engine.waitForCompaction({ sessionId: 'b10', jobId: job.id });
  return { fine, chiamate };
}

const lunaCitaIlRiassunto = () => ({ ...segmenti[0], text: 'Two reports were requested; report1 code 89458FDD.', sources: [banco.citazioneDellaFusione] });
const copiaLeFontiVerificate = (request) => {
  const fonti = JSON.parse(JSON.parse(request.messages.at(-1).content).untrustedSource).verifiedSegments.flatMap(s => s.sources).map(({ recordId, quote }) => ({ recordId, quote }));
  return { schema: 'talos.context.summary.v1', text: 'Two reports were requested; report1 code 89458FDD.', goal: 'Read both reports', decisions: [], constraints: [], completed: [], pending: [], resources: [], sources: fonti.slice(0, 4) };
};

test('B2-01 (bench 0bea12bd, red before the cure): a merge that quotes the summaries is retried ONCE with the retry sentence, and the job commits', async t => {
  const { fine, chiamate } = await fixture(t, (n, request) => n === 1 ? lunaCitaIlRiassunto() : copiaLeFontiVerificate(request));
  const fusioni = chiamate.filter(c => c.fusione);
  const nSegmenti = chiamate.filter(c => !c.fusione).length;
  assert.ok(nSegmenti >= 2, `premise: at least two segments, as on the bench (${chiamate.length} calls)`);
  assert.equal(fusioni.length, nSegmenti, `n segments need n-1 merges, plus ONE retry (${nSegmenti} segments)`);
  assert.equal(fusioni.filter(c => c.sistema.includes(FRASE_RIPRESA)).length, 1, "exactly one retry");
  assert.ok(!fusioni[0].sistema.includes(FRASE_RIPRESA));
  assert.ok(fusioni[1].sistema.includes(FRASE_RIPRESA), 'the retry is a DIFFERENT request that says what was wrong');
  assert.equal(fine.state, 'committed', `${fine.state} ${fine.error?.code ?? ''} ${fine.error?.message ?? ''}`);
});

test('B2-02: at most ONE retry — a merge that quotes the summaries twice fails CTX_INVALID_SOURCE after two calls', async t => {
  const { fine, chiamate } = await fixture(t, () => lunaCitaIlRiassunto());
  assert.equal(chiamate.filter(c => c.fusione).length, 2, 'never a third merge call');
  assert.equal(fine.state, 'failed');
  assert.equal(fine.error?.code, 'CTX_INVALID_SOURCE');
});

test('B2-03 (the other way): a SEGMENT that quotes nothing real is not retried — the retry is only in the merge', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'tcec-b2-seg-'));
  const store = createSqliteContextStore({ databasePath: join(directory, 'context.sqlite') });
  t.after(async () => { await store.close(); await rm(directory, { recursive: true, force: true }); });
  await store.initSession({ sessionId: 'b10', settings: parseContextSettings({}) });
  let chiamate = 0;
  const model = { resolveModel: async ({ sessionModel }) => sessionModel, summarize: async () => {
    chiamate++;
    return { text: JSON.stringify({ ...segmenti[0], sources: [banco.citazioneDellaFusione] }), finishReason: 'stop', usage: { inputTokens: 50, outputTokens: 30 } };
  } };
  const tokenCounter = { async countPreparedContext({ messages, tools, model: m }) {
    return { schema: 'talos.context.tokens.v1', inputTokens: Math.ceil(JSON.stringify({ messages, tools }).length / 4), windowTokens: m.windowTokens, responseReserve: m.responseReserve, method: 'heuristic', exact: false, requestHash: createHash('sha256').update(JSON.stringify({ messages, tools })).digest('hex'), provider: m.provider, model: m.model };
  } };
  const engine = createContextEngine({ store, model, tokenCounter, clock: () => '2026-11-05T03:27:59.791Z' });
  for (const record of banco.records) await engine.appendOriginal({ sessionId: 'b10', record });
  const job = await engine.startCompaction({ sessionId: 'b10', idempotencyKey: 'auto-6-luna-turn', sessionModel: { provider: 'chatgpt', model: 'gpt-6-luna', windowTokens: 9000, responseReserve: 1024, safetyMarginTokens: 0 }, withinTurn: true });
  const fine = await engine.waitForCompaction({ sessionId: 'b10', jobId: job.id });
  assert.equal(fine.error?.code, 'CTX_INVALID_SOURCE');
  assert.equal(chiamate, 1, 'one call: the first segment fails and is not asked again');
});
