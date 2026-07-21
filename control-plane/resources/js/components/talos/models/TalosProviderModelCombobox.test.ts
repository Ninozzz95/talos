// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest'
import { createApp, defineComponent, h, nextTick, reactive } from 'vue'
import TalosProviderModelCombobox from './TalosProviderModelCombobox.vue'
import type { TalosProviderModelCatalogItem } from '../../../lib/talosTypes'

// reka-ui scrolls the highlighted option into view; jsdom has no layout engine.
if (!Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = () => undefined
}

let app: ReturnType<typeof createApp> | undefined

afterEach(() => {
    app?.unmount()
    app = undefined
    document.body.replaceChildren()
})

function item(overrides: Partial<TalosProviderModelCatalogItem> = {}): TalosProviderModelCatalogItem {
    return {
        id: 'model-a',
        display_name: 'Model A',
        provider: 'openrouter',
        owned_by: null,
        chat_compatibility: 'supported',
        capabilities: { text: true, vision: null, tools: null, reasoning: null, embeddings: null, image_output: null, audio_output: null },
        context_window: null,
        max_output_tokens: null,
        lifecycle: 'stable',
        canonical_slug: null,
        local_digest: null,
        metadata: {},
        ...overrides,
    }
}

type Harness = {
    state: { value: string; refreshCount: number }
}

function mountCombobox(models: TalosProviderModelCatalogItem[], options: { allowManualId?: boolean; value?: string } = {}): Harness {
    const state = reactive({ value: options.value ?? '', refreshCount: 0 })
    const shell = document.createElement('div')
    shell.className = 'talos-shell talos-ui-motion-disabled'
    const mountPoint = document.createElement('div')
    shell.append(mountPoint)
    document.body.append(shell)

    app = createApp(defineComponent({
        setup() {
            return () => h(TalosProviderModelCombobox, {
                models,
                modelValue: state.value,
                allowManualId: options.allowManualId ?? false,
                'onUpdate:modelValue': (value: string) => { state.value = value },
                onRefresh: () => { state.refreshCount += 1 },
            })
        },
    }))
    app.mount(mountPoint)
    return { state }
}

async function openList() {
    const trigger = document.querySelector<HTMLButtonElement>('[data-testid="talos-model-combobox-trigger"]')
    expect(trigger).not.toBeNull()
    trigger?.click()
    await nextTick()
    await nextTick()
}

function options() {
    return [...document.querySelectorAll<HTMLElement>('[data-testid="talos-model-option"]')]
}

function optionById(id: string) {
    return document.querySelector<HTMLElement>(`[data-testid="talos-model-option"][data-model-id="${id}"]`)
}

describe('TalosProviderModelCombobox', () => {
    it('keeps a distant model in a 500-row catalog reachable and selectable', async () => {
        const models = Array.from({ length: 500 }, (_unused, index) => item({
            id: `model-${index}`,
            display_name: `Model ${index}`,
        }))
        const harness = mountCombobox(models)
        await openList()

        const frontier = optionById('model-499')
        expect(frontier, 'the 500th model must render in the searchable list').not.toBeNull()

        frontier?.click()
        await nextTick()
        expect(harness.state.value).toBe('model-499')
    })

    it('filters the catalog as the operator types a search term', async () => {
        const models = [
            item({ id: 'openai/gpt-4.1-mini', display_name: 'GPT-4.1 mini' }),
            item({ id: 'anthropic/claude-sonnet-4-6', display_name: 'Claude Sonnet 4.6' }),
            item({ id: 'google/gemini-2.5-flash', display_name: 'Gemini 2.5 Flash' }),
        ]
        mountCombobox(models)
        await openList()
        expect(options()).toHaveLength(3)

        const search = document.querySelector<HTMLInputElement>('[aria-label="Search models"]')
        expect(search).not.toBeNull()
        search!.value = 'claude'
        search!.dispatchEvent(new Event('input', { bubbles: true }))
        await nextTick()

        const ids = options().map((option) => option.getAttribute('data-model-id'))
        expect(ids).toEqual(['anthropic/claude-sonnet-4-6'])
    })

    it('disables unsupported chat models but keeps unknown ones selectable', async () => {
        const models = [
            item({ id: 'text-embedding-3-large', display_name: 'Embedding', chat_compatibility: 'unsupported' }),
            item({ id: 'provider/new-model', display_name: 'New model', chat_compatibility: 'unknown' }),
        ]
        const harness = mountCombobox(models)
        await openList()

        const unsupported = optionById('text-embedding-3-large')
        expect(unsupported?.getAttribute('data-disabled')).not.toBeNull()
        unsupported?.click()
        await nextTick()
        expect(harness.state.value).toBe('')

        const unknown = optionById('provider/new-model')
        expect(unknown?.getAttribute('data-disabled')).toBeNull()
        unknown?.click()
        await nextTick()
        expect(harness.state.value).toBe('provider/new-model')
    })

    it('keeps the option list scrollable so long catalogs never clip', async () => {
        mountCombobox([item()])
        await openList()

        // The scroll container is the reka content box carrying the explicit class.
        const list = document.querySelector<HTMLElement>('.overflow-y-auto')
        expect(list, 'the popover content must render a bounded scroll container').not.toBeNull()
        expect(list?.className).toContain('overflow-y-auto')
        expect(list?.className).toMatch(/max-h-/)
    })

    it('offers an advanced manual model ID fallback during a catalog outage', async () => {
        const harness = mountCombobox([], { allowManualId: true })

        const toggle = document.querySelector<HTMLButtonElement>('[data-testid="talos-model-manual-toggle"]')
        expect(toggle).not.toBeNull()
        toggle?.click()
        await nextTick()

        const manualInput = document.querySelector<HTMLInputElement>('[data-testid="talos-model-manual-input"]')
        expect(manualInput).not.toBeNull()
        manualInput!.value = 'openrouter/custom-model'
        manualInput!.dispatchEvent(new Event('input', { bubbles: true }))
        await nextTick()

        const apply = document.querySelector<HTMLButtonElement>('[data-testid="talos-model-manual-apply"]')
        apply?.click()
        await nextTick()
        expect(harness.state.value).toBe('openrouter/custom-model')
    })

    it('does not expose the manual ID escape hatch unless explicitly allowed', async () => {
        mountCombobox([item()])
        expect(document.querySelector('[data-testid="talos-model-manual-toggle"]')).toBeNull()
    })
})
