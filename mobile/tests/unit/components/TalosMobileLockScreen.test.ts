import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import TalosMobileLockScreen from '@/components/security/TalosMobileLockScreen.vue'

// F2-T6 — lock screen: unlock ONLY through a real verification (PIN or OS
// biometric success); wrong attempts stay honest; no skip path exists.
// R1-3 — the surface is Teleported to body with the shared modality (inert
// workspace, Tab trap), so queries go through document.body.
const appLock = vi.hoisted(() => ({
    verifyAppLockPin: vi.fn(async () => false),
    requestBiometricUnlock: vi.fn(async () => false),
}))
vi.mock('@/services/appLock', () => appLock)

beforeEach(() => {
    appLock.verifyAppLockPin.mockReset().mockResolvedValue(false)
    appLock.requestBiometricUnlock.mockReset().mockResolvedValue(false)
    document.body.innerHTML = ''
})

function mountLock(biometricEnabled: boolean) {
    return mount(TalosMobileLockScreen, { props: { biometricEnabled }, attachTo: document.body })
}

function bodyGet<T extends HTMLElement>(selector: string): T {
    const element = document.body.querySelector<T>(selector)
    if (!element) throw new Error(`missing ${selector}`)
    return element
}

describe('TalosMobileLockScreen (F2-T6)', () => {
    it('rejects a wrong PIN with an honest error and stays locked', async () => {
        const wrapper = mountLock(false)
        const pin = bodyGet<HTMLInputElement>('[data-testid="talos-lock-pin"]')
        pin.value = '0000'
        pin.dispatchEvent(new Event('input'))
        await flushPromises()
        bodyGet('[data-testid="talos-lock-submit"]').click()
        await flushPromises()
        expect(document.body.textContent).toMatch(/wrong pin/i)
        expect(wrapper.emitted('unlocked')).toBeUndefined()
        wrapper.unmount()
    })

    it('unlocks on a verified PIN', async () => {
        appLock.verifyAppLockPin.mockResolvedValue(true)
        const wrapper = mountLock(false)
        const pin = bodyGet<HTMLInputElement>('[data-testid="talos-lock-pin"]')
        pin.value = '123456'
        pin.dispatchEvent(new Event('input'))
        await flushPromises()
        bodyGet('[data-testid="talos-lock-submit"]').click()
        await flushPromises()
        expect(appLock.verifyAppLockPin).toHaveBeenCalledWith('123456')
        expect(wrapper.emitted('unlocked')).toHaveLength(1)
        wrapper.unmount()
    })

    it('attempts biometric unlock on mount when enabled and unlocks on success', async () => {
        appLock.requestBiometricUnlock.mockResolvedValue(true)
        const wrapper = mountLock(true)
        await flushPromises()
        expect(appLock.requestBiometricUnlock).toHaveBeenCalled()
        expect(wrapper.emitted('unlocked')).toHaveLength(1)
        wrapper.unmount()
    })

    it('never renders a skip control', () => {
        const wrapper = mountLock(false)
        expect(document.body.textContent).not.toMatch(/skip/i)
        wrapper.unmount()
    })

    it('R1-3: the lock is an aria-modal surface (inert workspace contract)', () => {
        const wrapper = mountLock(false)
        const surface = bodyGet('[data-testid="talos-lock-screen"]')
        expect(surface.getAttribute('aria-modal')).toBe('true')
        expect(surface.getAttribute('role')).toBe('dialog')
        wrapper.unmount()
    })
})
