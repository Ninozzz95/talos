// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, withDirectives } from 'vue'
import { mount } from '@vue/test-utils'
import { useTalosMessageEntrance } from '@/composables/useTalosMessageEntrance'
import { TALOS_ENTRATA_MASSIMA } from '@/composables/useTalosCalmMotion'

let deliver: (entries: Partial<IntersectionObserverEntry>[]) => void
const observed = new Set<Element>()
const cancel = vi.fn()
const animate = vi.fn(() => ({ finished: new Promise(() => {}), cancel }))
const disconnect = vi.fn(() => observed.clear())
const Host = defineComponent({
    props: { count: { default: 1 }, content: { default: '' }, state: { default: 'persisted' } },
    setup(props) {
        const entrance = useTalosMessageEntrance()
        return () => h('div', Array.from({ length: props.count }, (_, index) => withDirectives(
            h('article', { key: index }, props.content), [[entrance, props.state]],
        )))
    },
})
beforeEach(() => {
    observed.clear()
    vi.clearAllMocks()
    vi.stubGlobal('matchMedia', () => ({ matches: false }))
    vi.stubGlobal('IntersectionObserver', class {
        constructor(callback: typeof deliver) { deliver = callback }
        observe(el: Element) { observed.add(el) }
        unobserve(el: Element) { observed.delete(el) }
        disconnect = disconnect
    })
    Object.defineProperty(HTMLElement.prototype, 'animate', { configurable: true, value: animate })
})
afterEach(() => {
    Reflect.deleteProperty(HTMLElement.prototype, 'animate')
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    document.body.replaceChildren()
})

describe('M10 messaggi persistiti', () => {
    it('animates visible rows once at 220 ms and does not repeat on content updates', async () => {
        const wrapper = mount(Host, { attachTo: document.body })
        deliver([...observed].map((target) => ({ target, isIntersecting: true })))
        expect(animate).toHaveBeenCalledWith([
            { opacity: 0, transform: 'translateY(10px)' },
            { opacity: 1, transform: 'translateY(0)' },
        ], { duration: 220, easing: 'cubic-bezier(0.22, 0.8, 0.24, 1)', fill: 'none' })
        await wrapper.setProps({ content: 'Altro testo' })
        expect(observed.size).toBe(0)
        expect(animate).toHaveBeenCalledTimes(1)
        await wrapper.setProps({ count: 2 })
        deliver([...observed].map((target) => ({ target, isIntersecting: true })))
        expect(animate).toHaveBeenCalledTimes(2)
        wrapper.unmount()
        expect(disconnect).toHaveBeenCalled()
        expect(cancel).toHaveBeenCalledTimes(2)
    })

    it('does not animate pending tokens; starts only on first persistence', async () => {
        const wrapper = mount(Host, { props: { state: 'pending' }, attachTo: document.body })
        await wrapper.setProps({ content: 'Un token' })
        expect(observed.size).toBe(0)
        await wrapper.setProps({ state: 'persisted' })
        deliver([...observed].map((target) => ({ target, isIntersecting: true })))
        expect(animate).toHaveBeenCalledTimes(1)
        wrapper.unmount()
    })

    it('bounds a long conversation at eight visible rows, without synchronous row measurements', () => {
        const rect = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect')
        const wrapper = mount(Host, { props: { count: 200 }, attachTo: document.body })
        deliver([...observed].map((target, index) => ({ target, isIntersecting: index >= 180 })))
        expect(animate).toHaveBeenCalledTimes(8)
        expect(animate.mock.calls.length).toBeLessThanOrEqual(TALOS_ENTRATA_MASSIMA)
        expect(rect).not.toHaveBeenCalled()
        expect(observed.size).toBe(0)
        wrapper.unmount()
    })

    it.each([true, false])('respects reduced motion or a disabled engine token (reduced=%s)', (reduced) => {
        vi.stubGlobal('matchMedia', () => ({ matches: reduced }))
        const wrapper = mount(Host, { attachTo: document.body })
        for (const target of observed) (target as HTMLElement).style.setProperty('--talos-motion-calm-message-row', '0ms')
        deliver([...observed].map((target) => ({ target, isIntersecting: true })))
        expect(animate).not.toHaveBeenCalled()
        wrapper.unmount()
    })

    it('reads double duration from the token', () => {
        const wrapper = mount(Host, { attachTo: document.body })
        for (const target of observed) (target as HTMLElement).style.setProperty('--talos-motion-calm-message-row', '440ms')
        deliver([...observed].map((target) => ({ target, isIntersecting: true })))
        expect(animate).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ duration: 440 }))
        wrapper.unmount()
    })
})
