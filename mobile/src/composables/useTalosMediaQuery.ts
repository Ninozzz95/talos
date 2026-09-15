import { onScopeDispose, ref, type Ref } from 'vue'

/**
 * Cleanup pass 2026-07-24 — a small reactive media-query primitive. Views that
 * need a breakpoint (e.g. Settings Center gating its contextual back on the
 * ≥768px master-detail) were hand-rolling matchMedia + addEventListener +
 * onBeforeUnmount teardown; this centralizes the SSR guard and the listener
 * lifecycle. Scope-bound cleanup (onScopeDispose) so it works in any setup()
 * without the caller wiring an unmount hook. A runtime without matchMedia stays
 * inert (always false) — fail-safe, matching useTalosTabletLayout.
 */
export function useTalosMediaQuery(query: string): Ref<boolean> {
    const matches = ref(false)
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return matches
    const mql = window.matchMedia(query)
    matches.value = mql.matches
    const onChange = (event: MediaQueryListEvent | { matches: boolean }): void => { matches.value = event.matches }
    mql.addEventListener?.('change', onChange)
    onScopeDispose(() => mql.removeEventListener?.('change', onChange))
    return matches
}
