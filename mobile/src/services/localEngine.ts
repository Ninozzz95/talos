import { registerPlugin } from '@capacitor/core'

/**
 * The on-device engine, from JavaScript's side of the bridge.
 *
 * llama.cpp lives behind JNI, which a WebView cannot reach. This is the only
 * door, and it is deliberately thin: it starts and stops a model and hands back
 * text as it arrives. Nothing here decides which backend to use, what counts as
 * a valid measurement, or whether a model fits — those live in Java
 * (`TalosBackendChoice`, `TalosBenchmarkHarness`) and in `fit.ts`, already
 * written and already tested, and a second opinion expressed in TypeScript
 * would be a second answer to a question that must have one.
 */

export interface TalosLocalEngineStatus {
    /** False on the web build, and on any APK built without the native library. */
    available: boolean
    /** Registered ggml backends, comma-separated. Empty when none loaded. */
    backends: string
    /** The model currently held in memory, or null. */
    loadedPath: string | null
}

export interface TalosLocalEngineOpenResult {
    /** What the engine actually granted, which may be less than was asked for. */
    contextTokens: number
}

export interface TalosLocalEngineGeneration {
    text: string
    tokens: number
}

interface TalosLlamaPlugin {
    available(): Promise<TalosLocalEngineStatus>
    open(options: {
        path: string
        threads?: number
        contextTokens?: number
        gpuLayers?: number
    }): Promise<TalosLocalEngineOpenResult>
    generate(options: {
        prompt: string
        maxTokens?: number
        stopAtEndOfGeneration?: boolean
    }): Promise<TalosLocalEngineGeneration>
    cancel(): Promise<void>
    close(): Promise<void>
    addListener(
        event: 'token',
        handler: (payload: { delta: string }) => void,
    ): Promise<{ remove: () => Promise<void> }>
}

const plugin = registerPlugin<TalosLlamaPlugin>('TalosLlama')

/**
 * Absent on the web, and that is the honest answer rather than an inconvenience.
 *
 * A browser has no NDK, no Hexagon, and no gigabyte of weights on local storage.
 * A JavaScript fallback that "sort of" ran a model would be a lie told in the
 * one place this app promises not to — the one where it says the words never
 * leave the device.
 */
export async function talosLocalEngineStatus(): Promise<TalosLocalEngineStatus> {
    try {
        return await plugin.available()
    } catch {
        return { available: false, backends: '', loadedPath: null }
    }
}

export async function talosLocalEngineOpen(
    path: string,
    options: { threads?: number, contextTokens?: number, gpuLayers?: number } = {},
): Promise<TalosLocalEngineOpenResult> {
    return plugin.open({ path, ...options })
}

export async function talosLocalEngineClose(): Promise<void> {
    await plugin.close()
}

export async function talosLocalEngineCancel(): Promise<void> {
    await plugin.cancel()
}

/**
 * Generates, calling `onDelta` with each new piece as it arrives.
 *
 * The listener is attached BEFORE the generation starts and removed in a
 * `finally`. Both matter, and for opposite reasons: attach late and the opening
 * words of every answer are lost, because the model is already talking; forget
 * to remove and the next generation is drawn into the previous conversation,
 * which looks like the app hallucinating rather than like a leaked subscription.
 */
export async function talosLocalEngineGenerate(
    prompt: string,
    onDelta: (delta: string) => void,
    options: { maxTokens?: number, stopAtEndOfGeneration?: boolean } = {},
): Promise<TalosLocalEngineGeneration> {
    const subscription = await plugin.addListener('token', (payload) => {
        if (typeof payload?.delta === 'string' && payload.delta !== '') {
            onDelta(payload.delta)
        }
    })
    try {
        return await plugin.generate({ prompt, ...options })
    } finally {
        await subscription.remove()
    }
}
