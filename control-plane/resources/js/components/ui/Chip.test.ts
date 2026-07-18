// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest'
import { createApp, defineComponent, h } from 'vue'
import Chip from './Chip.vue'

const apps: Array<ReturnType<typeof createApp>> = []

afterEach(() => {
    apps.splice(0).forEach((app) => app.unmount())
    document.body.replaceChildren()
})

function mountChip(props: Record<string, unknown>, slotText = 'Cockpit') {
    const container = document.createElement('div')
    document.body.append(container)
    const app = createApp(defineComponent({
        setup() {
            return () => h(Chip, props, { default: () => slotText })
        },
    }))
    apps.push(app)
    app.mount(container)
    return container
}

describe('Chip', () => {
    it('station code renders in chrome font at caption size', () => {
        const container = mountChip({ code: 'RUN' })

        const root = container.querySelector('.talos-chip')
        expect(root).not.toBeNull()

        const code = container.querySelector('.talos-chip-code')
        expect(code?.textContent).toBe('RUN')
        expect(code?.classList.contains('talos-type-caption')).toBe(true)
        expect(container.textContent).toContain('Cockpit')
    })

    it('accent tone opts in explicitly and neutral stays default', () => {
        const neutral = mountChip({})
        expect(neutral.querySelector('.talos-chip')?.classList.contains('talos-chip-accent')).toBe(false)

        const accent = mountChip({ tone: 'accent' })
        expect(accent.querySelector('.talos-chip')?.classList.contains('talos-chip-accent')).toBe(true)
    })

    it('omits the code element when no code is given', () => {
        const container = mountChip({}, 'Plain chip')
        expect(container.querySelector('.talos-chip-code')).toBeNull()
        expect(container.textContent).toContain('Plain chip')
    })
})
