/** L02/F04: an owner for local resources. Disposing never sends a server command. */
export interface Lifetime {
  readonly signal: AbortSignal;
  readonly disposed: boolean;
  own(cleanup: () => void): () => void;
  listen(target: EventTarget, type: string, listener: EventListener, options?: AddEventListenerOptions): () => void;
  dispose(): void;
}
export function createLifetime(onCleanupError: (error: unknown) => void = () => {}): Lifetime {
  const controller = new AbortController();
  const cleanups = new Set<() => void>();
  let disposed = false;
  const own = (cleanup: () => void): (() => void) => {
    let active = true;
    const release = () => {
      if (!active) return;
      active = false;
      cleanups.delete(release);
      try { cleanup(); } catch (error) { onCleanupError(error); }
    };
    if (disposed) release(); else cleanups.add(release);
    return release;
  };
  return Object.freeze({
    get signal() { return controller.signal; },
    get disposed() { return disposed; },
    own,
    listen(target: EventTarget, type: string, listener: EventListener, options?: AddEventListenerOptions) {
      if (disposed) return () => {};
      target.addEventListener(type, listener, options);
      return own(() => target.removeEventListener(type, listener, options));
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      controller.abort();
      for (const release of [...cleanups].reverse()) release();
    },
  });
}
