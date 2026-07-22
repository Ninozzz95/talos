import type { TalosMobileProviderId } from '@/components/chat/mobileChatTypes'
import type { TalosMobileProviderCredential } from '@/lib/chat/providerContracts'

export type TalosMobileProviderOperation = 'list_models' | 'complete' | 'probe'

export class TalosMobileProviderError extends Error {
    readonly provider: TalosMobileProviderId
    readonly operation: TalosMobileProviderOperation
    readonly status?: number

    constructor(args: {
        provider: TalosMobileProviderId
        operation: TalosMobileProviderOperation
        message: string
        status?: number
    }) {
        super(args.message)
        this.name = 'TalosMobileProviderError'
        this.provider = args.provider
        this.operation = args.operation
        this.status = args.status
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
            message: `Add your ${provider} API key before continuing.`,
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
    throw new TalosMobileProviderError({
        provider: args.provider,
        operation: args.operation,
        status: args.status,
        message: providerErrorMessage(args.data, `${args.provider} request failed (HTTP ${args.status}).`),
    })
}

export function malformedProviderResponse(
    provider: TalosMobileProviderId,
    operation: TalosMobileProviderOperation,
): TalosMobileProviderError {
    return new TalosMobileProviderError({
        provider,
        operation,
        message: `${provider} returned a malformed ${operation === 'list_models' ? 'model catalog' : 'chat response'}.`,
    })
}

export function normalizeHttpEndpoint(
    provider: TalosMobileProviderId,
    operation: TalosMobileProviderOperation,
    endpoint: string | null | undefined,
): string {
    const value = endpoint?.trim()
    if (!value) {
        throw new TalosMobileProviderError({ provider, operation, message: `Configure the ${provider} endpoint first.` })
    }
    let url: URL
    try {
        url = new URL(value)
    } catch {
        throw new TalosMobileProviderError({ provider, operation, message: `${provider} endpoint must be a valid HTTP URL.` })
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        throw new TalosMobileProviderError({ provider, operation, message: `${provider} endpoint must use HTTP or HTTPS.` })
    }
    if (url.username || url.password) {
        throw new TalosMobileProviderError({ provider, operation, message: `${provider} endpoint must not contain embedded credentials.` })
    }
    return url.toString().replace(/\/$/, '')
}
