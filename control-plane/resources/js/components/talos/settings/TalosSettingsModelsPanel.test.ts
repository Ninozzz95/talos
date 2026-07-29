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

function mountPanel(input: {
    selectedModelProfileId?: string
    activeModelProfile?: TalosModelProfile | null
    promptCache?: { mode: string; ttl: string | null }
} = {}) {
    const events = {
        model: [] as string[],
        context: [] as string[],
        promptCache: [] as Array<{ mode: string; ttl: string | null }>,
    }
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
                activeModelProfile: input.activeModelProfile ?? null,
                activeContextSet: null,
                promptCache: input.promptCache ?? { mode: 'automatic', ttl: null },
                loadingSettings: false,
                onSelectModel: (id: string) => events.model.push(id),
                onSelectContext: (id: string) => events.context.push(id),
                onUpdatePromptCache: (value: { mode: string; ttl: string | null }) => events.promptCache.push(value),
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

    it('renders only server-supported cache policies and emits a canonical update', async () => {
        const active = profile({
            model: 'gpt-5.6',
            prompt_cache_capability: {
                contract: 'talos.prompt_cache.capability.v1',
                supported: true,
                minimum_input_tokens: 1024,
                modes: ['provider_default', 'automatic', 'explicit', 'disabled'],
                ttls: ['30m'],
                breakpoints: ['system', 'message'],
                usage_metrics: { read: true, write: true, miss: false },
            },
        } as unknown as Partial<TalosModelProfile>)
        const { events } = mountPanel({
            selectedModelProfileId: active.id,
            activeModelProfile: active,
        })

        const trigger = document.querySelector<HTMLElement>('[aria-label="Prompt cache mode"]')
        expect(trigger?.textContent).toContain('Automatic')
        if (trigger) firePointer(trigger, 'pointerdown')
        await settle()

        expect(document.body.textContent).toContain('Explicit stable prefix')
        const option = document.querySelector<HTMLElement>('[data-value="explicit"]')
        option?.focus()
        option?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
        await settle()

        expect(events.promptCache).toEqual([{ mode: 'explicit', ttl: null }])
        expect(document.querySelector<HTMLElement>('[aria-label="Prompt cache TTL"]')?.textContent)
            .toContain('Provider default TTL')
    })

    it('shows an honest unavailable state for an unverified provider model', () => {
        const active = profile({
            provider: 'openrouter',
            model: 'openai/gpt-5.6',
            prompt_cache_capability: {
                contract: 'talos.prompt_cache.capability.v1',
                supported: false,
                minimum_input_tokens: null,
                modes: [],
                ttls: [],
                breakpoints: [],
                usage_metrics: { read: false, write: false, miss: false },
            },
        } as unknown as Partial<TalosModelProfile>)
        mountPanel({
            selectedModelProfileId: active.id,
            activeModelProfile: active,
        })

        expect(document.querySelector('[data-testid="talos-prompt-cache-settings"]')?.textContent)
            .toContain('Unavailable for this model')
        expect(document.querySelector('[aria-label="Prompt cache mode"]')).toBeNull()
    })
})
