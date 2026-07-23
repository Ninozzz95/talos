import { computed, ref, type ComputedRef } from 'vue'
import type { TalosMobileIntroOutcome, TalosMobileOnboardingState } from '@/stores/settings'

/**
 * F2-T6 — intro modal gating: mobile-local mirror of the desktop versioned
 * contract (`docs/superpowers/specs/2026-07-19-talos-intro-modal-design.md`).
 * Opens once per intro version AFTER settings hydration and only while no
 * blocking overlay is active; any close latches the session immediately and
 * persists `{ intro_version, intro_outcome }` idempotently. A failed write
 * keeps the session latch (no reopen loop) — the unsaved version simply offers
 * the intro again on the next cold start, which is honest.
 */
export const TALOS_MOBILE_INTRO_VERSION = 1

export interface TalosMobileIntroStateDependencies {
    hydrated: () => boolean
    blocked: () => boolean
    onboarding: () => TalosMobileOnboardingState
    setOnboarding: (patch: Partial<TalosMobileOnboardingState>) => Promise<void>
}

export interface TalosMobileIntroState {
    introOpen: ComputedRef<boolean>
    closeIntro(outcome: TalosMobileIntroOutcome): Promise<void>
    replayIntro(): void
}

export function useTalosMobileIntroState(deps: TalosMobileIntroStateDependencies): TalosMobileIntroState {
    // Session latch: once closed (or persisted), never auto-reopen this session.
    const latched = ref(false)
    const replaying = ref(false)

    const introOpen = computed(() => {
        if (replaying.value) return true
        if (latched.value) return false
        if (!deps.hydrated() || deps.blocked()) return false
        return deps.onboarding().intro_version < TALOS_MOBILE_INTRO_VERSION
    })

    let persisted = false

    async function closeIntro(outcome: TalosMobileIntroOutcome): Promise<void> {
        replaying.value = false
        latched.value = true
        if (persisted) return
        persisted = true
        try {
            await deps.setOnboarding({
                intro_version: TALOS_MOBILE_INTRO_VERSION,
                intro_outcome: outcome,
            })
        } catch {
            // Honest failure handling: the latch holds for this session; the
            // unsaved version re-offers the intro on the next cold start.
        }
    }

    function replayIntro(): void {
        replaying.value = true
        // A replayed intro may close with a different outcome — allow one new write.
        persisted = false
    }

    return { introOpen, closeIntro, replayIntro }
}
