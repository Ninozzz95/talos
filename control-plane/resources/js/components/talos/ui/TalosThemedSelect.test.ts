// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest'
import { createApp, defineComponent, h, nextTick, reactive } from 'vue'
import TalosThemedSelect, { type TalosThemedSelectItem } from './TalosThemedSelect.vue'

// reka-ui scrolls the highlighted option into view; jsdom has no layout engine.
if (!Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = () => undefined
}
// reka-ui Select captures the pointer on its trigger; jsdom omits the pointer-capture API.
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

const PROVIDERS: TalosThemedSelectItem[] = [
    { value: 'openai', label: 'OpenAI' },
    { value: 'anthropic', label: 'Anthropic' },
    { value: 'ollama', label: 'Ollama (local)', disabled: true },
]

function mountSelect(options: { value?: string; disabled?: boolean; items?: TalosThemedSelectItem[] } = {}) {
    const state = reactive({ value: options.value ?? '' })
    const mountPoint = document.createElement('div')
    document.body.append(mountPoint)

    app = createApp(defineComponent({
        setup() {
            return () => h(TalosThemedSelect, {
                modelValue: state.value,
                items: options.items ?? PROVIDERS,
                disabled: options.disabled ?? false,
                ariaLabel: 'Provider',
                'onUpdate:modelValue': (value: string) => { state.value = value },
            })
        },
    }))
    app.mount(mountPoint)
    return { state }
}

function trigger() {
    return document.querySelector<HTMLButtonElement>('[data-testid="talos-themed-select-trigger"]')
}

// reka-ui Select toggles on primary-button pointer events, not a bare click.
function firePointer(element: Element, type: 'pointerdown' | 'pointerup') {
    const Ctor = typeof PointerEvent === 'function' ? PointerEvent : MouseEvent
    element.dispatchEvent(new Ctor(type, { bubbles: true, cancelable: true, button: 0 }))
}

// reka-ui runs selection through a dispatched custom event whose handler awaits
// a tick; drain both micro- and macro-tasks so the chain resolves in jsdom.
async function settle() {
    await nextTick()
    await new Promise((resolve) => setTimeout(resolve, 0))
    await nextTick()
}

async function open() {
    const node = trigger()
    if (node) firePointer(node, 'pointerdown')
    await settle()
}

describe('TalosThemedSelect', () => {
    it('renders the selected label in the trigger and never a native <select> option list', () => {
        mountSelect({ value: 'anthropic' })

        expect(trigger()?.textContent).toContain('Anthropic')
        // The visible control is a button, not an OS-rendered native select.
        expect(trigger()?.tagName).toBe('BUTTON')
    })

    it('falls back to the placeholder when the value has no matching item', () => {
        mountSelect({ value: '' })
        expect(trigger()?.textContent).toContain('Select an option')
    })

    it('reflects the disabled prop on the trigger', () => {
        mountSelect({ disabled: true })
        expect(trigger()?.disabled).toBe(true)
    })

    it('opens a themed, portalled list of items', async () => {
        mountSelect({ value: 'openai' })
        await open()

        const items = document.querySelectorAll('[data-testid="talos-themed-select-item"]')
        expect(items.length).toBe(3)
        expect(document.querySelector('[data-testid="talos-themed-select-content"]')).not.toBeNull()
    })

    it('emits update:modelValue when a different item is chosen', async () => {
        const { state } = mountSelect({ value: 'openai' })
        await open()

        const option = document.querySelector<HTMLElement>('[data-value="anthropic"]')
        expect(option).not.toBeNull()
        // Keyboard commit (reka's pointerup path relies on synthetic custom events
        // that jsdom does not settle deterministically; Enter exercises the same
        // handleSelect and is the a11y path we care about here).
        option?.focus()
        option?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
        await settle()

        expect(state.value).toBe('anthropic')
    })
})
