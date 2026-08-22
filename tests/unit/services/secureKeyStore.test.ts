import { beforeEach, describe, expect, it } from 'vitest'
import {
    clearProviderKey,
    getProviderKey,
    hasProviderKey,
    setProviderKey,
    type SecureKeyBackend,
} from '@/services/secureKeyStore'

// In-memory stand-in for the OS Keystore (the real backend is the Capacitor plugin).
function memoryBackend(): SecureKeyBackend & { store: Map<string, string> } {
    const store = new Map<string, string>()
    return {
        store,
        async get(key) {
            return store.has(key) ? store.get(key)! : null
        },
        async set(key, value) {
            store.set(key, value)
        },
        async remove(key) {
            return store.delete(key)
        },
    }
}

let backend: ReturnType<typeof memoryBackend>
beforeEach(() => {
    backend = memoryBackend()
})

describe('secureKeyStore', () => {
    it('stores and reads a provider key', async () => {
        await setProviderKey('anthropic', 'sk-ant-123', backend)
        expect(await getProviderKey('anthropic', backend)).toBe('sk-ant-123')
        expect(await hasProviderKey('anthropic', backend)).toBe(true)
    })

    it('trims the key and rejects an empty one', async () => {
        await setProviderKey('anthropic', '  sk-trim  ', backend)
        expect(await getProviderKey('anthropic', backend)).toBe('sk-trim')
        await expect(setProviderKey('anthropic', '   ', backend)).rejects.toThrow()
    })

    it('reports no key before one is set and after clearing', async () => {
        expect(await hasProviderKey('openai', backend)).toBe(false)
        expect(await getProviderKey('openai', backend)).toBeNull()
        await setProviderKey('openai', 'sk-oa', backend)
        await clearProviderKey('openai', backend)
        expect(await hasProviderKey('openai', backend)).toBe(false)
    })

    it('keeps keys namespaced per provider', async () => {
        await setProviderKey('anthropic', 'sk-ant', backend)
        await setProviderKey('openai', 'sk-oa', backend)
        expect(await getProviderKey('anthropic', backend)).toBe('sk-ant')
        expect(await getProviderKey('openai', backend)).toBe('sk-oa')
        // stored under distinct, namespaced keys — never the bare provider id
        const keys = [...backend.store.keys()]
        expect(keys).toContain('talos.provider.key.anthropic')
        expect(keys).not.toContain('anthropic')
    })

    it('treats a non-string backend value as absent', async () => {
        // @ts-expect-error deliberately store a non-string to exercise the guard
        backend.store.set('talos.provider.key.gemini', 42)
        expect(await getProviderKey('gemini', backend)).toBeNull()
    })
})
