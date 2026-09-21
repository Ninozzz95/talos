import type { TalosMobileMessageView } from '@/components/chat/mobileChatTypes'

export type TalosMobileControlledFaultLayer = 'validator' | 'policy' | 'provider' | 'network' | 'worker' | 'system'

export interface TalosMobileControlledFault {
    layer: TalosMobileControlledFaultLayer
    code: string
    message: string
    nextAction: string | null
    retryable: boolean | null
    status: number | null
    provider: string | null
    model: string | null
}

function record(value: unknown): Record<string, unknown> | null {
    return value && typeof value === 'object' && !Array.isArray(value)
        ? value as Record<string, unknown>
        : null
}

function stringValue(value: unknown): string | null {
    return typeof value === 'string' && value.trim() ? value.trim() : null
}

function controlledLayer(value: string): TalosMobileControlledFaultLayer {
    const layer = value.toLowerCase()
    if (layer.includes('validat')) return 'validator'
    if (layer.includes('policy') || layer.includes('capability') || layer.includes('permission') || layer.includes('authoriz')) return 'policy'
    if (layer.includes('provider') || layer.includes('model')) return 'provider'
    if (layer.includes('network') || layer.includes('transport') || layer === 'http') return 'network'
    if (layer.includes('worker') || layer.includes('browser')) return 'worker'
    return 'system'
}

export function talosMobileControlledFault(
    message: Pick<TalosMobileMessageView, 'metadata'>,
): TalosMobileControlledFault | null {
    const metadata = record(message.metadata)
    const error = record(metadata?.chat_error)
    const rawLayer = stringValue(error?.layer)
    const code = stringValue(error?.code) ?? stringValue(metadata?.fault_type)
    const errorMessage = stringValue(error?.message)
    if (!rawLayer || !code || !errorMessage) return null

    return {
        layer: controlledLayer(rawLayer),
        code,
        message: errorMessage,
        nextAction: stringValue(error?.next_action),
        retryable: typeof error?.retryable === 'boolean' ? error.retryable : null,
        status: typeof error?.status === 'number' && Number.isFinite(error.status) ? error.status : null,
        provider: stringValue(error?.provider),
        model: stringValue(error?.model),
    }
}
