import type {
    TalosMobileModelProfileView,
    TalosMobileProviderId,
} from '@/components/chat/mobileChatTypes'

export type TalosMobileProviderTone = 'blue' | 'green' | 'purple' | 'amber' | 'cyan' | 'neutral'

export interface TalosMobileProviderView {
    id: TalosMobileProviderId | 'unknown'
    label: string
    shortLabel: string
    requiresSecret: boolean
    tone: TalosMobileProviderTone
    logoAlt: string
}

export const TALOS_MOBILE_PROVIDERS: readonly TalosMobileProviderView[] = Object.freeze([
    {
        id: 'openai',
        label: 'OpenAI',
        shortLabel: 'OA',
        requiresSecret: true,
        tone: 'green',
        logoAlt: 'OpenAI logo',
    },
    {
        id: 'deepseek',
        label: 'DeepSeek',
        shortLabel: 'DS',
        requiresSecret: true,
        tone: 'blue',
        logoAlt: 'DeepSeek logo',
    },
    {
        id: 'anthropic',
        label: 'Anthropic',
        shortLabel: 'AN',
        requiresSecret: true,
        tone: 'purple',
        logoAlt: 'Anthropic logo',
    },
    {
        id: 'gemini',
        label: 'Google Gemini',
        shortLabel: 'GE',
        requiresSecret: true,
        tone: 'amber',
        logoAlt: 'Google Gemini logo',
    },
    {
        id: 'openrouter',
        label: 'OpenRouter',
        shortLabel: 'OR',
        requiresSecret: true,
        tone: 'cyan',
        logoAlt: 'OpenRouter logo',
    },
    {
        id: 'ollama',
        label: 'Ollama Local',
        shortLabel: 'OL',
        requiresSecret: false,
        tone: 'neutral',
        logoAlt: 'Ollama Local logo',
    },
])

const UNKNOWN_PROVIDER: TalosMobileProviderView = Object.freeze({
    id: 'unknown',
    label: 'Unknown provider',
    shortLabel: 'Unknown',
    requiresSecret: true,
    tone: 'neutral',
    logoAlt: '',
})

export function talosMobileProviderById(
    providerId: TalosMobileProviderId | string | null | undefined,
): TalosMobileProviderView {
    return TALOS_MOBILE_PROVIDERS.find((provider) => provider.id === providerId) ?? UNKNOWN_PROVIDER
}

export function talosMobileModelProfileIsCallable(
    profile: TalosMobileModelProfileView | null | undefined,
): boolean {
    if (!profile || profile.status === 'failed' || profile.status === 'disabled') return false

    const provider = talosMobileProviderById(profile.provider)
    return !provider.requiresSecret || profile.has_secret
}
