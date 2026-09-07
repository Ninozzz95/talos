// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, defineComponent, h, nextTick, reactive } from 'vue'
import TalosModelCenter from './TalosModelCenter.vue'
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

function profile(overrides: Partial<TalosModelProfile> = {}): TalosModelProfile {
    return {
        id: 'profile-1',
        provider: 'openrouter',
        model: 'openai/gpt-4.1-mini',
        display_name: 'Router profile',
        base_url: null,
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

function catalogItem(overrides: Partial<TalosProviderModelCatalogItem> = {}): TalosProviderModelCatalogItem {
    return {
        id: 'anthropic/claude-sonnet-4-6',
        display_name: 'Claude Sonnet 4.6',
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

function envelope(overrides: Partial<TalosProviderModelCatalog> = {}): TalosProviderModelCatalog {
    return {
        profile_id: 'profile-1',
        provider: 'openrouter',
        models: [catalogItem(), catalogItem({ id: 'openai/gpt-4.1', display_name: 'GPT-4.1' })],
        complete: true,
        page_count: 1,
        fetched_at: '2026-07-20T12:00:00Z',
        warnings: [],
        ...overrides,
    }
}

async function settle() {
    await nextTick()
    await new Promise((resolve) => setTimeout(resolve, 0))
    await nextTick()
}

async function mountWith(initial: TalosModelProfile[]) {
    talosFetchMock.mockResolvedValueOnce({ data: initial } as never)
    const shell = document.createElement('div')
    shell.className = 'talos-shell talos-ui-motion-disabled'
    const portalRoot = document.createElement('div')
    portalRoot.id = 'talos-portal-root'
    const mountPoint = document.createElement('div')
    shell.append(portalRoot, mountPoint)
    document.body.append(shell)

    app = createApp(defineComponent({ setup: () => () => h(TalosModelCenter) }))
    app.mount(mountPoint)
    await settle()
}

function byTestId(id: string) {
    return document.querySelector<HTMLElement>(`[data-testid="${id}"]`)
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

describe('TalosModelCenter save and verify', () => {
    it('runs PATCH then probe in one command and updates shared state without reloading the collection', async () => {
        await mountWith([profile()])

        const untested = profile({ status: 'untested', probe_result: null })
        const verified = profile({ status: 'healthy', probe_result: { ok: true }, model: 'openai/gpt-4.1' })
        talosFetchMock
            .mockResolvedValueOnce({ data: untested } as never)
            .mockResolvedValueOnce({ data: verified } as never)

        byTestId('talos-model-save-verify')?.click()
        await settle()

        const calls = talosFetchMock.mock.calls.map((call) => `${(call[1] as { method?: string })?.method ?? 'GET'} ${call[0]}`)
        const patchIndex = calls.indexOf('PATCH /api/talos/model-profiles/profile-1')
        const probeIndex = calls.indexOf('POST /api/talos/model-profiles/profile-1/probe')
        expect(patchIndex).toBeGreaterThanOrEqual(0)
        expect(probeIndex).toBeGreaterThan(patchIndex)

        const profiles = useTalosModelProfiles()
        expect(profiles.modelProfiles.value[0]).toEqual(verified)
        // Exactly one GET of the collection, on mount only — no reload after save.
        expect(calls.filter((entry) => entry === 'GET /api/talos/model-profiles')).toHaveLength(1)
    })

    it('keeps the server-returned failed projection and offers retry when the probe fails after save', async () => {
        await mountWith([profile()])

        const untested = profile({ status: 'untested', probe_result: null })
        const failed = profile({ status: 'failed', probe_result: { ok: false, http_status: 401 } })
        talosFetchMock
            .mockResolvedValueOnce({ data: untested } as never)
            .mockResolvedValueOnce({ data: failed } as never)

        byTestId('talos-model-save-verify')?.click()
        await settle()

        const profiles = useTalosModelProfiles()
        expect(profiles.modelProfiles.value[0].status, 'stale healthy evidence must not be restored').toBe('failed')
        expect(byTestId('talos-model-retry-verify'), 'a retry affordance must appear when verification fails').not.toBeNull()

        const recovered = profile({ status: 'healthy', probe_result: { ok: true } })
        talosFetchMock.mockResolvedValueOnce({ data: recovered } as never)
        byTestId('talos-model-retry-verify')?.click()
        await settle()

        expect(profiles.modelProfiles.value[0].status).toBe('healthy')
    })

    it('refreshes the persisted provider catalog and applies a discovered model to the edit form', async () => {
        await mountWith([profile()])

        talosFetchMock.mockResolvedValueOnce({ data: envelope() } as never)
        byTestId('talos-model-load-catalog')?.click()
        await settle()

        expect(talosFetchMock).toHaveBeenCalledWith('/api/talos/model-profiles/profile-1/models', expect.objectContaining({
            method: 'GET',
            redirectOnAuthFailure: false,
        }))

        byTestId('talos-model-combobox-trigger')?.click()
        await settle()
        document.querySelector<HTMLElement>('[data-testid="talos-model-option"][data-model-id="openai/gpt-4.1"]')?.click()
        await nextTick()

        const modelInput = byTestId('talos-edit-model') as HTMLInputElement | null
        expect(modelInput?.value).toBe('openai/gpt-4.1')
    })
})
