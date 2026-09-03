import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createInMemoryForgeIdempotencyStore } from '@/lib/tools/dynamic/idempotency'

describe('ForgeIdempotencyStore (in-memory)', () => {
    beforeEach(() => { vi.useFakeTimers() })
    afterEach(() => { vi.useRealTimers() })

    it('non trova niente per una chiave mai scritta', async () => {
        const store = createInMemoryForgeIdempotencyStore()
        expect(await store.get('k')).toBeNull()
    })

    it('ritorna il risultato salvato per la stessa chiave', async () => {
        const store = createInMemoryForgeIdempotencyStore()
        await store.put('k', { taskId: 'abc' })
        const record = await store.get('k')
        expect(record?.result).toEqual({ taskId: 'abc' })
    })

    it('scade dopo il TTL — non è una promessa eterna', async () => {
        const store = createInMemoryForgeIdempotencyStore(1_000)
        await store.put('k', 'v')
        vi.advanceTimersByTime(1_001)
        expect(await store.get('k')).toBeNull()
    })

    it('resta valido appena prima del TTL', async () => {
        const store = createInMemoryForgeIdempotencyStore(1_000)
        await store.put('k', 'v')
        vi.advanceTimersByTime(999)
        expect(await store.get('k')).not.toBeNull()
    })
})
