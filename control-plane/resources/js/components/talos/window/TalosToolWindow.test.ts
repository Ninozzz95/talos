// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest'
import { createApp, defineComponent, h } from 'vue'
import TalosToolWindow from './TalosToolWindow.vue'

afterEach(() => document.body.replaceChildren())

function mountWindow(options: Record<string, unknown> = {}) {
    const events: Array<{ name: string; args: unknown[] }> = []
    const root = document.createElement('div')
    document.body.append(root)
    const app = createApp(defineComponent({
        setup: () => () => h(TalosToolWindow, {
            id: 'theme',
            title: 'Theme',
            peekAvailable: true,
            ...options,
            onPeek: (...args: unknown[]) => events.push({ name: 'peek', args }),
        }),
    }))
    app.mount(root)
    return { app, root, events }
}

describe('TalosToolWindow', () => {
    it('lets the window-manager frame own floating width without an inner max-width gap', () => {
        const { app, root } = mountWindow({ width: 1_120 })
        const surface = root.querySelector<HTMLElement>('[data-window-id="theme"]')!

        expect(surface.className).toContain('w-full')
        expect(surface.className).not.toContain('max-w-')
        expect(surface.dataset.windowWidth).toBe('1120')
        app.unmount()
    })

    it('keeps Peek on the window surface and forwards its toggle', () => {
        const { app, root, events } = mountWindow({ peeking: true })
        const surface = root.querySelector<HTMLElement>('[data-window-id="theme"]')!
        expect(surface.classList.contains('talos-tool-window-peek')).toBe(true)
        expect(surface.dataset.windowPeeking).toBe('true')

        root.querySelector<HTMLButtonElement>('[aria-label="Stop peeking behind Theme"]')!.click()
        expect(events).toEqual([{ name: 'peek', args: ['theme'] }])
        app.unmount()
    })
})
