/*
 * 05/11/2026 — KEYED JOURNAL of a Workflow program, BLOCK 1 of decision 234 («one engine, two doors»).
 *
 * Every agent() call of a program gets a key = sha256 of the canonical JSON of [prompt, options without label/phase, repetition
 * index] (json-stabile.mjs). A later run of the same workflow — after a crash, a restart, or an edit in the MIDDLE of
 * the program — is served from the journal for EVERY call whose key did not change, not only for a prefix. That is the
 * difference from an ordered event history (Temporal, DBOS and Restate replay by position and fail on a reordered program);
 * it is the LangGraph task cache shape (libs/langgraph/langgraph/types.py:531-539 CachePolicy.key_func, default hash of the
 * input; libs/checkpoint/langgraph/cache/base/__init__.py and _cache.py:26 keyed by (namespace, key)), applied to agent calls.
 *
 * - The repetition index tells apart identical calls inside one run (a loop that asks the same thing three times).
 * - label and phase only name the call on screen: renaming them never forces a live call.
 * - Only SUCCESSFUL results are recorded: a failed call goes live again next time.
 *
 * STORAGE, reusing what the Workflow store already trusts:
 *   value  → the content-addressed store (result-store.mjs: cas/sha256/xx/<hex>, verified on every read);
 *   index  → <root>/replay/<workflowId>/<key hex[0:2]>/<key hex>.json, schema talos.workflow-replay.v1, published with
 *            pubblicaUnaVolta (link from a synced temporary, or exclusive create): the FIRST writer wins, nothing is overwritten.
 *   The value is written before the index, so a crash leaves at worst an orphan value, never an index without its value.
 *   The store's startup scan reads definitions/ and runs/ only (tested: replay/ leaves it 'ready' with no diagnostic).
 *   Only damaged files (self-repair below) and stale temporaries are deleted automatically in this block: there is no
 *   retention yet; the index is per workflow, so deleting a workflow can drop its folder.
 *
 * KNOWN LIMITS, declared for block 2 (review GIORNALE items 6 and 7):
 *   - There is no «fresh» / no-cache door yet: a recorded answer is served until its file is removed. LangGraph exposes the
 *     same need as a per-task clear_cache(cache) (reference.langchain.com, langgraph func _TaskFunction.clear_cache, read
 *     05/11/2026). The default model is not in the key: if the default changes, old answers still match.
 *   - Sharing of a live call between two runs asking the same key at once is per PROCESS only (esegui-programma.mjs):
 *     two processes on the same data root can both pay for it; the first index published wins, the other is 'already'.
 *
 * A damaged value, an index for another key or an unreadable file is a MISS with a diagnostic, never a wrong answer.
 *
 * REVIEW CURES (05/11, each reproduced first):
 *   - Keys and recorded values use the STABLE JSON of json-stabile.mjs: canonical-json.mjs refused U+FFFF, U+FDD0..FDEF and
 *     lone surrogates, so a prompt carrying a damaged file threw before the host was called; {a: undefined}, -0 and a Date
 *     made every record fail. For every value canonical-json accepted the text is identical, so old keys still match.
 *   - SELF-REPAIR: a damaged index (truncated by a crash on the no-link path, or naming another key or workflow) and a value
 *     whose bytes no longer match their hash are REMOVED, so the next record writes them again; before, every resumed run
 *     paid for that call live, forever. Only files older than REPAIR_AFTER_MS are removed: a younger one may be a writer of
 *     the no-link path (pubblica-una-volta.mjs) still between its exclusive create and its write.
 *   - workflowId is lowercase only and never a Windows device name: 'W1' and 'w1' shared one folder on Windows.
 *   - sweepTemporaries() removes index and value temporaries a crash left in temp/replay and temp/cas (older than an hour).
 *
 * THIRD REVIEW CURES (06/11): only ENOENT is a missing index, any other read error is unreadable (never 'already', never
 * removed); a future mtime counts as old; every diagnostic carries a path-free safeMessage beside its log message.
 */
import { randomUUID } from 'node:crypto';
import { mkdir, open, readFile, readdir, realpath, stat, unlink } from 'node:fs/promises';
import { isAbsolute, join, relative } from 'node:path';

import { improntaStabile, jsonStabile } from './json-stabile.mjs';
import { pubblicaUnaVolta } from './pubblica-una-volta.mjs';
import { putResultBytes, readResultBytes } from './result-store.mjs';

