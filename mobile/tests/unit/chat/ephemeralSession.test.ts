import { describe, expect, it } from 'vitest'
import {
    TALOS_EPHEMERAL_SESSION_PREFIX,
    talosEphemeralSessionId,
    talosIsEphemeralSessionId,
} from '@/lib/chat/ephemeralSession'
import { normalizeRepositoryId } from '@/repositories/chatRepository'

/**
 * F-14. The mark that says "this chat is temporary" lives in the id itself.
 *
 * The alternative was a registry of ids kept somewhere else, which has to be
 * written before the session exists and has to survive everywhere the id
 * travels. The day those two fall out of step, a chat the user was told would
 * not be kept is written to disk — and there is no version of that failure the
 * user ever finds out about.
 */
describe('a temporary session is recognisable from its id alone', () => {
    it('marks and recognises', () => {
        const marked = talosEphemeralSessionId('abc123')

        expect(marked).toBe('tmp-abc123')
        expect(talosIsEphemeralSessionId(marked)).toBe(true)
    })

    it('leaves an ordinary id alone', () => {
        expect(talosIsEphemeralSessionId('abc123')).toBe(false)
        expect(talosIsEphemeralSessionId('')).toBe(false)
    })

    /** Marking twice must not produce an id the caller no longer holds. */
    it('is idempotent', () => {
        const once = talosEphemeralSessionId('abc123')

        expect(talosEphemeralSessionId(once)).toBe(once)
    })

    /**
     * The whole design rests on this: a temporary id has to be an ORDINARY id
     * everywhere except the router. If the repository rejected it, the mark
     * would have to move back out into a registry.
     */
    it('is still a valid repository id', () => {
        const marked = talosEphemeralSessionId('01H8XABCDEF0123456789')

        expect(() => normalizeRepositoryId(marked)).not.toThrow()
        expect(normalizeRepositoryId(marked)).toBe(marked)
    })

    it('does not collide with an id that merely contains the prefix', () => {
        // The mark is a PREFIX, not a substring: an id with "tmp-" in the
        // middle is somebody else's id, not a temporary chat.
        expect(talosIsEphemeralSessionId(`x${TALOS_EPHEMERAL_SESSION_PREFIX}y`)).toBe(false)
    })
})
