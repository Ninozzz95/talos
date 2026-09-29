/** Pure selection and decoding boundary for verified Workflow CAS results. */
export function selectWorkflowResult(input, { runId, nodeId, resultId } = {}) {
  const node = input?.state?.nodes?.get(nodeId);
  if (!node) throw new RangeError(`Workflow node not found: ${nodeId}`);
  const ids = node.resultRefIds ?? [];
  if (resultId !== undefined && (typeof resultId !== 'string' || !ids.includes(resultId))) {
    throw new RangeError(`Workflow result not found on node ${nodeId}`);
  }
  const refs = ids.map((id) => {
    const ref = input.state.resultRefs.get(id);
    if (!ref || ref.runId !== runId || ref.nodeId !== nodeId) {
      throw Object.assign(new Error('Workflow result reference is inconsistent with its run and node'), { code: 'WORKFLOW_RESULT_NOT_RECORDED' });
    }
    return ref;
  });
  if (refs.length === 0) return { kind: 'absent', node };
  if (resultId === undefined && refs.length > 1) {
    return { kind: 'index', node, results: refs.map((ref) => ({
      resultId: ref.id, kind: ref.kind, contentType: ref.contentType,
      bytes: ref.bytes, summary: ref.summary,
    })) };
  }
  return { kind: 'selected', node, ref: resultId === undefined ? refs[0] : refs.find((ref) => ref.id === resultId) };
}

export function decodeWorkflowResultText(ref, bytes) {
  const [base, ...parameters] = String(ref.contentType).toLowerCase().split(';').map((part) => part.trim());
  const isText = base.startsWith('text/') || base === 'application/json' || base.endsWith('+json')
    || base === 'application/xml' || base.endsWith('+xml');
  if (!isText) return { text: null, reason: 'not text' };
  const charset = parameters.find((part) => part.startsWith('charset='));
  if (charset && !['charset=utf-8', 'charset="utf-8"'].includes(charset)) {
    return { text: null, reason: 'not UTF-8' };
  }
  try { return { text: new TextDecoder('utf-8', { fatal: true }).decode(bytes), reason: null }; }
  catch { return { text: null, reason: 'invalid UTF-8' }; }
}
