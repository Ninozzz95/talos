import { describe, expect, it, vi } from 'vitest'
import {
    useTalosMobileWizardState,
    TALOS_MOBILE_WIZARD_VERSION,
} from '@/composables/useTalosMobileWizardState'
import type { TalosMobileOnboardingState } from '@/stores/settings'

// N1 — first-run gate for the account wizard, mirroring the intro-modal
// contract: opens once per wizard version, AFTER the intro is resolved, only
// while hydrated and unblocked; any close latches + persists idempotently.
function onboarding(patch: Partial<TalosMobileOnboardingState> = {}): TalosMobileOnboardingState {
    return {
        intro_version: 1, intro_outcome: 'completed', setup_dismissed: false,
        wizard_version: 0, wizard_outcome: null, ...patch,
    }
}

function make(overrides: {
    hydrated?: boolean; blocked?: boolean; ob?: Partial<TalosMobileOnboardingState>
    setOnboarding?: (p: Partial<TalosMobileOnboardingState>) => Promise<void>
} = {}) {
    const setOnboarding = overrides.setOnboarding ?? vi.fn(async () => {})
    const state = useTalosMobileWizardState({
        hydrated: () => overrides.hydrated ?? true,
        blocked: () => overrides.blocked ?? false,
        onboarding: () => onboarding(overrides.ob),
        setOnboarding,
    })
    return { state, setOnboarding }
}

describe('useTalosMobileWizardState', () => {
    it('stays closed until settings are hydrated', () => {
        expect(make({ hydrated: false }).state.wizardOpen.value).toBe(false)
    })

    it('stays closed while a blocking surface is up (boot/lock/intro)', () => {
        expect(make({ blocked: true }).state.wizardOpen.value).toBe(false)
    })

    it('stays closed until the intro has been resolved', () => {
        expect(make({ ob: { intro_version: 0 } }).state.wizardOpen.value).toBe(false)
    })

    it('opens once the intro is resolved and the wizard has never run', () => {
        expect(make().state.wizardOpen.value).toBe(true)
    })

    it('does not reopen once the wizard version is current', () => {
        expect(make({ ob: { wizard_version: TALOS_MOBILE_WIZARD_VERSION } }).state.wizardOpen.value).toBe(false)
    })

    it('closeWizard persists version+outcome and latches shut', async () => {
        const { state, setOnboarding } = make()
        await state.closeWizard('completed')
        expect(setOnboarding).toHaveBeenCalledWith({ wizard_version: TALOS_MOBILE_WIZARD_VERSION, wizard_outcome: 'completed' })
        expect(state.wizardOpen.value).toBe(false)
    })

    it('closeWizard only writes once even if called twice', async () => {
        const { state, setOnboarding } = make()
        await state.closeWizard('skipped')
        await state.closeWizard('completed')
        expect(setOnboarding).toHaveBeenCalledOnce()
    })

    it('a failed persist still latches for the session (no reopen loop, no throw)', async () => {
        const setOnboarding = vi.fn(async () => { throw new Error('bridge down') })
        const { state } = make({ setOnboarding })
        await expect(state.closeWizard('completed')).resolves.toBeUndefined()
        expect(state.wizardOpen.value).toBe(false)
    })

    it('replayWizard forces it open again after completion', async () => {
        const { state } = make({ ob: { wizard_version: TALOS_MOBILE_WIZARD_VERSION } })
        expect(state.wizardOpen.value).toBe(false)
        state.replayWizard()
        expect(state.wizardOpen.value).toBe(true)
    })

    it('handleBack runs the registered handler; setBack(null) clears it', () => {
        const { state } = make()
        const back = vi.fn()
        state.setBack(back)
        state.handleBack()
        expect(back).toHaveBeenCalledOnce()
        state.setBack(null)
        state.handleBack()
        expect(back).toHaveBeenCalledOnce()
    })
})
