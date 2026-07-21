// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest'
import { createApp, defineComponent, h, nextTick } from 'vue'
import TalosSettingsSearchPanel from './TalosSettingsSearchPanel.vue'

// reka Select needs these APIs jsdom omits (pointer capture + scroll into view).
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

async function settle() {
    await nextTick()
    await new Promise((resolve) => setTimeout(resolve, 0))
    await nextTick()
}

function firePointer(element: Element, type: 'pointerdown' | 'pointerup') {
    const Ctor = typeof PointerEvent === 'function' ? PointerEvent : MouseEvent
    element.dispatchEvent(new Ctor(type, { bubbles: true, cancelable: true, button: 0 }))
}

function searchPrefs() {
    return {
        provider: 'searxng',
        results_per_query: 5,
        url: '',
        fallback: 'duckduckgo',
        deep_research: { max_tokens: 2048, extract_timeout: 30, extract_parallel: 2, timeout: 120 },
    }
}

function mountPanel() {
    const events: Array<Record<string, unknown>> = []
    const shell = document.createElement('div')
    shell.className = 'talos-shell talos-ui-motion-disabled'
    const mountPoint = document.createElement('div')
    shell.append(mountPoint)
    document.body.append(shell)

    app = createApp(defineComponent({
        setup() {
            return () => h(TalosSettingsSearchPanel, {
                search: searchPrefs(),
                editable: true,
                onUpdateSearch: (payload: Record<string, unknown>) => events.push(payload),
                onUpdateDeepResearch: () => undefined,
            })
        },
    }))
    app.mount(mountPoint)
    return { events }
}

describe('TalosSettingsSearchPanel', () => {
    it('renders a themed provider control (button, not a native select) with the current label', () => {
        mountPanel()
        const providerTrigger = document.querySelector<HTMLElement>('[aria-label="Search provider"]')
        expect(providerTrigger?.tagName).toBe('BUTTON')
        expect(providerTrigger?.textContent).toContain('SearXNG self-hosted')
    })

    it('emits updateSearch when a provider is chosen from the themed list', async () => {
        const { events } = mountPanel()
        const trigger = document.querySelector<HTMLElement>('[aria-label="Search provider"]')
        if (trigger) firePointer(trigger, 'pointerdown')
        await settle()

        const option = document.querySelector<HTMLElement>('[data-value="disabled"]')
        expect(option).not.toBeNull()
        option?.focus()
        option?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
        await settle()

        expect(events).toContainEqual({ provider: 'disabled' })
    })
})
