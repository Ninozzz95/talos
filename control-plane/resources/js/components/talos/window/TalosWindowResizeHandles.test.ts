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
    it('renders eight labelled handles and emits their edge on pointer down', () => {
        const events: unknown[][] = []
        const container = document.createElement('div')
        document.body.append(container)
        const app = createApp(defineComponent({
            setup() {
                return () => h(TalosWindowResizeHandles, {
                    title: 'Runtime',
                    onResizeStart: (...args: unknown[]) => events.push(args),
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

        handles[4].dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0 }))

        expect(events).toHaveLength(1)
        expect(events[0][0]).toBe('top-right')
        expect(events[0][1]).toBeInstanceOf(PointerEvent)
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
})
