// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest'
import { createApp, defineComponent, h } from 'vue'
import TalosWindowResizeHandles from './TalosWindowResizeHandles.vue'

const mounted: Array<ReturnType<typeof createApp>> = []

afterEach(() => {
    mounted.splice(0).forEach((app) => app.unmount())
    document.body.replaceChildren()
})

describe('TalosWindowResizeHandles', () => {
    it('renders eight labelled handles and lets the upstream adapter own pointer down', () => {
        const container = document.createElement('div')
        let bubbled = 0
        container.addEventListener('pointerdown', () => { bubbled += 1 })
        document.body.append(container)
        const app = createApp(defineComponent({
            setup() {
                return () => h(TalosWindowResizeHandles, {
                    title: 'Runtime',
                })
            },
        }))
        mounted.push(app)
        app.mount(container)

        const handles = Array.from(container.querySelectorAll<HTMLButtonElement>('.talos-window-resize-handle'))
        expect(handles).toHaveLength(8)
        expect(handles.map((handle) => handle.getAttribute('aria-label'))).toEqual([
            'Resize Runtime window top',
            'Resize Runtime window right',
            'Resize Runtime window bottom',
            'Resize Runtime window left',
            'Resize Runtime window top right',
            'Resize Runtime window bottom right',
            'Resize Runtime window bottom left',
            'Resize Runtime window top left',
        ])

        const pointer = new PointerEvent('pointerdown', { bubbles: true, cancelable: true, button: 0 })
        handles[4].dispatchEvent(pointer)

        expect(pointer.defaultPrevented).toBe(false)
        expect(bubbled).toBe(1)
    })

    it('does not render handles while docked or fullscreen', () => {
        const container = document.createElement('div')
        document.body.append(container)
        const app = createApp(defineComponent({
            setup() {
                return () => h(TalosWindowResizeHandles, { title: 'Runtime', docked: true, fullscreen: true })
            },
        }))
        mounted.push(app)
        app.mount(container)

        expect(container.querySelectorAll('.talos-window-resize-handle')).toHaveLength(0)
    })

    it.each([
        ['left-half', 'Resize Runtime window right'],
        ['right-half', 'Resize Runtime window left'],
    ] as const)('exposes only the shared divider for a %s tile', (tileTarget, expectedLabel) => {
        const container = document.createElement('div')
        document.body.append(container)
        const app = createApp(defineComponent({
            setup() {
                return () => h(TalosWindowResizeHandles, { title: 'Runtime', tileTarget })
            },
        }))
        mounted.push(app)
        app.mount(container)

        const handles = Array.from(container.querySelectorAll<HTMLButtonElement>('.talos-window-resize-handle'))
        expect(handles).toHaveLength(1)
        expect(handles[0]?.getAttribute('aria-label')).toBe(expectedLabel)
    })
})
