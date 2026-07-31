import { describe, expect, it } from 'vitest'
import { createTalosEphemeralRoutingRepository } from '@/repositories/ephemeralRoutingRepository'
import { createMemoryChatRepository } from '@/repositories/memoryChatRepository'
import { talosIsEphemeralSessionId } from '@/lib/chat/ephemeralSession'

/**
 * Owner 2026-07-31: a temporary chat behaved like a ghost — it was in the list
 * after a restart, and the chat he was typing into was not the chat he was in.
 *
 * The session list comes from the DURABLE side by design: a temporary chat must
 * never appear in the history. But the store then concluded that a session
 * missing from that list did not exist, and it re-ran that conclusion after
 * EVERY message. Absence from the durable list is a temporary session's
 * defining property, not evidence that it is gone.
 *
 * This pins both halves of the contract, because fixing one by breaking the
 * other is the obvious wrong move.
 */
function twoSided() {
    const disk = createMemoryChatRepository()
    const memory = createMemoryChatRepository()
    return createTalosEphemeralRoutingRepository({
        durable: disk, ephemeral: memory, isEphemeral: talosIsEphemeralSessionId,
    })
}

describe('a temporary session, against the real router', () => {
    it('is absent from the list the history is built from', async () => {
        const routed = twoSided()
        await routed.initialize()
        await routed.createSession({ id: 'kept', title: 'Normale', created_at: '2026-07-31T10:00:00.000Z' } as never)
        await routed.createSession({ id: 'tmp-abc', title: 'Temporanea', created_at: '2026-07-31T10:00:01.000Z' } as never)

        expect((await routed.listSessions()).map((s) => s.id)).toEqual(['kept'])
    })

    /** …and is still reachable, which is what "you are in it" means. */
    it('is still there to be read while you are in it', async () => {
        const routed = twoSided()
        await routed.initialize()
        await routed.createSession({ id: 'tmp-abc', title: 'Temporanea', created_at: '2026-07-31T10:00:00.000Z' } as never)
        await routed.appendMessage({
            id: 'm1', session_id: 'tmp-abc', role: 'user', content: 'ciao',
            created_at: '2026-07-31T10:00:01.000Z',
        } as never)

        expect(await routed.listMessages('tmp-abc')).toHaveLength(1)
    })

    /**
     * The report itself: closing the app must take it with it. A fresh pair is
     * what a restart looks like — the durable side persists, the other does not.
     */
    it('does not come back after a restart', async () => {
        const first = twoSided()
        await first.initialize()
        await first.createSession({ id: 'tmp-abc', title: 'Temporanea', created_at: '2026-07-31T10:00:00.000Z' } as never)
        await first.createSession({ id: 'kept', title: 'Normale', created_at: '2026-07-31T10:00:02.000Z' } as never)

        const restarted = twoSided()
        await restarted.initialize()

        expect(await restarted.listMessages('tmp-abc')).toEqual([])
        expect((await restarted.listSessions()).map((s) => s.id)).not.toContain('tmp-abc')
    })
})
