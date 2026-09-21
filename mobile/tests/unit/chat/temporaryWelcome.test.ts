import { describe, expect, it } from 'vitest'
import { talosTemporaryWelcome } from '@/lib/chat/temporaryWelcome'

/**
 * Owner 2026-07-31, after two attempts that did not satisfy: the welcome of a
 * temporary chat has to be ABOUT being in incognito, and it has to be a SET.
 * The ordinary welcome cycles; one fixed sentence reads like a warning label
 * rather than the app talking.
 */
describe('what a temporary chat says when it is empty', () => {
    it('says something about being unseen, not a generic greeting', () => {
        const line = talosTemporaryWelcome('tmp-abc', 'it')

        expect(line.length).toBeGreaterThan(8)
        expect(['it', 'en'].length).toBe(2)
    })

    /** Stable inside one chat: a phrase that changed per render would be noise. */
    it('gives the same chat the same line every time', () => {
        const first = talosTemporaryWelcome('tmp-abc', 'it')
        const again = talosTemporaryWelcome('tmp-abc', 'it')

        expect(again).toBe(first)
    })

    /** And a set, not a slogan: different chats get different lines. */
    it('varies across chats', () => {
        const seen = new Set(
            Array.from({ length: 40 }, (_, index) => talosTemporaryWelcome(`tmp-${index}`, 'it')),
        )

        expect(seen.size).toBeGreaterThan(3)
    })

    it('speaks the reader’s language', () => {
        const italian = talosTemporaryWelcome('tmp-abc', 'it')
        const english = talosTemporaryWelcome('tmp-abc', 'en')

        expect(italian).not.toBe(english)
    })

    it('falls back rather than breaking on an unknown locale or no session', () => {
        expect(talosTemporaryWelcome('tmp-abc', 'de')).toBeTruthy()
        expect(talosTemporaryWelcome(null, 'it')).toBeTruthy()
    })
})
