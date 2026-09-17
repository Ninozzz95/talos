/** CORE-01: ownership of listeners and asynchronous UI work, never OS processes. */
export function createScope() {
  const controller = new AbortController();
  const cleanups = new Set<() => void>();
  return {
    signal: controller.signal,
    get disposed(): boolean { return controller.signal.aborted; },
    own(cleanup: () => void): () => void {
      if (controller.signal.aborted) cleanup(); else cleanups.add(cleanup);
      return () => { if (cleanups.delete(cleanup)) cleanup(); };
    },
    dispose(): void {
      if (controller.signal.aborted) return;
      controller.abort();
      for (const cleanup of cleanups) { try { cleanup(); } catch { /* Release the remaining resources too. */ } }
      cleanups.clear();
    },
  };
}

/** Latest request wins. A stale completion must not replace a newer view. */
export function createRevision() {
  let revision = 0;
  return { next: () => ++revision, current: () => revision, isCurrent: (candidate: number) => candidate === revision };
}
