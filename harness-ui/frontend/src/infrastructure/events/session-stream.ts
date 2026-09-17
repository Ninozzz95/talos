/** K06: shared stream ownership, used by main and child conversations.
 * EventSource owns HTTP replay/reconnection. A RunFinished does not close the
 * connection in the middle of replay; the controller decides expected EOF.
 */
import { decodeSessionEvent } from '../../domain/session-events.ts';
import type { SessionEvent } from '../../domain/session-events.ts';
export type ChannelState = 'connecting' | 'open' | 'reconnecting' | 'closed';
export interface SessionStream { readonly readyState: number; close(): void; }
export interface SessionStreamOptions {
  readonly sessionId: string;
  readonly isCurrent?: () => boolean;
  readonly onEvent: (event: SessionEvent) => void;
  readonly onState?: (state: ChannelState) => void;
  readonly onError?: (error: Error) => void;
  readonly onUnsupported?: (type: string) => void;
  readonly onChannelError?: (readyState: number) => void;
}
export function createSessionStreamFactory({ endpoint, EventSourceImpl = globalThis.EventSource }: {
  endpoint: (sessionId: string) => string; EventSourceImpl?: typeof EventSource;
}) {
  const streams = new Set<SessionStream>();
  let disposed = false;
  return Object.freeze({
    open(options: SessionStreamOptions): SessionStream {
      if (disposed) throw new Error('Session stream factory is disposed');
      if (!options.sessionId) throw new TypeError('Identificativo sessione obbligatorio');
      const source = new EventSourceImpl(endpoint(options.sessionId));
      let closed = false;
      const current = () => !closed && !disposed && (options.isCurrent?.() ?? true);
      const stream: SessionStream = Object.freeze({
        get readyState() { return closed ? 2 : source.readyState; },
        close() {
          if (closed) return;
          const notify = current();
          closed = true;
          source.onopen = null; source.onmessage = null; source.onerror = null;
          source.close(); streams.delete(stream);
          if (notify) options.onState?.('closed');
        },
      });
      streams.add(stream);
      source.onopen = () => { if (current()) options.onState?.('open'); else stream.close(); };
      source.onmessage = (message: MessageEvent<string>) => {
        if (!current()) { stream.close(); return; }
        let raw: unknown;
        try { raw = JSON.parse(message.data); }
        catch { options.onError?.(new Error('Evento sessione JSON non valido')); return; }
        const result = decodeSessionEvent(raw);
        if (result.kind === 'unsupported') { options.onUnsupported?.(result.type); return; }
        if (result.kind === 'invalid') { options.onError?.(new Error(result.reason)); return; }
        options.onEvent(result.event);
      };
      source.onerror = () => {
        if (!current()) { stream.close(); return; }
        options.onState?.(source.readyState === 2 ? 'closed' : 'reconnecting');
        options.onChannelError?.(source.readyState);
      };
      options.onState?.('connecting');
      return stream;
    },
    dispose() { if (disposed) return; disposed = true; for (const stream of [...streams]) stream.close(); },
  });
}
