import { computed, ref, type ComputedRef } from 'vue'
import { TALOS_MOBILE_INTRO_VERSION } from '@/composables/useTalosMobileIntroState'
import type { TalosMobileOnboardingState, TalosMobileWizardOutcome } from '@/stores/settings'

/**
 * N1 — first-run gate for the guided account-creation wizard. A faithful mirror
 * of the intro-modal contract (`useTalosMobileIntroState`): opens once per
 * wizard version, AFTER settings hydration, only while no blocking overlay is
 * active AND the intro has already been resolved (one fullscreen surface at a
 * time). Any close latches the session immediately and persists
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

    const wizardOpen = computed(() => {
        if (replaying.value) return true
        if (latched.value) return false
        if (!deps.hydrated() || deps.blocked()) return false
        const ob = deps.onboarding()
        // Only once the intro is resolved (completed OR skipped → version bumped),
        // and only once per wizard version.
        return ob.intro_version >= TALOS_MOBILE_INTRO_VERSION
            && ob.wizard_version < TALOS_MOBILE_WIZARD_VERSION
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
