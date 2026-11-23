#!/usr/bin/env node
/*
 * C4R bench — in-process measurement of the session-list reading path, BEFORE and AFTER the cure.
 * NOT a pass/fail test: it prints numbers. The A2 target is ratified as `session list <= 0.7 s`
 * (parity number, ConPTY — measured by the coordinator); this script declares only the in-process
 * number of the summaries computation, on the same fixture, with the same method, before and after.
 *
 * Fixture: a synthetic store in a private temp folder — 32 sessions, each journal ~1 MB, written
 * through the REAL session-store writer (`registraRigaSync`), so the bytes are exactly what the
 * kernel replays. The owner's real stores (~/.claude, ~/.codex, the real sessions store) are never touched.
 *
 * BEFORE (current reading path): for every run, a fresh kernel registry over the fixture store:
 *   ripristina() (stream replay of EVERY journal) + elenca() + normalizeSessionSummaries().
 * AFTER (cured path): probeSessionListIndex() on a committed index — readdir + stat + one small
 *   JSON file, no journal content read. The index is written once (untimed) from a full replay.
 *
 * Usage: node test/bench/session-list-bench.mjs [before|both]   (default: both; "before" works on HEAD too)
 * Method: 7 runs per side, median reported; probe bytes read counted through injected deps.
 */
import {mkdtempSync, rmSync, mkdirSync, statSync, readdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, resolve, dirname} from 'node:path';
import {pathToFileURL, fileURLToPath} from 'node:url';
import {performance} from 'node:perf_hooks';
import {randomUUID} from 'node:crypto';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const PHASE = process.argv[2] === 'before' ? 'before' : 'both';

const sessionStore = await import(pathToFileURL(join(REPO_ROOT, 'harness-ui', 'src', 'session-store.mjs')).href);
const sessionRegistryModule = await import(pathToFileURL(join(REPO_ROOT, 'harness-ui', 'src', 'session-registry.mjs')).href);
const {normalizeSessionSummaries} = await import(pathToFileURL(join(REPO_ROOT, 'cli', 'src', 'runtime', 'session-summary.ts')).href);

const SESSIONS = 32;
const TARGET_JOURNAL_BYTES = 1024 * 1024;
const RUNS = 7;

function headerRecord(sessionId, startedAt) {
  return {
    tipo: 'intestazione', schema: 2, sessionId, taskId: null, cartella: '/tmp/project', task: null,
    comandoProva: null, forkDa: null, avviataAlle: startedAt, modello: 'openrouter:vendor/live-model-a',
    modelloPlanner: null, reasoning: null, mobile: false, permessi: 'Workspace write',
    modalitaOperativa: 'normale', doveGiranoIComandi: null, comandiNellaConversazione: false,
    fallbackProviders: [], permessiPerAttrezzo: null, padreId: null, profonditaDelega: 0,
    provider: 'cloud', runtimeId: null, modelId: 'openrouter:vendor/live-model-a', fallbackConsent: false,
    cartellaGiaScelta: false,
  };
}

function buildFixture(root) {
  const store = join(root, 'sessions');
  mkdirSync(store, {recursive: true});
  for (let i = 0; i < SESSIONS; i += 1) {
    const sessionId = randomUUID();
    const startedAt = new Date(Date.parse('2026-10-01T00:00:00.000Z') + i * 60_000).toISOString();
    sessionStore.registraRigaSync({cartellaStore: store, sessionId, record: headerRecord(sessionId, startedAt)});
    sessionStore.registraRigaSync({
      cartellaStore: store, sessionId,
      record: {tipo: 'checkpoint', versioneGiro: 1, fase: 'ripresa', storia: [{role: 'user', content: `task ${i}`}], recordCompattazione: null},
    });
    // ~1 MB of small conversation events per journal: what the replay parses line by line today.
    const chunk = 'x'.repeat(160);
    let bytes = statSync(join(store, `${sessionId}.jsonl`)).size;
    for (let seq = 1; bytes < TARGET_JOURNAL_BYTES && seq < 200_000; seq += 1) {
      sessionStore.registraRigaSync({
        cartellaStore: store, sessionId,
        record: {type: 'TEXT_MESSAGE_CONTENT', delta: `${chunk}#${seq}`, _sequenza: seq},
      });
      bytes = statSync(join(store, `${sessionId}.jsonl`)).size;
    }
  }
  return store;
}

