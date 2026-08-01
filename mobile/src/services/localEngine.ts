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
    installed(): Promise<{
        models: Array<{ path: string, bytes: number, name: string }>
        unreadable?: Array<{ path: string, reason: string }>
    }>
    chatPrompt(options: {
        turns: ReadonlyArray<{ role: string, content: string }>
    }): Promise<{ prompt: string }>
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

export interface TalosLocalModelFile {
    path: string
    bytes: number
    name: string
}

/** A folder the walk could not open, and the cause it reported. */
export interface TalosLocalModelUnreadable {
    path: string
    reason: string
}

export interface TalosLocalModelListing {
    models: TalosLocalModelFile[]
    /**
     * Empty when the answer is complete. Anything in here means the list above
     * is a PARTIAL answer, and "no models" must not be said on its own.
     */
    unreadable: TalosLocalModelUnreadable[]
}

/**
 * The models on this device that can actually be opened.
 *
 * Read from the disk on every call, never remembered. Android reclaims storage
 * without asking, and the user can delete a file from the system's own storage
 * screen; a cached list would go on offering something that is gone, and fail
 * halfway into loading it rather than at the moment of choosing.
 *
 * Returns what it found AND what it could not look at. This used to be an array
 * with `catch { return [] }` around it, which turned three different situations
 * — nothing downloaded, a folder that refused to open, and the bridge itself
 * failing — into one sentence in the model picker: "no models". On a tablet
 * holding a two-gigabyte model that sentence sent the search in the wrong
 * direction for three rounds. A failure that reaches the user as an empty list
 * is a failure that has been hidden, not handled.
 */
export async function talosLocalInstalledModels(): Promise<TalosLocalModelListing> {
    const { models, unreadable } = await plugin.installed()
    return {
        models: Array.isArray(models) ? models : [],
        unreadable: Array.isArray(unreadable) ? unreadable : [],
    }
}

/**
 * The conversation, punctuated the way THIS model expects.
 *
 * Deliberately not built in TypeScript. Every model family marks turns
 * differently and the marks live inside the GGUF; writing "User: … Assistant: …"
 * here would work in the sense of producing output, and would quietly cost
 * quality on every answer — a defect that reads as the model being weak and
 * sends people to download a different one.
 *
 * Rejects with `TALOS_LLAMA_NO_CHAT_TEMPLATE` when the file declares none. That
 * is a refusal to be shown, not a case to paper over.
 */
export async function talosLocalEngineChatPrompt(
    turns: ReadonlyArray<{ role: string, content: string }>,
): Promise<string> {
    const { prompt } = await plugin.chatPrompt({ turns })
    return prompt
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
