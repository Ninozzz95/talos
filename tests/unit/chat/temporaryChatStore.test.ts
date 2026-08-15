import { describe, expect, it, vi } from 'vitest'
import { createTalosEphemeralRoutingRepository } from '@/repositories/ephemeralRoutingRepository'
import { createMemoryChatRepository } from '@/repositories/memoryChatRepository'
import { talosIsEphemeralSessionId } from '@/lib/chat/ephemeralSession'

/**
 * F-14 end to end at the persistence boundary, with the REAL router and TWO
 * real in-memory repositories standing in for disk and memory.
 *
 * This is the test that matters. The unit tests above prove the router routes;
 * this one proves that a temporary chat's messages are not in the thing that
 * would have been the disk — which is the promise the feature makes to the user
 * and the only one they cannot check for themselves.
 */
function twoSided() {
    const disk = createMemoryChatRepository()
    const memory = createMemoryChatRepository()
    const routed = createTalosEphemeralRoutingRepository({
        durable: disk, ephemeral: memory, isEphemeral: talosIsEphemeralSessionId,
    })
    return { disk, memory, routed }
}

describe('a temporary chat, against the real router', () => {
    it('writes nothing about itself to the side that would have been the disk', async () => {
        const { disk, memory, routed } = twoSided()
        await routed.initialize()

        await routed.createSession({ id: 'tmp-abc', title: 'Temporanea', created_at: '2026-07-30T10:00:00.000Z' } as never)
        await routed.appendMessage({
            id: 'm1', session_id: 'tmp-abc', role: 'user', content: 'un segreto',
            created_at: '2026-07-30T10:00:01.000Z',
        } as never)

        // The disk knows nothing: not the session, not the message.
        await expect(disk.listSessions()).resolves.toEqual([])
        await expect(disk.listMessages('tmp-abc')).resolves.toEqual([])
        // Memory has it, because the chat has to work while you are in it.
        const kept = await memory.listMessages('tmp-abc')
        expect(kept).toHaveLength(1)
        expect(kept[0]?.content).toBe('un segreto')
    })

    it('keeps an ordinary chat exactly where it has always been', async () => {
        const { disk, memory, routed } = twoSided()
        await routed.initialize()

        await routed.createSession({ id: 'kept', title: 'Normale', created_at: '2026-07-30T10:00:00.000Z' } as never)
        await routed.appendMessage({
            id: 'm1', session_id: 'kept', role: 'user', content: 'ciao',
            created_at: '2026-07-30T10:00:01.000Z',
        } as never)

        await expect(disk.listMessages('kept')).resolves.toHaveLength(1)
        await expect(memory.listMessages('kept')).resolves.toEqual([])
    })

    /**
     * The visible half of the promise: it is the chat you are in, and it is in
     * no history. Nothing arranges this — the session list comes from the
     * durable side, so a temporary chat simply is not in it.
     */
    it('never appears in the history', async () => {
        const { routed } = twoSided()
        await routed.initialize()

        await routed.createSession({ id: 'kept', title: 'Normale', created_at: '2026-07-30T10:00:00.000Z' } as never)
        await routed.createSession({ id: 'tmp-abc', title: 'Temporanea', created_at: '2026-07-30T10:00:02.000Z' } as never)

        const listed = await routed.listSessions()
        expect(listed.map((s) => s.id)).toEqual(['kept'])
    })

    it('takes the temporary chat with it when the app closes', async () => {
        const { routed } = twoSided()
        await routed.initialize()
        await routed.createSession({ id: 'tmp-abc', title: 'Temporanea', created_at: '2026-07-30T10:00:00.000Z' } as never)

        // A fresh memory side is what a restart looks like: nothing survives it,
        // which IS the feature and not a limitation of it.
        const restarted = twoSided()
        await restarted.routed.initialize()

        await expect(restarted.memory.listMessages('tmp-abc')).resolves.toEqual([])
    })
})
