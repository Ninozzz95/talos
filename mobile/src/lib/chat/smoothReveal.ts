/**
 * What the answer should LOOK like right now, as opposed to what has arrived.
 *
 * Owner 2026-07-26: "l'animazione di rendering della risposta non è smooth.
 * Claude la fa in maniera fantastica questa cosa."
 *
 * The research (2026-07-27, logged in the ledger) found the same architecture
 * behind every credible implementation, and it is not the fade: it is
 * DECOUPLING the render cadence from the network cadence. SSE chunk boundaries
 * are artefacts of buffering, not of language — half a word, then three
 * sentences, then two seconds of nothing while a tool runs. TALOS rendered at
 * network cadence, so the fade had lumps to dissolve and the result could not
 * be smooth however pretty the easing was.
 *
 * The rate ADAPTS, which is the part most implementations skip: a fixed delay
 * that is slower than the model falls behind for the whole answer and never
 * recovers. The shape here follows Convex's published algorithm — arrival
 * speed, its derivative, and the accumulated lag, folded into a smoothed rate
 * with a hard cap on acceleration.
 *
 * Deliberately pure: no rAF, no DOM, no Vue. The caller drives it with a clock,
 * so the pacing can be tested at all rather than watched.
 */
export interface TalosSmoothRevealOptions {
    /** Where the rate starts before anything has been measured. */
    initialCharsPerSec?: number
    /** Below this the reveal reads as artificial rather than gentle. */
    minCharsPerSec?: number
    /** Above this a fade becomes a flash. */
    maxCharsPerSec?: number
    /** Past this backlog the animation is a wait, not a feature: dump it. */
    backlogHardFlush?: number
    /**
     * False disables pacing entirely — reduced motion, where text marching
     * across the screen IS the animation and removing only the fade is half a
     * fix.
     */
    paced?: boolean
    /** How much the opening frame is worth, so the answer starts immediately. */
    firstStepMs?: number
}

export interface TalosSmoothReveal {
    /** More text has arrived. `at` is a monotonic clock reading. */
    arrive(full: string, at: number): void
    /** What should be on screen at `at`. Call once per frame. */
    tick(at: number): string
    /** What is on screen now, without advancing anything. */
    visible(): string
    /** The model is done: hand over the remainder and stop. */
    finish(): string
    /** The user stopped it: same, but nothing more will arrive. */
    abort(): string
    reset(): void
}

const DEFAULTS = {
    // Convex ships 128; nudged up because typical output is 120-320 chars/s, so
    // starting slightly behind makes the adaptive term climb for no reason.
    initialCharsPerSec: 150,
    minCharsPerSec: 60,
    maxCharsPerSec: 1_200,
    backlogHardFlush: 1_500,
}

/** Graphemes, so a cursor never lands inside an emoji or a combining mark. */
function graphemeBoundary(text: string, target: number): number {
    if (target >= text.length) return text.length
    if (target <= 0) return 0
    let index = target
    // A low surrogate means we are mid pair; step back one unit.
    const code = text.charCodeAt(index)
    if (code >= 0xdc00 && code <= 0xdfff) index -= 1
    // Zero-width joiner sequences: never cut on or immediately after a joiner.
    while (index > 0 && (text.charCodeAt(index) === 0x200d || text.charCodeAt(index - 1) === 0x200d)) {
        index -= 1
    }
    // A variation selector belongs to the glyph before it.
    while (index > 0 && text.charCodeAt(index) === 0xfe0f) index -= 1
    return index
}

/**
 * Back up to the end of the last whole word.
 *
 * The reveal unit is a word — what every reference implementation chose, and
 * five and a half times fewer DOM nodes than a span per letter. The trailing
 * space belongs to the word it follows, so copied text keeps its spacing.
 */
function wordBoundary(text: string, target: number): number {
    if (target >= text.length) return text.length
    for (let index = target; index > 0; index -= 1) {
        if (/\s/.test(text[index - 1]!)) return index
    }
    return 0
}

export function createTalosSmoothReveal(
    options: TalosSmoothRevealOptions = {},
): TalosSmoothReveal {
    const initial = options.initialCharsPerSec ?? DEFAULTS.initialCharsPerSec
    const min = options.minCharsPerSec ?? DEFAULTS.minCharsPerSec
    const max = options.maxCharsPerSec ?? DEFAULTS.maxCharsPerSec
    const hardFlush = options.backlogHardFlush ?? DEFAULTS.backlogHardFlush
    const paced = options.paced !== false
    const firstStepMs = options.firstStepMs ?? 40

    let arrived = ''
    let cursor = 0
    let charsPerMs = initial / 1_000
    let lastTickAt: number | null = null
    let lastArrivalAt: number | null = null
    let lastArrivedLength = 0
    let done = false

    function commit(target: number): string {
        const grapheme = graphemeBoundary(arrived, Math.floor(target))
        // Only snap to a word while more is still coming: at the end, the last
        // word has no trailing space and snapping back would drop it forever —
        // the exact bug in the published smoother.
        if (done || grapheme >= arrived.length) {
            cursor = grapheme
            return arrived.slice(0, cursor)
        }
        const snapped = wordBoundary(arrived, grapheme)
        // Snapping back to a word boundary yields ZERO while the first word is
        // longer than one step — which showed an empty bubble until a whole
        // word fit. A few letters of the opening word beat nothing at all; from
        // the second word on, a step is wider than the average word and the
        // boundary rule takes over.
        cursor = snapped > 0 ? snapped : grapheme
        return arrived.slice(0, cursor)
    }

    return {
        arrive(full, at) {
            if (full.length < arrived.length) {
                // A shorter text is a different answer, not a correction.
                cursor = 0
                lastArrivedLength = 0
            }
            arrived = full
            if (lastArrivalAt !== null && at > lastArrivalAt) {
                const elapsed = at - lastArrivalAt
                const latest = (arrived.length - lastArrivedLength) / elapsed
                const rateError = latest - charsPerMs
                const lagRate = Math.max(0, arrived.length - cursor) / elapsed
                const target = latest + Math.max(0, (rateError + lagRate) / 2)
                // Exponentially smoothed toward the target, and never more than
                // doubling in one step: an unclamped jump reads as a lurch.
                charsPerMs = Math.min((2 * target + charsPerMs) / 3, charsPerMs * 2)
                charsPerMs = Math.min(Math.max(charsPerMs, min / 1_000), max / 1_000)
            }
            lastArrivalAt = at
            lastArrivedLength = arrived.length
        },

        tick(at) {
            if (!paced || done) { cursor = arrived.length; return arrived }
            // The FIRST tick measures from the first arrival, not from itself:
            // seeding it at `at` meant the opening frame revealed nothing and
            // the answer began with a stutter.
            // The very first tick gets a full step rather than the zero it
            // would otherwise measure against its own arrival: the answer has
            // to START on the opening frame, not on the one after it.
            const since = lastTickAt === null
                ? Math.max(firstStepMs, at - (lastArrivalAt ?? at))
                : Math.max(0, at - lastTickAt)
            lastTickAt = at
            if (arrived.length - cursor > hardFlush) return commit(arrived.length)
            if (since === 0) return arrived.slice(0, cursor)
            return commit(cursor + charsPerMs * since)
        },

        visible: () => arrived.slice(0, cursor),

        finish() {
            done = true
            cursor = arrived.length
            return arrived
        },

        abort() {
            done = true
            cursor = arrived.length
            return arrived
        },

        reset() {
            arrived = ''
            cursor = 0
            charsPerMs = initial / 1_000
            lastTickAt = null
            lastArrivalAt = null
            lastArrivedLength = 0
            done = false
        },
    }
}
