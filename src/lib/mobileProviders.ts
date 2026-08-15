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
    /**
     * Whether this provider has anything to CONFIGURE — a key, an endpoint, a
     * timeout, a discovery result — and therefore a row in the Provider tab.
     *
     * It exists because this list quietly answers two different questions and
     * only ever had one way to say no. `PROVIDER_IDS` in the chat controller is
     * derived from it, so membership here decides which providers the RUNTIME
     * knows about: catalogues, discovery, secrets, endpoints. The Provider tab
     * reads the same array to decide what to DRAW.
     *
     * The on-device engine belongs to the first set and not the second, and
     * with only presence to express that, it was first added — which crashed
     * the settings panel looking for a runtime row it cannot have — and then
     * removed, which deleted it from the runtime and left an adapter nothing
     * ever called. Two wrong answers to a question the data could not state.
     * Now it can.
     */
    configurable: boolean
}

export const TALOS_MOBILE_PROVIDERS: readonly TalosMobileProviderView[] = Object.freeze([
    {
        id: 'openai',
        label: 'OpenAI',
        shortLabel: 'OA',
        requiresSecret: true,
        tone: 'green',
        logoAlt: 'OpenAI logo',
        configurable: true,
    },
    {
        id: 'deepseek',
        label: 'DeepSeek',
        shortLabel: 'DS',
        requiresSecret: true,
        tone: 'blue',
        logoAlt: 'DeepSeek logo',
        configurable: true,
    },
    {
        id: 'anthropic',
        label: 'Anthropic',
        shortLabel: 'AN',
        requiresSecret: true,
        tone: 'purple',
        logoAlt: 'Anthropic logo',
        configurable: true,
    },
    {
        id: 'gemini',
        label: 'Google Gemini',
        shortLabel: 'GE',
        requiresSecret: true,
        tone: 'amber',
        logoAlt: 'Google Gemini logo',
        configurable: true,
    },
    {
        id: 'openrouter',
        label: 'OpenRouter',
        shortLabel: 'OR',
        requiresSecret: true,
        tone: 'cyan',
        logoAlt: 'OpenRouter logo',
        configurable: true,
    },
    {
        id: 'ollama',
        label: 'Ollama Local',
        shortLabel: 'OL',
        requiresSecret: false,
        tone: 'neutral',
        logoAlt: 'Ollama Local logo',
        configurable: true,
    },
    /**
     * The engine on this device. Present so the runtime knows it exists, and
     * `configurable: false` so the Provider tab does not try to draw a settings
     * row for something with no key, no endpoint and nothing that can time out.
     */
    {
        id: 'local',
        label: 'Motore locale',
        shortLabel: 'ON',
        requiresSecret: false,
        tone: 'neutral',
        logoAlt: 'On-device engine',
        configurable: false,
    },
])

const UNKNOWN_PROVIDER: TalosMobileProviderView = Object.freeze({
    id: 'unknown',
    label: 'Unknown provider',
    shortLabel: 'Unknown',
    requiresSecret: true,
    tone: 'neutral',
    logoAlt: '',
    configurable: false,
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
