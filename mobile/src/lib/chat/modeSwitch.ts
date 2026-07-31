import { talosIsEphemeralSessionId } from '@/lib/chat/ephemeralSession'

/**
 * Which chat a mode switch throws away.
 *
 * Switching between incognito and normal OPENS a new chat rather than
 * converting the one you are in: which side a chat is written to is decided by
 * its id, and an id cannot change under a session that already exists. So every
 * press leaves a chat behind, and something has to decide its fate.
 *
 * That decision existed three times over — sidebar, chat screen, and the way
 * back out of incognito — with three different guards. One of them checked
 * nothing and merely asserted, in a comment, that the chat being left was
 * always empty. It is not: the chat menu offers incognito from ANY chat, so
 * that copy was one tap away from deleting a conversation the user had not
 * finished reading.
 *
 * The rule, once:
 *
 *   · an incognito chat is discarded even full — «sparisce quando esci» is the
 *     promise it was opened on, and keeping it would break exactly that;
 *   · an empty chat is discarded, or every press would leave a blank one in the
 *     history (owner 2026-07-31: "tante chat nuove quanto premo il pulsante");
 *   · anything else is KEPT. Pressing a mode switch is not asking to delete
 *     what you wrote.
 */
export function talosChatDiscardedByModeSwitch(input: {
    /** The chat that was on screen when the switch was pressed. */
    leaving: string | null
    /** The chat now on screen. Equal to `leaving` when the switch failed. */
    arrived: string | null
    leavingWasEmpty: boolean
}): string | null {
    const { leaving, arrived, leavingWasEmpty } = input
    if (!leaving) return null
    // The new chat was never created. Discarding now would delete what the user
    // is looking at because an earlier step failed.
    if (leaving === arrived) return null
    if (talosIsEphemeralSessionId(leaving)) return leaving
    return leavingWasEmpty ? leaving : null
}
