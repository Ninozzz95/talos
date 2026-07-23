import { ref, type Ref } from 'vue'
import { TALOS_TABLET_MEDIA_QUERY } from '@/lib/tabletLayout'

/**
 * F6 — reactive gate for the tablet split view (persistent chat panel +
 * draggable divider). Listener-based so rotation/resize flips the layout
 * live; a runtime without matchMedia stays on the phone layout (fail-safe).
 * Module-scoped singleton: the shell is the only consumer, and repeated
 * calls must not stack listeners.
 */
export interface TalosTabletLayout {
    isTablet: Ref<boolean>
}

let singleton: TalosTabletLayout | null = null

export function useTalosTabletLayout(): TalosTabletLayout {
    if (singleton) return singleton
    const isTablet = ref(false)
    if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
        const query = window.matchMedia(TALOS_TABLET_MEDIA_QUERY)
        isTablet.value = query.matches
        query.addEventListener?.('change', (event) => { isTablet.value = event.matches })
    }
    singleton = { isTablet }
    return singleton
}

/** Test-only: drop the singleton so each test installs its own matchMedia. */
export function __resetTalosTabletLayoutForTests(): void {
    singleton = null
}
