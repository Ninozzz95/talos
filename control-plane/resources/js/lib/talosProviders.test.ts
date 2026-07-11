import { describe, expect, it } from 'vitest'
import { talosModelProfileIsCallable, talosProviderById } from './talosProviders'
import type { TalosModelProfile } from './talosTypes'

function profile(overrides: Partial<TalosModelProfile>): TalosModelProfile {
    return {
        id: 'profile-test',
        user_id: 1,
        provider: 'openai',
        model: 'model-test',
        display_name: 'Test profile',
        base_url: null,
        timeout_seconds: 60,
        status: 'healthy',
        capabilities: {},
        probe_result: null,
        has_secret: false,
        created_at: null,
        updated_at: null,
        ...overrides,
    }
}

describe('talosModelProfileIsCallable', () => {
    it('requires server-side credentials only for providers that need them', () => {
        expect(talosModelProfileIsCallable(profile({ provider: 'openai', has_secret: false }))).toBe(false)
        expect(talosModelProfileIsCallable(profile({ provider: 'openai', has_secret: true }))).toBe(true)
        expect(talosModelProfileIsCallable(profile({ provider: 'ollama', has_secret: false }))).toBe(true)
    })

    it('rejects disabled and failed profiles regardless of credentials', () => {
        expect(talosModelProfileIsCallable(profile({ status: 'disabled', has_secret: true }))).toBe(false)
        expect(talosModelProfileIsCallable(profile({ status: 'failed', provider: 'ollama' }))).toBe(false)
    })
})

describe('talosProviderById', () => {
    it('exposes a local logo for every supported provider', () => {
        for (const providerId of ['anthropic', 'deepseek', 'gemini', 'ollama', 'openai', 'openrouter']) {
            const provider = talosProviderById(providerId)

            expect(provider.logo).toMatch(/resources\/images\/providers\/.+\.svg$/)
            expect(provider.logoAlt).toBe(`${provider.label} logo`)
        }
    })

    it('uses a neutral identity for unknown providers', () => {
        const provider = talosProviderById('future-provider')

        expect(provider.id).toBe('unknown')
        expect(provider.label).toBe('Unknown provider')
        expect(provider.logo).toBeNull()
    })
})
