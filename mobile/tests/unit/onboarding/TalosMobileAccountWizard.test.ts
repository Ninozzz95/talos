import { describe, expect, it, vi, beforeEach } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { TALOS_MOBILE_WIZARD_KEY } from '@/lib/wizardInjection'

// N1 — the wizard shell drives the step machine and wires each step's side
// effect. Stores + the injected gate are mocked so the shell tests in isolation.
const closeWizard = vi.hoisted(() => vi.fn(async () => {}))
const setBack = vi.hoisted(() => vi.fn())
const setDisplayName = vi.hoisted(() => vi.fn(async () => {}))
const setSecurity = vi.hoisted(() => vi.fn(async () => {}))
const toastPush = vi.hoisted(() => vi.fn())
const accountState = vi.hoisted(() => ({ display_name: '' }))

vi.mock('@/stores/account', () => ({
    useTalosAccountStore: () => ({
        state: accountState,
        initial: { value: 'T' },
        oauthProviders: [{ id: 'google', label: 'Continue with Google', available: false, gateReason: 'sync soon' }],
        setDisplayName,
    }),
    talosAccountInitialFrom: (n: string) => { const t = n.trim(); return t ? [...t][0]!.toUpperCase() : 'T' },
}))
vi.mock('@/stores/theme', () => ({ useThemeStore: () => ({ state: { mode: 'system' }, setMode: vi.fn() }) }))
vi.mock('@/stores/settings', () => ({
    useSettingsStore: () => ({ state: { security: { app_lock_enabled: false, app_lock_biometric: false } }, setSecurity }),
}))
vi.mock('@/stores/toasts', () => ({ useTalosMobileToasts: () => ({ push: toastPush }) }))

import TalosMobileAccountWizard from '@/components/onboarding/TalosMobileAccountWizard.vue'
import TalosMobileAppLockModal from '@/components/talos/settings/TalosMobileAppLockModal.vue'

function mountShell() {
    return mount(TalosMobileAccountWizard, {
        global: {
            provide: {
                [TALOS_MOBILE_WIZARD_KEY as symbol]: {
                    wizardOpen: { value: true }, closeWizard, replayWizard: vi.fn(), setBack, handleBack: vi.fn(),
                },
            },
            stubs: { TalosMobileAppLockModal: true },
        },
    })
}

async function primary(w: ReturnType<typeof mountShell>): Promise<void> {
    await w.get('[data-testid="talos-wizard-primary"]').trigger('click')
    await flushPromises()
}

beforeEach(() => {
    closeWizard.mockClear(); setBack.mockClear(); setDisplayName.mockClear()
    setSecurity.mockClear(); toastPush.mockClear(); accountState.display_name = ''
})

