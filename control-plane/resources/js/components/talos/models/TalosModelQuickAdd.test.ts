// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, defineComponent, h, nextTick, reactive } from 'vue'
import TalosModelQuickAdd from './TalosModelQuickAdd.vue'
import { useTalosModelProfiles } from '../../../composables/useTalosModelProfiles'
import { talosFetch } from '../../../lib/api'
import type { TalosModelProfile, TalosProviderModelCatalog, TalosProviderModelCatalogItem } from '../../../lib/talosTypes'

vi.mock('../../../lib/api', () => ({ talosFetch: vi.fn() }))

// reka-ui scrolls the highlighted option into view; jsdom has no layout engine.
if (!Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = () => undefined
}

const talosFetchMock = vi.mocked(talosFetch)
let app: ReturnType<typeof createApp> | undefined

function catalogItem(overrides: Partial<TalosProviderModelCatalogItem> = {}): TalosProviderModelCatalogItem {
    return {
        id: 'gemini-2.5-pro',
        display_name: 'Gemini 2.5 Pro',
        provider: 'gemini',
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

function envelope(overrides: Partial<TalosProviderModelCatalog> = {}): TalosProviderModelCatalog {
    return {
        profile_id: null,
        provider: 'gemini',
        models: [
            catalogItem(),
            catalogItem({ id: 'gemini-2.5-flash', display_name: 'Gemini 2.5 Flash' }),
        ],
        complete: true,
        page_count: 1,
        fetched_at: '2026-07-20T12:00:00Z',
        warnings: [],
        ...overrides,
    }
}

function persistedProfile(overrides: Partial<TalosModelProfile> = {}): TalosModelProfile {
    return {
        id: 'profile-created',
        provider: 'gemini',
        model: 'gemini-2.5-pro',
        display_name: 'Google Gemini quick profile',
        timeout_seconds: 60,
        status: 'healthy',
        capabilities: { json: true },
        probe_result: { ok: true },
        has_secret: true,
        created_at: '2026-07-20T12:00:00Z',
        updated_at: '2026-07-20T12:00:00Z',
        ...overrides,
    }
}

function mount() {
    const state = reactive<{ created: TalosModelProfile[] }>({ created: [] })
    const shell = document.createElement('div')
    shell.className = 'talos-shell talos-ui-motion-disabled'
    const mountPoint = document.createElement('div')
    shell.append(mountPoint)
    document.body.append(shell)

    app = createApp(defineComponent({
        setup() {
            return () => h(TalosModelQuickAdd, {
                onCreated: (profile: TalosModelProfile) => { state.created.push(profile) },
            })
        },
    }))
    app.mount(mountPoint)
    return state
}

function chooseProvider(label: string) {
    const button = [...document.querySelectorAll<HTMLButtonElement>('button')]
        .find((candidate) => candidate.getAttribute('aria-label') === `Choose ${label} provider`)
    button?.click()
}

function secretInput() {
    return document.querySelector<HTMLInputElement>('[data-testid="talos-provider-secret"]')
}

async function typeSecret(value: string) {
    const input = secretInput()
    input!.value = value
    input!.dispatchEvent(new Event('input', { bubbles: true }))
    await nextTick()
}

async function settle() {
    await nextTick()
    await new Promise((resolve) => setTimeout(resolve, 0))
    await nextTick()
}

async function openCatalog() {
    document.querySelector<HTMLButtonElement>('[data-testid="talos-model-combobox-trigger"]')?.click()
    await settle()
}

function optionById(id: string) {
    return document.querySelector<HTMLElement>(`[data-testid="talos-model-option"][data-model-id="${id}"]`)
}

beforeEach(() => {
    talosFetchMock.mockReset()
    useTalosModelProfiles().modelProfiles.value = []
})

afterEach(() => {
    app?.unmount()
    app = undefined
    document.body.replaceChildren()
})

describe('TalosModelQuickAdd provider-first discovery', () => {
    it('discovers the provider catalog after a credential and lists returned models before any selection', async () => {
        mount()
        chooseProvider('Google Gemini')
        await nextTick()
        await typeSecret('draft-key')

        talosFetchMock.mockResolvedValueOnce({ data: envelope() } as never)
        document.querySelector<HTMLButtonElement>('[data-testid="talos-model-discover"]')?.click()
        await settle()

        expect(talosFetchMock).toHaveBeenCalledWith('/api/talos/model-profiles/discover-draft', expect.objectContaining({
            method: 'POST',
            redirectOnAuthFailure: false,
        }))
        const body = JSON.parse((talosFetchMock.mock.calls[0][1] as { body: string }).body)
        expect(body).toMatchObject({ provider: 'gemini', secret: 'draft-key' })

        await openCatalog()
        expect(optionById('gemini-2.5-pro')).not.toBeNull()
        expect(optionById('gemini-2.5-flash')).not.toBeNull()
    })

    it('requires a discovered model selection before it can create and probe a profile', async () => {
        const state = mount()
        chooseProvider('Google Gemini')
        await nextTick()
        await typeSecret('draft-key')

        talosFetchMock.mockResolvedValueOnce({ data: envelope() } as never)
        document.querySelector<HTMLButtonElement>('[data-testid="talos-model-discover"]')?.click()
        await settle()

        const add = document.querySelector<HTMLButtonElement>('[data-testid="talos-model-add"]')
        expect(add?.disabled, 'Add must stay disabled until a model is chosen').toBe(true)

        await openCatalog()
        optionById('gemini-2.5-flash')?.click()
        await nextTick()

        expect(add?.disabled).toBe(false)

        const created = persistedProfile({ model: 'gemini-2.5-flash' })
        talosFetchMock
            .mockResolvedValueOnce({ data: { ...created, status: 'untested', probe_result: null } } as never)
            .mockResolvedValueOnce({ data: created } as never)

        add?.click()
        await settle()

        const createCall = talosFetchMock.mock.calls.find(([url]) => url === '/api/talos/model-profiles')
        expect(createCall, 'create must be called after discovery + selection').toBeTruthy()
        expect(JSON.parse((createCall![1] as { body: string }).body)).toMatchObject({
            provider: 'gemini',
            model: 'gemini-2.5-flash',
            secret: 'draft-key',
        })
        expect(state.created).toHaveLength(1)
        expect(state.created[0].id).toBe('profile-created')
        expect(secretInput()!.value, 'secret input clears after a terminal success').toBe('')
    })

    it('clears a stale discovered catalog and selection when the provider changes', async () => {
        mount()
        chooseProvider('Google Gemini')
        await nextTick()
        await typeSecret('draft-key')

        talosFetchMock.mockResolvedValueOnce({ data: envelope() } as never)
        document.querySelector<HTMLButtonElement>('[data-testid="talos-model-discover"]')?.click()
        await settle()
        await openCatalog()
        optionById('gemini-2.5-pro')?.click()
        await nextTick()

        chooseProvider('OpenRouter')
        await nextTick()

        expect(document.querySelector('[data-testid="talos-model-option"]'), 'stale catalog options must clear on provider change').toBeNull()
        const add = document.querySelector<HTMLButtonElement>('[data-testid="talos-model-add"]')
        expect(add?.disabled, 'the stale selection must not survive a provider change').toBe(true)
    })

    it('shows a typed recovery message and an advanced manual ID when discovery faults', async () => {
        mount()
        chooseProvider('Google Gemini')
        await nextTick()
        await typeSecret('bad-key')

        talosFetchMock.mockRejectedValueOnce(Object.assign(new Error('HTTP 401'), {
            status: 401,
            details: {
                error: {
                    code: 'MODEL_CATALOG_AUTH_FAILED',
                    message: 'Provider rejected the credential.',
                    retryable: false,
                    retry_after_seconds: null,
                    provider: 'gemini',
                },
            },
        }) as never)
        document.querySelector<HTMLButtonElement>('[data-testid="talos-model-discover"]')?.click()
        await settle()

        const fault = document.querySelector('[data-testid="talos-discovery-fault"]')
        expect(fault?.textContent).toContain('Provider rejected the credential.')
        // No model is silently selected from a stale static list on failure.
        expect(document.querySelector('[data-testid="talos-model-option"]')).toBeNull()
        // The advanced manual escape hatch is available for a catalog outage.
        expect(document.querySelector('[data-testid="talos-model-manual-toggle"]')).not.toBeNull()
    })
})
