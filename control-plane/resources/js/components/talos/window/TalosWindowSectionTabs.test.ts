// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest'
import { createApp, defineComponent, h, nextTick, ref } from 'vue'
import TalosWindowSectionTabs from './TalosWindowSectionTabs.vue'

const mounted: Array<ReturnType<typeof createApp>> = []

afterEach(() => {
    mounted.splice(0).forEach((app) => app.unmount())
    document.body.replaceChildren()
})

function mountTabs() {
    const selected = ref('summary')
    const container = document.createElement('div')
    document.body.append(container)

    const app = createApp(defineComponent({
        setup() {
            return () => h(TalosWindowSectionTabs, {
                windowId: 'runtime',
                tabs: [
                    { id: 'summary', label: 'Summary' },
                    { id: 'events', label: 'Events' },
                    { id: 'recovery', label: 'Recovery' },
                ],
                activeTab: selected.value,
                onSelect: (value: string) => {
                    selected.value = value
                },
            })
        },
    }))

    mounted.push(app)
    app.mount(container)

    return { container, selected }
}

describe('TalosWindowSectionTabs', () => {
    it('keeps contextual information out of section navigation', async () => {
        const selected = ref('timeline')
        const container = document.createElement('div')
        document.body.append(container)

        const app = createApp(defineComponent({
            setup() {
                return () => h(TalosWindowSectionTabs, {
                    windowId: 'runtime',
                    tabs: [
                        { id: 'timeline', label: 'Timeline' },
                        { id: 'dag', label: 'DAG' },
                        { id: 'recovery', label: 'Recovery' },
                    ],
                    activeTab: selected.value,
                    onSelect: (value: string) => { selected.value = value },
                })
            },
        }))

        mounted.push(app)
        app.mount(container)

        expect(container.querySelectorAll('[data-guide-id]')).toHaveLength(0)
        expect(container.querySelector('button button')).toBeNull()

        container.querySelector<HTMLButtonElement>('[role="tab"][aria-controls$="-recovery"]')?.click()
        await nextTick()

        expect(selected.value).toBe('recovery')
    })

    it('links tabs to panels and exposes one tab stop', () => {
        const { container } = mountTabs()
        const tabs = Array.from(container.querySelectorAll<HTMLButtonElement>('[role="tab"]'))

        expect(tabs.map((tab) => tab.tabIndex)).toEqual([0, -1, -1])
        expect(tabs[0].id).toBe('talos-window-section-tab-runtime-summary')
        expect(tabs[0].getAttribute('aria-controls')).toBe('talos-window-section-panel-runtime-summary')
    })

    it('selects and focuses the next tab with ArrowRight', async () => {
        const { container, selected } = mountTabs()
        const tabs = Array.from(container.querySelectorAll<HTMLButtonElement>('[role="tab"]'))

        tabs[0].focus()
        tabs[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))
        await nextTick()

        expect(selected.value).toBe('events')
        expect(document.activeElement?.id).toBe('talos-window-section-tab-runtime-events')
    })

    it('supports End and Home navigation', async () => {
        const { container, selected } = mountTabs()
        let tabs = Array.from(container.querySelectorAll<HTMLButtonElement>('[role="tab"]'))

        tabs[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }))
        await nextTick()
        expect(selected.value).toBe('recovery')

        tabs = Array.from(container.querySelectorAll<HTMLButtonElement>('[role="tab"]'))
        tabs[2].dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }))
        await nextTick()
        expect(selected.value).toBe('summary')
    })
})
