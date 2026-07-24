// N1 — guided account-creation wizard. The ordered step table is the single
// source of truth for the flow; welcome + done are non-skippable bookends, the
// middle steps are all optional (local-first, 2-tap happy path).
export type TalosWizardStepId = 'welcome' | 'identity' | 'personalize' | 'protect' | 'signin' | 'done'

export interface TalosWizardStep {
    id: TalosWizardStepId
    label: string
    skippable: boolean
}

export const TALOS_WIZARD_STEPS: readonly TalosWizardStep[] = Object.freeze([
    { id: 'welcome', label: 'Welcome', skippable: false },
    { id: 'identity', label: 'Your identity', skippable: true },
    { id: 'personalize', label: 'Personalize', skippable: true },
    { id: 'protect', label: 'Protect', skippable: true },
    { id: 'signin', label: 'Sign in', skippable: true },
    { id: 'done', label: 'All set', skippable: false },
])

export function talosWizardStepAt(index: number): TalosWizardStep {
    const clamped = Math.max(0, Math.min(TALOS_WIZARD_STEPS.length - 1, Math.trunc(index)))
    return TALOS_WIZARD_STEPS[clamped]!
}
