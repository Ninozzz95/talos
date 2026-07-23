import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import TalosMobileLockScreen from '@/components/security/TalosMobileLockScreen.vue'

// F2-T6 — lock screen: unlock ONLY through a real verification (PIN or OS
// biometric success); wrong attempts stay honest; no skip path exists.
const appLock = vi.hoisted(() => ({
    verifyAppLockPin: vi.fn(async () => false),
    requestBiometricUnlock: vi.fn(async () => false),
}))
vi.mock('@/services/appLock', () => appLock)

beforeEach(() => {
    appLock.verifyAppLockPin.mockReset().mockResolvedValue(false)
    appLock.requestBiometricUnlock.mockReset().mockResolvedValue(false)
})

describe('TalosMobileLockScreen (F2-T6)', () => {
    it('rejects a wrong PIN with an honest error and stays locked', async () => {
        const wrapper = mount(TalosMobileLockScreen, { props: { biometricEnabled: false } })
        await wrapper.get('[data-testid="talos-lock-pin"]').setValue('0000')
        await wrapper.get('[data-testid="talos-lock-submit"]').trigger('click')
        await flushPromises()
        expect(wrapper.text()).toMatch(/wrong pin/i)
        expect(wrapper.emitted('unlocked')).toBeUndefined()
    })

    it('unlocks on a verified PIN', async () => {
        appLock.verifyAppLockPin.mockResolvedValue(true)
        const wrapper = mount(TalosMobileLockScreen, { props: { biometricEnabled: false } })
        await wrapper.get('[data-testid="talos-lock-pin"]').setValue('123456')
        await wrapper.get('[data-testid="talos-lock-submit"]').trigger('click')
        await flushPromises()
        expect(appLock.verifyAppLockPin).toHaveBeenCalledWith('123456')
        expect(wrapper.emitted('unlocked')).toHaveLength(1)
    })

    it('attempts biometric unlock on mount when enabled and unlocks on success', async () => {
        appLock.requestBiometricUnlock.mockResolvedValue(true)
        const wrapper = mount(TalosMobileLockScreen, { props: { biometricEnabled: true } })
        await flushPromises()
        expect(appLock.requestBiometricUnlock).toHaveBeenCalled()
        expect(wrapper.emitted('unlocked')).toHaveLength(1)
    })

    it('never renders a skip control', () => {
        const wrapper = mount(TalosMobileLockScreen, { props: { biometricEnabled: false } })
        expect(wrapper.text()).not.toMatch(/skip/i)
    })
})
