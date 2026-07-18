import { beforeEach, describe, expect, it, vi } from 'vitest'
import { talosFetch } from '../lib/api'
import type { TalosModelProfile } from '../lib/talosTypes'
import { useTalosModelProfiles } from './useTalosModelProfiles'

vi.mock('../lib/api', () => ({ talosFetch: vi.fn() }))

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
})
