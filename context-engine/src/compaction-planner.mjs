import { ContextEngineError, parseContextSettings } from './contracts.mjs';
import { validateContextProfile } from './profiles.mjs';

export function computeContextBudget(options) {
  const profile = validateContextProfile(options);
  const settings = parseContextSettings(options.settings ?? {});
  const inputLimit = profile.windowTokens - profile.responseReserve - profile.safetyMarginTokens;
  const inputTokens = options.inputTokens ?? 0;
  if (!Number.isInteger(inputTokens) || inputTokens < 0) throw new ContextEngineError('Conteggio del contesto non valido.', 'CTX_INVALID_PROFILE');
  return { ...profile, inputLimit, inputTokens, headroom: inputLimit - inputTokens, targetTokens: Math.floor(inputLimit * settings.targetRatio), triggerTokens: Math.floor(inputLimit * settings.triggerRatio), fits: inputTokens <= inputLimit, shouldPrepare: inputTokens >= inputLimit * settings.triggerRatio };
}

export function selectClosedPrefix(records, { retainRecentTurns = 2, force = false } = {}) {
  const userIndices = records.flatMap((record, index) => record.message.role === 'user' ? [index] : []);
  const desired = userIndices.length > retainRecentTurns ? userIndices[userIndices.length - retainRecentTurns] ?? records.length : 0;
  const pending = new Set();
  const boundaries = [];
  let hasConversation = false;
  for (let index = 0; index < records.length; index++) {
    const message = records[index].message;
    if (!['system', 'developer'].includes(message.role)) hasConversation = true;
    for (const call of message.tool_calls ?? []) pending.add(call.id);
    if (message.role === 'tool') pending.delete(message.tool_call_id);
    if (pending.size === 0 && hasConversation) boundaries.push(index + 1);
  }
  let cut = boundaries.filter(value => value <= desired).at(-1) ?? 0;
  if (!cut && force) cut = boundaries.filter(value => value < records.length).at(-1) ?? 0;
  return { prefix: records.slice(0, cut), tail: records.slice(cut), pendingCalls: [...pending], coveredThrough: records[cut - 1]?.sequence ?? 0 };
}

export function planCompaction(records, options) {
  const selection = selectClosedPrefix(records, options);
  const budget = computeContextBudget(options);
  // Segment size is a conservative planning estimate, checked by the real counter before inference.
  const maxSegmentChars = Math.max(256, Math.floor((budget.inputLimit - 1024) * 2));
  const segments = [];
  let text = ''; let sourceIds = [];
  const flush = () => { if (text) segments.push({ id: `segment-${segments.length}`, text, sourceIds: [...new Set(sourceIds)] }); text = ''; sourceIds = []; };
  for (const record of selection.prefix) {
    if (['system', 'developer'].includes(record.message.role)) continue;
    const content = record.message.content;
    const plain = typeof content === 'string' ? content : Array.isArray(content) ? content.filter(p => ['text', 'input_text', 'output_text'].includes(p?.type) && typeof p.text === 'string').map(p => p.text).join('\n') : '';
    const body = `${record.id} (${record.message.role})\n${plain}${record.message.tool_calls?.length ? '\nTool calls: ' + JSON.stringify(record.message.tool_calls) : ''}\n`;
    let offset = 0;
    while (offset < body.length) {
      const remaining = maxSegmentChars - text.length;
      let length = Math.min(remaining, body.length - offset);
      if (length > 1 && /[\uD800-\uDBFF]/u.test(body[offset + length - 1])) length--;
      if (!length) { flush(); continue; }
      text += body.slice(offset, offset + length); sourceIds.push(record.id); offset += length;
      if (text.length >= maxSegmentChars - 1) flush();
    }
  }
  flush();
  return { ...selection, segments, maxSegmentChars, budget };
}
