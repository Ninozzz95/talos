// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest'
import { createApp, defineComponent, h, nextTick } from 'vue'
import { TALOS_DEFAULT_CHAT_LAYOUT } from '../../../lib/talosChatLayout'
import TalosSettingsAppearancePanel from './TalosSettingsAppearancePanel.vue'

const mounted: Array<ReturnType<typeof createApp>> = []

afterEach(() => {
    mounted.splice(0).forEach((app) => app.unmount())
    document.body.replaceChildren()
})

function mountAppearance() {
    const container = document.createElement('div')
    document.body.append(container)

    let themeEngineOpenCount = 0
    const app = createApp(defineComponent({
        setup() {
            return () => h(TalosSettingsAppearancePanel, {
                theme: 'forge',
                themeMode: 'dark',
                chatLayout: TALOS_DEFAULT_CHAT_LAYOUT,
                themePolicyLocked: false,
                appearanceVisibility: {},
                appearanceGroups: [],
                onOpenThemeEngine: () => {
                    themeEngineOpenCount += 1
                },
            })
        },
    }))

    mounted.push(app)
    app.mount(container)

    return { container, themeEngineOpenCount: () => themeEngineOpenCount }
}

describe('TalosSettingsAppearancePanel tabs', () => {
    it('links the active tab to a labelled panel', () => {
        const { container } = mountAppearance()
        const designTab = container.querySelector<HTMLButtonElement>('[role="tab"]')
        const panel = container.querySelector<HTMLElement>('[role="tabpanel"]')

        expect(designTab?.id).toBe('talos-appearance-tab-design')
        expect(designTab?.getAttribute('aria-controls')).toBe('talos-appearance-panel-design')
        expect(panel?.id).toBe('talos-appearance-panel-design')
        expect(panel?.getAttribute('aria-labelledby')).toBe('talos-appearance-tab-design')
    })

    it('activates Motion with ArrowRight and preserves roving focus', async () => {
        const { container } = mountAppearance()
        let tabs = Array.from(container.querySelectorAll<HTMLButtonElement>('[role="tab"]'))

        expect(tabs.map((tab) => tab.tabIndex)).toEqual([0, -1, -1])
        tabs[0].focus()
        tabs[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))
        await nextTick()

        tabs = Array.from(container.querySelectorAll<HTMLButtonElement>('[role="tab"]'))
        expect(tabs[1].getAttribute('aria-selected')).toBe('true')
        expect(document.activeElement?.id).toBe('talos-appearance-tab-motion')
        expect(container.querySelector('[role="tabpanel"]')?.id).toBe('talos-appearance-panel-motion')
    })

    it('routes Motion to the canonical Theme Engine without rendering legacy writers', async () => {
        const { container, themeEngineOpenCount } = mountAppearance()
        const motionTab = Array.from(container.querySelectorAll<HTMLButtonElement>('[role="tab"]'))
            .find((tab) => tab.textContent?.includes('Motion'))

        motionTab?.click()
        await nextTick()

        expect(container.querySelector('[aria-label="Settings theme motion"]')).toBeNull()
        expect(container.querySelector('[aria-label="Settings use simple animation"]')).toBeNull()
        expect(container.querySelector('[aria-label="Settings disable background motion"]')).toBeNull()
        expect(container.querySelector('[aria-label="Settings disable procedural background"]')).toBeNull()

        const openButton = Array.from(container.querySelectorAll<HTMLButtonElement>('button'))
            .find((button) => button.textContent?.includes('Open Theme Engine'))
        expect(openButton).toBeTruthy()
        openButton?.click()
        await nextTick()
        expect(themeEngineOpenCount()).toBe(1)
    })
})
