import type { TalosMobileProviderId } from '@/components/chat/mobileChatTypes'
import type { TalosMobileProviderAdapter } from '@/lib/chat/providerContracts'
import { TalosMobileProviderError } from '@/lib/chat/providerErrors'

type AdapterLoader = () => Promise<TalosMobileProviderAdapter>

function lazyAdapter(
    provider: TalosMobileProviderId,
    requiresSecret: boolean,
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
        requiresSecret,
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

export const TALOS_MOBILE_PROVIDER_ADAPTERS: Readonly<Record<TalosMobileProviderId, TalosMobileProviderAdapter>> = Object.freeze({
    openai: lazyAdapter('openai', true, async () => (await loadOpenAiCompatible()).openAiAdapter),
    deepseek: lazyAdapter('deepseek', true, async () => (await loadOpenAiCompatible()).deepSeekAdapter),
    anthropic: lazyAdapter('anthropic', true, async () => (await import('@/lib/chat/providers/anthropicAdapter')).anthropicAdapter),
    gemini: lazyAdapter('gemini', true, async () => (await import('@/lib/chat/providers/geminiAdapter')).geminiAdapter),
    openrouter: lazyAdapter('openrouter', true, async () => (await loadOpenAiCompatible()).openRouterAdapter),
    ollama: lazyAdapter('ollama', false, async () => (await import('@/lib/chat/providers/ollamaAdapter')).ollamaAdapter),
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
