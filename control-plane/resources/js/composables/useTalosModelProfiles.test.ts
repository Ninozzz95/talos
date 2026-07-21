import { beforeEach, describe, expect, it, vi } from 'vitest'
import { talosFetch } from '../lib/api'
import type { TalosModelProfile, TalosProviderModelCatalog, TalosProviderModelCatalogItem } from '../lib/talosTypes'
import { useTalosModelProfiles } from './useTalosModelProfiles'

vi.mock('../lib/api', () => ({ talosFetch: vi.fn() }))

function catalogItem(overrides: Partial<TalosProviderModelCatalogItem> = {}): TalosProviderModelCatalogItem {
    return {
        id: 'model-a',
        display_name: 'Model A',
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

function catalogEnvelope(overrides: Partial<TalosProviderModelCatalog> = {}): TalosProviderModelCatalog {
    return {
        profile_id: null,
        provider: 'gemini',
        models: [catalogItem()],
        complete: true,
        page_count: 1,
        fetched_at: '2026-07-20T12:00:00Z',
        warnings: [],
        ...overrides,
    }
}

function profile(overrides: Partial<TalosModelProfile> = {}): TalosModelProfile {
    return {
        id: 'profile-1',
        provider: 'openai',
        model: 'gpt-4.1-mini',
        display_name: 'OpenAI',
        timeout_seconds: 60,
        status: 'healthy',
        capabilities: { json: true, remote: true },
        probe_result: { ok: true },
        has_secret: true,
        created_at: '2026-07-11T00:00:00Z',
        updated_at: '2026-07-11T00:00:00Z',
        ...overrides,
    }
}

describe('useTalosModelProfiles', () => {
    beforeEach(() => {
        vi.mocked(talosFetch).mockReset()
        useTalosModelProfiles().modelProfiles.value = []
    })

    it('requires successful server probe evidence before a profile is callable', () => {
        const profiles = useTalosModelProfiles()
        const verified = profile()
        const clientClaimedHealthy = profile({
            id: 'profile-2',
            probe_result: null,
        })

        profiles.modelProfiles.value = [verified, clientClaimedHealthy]

        expect(profiles.callableModelProfiles.value).toEqual([verified])
        expect(profiles.usableModelProfiles.value).toEqual([verified])
    })

    it('creates then probes the persisted profile before exposing it as callable', async () => {
        const profiles = useTalosModelProfiles()
        const created = profile({
            status: 'untested',
            probe_result: null,
            capabilities: null,
        })
        const verified = profile()
        vi.mocked(talosFetch)
            .mockResolvedValueOnce({ data: created })
            .mockResolvedValueOnce({ data: verified })

        const result = await profiles.createAndProbeModelProfile({
            provider: 'openai',
            model: 'gpt-4.1-mini',
            display_name: 'OpenAI',
            secret: 'server-only-secret',
        })

        expect(talosFetch).toHaveBeenNthCalledWith(1, '/api/talos/model-profiles', expect.objectContaining({
            method: 'POST',
        }))
        expect(talosFetch).toHaveBeenNthCalledWith(2, `/api/talos/model-profiles/${created.id}/probe`, {
            method: 'POST',
        })
        expect(result).toEqual(verified)
        expect(profiles.modelProfiles.value).toEqual([verified])
        expect(profiles.callableModelProfiles.value).toEqual([verified])
    })

    it('updates connection identity then probes the persisted profile before exposing it as callable', async () => {
        const profiles = useTalosModelProfiles()
        const untested = profile({ status: 'untested', probe_result: null, capabilities: null })
        const verified = profile()
        vi.mocked(talosFetch)
            .mockResolvedValueOnce({ data: untested })
            .mockResolvedValueOnce({ data: verified })

        const result = await profiles.updateAndProbeModelProfile('profile-1', {
            provider: 'openai',
            model: 'gpt-4.1-mini',
            secret: 'rotated-secret',
        })

        expect(talosFetch).toHaveBeenNthCalledWith(1, '/api/talos/model-profiles/profile-1', expect.objectContaining({
            method: 'PATCH',
        }))
        expect(talosFetch).toHaveBeenNthCalledWith(2, '/api/talos/model-profiles/profile-1/probe', {
            method: 'POST',
        })
        expect(result).toEqual(verified)
        expect(profiles.modelProfiles.value).toEqual([verified])
        expect(profiles.callableModelProfiles.value).toEqual([verified])
        // No full collection reload; shared state uses only the final projection.
        expect(talosFetch).not.toHaveBeenCalledWith('/api/talos/model-profiles')
        expect(talosFetch).toHaveBeenCalledTimes(2)
    })

    it('discovers a draft catalog for a provider credential without persisting a profile', async () => {
        const profiles = useTalosModelProfiles()
        const envelope = catalogEnvelope()
        vi.mocked(talosFetch).mockResolvedValueOnce({ data: envelope })

        const result = await profiles.discoverDraftModelCatalog({ provider: 'gemini', secret: 'draft-key' })

        expect(talosFetch).toHaveBeenCalledWith('/api/talos/model-profiles/discover-draft', expect.objectContaining({
            method: 'POST',
            redirectOnAuthFailure: false,
        }))
        const requestBody = JSON.parse((vi.mocked(talosFetch).mock.calls[0][1] as { body: string }).body)
        expect(requestBody).toEqual({ provider: 'gemini', secret: 'draft-key' })
        expect(result).toEqual(envelope)
        expect(profiles.modelProfiles.value).toEqual([])
    })

    it('surfaces the typed provider fault when draft discovery fails and never triggers an auth redirect', async () => {
        const profiles = useTalosModelProfiles()
        vi.mocked(talosFetch).mockRejectedValueOnce(Object.assign(new Error('HTTP 401'), {
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
        }))

        await expect(profiles.discoverDraftModelCatalog({ provider: 'gemini', secret: 'bad-key' })).rejects.toMatchObject({
            name: 'TalosModelCatalogError',
            fault: {
                code: 'MODEL_CATALOG_AUTH_FAILED',
                message: 'Provider rejected the credential.',
                retryable: false,
                retry_after_seconds: null,
                provider: 'gemini',
            },
        })
        expect(vi.mocked(talosFetch).mock.calls[0][1]).toMatchObject({ redirectOnAuthFailure: false })
    })

    it('discovers the catalog for an owned persisted profile', async () => {
        const profiles = useTalosModelProfiles()
        profiles.modelProfiles.value = [profile({ id: 'profile-9', provider: 'openrouter' })]
        const envelope = catalogEnvelope({ profile_id: 'profile-9', provider: 'openrouter' })
        vi.mocked(talosFetch).mockResolvedValueOnce({ data: envelope })

        const result = await profiles.discoverModelCatalog('profile-9')

        expect(talosFetch).toHaveBeenCalledWith('/api/talos/model-profiles/profile-9/models', expect.objectContaining({
            method: 'GET',
            redirectOnAuthFailure: false,
        }))
        expect(result).toEqual(envelope)
    })
})
