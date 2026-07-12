// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp, defineComponent, h } from 'vue'
import type { TalosWindowModuleContext } from '../../../../lib/talosWindowModuleContext'

vi.mock('../../settings/TalosThemeEngine.vue', async () => {
    const { defineComponent, h } = await import('vue')

    return {
        default: defineComponent({
            props: {
                theme: { type: String, required: true },
                initialTab: { type: String, default: '' },
            },
            setup(props) {
                return () => h('div', {
                    'data-testid': 'theme-engine-stub',
                    'data-theme': props.theme,
                    'data-initial-tab': props.initialTab,
                })
            },
        }),
    }
})

import TalosThemeWindow from './TalosThemeWindow.vue'

const mounted: Array<ReturnType<typeof createApp>> = []

afterEach(() => {
    mounted.splice(0).forEach((app) => app.unmount())
    document.body.replaceChildren()
})

function mountThemeWindow() {
    const container = document.createElement('div')
    document.body.append(container)
    const context = {
        theme: 'forge',
        activeSection: 'motion',
    } as TalosWindowModuleContext
    const app = createApp(defineComponent({
        setup() {
            return () => h(TalosThemeWindow, { context })
        },
    }))

    mounted.push(app)
    app.mount(container)

    return container
}

describe('TalosThemeWindow', () => {
    it('forwards the requested section to Theme Engine', () => {
        const container = mountThemeWindow()

        expect(container.querySelector('[data-testid="theme-engine-stub"]')?.getAttribute('data-initial-tab')).toBe('motion')
    })
})
