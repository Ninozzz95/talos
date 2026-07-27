import { computed, ref, type ComputedRef } from 'vue'
import type { TalosMobileOnboardingState, TalosMobileWizardOutcome } from '@/stores/settings'

/**
 * N1 — gate for the guided account-creation wizard. It opens on an explicit
 * replay from Settings, AFTER settings hydration, only while no blocking
 * overlay is active (one fullscreen surface at a time). It no longer opens by
 * itself at first run — see `wizardOpen`. Any close latches the session
 * immediately and persists
 * `{ wizard_version, wizard_outcome }` idempotently; a failed write keeps the
 * latch (no reopen loop) and honestly re-offers the wizard on the next cold
 * start. Also carries the hardware-Back registry so the shell's step machine
 * can consume Android Back one level at a time.
 */
export const TALOS_MOBILE_WIZARD_VERSION = 1

export interface TalosMobileWizardStateDependencies {
    hydrated: () => boolean
    blocked: () => boolean
    onboarding: () => TalosMobileOnboardingState
    setOnboarding: (patch: Partial<TalosMobileOnboardingState>) => Promise<void>
}

export interface TalosMobileWizardState {
    wizardOpen: ComputedRef<boolean>
    closeWizard(outcome: TalosMobileWizardOutcome): Promise<void>
    replayWizard(): void
    setBack(handler: (() => void) | null): void
    handleBack(): void
}

export function useTalosMobileWizardState(deps: TalosMobileWizardStateDependencies): TalosMobileWizardState {
    const latched = ref(false)
    const replaying = ref(false)
    const backHandler = ref<(() => void) | null>(null)

    /**
     * Owner 2026-07-27: the wizard no longer greets anyone.
     *
     * First run is the two-step setup and nothing else. This wizard used to
     * open right after it, which put eight screens between installing TALOS and
     * sending a first message — and its `protect` step asks for the PIN that
     * setup step 1 has already armed, so the same person would have been asked
     * for the same PIN twice.
     *
     * It stays whole and replayable from Settings for the parts setup does not
     * cover: your name, the tone, signing in. Only the first-run gate is gone.
     */
    const wizardOpen = computed(() => {
        if (!replaying.value || latched.value) return false
        // A replay still waits for hydration and still yields to the boot logo
        // or the lock screen: one fullscreen surface at a time.
        return deps.hydrated() && !deps.blocked()
    })

    let persisted = false

    async function closeWizard(outcome: TalosMobileWizardOutcome): Promise<void> {
        replaying.value = false
        latched.value = true
        backHandler.value = null
        if (persisted) return
        persisted = true
        try {
            await deps.setOnboarding({
                wizard_version: TALOS_MOBILE_WIZARD_VERSION,
                wizard_outcome: outcome,
            })
        } catch {
            // Honest failure: the latch holds for this session; the unsaved
            // version simply re-offers the wizard on the next cold start.
        }
    }

    function replayWizard(): void {
        replaying.value = true
        persisted = false
    }

    function setBack(handler: (() => void) | null): void { backHandler.value = handler }
    function handleBack(): void { backHandler.value?.() }

    return { wizardOpen, closeWizard, replayWizard, setBack, handleBack }
}
