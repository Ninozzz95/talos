/**
 * One tap, one message.
 *
 * Owner 2026-07-27, with his own transcript as the evidence: the same prompt
 * sent twice, thirty seconds apart, around taking focus off the composer.
 *
 * The only guard was `props.sending`, and that flag is raised by the PARENT
 * after the emit. Between the emit and the prop coming back down there is a
 * window — a blur that produces an extra click, a fast double tap, a keyboard
 * dismissing under a thumb — where a second event passes the guard untouched
 * and the owner pays for two answers to the same question.
 *
 * So the latch closes SYNCHRONOUSLY, on the same tick as the emit. And it
 * reopens even when nothing ever comes back: a send refused upstream leaves
 * `sending` false forever, and a composer latched shut for the rest of the
 * session would be worse than the bug it fixed. That is the delete-dialog trap,
 * and it is not being repeated here.
 */
export interface TalosSendGate {
    /** True if this send may proceed. Closes the latch as it answers. */
    claim(at: number): boolean
    /** The parent's `sending` flag, as it changes. */
    observeSending(sending: boolean): void
}

export interface TalosSendGateOptions {
    now?: () => number
    /**
     * How long a claim may sit unconfirmed before the latch gives up.
     *
     * Long enough that no realistic round trip to the store loses its race,
     * short enough that a user who watched a send fail can try again without
     * wondering whether the app is broken.
     */
    graceMs?: number
}

export function createTalosSendGate(options: TalosSendGateOptions = {}): TalosSendGate {
    const graceMs = options.graceMs ?? 1_500
    let claimedAt: number | null = null
    let confirmed = false

    return {
        claim(at) {
            if (claimedAt !== null) {
                // Confirmed means the answer really is on its way, however long
                // it takes: a two-minute reply must not unlatch on a timer and
                // let a stray tap ask the same thing again.
                if (confirmed) return false
                if (at - claimedAt < graceMs) return false
            }
            claimedAt = at
            confirmed = false
            return true
        },
        observeSending(sending) {
            if (sending) {
                // Only meaningful for a claim we are holding; a flag that was
                // already true when the composer mounted is not ours.
                if (claimedAt !== null) confirmed = true
                return
            }
            claimedAt = null
            confirmed = false
        },
    }
}
