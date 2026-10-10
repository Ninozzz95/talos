/*
 * C1 (09/10/2026 sera) — trovato dal banco C1 v2 sul trascritto 4c3e1649: la compattazione del motore è morta con
 * CTX_ARCHIVE_INVALID «Source quote or offsets do not match original».
 * Causa: `validateSummary` trova le citazioni del modello in modo TOLLERANTE (elisioni «…», virgolette tipografiche,
 * maiuscole, spazi doppi: `locateQuote`, 09/09) e salvava `start/end` del tratto trovato con la `quote` DEL MODELLO; al
 * momento di pubblicare, la verifica dell'archivio (`node/context-export.mjs::sources`) pretende
 * `testo.slice(start, start + quote.length) === quote` alla lettera, e rifiuta tutta la versione.
 * ⇒ Una citazione verificata porta il testo dell'ORIGINALE (quello che sta davvero fra start ed end), e `end` è la fine vera
 *   del tratto anche quando gli spazi dell'originale e della citazione non hanno la stessa lunghezza.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { createContextEngine } from '../src/engine.mjs';
import { createSqliteContextStore } from '../src/node/sqlite-store.mjs';
import { parseContextSettings } from '../src/contracts.mjs';
import { validateSummary } from '../src/summary.mjs';

const now = '2026-10-09T00:00:00.000Z';
const profilo = { provider: 'local', model: 'fixture', windowTokens: 131072, responseReserve: 2048, local: true };
const sha = (v) => createHash('sha256').update(JSON.stringify(v)).digest('hex');
const ORIGINALE = 'Abbiamo deciso:  usare "SQLite" come database, e niente dipendenze nuove nel progetto.';
const sintesiCon = (quote) => ({ text: JSON.stringify({ schema: 'talos.context.summary.v1', text: 'sintesi', goal: 'g', decisions: ['SQLite'], constraints: [], completed: [], pending: [], resources: [], sources: [{ recordId: 'u0', quote }] }), finishReason: 'stop' });

for (const [nome, quote, atteso] of [
  ['typographic quotes', 'usare «SQLite» come database', 'usare "SQLite" come database'],
  ['elision', 'Abbiamo deciso: … niente dipendenze nuove', 'Abbiamo deciso:  usare "SQLite" come database, e niente dipendenze nuove'],
  // l'originale ha DUE spazi dopo i due punti: la fine vera del tratto comprende la virgoletta di chiusura
  ['case and single spaces', 'abbiamo deciso: usare "sqlite"', 'Abbiamo deciso:  usare "SQLite"'],
]) {
  test(`C1-CIT-${nome}: a verified loose quote carries the ORIGINAL text, and slice(start, end) equals it`, () => {
    const record = { id: 'u0', message: { role: 'user', content: ORIGINALE } };
    const summary = validateSummary(sintesiCon(quote), { records: [record] });
    assert.equal(summary.sources.length, 1, JSON.stringify(summary.unverifiedSources));
    const [s] = summary.sources;
    assert.equal(s.quote, atteso, 'the ORIGINAL text of the whole span');
    assert.equal(ORIGINALE.slice(s.start, s.end), s.quote);
  });
}

test('C1-CIT-LONG-ELISION: an elision spanning more than 300 characters keeps only its first fragment, exact', () => {
  const lungo = `Primo punto deciso: usare SQLite. ${'testo in mezzo '.repeat(40)}Ultimo punto: niente dipendenze.`;
  const summary = validateSummary(sintesiCon('primo punto deciso: usare sqlite … ultimo punto: niente dipendenze'), { records: [{ id: 'u0', message: { role: 'user', content: lungo } }] });
  const [s] = summary.sources;
  assert.equal(s.quote, 'Primo punto deciso: usare SQLite');
  assert.equal(lungo.slice(s.start, s.end), s.quote);
});

test('C1-CIT-COMMIT: a summary whose only quote is loose is committed, not rejected by the archive check', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'c1-citazioni-'));
  const store = createSqliteContextStore({ databasePath: join(dir, 'context.sqlite') });
  t.after(async () => { await store.close(); await rm(dir, { recursive: true, force: true }); });
  const model = { resolveModel: async ({ sessionModel }) => sessionModel, summarize: async () => ({ ...sintesiCon('usare «SQLite» come database'), usage: { inputTokens: 1, outputTokens: 1 } }) };
  const tokenCounter = { async countPreparedContext({ messages, tools, model: m }) { return { schema: 'talos.context.tokens.v1', inputTokens: Math.ceil(JSON.stringify({ messages, tools }).length / 4), windowTokens: m.windowTokens, responseReserve: m.responseReserve, method: 'heuristic', exact: false, requestHash: sha({ messages, tools }), provider: m.provider, model: m.model }; } };
  const engine = createContextEngine({ store, model, tokenCounter, clock: () => now });
  await store.initSession({ sessionId: 'chat', settings: parseContextSettings({}) });
  const lungo = ' ' + 'dettaglio '.repeat(300);
  const messaggi = [
    { role: 'user', content: ORIGINALE },
    { role: 'assistant', content: 'ok' + lungo },
    { role: 'user', content: 'seconda' + lungo },
    { role: 'assistant', content: 'fatto' + lungo },
  ];
  for (const [i, message] of messaggi.entries()) await engine.appendOriginal({ sessionId: 'chat', record: { id: i === 0 ? 'u0' : `r${i}`, message, createdAt: now } });
  const job = await engine.startCompaction({ sessionId: 'chat', sessionModel: profilo, idempotencyKey: 'k' });
  const fine = await engine.waitForCompaction({ sessionId: 'chat', jobId: job.id });
  assert.equal(fine.state, 'committed', JSON.stringify(fine.error));
});
