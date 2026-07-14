// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp, defineComponent, h } from 'vue'
import TalosWindowTitleBar from './TalosWindowTitleBar.vue'

const mounted: Array<ReturnType<typeof createApp>> = []

afterEach(() => {
    mounted.splice(0).forEach((app) => app.unmount())
    document.body.replaceChildren()
})

function mountTitleBar(options: Record<string, unknown> = {}) {
    const events: Array<{ name: string; args: unknown[] }> = []
    const container = document.createElement('div')
    document.body.append(container)
    const app = createApp(defineComponent({
        setup() {
            return () => h(TalosWindowTitleBar, {
                id: 'runtime',
                title: 'Runtime',
                description: 'Execution state',
                ...options,
                onMaximize: (...args: unknown[]) => events.push({ name: 'maximize', args }),
                onRestore: (...args: unknown[]) => events.push({ name: 'restore', args }),
                onMinimize: (...args: unknown[]) => events.push({ name: 'minimize', args }),
                onReset: (...args: unknown[]) => events.push({ name: 'reset', args }),
                onDock: (...args: unknown[]) => events.push({ name: 'dock', args }),
                onClose: (...args: unknown[]) => events.push({ name: 'close', args }),
                onSnap: (...args: unknown[]) => events.push({ name: 'snap', args }),
                onPeek: (...args: unknown[]) => events.push({ name: 'peek', args }),
                onCancelInteraction: (...args: unknown[]) => events.push({ name: 'cancelInteraction', args }),
            })
        },
    }))
    mounted.push(app)
    app.mount(container)
    return { container, events }
}

describe('TalosWindowTitleBar', () => {
    it('exposes the upstream drag handle without swallowing its pointer event', () => {
        const { container, events } = mountTitleBar()
        const titleSpace = container.querySelector<HTMLElement>('[aria-label="Drag Runtime window"]')!
        const button = container.querySelector<HTMLButtonElement>('[aria-label="Minimize Runtime"]')!
        let bubbled = 0
        container.addEventListener('pointerdown', () => { bubbled += 1 })

        const pointer = new PointerEvent('pointerdown', { bubbles: true, cancelable: true, button: 0 })
        titleSpace.dispatchEvent(pointer)
        button.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0 }))

        expect(titleSpace.classList.contains('talos-window-drag-handle')).toBe(true)
        expect(pointer.defaultPrevented).toBe(false)
        expect(bubbled).toBe(1)
        expect(events.filter((event) => event.name === 'dragStart')).toHaveLength(0)
    })

    it('emits fullscreen toggle, snap, and cancellation keyboard interactions', () => {
        const { container, events } = mountTitleBar()
        const titleSpace = container.querySelector<HTMLElement>('[aria-label="Drag Runtime window"]')!
        const escapedToWorkspace = vi.fn()
        window.addEventListener('keydown', escapedToWorkspace)

        titleSpace.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))
        titleSpace.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
        titleSpace.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true, ctrlKey: true }))
        titleSpace.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, ctrlKey: true }))
        escapedToWorkspace.mockClear()
        titleSpace.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))

        expect(events.filter((event) => event.name === 'maximize').map((event) => event.args)).toEqual([['runtime'], ['runtime']])
        expect(events.filter((event) => event.name === 'snap').map((event) => event.args)).toEqual([
            ['runtime', 'left'],
            ['runtime', 'right'],
        ])
        expect(events.filter((event) => event.name === 'cancelInteraction').map((event) => event.args)).toEqual([['runtime']])
        expect(escapedToWorkspace).not.toHaveBeenCalled()
        window.removeEventListener('keydown', escapedToWorkspace)

        const fullscreen = mountTitleBar({ fullscreen: true })
        fullscreen.container.querySelector<HTMLElement>('[aria-label="Drag Runtime window"]')!.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))
        expect(fullscreen.events.filter((event) => event.name === 'restore').map((event) => event.args)).toEqual([['runtime']])
    })

    it('stops button clicks from reaching the drag surface', () => {
        const { container, events } = mountTitleBar()
        const buttons = Array.from(container.querySelectorAll<HTMLButtonElement>('button'))

        buttons.forEach((button) => button.click())

        expect(events.map((event) => event.name)).toEqual(['minimize', 'reset', 'maximize', 'dock', 'close'])
        expect(events.every((event) => event.args[0] === 'runtime')).toBe(true)
    })

    it('exposes an accessible transient Peek toggle only for eligible windows', () => {
        const hidden = mountTitleBar()
        expect(hidden.container.querySelector('[aria-label^="Peek behind"]')).toBeNull()

        const available = mountTitleBar({
            id: 'theme',
            title: 'Theme',
            peekAvailable: true,
            peeking: false,
        })
        const peek = available.container.querySelector<HTMLButtonElement>('[aria-label="Peek behind Theme"]')!
        expect(peek).not.toBeNull()
        expect(peek.getAttribute('aria-pressed')).toBe('false')
        peek.click()
        expect(available.events.filter((event) => event.name === 'peek').map((event) => event.args)).toEqual([['theme']])

        const active = mountTitleBar({
            id: 'settings',
            title: 'Settings',
            peekAvailable: true,
            peeking: true,
        })
        expect(active.container.querySelector('[aria-label="Stop peeking behind Settings"]')?.getAttribute('aria-pressed')).toBe('true')
    })
})
