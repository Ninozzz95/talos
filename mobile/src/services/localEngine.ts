import { registerPlugin } from '@capacitor/core'
import {
    talosLocalContextCandidates,
    talosShouldRetryLocalOpen,
} from '@/lib/models/localContextPolicy'

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
    /**
     * Ciò che il modello ha pensato, già staccato da ciò che ha detto.
     *
     * Owner 2026-08-03: `<think></think>` stampati sopra la risposta. Non era
     * una mancanza del cassetto «Ragionamento» — quello esiste e funziona coi
     * provider di rete — ma del motore locale, che passava al modello ChatML
     * nudo e poi rileggeva l'uscita senza sapere che formato aspettarsi.
     *
     * La separazione la fa `common_chat_parse` sul lato nativo, cioè lo stesso
     * codice che ha applicato il template: la documentazione di Qwen avverte di
     * non usare parser a parole d'arresto per i modelli che ragionano, «because
     * the model may output stopwords in the thought section».
     */
    reasoning?: string
    /**
     * Le chiamate che il modello ha chiesto di eseguire.
     *
     * Owner 2026-08-03: «i locali devono avere le stesse possibilità dei key».
     * Nella stessa forma degli altri provider, perché l'esecutore a valle non
     * deve sapere da dove arriva una chiamata: un tool eseguito per un modello
     * locale è lo stesso tool.
     */
    toolCalls?: ReadonlyArray<{ name: string, arguments: string, id: string }>
}

/** Exact native plan for one templated local conversation. */
export interface TalosLocalEngineChatPlan {
    prompt: string
    promptTokens: number
    contextTokens: number
}

interface TalosLlamaPlugin {
    available(): Promise<TalosLocalEngineStatus>
    deleteInstalled(options: { path: string }): Promise<{ deleted: boolean }>
    open(options: {
        path: string
        threads?: number
        contextTokens?: number
        gpuLayers?: number
        /**
         * L'argmax, per MISURARE — mai per parlare.
         *
         * Confrontare due backend vuol dire pretendere lo stesso identico testo
         * da entrambi, quindi il banco di prova chiede questo. La chat no: con
         * l'argmax un 4B quantizzato si impunta sul token in testa di un
         * millesimo e finisce a ripetere la stessa frase fino a esaurire i
         * token. Misurato sul tablet il 2026-08-03, stesso modello e stesso
         * prompt: acceso, cinque ripetizioni di fila; spento, una risposta che
         * si chiude da sola in 112 token invece di 160.
         */
        deterministic?: boolean
    }): Promise<TalosLocalEngineOpenResult>
    generate(options: {
        prompt: string
        maxTokens?: number
        stopAtEndOfGeneration?: boolean
    }): Promise<TalosLocalEngineGeneration>
    installed(): Promise<{
        models: Array<{ path: string, bytes: number, name: string, modifiedAt?: number }>
        unreadable?: Array<{ path: string, reason: string }>
    }>
    chatPrompt(options: {
        turns: ReadonlyArray<{ role: string, content: string }>
        /**
         * I tool, in forma OpenAI, passati al TEMPLATE del modello.
         *
         * Non descritti a parole nel prompt: ogni famiglia annuncia una
         * chiamata a modo suo — `<tool_call>`, JSON puro, blocchi speciali — e
         * quel formato lo conosce il GGUF. Il template restituisce anche la
         * grammatica che rende la chiamata valida per costruzione.
         */
        tools?: readonly unknown[]
    }): Promise<TalosLocalEngineChatPlan>
    cancel(): Promise<void>
    close(): Promise<void>
    addListener(
        event: 'token',
        handler: (payload: { delta: string }) => void,
    ): Promise<{ remove: () => Promise<void> }>
}

const plugin = registerPlugin<TalosLlamaPlugin>('TalosLlama')

export type TalosLocalEngineOpenStage =
    | 'path'
    | 'model-load'
    | 'context'
    | 'sampler'
    | 'template'
    | 'generation'
    | 'unknown'

/** A stable, non-sensitive native failure that callers can act on. */
export class TalosLocalEngineOpenError extends Error {
    readonly stage: TalosLocalEngineOpenStage
    readonly nativeCode: string

    constructor(stage: TalosLocalEngineOpenStage, nativeCode: string) {
        super(nativeCode)
        this.name = 'TalosLocalEngineOpenError'
        this.stage = stage
        this.nativeCode = nativeCode
    }
}

export type TalosLocalEngineGenerationStage = 'context-required' | 'generation'

/** Stable, non-sensitive failure from the asynchronous generation boundary. */
export class TalosLocalEngineGenerationError extends Error {
    readonly stage: TalosLocalEngineGenerationStage
    readonly nativeCode: string
    readonly promptTokens: number | null
    readonly contextTokens: number | null
    readonly requiredContextTokens: number | null

    constructor(options: {
        stage: TalosLocalEngineGenerationStage
        nativeCode: string
        promptTokens?: number | null
        contextTokens?: number | null
        requiredContextTokens?: number | null
    }) {
        super(options.nativeCode)
        this.name = 'TalosLocalEngineGenerationError'
        this.stage = options.stage
        this.nativeCode = options.nativeCode
        this.promptTokens = options.promptTokens ?? null
        this.contextTokens = options.contextTokens ?? null
        this.requiredContextTokens = options.requiredContextTokens ?? null
    }
}

type TalosLocalEngineOpenOptions = {
    threads?: number
    contextTokens?: number
    gpuLayers?: number
    deterministic?: boolean
}

