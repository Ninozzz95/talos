/** L02/F04: state of a read, distinct from the state of an agent run. */
export interface RequestIdentity {
  readonly workspaceId: string | null;
  readonly sessionId: string | null;
  readonly generation: number;
}
export interface PublicProblem {
  readonly code: string;
  readonly title: string;
  readonly explanation: string;
  readonly action: string | null;
  readonly diagnosticReference: string | null;
  readonly retry: 'safe-read' | 'explicit-mutation' | 'not-supported' | 'unknown';
}
export type ResourceState<T> =
  | { readonly kind: 'idle' }
  | { readonly kind: 'loading'; readonly request: RequestIdentity; readonly previous: T | null }
  | { readonly kind: 'ready'; readonly value: T; readonly receivedAt: string; readonly stale: boolean }
  | { readonly kind: 'empty'; readonly reason: 'no-records' | 'filtered-out' | 'configuration-missing' }
  | { readonly kind: 'error'; readonly problem: PublicProblem; readonly previous: T | null };
export type LatestResult<T> =
  | { readonly kind: 'current'; readonly value: T; readonly request: RequestIdentity }
  | { readonly kind: 'superseded'; readonly request: RequestIdentity };

/** A coordinator belongs to one resource/view, not to a global URL cache. */
export function createRequestCoordinator() {
  let generation = 0;
  let active: AbortController | null = null;
  let disposed = false;
  const invalidate = () => { generation += 1; active?.abort(); active = null; };
  return Object.freeze({
    async run<T>(identity: Omit<RequestIdentity, 'generation'>, read: (signal: AbortSignal) => Promise<T>): Promise<LatestResult<T>> {
      if (disposed) throw new Error('Request coordinator is disposed');
      invalidate();
      const controller = new AbortController();
      active = controller;
      const request: RequestIdentity = Object.freeze({ ...identity, generation });
      try {
        const value = await read(controller.signal);
        return disposed || request.generation !== generation
          ? { kind: 'superseded', request }
          : { kind: 'current', value, request };
      } catch (error) {
        if (disposed || request.generation !== generation) return { kind: 'superseded', request };
        throw error;
      } finally { if (active === controller) active = null; }
    },
    invalidate,
    dispose() { if (!disposed) { disposed = true; invalidate(); } },
  });
}
