import { afterEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import TalosLauncherIconDialog from '@/components/talos/settings/TalosLauncherIconDialog.vue'
import {
    useLauncherIconController,
    __setLauncherIconDepsForTests,
    __resetLauncherIconControllerForTests,
    type LauncherIconDeps,
} from '@/services/launcherIcon'

function install(overrides: Partial<LauncherIconDeps> = {}) {
    const applyNative = vi.fn(async (_p: string) => {})
    const restart = vi.fn(async () => {})
    __setLauncherIconDepsForTests({
        isNative: () => true,
        getApplied: async () => 'calm',
        setApplied: async () => {},
        applyNative,
        restart,
        onNextPause: () => {},
        ...overrides,
    })
    return { applyNative, restart }
}

afterEach(() => { __resetLauncherIconControllerForTests() })

describe('TalosLauncherIconDialog', () => {
    it('is absent until a switch is pending', () => {
        install()
        const wrapper = mount(TalosLauncherIconDialog, { global: { stubs: { teleport: true } } })
        expect(wrapper.find('[data-testid="talos-launcher-icon-dialog"]').exists()).toBe(false)
    })

    it('renders the target preset and "Restart now" applies + restarts', async () => {
        const { applyNative, restart } = install()
        const controller = useLauncherIconController()
        await controller.hydrate()
        controller.evaluate('noir', true)
        const wrapper = mount(TalosLauncherIconDialog, { global: { stubs: { teleport: true } } })
        expect(wrapper.find('[data-testid="talos-launcher-icon-dialog"]').exists()).toBe(true)
        expect(wrapper.text()).toContain('Noir')
        await wrapper.get('[data-testid="talos-launcher-icon-restart"]').trigger('click')
        await Promise.resolve()
        expect(applyNative).toHaveBeenCalledWith('noir')
        expect(restart).toHaveBeenCalledOnce()
    })

    it('"Keep the current icon" dismisses without applying', async () => {
        const { applyNative } = install()
        const controller = useLauncherIconController()
        await controller.hydrate()
        controller.evaluate('ember', true)
        const wrapper = mount(TalosLauncherIconDialog, { global: { stubs: { teleport: true } } })
        await wrapper.get('[data-testid="talos-launcher-icon-dismiss"]').trigger('click')
        expect(wrapper.find('[data-testid="talos-launcher-icon-dialog"]').exists()).toBe(false)
        expect(applyNative).not.toHaveBeenCalled()
    })
})
