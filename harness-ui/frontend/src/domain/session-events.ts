/** K05: transport decoding. Channel state is not an agent outcome.
 * Payload fields remain unknown until the feature decoder validates them.
 */
export const SESSION_EVENT_NAMES = [
  'ApprovalRequested', 'ApprovalResolved', 'ArtifactCreated', 'HookInvoked',
  'QueuedMessageDelivered', 'ReasoningMessageContent', 'ReasoningMessageEnd',
  'ReasoningMessageStart', 'RunError', 'RunFinished', 'RunRedirectApplied',
  'RunRedirectCancelled', 'RunRedirectFailed', 'RunRedirectRequested',
  'RunStarted', 'StateDelta', 'TextMessageContent', 'TextMessageEnd',
  'TextMessageStart', 'ToolCallArgs', 'ComandoUtenteIniziato', 'ComandoUtenteFinito',
  'ToolCallOutput', 'ToolCallResult', 'ToolCallStart', 'WorkspaceChanged', 'CUSTOM',
] as const;
export type SessionEventType = typeof SESSION_EVENT_NAMES[number];
export type SessionEvent = { [K in SessionEventType]: Readonly<Record<string, unknown>> & {
  readonly type: K; readonly sequence?: number; readonly _sequenza?: number;
} }[SessionEventType];
const supported = new Set<string>(SESSION_EVENT_NAMES);
const isRecord = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
export type EventDecode =
  | { readonly kind: 'known'; readonly event: SessionEvent }
  | { readonly kind: 'unsupported'; readonly type: string }
  | { readonly kind: 'invalid'; readonly reason: string };
export function decodeSessionEvent(value: unknown): EventDecode {
  if (!isRecord(value) || typeof value.type !== 'string') return { kind: 'invalid', reason: 'Evento sessione non valido' };
  if (!supported.has(value.type)) return { kind: 'unsupported', type: value.type.slice(0, 120) };
  const sequence = value._sequenza ?? value.sequence;
  if (sequence !== undefined && (!Number.isSafeInteger(sequence) || Number(sequence) < 0))
    return { kind: 'invalid', reason: 'Sequenza sessione non valida' };
  if (value.type === 'CUSTOM' && typeof value.name !== 'string') return { kind: 'invalid', reason: 'Evento personalizzato privo di nome' };
  // The tag is checked against the closed set; only this boundary narrows unknown.
  const type = value.type as SessionEventType;
  const event = { ...value, type, ...(sequence === undefined ? {} : { sequence: Number(sequence) }) } as SessionEvent;
  return { kind: 'known', event: Object.freeze(event) };
}
