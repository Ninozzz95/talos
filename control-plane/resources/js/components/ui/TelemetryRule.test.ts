// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest'
import { createApp, defineComponent, h } from 'vue'
import TelemetryRule from './TelemetryRule.vue'

const apps: Array<ReturnType<typeof createApp>> = []

afterEach(() => {
    apps.splice(0).forEach((app) => app.unmount())
    document.body.replaceChildren()
})

function mountRule(props: Record<string, unknown>, readout?: string) {
    const container = document.createElement('div')
    document.body.append(container)
    const app = createApp(defineComponent({
        setup() {
            return () => h(TelemetryRule, props, readout
                ? { readout: () => h('span', readout) }
                : undefined)
        },
    }))
    apps.push(app)
    app.mount(container)
    return container
}

describe('TelemetryRule', () => {
    it('renders tick ruler, tracked mono label and tabular readout slot', () => {
        const container = mountRule({ label: 'EVIDENCE 014' }, 'SHA 9F2A…C41')

        const root = container.querySelector('.talos-rule')
        expect(root).not.toBeNull()

        const ticks = container.querySelectorAll('.talos-rule-tick')
        expect(ticks.length).toBe(12)
        expect(container.querySelector('.talos-rule-ticks')?.getAttribute('aria-hidden')).toBe('true')

        const label = container.querySelector('.talos-rule-label')
        expect(label?.textContent).toBe('EVIDENCE 014')

        const readout = container.querySelector('.talos-readout')
        expect(readout?.textContent).toContain('SHA 9F2A…C41')
    })

    it('honors a custom tick count', () => {
        const container = mountRule({ label: 'RUN 001', ticks: 3 })
        expect(container.querySelectorAll('.talos-rule-tick').length).toBe(3)
    })

    it('danger tone maps to danger tokens and never accent', () => {
        const container = mountRule({ label: 'DENIED', tone: 'danger' })
        const root = container.querySelector('.talos-rule')
        expect(root?.classList.contains('talos-rule-danger')).toBe(true)
        expect(root?.getAttribute('data-tone')).toBe('danger')
    })

    it('omits the readout container when the slot is empty', () => {
        const container = mountRule({ label: 'RUN 002' })
        expect(container.querySelector('.talos-readout')).toBeNull()
    })
})
