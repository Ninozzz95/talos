import { describe, expect, it } from 'vitest'
import { TALOS_WIZARD_STEPS, talosWizardStepAt, type TalosWizardStepId } from '@/components/onboarding/wizard/wizardSteps'

// N1 wizard — the ordered step table is the single source of truth for the
// wizard flow. Frozen, welcome+done are non-skippable bookends.
describe('wizardSteps', () => {
    it('is the ordered welcome→done flow', () => {
        expect(TALOS_WIZARD_STEPS.map((s) => s.id)).toEqual<TalosWizardStepId[]>([
            'welcome', 'identity', 'personalize', 'protect', 'signin', 'done',
        ])
    })

    it('marks only the middle steps skippable (welcome + done are bookends)', () => {
        const byId = Object.fromEntries(TALOS_WIZARD_STEPS.map((s) => [s.id, s.skippable]))
        expect(byId.welcome).toBe(false)
        expect(byId.done).toBe(false)
        expect(byId.identity).toBe(true)
        expect(byId.personalize).toBe(true)
        expect(byId.protect).toBe(true)
        expect(byId.signin).toBe(true)
    })

    it('is frozen (the flow cannot be mutated at runtime)', () => {
        expect(Object.isFrozen(TALOS_WIZARD_STEPS)).toBe(true)
    })

    it('talosWizardStepAt clamps out-of-range indices to the ends', () => {
        expect(talosWizardStepAt(-5).id).toBe('welcome')
        expect(talosWizardStepAt(0).id).toBe('welcome')
        expect(talosWizardStepAt(2).id).toBe('personalize')
        expect(talosWizardStepAt(99).id).toBe('done')
    })
})
