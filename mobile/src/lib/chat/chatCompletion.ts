import { adaptTurnsForTextOnlyModel } from '@/lib/chat/visionFallback'
import type { TalosMessageParameters } from '@/i18n/contracts'
import { talosModelSupportsToolCalling } from '@/lib/chat/modelToolCapabilities'
import type { TalosMobileModelProfileView } from '@/components/chat/mobileChatTypes'
import type { TalosMobileProviderModel } from '@/lib/chat/providerContracts'
import { talosMobileHttpTransport, type TalosMobileHttpTransport } from '@/lib/chat/httpTransport'
import { providerAdapterFor } from '@/lib/chat/providerRegistry'
import type { ChatCompletion, ChatCompletionResult, ChatTurn, TalosStreamHandlers } from '@/stores/chat'

export class ChatConfigError extends Error {
    readonly uiMessageKey: string
    readonly uiMessageParameters?: TalosMessageParameters

    constructor(code: string, uiMessageKey: string, uiMessageParameters?: TalosMessageParameters) {
        super(code)
        this.name = 'ChatConfigError'
        this.uiMessageKey = uiMessageKey
        this.uiMessageParameters = uiMessageParameters
    }
}

export interface CompletionContext {
    profile: TalosMobileModelProfileView | null
    providerModel?: TalosMobileProviderModel | null
    apiKey: string | null
    endpoint?: string | null
    timeoutMs?: number
    effort: string
    thinking: boolean
    system?: string
}

