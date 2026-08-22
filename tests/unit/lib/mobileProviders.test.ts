import { describe, expect, it } from 'vitest'
import type { TalosMobileModelProfileView } from '@/components/chat/mobileChatTypes'
import {
    talosMobileModelProfileIsCallable,
    talosMobileProviderById,
} from '@/lib/mobileProviders'

function profile(overrides: Partial<TalosMobileModelProfileView> = {}): TalosMobileModelProfileView {
    return {
        id: 'profile-openai',
        provider: 'openai',
        model: 'gpt-5.2',
        display_name: 'GPT-5.2',
        status: 'healthy',
        has_secret: true,
        effort_levels: ['low', 'medium', 'high'],
        supports_thinking: false,
        show_in_composer: true,
        capabilities: null,
        probe_ok: true,
        ...overrides,
    }
}

describe('mobile provider presentation contract', () => {
    it('uses the exact desktop provider labels and secret policy', () => {
        expect(talosMobileProviderById('openai')).toMatchObject({ label: 'OpenAI', requiresSecret: true })
        expect(talosMobileProviderById('deepseek')).toMatchObject({ label: 'DeepSeek', requiresSecret: true })
        expect(talosMobileProviderById('anthropic')).toMatchObject({ label: 'Anthropic', requiresSecret: true })
        expect(talosMobileProviderById('gemini')).toMatchObject({ label: 'Google Gemini', requiresSecret: true })
        expect(talosMobileProviderById('openrouter')).toMatchObject({ label: 'OpenRouter', requiresSecret: true })
        expect(talosMobileProviderById('ollama')).toMatchObject({ label: 'Ollama Local', requiresSecret: false })
    })

    it('disables secret-backed profiles without a secret and failed profiles', () => {
        expect(talosMobileModelProfileIsCallable(profile())).toBe(true)
        expect(talosMobileModelProfileIsCallable(profile({ has_secret: false }))).toBe(false)
        expect(talosMobileModelProfileIsCallable(profile({ status: 'failed' }))).toBe(false)
        expect(talosMobileModelProfileIsCallable(profile({ status: 'disabled' }))).toBe(false)
        expect(talosMobileModelProfileIsCallable(profile({
            provider: 'ollama',
            has_secret: false,
            status: 'untested',
        }))).toBe(true)
    })

    it('fails closed for an unknown provider identity', () => {
        expect(talosMobileProviderById('unsupported-provider')).toMatchObject({
            id: 'unknown',
            label: 'Unknown provider',
            requiresSecret: true,
        })
    })
})
