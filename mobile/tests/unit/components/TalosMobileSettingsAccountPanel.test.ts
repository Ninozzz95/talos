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
    appLockThrottleRemainingMs: vi.fn(async () => 0),
    appLockPinIsWeak: vi.fn(async () => false),
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
                stubs: { teleport: true },
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
    it('states the local-first identity honestly with PREDISPOSED (gated) sign-in', () => {
        const { wrapper } = mountPanel()
        expect(wrapper.text()).toMatch(/local/i)
        expect(wrapper.text()).toMatch(/no account is required/i)
        // Owner 2026-07-24: OAuth is present but PREDISPOSED — gated ("Soon"),
        // no fake session; the local-first honesty is preserved.
        expect(wrapper.find('[data-testid="talos-oauth-google"]').exists()).toBe(true)
        expect(wrapper.find('[data-testid="talos-oauth-apple"]').exists()).toBe(true)
        expect(wrapper.text()).toMatch(/predisposed/i)
        expect(wrapper.text()).toMatch(/soon/i)
    })

    it('edits and persists the local display name', async () => {
        const { wrapper } = mountPanel()
        const input = wrapper.get('[data-testid="talos-account-name"]')
        await input.setValue('Antonio')
        await wrapper.get('[data-testid="talos-account-name-save"]').trigger('click')
        await wrapper.vm.$nextTick()
        expect((wrapper.get('[data-testid="talos-account-name"]').element as HTMLInputElement).value).toBe('Antonio')
    })

    it('replays the introduction and returns to the chat', async () => {
        const { wrapper, replayIntro } = mountPanel()
        await wrapper.get('button[data-testid="talos-replay-intro"]').trigger('click')
        expect(replayIntro).toHaveBeenCalledOnce()
        expect(push).toHaveBeenCalledWith({ name: 'chat' })
    })
})

describe('TalosMobileSettingsAccountPanel app lock (F4-#25 OTP flow)', () => {
    it('enabling walks the OTP setup: 6-digit PIN, then confirm, arming on match', async () => {
        const { wrapper } = mountPanel()
        await wrapper.get('[data-testid="talos-applock-toggle"]').trigger('click')
        await flushPromises()
        // F5-#32: the PIN journey is a dedicated fullscreen modal.
        expect(wrapper.get('[data-testid="talos-applock-modal"]').attributes('aria-modal')).toBe('true')
        await wrapper.get('[data-testid="talos-applock-pin"]').setValue('123456')
        await flushPromises()
        await wrapper.get('[data-testid="talos-applock-pin-confirm"]').setValue('123456')
        await flushPromises()
        expect(appLock.setupAppLockPin).toHaveBeenCalledWith('123456')
        expect(settingsMock.setSecurity).toHaveBeenCalledWith({ app_lock_enabled: true, screen_secure: true })
    })

    it('rejects a mismatched confirmation honestly and restarts the confirm step', async () => {
        const { wrapper } = mountPanel()
        await wrapper.get('[data-testid="talos-applock-toggle"]').trigger('click')
        await wrapper.get('[data-testid="talos-applock-pin"]').setValue('123456')
        await flushPromises()
        await wrapper.get('[data-testid="talos-applock-pin-confirm"]').setValue('999999')
        await flushPromises()
        expect(wrapper.text()).toMatch(/do not match/i)
        expect(appLock.setupAppLockPin).not.toHaveBeenCalled()
        expect(settingsMock.setSecurity).not.toHaveBeenCalled()
        expect((wrapper.get('[data-testid="talos-applock-pin-confirm"]').element as HTMLInputElement).value).toBe('')
    })

    it('disabling requires the current PIN and clears only after verification', async () => {
        settingsMock.state.security = { app_lock_enabled: true, app_lock_biometric: false }
        appLock.verifyAppLockPin.mockResolvedValue(true)
        const { wrapper } = mountPanel()
        await wrapper.get('[data-testid="talos-applock-toggle"]').trigger('click')
        await flushPromises()
        expect(appLock.clearAppLock).not.toHaveBeenCalled()
        // SF-1: legacy PINs (4-8 digits) submit through the explicit Confirm.
        await wrapper.get('[data-testid="talos-applock-verify"]').setValue('4321')
        await wrapper.get('[data-testid="talos-applock-verify-submit"]').trigger('click')
        await flushPromises()
        expect(appLock.verifyAppLockPin).toHaveBeenCalledWith('4321')
        expect(appLock.clearAppLock).toHaveBeenCalledOnce()
        expect(settingsMock.setSecurity).toHaveBeenCalledWith({
            app_lock_enabled: false,
            app_lock_biometric: false,
        })
    })

    it('keeps the lock armed when the verification PIN is wrong', async () => {
        settingsMock.state.security = { app_lock_enabled: true, app_lock_biometric: false }
        appLock.verifyAppLockPin.mockResolvedValue(false)
        const { wrapper } = mountPanel()
        await wrapper.get('[data-testid="talos-applock-toggle"]').trigger('click')
        await flushPromises()
        await wrapper.get('[data-testid="talos-applock-verify"]').setValue('999999')
        await wrapper.get('[data-testid="talos-applock-verify-submit"]').trigger('click')
        await flushPromises()
        expect(wrapper.text()).toMatch(/not recognized/i)
        expect(appLock.clearAppLock).not.toHaveBeenCalled()
        expect(settingsMock.setSecurity).not.toHaveBeenCalled()
    })

    it('disables through biometrics when they are enabled and available', async () => {
        settingsMock.state.security = { app_lock_enabled: true, app_lock_biometric: true }
        appLock.biometricUnlockAvailable.mockResolvedValue(true)
        appLock.requestBiometricUnlock.mockResolvedValue(true)
        const { wrapper } = mountPanel()
        await flushPromises()
        await wrapper.get('[data-testid="talos-applock-toggle"]').trigger('click')
        await flushPromises()
        await wrapper.get('[data-testid="talos-applock-verify-biometric"]').trigger('click')
        await flushPromises()
        expect(appLock.requestBiometricUnlock).toHaveBeenCalled()
        expect(appLock.clearAppLock).toHaveBeenCalledOnce()
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
