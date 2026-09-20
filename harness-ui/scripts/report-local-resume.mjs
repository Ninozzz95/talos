import { readFile, stat, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';

const number = x => typeof x === 'number' && Number.isFinite(x) && x >= 0 ? x : null;
const difference = (a, b) => number(a) !== null && number(b) !== null && a >= b ? a - b : null;
const oneOf = (x, values) => values.includes(x) ? x : null;
const hex = x => typeof x === 'string' && /^[a-f0-9]{64}$/u.test(x) ? x : null;
const byteStats = x => x && typeof x === 'object' ? { previousBytes: number(x.previousBytes), currentBytes: number(x.currentBytes), commonBytes: number(x.commonBytes), firstDifferentByte: number(x.firstDifferentByte), equal: typeof x.equal === 'boolean' ? x.equal : null } : null;
const safePrefix = x => {
  if (!x || typeof x !== 'object') return null;
  const fields = {};
  for (const k of ['model', 'tools', 'tool_choice', 'messages', 'chat_template', 'chat_template_kwargs', 'reasoning_format', 'reasoning_effort', 'add_generation_prompt', 'parallel_tool_calls']) fields[k] = byteStats(x.fields?.[k]);
  const m = x.firstChangedMessage;
  return { wireJson: byteStats(x.wireJson), fields, firstChangedMessage: m ? { index: number(m.index), change: oneOf(m.change, ['appended', 'removed', 'modified']), roleBefore: oneOf(m.roleBefore, ['system', 'developer', 'assistant', 'user', 'tool']), roleAfter: oneOf(m.roleAfter, ['system', 'developer', 'assistant', 'user', 'tool']), fields: Array.isArray(m.fields) ? m.fields.filter(k => ['role', 'content', 'tool_calls', 'tool_call_id', 'name', 'reasoning_content', 'reasoning', 'other-or-key-order'].includes(k)) : [], serializedMessage: byteStats(m.serializedMessage), content: byteStats(m.content), plainTextContent: byteStats(m.plainTextContent) } : null, commonPromptTokens: null };
};
const requestId = x => typeof x === 'string' && /^r\d{5}$/u.test(x) ? x : null;

export function buildResumeReport(records) {
  const requests = new Map(), operations = new Map(), lifecycle = [], environments = [];
  let incompleteLines = 0, boot = null, limitReached = false, finalSink = null;
  for (const e of records) {
    if (e?.schema === 'talos.local-resume.v1' && typeof e.bootId === 'string') {
      if (boot !== null && boot !== e.bootId) throw new Error('multiple-boots-require-separate-reports');
      boot = e.bootId;
    }
  }
  for (const e of records) {
    if (!e || e.schema !== 'talos.local-resume.v1') { incompleteLines++; continue; }
    if (e.type === 'recording-limit') limitReached = true;
    if (e.type === 'recorder-flush') finalSink = { queuedBytes: number(e.sink?.queuedBytes), reservedBytes: number(e.sink?.reservedBytes), dropped: number(e.sink?.dropped), errors: number(e.sink?.errors) };
    if (e.type === 'environment') {
      const sources = {};
      for (const name of ['server', 'supervisor', 'adapter', 'ownerAdapter', 'registry', 'ownerKernel', 'recorder', 'observer', 'prefix']) {
        sources[name] = hex(e.sources?.[name]?.sha256);
      }
      environments.push({ node: /^v\d+\.\d+\.\d+$/u.test(e.node) ? e.node : null, platform: oneOf(e.platform, ['win32', 'linux', 'darwin']), arch: oneOf(e.arch, ['x64', 'arm64', 'ia32']), logicalCpus: number(e.logicalCpus), ramBytes: number(e.ramBytes), sourceSha256: sources });
    }
    if (e.type === 'agent-event' && e.operationId) {
      const seen = operations.get(e.operationId) ?? [];
      seen.push({ type: oneOf(e.eventType, ['RunStarted', 'RunFinished', 'RunError', 'TextMessageStart', 'ReasoningMessageStart', 'TextMessageContent', 'ReasoningMessageContent', 'ToolCallStart', 'ToolCallEnd', 'ToolCallResult']), atMs: number(e.atMs) });
      operations.set(e.operationId, seen);
    }
    if (['load-start', 'load-end', 'stop-start', 'stop-end', 'process-spawn', 'process-close', 'process-error'].includes(e.type)) {
      const flags = {};
      for (const flag of ['-c', '-ngl', '--cache-type-k', '--cache-type-v', '--spec-type', '--parallel', '-np', '--keep', '--cache-reuse', '--cache-ram']) flags[flag] = typeof e.flags?.[flag] === 'string' && /^(?:-?\d+|f16|f32|bf16|q8_0|q4_0|q4_1|ngram-mod|none|auto|all)$/u.test(e.flags[flag]) ? e.flags[flag] : null;
      lifecycle.push({ type: e.type, flags, atMs: number(e.atMs), pid: number(e.process?.pid ?? e.runtime?.pid), generation: number(e.process?.generation ?? e.runtime?.generation), requestedContextTokens: number(e.requestedContextTokens), state: oneOf(e.runtime?.state, ['unavailable', 'detected', 'loading', 'ready', 'stopping', 'failed']) });
    }
    const id = requestId(e.requestId);
    if (!id) continue;
    const r = requests.get(id) ?? { requestId: id, start: null, headers: null, end: null, observed: null, error: false };
    if (e.type === 'request-start') r.start = e;
    if (e.type === 'response-headers') r.headers = e;
    if (e.type === 'stream-observation') r.observed = e.observation;
    if (e.type === 'request-end') { r.end = e; r.observed = e.observation; }
    if (e.type === 'request-error') r.error = true;
    requests.set(id, r);
  }
  const rows = [...requests.values()].map(({ requestId, start: s, headers: h, end, observed: o, error }) => {
    const reported = name => number(o?.server?.[name]);
    const firstBackendContent = operations.get(s?.operationId)?.find(e => e.type === 'TextMessageContent')?.atMs;
    return {
      requestId, route: oneOf(s?.route, ['owner-transport', 'llama-adapter', 'context-counter', 'supervisor-unattributed']),
      entry: oneOf(s?.entry, ['resume', 'avvia', 'avviaLibero', 'fork']), sessionKey: hex(s?.sessionKey),
      endpoint: oneOf(s?.endpoint, ['/v1/chat/completions', '/completion', '/v1/completions', '/props', '/tokenize', '/apply-template']),
      bodyBytes: number(s?.snapshot?.bodyBytes), requestModelKey: hex(s?.snapshot?.requestModelKey),
      processGeneration: number(s?.runtime?.generation), pid: number(s?.runtime?.pid),
      operationEntryToTransportCallMs: difference(s?.callMs, s?.operationEntryMs),
      diagnosticSnapshotMs: number(s?.snapshotMs), sendToHeadersMs: difference(h?.headersMs, s?.sendMs),
      sendToFirstConsumedChunkMs: difference(o?.firstChunkMs, s?.sendMs),
      sendToFirstModelDeltaMs: difference(o?.firstModelDeltaMs, s?.sendMs),
      sendToFirstReasoningDeltaMs: difference(o?.firstReasoningDeltaMs, s?.sendMs),
      sendToFirstContentDeltaMs: difference(o?.firstContentDeltaMs, s?.sendMs),
      operationEntryToFirstBackendContentMs: difference(firstBackendContent, s?.operationEntryMs),
      frontendVisibleMs: null, requestBuildAloneMs: null, serverQueueMs: null,
      sendToStreamEndMs: difference(o?.endMs, s?.sendMs),
      serverPromptN: reported('timings.prompt_n'), serverPromptMs: reported('timings.prompt_ms'),
      serverCacheN: reported('timings.cache_n'), progressCacheN: reported('prompt_progress.cache'),
      progressTotalN: reported('prompt_progress.total'), progressProcessedN: reported('prompt_progress.processed'),
      progressTimeMs: reported('prompt_progress.time_ms'),
      serverPredictedN: reported('timings.predicted_n'), serverPredictedMs: reported('timings.predicted_ms'),
      serverPredictedPerSecond: reported('timings.predicted_per_second'),
      tokensCachedField: reported('tokens_cached'), tokensEvaluatedField: reported('tokens_evaluated'),
      usagePromptTokens: reported('usage.prompt_tokens'), usageCachedTokens: reported('usage.prompt_tokens_details.cached_tokens'),
      slotObserved: reported('id_slot'), slotRequested: number(s?.snapshot?.controls?.id_slot),
      cachePromptRequested: typeof s?.snapshot?.controls?.cache_prompt === 'boolean' ? s.snapshot.controls.cache_prompt : null,
      actualContextTokens: reported('default_generation_settings.n_ctx'), totalSlots: reported('total_slots'),
      finishReason: oneOf(o?.finishReason, ['stop', 'length', 'tool_calls', 'function_call', 'content_filter', 'other']),
      doneMarker: o?.doneMarker === true, outcome: error ? 'request-error' : oneOf(o?.outcome, ['eof', 'cancelled', 'transport-error']) ?? 'not-observed',
      completedModelTurn: null,
      malformedPackets: number(o?.malformedPackets), oversizedFrames: number(o?.oversizedFrames),
      capture: oneOf(s?.snapshot?.capture, ['not-requested', 'queued-private', 'outside-selected-session', 'unsupported-or-over-limit', 'invalid-json', 'dropped', 'write-error', 'observer-failed']),
      previousRequestId: requestId && /^r\d{5}$/u.test(s?.snapshot?.previousRequestId ?? '') ? s.snapshot.previousRequestId : null,
      prefixComparison: safePrefix(s?.snapshot?.prefix), commonPromptTokens: null,
      serverError: o?.serverError === true, nativeStop: typeof o?.nativeStop === 'boolean' ? o.nativeStop : null,
      observerFailed: o?.observerFailed === true, unterminatedFrame: o?.unterminatedFrame === true,
    };
  });
  return {
    schema: 'talos.local-resume-report.v1', environments, lifecycle, rows, incompleteLines, captureHealth: { limitReached, lastFlushSnapshot: finalSink },
    notes: [
      'One run directory only; monotonic times must not be subtracted across process boots.',
      'operationEntryToTransportCallMs includes context work, readiness and orchestration; it is not pure request construction.',
      'Content deltas may contain reasoning markup. Backend content delivery is not frontend paint.',
      'Native counters keep their field names. tokens_cached is not automatically classified as reused prompt tokens.',
      'EOF and [DONE] do not alone establish a successful complete model turn. cancelled means consumer cancelled the body, including adapter cleanup after DONE; it does not by itself mean user stop.',
      'Missing model metrics and historical tokenized prefixes are null, never estimates.',
      'Only allowlisted metadata is exported. Private request files and HMAC keys are excluded.',
    ],
  };
}

export async function readResumeEvents(directory) {
  const path = join(directory, 'events.jsonl');
  if ((await stat(path)).size > 128 * 1024 * 1024) throw new Error('diagnostic-log-too-large');
  return (await readFile(path, 'utf8')).split('\n').filter(Boolean).map(line => { try { return JSON.parse(line); } catch { return null; } });
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const [directory, output] = process.argv.slice(2);
  if (!directory || !output) { console.error('Usage: node scripts/report-local-resume.mjs RUN_DIRECTORY OUTPUT.json'); process.exitCode = 2; }
  else {
    try { await writeFile(output, JSON.stringify(buildResumeReport(await readResumeEvents(directory)), null, 2) + '\n', { mode: 0o600, flag: 'wx' }); console.log('Redacted report written. Private captures were not exported.'); }
    catch { console.error('Report not written: verify paths, size and permissions; output must not exist.'); process.exitCode = 1; }
  }
}
