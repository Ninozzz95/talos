import { ref, type Ref } from 'vue'
import {
    TALOS_TABLET_MEDIA_QUERY,
    TALOS_TABLET_WIDTH_MEDIA_QUERY,
} from '@/lib/tabletLayout'

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
        const qualification = window.matchMedia(TALOS_TABLET_MEDIA_QUERY)
        const width = window.matchMedia(TALOS_TABLET_WIDTH_MEDIA_QUERY)
        // A fresh wide-but-short phone must never enter the split view. Once a
        // real tablet-sized viewport has qualified, however, Android's native
        // keyboard may reduce only the WebView HEIGHT below 500px. Keep that
        // classification until the width itself falls below md.
        let hasQualified = qualification.matches && width.matches
        const sync = (): void => {
            if (!width.matches) {
                hasQualified = false
                isTablet.value = false
                return
            }
            if (qualification.matches) hasQualified = true
            isTablet.value = hasQualified
        }
        sync()
        qualification.addEventListener?.('change', sync)
        width.addEventListener?.('change', sync)
    }
    singleton = { isTablet }
    return singleton
}

/** Test-only: drop the singleton so each test installs its own matchMedia. */
export function __resetTalosTabletLayoutForTests(): void {
    singleton = null
}
