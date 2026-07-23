import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { computed } from 'vue'
import TalosMobileSettingsAccountPanel from '@/components/talos/settings/TalosMobileSettingsAccountPanel.vue'
import { TALOS_MOBILE_INTRO_KEY } from '@/lib/introInjection'

// F2-T6 — Account panel: local-first identity truth, "Replay introduction"
// (desktop Account-tab parity) and the App lock opt-in (PIN + optional
// biometrics; flags in Preferences, PIN derivation in the Keystore).
const push = vi.fn()
vi.mock('vue-router', () => ({
    useRouter: () => ({ push }),
}))

const appLock = vi.hoisted(() => ({
    setupAppLockPin: vi.fn(async () => {}),
    clearAppLock: vi.fn(async () => {}),
    hasAppLockPin: vi.fn(async () => false),
    biometricUnlockAvailable: vi.fn(async () => false),
    verifyAppLockPin: vi.fn(async () => false),
    requestBiometricUnlock: vi.fn(async () => false),
}))
vi.mock('@/services/appLock', () => appLock)

const settingsMock = vi.hoisted(() => {
    const state = { security: { app_lock_enabled: false, app_lock_biometric: false } }
    return {
        state,
        setSecurity: vi.fn(async (patch: Record<string, boolean>) => {
            Object.assign(state.security, patch)
        }),
    }
})
vi.mock('@/stores/settings', () => ({ useSettingsStore: () => settingsMock }))

beforeEach(() => {
    push.mockReset()
    appLock.setupAppLockPin.mockReset().mockResolvedValue(undefined)
    appLock.clearAppLock.mockReset().mockResolvedValue(undefined)
    appLock.biometricUnlockAvailable.mockReset().mockResolvedValue(false)
    settingsMock.state.security = { app_lock_enabled: false, app_lock_biometric: false }
    settingsMock.setSecurity.mockClear()
})

function mountPanel(replayIntro = vi.fn()) {
    return {
        wrapper: mount(TalosMobileSettingsAccountPanel, {
            global: {
                provide: {
                    [TALOS_MOBILE_INTRO_KEY as symbol]: {
                        introOpen: computed(() => false),
                        closeIntro: vi.fn(),
                        replayIntro,
                    },
                },
            },
        }),
        replayIntro,
    }
}

describe('TalosMobileSettingsAccountPanel (F2-T6)', () => {
    it('states the local-first identity honestly', () => {
        const { wrapper } = mountPanel()
        expect(wrapper.text()).toMatch(/local/i)
        expect(wrapper.text()).not.toMatch(/sign in|log in/i)
    })

    it('replays the introduction and returns to the chat', async () => {
        const { wrapper, replayIntro } = mountPanel()
        await wrapper.get('button[data-testid="talos-replay-intro"]').trigger('click')
        expect(replayIntro).toHaveBeenCalledOnce()
        expect(push).toHaveBeenCalledWith({ name: 'chat' })
    })
})

describe('TalosMobileSettingsAccountPanel app lock (F2-T6)', () => {
    it('enabling reveals PIN setup and arms the lock on matching PINs', async () => {
        const { wrapper } = mountPanel()
        await wrapper.get('[data-testid="talos-applock-toggle"]').trigger('click')
        await wrapper.get('[data-testid="talos-applock-pin"]').setValue('123456')
        await wrapper.get('[data-testid="talos-applock-pin-confirm"]').setValue('123456')
        await wrapper.get('[data-testid="talos-applock-save"]').trigger('click')
        await flushPromises()
        expect(appLock.setupAppLockPin).toHaveBeenCalledWith('123456')
        expect(settingsMock.setSecurity).toHaveBeenCalledWith({ app_lock_enabled: true })
    })

    it('rejects mismatched PIN confirmation honestly without arming', async () => {
        const { wrapper } = mountPanel()
        await wrapper.get('[data-testid="talos-applock-toggle"]').trigger('click')
        await wrapper.get('[data-testid="talos-applock-pin"]').setValue('123456')
        await wrapper.get('[data-testid="talos-applock-pin-confirm"]').setValue('999999')
        await wrapper.get('[data-testid="talos-applock-save"]').trigger('click')
        await flushPromises()
        expect(wrapper.text()).toMatch(/do not match/i)
        expect(appLock.setupAppLockPin).not.toHaveBeenCalled()
        expect(settingsMock.setSecurity).not.toHaveBeenCalled()
    })

    it('disabling clears the Keystore record and both flags', async () => {
        settingsMock.state.security = { app_lock_enabled: true, app_lock_biometric: true }
        const { wrapper } = mountPanel()
        await wrapper.get('[data-testid="talos-applock-toggle"]').trigger('click')
        await flushPromises()
        expect(appLock.clearAppLock).toHaveBeenCalledOnce()
        expect(settingsMock.setSecurity).toHaveBeenCalledWith({
            app_lock_enabled: false,
            app_lock_biometric: false,
        })
    })

    it('offers the biometric toggle only when the lock is armed AND the device supports it', async () => {
        appLock.biometricUnlockAvailable.mockResolvedValue(true)
        settingsMock.state.security = { app_lock_enabled: true, app_lock_biometric: false }
        const { wrapper } = mountPanel()
        await flushPromises()
        await wrapper.get('[data-testid="talos-applock-biometric"]').trigger('click')
        expect(settingsMock.setSecurity).toHaveBeenCalledWith({ app_lock_biometric: true })
    })

    it('hides the biometric toggle honestly when the device has none', async () => {
        settingsMock.state.security = { app_lock_enabled: true, app_lock_biometric: false }
        const { wrapper } = mountPanel()
        await flushPromises()
        expect(wrapper.find('[data-testid="talos-applock-biometric"]').exists()).toBe(false)
    })
})
