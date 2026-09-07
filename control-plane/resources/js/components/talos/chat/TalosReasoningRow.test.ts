// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest'
import { createApp, h } from 'vue'
import TalosReasoningRow from './TalosReasoningRow.vue'

const apps: Array<ReturnType<typeof createApp>> = []

afterEach(() => {
    apps.splice(0).forEach((app) => app.unmount())
    document.body.replaceChildren()
})

describe('TalosReasoningRow', () => {
    it('exposes a 44-pixel dialog trigger without rendering reasoning inline', () => {
        const events: string[] = []
        const container = document.createElement('div')
        document.body.append(container)
        const app = createApp({
            render: () => h(TalosReasoningRow, {
                reasoning: {
                    source: 'provider',
                    provider: 'openai',
                    text: 'Private from the collapsed row.',
                    duration_ms: 1250,
                },
                onOpen: () => events.push('open'),
            }),
        })
        apps.push(app)
        app.mount(container)

        const trigger = container.querySelector<HTMLButtonElement>('[data-testid="talos-reasoning-trigger"]')
        expect(trigger?.getAttribute('aria-haspopup')).toBe('dialog')
        expect(trigger?.className).toContain('min-h-11')
        expect(trigger?.textContent).toContain('Reasoning')
        expect(trigger?.textContent).toContain('1.3s')
        expect(container.textContent).not.toContain('Private from the collapsed row.')

        trigger?.click()
        expect(events).toEqual(['open'])
    })
})