/* Counting deps: the real fs, wrapped, so the probe's byte budget is visible. */
function countingDeps() {
  const fsp = import('node:fs/promises');
  const counters = {bytesRead: 0, statCalls: 0};
  const deps = {
    counters,
    async statFn(path) { counters.statCalls += 1; return (await fsp).stat(path); },
    async readFileFn(path, encoding) { const body = await (await fsp).readFile(path, encoding); counters.bytesRead += Buffer.byteLength(String(body), 'utf8'); return body; },
  };
  return deps;
}

async function replayRows(store) {
  const registry = sessionRegistryModule.createSessionRegistry({cartellaStore: store});
  await registry.ripristina();
  return normalizeSessionSummaries(registry.elenca());
}

async function median(work, runs) {
  const samples = [];
  for (let i = 0; i < runs; i += 1) samples.push(await work(i));
  samples.sort((a, b) => a.ms - b.ms);
  return {median: samples[Math.floor(samples.length / 2)], min: samples[0], max: samples[samples.length - 1]};
}

const root = mkdtempSync(join(tmpdir(), 'talos-c4r-bench-'));
try {
  const store = buildFixture(root);
  const dataRoot = join(root, 'data');
  mkdirSync(dataRoot, {recursive: true});
  let journalTotal = 0;
  for (const entry of readdirSync(store)) if (entry.endsWith('.jsonl')) journalTotal += statSync(join(store, entry)).size;

  const before = PHASE === 'before' || PHASE === 'both'
    ? await median(async () => {
      const t0 = performance.now();
      const rows = await replayRows(store);
      return {ms: performance.now() - t0, rows: rows.length};
    }, RUNS)
    : null;

  let after = null;
  if (PHASE === 'both') {
    const listIndex = await import(pathToFileURL(join(REPO_ROOT, 'cli', 'src', 'sessions', 'list-index.ts')).href);
    const probeDeps = countingDeps();
    const cold = await listIndex.probeSessionListIndex({dataRoot, sessionsRoot: store, repoRoot: REPO_ROOT, deps: probeDeps});
    if (cold.state !== 'stale') throw new Error(`expected a stale/absent probe on a fresh fixture, got ${cold.state}`);
    await listIndex.commitSessionListIndex({dataRoot, sessionsRoot: store, repoRoot: REPO_ROOT, stamp: cold.stamp, rows: await replayRows(store)});
    after = await median(async () => {
      const deps = countingDeps();
      const t0 = performance.now();
      const view = await listIndex.probeSessionListIndex({dataRoot, sessionsRoot: store, repoRoot: REPO_ROOT, deps});
      if (view.state !== 'fresh') throw new Error(`expected a fresh probe, got ${view.state}`);
      return {ms: performance.now() - t0, rows: view.rows.length, bytes: deps.counters.bytesRead};
    }, RUNS);
  }

  const fmt = (r) => `${r.median.ms.toFixed(1)} ms (min ${r.min.ms.toFixed(1)}, max ${r.max.ms.toFixed(1)})`;
  console.log(`fixture: ${SESSIONS} sessions, journals total ${(journalTotal / 1024 / 1024).toFixed(1)} MB`);
  if (before) console.log(`BEFORE (ripristina+elenca+normalize, per run): ${fmt(before)} — rows ${before.median.rows}`);
  if (after) {
    console.log(`AFTER  (fresh index probe, per run):           ${fmt(after)} — rows ${after.median.rows}`);
    console.log(`AFTER bytes read per run (metadata only):      ${(after.median.bytes / 1024).toFixed(1)} KB of ${(journalTotal / 1024).toFixed(0)} KB of journals`);
  }
} finally {
  rmSync(root, {recursive: true, force: true, maxRetries: 5});
}
