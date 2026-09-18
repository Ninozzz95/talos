/** Incremental, non-persistent activity metadata. Never retains message/tool content. */
const clean = value => typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]/gu, ' ').slice(0, 120) : null;
const iso = value => Number.isFinite(value) && Number.isFinite(new Date(value).getTime()) ? new Date(value).toISOString() : null;

function empty() {
  return { offset: 0, sequence: 0, phase: null, phaseAt: null, startedAt: null, endedAt: null, lastAt: null,
    tools: new Map(), calls: new Set(), messages: new Set(), assistant: new Set(), files: new Set(), errors: 0,
    commands: new Map(), recent: null };
}

function consume(state, event, at) {
  if (!event || typeof event.type !== 'string') return;
  if (Number.isSafeInteger(event._sequenza)) {
    if (event._sequenza <= state.sequence) return;
    state.sequence = event._sequenza;
  }
  const phase = name => { if (state.phase !== name) { state.phase = name; state.phaseAt = at; } state.lastAt = at; };
  switch (event.type) {
    case 'RunStarted':
      state.tools.clear(); state.assistant.clear(); state.startedAt = at; state.endedAt = null;
      state.phase = null; phase('avvio'); state.recent = null; break;
    case 'RunFinished':
    case 'RunError':
      phase(null); state.tools.clear(); state.assistant.clear(); state.endedAt = at;
      if (event.type === 'RunError' && !['fermato', 'giri-esauriti'].includes(event.code)) state.errors += 1;
      break;
    case 'ReasoningMessageStart': phase('ragionamento'); break;
    case 'ReasoningMessageEnd': if (state.phase === 'ragionamento') phase('avvio'); break;
    case 'TextMessageStart':
      if (event.role === 'assistant' || !event.role) {
        if (typeof event.messageId === 'string') state.assistant.add(event.messageId);
        phase('risposta');
      }
      break;
    case 'TextMessageEnd':
      if (!state.assistant.delete(event.messageId)) break;
      state.messages.add(event.messageId);
      state.recent = { tipo: 'risposta', nome: null }; state.lastAt = at;
      if (state.phase === 'risposta') phase('avvio');
      break;
    case 'ToolCallStart':
      if (typeof event.toolCallId !== 'string') break;
      state.calls.add(event.toolCallId);
      state.tools.set(event.toolCallId, clean(event.toolCallName));
      phase('strumento'); break;
    case 'ToolCallResult':
      state.tools.delete(event.toolCallId);
      state.recent = { tipo: 'strumento-concluso', nome: null }; state.lastAt = at;
      if (!state.tools.size && state.phase === 'strumento') phase('avvio');
      break;
    case 'ApprovalRequested': phase('approvazione'); break;
    case 'ApprovalResolved': phase(state.tools.size ? 'strumento' : 'avvio'); break;
    case 'ComandoUtenteIniziato':
      if (typeof event.comandoId === 'string') state.commands.set(event.comandoId, at);
      state.lastAt = at; break;
    case 'ComandoUtenteFinito': state.commands.delete(event.comandoId); state.lastAt = at; break;
    case 'StateDelta':
      for (const delta of Array.isArray(event.delta) ? event.delta : []) {
        if (typeof delta?.path !== 'string' || !delta.path.startsWith('/file/')) continue;
        const path = delta.path.slice('/file/'.length);
        if (!path) continue;
        state.files.add(path);
        // Only a basename is exposed. Absolute workspace paths and delta values
        // (which can be entire files) must not enter the sidebar transport.
        state.recent = { tipo: 'file', nome: clean(path.split(/[/\\]/u).at(-1)) };
        state.lastAt = at;
      }
      break;
    default: break;
  }
}

/** Cached by registry entry identity, with one linear historical pass then O(new events). */
export function creaProiezioneAttivitaSidebar() {
  const cache = new WeakMap();
  return function activity(entry) {
    if (!entry || !Array.isArray(entry.eventi)) return null;
    let state = cache.get(entry);
    if (!state || state.offset > entry.eventi.length) { state = empty(); cache.set(entry, state); }
    while (state.offset < entry.eventi.length) {
      const event = entry.eventi[state.offset++];
      consume(state, event, iso(entry.istantiEvento?.get(event?._sequenza)));
    }
    // Restored dead processes cannot claim a running phase or an elapsed timer.
    const active = entry.conclusa === false && entry.interrotta !== true;
    return {
      fase: active ? state.phase : null,
      faseAlle: active ? state.phaseAt : null,
      iniziataAlle: state.startedAt,
      terminataAlle: state.endedAt,
      ultimoEventoAlle: state.lastAt,
      strumento: active ? [...state.tools.values()].at(-1) ?? null : null,
      strumentiAttivi: active ? state.tools.size : 0,
      comandiAttivi: entry.interrotta ? 0 : state.commands.size,
      comandoAlle: entry.interrotta ? null : [...state.commands.values()].filter(Boolean).sort()[0] ?? null,
      chiamate: state.calls.size,
      risposte: state.messages.size,
      fileModificati: state.files.size,
      errori: state.errors,
      recente: state.recent,
      coda: Array.isArray(entry.codaMessaggi) ? entry.codaMessaggi.length : 0,
      codaInPausa: Boolean(entry.codaInPausa),
    };
  };
}