export const REPLAY_SCHEMA = 'talos.workflow-replay.v1';
export const DEFAULT_REPLAY_MAX_RESULT_BYTES = 256 * 1024;
const MAX_INDEX_BYTES = 16 * 1024;
const MAX_DIAGNOSTICS = 100;
// Lowercase only (Windows folds case), never a device name (con, nul, com1...), never a trailing dot (Windows drops it).
const WORKFLOW_ID = /^(?!(?:con|prn|aux|nul|com\d|lpt\d)(?:\.|$))[a-z0-9][a-z0-9._-]{0,127}(?<!\.)$/u;
export const REPAIR_AFTER_MS = 60_000;
export const MTIME_LEAD_MS = 2_000;
const TEMPORARY_MAX_AGE_MS = 60 * 60 * 1000;
const KEY = /^sha256:([0-9a-f]{64})$/u;
// Review 3, note 4: the path-free form of each diagnostic, for block 2 to hand to the model (message keeps paths, for the log).
const SAFE_MESSAGES = Object.freeze({
  WORKFLOW_REPLAY_INDEX_INVALID: 'A saved answer index was damaged; the call ran live.',
  WORKFLOW_REPLAY_INDEX_UNREADABLE: 'A saved answer index could not be read; the call ran live.',
  WORKFLOW_REPLAY_REPAIRED: 'A damaged saved answer was removed.',
  WORKFLOW_RESULT_CORRUPT: 'A saved answer was damaged; the call ran live.',
  WORKFLOW_RESULT_REPAIRED: 'A damaged saved answer was replaced with the right bytes.',
  WORKFLOW_RESULT_NOT_FOUND: 'A saved answer was missing; the call ran live.',
  WORKFLOW_LIMIT_EXCEEDED: 'An answer was too large to save for replay.',
  WORKFLOW_STORE_IO: 'The saved answers could not be read or written; the call ran live.',
  WORKFLOW_STORE_LOCATION_INVALID: 'A folder of the saved answers points outside their folder; it was left alone.',
});
/** A fixed English text for a journal diagnostic code: never a path, never text read from disk or from an fs error. */
export const safeDiagnosticMessage = (code) => SAFE_MESSAGES[code] ?? 'The saved answers had a problem; the call ran live.';

export class WorkflowReplayError extends Error {
  constructor(message, code = 'WORKFLOW_REPLAY_INVALID') {
    super(message);
    this.name = 'WorkflowReplayError';
    this.code = code;
  }
}

function keyOptions(options) {
  if (options === undefined || options === null) return {};
  if (typeof options !== 'object' || Array.isArray(options)) throw new WorkflowReplayError('agent options must be an object');
  const { label: _label, phase: _phase, ...rest } = options;
  return rest;
}

/** The key of one agent() call: the stable hash of [prompt, options without label/phase, repetition index]. */
export function chiaveDellaChiamata(prompt, options, rep) {
  if (typeof prompt !== 'string') throw new WorkflowReplayError('the prompt of a call must be a string');
  if (!Number.isSafeInteger(rep) || rep < 0) throw new WorkflowReplayError('the repetition index must be an integer >= 0');
  return improntaStabile([prompt, keyOptions(options), rep]);
}

function parseKey(key) {
  const m = typeof key === 'string' ? KEY.exec(key) : null;
  if (!m) throw new WorkflowReplayError('a journal key must be sha256:<64 lowercase hex>');
  return m[1];
}

