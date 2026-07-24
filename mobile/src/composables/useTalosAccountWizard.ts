import { computed, ref, type ComputedRef, type Ref } from 'vue'
import { TALOS_WIZARD_STEPS, talosWizardStepAt, type TalosWizardStep } from '@/components/onboarding/wizard/wizardSteps'

/**
 * N1 — the wizard's pure step machine. Navigation only (index over the frozen
 * step table); no persistence and no store deps, so it is trivially testable.
 * Persistence + first-run gating live in `useTalosMobileWizardState` (the App-
 * scoped gate that mirrors the intro-modal contract).
 */
export interface TalosAccountWizard {
    index: Ref<number>
    current: ComputedRef<TalosWizardStep>
    progress: ComputedRef<number>
    canBack: ComputedRef<boolean>
    isLast: ComputedRef<boolean>
    next(): void
    back(): void
    skip(): void
}

const LAST = TALOS_WIZARD_STEPS.length - 1

export function useTalosAccountWizard(startIndex = 0): TalosAccountWizard {
    const index = ref(Math.max(0, Math.min(LAST, Math.trunc(startIndex))))
    const current = computed(() => talosWizardStepAt(index.value))
    const progress = computed(() => (LAST === 0 ? 1 : index.value / LAST))
    const canBack = computed(() => index.value > 0)
    const isLast = computed(() => index.value >= LAST)
    function next(): void { index.value = Math.min(LAST, index.value + 1) }
    function back(): void { index.value = Math.max(0, index.value - 1) }
    function skip(): void { if (current.value.skippable) next() }
    return { index, current, progress, canBack, isLast, next, back, skip }
}
