import { registerPlugin, type PluginListenerHandle } from '@capacitor/core'

export const TALOS_RUN_SERVICE_CONTRACT = 'talos.mobile.run-service.v1' as const

export type TalosRunServiceStatus = 'running' | 'stopped' | 'cancelled' | 'timed_out'

export interface TalosRunServiceState {
    contract: typeof TALOS_RUN_SERVICE_CONTRACT
    status: TalosRunServiceStatus
    runId: string | null
    updatedAt: number
}

interface TalosRunServicePlugin {
    start(options: {
        title: string
        text: string
        runId: string | null
        cancelable: boolean
    }): Promise<{ ok: boolean }>
    update(options: {
        title: string
        text: string
        runId: string | null
        cancelable: boolean
    }): Promise<{ ok: boolean }>
    stop(): Promise<{ ok: boolean }>
    status(): Promise<unknown>
    addListener(
        event: 'stateChanged',
        listener: (state: unknown) => void,
    ): Promise<PluginListenerHandle>
}

const plugin = registerPlugin<TalosRunServicePlugin>('TalosRunService')

export const TALOS_KEEPER_DELAY_MS = 4_000

export interface TalosRunKeeperOptions {
    runId?: string
    /** Present only when pressing Cancel can actually abort the owned work. */
    onCancel?: () => void
    onTimeout?: () => void
}

export interface TalosRunKeeper {
    engage(text: string): void
    describe(text: string): void
    release(): void
}

function parseRunServiceState(value: unknown): TalosRunServiceState | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null
    const state = value as Partial<TalosRunServiceState>
    if (state.contract !== TALOS_RUN_SERVICE_CONTRACT) return null
    if (!['running', 'stopped', 'cancelled', 'timed_out'].includes(state.status ?? '')) return null
    if (state.runId !== null && typeof state.runId !== 'string') return null
    if (typeof state.updatedAt !== 'number' || !Number.isSafeInteger(state.updatedAt) || state.updatedAt < 0) return null
    return {
        contract: TALOS_RUN_SERVICE_CONTRACT,
        status: state.status as TalosRunServiceStatus,
        runId: state.runId ?? null,
        updatedAt: state.updatedAt,
    }
}

export async function readTalosRunServiceState(): Promise<TalosRunServiceState | null> {
    return parseRunServiceState(await plugin.status())
}

export function createTalosRunKeeper(
    title: string,
    options: TalosRunKeeperOptions = {},
): TalosRunKeeper {
    let started = false
    let released = false
    let description = ''
    let timer: ReturnType<typeof setTimeout> | null = null
    let listener: PluginListenerHandle | null = null
    const runId = options.runId ?? null
    const cancelable = runId !== null && typeof options.onCancel === 'function'

    const listenerPromise = runId === null
        ? null
        : plugin.addListener('stateChanged', (raw) => {
            if (released) return
            const state = parseRunServiceState(raw)
            if (!state || state.runId !== runId) return
            if (state.status === 'cancelled') options.onCancel?.()
            if (state.status === 'timed_out') options.onTimeout?.()
        }).then((handle) => {
            if (released) {
                void handle.remove()
                return
            }
            listener = handle
        }).catch(() => {
            // Losing observability cannot make the owned operation fail.
        })

    function payload(text: string) {
        return { title, text, runId, cancelable }
    }

    function begin(): void {
        if (started || released) return
        started = true
        void plugin.start(payload(description)).catch(() => {
            // The operation continues without native process protection.
        })
    }

    timer = setTimeout(begin, TALOS_KEEPER_DELAY_MS)

    return {
        engage(text: string) {
            description = text
            if (timer !== null) {
                clearTimeout(timer)
                timer = null
            }
            begin()
        },
        describe(text: string) {
            description = text
            if (!started || released) return
            void plugin.update(payload(text)).catch(() => {})
        },
        release() {
            if (released) return
            released = true
            if (timer !== null) {
                clearTimeout(timer)
                timer = null
            }
            if (started) void plugin.stop().catch(() => {})
            if (listener) {
                void listener.remove()
                listener = null
            } else {
                void listenerPromise
            }
        },
    }
}
