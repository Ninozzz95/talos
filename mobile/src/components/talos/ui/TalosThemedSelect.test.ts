// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest'
import { createApp, defineComponent, h, nextTick, reactive } from 'vue'
import TalosThemedSelect, { type TalosThemedSelectItem } from './TalosThemedSelect.vue'

if (!Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = () => undefined
}
if (!Element.prototype.hasPointerCapture) {
    Element.prototype.hasPointerCapture = () => false
    Element.prototype.setPointerCapture = () => undefined
    Element.prototype.releasePointerCapture = () => undefined
}

let app: ReturnType<typeof createApp> | undefined

afterEach(() => {
    app?.unmount()
    app = undefined
    document.body.replaceChildren()
})
const ITEMS: TalosThemedSelectItem[] = [
    { value: 'forge', label: 'Forge' },
    { value: 'telemetry', label: 'Telemetry' },
    { value: 'disabled', label: 'Disabled', disabled: true },
]

function mountSelect(value = 'forge') {
    const state = reactive({ value })
    const mountPoint = document.createElement('div')
    document.body.append(mountPoint)
    app = createApp(defineComponent({
        setup: () => () => h(TalosThemedSelect, {
            modelValue: state.value,
            items: ITEMS,
            ariaLabel: 'Theme preset',
            'onUpdate:modelValue': (next: string) => { state.value = next },
        }),
    }))
    app.mount(mountPoint)
    return state
}

async function settle() {
    await nextTick()
    await new Promise((resolve) => setTimeout(resolve, 0))
    await nextTick()
}

describe('TalosThemedSelect mobile parity', () => {
    it('renders a themed trigger instead of a native select', () => {
        mountSelect()
        const trigger = document.querySelector<HTMLButtonElement>('[data-testid="talos-themed-select-trigger"]')
        expect(trigger?.tagName).toBe('BUTTON')
        expect(trigger?.textContent).toContain('Forge')
        expect(document.querySelector('select')).toBeNull()
    })

    it('opens a portalled listbox and commits keyboard selection', async () => {
        const state = mountSelect()
        const trigger = document.querySelector<HTMLButtonElement>('[data-testid="talos-themed-select-trigger"]')
        const Ctor = typeof PointerEvent === 'function' ? PointerEvent : MouseEvent
        trigger?.dispatchEvent(new Ctor('pointerdown', { bubbles: true, cancelable: true, button: 0 }))
        await settle()

        const option = document.querySelector<HTMLElement>('[data-value="telemetry"]')
        expect(document.querySelector('[data-testid="talos-themed-select-content"]')).not.toBeNull()
        option?.focus()
        option?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
        await settle()
        expect(state.value).toBe('telemetry')
    })
})
