import { describe, expect, it } from 'vitest'
import { talosChatDiscardedByModeSwitch } from '@/lib/chat/modeSwitch'

/**
 * Switching between incognito and normal opens a NEW chat rather than
 * converting the one you are in — an id decides which side a chat is written
 * to, and an id cannot change under a session that already exists. So every
 * press leaves a chat behind, and something has to decide its fate.
 *
 * That decision was written three times, in three places, with three different
 * guards: the sidebar checked whether the chat was empty, the chat screen
 * asserted in a comment that it always was, and leaving incognito checked
 * nothing at all. Two of those were right by placement rather than by rule.
 * One rule, stated once, is the point of this file.
 */
const EMPTY_ORDINARY = { leaving: 'local-7', arrived: 'tmp-local-8', leavingWasEmpty: true }

describe('what a mode switch throws away', () => {
    /** Otherwise every press left a blank chat in the history. */
    it('discards the blank chat it replaced', () => {
        expect(talosChatDiscardedByModeSwitch(EMPTY_ORDINARY)).toBe('local-7')
    })

    /**
     * The one that matters. The chat menu offers incognito from ANY chat, so
     * this input is reachable with a conversation on screen — and answering
     * "discard" would destroy it, unasked, with no confirmation and no undo.
     */
    it('keeps a chat that has something in it', () => {
        expect(talosChatDiscardedByModeSwitch({ ...EMPTY_ORDINARY, leavingWasEmpty: false })).toBeNull()
    })

    /**
     * The opposite direction, and not a contradiction: an incognito chat is
     * discarded even full, because that is the promise it was opened on —
     * «sparisce quando esci».
     */
    it('discards an incognito chat even when it has something in it', () => {
        expect(talosChatDiscardedByModeSwitch({
            leaving: 'tmp-local-8', arrived: 'local-9', leavingWasEmpty: false,
        })).toBe('tmp-local-8')
    })

    /**
     * If the new chat was never created, `leaving` is still the chat on screen.
     * Discarding it would delete the conversation the user is looking at
     * because an earlier step failed — the worst possible response to a
     * failure.
     */
    it('discards nothing when the switch did not actually move', () => {
        expect(talosChatDiscardedByModeSwitch({
            leaving: 'local-7', arrived: 'local-7', leavingWasEmpty: true,
        })).toBeNull()
    })

    it('discards nothing when there was no chat to leave', () => {
        expect(talosChatDiscardedByModeSwitch({
            leaving: null, arrived: 'tmp-local-8', leavingWasEmpty: true,
        })).toBeNull()
    })
})
