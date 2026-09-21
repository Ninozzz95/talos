import type { TalosMobileProviderId } from '@/components/chat/mobileChatTypes'
import type { TalosMobileProviderAdapter } from '@/lib/chat/providerContracts'
import { TalosMobileProviderError } from '@/lib/chat/providerErrors'

type AdapterLoader = () => Promise<TalosMobileProviderAdapter>

/**
 * What a provider needs before it can be asked anything — named at the call
 * site, because `lazyAdapter('openai', true, false, …)` is a line nobody can
 * read back and this pair is exactly where a silent wrong answer hides.
 */
interface AdapterNeeds {
    readonly requiresSecret: boolean
    readonly requiresEndpoint: boolean
}

function lazyAdapter(
    provider: TalosMobileProviderId,
    needs: AdapterNeeds,
    loader: AdapterLoader,
): TalosMobileProviderAdapter {
    let resolved: Promise<TalosMobileProviderAdapter> | null = null
    const load = (): Promise<TalosMobileProviderAdapter> => {
        resolved ??= loader().then((adapter) => {
            if (adapter.provider !== provider) {
                throw new TalosMobileProviderError({
                    provider,
                    operation: 'complete',
                    message: 'TALOS_PROVIDER_ADAPTER_MISMATCH',
                    uiMessageKey: 'models.providerAdapterMismatch',
                    uiMessageParameters: { provider },
                })
            }
            return adapter
        })
        return resolved
    }
    const adapter: TalosMobileProviderAdapter = {
        provider,
        requiresSecret: needs.requiresSecret,
        requiresEndpoint: needs.requiresEndpoint,
        async listModels(credential, transport) {
            return (await load()).listModels(credential, transport)
        },
        async complete(input, credential, transport) {
            return (await load()).complete(input, credential, transport)
        },
        // F2-T4: the wrapper is frozen before the module loads, so it always
        // exposes streamComplete; a module without streaming throws BEFORE any
        // chunk, which the attempt-and-fallback router treats as "use buffered".
        async streamComplete(input, credential, handlers) {
            const loaded = await load()
            if (!loaded.streamComplete) {
                throw new TalosMobileProviderError({
                    provider,
                    operation: 'complete',
                    message: 'TALOS_PROVIDER_STREAMING_UNSUPPORTED',
                    uiMessageKey: 'models.providerStreamingUnsupported',
                    uiMessageParameters: { provider },
                })
            }
            return loaded.streamComplete(input, credential, handlers)
        },
    }
    return Object.freeze(adapter)
}

const loadOpenAiCompatible = () => import('@/lib/chat/providers/openAiCompatibleAdapter')

/** A hosted service: the key is the whole of it, the URL is already known. */
const KEY_ONLY: AdapterNeeds = Object.freeze({ requiresSecret: true, requiresEndpoint: false })
/** A server the user runs: no account, but nothing works without its address. */
const ADDRESS_ONLY: AdapterNeeds = Object.freeze({ requiresSecret: false, requiresEndpoint: true })
/** The engine in this process. There is nothing to configure and no way to. */
const NOTHING_AT_ALL: AdapterNeeds = Object.freeze({ requiresSecret: false, requiresEndpoint: false })

export const TALOS_MOBILE_PROVIDER_ADAPTERS: Readonly<Record<TalosMobileProviderId, TalosMobileProviderAdapter>> = Object.freeze({
    openai: lazyAdapter('openai', KEY_ONLY, async () => (await loadOpenAiCompatible()).openAiAdapter),
    deepseek: lazyAdapter('deepseek', KEY_ONLY, async () => (await loadOpenAiCompatible()).deepSeekAdapter),
    anthropic: lazyAdapter('anthropic', KEY_ONLY, async () => (await import('@/lib/chat/providers/anthropicAdapter')).anthropicAdapter),
    gemini: lazyAdapter('gemini', KEY_ONLY, async () => (await import('@/lib/chat/providers/geminiAdapter')).geminiAdapter),
    openrouter: lazyAdapter('openrouter', KEY_ONLY, async () => (await loadOpenAiCompatible()).openRouterAdapter),
    ollama: lazyAdapter('ollama', ADDRESS_ONLY, async () => (await import('@/lib/chat/providers/ollamaAdapter')).ollamaAdapter),
    // Lazy like the rest, and for a sharper reason: this one pulls in the
    // bridge to the native engine, which has no business in the entry chunk of
    // a session that may never open a local model.
    local: lazyAdapter('local', NOTHING_AT_ALL, async () => (await import('@/lib/chat/providers/localAdapter')).localAdapter),
})

export function providerAdapterFor(provider: TalosMobileProviderId | string): TalosMobileProviderAdapter {
    const adapter = TALOS_MOBILE_PROVIDER_ADAPTERS[provider as TalosMobileProviderId]
    if (adapter) return adapter
    throw new TalosMobileProviderError({
        provider: 'openai',
        operation: 'complete',
        message: 'TALOS_PROVIDER_UNSUPPORTED',
        uiMessageKey: 'models.providerUnsupported',
        uiMessageParameters: { provider },
    })
}
