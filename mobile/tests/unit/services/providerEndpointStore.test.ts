import { describe, expect, it } from 'vitest'
import {
    clearProviderEndpoint,
    getProviderEndpoint,
    setProviderEndpoint,
    type ProviderEndpointBackend,
} from '@/services/providerEndpointStore'

function backend(): ProviderEndpointBackend & { values: Map<string, string> } {
    const values = new Map<string, string>()
    return {
        values,
        async get(key) { return values.get(key) ?? null },
        async set(key, value) { values.set(key, value) },
        async remove(key) { values.delete(key) },
    }
}

describe('providerEndpointStore', () => {
    it('persists a canonical HTTP endpoint without credentials', async () => {
        const store = backend()
        await setProviderEndpoint('ollama', 'http://10.0.0.4:11434/', store)
        await expect(getProviderEndpoint('ollama', store)).resolves.toBe('http://10.0.0.4:11434')
    })

    it('I18N-CONFORMANCE-09 rejects unsafe endpoints with stable error identities', async () => {
        const store = backend()
        await expect(setProviderEndpoint('ollama', 'file:///tmp/ollama', store))
            .rejects.toThrow('TALOS_PROVIDER_ENDPOINT_PROTOCOL')
        await expect(setProviderEndpoint('ollama', 'https://user:pass@example.com', store))
            .rejects.toThrow('TALOS_PROVIDER_ENDPOINT_CREDENTIALS')
        expect(store.values.size).toBe(0)
    })

    it('clears an endpoint idempotently', async () => {
        const store = backend()
        await setProviderEndpoint('ollama', 'https://ollama.example', store)
        await clearProviderEndpoint('ollama', store)
        await expect(getProviderEndpoint('ollama', store)).resolves.toBeNull()
    })
})
