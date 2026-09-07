import type { TalosMessage } from './talosTypes'

export type TalosControlledFaultLayer = 'validator' | 'policy' | 'provider' | 'network' | 'worker' | 'system'
export type TalosRunActivityStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'denied'

export type TalosControlledFault = {
    layer: TalosControlledFaultLayer
    code: string
    message: string
    nextAction: string | null
    retryable: boolean | null
    status: number | null
    provider: string | null
    model: string | null
}

export type TalosPersistedRunActivity = {
    id: string
    status: TalosRunActivityStatus
    provider: string | null
    model: string | null
    routingProfileId: string | null
}

const runStatuses = new Set<TalosRunActivityStatus>(['queued', 'running', 'succeeded', 'failed', 'denied'])

function record(value: unknown): Record<string, unknown> | null {
    return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
}

function stringValue(value: unknown) {
    return typeof value === 'string' && value.trim() ? value.trim() : null
}

function controlledLayer(value: string): TalosControlledFaultLayer {
    const layer = value.toLowerCase()
    if (layer.includes('validat')) return 'validator'
    if (layer.includes('policy') || layer.includes('capability') || layer.includes('permission') || layer.includes('authoriz')) return 'policy'
    if (layer.includes('provider') || layer.includes('model')) return 'provider'
    if (layer.includes('network') || layer.includes('transport') || layer === 'http') return 'network'
    if (layer.includes('worker') || layer.includes('browser')) return 'worker'
    return 'system'
}

export function talosControlledFault(message: TalosMessage): TalosControlledFault | null {
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

export function talosPersistedRunActivity(message: TalosMessage): TalosPersistedRunActivity | null {
    const metadata = record(message.metadata)
    const run = record(metadata?.run)
    const status = stringValue(run?.status)
    const id = stringValue(run?.id) ?? stringValue(message.run_id)

    if (!run || !status || !runStatuses.has(status as TalosRunActivityStatus) || !id) return null

    return {
        id,
        status: status as TalosRunActivityStatus,
        provider: stringValue(run.provider),
        model: stringValue(run.model),
        // Present when the turn resolved its model through a routing ("Auto")
        // profile; drives the user-facing Auto receipt (FE-only).
        routingProfileId: stringValue(run.model_routing_profile_id) ?? stringValue(run.routing_profile_id),
    }
}
