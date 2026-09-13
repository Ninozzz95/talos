// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import Dialog from '@/components/shell/TalosMobileConfirmDialog.vue'
import { talosDialogOffset, useTalosDialogOriginCapture } from '@/composables/useTalosConfirmMotion'

const mounted: VueWrapper[] = []
const calls: { element: Element; frames: Keyframe[]; options: KeyframeAnimationOptions; finish: () => void; cancel: ReturnType<typeof vi.fn> }[] = []
beforeEach(() => {
    calls.length = 0
    vi.stubGlobal('matchMedia', () => ({ matches: false }))
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(new DOMRect(200, 200, 300, 200))
    vi.stubGlobal('Animation', class {})
    Object.defineProperty(HTMLElement.prototype, 'animate', { configurable: true, value: vi.fn(function (this: Element, frames: Keyframe[], options: KeyframeAnimationOptions) {
        let finish!: () => void
        let reject!: (reason: unknown) => void
        const finished = new Promise<void>((resolve, fail) => { finish = resolve; reject = fail })
        const cancel = vi.fn(() => reject(new DOMException('Cancelled', 'AbortError')))
        calls.push({ element: this, frames, options, finish, cancel })
        return { finished, cancel }
    }) })
})
afterEach(async () => {
    for (const wrapper of mounted.splice(0)) wrapper.unmount()
    for (const call of calls) call.finish()
    await flushPromises()
    document.body.replaceChildren()
    Reflect.deleteProperty(HTMLElement.prototype, 'animate')
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
})
function dialog() {
    const wrapper = mount(Dialog, { props: { title: 'Confermi?' }, slots: { footer: '<button id="confirm-action">Conferma</button>' } })
    mounted.push(wrapper)
    return wrapper
}

describe('M14/M13 conferma Calm', () => {
    it('enters at 280 ms from 12 px and .965, then exits at 210 ms toward 6 px and .98', async () => {
        const wrapper = dialog()
        expect(calls[0]!.frames).toEqual([
            { opacity: 0, transform: 'translate(0px,12px) scale(.965)' },
            { opacity: 1, transform: 'translate(0) scale(1)' },
        ])
        expect(calls[0]!.options).toMatchObject({ duration: 280, easing: 'cubic-bezier(0.22, 0.8, 0.24, 1)' })
        expect(calls[1]!.options).toMatchObject({ duration: 220, easing: 'ease' })
        wrapper.unmount()
        expect(calls[2]!.options).toMatchObject({ duration: 210, easing: 'cubic-bezier(0.3, 0, 0.8, 0.15)' })
        expect(calls[2]!.frames[1]).toEqual({ opacity: 0, transform: 'translateY(6px) scale(.98)' })
        expect(document.querySelector('[role="dialog"]')).toBeNull()
        expect(document.getElementById('confirm-action')).toBeNull()
        const snapshot = calls[2]!.element.parentElement!
        expect(snapshot.inert).toBe(true)
        expect(snapshot.getAttribute('aria-hidden')).toBe('true')
        calls[2]!.finish()
        calls[3]!.finish()
        await flushPromises()
        expect(snapshot.isConnected).toBe(false)
    })

    it('takes the recent control rectangle, clamps ±70/±40 and forgets it at 750 ms', () => {
        let time = 1000
        vi.spyOn(performance, 'now').mockImplementation(() => time)
        const host = mount(defineComponent({ setup() { useTalosDialogOriginCapture(); return () => h('button', 'Apri') } }), { attachTo: document.body })
        mounted.push(host)
        vi.mocked(HTMLElement.prototype.getBoundingClientRect).mockReturnValueOnce(new DOMRect(0, 0, 44, 44))
        host.element.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0 }))
        time += 749
        dialog()
        expect(calls[0]!.frames[0]!.transform).toBe('translate(-70px,-40px) scale(.965)')
        time += 1
        expect(talosDialogOffset(new DOMRect(200, 200, 300, 200))).toEqual({ x: 0, y: 12 })
        expect(talosDialogOffset(new DOMRect(0, 0, 100, 100), new DOMRect(300, 300, 44, 44))).toEqual({ x: 70, y: 40 })
    })

    it('uses scaled tokens for entry and exit', () => {
        const style = window.getComputedStyle.bind(window)
        vi.spyOn(window, 'getComputedStyle').mockImplementation((element) => {
            const result = style(element)
            const tokens: Record<string, string> = {
                '--talos-motion-calm-dialog': '560ms',
                '--talos-motion-calm-dialog-exit': '420ms',
                '--talos-motion-calm-veil': '440ms',
            }
            return new Proxy(result, { get: (target, key) => key === 'getPropertyValue'
                ? (name: string) => tokens[name] ?? target.getPropertyValue(name)
                : Reflect.get(target, key) })
        })
        dialog().unmount()
        expect(calls.map((call) => call.options.duration)).toEqual([560, 440, 420, 440])
    })

    it('creates no animation or exit copy with reduced motion', () => {
        vi.stubGlobal('matchMedia', () => ({ matches: true }))
        dialog().unmount()
        expect(calls).toHaveLength(0)
        expect(document.querySelector('[role="dialog"]')).toBeNull()
    })

    it('removes an interrupted exit when another confirmation opens', async () => {
        dialog().unmount()
        const snapshot = calls[2]!.element.parentElement!
        dialog()
        await flushPromises()
        expect(snapshot.isConnected).toBe(false)
    })
})
