import type { TalosMobileProviderId } from '@/components/chat/mobileChatTypes'
import type { TalosMessageParameters } from '@/i18n/contracts'
import type { TalosMobileProviderCredential } from '@/lib/chat/providerContracts'

export type TalosMobileProviderOperation = 'list_models' | 'complete' | 'probe'

export class TalosMobileProviderError extends Error {
    readonly provider: TalosMobileProviderId
    readonly operation: TalosMobileProviderOperation
    readonly status?: number
    readonly uiMessageKey?: string
    readonly uiMessageParameters?: TalosMessageParameters

    constructor(args: {
        provider: TalosMobileProviderId
        operation: TalosMobileProviderOperation
        message: string
        status?: number
        uiMessageKey?: string
        uiMessageParameters?: TalosMessageParameters
    }) {
        super(args.message)
        this.name = 'TalosMobileProviderError'
        this.provider = args.provider
        this.operation = args.operation
        this.status = args.status
        this.uiMessageKey = args.uiMessageKey
        this.uiMessageParameters = args.uiMessageParameters
    }
}

export function requireProviderApiKey(
    provider: TalosMobileProviderId,
    operation: TalosMobileProviderOperation,
    credential: TalosMobileProviderCredential,
): string {
    const apiKey = credential.apiKey?.trim()
    if (!apiKey) {
        throw new TalosMobileProviderError({
            provider,
            operation,
            message: 'TALOS_PROVIDER_KEY_REQUIRED',
            uiMessageKey: 'models.providerKeyRequired',
            uiMessageParameters: { provider },
        })
    }
    return apiKey
}

export function providerErrorMessage(data: unknown, fallback: string): string {
    if (!data || typeof data !== 'object') return fallback
    const record = data as Record<string, unknown>
    if (typeof record.message === 'string' && record.message.trim()) return record.message
    const nested = record.error
    if (nested && typeof nested === 'object') {
        const message = (nested as Record<string, unknown>).message
        if (typeof message === 'string' && message.trim()) return message
    }
    return fallback
}

export function requireHttpSuccess(args: {
    provider: TalosMobileProviderId
    operation: TalosMobileProviderOperation
    status: number
    data: unknown
}): void {
    if (args.status >= 200 && args.status < 300) return
    const externalMessage = providerErrorMessage(args.data, '')
    throw new TalosMobileProviderError({
        provider: args.provider,
        operation: args.operation,
        status: args.status,
        message: externalMessage || 'TALOS_PROVIDER_HTTP_FAILED',
        ...(!externalMessage ? {
            uiMessageKey: 'models.providerHttpFailed',
            uiMessageParameters: { provider: args.provider, status: args.status },
        } : {}),
    })
}

export function malformedProviderResponse(
    provider: TalosMobileProviderId,
    operation: TalosMobileProviderOperation,
): TalosMobileProviderError {
    return new TalosMobileProviderError({
        provider,
        operation,
        message: 'TALOS_PROVIDER_RESPONSE_MALFORMED',
        uiMessageKey: operation === 'list_models'
            ? 'models.providerCatalogMalformed'
            : 'models.providerChatMalformed',
        uiMessageParameters: { provider },
    })
}

export function normalizeHttpEndpoint(
    provider: TalosMobileProviderId,
    operation: TalosMobileProviderOperation,
    endpoint: string | null | undefined,
): string {
    const value = endpoint?.trim()
    if (!value) {
        throw new TalosMobileProviderError({
            provider,
            operation,
            message: 'TALOS_PROVIDER_ENDPOINT_REQUIRED',
            uiMessageKey: 'models.providerEndpointRequired',
            uiMessageParameters: { provider },
        })
    }
    let url: URL
    try {
        url = new URL(value)
    } catch {
        throw new TalosMobileProviderError({
            provider,
            operation,
            message: 'TALOS_PROVIDER_ENDPOINT_INVALID',
            uiMessageKey: 'models.providerEndpointInvalid',
            uiMessageParameters: { provider },
        })
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        throw new TalosMobileProviderError({
            provider,
            operation,
            message: 'TALOS_PROVIDER_ENDPOINT_PROTOCOL',
            uiMessageKey: 'models.providerEndpointProtocol',
            uiMessageParameters: { provider },
        })
    }
    if (url.username || url.password) {
        throw new TalosMobileProviderError({
            provider,
            operation,
            message: 'TALOS_PROVIDER_ENDPOINT_CREDENTIALS',
            uiMessageKey: 'models.providerEndpointCredentials',
            uiMessageParameters: { provider },
        })
    }
    return url.toString().replace(/\/$/, '')
}
