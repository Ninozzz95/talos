// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest'
import { createApp, defineComponent, h, nextTick, ref } from 'vue'
import Tabs from './Tabs.vue'

const mounted: Array<ReturnType<typeof createApp>> = []

afterEach(() => {
    mounted.splice(0).forEach((app) => app.unmount())
    document.body.replaceChildren()
})

describe('Tabs', () => {
    it('renders grouped vertical settings tabs and supports ArrowDown', async () => {
        const selected = ref('models')
        const container = document.createElement('div')
        document.body.append(container)
        const app = createApp(defineComponent({
            setup() {
                return () => h(Tabs, {
                    modelValue: selected.value,
                    items: [
                        { id: 'models', label: 'Models', group: 'Workspace' },
                        { id: 'appearance', label: 'Appearance', group: 'Workspace' },
                        { id: 'account', label: 'Account', group: 'Operator' },
                    ],
                    label: 'Settings categories',
                    tabIdPrefix: 'settings-tab',
                    panelIdPrefix: 'settings-panel',
                    orientation: 'vertical',
                    variant: 'settings',
                    'onUpdate:modelValue': (value: string) => {
                        selected.value = value
                    },
                })
            },
        }))

        mounted.push(app)
        app.mount(container)

        const tablist = container.querySelector<HTMLElement>('[role="tablist"]')
        let tabs = Array.from(container.querySelectorAll<HTMLButtonElement>('[role="tab"]'))

        expect(tablist?.getAttribute('aria-orientation')).toBe('vertical')
        expect(Array.from(container.querySelectorAll('[data-talos-tab-group]')).map((item) => item.textContent?.trim())).toEqual(['Workspace', 'Operator'])

        tabs[0].focus()
        tabs[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }))
        await nextTick()

        tabs = Array.from(container.querySelectorAll<HTMLButtonElement>('[role="tab"]'))
        expect(selected.value).toBe('appearance')
        expect(tabs.map((tab) => tab.tabIndex)).toEqual([-1, 0, -1])
        expect(document.activeElement?.id).toBe('settings-tab-appearance')
    })
})
