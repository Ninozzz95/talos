import { nextTick, ref } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import { TALOS_CAPABILITY_CONTRACT } from '../lib/talosCapabilities'
import { useTalosCapabilities } from './useTalosCapabilities'

function manifest(
    state: 'available' | 'degraded' | 'blocked' | 'planned' = 'available',
    reason: string | null = state === 'available' ? null : 'Capability is limited.',
) {
    return {
        contract: TALOS_CAPABILITY_CONTRACT,
        revision: '2026-07-28.1',
        capabilities: [{
            id: 'chat.provider',
            state,
            reason,
            evidence: ['api:POST /api/talos/chat'],
        }],
    }
}

function deferred<T>() {
    let resolve!: (value: T) => void
    let reject!: (reason?: unknown) => void
    const promise = new Promise<T>((resolvePromise, rejectPromise) => {
        resolve = resolvePromise
        reject = rejectPromise
    })

    return { promise, resolve, reject }
}

describe('useTalosCapabilities', () => {
    it('loads once only after authentication, runtime readiness and an owner key exist', async () => {
        const authenticated = ref(false)
        const runtimeReady = ref(false)
        const ownerKey = ref<string | null>(null)
        const fetchManifest = vi.fn(async () => manifest())
        const capabilities = useTalosCapabilities({
            authenticated,
            runtimeReady,
            ownerKey,
            fetchManifest,
        })

        expect(capabilities.capability('chat.provider').state).toBe('blocked')
        expect(capabilities.isAvailable('chat.provider')).toBe(false)
        expect(fetchManifest).not.toHaveBeenCalled()

        authenticated.value = true
        runtimeReady.value = true
        await nextTick()
        expect(fetchManifest).not.toHaveBeenCalled()

        ownerKey.value = 'settings-owner-a'
        await nextTick()
        await nextTick()

        expect(fetchManifest).toHaveBeenCalledTimes(1)
        expect(fetchManifest).toHaveBeenCalledWith('settings-owner-a')
        expect(capabilities.loadState.value).toBe('loaded')
        expect(capabilities.isAvailable('chat.provider')).toBe(true)

        await capabilities.loadCapabilities()
        expect(fetchManifest).toHaveBeenCalledTimes(1)
    })

    it('drops late responses after owner change and keeps the new owner authoritative', async () => {
        const authenticated = ref(true)
        const runtimeReady = ref(true)
        const ownerKey = ref<string | null>('owner-a')
        const first = deferred<unknown>()
        const second = deferred<unknown>()
        const fetchManifest = vi.fn((owner: string) => (
            owner === 'owner-a' ? first.promise : second.promise
        ))
        const capabilities = useTalosCapabilities({
            authenticated,
            runtimeReady,
            ownerKey,
            fetchManifest,
        })
        await nextTick()

        ownerKey.value = 'owner-b'
        await nextTick()
        first.resolve(manifest('available'))
        await nextTick()
        await nextTick()

        expect(capabilities.manifest.value).toBeNull()
        expect(capabilities.isAvailable('chat.provider')).toBe(false)

        second.resolve(manifest('blocked', 'Owner B has no healthy provider.'))
        await nextTick()
        await nextTick()

        expect(fetchManifest).toHaveBeenCalledTimes(2)
        expect(capabilities.capability('chat.provider')).toMatchObject({
            state: 'blocked',
            reason: 'Owner B has no healthy provider.',
        })
    })

    it('drops an in-flight response after logout and clears verified state', async () => {
        const authenticated = ref(true)
        const runtimeReady = ref(true)
        const ownerKey = ref<string | null>('owner-a')
        const pending = deferred<unknown>()
        const capabilities = useTalosCapabilities({
            authenticated,
            runtimeReady,
            ownerKey,
            fetchManifest: () => pending.promise,
        })
        await nextTick()

        authenticated.value = false
        ownerKey.value = null
        await nextTick()
        pending.resolve(manifest())
        await nextTick()
        await nextTick()

        expect(capabilities.manifest.value).toBeNull()
        expect(capabilities.loadState.value).toBe('idle')
        expect(capabilities.isAvailable('chat.provider')).toBe(false)
    })

    it('fails closed on malformed responses and permits only a real degraded fallback', async () => {
        const authenticated = ref(true)
        const runtimeReady = ref(true)
        const ownerKey = ref<string | null>('owner-a')
        const malformed = useTalosCapabilities({
            authenticated,
            runtimeReady,
            ownerKey,
            fetchManifest: async () => ({ ...manifest(), contract: 'wrong' }),
        })
        await nextTick()
        await nextTick()

        expect(malformed.loadState.value).toBe('error')
        expect(malformed.error.value).toMatch(/unsupported capability contract/i)
        expect(malformed.isAvailable('chat.provider')).toBe(false)
        expect(malformed.isUsable('chat.provider')).toBe(false)

        const degraded = useTalosCapabilities({
            authenticated,
            runtimeReady,
            ownerKey,
            fetchManifest: async () => manifest('degraded', 'Buffered fallback remains available.'),
        })
        await nextTick()
        await nextTick()

        expect(degraded.isAvailable('chat.provider')).toBe(false)
        expect(degraded.isUsable('chat.provider')).toBe(true)
    })
})
