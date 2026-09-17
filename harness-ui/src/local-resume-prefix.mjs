/** Comparisons deliberately contain no original values or token IDs. */
export function commonPrefix(a, b) {
  let i = 0;
  while (i < Math.min(a.length, b.length) && a[i] === b[i]) i++;
  return i;
}
export function byteComparison(a, b) {
  const aa = Buffer.from(a), bb = Buffer.from(b);
  const common = commonPrefix(aa, bb), equal = common === aa.length && common === bb.length;
  return { previousBytes: aa.length, currentBytes: bb.length, commonBytes: common, firstDifferentByte: equal ? null : common, equal };
}
const encoded = v => JSON.stringify(v) ?? 'undefined';
const SAFE_FIELDS = ['role', 'content', 'tool_calls', 'tool_call_id', 'name', 'reasoning_content', 'reasoning'];
const INPUT_FIELDS = ['model', 'tools', 'tool_choice', 'messages', 'chat_template', 'chat_template_kwargs', 'reasoning_format', 'reasoning_effort', 'add_generation_prompt', 'parallel_tool_calls'];
export function compareRequestBodies(previousRaw, currentRaw) {
  const result = { wireJson: byteComparison(previousRaw, currentRaw), fields: {}, firstChangedMessage: null, commonPromptTokens: null, renderedPrompt: null };
  let before, after;
  try { before = JSON.parse(previousRaw); after = JSON.parse(currentRaw); } catch { result.invalidJson = true; return result; }
  for (const field of INPUT_FIELDS) result.fields[field] = byteComparison(encoded(before?.[field]), encoded(after?.[field]));
  if (Array.isArray(before?.messages) && Array.isArray(after?.messages)) {
    const max = Math.max(before.messages.length, after.messages.length);
    for (let i = 0; i < max; i++) {
      const a = before.messages[i], b = after.messages[i];
      if (encoded(a) === encoded(b)) continue;
      const changedFields = SAFE_FIELDS.filter(key => encoded(a?.[key]) !== encoded(b?.[key]));
      result.firstChangedMessage = {
        index: i, change: a === undefined ? 'appended' : b === undefined ? 'removed' : 'modified',
        roleBefore: ['system', 'developer', 'user', 'assistant', 'tool'].includes(a?.role) ? a.role : null,
        roleAfter: ['system', 'developer', 'user', 'assistant', 'tool'].includes(b?.role) ? b.role : null,
        fields: changedFields.length ? changedFields : ['other-or-key-order'],
        serializedMessage: byteComparison(encoded(a), encoded(b)),
        content: byteComparison(encoded(a?.content), encoded(b?.content)),
        plainTextContent: typeof a?.content === 'string' && typeof b?.content === 'string' ? byteComparison(a.content, b.content) : null,
      };
      break;
    }
  }
  return result;
}

export function compareRenderedPrompts(previous, current) {
  if (typeof previous?.prompt !== 'string' || typeof current?.prompt !== 'string') throw new TypeError('Rendered prompts required');
  const valid = x => Array.isArray(x) && x.every(t => Number.isSafeInteger(t) && t >= 0);
  if (!valid(previous.tokens) || !valid(current.tokens)) throw new TypeError('Observed integer token arrays required');
  return {
    renderedPrompt: byteComparison(previous.prompt, current.prompt),
    commonPromptTokens: commonPrefix(previous.tokens, current.tokens),
    previousPromptTokens: previous.tokens.length, currentPromptTokens: current.tokens.length,
    interpretation: 'Reconstructed input prefix, not server-observed KV reuse; excludes previous generated tokens.',
  };
}
