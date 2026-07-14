// @vitest-environment jsdom

import { createApp, h } from 'vue'
import { afterEach, describe, expect, it } from 'vitest'
import TalosMessageScaleControls from './TalosMessageScaleControls.vue'

const mounted: Array<ReturnType<typeof createApp>> = []

afterEach(() => {
    mounted.splice(0).forEach((app) => app.unmount())
    document.body.innerHTML = ''
})

describe('TalosMessageScaleControls', () => {
    it('renders as an inline header control and emits all calibration actions', async () => {
        const events: string[] = []
        const host = document.createElement('div')
        document.body.appendChild(host)
        const app = createApp({
            render: () => h(TalosMessageScaleControls, {
                bubbleScale: 'balanced',
                label: 'Balanced',
                locked: false,
                onDecrease: () => events.push('decrease'),
                onIncrease: () => events.push('increase'),
                onReset: () => events.push('reset'),
            }),
        })
        mounted.push(app)
        app.mount(host)

        const controls = host.querySelector<HTMLElement>('[aria-label="Message size controls"]')
        expect(controls).toBeTruthy()
        expect(controls?.classList.contains('absolute')).toBe(false)

        host.querySelector<HTMLButtonElement>('[aria-label="Decrease message size"]')?.click()
        host.querySelector<HTMLButtonElement>('[aria-label="Increase message size"]')?.click()
        host.querySelector<HTMLButtonElement>('[data-testid="talos-message-scale-status"]')?.click()
        await Promise.resolve()

        expect(events).toEqual(['decrease', 'increase', 'reset'])
    })
})
