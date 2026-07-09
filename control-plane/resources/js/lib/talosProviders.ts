import type { TalosModelProfile } from './talosTypes'

export type TalosProviderId = TalosModelProfile['provider']
export type TalosProviderTone = 'blue' | 'green' | 'purple' | 'amber' | 'cyan' | 'neutral'

export type TalosProviderDefinition = {
    id: TalosProviderId
    label: string
    shortLabel: string
    description: string
    defaultModel: string
    defaultBaseUrl: string
    defaultTimeoutSeconds: number
    requiresSecret: boolean
    baseUrlVisibleByDefault: boolean
    secretLabel: string
    policyNote: string
    tone: TalosProviderTone
    capabilities: Record<string, boolean>
}

export const talosProviderCatalog: TalosProviderDefinition[] = [
    {
        id: 'openai',
        label: 'OpenAI',
        shortLabel: 'OA',
        description: 'Hosted model profile for typed JSON, tool calls, and multimodal AVM workflows.',
        defaultModel: 'gpt-4.1-mini',
        defaultBaseUrl: 'https://api.openai.com/v1',
        defaultTimeoutSeconds: 60,
        requiresSecret: true,
        baseUrlVisibleByDefault: false,
        secretLabel: 'Provider API key',
        policyNote: 'Remote provider endpoint must pass TALOS public URL policy before secrets are sent.',
        tone: 'green',
        capabilities: { json: true, tools: true, vision: true, embeddings: true, remote: true, local: false },
    },
    {
        id: 'deepseek',
        label: 'DeepSeek',
        shortLabel: 'DS',
        description: 'Cost-focused hosted provider for coding and structured planning lanes.',
        defaultModel: 'deepseek-chat',
        defaultBaseUrl: 'https://api.deepseek.com/v1',
        defaultTimeoutSeconds: 60,
        requiresSecret: true,
        baseUrlVisibleByDefault: false,
        secretLabel: 'Provider API key',
        policyNote: 'Remote provider endpoint must pass TALOS public URL policy before secrets are sent.',
        tone: 'blue',
        capabilities: { json: true, tools: true, vision: false, embeddings: false, remote: true, local: false },
    },
    {
        id: 'anthropic',
        label: 'Anthropic',
        shortLabel: 'AN',
        description: 'Hosted reasoning lane for long-form analysis and operator review workflows.',
        defaultModel: 'claude-sonnet',
        defaultBaseUrl: 'https://api.anthropic.com/v1',
        defaultTimeoutSeconds: 60,
        requiresSecret: true,
        baseUrlVisibleByDefault: false,
        secretLabel: 'Provider API key',
        policyNote: 'TALOS uses the Anthropic message endpoint through a server-side adapter.',
        tone: 'purple',
        capabilities: { json: true, tools: true, vision: true, embeddings: false, remote: true, local: false },
    },
    {
        id: 'gemini',
        label: 'Google Gemini',
        shortLabel: 'GE',
        description: 'Hosted multimodal lane for research, visual context, and fast workflow drafting.',
        defaultModel: 'gemini-2.5-flash',
        defaultBaseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
        defaultTimeoutSeconds: 60,
        requiresSecret: true,
        baseUrlVisibleByDefault: false,
        secretLabel: 'Provider API key',
        policyNote: 'The OpenAI-compatible Gemini endpoint is used so TALOS keeps one probe contract.',
        tone: 'amber',
        capabilities: { json: true, tools: true, vision: true, embeddings: true, remote: true, local: false },
    },
    {
        id: 'openrouter',
        label: 'OpenRouter',
        shortLabel: 'OR',
        description: 'Brokered hosted profile for model experiments without changing the TALOS workflow contract.',
        defaultModel: 'openai/gpt-4.1-mini',
        defaultBaseUrl: 'https://openrouter.ai/api/v1',
        defaultTimeoutSeconds: 60,
        requiresSecret: true,
        baseUrlVisibleByDefault: false,
        secretLabel: 'Provider API key',
        policyNote: 'Router endpoints still pass the same public URL and secret redaction policy.',
        tone: 'cyan',
        capabilities: { json: true, tools: true, vision: true, embeddings: false, remote: true, local: false },
    },
    {
        id: 'ollama',
        label: 'Ollama Local',
        shortLabel: 'OL',
        description: 'Local OpenAI-compatible endpoint for private development and air-gapped evaluation.',
        defaultModel: 'llama3.1',
        defaultBaseUrl: 'http://127.0.0.1:11434/v1',
        defaultTimeoutSeconds: 60,
        requiresSecret: false,
        baseUrlVisibleByDefault: true,
        secretLabel: 'Local endpoint',
        policyNote: 'Local providers are allowed only without bearer tokens.',
        tone: 'neutral',
        capabilities: { json: true, tools: false, vision: false, embeddings: true, remote: false, local: true },
    },
]

export function talosProviderById(providerId: TalosProviderId | string | null | undefined): TalosProviderDefinition {
    return talosProviderCatalog.find((provider) => provider.id === providerId) ?? talosProviderCatalog[0]
}
