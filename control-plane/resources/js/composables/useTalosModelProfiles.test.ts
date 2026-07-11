import { describe, expect, it } from 'vitest'
import type { TalosModelProfile } from '../lib/talosTypes'
import { useTalosModelProfiles } from './useTalosModelProfiles'

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
})