function recordOf(value: unknown): Record<string, unknown> | null {
    return value !== null && typeof value === 'object'
        ? value as Record<string, unknown>
        : null
}

function openStageOf(error: unknown): TalosLocalEngineOpenStage {
    const failure = recordOf(error)
    const data = recordOf(failure?.data)
    const stage = data?.stage
    if (
        stage === 'path'
        || stage === 'model-load'
        || stage === 'context'
        || stage === 'sampler'
        || stage === 'template'
        || stage === 'generation'
        || stage === 'unknown'
    ) return stage

    const code = typeof failure?.code === 'string'
        ? failure.code
        : error instanceof Error ? error.message : ''
    if (code === 'TALOS_LLAMA_PATH_REQUIRED' || code === 'TALOS_LLAMA_MODEL_MISSING') {
        return 'path'
    }
    return 'unknown'
}

function nativeCodeOf(error: unknown): string {
    const failure = recordOf(error)
    if (typeof failure?.code === 'string' && failure.code) return failure.code
    if (error instanceof Error && error.message) return error.message
    return 'TALOS_LLAMA_OPEN_FAILED'
}

function integerOf(value: unknown): number | null {
    return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
        ? value
        : null
}

function generationErrorOf(error: unknown): TalosLocalEngineGenerationError {
    if (error instanceof TalosLocalEngineGenerationError) return error
    const failure = recordOf(error)
    const data = recordOf(failure?.data)
    const nativeCode = typeof failure?.code === 'string' && failure.code
        ? failure.code
        : error instanceof Error && error.message
            ? error.message
            : 'TALOS_LLAMA_GENERATION_FAILED'
    const stage = data?.stage === 'context-required'
        || nativeCode === 'TALOS_LLAMA_CONTEXT_REQUIRED'
        ? 'context-required'
        : 'generation'
    return new TalosLocalEngineGenerationError({
        stage,
        nativeCode,
        promptTokens: integerOf(data?.promptTokens),
        contextTokens: integerOf(data?.contextTokens),
        requiredContextTokens: integerOf(data?.requiredContextTokens),
    })
}

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
    options: TalosLocalEngineOpenOptions = {},
): Promise<TalosLocalEngineOpenResult> {
    try {
        return await plugin.open({ path, ...options })
    } catch (error) {
        if (error instanceof TalosLocalEngineOpenError) throw error
        throw new TalosLocalEngineOpenError(openStageOf(error), nativeCodeOf(error))
    }
}

/** Opens once at the requested context and retries only a native context fault. */
export async function talosLocalEngineOpenWithFallback(
    path: string,
    options: TalosLocalEngineOpenOptions = {},
): Promise<TalosLocalEngineOpenResult> {
    const candidates = talosLocalContextCandidates(options.contextTokens)
    for (let index = 0; index < candidates.length; index += 1) {
        try {
            return await talosLocalEngineOpen(path, {
                ...options,
                contextTokens: candidates[index],
            })
        } catch (error) {
            const retry = error instanceof TalosLocalEngineOpenError
                && talosShouldRetryLocalOpen(error.stage)
                && index + 1 < candidates.length
            if (!retry) throw error
        }
    }
    throw new TalosLocalEngineOpenError('unknown', 'TALOS_LLAMA_OPEN_FAILED')
}

export interface TalosLocalModelFile {
    path: string
    bytes: number
    name: string
    /**
     * Epoch milliseconds from the file itself. The question a person asks
     * right after a download is "which one did I just get", and a list that
     * can only be ordered by name or size cannot answer it.
     *
     * Zero when the filesystem refused to say — `lastModified()` returns 0
     * rather than throwing, and a 1970 date on screen would be a lie the
     * list tells confidently.
     */
    modifiedAt: number
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
        // `modifiedAt` is optional on the wire so an older native side —
        // side-by-side installs make that a real case — degrades to «date
        // unknown» instead of putting 1970 at the top of the list.
        models: Array.isArray(models)
            ? models.map((file) => ({ ...file, modifiedAt: file.modifiedAt ?? 0 }))
            : [],
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
export async function talosLocalEngineChatPlan(
    turns: ReadonlyArray<{ role: string, content: string }>,
    tools?: readonly unknown[],
): Promise<TalosLocalEngineChatPlan> {
    const plan = await plugin.chatPrompt({ turns, tools })
    return {
        prompt: plan.prompt,
        promptTokens: integerOf(plan.promptTokens) ?? 0,
        contextTokens: integerOf(plan.contextTokens) ?? 0,
    }
}

/** Compatibility projection for callers that only need the formatted text. */
export async function talosLocalEngineChatPrompt(
    turns: ReadonlyArray<{ role: string, content: string }>,
    tools?: readonly unknown[],
): Promise<string> {
    return (await talosLocalEngineChatPlan(turns, tools)).prompt
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
        try {
            return await plugin.generate({ prompt, ...options })
        } catch (error) {
            throw generationErrorOf(error)
        }
    } finally {
        await subscription.remove()
    }
}

/**
 * Cancella un modello scaricato.
 *
 * Owner 2026-08-04: sui modelli locali non si poteva fare CRUD — si scaricavano
 * e non si toglievano, se non dalle impostazioni di sistema, cioe' uscendo da
 * TALOS per rimediare a una cosa fatta dentro TALOS.
 *
 * `deleted: false` non e' un guasto: vuol dire che il file non c'era gia' piu'
 * — l'esito che si voleva, ottenuto da qualcun altro.
 */
export async function talosLocalModelDelete(path: string): Promise<boolean> {
    const { deleted } = await plugin.deleteInstalled({ path })
    return deleted
}
