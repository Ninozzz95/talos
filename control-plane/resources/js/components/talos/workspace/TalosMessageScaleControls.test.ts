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
    function mountControl(messageScale: number, locked = false) {
        const events: string[] = []
        const host = document.createElement('div')
        document.body.appendChild(host)
        const app = createApp({
            render: () => h(TalosMessageScaleControls, {
                messageScale,
                locked,
                onDecrease: () => events.push('decrease'),
                onIncrease: () => events.push('increase'),
                onReset: () => events.push('reset'),
            }),
        })
        mounted.push(app)
        app.mount(host)

        return { host, events }
    }

    it('renders a numeric percentage and emits all calibration actions', async () => {
        const { host, events } = mountControl(1)
        const controls = host.querySelector<HTMLElement>('[aria-label="Message size controls"]')
        expect(controls).toBeTruthy()
        expect(controls?.classList.contains('absolute')).toBe(false)
        expect(host.querySelector('[data-testid="talos-message-scale-status"]')?.textContent).toBe('100%')

        host.querySelector<HTMLButtonElement>('[aria-label="Decrease message size"]')?.click()
        host.querySelector<HTMLButtonElement>('[aria-label="Increase message size"]')?.click()
        host.querySelector<HTMLButtonElement>('[data-testid="talos-message-scale-status"]')?.click()
        await Promise.resolve()

        expect(events).toEqual(['decrease', 'increase', 'reset'])
    })

    it('disables step actions at numeric bounds and locks every action under policy', () => {
        const minimum = mountControl(0.75)
        expect(minimum.host.querySelector<HTMLButtonElement>('[aria-label="Decrease message size"]')?.disabled).toBe(true)
        expect(minimum.host.querySelector<HTMLButtonElement>('[aria-label="Increase message size"]')?.disabled).toBe(false)

        const maximum = mountControl(1.4)
        expect(maximum.host.querySelector<HTMLButtonElement>('[aria-label="Decrease message size"]')?.disabled).toBe(false)
        expect(maximum.host.querySelector<HTMLButtonElement>('[aria-label="Increase message size"]')?.disabled).toBe(true)

        const locked = mountControl(1, true)
        expect(Array.from(locked.host.querySelectorAll<HTMLButtonElement>('button')).every((button) => button.disabled)).toBe(true)
    })
})
