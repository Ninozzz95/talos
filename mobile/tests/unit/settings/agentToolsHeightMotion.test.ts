// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import Panel from '@/components/talos/settings/TalosMobileSettingsAgentToolsPanel.vue'
import { __resetSettingsStoreForTests } from '@/stores/settings'

let wrapper: VueWrapper | null = null
const calls: { el: HTMLElement; frames: Keyframe[]; options: KeyframeAnimationOptions; finish: () => void; cancel: ReturnType<typeof vi.fn> }[] = []
beforeEach(() => {
    calls.length = 0
    localStorage.clear()
    __resetSettingsStoreForTests()
    vi.stubGlobal('matchMedia', () => ({ matches: false }))
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function () {
        return new DOMRect(0, 0, 320, this.style.height ? Number.parseFloat(this.style.height) : 240)
    })
    Object.defineProperty(HTMLElement.prototype, 'animate', { configurable: true, value: vi.fn(function (this: HTMLElement, frames: Keyframe[], options: KeyframeAnimationOptions) {
        let finish!: () => void
        const finished = new Promise<void>((resolve) => { finish = resolve })
        const cancel = vi.fn(finish)
        calls.push({ el: this, frames, options, finish, cancel })
        return { finished, cancel }
    }) })
})
afterEach(() => {
    wrapper?.unmount()
    wrapper = null
    Reflect.deleteProperty(HTMLElement.prototype, 'animate')
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    document.body.replaceChildren()
})
function panel() {
    wrapper = mount(Panel, { attachTo: document.body, global: { stubs: { TalosThemedSelect: true } } })
    const button = wrapper.findAll('[data-agent-tool-group]')[1]!
    const body = wrapper.get<HTMLElement>(`[data-agent-tool-group-body="${button.attributes('data-agent-tool-group')}"]`).element
    return { button, body }
}

describe('M15 gruppi strumenti', () => {
    it('opens and closes measured height at 260 ms and restores natural layout', async () => {
        const { button, body } = panel()
        expect(body.style.display).toBe('none')
        await button.trigger('click')
        expect(button.attributes('aria-expanded')).toBe('true')
        expect(calls[0]!.frames).toEqual([{ height: '0px' }, { height: '240px' }])
        expect(calls[0]!.options).toMatchObject({ duration: 260, easing: 'cubic-bezier(0.22, 0.8, 0.24, 1)' })
        expect(body.style.overflow).toBe('hidden')
        calls[0]!.finish()
        await flushPromises()
        expect(body.style.height).toBe('')
        expect(body.style.overflow).toBe('')
        await button.trigger('click')
        expect(calls[1]!.frames).toEqual([{ height: '240px' }, { height: '0px' }])
        expect(body.inert).toBe(true)
        expect(body.style.display).toBe('')
        calls[1]!.finish()
        await flushPromises()
        expect(body.style.display).toBe('none')
    })

    it('reverses from the current height and ignores completion of the cancelled motion', async () => {
        const { button, body } = panel()
        await button.trigger('click')
        body.style.height = '90px'
        await button.trigger('click')
        expect(calls[0]!.cancel).toHaveBeenCalled()
        expect(calls[1]!.frames).toEqual([{ height: '90px' }, { height: '0px' }])
        body.style.height = '40px'
        await button.trigger('click')
        expect(calls[2]!.frames).toEqual([{ height: '40px' }, { height: '240px' }])
        await flushPromises()
        expect(body.style.display).toBe('')
        calls[2]!.finish()
        await flushPromises()
        expect(body.style.height).toBe('')
        expect(body.inert).toBe(false)
    })

    it.each([true, false])('is immediate with reduced motion or zero token (reduced=%s)', async (reduced) => {
        vi.stubGlobal('matchMedia', () => ({ matches: reduced }))
        const { button, body } = panel()
        body.style.setProperty('--talos-motion-calm-details', '0ms')
        await button.trigger('click')
        expect(body.style.display).toBe('')
        await button.trigger('click')
        expect(body.style.display).toBe('none')
        expect(calls).toHaveLength(0)
    })

    it('scales to 520 ms and cancels on unmount', async () => {
        const { button, body } = panel()
        body.style.setProperty('--talos-motion-calm-details', '520ms')
        await button.trigger('click')
        expect(calls[0]!.options.duration).toBe(520)
        wrapper!.unmount()
        wrapper = null
        expect(calls[0]!.cancel).toHaveBeenCalled()
        expect(body.style.height).toBe('')
    })
})
