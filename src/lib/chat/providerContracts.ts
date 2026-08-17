import type { TalosMobileProviderId } from '@/components/chat/mobileChatTypes'
import type { ChatTurn, TalosToolCall } from '@/stores/chat'
import type { TalosToolDefinition } from '@/lib/tools/registry'
import type { TalosMobileHttpTransport } from '@/lib/chat/httpTransport'

export type TalosMobileChatCompatibility = 'supported' | 'unsupported' | 'unknown'

export interface TalosMobileProviderCredential {
    apiKey?: string | null
    endpoint?: string | null
    timeoutMs?: number
}

export interface TalosMobileProviderModel {
    id: string
    provider: TalosMobileProviderId
    displayName: string
    chatCompatibility: TalosMobileChatCompatibility
    canonicalSlug?: string | null
    contextLength?: number | null
    maxOutputTokens?: number | null
    inputModalities: string[]
    outputModalities: string[]
    supportedParameters: string[]
    createdAt?: string | number | null
    expiresAt?: string | null
    ownedBy?: string | null
    capabilityProvenance?: 'observed' | 'declared'
}

export interface TalosMobileProviderCatalog {
    provider: TalosMobileProviderId
    models: TalosMobileProviderModel[]
}

export interface TalosMobileProviderProbeResult {
    ok: boolean
    provider: TalosMobileProviderId
    modelId?: string | null
    message: string
}

export interface TalosMobileCompletionInput {
    model: TalosMobileProviderModel
    turns: ChatTurn[]
    system?: string
    effort: string
    thinking: boolean
    /**
     * Tools the model may call this turn. Provider-agnostic on purpose: each
     * adapter translates them into its own wire shape, so a tool is written
     * once and every family sees the same schema.
     */
    tools?: readonly TalosToolDefinition<never>[]
}

export interface TalosMobileCompletionResult {
    text: string
    model: string
    finishReason?: string | null
    usage?: Record<string, number> | null
    /** Defect #5: the model's own reasoning, when the provider streams it. */
    reasoning?: string
    /** Tools the model asked to run, in the shared representation. */
    toolCalls?: TalosToolCall[]
    /**
     * ⭐⭐ Blocchi che il fornitore pretende indietro IMMUTATI al giro dopo.
     *
     * Oggi sono i due della ricerca attrezzi di Anthropic — `server_tool_use` e
     * `tool_search_tool_result` — e sono deliberatamente `unknown[]`: darsi
     * un'interfaccia vorrebbe dire dichiarare di aver capito una forma che non
     * e' nostra, e riscriverla e' esattamente cio' che la documentazione vieta.
     *
     * ⛔ Sta nel CONTRATTO e non solo nell'adattatore, e la ragione e' un
     * difetto gia' pagato in questo progetto: uno spread passa il typecheck
     * anche quando il tipo non dichiara il campo, e il valore muore in
     * silenzio al ponte successivo. Se non e' qui, non arriva a nessuno.
     */
    providerBlocks?: readonly unknown[]
}

/** F2-T4 — live streaming callbacks handed to a provider adapter. */
export interface TalosProviderStreamHandlers {
    onChunk: (text: string) => void
    /** Defect #5: reasoning arrives on its own channel and stays separate. */
    onReasoning?: (text: string) => void
    signal?: AbortSignal
}

export interface TalosMobileProviderAdapter {
    readonly provider: TalosMobileProviderId
    readonly requiresSecret: boolean
    /**
     * Whether this provider is unusable without a base URL.
     *
     * Stated rather than inferred, because inferring it cost a working feature.
     * The callers used to read "does not need a key" as "is Ollama, therefore
     * needs an address", which held for exactly as long as every provider was
     * one of those two. The on-device engine is the third kind and needs
     * NEITHER: it has nothing to authenticate to and nothing to connect to. Its
     * catalogue was therefore refused before it was ever asked for, and the
     * symptom was a model picker that showed no local models — indistinguishable
     * from an empty disk, which is why it survived a full build, install and
     * inspection.
     *
     * Required, not optional-with-a-default. A default is how the next adapter
     * would inherit the wrong answer in silence.
     */
    readonly requiresEndpoint: boolean
    listModels(
        credential: TalosMobileProviderCredential,
        transport: TalosMobileHttpTransport,
    ): Promise<TalosMobileProviderCatalog>
    complete(
        input: TalosMobileCompletionInput,
        credential: TalosMobileProviderCredential,
        transport: TalosMobileHttpTransport,
    ): Promise<TalosMobileCompletionResult>
    /**
     * Optional streaming completion via native fetch (attempt-and-fallback):
     * MUST throw before delivering any chunk when the stream cannot start, so
     * the caller can transparently retry through the buffered transport.
     */
    streamComplete?(
        input: TalosMobileCompletionInput,
        credential: TalosMobileProviderCredential,
        handlers: TalosProviderStreamHandlers,
    ): Promise<TalosMobileCompletionResult>
}
