import { normalizeSessionEvent } from './session-events.js';

export function createSessionStreamFactory({ EventSourceImpl = globalThis.EventSource, endpoint } = {}) {
  if (typeof EventSourceImpl !== 'function' || typeof endpoint !== 'function') throw new TypeError('EventSource ed endpoint sono obbligatori');
  return Object.freeze({
    open({ sessionId, onEvent = () => {}, onState = () => {}, onError = () => {} }) {
      if (!sessionId) throw new TypeError('Identificativo sessione obbligatorio');
      const source = new EventSourceImpl(endpoint(sessionId));
      let terminal = false;
      let closed = false;
      onState('connecting');
      source.onopen = () => { if (!closed) onState('open'); };
      source.onmessage = (message) => {
        if (closed) return;
        try {
          const event = normalizeSessionEvent(JSON.parse(message.data));
          terminal = event.type === 'RunFinished' || event.type === 'RunError';
          onEvent(event);
          if (terminal) onState(event.type === 'RunFinished' ? 'finished' : 'failed');
        } catch (error) { onError(error); }
      };
      source.onerror = () => {
        if (closed || terminal) return;
        const error = new Error('Streaming della sessione interrotto');
        error.code = 'SESSION_STREAM_INTERRUPTED';
        onState('interrupted');
        onError(error);
      };
      return Object.freeze({ close() { if (closed) return; closed = true; source.close(); onState('closed'); } });
    },
  });
}
