// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest'
import { createApp, defineComponent, h, nextTick, ref } from 'vue'
import TalosScaleControl from './TalosScaleControl.vue'

const mounted: Array<ReturnType<typeof createApp>> = []

afterEach(() => {
    mounted.splice(0).forEach((app) => app.unmount())
    document.body.replaceChildren()
})

function mountScaleControl(options: { value?: number; disabled?: boolean } = {}) {
    const container = document.createElement('div')
    document.body.append(container)
    const value = ref(options.value ?? 1)
    const updates: number[] = []
    const app = createApp(defineComponent({
        setup() {
            return () => h(TalosScaleControl, {
                controlId: 'interface-scale',
                label: 'Interface scale',
                description: 'Adjust navigation and control sizing.',
                modelValue: value.value,
                min: 0.8,
                max: 1.3,
                step: 0.05,
                defaultValue: 1,
                disabled: options.disabled ?? false,
                'onUpdate:modelValue': (next: number) => {
                    updates.push(next)
                    value.value = next
                },
            })
        },
    }))

    mounted.push(app)
    app.mount(container)

    return { container, updates, value }
}

describe('TalosScaleControl', () => {
    it('keeps a native range and number input synchronized with an exact percentage status', async () => {
        const { container, updates } = mountScaleControl({ value: 1.1 })
        const range = container.querySelector<HTMLInputElement>('input[type="range"]')
        const number = container.querySelector<HTMLInputElement>('input[type="number"]')
        const status = container.querySelector<HTMLOutputElement>('output')

        expect(range?.getAttribute('aria-label')).toBe('Interface scale')
        expect(range?.min).toBe('0.8')
        expect(range?.max).toBe('1.3')
        expect(range?.step).toBe('0.05')
        expect(number?.getAttribute('aria-label')).toBe('Interface scale value')
        expect(range?.value).toBe('1.1')
        expect(number?.value).toBe('1.1')
        expect(status?.textContent).toBe('110%')

        if (range) {
            range.value = '1.25'
            range.dispatchEvent(new Event('input', { bubbles: true }))
        }
        await nextTick()

        expect(updates).toEqual([1.25])
        expect(number?.value).toBe('1.25')
        expect(status?.textContent).toBe('125%')
    })

    it('normalizes number input values to the declared step and clamps both bounds', async () => {
        const { container, updates } = mountScaleControl()
        const number = container.querySelector<HTMLInputElement>('input[type="number"]')

        if (number) {
            number.value = '1.23'
            number.dispatchEvent(new Event('change', { bubbles: true }))
        }
        await nextTick()
        if (number) {
            number.value = '5'
            number.dispatchEvent(new Event('change', { bubbles: true }))
        }
        await nextTick()

        expect(updates).toEqual([1.25, 1.3])
    })

    it('resets to the declared default and disables every interactive control when locked', async () => {
        const unlocked = mountScaleControl({ value: 1.2 })
        unlocked.container.querySelector<HTMLButtonElement>('[aria-label="Reset Interface scale"]')?.click()
        await nextTick()
        expect(unlocked.updates).toEqual([1])

        const locked = mountScaleControl({ disabled: true })
        expect(Array.from(locked.container.querySelectorAll<HTMLInputElement>('input')).every((input) => input.disabled)).toBe(true)
        expect(locked.container.querySelector<HTMLButtonElement>('[aria-label="Reset Interface scale"]')?.disabled).toBe(true)
    })
})
