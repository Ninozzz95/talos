import type { TalosMobileModelProfileView } from '@/components/chat/mobileChatTypes'
import type { TalosMobileProviderModel } from '@/lib/chat/providerContracts'
import { talosMobileHttpTransport, type TalosMobileHttpTransport } from '@/lib/chat/httpTransport'
import { providerAdapterFor } from '@/lib/chat/providerRegistry'
import type { ChatCompletion, ChatTurn, TalosStreamHandlers } from '@/stores/chat'

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
    return async (turns: ChatTurn[], stream?: TalosStreamHandlers): Promise<string> => {
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
                    signal: stream.signal,
                })
                return streamed.text
            } catch (error) {
                const aborted = error instanceof Error && error.name === 'AbortError'
                // R1-SF-M3: a STALL means the server DID answer (or accepted
                // the request) and then went silent — a transparent buffered
                // re-request would double the inference and the bill. Surface
                // it honestly instead of silently re-asking.
                const stalled = error instanceof Error && /stream stalled|first byte/.test(error.message)
                if (sawChunk || aborted || stalled) throw error
            }
        }
        const result = await adapter.complete(input, credential, transport)
        return result.text
    }
}
