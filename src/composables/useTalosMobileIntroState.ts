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
/**
 * 3 — la pagina del background (2026-08-03).
 *
 * Alzata di proposito, non per abitudine. Chi ha già TALOS installato ha i tre
 * passi essenziali fatti, quindi `startIndex` lo porta **esattamente** sulla
 * pagina nuova: vede quella e nient'altro. È l'unico modo di raggiungere chi ha
 * l'app da prima con una cosa senza la quale ogni ricerca lunga muore
 * ([[permissions-onboarding-page-blocking]]) — e succede una volta sola, perché
 * la chiusura scrive comunque la versione anche se la persona rifiuta.
 */
/*
 * **4 dal 2026-08-06.** La pagina dell'autonomia non è più due bottoni: adesso
 * mostra i tre poteri separati, ciascuno coi suoi tre stati, e sotto ognuno
 * l'elenco vero degli strumenti che ci ricadono. Chi ha già l'app ha deciso
 * «tutto chiedi» o «tutto lascia fare» senza che nessuno gli dicesse cosa fosse
 * «tutto» — e in particolare senza sapere che dentro c'era l'uscita in rete.
 * Quella decisione va potuta rifare sapendo.
 */
export const TALOS_MOBILE_INTRO_VERSION = 4

export interface TalosMobileIntroStateDependencies {
    hydrated: () => boolean
    blocked: () => boolean
    onboarding: () => TalosMobileOnboardingState
    setOnboarding: (patch: Partial<TalosMobileOnboardingState>) => Promise<void>
}

export interface TalosMobileIntroState {
    introOpen: ComputedRef<boolean>
    replaying: ComputedRef<boolean>
    closeIntro(outcome: TalosMobileIntroOutcome): Promise<void>
    replayIntro(): void
    setBack(handler: (() => void) | null): void
    handleBack(): void
}

export function useTalosMobileIntroState(deps: TalosMobileIntroStateDependencies): TalosMobileIntroState {
    // Session latch: once closed (or persisted), never auto-reopen this session.
    const latched = ref(false)
    const replaying = ref(false)
    const backHandler = ref<(() => void) | null>(null)
    const replayStatus = computed(() => replaying.value)

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
        backHandler.value = null
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

    function setBack(handler: (() => void) | null): void {
        backHandler.value = handler
    }

    function handleBack(): void {
        backHandler.value?.()
    }

    return {
        introOpen,
        replaying: replayStatus,
        closeIntro,
        replayIntro,
        setBack,
        handleBack,
    }
}
