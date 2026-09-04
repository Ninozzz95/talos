import { ACTIONS } from './actions.js';

function normalizeItems(value) {
  return Array.isArray(value) ? value.map((item) => ({ ...item })) : [];
}

function applyTextDelta(conversation, event) {
  const messageId = String(event.messageId || '');
  if (!messageId) return conversation;
  const index = conversation.messages.findIndex((message) => message.id === messageId);
  const delta = String(event.delta || '');
  const messages = [...conversation.messages];
  if (index < 0) {
    messages.push({ id: messageId, role: 'assistant', content: delta, state: 'streaming' });
  } else {
    messages[index] = { ...messages[index], content: `${messages[index].content || ''}${delta}`, state: 'streaming' };
  }
  return { ...conversation, messages, streamingMessageId: messageId };
}

function finishTextMessage(conversation, event) {
  const messageId = String(event.messageId || conversation.streamingMessageId || '');
  if (!messageId) return conversation;
  const messages = conversation.messages.map((message) => message.id === messageId ? { ...message, state: 'persisted' } : message);
  return { ...conversation, messages, streamingMessageId: conversation.streamingMessageId === messageId ? null : conversation.streamingMessageId };
}

function applySessionEvent(state, payload) {
  if (!payload || payload.sessionId !== state.sessions.activeId || payload.generation !== state.sessions.generation) return state;
  const event = payload.event;
  if (!event || typeof event !== 'object') return state;
  if (event.type === 'TextMessageContent') {
    const conversation = applyTextDelta(state.conversation, event);
    return conversation === state.conversation ? state : { ...state, conversation };
  }
  if (event.type === 'TextMessageEnd') {
    const conversation = finishTextMessage(state.conversation, event);
    return conversation === state.conversation ? state : { ...state, conversation };
  }
  if (event.type === 'RunStarted') {
    return { ...state, execution: { ...state.execution, status: 'running', runId: event.runId || state.execution.runId, error: null } };
  }
  if (event.type === 'RunFinished') {
    return { ...state, execution: { ...state.execution, status: 'completed', error: null } };
  }
  if (event.type === 'RunError') {
    return { ...state, execution: { ...state.execution, status: 'failed', error: event.error || 'Run non riuscito' } };
  }
  return state;
}

export function reducer(state, action) {
  if (!action || typeof action !== 'object' || typeof action.type !== 'string') return state;
  const payload = action.payload || {};
  switch (action.type) {
    case ACTIONS.BOOTSTRAP_SUCCEEDED: {
      const projects = normalizeItems(payload.projects);
      const sessions = normalizeItems(payload.sessions);
      const requestedActiveId = typeof payload.activeSessionId === 'string' ? payload.activeSessionId : null;
      const activeId = requestedActiveId && sessions.some((session) => session.id === requestedActiveId) ? requestedActiveId : null;
      return {
        ...state,
        runtime: {
          ...state.runtime,
          phase: activeId ? 'ready-active' : 'ready-empty',
          connection: 'online',
          capabilities: payload.capabilities && typeof payload.capabilities === 'object' ? { ...payload.capabilities } : {},
          error: null,
          observedAt: payload.observedAt ?? null,
        },
        projects: { ...state.projects, status: 'ready', items: projects, activeId: payload.activeProjectId || null, error: null },
        sessions: { ...state.sessions, status: 'ready', items: sessions, activeId, error: null },
      };
    }
    case ACTIONS.BOOTSTRAP_FAILED:
      return { ...state, runtime: { ...state.runtime, phase: 'degraded', connection: 'offline', error: payload.error || 'Avvio non riuscito' } };
    case ACTIONS.APP_DESTROYED:
      return {
        ...state,
        runtime: { ...state.runtime, phase: 'offline', connection: 'offline' },
        sessions: { ...state.sessions, activeId: null, generation: state.sessions.generation + 1 },
        execution: { ...state.execution, status: 'idle', runId: null },
      };
    case ACTIONS.ROUTE_CHANGED:
      return typeof payload.route === 'string' && payload.route ? { ...state, layout: { ...state.layout, route: payload.route } } : state;
    case ACTIONS.LAYOUT_UPDATED:
      return { ...state, layout: { ...state.layout, ...(payload.values || {}) } };
    case ACTIONS.SESSION_SELECTED: {
      if (typeof payload.id !== 'string' || !payload.id) return state;
      if (!state.sessions.items.some((session) => session?.id === payload.id)) return state;
      return {
        ...state,
        runtime: { ...state.runtime, phase: 'ready-active' },
        sessions: { ...state.sessions, activeId: payload.id, generation: state.sessions.generation + 1 },
        conversation: { ...state.conversation, messages: normalizeItems(payload.messages), reasoning: {}, queue: [], streamingMessageId: null },
        // ⛔ `usage` NON si eredita: aprire una sessione senza sapere quanto ha
        // consumato e' «non misurato», non «zero». Chi ha davvero misurato zero
        // (una sessione appena creata da noi) lo passa esplicitamente.
        execution: { ...state.execution, status: 'idle', runId: null, error: null, usage: payload.usage ?? null },
      };
    }
    case ACTIONS.SESSION_CLEARED:
      return {
        ...state,
        runtime: { ...state.runtime, phase: 'ready-empty' },
        sessions: { ...state.sessions, activeId: null, generation: state.sessions.generation + 1 },
        conversation: { ...state.conversation, messages: [], reasoning: {}, queue: [], streamingMessageId: null },
        execution: { ...state.execution, status: 'idle', runId: null, error: null, usage: null },
      };
    case ACTIONS.SESSION_EVENT_RECEIVED:
      return applySessionEvent(state, payload);
    case ACTIONS.EXECUTION_STATUS_CHANGED:
      return { ...state, execution: { ...state.execution, ...payload } };
    case ACTIONS.USAGE_UPDATED: {
      // Un consumo che arriva senza sessione aperta non ha di chi essere.
      if (!state.sessions.activeId) return state;
      if (payload.usage === null) return { ...state, execution: { ...state.execution, usage: null } };
      if (!payload.usage || typeof payload.usage !== 'object') return state;
      return { ...state, execution: { ...state.execution, usage: { ...state.execution.usage, ...payload.usage } } };
    }
    case ACTIONS.APPROVAL_REGISTERED: {
      if (!payload.id) return state;
      return { ...state, approvals: { ...state.approvals, pending: { ...state.approvals.pending, [payload.id]: { ...payload, id: payload.id } } } };
    }
    case ACTIONS.APPROVAL_RESOLVED: {
      if (!payload.id || !state.approvals.pending[payload.id]) return state;
      const pending = { ...state.approvals.pending };
      const previous = pending[payload.id];
      delete pending[payload.id];
      return { ...state, approvals: { pending, resolved: { ...state.approvals.resolved, [payload.id]: { ...previous, ...payload } } } };
    }
    case ACTIONS.REVIEW_UPDATED:
      return { ...state, review: { ...state.review, ...payload } };
    case ACTIONS.FILES_UPDATED:
      return { ...state, files: { ...state.files, ...payload } };
    case ACTIONS.TERMINAL_STATUS_CHANGED:
      return { ...state, terminal: { ...state.terminal, ...payload } };
    case ACTIONS.NOTIFICATION_ANNOUNCED:
      return { ...state, notifications: { ...state.notifications, announcement: String(payload.message || '') } };
    default:
      return state;
  }
}
