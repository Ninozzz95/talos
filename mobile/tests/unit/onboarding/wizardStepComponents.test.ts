import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'

// N1 — each wizard step renders its content and emits its step-specific event.
// Stores are mocked so the steps test in isolation (the shell wires the effects).
const themeSetMode = vi.hoisted(() => vi.fn())
vi.mock('@/stores/theme', () => ({
    useThemeStore: () => ({ state: { mode: 'system' }, setMode: themeSetMode }),
}))
vi.mock('@/stores/settings', () => ({
    useSettingsStore: () => ({ state: { security: { app_lock_enabled: false, app_lock_biometric: false } } }),
}))
vi.mock('@/stores/account', () => ({
    useTalosAccountStore: () => ({
        initial: { value: 'T' },
        oauthProviders: [
            { id: 'google', label: 'Continue with Google', available: false, gateReason: 'g' },
            { id: 'apple', label: 'Continue with Apple', available: false, gateReason: 'a' },
        ],
    }),
    talosAccountInitialFrom: (name: string) => {
        const t = name.trim()
        return t ? [...t][0]!.toUpperCase() : 'T'
    },
}))

import WizardWelcome from '@/components/onboarding/wizard/WizardWelcome.vue'
import WizardIdentity from '@/components/onboarding/wizard/WizardIdentity.vue'
import WizardPersonalize from '@/components/onboarding/wizard/WizardPersonalize.vue'
import WizardProtect from '@/components/onboarding/wizard/WizardProtect.vue'
import WizardSignIn from '@/components/onboarding/wizard/WizardSignIn.vue'
import WizardDone from '@/components/onboarding/wizard/WizardDone.vue'
import TalosAccountAvatar from '@/components/talos/TalosAccountAvatar.vue'

describe('wizard step components', () => {
    it('Welcome emits skipAll from the quiet escape', async () => {
        const w = mount(WizardWelcome)
        await w.get('[data-testid="wizard-skip-all"]').trigger('click')
        expect(w.emitted('skipAll')).toHaveLength(1)
    })

    it('Identity shows a live avatar of the typed name and emits update:modelValue', async () => {
        const w = mount(WizardIdentity, { props: { modelValue: 'Sara' } })
        expect(w.findComponent(TalosAccountAvatar).text()).toBe('S')
        await w.get('[data-testid="wizard-name"]').setValue('Bruno')
        expect(w.emitted('update:modelValue')?.at(-1)).toEqual(['Bruno'])
    })

    it('Personalize sets the color mode via the theme store', async () => {
        const w = mount(WizardPersonalize)
        await w.get('[data-testid="wizard-theme-dark"]').trigger('click')
        expect(themeSetMode).toHaveBeenCalledWith('dark')
    })

    it('Protect offers the PIN setup and emits setupPin', async () => {
        const w = mount(WizardProtect)
        await w.get('[data-testid="wizard-setup-pin"]').trigger('click')
        expect(w.emitted('setupPin')).toHaveLength(1)
    })

    it('SignIn renders predisposed gated providers and emits oauth on tap', async () => {
        const w = mount(WizardSignIn)
        expect(w.find('[data-testid="wizard-oauth-google"]').exists()).toBe(true)
        expect(w.find('[data-testid="wizard-oauth-apple"]').exists()).toBe(true)
        await w.get('[data-testid="wizard-oauth-google"]').trigger('click')
        expect(w.emitted('oauth')?.at(-1)).toEqual(['google'])
    })

    it('Done renders the summary (name falls back to TALOS)', () => {
        const w = mount(WizardDone, { props: { name: '', mode: 'dark', lock: true } })
        const text = w.text()
        expect(text).toContain('TALOS')
        expect(text).toContain('dark')
        expect(text).toContain('On')
    })
})