export function createKeyedJournal({ workflowDataRoot, workflowId, maxResultBytes = DEFAULT_REPLAY_MAX_RESULT_BYTES } = {}) {
  if (typeof workflowDataRoot !== 'string' || !isAbsolute(workflowDataRoot)) throw new WorkflowReplayError('workflowDataRoot must be an absolute path');
  if (typeof workflowId !== 'string' || !WORKFLOW_ID.test(workflowId)) {
    throw new WorkflowReplayError('workflowId must be 1-128 lowercase letters, digits, dot, dash or underscore, starting with a letter or digit, not ending with a dot, and not a Windows device name');
  }
  if (!Number.isSafeInteger(maxResultBytes) || maxResultBytes < 1) throw new WorkflowReplayError('maxResultBytes must be a positive integer');
  const folder = join(workflowDataRoot, 'replay', workflowId);
  const tempFolder = join(workflowDataRoot, 'temp', 'replay');
  const casTempFolder = join(workflowDataRoot, 'temp', 'cas');
  const diagnostics = [];
  let valuesRepaired = 0;
  const diagnose =(code, key, message) => {
    // 19/11/2026 (0.2.4 block 4, item 3): the same obstacle read twice in one run (a folder at the index path: lookup, then
    // record) is ONE diagnostic, not one per read (measured: 3 per run with the runner's own).
    if (diagnostics.some((d) => d.code === code && d.key === key && d.message === message)) return;
    if (diagnostics.length < MAX_DIAGNOSTICS) diagnostics.push({ code, key, message, safeMessage: safeDiagnosticMessage(code) });
  };
  const indexPath = (hex) => join(folder, hex.slice(0, 2), `${hex}.json`);
  const casPath = (sha256) => join(workflowDataRoot, 'cas', 'sha256', sha256.slice(7, 9), sha256.slice(7));
  // Removes a damaged file so the next record can write it again; a young one may still be being written: left alone.
  const repair = async (path, key) => {
    try {
      // Review 3, note 2: an mtime in the future (clock moved back, copied file) is a negative age: old, not young.
      // 17/11/2026 (PR 96, list item 96): Date.now() is a whole millisecond and the file system keeps the fraction, so a file
      // written just now is up to ~2 ms "in the future" (measured on NTFS: 1916 of 2000, at most 1.71 ms) and was removed as old
      // while its writer could still be writing it. A lead of up to MTIME_LEAD_MS is the clock's grain: still young.
      const age = Date.now() - (await stat(path)).mtimeMs;
      if (age > -MTIME_LEAD_MS && age < REPAIR_AFTER_MS) return false;
      await unlink(path);
      diagnose('WORKFLOW_REPLAY_REPAIRED', key, `removed a damaged journal file: ${path}`);
      return true;
    } catch { return false; }
  };

  // The index of a key, read and checked: { index } when it is valid for this key and workflow, { invalid } with the reason
  // when it is not (lookup and record both refuse to trust it), { missing } only when there is none (ENOENT).
  // Review 3, LOW 1: any other read error (EISDIR, EPERM, EACCES, EBUSY) is { invalid, unreadable }: the index may be valid
  // behind a lock, so it is neither trusted, nor answered 'already', nor removed (Hermes agent/vault_keychain.py:83-88:
  // FileNotFoundError -> None, any other OSError -> raise).
  async function readIndex(hex, key) {
    let raw;
    try { raw = await readFile(indexPath(hex)); } catch (error) {
      if (error?.code === 'ENOENT') return { missing: true };
      const reason = `cannot read the replay index: ${error?.message ?? error}`;
      diagnose('WORKFLOW_REPLAY_INDEX_UNREADABLE', key, reason);
      return { invalid: reason, unreadable: true };
    }
    let index;
    try {
      if (raw.byteLength > MAX_INDEX_BYTES) throw new Error('index too large');
      index = JSON.parse(raw.toString('utf8'));
    } catch (error) {
      return { invalid: `unreadable replay index: ${error.message}` };
    }
    if (!index || index.schema !== REPLAY_SCHEMA || index.key !== key || index.workflowId !== workflowId
      || typeof index.resultSha256 !== 'string' || !KEY.test(index.resultSha256)) {
      return { invalid: 'the replay index does not belong to this key and workflow' };
    }
    return { index };
  }

  async function lookup(key) {
    const hex = parseKey(key);
    const read = await readIndex(hex, key);
    if (read.missing || read.unreadable) return null;
    if (read.invalid) {
      diagnose('WORKFLOW_REPLAY_INDEX_INVALID', key, read.invalid);
      await repair(indexPath(hex), key);
      return null;
    }
    const { index } = read;
    let bytes;
    try { bytes = await readResultBytes({ workflowDataRoot, sha256: index.resultSha256, maxBytes: maxResultBytes }); } catch (error) {
      diagnose(typeof error?.code === 'string' ? error.code : 'WORKFLOW_STORE_IO', key, error.message);
      // Bytes that no longer match their hash: the value goes first, then its index (never an index without its value).
      if (error?.code === 'WORKFLOW_RESULT_CORRUPT' && await repair(casPath(index.resultSha256), key)) await repair(indexPath(hex), key);
      if (error?.code === 'WORKFLOW_RESULT_NOT_FOUND') await repair(indexPath(hex), key);
      return null;
    }
    let value;
    try { value = JSON.parse(bytes.toString('utf8')); } catch (error) {
      diagnose('WORKFLOW_RESULT_CORRUPT', key, `the recorded value is not JSON: ${error.message}`);
      await repair(indexPath(hex), key);
      return null;
    }
    const costUsd = typeof index.costUsd === 'number' && Number.isFinite(index.costUsd) && index.costUsd >= 0 ? index.costUsd : 0;
    return { value, costUsd };
  }

  /**
   * Records a successful result. 'recorded' when this writer published the index, 'already' when the key holds a VALID index
   * of another writer (first writer wins: its bytes differ from ours in runId and recordedAt, so validity is what is compared,
   * the same check lookup() makes). A taken key whose index is broken (review 2, LOW 5: it answered 'already' and the call
   * could never be replayed): older than REPAIR_AFTER_MS it is removed and published again; younger it may still be being
   * written, so record() rejects with WORKFLOW_REPLAY_INDEX_INVALID and leaves it alone (the caller counts a record failure).
   * A taken key whose index cannot be READ (review 3, LOW 1) rejects with WORKFLOW_REPLAY_INDEX_UNREADABLE, never 'already'.
   */
  async function record(key, { value, costUsd = 0, runId = null } = {}) {
    const hex = parseKey(key);
    const bytes = Buffer.from(jsonStabile(value), 'utf8');
    const stored = await putResultBytes({ workflowDataRoot, bytes, maxBytes: maxResultBytes });
    // 0.2.4 block 4, round 2, item A: a damaged value replaced by the put is counted and said once (hash and reason, no content).
    if (stored.repaired) {
      valuesRepaired += 1;
      diagnose('WORKFLOW_RESULT_REPAIRED', key, `replaced a damaged saved answer with the right bytes: ${stored.sha256}`);
    }
    const index = Buffer.from(`${JSON.stringify({
      schema: REPLAY_SCHEMA,
      workflowId,
      key,
      resultSha256: stored.sha256,
      bytes: stored.bytes,
      costUsd: typeof costUsd === 'number' && Number.isFinite(costUsd) && costUsd >= 0 ? costUsd : 0,
      runId: typeof runId === 'string' ? runId.slice(0, 200) : null,
      recordedAt: new Date().toISOString(),
    })}\n`, 'utf8');
    const finalPath = indexPath(hex);
    await mkdir(join(folder, hex.slice(0, 2)), { recursive: true });
    await mkdir(tempFolder, { recursive: true });
    const temporary = join(tempFolder, `${hex}.${process.pid}.${randomUUID()}.tmp`);
    let handle;
    try {
      handle = await open(temporary, 'wx', 0o600);
      await handle.writeFile(index);
      await handle.sync();
      await handle.close();
      handle = null;
      if (await pubblicaUnaVolta({ temporary, path: finalPath, bytes: index }) !== 'esisteva') return 'recorded';
      const taken = await readIndex(hex, key);
      if (taken.index) return 'already';
      if (taken.unreadable) throw new WorkflowReplayError('the replay index of this key cannot be read', 'WORKFLOW_REPLAY_INDEX_UNREADABLE');
      if (taken.missing) return await pubblicaUnaVolta({ temporary, path: finalPath, bytes: index }) === 'esisteva' ? 'already' : 'recorded';
      diagnose('WORKFLOW_REPLAY_INDEX_INVALID', key, taken.invalid);
      if (!await repair(finalPath, key)) throw new WorkflowReplayError('the replay index of this key is damaged', 'WORKFLOW_REPLAY_INDEX_INVALID');
      return await pubblicaUnaVolta({ temporary, path: finalPath, bytes: index }) === 'esisteva' ? 'already' : 'recorded';
    } finally {
      try { await handle?.close(); } catch { /* already closed */ }
      try { await unlink(temporary); } catch { /* already gone */ }
    }
  }

  /** One run: numbers the repetitions of each (prompt, options) pair in call order. */
  function beginRun(runId) {
    const seen = new Map();
    return {
      runId,
      nextKey(prompt, options) {
        const base = improntaStabile([prompt, keyOptions(options)]);
        const rep = seen.get(base) ?? 0;
        seen.set(base, rep + 1);
        return chiaveDellaChiamata(prompt, options, rep);
      },
    };
  }

  /**
   * Removes temporaries older than an hour (a crash between write and publish leaves them). Never throws. The age is checked
   * on every platform: on Windows an unlink removes even a file another process still has open (libuv src/win/fs.c:1192).
   * 19/11/2026 (0.2.4 block 4, item 2): also temp/cas, the value temporaries of result-store.mjs (measured: 2 left for good
   * after 12 kills), with the same rule.
   */
  async function sweepTemporaries({ now = Date.now() } = {}) {
    let removed = 0;
    for (const temp of [tempFolder, casTempFolder]) {
      let names = [];
      try {
        // Round 2, item D: a temp folder replaced by a junction or a link to elsewhere is not ours to sweep (the same rule as
        // result-store.mjs ensureContainedDirectory); said once in the run.
        const delta = relative(join(await realpath(workflowDataRoot), 'temp'), await realpath(temp));
        if (delta.startsWith('..') || isAbsolute(delta)) {
          diagnose('WORKFLOW_STORE_LOCATION_INVALID', null, `a temporary folder resolves outside the data root, not swept: ${temp}`);
          continue;
        }
        names = await readdir(temp);
      } catch { continue; }
      for (const name of names.filter((n) => n.endsWith('.tmp'))) {
        try {
          const path = join(temp, name);
          if (now - (await stat(path)).mtimeMs > TEMPORARY_MAX_AGE_MS) { await unlink(path); removed += 1; }
        } catch { /* gone or busy: next time */ }
      }
    }
    return removed;
  }

  return { workflowId, lookup, record, beginRun, sweepTemporaries, diagnostics, get valuesRepaired() { return valuesRepaired; } };
}
