import type { TalosMobileProviderId } from '@/components/chat/mobileChatTypes'
import type { ChatTurn } from '@/stores/chat'
import type { TalosMobileHttpTransport } from '@/lib/chat/httpTransport'

export type TalosMobileChatCompatibility = 'supported' | 'unsupported' | 'unknown'

export interface TalosMobileProviderCredential {
    apiKey?: string | null
    endpoint?: string | null
    timeoutMs?: number
}

export interface TalosMobileProviderModel {
    id: string
    provider: TalosMobileProviderId
    displayName: string
    chatCompatibility: TalosMobileChatCompatibility
    canonicalSlug?: string | null
    contextLength?: number | null
    maxOutputTokens?: number | null
    inputModalities: string[]
    outputModalities: string[]
    supportedParameters: string[]
    createdAt?: string | number | null
    expiresAt?: string | null
    ownedBy?: string | null
    capabilityProvenance?: 'observed' | 'declared'
}

export interface TalosMobileProviderCatalog {
    provider: TalosMobileProviderId
    models: TalosMobileProviderModel[]
}

export interface TalosMobileProviderProbeResult {
    ok: boolean
    provider: TalosMobileProviderId
    modelId?: string | null
    message: string
}

export interface TalosMobileCompletionInput {
    model: TalosMobileProviderModel
    turns: ChatTurn[]
    system?: string
    effort: string
    thinking: boolean
}

export interface TalosMobileCompletionResult {
    text: string
    model: string
    finishReason?: string | null
    usage?: Record<string, number> | null
}

export interface TalosMobileProviderAdapter {
    readonly provider: TalosMobileProviderId
    readonly requiresSecret: boolean
    listModels(
        credential: TalosMobileProviderCredential,
        transport: TalosMobileHttpTransport,
    ): Promise<TalosMobileProviderCatalog>
    complete(
        input: TalosMobileCompletionInput,
        credential: TalosMobileProviderCredential,
        transport: TalosMobileHttpTransport,
    ): Promise<TalosMobileCompletionResult>
}
