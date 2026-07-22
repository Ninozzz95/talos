import { Preferences } from '@capacitor/preferences'
import type { TalosMobileProviderId } from '@/components/chat/mobileChatTypes'
import { normalizeHttpEndpoint } from '@/lib/chat/providerErrors'

const ENDPOINTS_KEY = 'talos.provider.endpoints.v1'

export interface ProviderEndpointBackend {
    get(key: string): Promise<string | null>
    set(key: string, value: string): Promise<void>
    remove(key: string): Promise<void>
}

const defaultBackend: ProviderEndpointBackend = {
    async get(key) {
        return (await Preferences.get({ key })).value
    },
    async set(key, value) {
        await Preferences.set({ key, value })
    },
    async remove(key) {
        await Preferences.remove({ key })
    },
}

function parseEndpointMap(value: string | null): Partial<Record<TalosMobileProviderId, string>> {
    if (!value) return {}
    try {
        const parsed: unknown = JSON.parse(value)
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
        return Object.fromEntries(
            Object.entries(parsed).filter((entry): entry is [TalosMobileProviderId, string] =>
                typeof entry[1] === 'string',
            ),
        )
    } catch {
        return {}
    }
}

export async function getProviderEndpoint(
    provider: TalosMobileProviderId,
    backend: ProviderEndpointBackend = defaultBackend,
): Promise<string | null> {
    const endpoints = parseEndpointMap(await backend.get(ENDPOINTS_KEY))
    return endpoints[provider] ?? null
}

export async function setProviderEndpoint(
    provider: TalosMobileProviderId,
    endpoint: string,
    backend: ProviderEndpointBackend = defaultBackend,
): Promise<void> {
    const canonical = normalizeHttpEndpoint(provider, 'probe', endpoint)
    const endpoints = parseEndpointMap(await backend.get(ENDPOINTS_KEY))
    endpoints[provider] = canonical
    await backend.set(ENDPOINTS_KEY, JSON.stringify(endpoints))
}

export async function clearProviderEndpoint(
    provider: TalosMobileProviderId,
    backend: ProviderEndpointBackend = defaultBackend,
): Promise<void> {
    const endpoints = parseEndpointMap(await backend.get(ENDPOINTS_KEY))
    delete endpoints[provider]
    if (Object.keys(endpoints).length === 0) {
        await backend.remove(ENDPOINTS_KEY)
        return
    }
    await backend.set(ENDPOINTS_KEY, JSON.stringify(endpoints))
}
