// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest'
import { createApp, defineComponent, h, nextTick } from 'vue'
import TalosSettingsModelsPanel from './TalosSettingsModelsPanel.vue'
import type { TalosContextSet, TalosModelProfile } from '../../../lib/talosTypes'

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

function profile(overrides: Partial<TalosModelProfile> = {}): TalosModelProfile {
    return {
        id: 'profile-a',
        display_name: 'Profile A',
        provider: 'openai',
        model: 'openai/gpt-5',
        status: 'ready',
        has_secret: true,
        ...overrides,
    } as unknown as TalosModelProfile
}

function contextSet(overrides: Partial<TalosContextSet> = {}): TalosContextSet {
    return { id: 'ctx-a', name: 'Context A', status: 'available', ...overrides } as unknown as TalosContextSet
}

function mountPanel(input: { selectedModelProfileId?: string } = {}) {
    const events = { model: [] as string[], context: [] as string[] }
    const shell = document.createElement('div')
    shell.className = 'talos-shell talos-ui-motion-disabled'
    const mountPoint = document.createElement('div')
    shell.append(mountPoint)
    document.body.append(shell)

    app = createApp(defineComponent({
        setup() {
            return () => h(TalosSettingsModelsPanel, {
                modelProfiles: [profile()],
                contextSets: [contextSet()],
                selectedModelProfileId: input.selectedModelProfileId ?? '',
                selectedContextSetId: '',
                activeModelProfile: null,
                activeContextSet: null,
                loadingSettings: false,
                onSelectModel: (id: string) => events.model.push(id),
                onSelectContext: (id: string) => events.context.push(id),
                onOpenModule: () => undefined,
            })
        },
    }))
    app.mount(mountPoint)
    return { events }
}

describe('TalosSettingsModelsPanel', () => {
    it('shows the "Choose profile" none label when no default model is set', () => {
        mountPanel()
        const trigger = document.querySelector<HTMLElement>('[aria-label="Default model profile"]')
        expect(trigger?.textContent).toContain('Choose profile')
    })

    it('emits selectModel with the chosen profile id', async () => {
        const { events } = mountPanel()
        const trigger = document.querySelector<HTMLElement>('[aria-label="Default model profile"]')
        if (trigger) firePointer(trigger, 'pointerdown')
        await settle()

        const option = document.querySelector<HTMLElement>('[data-value="profile-a"]')
        expect(option).not.toBeNull()
        option?.focus()
        option?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
        await settle()

        expect(events.model).toEqual(['profile-a'])
    })

    it('emits an empty selection when the none option is chosen', async () => {
        const { events } = mountPanel({ selectedModelProfileId: 'profile-a' })
        const trigger = document.querySelector<HTMLElement>('[aria-label="Default model profile"]')
        if (trigger) firePointer(trigger, 'pointerdown')
        await settle()

        const none = document.querySelector<HTMLElement>('[data-value="__talos_none__"]')
        expect(none).not.toBeNull()
        none?.focus()
        none?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
        await settle()

        expect(events.model).toEqual([''])
    })
})
