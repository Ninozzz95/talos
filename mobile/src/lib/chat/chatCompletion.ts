import type { TalosMobileModelProfileView } from '@/components/chat/mobileChatTypes'
import type { TalosMobileProviderModel } from '@/lib/chat/providerContracts'
import { talosMobileHttpTransport, type TalosMobileHttpTransport } from '@/lib/chat/httpTransport'
import { providerAdapterFor } from '@/lib/chat/providerRegistry'
import type { ChatCompletion, ChatCompletionResult, ChatTurn, TalosStreamHandlers } from '@/stores/chat'

export class ChatConfigError extends Error {
    constructor(message: string) {
        super(message)
        this.name = 'ChatConfigError'
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
            throw new ChatConfigError('Select a model before sending.')
        }

        const adapter = providerAdapterFor(context.profile.provider)
        if (adapter.requiresSecret && !context.apiKey) {
            throw new ChatConfigError(`Add your ${context.profile.provider} API key in Settings to start chatting.`)
        }
        if (!context.providerModel) {
            throw new ChatConfigError(`Refresh the ${context.profile.provider} model catalog before sending.`)
        }
        if (context.providerModel.provider !== context.profile.provider) {
            throw new ChatConfigError('The selected model no longer matches its provider. Refresh the model catalog.')
        }

        const model = context.providerModel.id === context.profile.model
            ? context.providerModel
            : { ...context.providerModel, id: context.profile.model }
        const hasImageInput = turns.some((turn) =>
            turn.parts?.some((part) => part.type === 'image') === true,
        )
        const supportsImageInput = model.inputModalities.some((modality) =>
            ['image', 'images'].includes(modality.toLowerCase()),
        )
        if (hasImageInput && !supportsImageInput) {
            throw new ChatConfigError(
                `${context.profile.display_name} does not declare image input support. Select a vision-capable model.`,
            )
        }
        const input = {
            model,
            turns,
            system: context.system,
            effort: context.effort,
            thinking: context.thinking,
            ...(tools?.length ? { tools } : {}),
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
                }
            } catch (error) {
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
        }
    }
}

function abortSignalRejection(signal?: AbortSignal): Promise<never> {
    return new Promise<never>((_resolve, reject) => {
        if (!signal) return // never settles → Promise.race resolves on the completion
        if (signal.aborted) { reject(new DOMException('Aborted', 'AbortError')); return }
        signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true })
    })
}
