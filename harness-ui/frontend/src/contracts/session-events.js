export const SESSION_EVENT_TYPES = new Set([
  'ApprovalRequested', 'ApprovalResolved', 'ArtifactCreated', 'HookInvoked',
  'QueuedMessageDelivered', 'ReasoningMessageContent', 'ReasoningMessageEnd',
  'ReasoningMessageStart', 'RunError', 'RunFinished', 'RunRedirectApplied',
  'RunRedirectCancelled', 'RunRedirectFailed', 'RunRedirectRequested',
  'RunStarted', 'StateDelta',
  'TextMessageContent', 'TextMessageEnd', 'TextMessageStart', 'ToolCallArgs',
  'ToolCallResult', 'ToolCallStart', 'WorkspaceChanged',
]);

export function normalizeSessionEvent(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new TypeError('Evento sessione non valido');
  if (!SESSION_EVENT_TYPES.has(input.type)) throw new TypeError(`Evento sessione non supportato: ${String(input.type)}`);
  const output = { ...input };
  if (Object.hasOwn(output, '_sequenza')) {
    output.sequence = output._sequenza;
    delete output._sequenza;
  }
  return output;
}
