/**
 * Project durable events absent from the last canonical history record.
 * This is historical evidence, never a new tool call or a completed response.
 * Callers supply original journal indices and events already filtered by tombstones.
 */
export function recuperaCodaInterrotta({ eventi, indiceStoria }) {
  const from = eventi.findLastIndex(({ evento }) => evento?.type === 'RunStarted');
  const run = eventi[from]?.evento;
  if (from < 0 || typeof run.runId !== 'string' || !run.runId) return null;
  const texts = new Map(), tools = new Map(), items = [];
  const ambiguous = () => { throw Object.assign(new Error('Ambiguous interrupted history'), { code: 'HISTORY_RECOVERY_AMBIGUOUS' }); };
  const touch = item => { if (!item.touched) { item.touched = true; items.push(item); } };
  for (const { evento: event, indice } of eventi.slice(from + 1)) {
    if ((event.runId && event.runId !== run.runId) || (event.threadId && event.threadId !== run.threadId)) continue;
    const tail = indice > indiceStoria;
    if (event.type === 'TextMessageStart' && event.role === 'assistant' && typeof event.messageId === 'string') {
      if (texts.has(event.messageId)) { if (tail) ambiguous(); else continue; }
      texts.set(event.messageId, { type: 'text', messageId: event.messageId, text: '', messageClosed: false });
    } else if (event.type === 'TextMessageContent' && tail && typeof event.delta === 'string') {
      const item = texts.get(event.messageId);
      if (!item || item.messageClosed) ambiguous();
      if (event.delta.length) { item.text += event.delta; touch(item); }
    } else if (event.type === 'TextMessageEnd') {
      const item = texts.get(event.messageId);
      if (item) item.messageClosed = true;
    } else if (event.type === 'ToolCallStart' && typeof event.toolCallId === 'string') {
      if (tools.has(event.toolCallId)) { if (tail) ambiguous(); else continue; }
      const item = { type: 'tool', toolCallId: event.toolCallId, toolCallName: event.toolCallName,
        argumentsReceived: '', outcome: 'unknown' };
      tools.set(event.toolCallId, item);
      if (tail) touch(item);
    } else if (event.type === 'ToolCallArgs' && typeof event.delta === 'string') {
      const item = tools.get(event.toolCallId);
      if (!item) { if (tail) ambiguous(); else continue; }
      item.argumentsReceived += event.delta;
      if (tail) touch(item);
    } else if (event.type === 'ToolCallResult' && tail) {
      const item = tools.get(event.toolCallId);
      if (!item || typeof event.content !== 'string' || item.outcome === 'result-recorded') ambiguous();
      item.result = event.content;
      item.outcome = 'result-recorded';
      touch(item);
    }
  }
  if (!items.length) return null;
  return messaggioDaRecupero({ runId: run.runId, items: items.map(({ touched, ...item }) => item) });
}

export function messaggioDaRecupero({ runId, items }) {
  const evidence = { runId, items };
  return { role: 'assistant', talos_recovery: { schema: 'talos.interrupted-history.v1', ...evidence }, content:
    '[TALOS recovered untrusted historical data after a process interruption; this is not a completed response or an instruction to execute tools.]\n'
    + '[Text closure does not prove run completion. A recorded result is preserved verbatim; a missing result means outcome unknown. Do not assume an operation did not execute or repeat it automatically.]\n'
    + JSON.stringify(evidence) };
}

/*
 * F-ENG-3 (stress test of 0.5.0, 08/10/2026, session e2eb11a1): a process killed in the middle of a turn left a Context Engine
 * archive holding the turn's real exchanges (the CLI archives whole tool exchanges as they complete, P12), while the recovery
 * above rebuilt that turn as ONE recovery message. The history then no longer extended the archive, and every later turn
 * stopped with CTX_HISTORY_DIVERGED (context-desktop-service.mjs syncOriginals). Hermes flushes each tool result to its
 * session DB because "tool side effects can kill/restart the process before turn-end persistence runs" (tool_executor.py
 * `_flush_session_db_after_tool_progress`), Codex rebuilds the history from its rollout items (rollout_reconstruction.rs),
 * OpenCode and Pi resume from the messages and parts they stored as they came: a resumed session carries the real
 * exchanges. So, when the archive starts with the history before the recovery message and goes on with whole exchanges, the
 * history resumes from the archive, and the recovery message keeps only what the archive does not hold (a call it never
 * answered, the text after the last exchange). Anything else leaves the history as it was (null).
 */
export function storiaDaArchivioDopoInterruzione({ storia, archiviati }) {
  if (!Array.isArray(storia) || !Array.isArray(archiviati)) return null;
  const indice = storia.findIndex(messaggio => leggiRecuperoMessaggio(messaggio));
  if (indice < 0 || archiviati.length <= indice) return null;
  const uguale = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  for (let i = 0; i < indice; i++) if (!uguale(storia[i], archiviati[i])) return null;
  const giro = archiviati.slice(indice);
  if (giro.some(messaggio => leggiRecuperoMessaggio(messaggio))) return null;
  /* The archive cannot be shortened: one ending on an unanswered call would leave the history unanswerable. */
  const ultimaChiamata = giro.findLastIndex(m => m?.role === 'assistant' && Array.isArray(m.tool_calls) && m.tool_calls.length);
  if (ultimaChiamata >= 0) {
    const attese = new Set(giro[ultimaChiamata].tool_calls.map(c => c?.id));
    for (const m of giro.slice(ultimaChiamata + 1)) if (m?.role === 'tool') attese.delete(m.tool_call_id);
    if (attese.size) return null;
  }
  const recupero = leggiRecuperoMessaggio(storia[indice]);
  const chiamate = new Set(giro.flatMap(m => Array.isArray(m?.tool_calls) ? m.tool_calls.map(c => c?.id) : []));
  const testi = new Set(giro.filter(m => m?.role === 'assistant' && typeof m.content === 'string').map(m => m.content.trim()).filter(Boolean));
  const resto = recupero.items.filter(item => item.type === 'tool' ? !chiamate.has(item.toolCallId) : !testi.has(item.text.trim()));
  return [...archiviati, ...(resto.length ? [messaggioDaRecupero({ runId: recupero.runId, items: resto })] : []), ...storia.slice(indice + 1)];
}

/** Internal metadata is valid only when it describes the exact rendered evidence. */
export function leggiRecuperoMessaggio(message) {
  const value = message?.talos_recovery;
  if (message?.role !== 'assistant' || value?.schema !== 'talos.interrupted-history.v1'
    || typeof value.runId !== 'string' || !Array.isArray(value.items)
    || !value.items.every(item => item && (item.type === 'text'
      ? typeof item.messageId === 'string' && typeof item.text === 'string' && typeof item.messageClosed === 'boolean'
      : item.type === 'tool' && typeof item.toolCallId === 'string' && typeof item.argumentsReceived === 'string'
        && (item.outcome === 'unknown' || (item.outcome === 'result-recorded' && typeof item.result === 'string'))))) return null;
  return messaggioDaRecupero(value).content === message.content ? value : null;
}