export function buildChatCompletion(
    getContext: () => CompletionContext,
    transport: TalosMobileHttpTransport = talosMobileHttpTransport,
): ChatCompletion {
    // The tools travel as a third argument rather than through the context, so
    // a caller that has no tool suite (tests, the enhancer) is unchanged.
    return async (
        turns: ChatTurn[],
        stream?: TalosStreamHandlers,
        tools?: readonly import('@/lib/tools/registry').TalosToolDefinition<never>[],
    ): Promise<ChatCompletionResult> => {
        const context = getContext()
        if (!context.profile) {
            throw new ChatConfigError('TALOS_CHAT_MODEL_REQUIRED', 'chat.selectModelBeforeSending')
        }

        const adapter = providerAdapterFor(context.profile.provider)
        if (adapter.requiresSecret && !context.apiKey) {
            throw new ChatConfigError(
                'TALOS_CHAT_PROVIDER_KEY_REQUIRED',
                'chat.addProviderKeyToChat',
                { provider: context.profile.provider },
            )
        }
        if (!context.providerModel) {
            throw new ChatConfigError(
                'TALOS_CHAT_PROVIDER_CATALOG_REQUIRED',
                'chat.refreshProviderBeforeSending',
                { provider: context.profile.provider },
            )
        }
        if (context.providerModel.provider !== context.profile.provider) {
            throw new ChatConfigError(
                'TALOS_CHAT_PROVIDER_MODEL_MISMATCH',
                'chat.modelProviderMismatch',
            )
        }

        const model = context.providerModel.id === context.profile.model
            ? context.providerModel
            : { ...context.providerModel, id: context.profile.model }
        const compatibleTools = talosModelSupportsToolCalling(model) ? tools : undefined
        const supportsImageInput = model.inputModalities.some((modality) =>
            ['image', 'images'].includes(modality.toLowerCase()),
        )
        /**
         * WHERE the image is decides what happens to it.
         *
         * Owner 2026-07-27: switching a live conversation from Opus 5 to
         * DeepSeek killed every further message, because the guard fired on any
         * image anywhere in the history. One photo sent an hour earlier
         * poisoned the chat for good.
         *
         * In the message being sent NOW, refusing is right: the user just
         * attached something this model cannot see and deserves to know before
         * paying for a reply about nothing. Further back, the image is dropped
         * with a line in its place — you cannot un-send a photo, and a model
         * handed a conversation with a silent hole in it answers as though it
         * had seen something.
         */
        let outbound = turns
        if (!supportsImageInput) {
            const last = turns[turns.length - 1]
            if (last?.parts?.some((part) => part.type === 'image')) {
                throw new ChatConfigError(
                    'TALOS_CHAT_IMAGE_INPUT_UNSUPPORTED',
                    'chat.modelCannotReadImages',
                    { model: context.profile.display_name },
                )
            }
            outbound = adaptTurnsForTextOnlyModel(turns).turns
        }
        const input = {
            model,
            turns: outbound,
            system: context.system,
            effort: context.effort,
            thinking: context.thinking,
            ...(compatibleTools?.length ? { tools: compatibleTools } : {}),
        }
        const credential = { apiKey: context.apiKey, endpoint: context.endpoint, timeoutMs: context.timeoutMs }

        // F2-T4 attempt-and-fallback: try the native streaming path first; any
        // PRE-first-byte failure (CORS, HTTP error, unsupported) retries the
        // buffered transport transparently. Once partial text was delivered the
        // error propagates so the store persists the honest interrupted partial
        // instead of silently re-fetching a diverging answer. A user abort never
        // falls back — that would fire a second request the user just cancelled.
        if (stream && adapter.streamComplete) {
            let sawChunk = false
            try {
                const streamed = await adapter.streamComplete(input, credential, {
                    onChunk: (text) => {
                        sawChunk = true
                        stream.onChunk(text)
                    },
                    // Defect #5: reasoning flows on its own channel. It must NOT
                    // set sawChunk — a stream that only ever produced thinking
                    // and then failed should still fall back to the buffered
                    // transport rather than being persisted as an empty answer.
                    onReasoning: (text) => stream.onReasoning?.(text),
                    signal: stream.signal,
                })
                return {
                    text: streamed.text,
                    finishReason: streamed.finishReason ?? null,
                    reasoning: streamed.reasoning,
                    toolCalls: streamed.toolCalls,
                    // ⛔ Anche qui: sono DUE le strade che tornano un risultato,
                    // e curarne una sola vuol dire che il difetto resta per chi
                    // usa lo streaming — cioè per quasi tutti.
                    providerBlocks: streamed.providerBlocks,
                    usage: streamed.usage ?? null,
                }
            } catch (error) {
                // A reader implementation may wrap cancellation in a generic
                // Error. The signal is the authoritative user intent: never
                // turn Stop into a second, buffered inference.
                if (stream.signal?.aborted) {
                    throw talosAbortError()
                }
                const aborted = error instanceof Error && error.name === 'AbortError'
                // R1-SF-M3: a STALL means the server DID answer (or accepted
                // the request) and then went silent — a transparent buffered
                // re-request would double the inference and the bill. Surface
                // it honestly instead of silently re-asking.
                const stalled = error instanceof Error && /stream stalled|first byte/.test(error.message)
                if (sawChunk || aborted || stalled) throw error
                // SF-MAJOR: the buffered path is a SECOND generation. Whatever
                // reasoning the failed stream produced belongs to an answer
                // that will never be shown, and pairing it with the new one is
                // a lie the export would carry. It also leaves the live header
                // up with no loader behind it.
                stream.onReasoningReset?.()
            }
        }
        // The buffered transport is CapacitorHttp (native — not AbortSignal-aware),
        // so Stop can't cancel the in-flight native request server-side. Race it
        // against the abort signal so Stop still frees the UI immediately (the store
        // treats the AbortError as a user abort and drops the result).
        const result = await Promise.race([
            adapter.complete(input, credential, transport),
            abortSignalRejection(stream?.signal),
        ])
        // Debt A1: finishReason used to be produced by every adapter and thrown
        // away here — it is exactly what an agent loop dispatches on.
        return {
            text: result.text,
            finishReason: result.finishReason ?? null,
            reasoning: result.reasoning,
            toolCalls: result.toolCalls,
            /*
             * ⛔ Copiato A MANO, e il typecheck NON poteva accorgersene.
             *
             * Questo è un oggetto costruito campo per campo: un campo
             * opzionale che nessuno copia resta `undefined`, e resta valido.
             * Cioè il valore sarebbe arrivato fin qui — attraversando il
             * contratto dell'adattatore e il tipo del negozio, entrambi
             * dichiarati — per sparire nell'ultima riga senza un errore.
             *
             * È letteralmente il difetto «il valore che muore all'ultimo
             * ponte», e l'unico modo di trovarlo era seguire il dato a mano
             * fino a qui invece di fidarsi del compilatore.
             */
            providerBlocks: result.providerBlocks,
            usage: result.usage ?? null,
        }
    }
}

function abortSignalRejection(signal?: AbortSignal): Promise<never> {
    return new Promise<never>((_resolve, reject) => {
        if (!signal) return // never settles → Promise.race resolves on the completion
        if (signal.aborted) { reject(talosAbortError()); return }
        signal.addEventListener('abort', () => reject(talosAbortError()), { once: true })
    })
}

function talosAbortError(): Error {
    const error = new Error('Aborted')
    error.name = 'AbortError'
    return error
}
