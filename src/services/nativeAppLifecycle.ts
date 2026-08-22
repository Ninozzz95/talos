import { App } from '@capacitor/app'
import type { PluginListenerHandle } from '@capacitor/core'

export type TalosBackDisposition = 'handled' | 'history' | 'exit'

export type NativeLifecycleErrorCode =
    | 'NATIVE_BACK_REGISTRATION_FAILED'
    | 'NATIVE_BACK_HANDLER_FAILED'
    | 'NATIVE_BACK_HISTORY_UNAVAILABLE'
    | 'NATIVE_BACK_EXIT_FAILED'
    | 'NATIVE_BACK_REMOVE_FAILED'

export class NativeLifecycleError extends Error {
    readonly code: NativeLifecycleErrorCode

    constructor(code: NativeLifecycleErrorCode, message: string) {
        super(message)
        this.name = 'NativeLifecycleError'
        this.code = code
    }
}

export interface NativeLifecycleController {
    readonly ready: Promise<void>
    dispose(): Promise<void>
}

export interface RegisterNativeAppLifecycleOptions {
    onBack(event: Readonly<{ canGoBack: boolean }>): TalosBackDisposition | Promise<TalosBackDisposition>
    onError(error: NativeLifecycleError): void
}

function messageOf(error: unknown): string {
    if (error instanceof Error) return error.message
    return String(error)
}

/**
 * Register the single Android hardware-back listener with a fully async,
 * fail-closed contract. Registering the listener disables the platform default
 * back behavior (Capacitor App plugin), so every back event is resolved here
 * through a serialized FIFO queue: exactly one handler runs at a time.
 */
export function registerNativeAppLifecycle(
    options: RegisterNativeAppLifecycleOptions,
): NativeLifecycleController {
    let disposed = false
    let handle: PluginListenerHandle | null = null
    let removalPromise: Promise<void> | null = null
    const queue: Array<Readonly<{ canGoBack: boolean }>> = []
    let processing = false

    const report = (error: NativeLifecycleError) => {
        options.onError(error)
    }

    async function processQueue(): Promise<void> {
        if (processing) return
        processing = true
        try {
            while (queue.length > 0 && !disposed) {
                const event = queue.shift() as Readonly<{ canGoBack: boolean }>
                await handleOne(event)
            }
        } finally {
            processing = false
        }
    }

    async function handleOne(event: Readonly<{ canGoBack: boolean }>): Promise<void> {
        let disposition: TalosBackDisposition
        try {
            disposition = await options.onBack({ canGoBack: event.canGoBack })
        } catch (error) {
            report(new NativeLifecycleError('NATIVE_BACK_HANDLER_FAILED', messageOf(error)))
            return
        }
        if (disposed) return
        switch (disposition) {
            case 'handled':
                return
            case 'history':
                if (event.canGoBack) {
                    window.history.back()
                } else {
                    report(new NativeLifecycleError('NATIVE_BACK_HISTORY_UNAVAILABLE', 'history back requested at the root of the stack'))
                }
                return
            case 'exit':
                try {
                    await App.exitApp()
                } catch (error) {
                    report(new NativeLifecycleError('NATIVE_BACK_EXIT_FAILED', messageOf(error)))
                }
                return
            default:
                report(new NativeLifecycleError('NATIVE_BACK_HANDLER_FAILED', `unsupported back disposition "${String(disposition)}"`))
        }
    }

    const backListener = (event: { canGoBack: boolean }) => {
        if (disposed) return
        queue.push({ canGoBack: event.canGoBack })
        void processQueue()
    }

    const registration = App.addListener('backButton', backListener)

    const ready = registration.then(
        (registered) => {
            handle = registered
            return undefined
        },
        (error) => {
            // Registration failed: there is no live listener, so refuse to
            // process any stray event and let dispose resolve as a no-op.
            disposed = true
            const wrapped = new NativeLifecycleError('NATIVE_BACK_REGISTRATION_FAILED', messageOf(error))
            report(wrapped)
            throw wrapped
        },
    )

    async function dispose(): Promise<void> {
        disposed = true
        if (!removalPromise) {
            removalPromise = (async () => {
                let registered: PluginListenerHandle
                try {
                    registered = handle ?? (await registration)
                } catch {
                    // Registration never produced a handle; nothing to remove.
                    return
                }
                try {
                    await registered.remove()
                } catch (error) {
                    report(new NativeLifecycleError('NATIVE_BACK_REMOVE_FAILED', messageOf(error)))
                }
            })()
        }
        return removalPromise
    }

    // Avoid an unhandled rejection when the caller does not await ready.
    void ready.catch(() => undefined)

    return { ready, dispose }
}
