import type { TalosMobileProviderId } from '@/components/chat/mobileChatTypes'
import type { TalosMessageParameters } from '@/i18n/contracts'
import type { TalosMobileProviderCredential } from '@/lib/chat/providerContracts'
import { talosLogDeviceIssue } from '@/lib/talosDeviceLog'
import {
    talosDescribeSchemaIssues,
    talosDescribeShape,
    type TalosSchemaIssue,
} from '@/lib/diagnostics/shapeCapture'

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
    // The status and the shape of the body, never the body. A provider that
    // starts refusing calls should be visible in the Doctor without the user
    // having to reproduce it while someone watches.
    talosLogDeviceIssue(
        'TALOS_PROVIDER_HTTP',
        `${args.provider}/${args.operation} status=${args.status} body=${talosDescribeShape(args.data)}`,
    )
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

/**
 * Owner 2026-07-30, his own session export: "anthropic ha restituito una
 * risposta chat non valida." The message is true and useless — it says the
 * response was not understood and discards WHAT was not understood, so the one
 * report meant to settle the question could not answer it and the transcript
 * had to arrive separately before anything could be diagnosed.
 *
 * The evidence now travels: the shape of what arrived, and which rule it broke.
 * Neither carries a value, so this records itself for every user by default
 * rather than hiding behind a debug switch nobody turns on before they already
 * have the problem.
 */
export interface TalosMalformedEvidence {
    /** The payload whose SHAPE is recorded. Its contents never travel. */
    readonly received?: unknown
    /** Zod's own issues; only path and code are used, never the message. */
    readonly issues?: readonly TalosSchemaIssue[]
    /** Why this counted as malformed when the schema itself was satisfied. */
    readonly note?: string
}

export function malformedProviderResponse(
    provider: TalosMobileProviderId,
    operation: TalosMobileProviderOperation,
    evidence: TalosMalformedEvidence = {},
): TalosMobileProviderError {
    talosLogDeviceIssue(
        'TALOS_PROVIDER_MALFORMED',
        [
            `${provider}/${operation}`,
            evidence.note ? `note=${evidence.note}` : '',
            `got=${talosDescribeShape(evidence.received)}`,
            evidence.issues ? `broke=${talosDescribeSchemaIssues(evidence.issues)}` : '',
        ].filter(Boolean).join(' '),
    )
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

/**
 * The answer arrived, was well formed, and had nothing in it.
 *
 * Kept apart from `malformedProviderResponse` because the two send the reader to
 * different places. Malformed means the provider broke its own contract; empty
 * means it kept it and the model had nothing to say — most often a reasoning
 * model that spent its entire token budget thinking, which is measured
 * behaviour on small reasoning models, not a hypothesis. Reported as
 * "malformed", it made the owner look for a broken provider on 2026-08-02 when
 * the fix was to choose a different writer.
 */
export function emptyProviderResponse(
    provider: TalosMobileProviderId,
    operation: TalosMobileProviderOperation,
    finishReason: string | null,
): TalosMobileProviderError {
    talosLogDeviceIssue(
        'TALOS_PROVIDER_EMPTY',
        [`${provider}/${operation}`, `finish=${finishReason ?? 'unknown'}`].join(' '),
    )
    return new TalosMobileProviderError({
        provider,
        operation,
        message: 'TALOS_PROVIDER_RESPONSE_EMPTY',
        // "length" is the provider telling us the budget ran out; anything else
        // and the model simply produced nothing.
        uiMessageKey: finishReason === 'length'
            ? 'models.providerChatEmptyBudget'
            : 'models.providerChatEmpty',
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

/**
 * The single piece of evidence an error refers to — a path, a URL — for showing
 * BESIDE the translated sentence rather than inside it.
 *
 * Inside is where it was, and interpolated parameters are HTML-escaped so that
 * a value from outside can never smuggle markup into a translated string. A
 * filesystem path through that escaping reads `&#x2F;storage&#x2F;…`, which is
 * what a user was actually shown on 2026-08-01: the right diagnosis, unreadable.
 * Returned raw here, and the interface renders it as text, never as markup.
 */
export function talosProviderErrorDetail(error: unknown): string | null {
    if (!(error instanceof TalosMobileProviderError)) return null
    const parameters = error.uiMessageParameters
    if (!parameters) return null
    const candidate = parameters.path ?? parameters.endpoint ?? parameters.url
    return typeof candidate === 'string' && candidate !== '' ? candidate : null
}