describe('TalosMobileAccountWizard shell', () => {
    it('opens at welcome, registers hardware Back, hides Back, primary is "Get started"', () => {
        const w = mountShell()
        expect(w.find('[data-testid="wizard-step-welcome"]').exists()).toBe(true)
        expect(w.get('[data-testid="talos-wizard-primary"]').text()).toBe('Get started')
        expect(w.get('[data-testid="talos-wizard-back"]').classes()).toContain('invisible')
        expect(setBack).toHaveBeenCalled()
    })

    it('primary advances welcome → identity and reveals Back', async () => {
        const w = mountShell()
        await primary(w)
        expect(w.find('[data-testid="wizard-step-identity"]').exists()).toBe(true)
        expect(w.get('[data-testid="talos-wizard-back"]').classes()).not.toContain('invisible')
    })

    it('the welcome escape and the close X both skip (closeWizard skipped)', async () => {
        const w1 = mountShell()
        await w1.get('[data-testid="wizard-skip-all"]').trigger('click'); await flushPromises()
        expect(closeWizard).toHaveBeenCalledWith('skipped')

        const w2 = mountShell()
        await w2.get('[data-testid="talos-wizard-close"]').trigger('click'); await flushPromises()
        expect(closeWizard).toHaveBeenLastCalledWith('skipped')
    })

    it('identity Continue commits the typed name and advances', async () => {
        const w = mountShell()
        await primary(w) // → identity
        await w.get('[data-testid="wizard-name"]').setValue('Bruno')
        await primary(w)
        expect(setDisplayName).toHaveBeenCalledWith('Bruno')
        expect(w.find('[data-testid="wizard-step-personalize"]').exists()).toBe(true)
    })

    it('protect "Set a PIN" opens the app-lock setup modal', async () => {
        const w = mountShell()
        await primary(w); await primary(w); await primary(w) // → protect
        expect(w.find('[data-testid="wizard-step-protect"]').exists()).toBe(true)
        await w.get('[data-testid="wizard-setup-pin"]').trigger('click')
        expect(w.findComponent(TalosMobileAppLockModal).exists()).toBe(true)
    })

    it('signin OAuth tap surfaces the honest gate (toast), no session', async () => {
        const w = mountShell()
        for (let i = 0; i < 4; i++) await primary(w) // → signin
        expect(w.find('[data-testid="wizard-step-signin"]').exists()).toBe(true)
        await w.get('[data-testid="wizard-oauth-google"]').trigger('click')
        expect(toastPush).toHaveBeenCalledWith(expect.objectContaining({ message: 'sync soon' }))
    })

    it('reaching done shows "Enter TALOS" which completes and closes', async () => {
        const w = mountShell()
        for (let i = 0; i < 5; i++) await primary(w) // → done
        expect(w.find('[data-testid="wizard-step-done"]').exists()).toBe(true)
        expect(w.get('[data-testid="talos-wizard-primary"]').text()).toBe('Enter TALOS')
        await primary(w)
        expect(closeWizard).toHaveBeenCalledWith('completed')
    })

    it('clears the hardware-Back registration on unmount', () => {
        const w = mountShell()
        setBack.mockClear()
        w.unmount()
        expect(setBack).toHaveBeenCalledWith(null)
    })

    // --- SF-critic fixes ---
    it('SF M4: Skip on the identity step still commits the typed name (live preview never lies)', async () => {
        const w = mountShell()
        await primary(w) // → identity
        await w.get('[data-testid="wizard-name"]').setValue('Sara')
        await w.get('[data-testid="talos-wizard-skip"]').trigger('click')
        await flushPromises()
        expect(setDisplayName).toHaveBeenCalledWith('Sara')
        expect(w.find('[data-testid="wizard-step-personalize"]').exists()).toBe(true)
    })

    it('SF M2: hardware Back at the first step dismisses the wizard (not a dead key)', async () => {
        mountShell()
        const back = setBack.mock.calls.at(-1)![0] as () => void
        back()
        await flushPromises()
        expect(closeWizard).toHaveBeenCalledWith('skipped')
    })

    it('SF M2: hardware Back past the first step walks one step up (no dismiss)', async () => {
        const w = mountShell()
        await primary(w) // → identity
        const back = setBack.mock.calls.at(-1)![0] as () => void
        back()
        await flushPromises()
        expect(w.find('[data-testid="wizard-step-welcome"]').exists()).toBe(true)
        expect(closeWizard).not.toHaveBeenCalled()
    })

    it('SF M3: hardware Back closes the app-lock modal first, leaving the step intact', async () => {
        const w = mountShell()
        await primary(w); await primary(w); await primary(w) // → protect
        await w.get('[data-testid="wizard-setup-pin"]').trigger('click')
        expect(w.findComponent(TalosMobileAppLockModal).exists()).toBe(true)
        const back = setBack.mock.calls.at(-1)![0] as () => void
        back()
        await flushPromises()
        expect(w.findComponent(TalosMobileAppLockModal).exists()).toBe(false)
        expect(w.find('[data-testid="wizard-step-protect"]').exists()).toBe(true)
    })

    it('SF m6: closing on the Done step records completion, not skip', async () => {
        const w = mountShell()
        for (let i = 0; i < 5; i++) await primary(w) // → done
        await w.get('[data-testid="talos-wizard-close"]').trigger('click')
        await flushPromises()
        expect(closeWizard).toHaveBeenLastCalledWith('completed')
    })
})
