/*
 * 05/11/2026 — PROGRAM RUNNER, BLOCK 1 of decision 234: the sandbox (recinto.mjs) + the keyed journal (giornale-chiave.mjs).
 *
 * For every agent() call of the program: the key is computed in CALL order (journal.beginRun().nextKey), the journal is
 * looked up; a hit is served with replayed: true and costs nothing (no spend reservation); a miss reserves spend, calls the
 * host, and records the result only when it succeeded. A failure to record never fails the run: it is counted in
 * usage.journal.recordFailures, written in the diagnostics, and the next run goes live for that call. Every diagnostic has
 * `message` (for the log: may hold absolute paths and fs text) and `safeMessage` (fixed English, no path: the one to give the model).
 *
 * The host receives (prompt, options, { signal, key, index, phase, label }): the key lets block 2 attach the call to its
 * activity; the signal aborts when the run ends (stop, cap, error), so the host can cancel its model call.
 *
 * REVIEW CURES (05/11): the live value is passed through the stable JSON before it is recorded and returned, so a live run and
 * a resumed run hand the program the SAME value ({z:1,a:2} came back as [z,a] live and [a,z] on replay; undefined, -0 and a
 * Date made every record fail). Two runs of this process asking the same key at once share ONE live call (the second waits
 * for the first; if the first fails, the second goes live itself): before, both paid.
 */
import { createKeyedJournal, safeDiagnosticMessage } from './giornale-chiave.mjs';
import { jsonStabile } from './json-stabile.mjs';
import { WorkflowProgramError, eseguiNelRecinto } from './recinto.mjs';

/** Live calls in flight in this process, by data root + workflow + key. */
const inFlight = new Map();

export async function eseguiProgramma({ source, args, workflowDataRoot, workflowId, runId, host, caps, spend, signal, onEvent, maxResultBytes } = {}) {
  if (!host || typeof host.agent !== 'function') {
    throw new WorkflowProgramError('WORKFLOW_PROGRAM_INVALID_HOST', 'host.agent(prompt, options, ctx) is required');
  }
  const journal = createKeyedJournal({ workflowDataRoot, workflowId, ...(maxResultBytes ? { maxResultBytes } : {}) });
  await journal.sweepTemporaries();
  const keys = journal.beginRun(runId);
  const counts = { replayed: 0, live: 0, recordFailures: 0, shared: 0 };
  const extraDiagnostics = [];

  const live = async (prompt, options, ctx, key) => {
    await ctx.reserve();
    const result = await host.agent(prompt, options, { signal: ctx.signal, key, index: ctx.index, phase: ctx.phase, label: ctx.label });
    counts.live += 1;
    const costUsd = typeof result?.costUsd === 'number' ? result.costUsd : undefined;
    let value;
    // A value JSON cannot hold fails the call, and the call still cost what the host reported.
    try { value = JSON.parse(jsonStabile(result?.value)); } catch (error) { throw Object.assign(error, { costUsd }); }
    try { await journal.record(key, { value, costUsd, runId }); } catch (error) {
      counts.recordFailures += 1;
      const code = typeof error?.code === 'string' ? error.code : 'WORKFLOW_REPLAY_RECORD_FAILED';
      if (extraDiagnostics.length < 100) extraDiagnostics.push({ code, key, message: String(error?.message ?? error), safeMessage: safeDiagnosticMessage(code) });
    }
    return { value, costUsd };
  };

  const agent = async (prompt, options, ctx) => {
    const key = keys.nextKey(prompt, options);
    const hit = await journal.lookup(key);
    if (hit) {
      counts.replayed += 1;
      return { value: hit.value, costUsd: 0, replayed: true };
    }
    const slot = `${workflowDataRoot}\0${workflowId}\0${key}`;
    const other = inFlight.get(slot);
    if (other) {
      try {
        const value = await other;
        counts.shared += 1;
        return { value, costUsd: 0, replayed: true };
      } catch { /* the first caller failed: this one goes live itself */ }
    }
    const mine = live(prompt, options, ctx, key);
    const shared = mine.then((r) => r.value);
    shared.catch(() => {});
    inFlight.set(slot, shared);
    try {
      const { value, costUsd } = await mine;
      return { value, costUsd, replayed: false };
    } finally {
      if (inFlight.get(slot) === shared) inFlight.delete(slot);
    }
  };

  const outcome = await eseguiNelRecinto({ source, args, agent, spend, caps, signal, onEvent });
  return { ...outcome, usage: { ...outcome.usage, journal: { ...counts } }, diagnostics: [...journal.diagnostics, ...extraDiagnostics] };
}
