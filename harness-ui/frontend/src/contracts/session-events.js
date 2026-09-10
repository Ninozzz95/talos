export const SESSION_EVENT_TYPES = new Set([
  'ApprovalRequested', 'ApprovalResolved', 'ArtifactCreated', 'HookInvoked',
  'QueuedMessageDelivered', 'ReasoningMessageContent', 'ReasoningMessageEnd',
  'ReasoningMessageStart', 'RunError', 'RunFinished', 'RunRedirectApplied',
  'RunRedirectCancelled', 'RunRedirectFailed', 'RunRedirectRequested',
  'RunStarted', 'StateDelta',
  'TextMessageContent', 'TextMessageEnd', 'TextMessageStart', 'ToolCallArgs',
  /* ⛔⛔⛔ D-10B (10/09) — `ToolCallOutput` e' l'uscita di un comando MENTRE esce, e senza questa
     riga il giro MORIVA: `normalizeSessionEvent` non conosce i tipi fuori da questo insieme e
     LANCIA, quindi il primo pezzo di output faceva comparire in chat «Il giro si e' interrotto per
     un errore». Misurato dal vivo sul 4174: il comando partiva davvero (l'Indice dei giri diceva
     «Esecuzione di 1 comando… · 1 attrezzo») e il giro moriva subito dopo.
     ⇒ Un evento nuovo nel kernel non basta: va DICHIARATO anche qui, o la pagina lo rifiuta. */
  'ToolCallOutput',
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
