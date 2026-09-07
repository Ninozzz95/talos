import { describe, expect, it } from 'vitest'
import { talosModelProfileIsCallable, talosProviderById, talosProviderCatalog } from './talosProviders'
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

describe('talosProviderCatalog live-catalog fallbacks', () => {
    it('pins the current lifecycle-safe single fallback model per provider', () => {
        // DeepSeek deepseek-chat/deepseek-reasoner retire 2026-07-24; Anthropic
        // claude-sonnet is not a canonical production ID. The static fallback is
        // only a seed; live discovery remains authoritative.
        expect(talosProviderById('deepseek').defaultModel).toBe('deepseek-v4-flash')
        expect(talosProviderById('anthropic').defaultModel).toBe('claude-sonnet-4-6')
    })

    it('never encodes a supposedly complete static model list', () => {
        for (const provider of talosProviderCatalog) {
            expect(typeof provider.defaultModel, `${provider.id} must expose one string fallback`).toBe('string')
            expect(provider.defaultModel.length).toBeGreaterThan(0)
            // A hardcoded catalog would surface as an array field; the definition
            // must carry only a single seed, never a frozen provider-visible list.
            expect(Array.isArray((provider as Record<string, unknown>).models)).toBe(false)
            expect(Array.isArray((provider as Record<string, unknown>).modelCatalog)).toBe(false)
        }
    })
})
