// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { reactive, ref } from 'vue'

/**
 * Owner 2026-07-27, after the research: the six-slide carousel is gone and
 * first run is the two things TALOS cannot start without.
 *
 * What the research pinned down, and what these tests hold to it:
 *  - NN/g: deck-of-cards tutorials "make the interface appear more complicated
 *    than it actually is"; onboarding is justified only when the app needs
 *    something to begin. So: no slides, two steps, both about a real need.
 *  - NN/g on wizards: show the steps and where you are, allow going back,
 *    let people resume.
 *  - NN/g: "always provide a highly visible Skip option".
 *  - Android: never request runtime permissions at first launch.
 */
const state = vi.hoisted(() => ({
    security: { app_lock_enabled: false },
    secrets: {} as Record<string, boolean>,
}))

vi.mock('@/stores/settings', () => ({
    useSettingsStore: () => ({
        state: reactive({ security: state.security }),
        setSecurity: vi.fn(async () => {}),
    }),
}))

vi.mock('@/stores/chatController', () => ({
    useChatController: () => ({ secrets: state.secrets }),
}))

vi.mock('@/services/appLock', () => ({
    setupAppLockPin: vi.fn(async () => {}),
    clearAppLock: vi.fn(async () => {}),
    biometricUnlockAvailable: vi.fn(async () => false),
    requestBiometricUnlock: vi.fn(async () => false),
    verifyAppLockPin: vi.fn(async () => false),
    appLockThrottleRemainingMs: vi.fn(async () => 0),
}))

vi.mock('@/services/databaseProtection', () => ({
    enableTalosDatabaseProtection: vi.fn(async () => ({ migrated: false })),
    disableTalosDatabaseProtection: vi.fn(async () => {}),
}))

// The provider key panel is reused wholesale rather than reimplemented; it
// drags the whole model catalogue in, which this test does not need.
vi.mock('@/components/talos/models/TalosMobileProviderRuntimePanel.vue', () => ({
    // `__esModule` matters: without it defineAsyncComponent treats the module
    // itself as the component and Vue reads properties off the mock.
    __esModule: true,
    default: { name: 'ProviderRuntimePanelStub', template: '<div data-testid="settings-provider-keys" />' },
}))

import TalosMobileSetupIntro from '@/components/intro/TalosMobileSetupIntro.vue'

beforeEach(() => {
    state.security.app_lock_enabled = false
    for (const key of Object.keys(state.secrets)) delete state.secrets[key]
})

function mountIntro() {
    return mount(TalosMobileSetupIntro, { attachTo: document.body })
}

describe('first-run setup', () => {
    it('is two steps, named after what the person controls', async () => {
        const wrapper = mountIntro()
        await flushPromises()
        const steps = wrapper.findAll('[data-testid="talos-setup-step"]')
        expect(steps).toHaveLength(2)
        expect(steps.map((step) => step.text())).toEqual(['PIN', 'Model'])
        expect(steps[0]!.attributes('aria-current')).toBe('step')
        wrapper.unmount()
    })

    it('leads with the consequence instead of a reassurance', async () => {
        // The PIN is not a lock over the app: `enableTalosDatabaseProtection`
        // makes it the database key. Softening that would be the one lie this
        // screen cannot afford.
        const wrapper = mountIntro()
        await flushPromises()
        expect(wrapper.text()).toMatch(/no recovery/i)
        wrapper.unmount()
    })

    it('goes forward and back between the two steps', async () => {
        const wrapper = mountIntro()
        await flushPromises()
        await wrapper.get('[data-testid="talos-setup-next"]').trigger('click')
        expect(wrapper.findAll('[data-testid="talos-setup-step"]')[1]!.attributes('aria-current')).toBe('step')
        await flushPromises()
        expect(wrapper.find('[data-testid="settings-provider-keys"]').exists()).toBe(true)
        await wrapper.get('[data-testid="talos-setup-back"]').trigger('click')
        expect(wrapper.findAll('[data-testid="talos-setup-step"]')[0]!.attributes('aria-current')).toBe('step')
        wrapper.unmount()
    })

    it('opens on the model step when a PIN already exists', async () => {
        // Killed between the two steps, or the PIN was set earlier in Settings.
        // Asking again would be the app not looking at its own state.
        state.security.app_lock_enabled = true
        const wrapper = mountIntro()
        await flushPromises()
        const steps = wrapper.findAll('[data-testid="talos-setup-step"]')
        expect(steps[1]!.attributes('aria-current')).toBe('step')
        wrapper.unmount()
    })

    it('keeps a visible way out on every step, and reports it as skipped', async () => {
        const wrapper = mountIntro()
        await flushPromises()
        await wrapper.get('[data-testid="talos-setup-skip"]').trigger('click')
        expect(wrapper.emitted('close')).toEqual([['skipped']])
        wrapper.unmount()
    })

    it('finishes as completed from the last step', async () => {
        const wrapper = mountIntro()
        await flushPromises()
        await wrapper.get('[data-testid="talos-setup-next"]').trigger('click')
        await wrapper.get('[data-testid="talos-intro-cta"]').trigger('click')
        expect(wrapper.emitted('close')).toEqual([['completed']])
        wrapper.unmount()
    })

    it('asks the device for nothing at all', async () => {
        // Android is explicit: permissions are requested when the person invokes
        // the feature that needs them, never at first launch.
        const permissions = await import('@/services/devicePermissions')
        const spy = vi.spyOn(permissions, 'requestTalosNotifications')
        const mic = vi.spyOn(permissions, 'requestTalosMicrophone')
        const wrapper = mountIntro()
        await flushPromises()
        await wrapper.get('[data-testid="talos-setup-next"]').trigger('click')
        expect(spy).not.toHaveBeenCalled()
        expect(mic).not.toHaveBeenCalled()
        wrapper.unmount()
    })

    it('does not carry a single slide of marketing', async () => {
        const wrapper = mountIntro()
        await flushPromises()
        // What the owner called "molto fake": promises about things that do not
        // exist on this device yet.
        expect(wrapper.text()).not.toMatch(/roadmap/i)
        expect(wrapper.text()).not.toMatch(/step \d of 6/i)
        wrapper.unmount()
    })
})
