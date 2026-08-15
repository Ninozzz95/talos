import { splitGraphemes } from 'unicode-segmenter/grapheme'

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

/**
 * UAX #29 extended grapheme boundary at or before a UTF-16 pacing target.
 *
 * `unicode-segmenter` is the project's pinned Unicode 17 implementation. A
 * hand-written surrogate/ZWJ check cannot cover flags, keycaps, combining
 * sequences, Indic conjuncts, or future table changes.
 */
function graphemeBoundary(text: string, target: number, start = 0): number {
    if (target <= start) return start
    let boundary = start
    for (const grapheme of splitGraphemes(text.slice(start))) {
        const next = boundary + grapheme.length
        if (next > target) break
        boundary = next
    }
    return boundary
}

/**
 * Back up to the end of the last whole word.
 *
 * The reveal unit is a word — what every reference implementation chose, and
 * five and a half times fewer DOM nodes than a span per letter. The trailing
 * space belongs to the word it follows, so copied text keeps its spacing.
 */
function wordBoundary(text: string, target: number): number {
    for (let index = target; index > 0; index -= 1) {
        if (/\s/.test(text[index - 1]!)) return index
    }
    return 0
}

// UAX #29 explicitly requires dictionary/tailored word breaking for these
// scripts. Animation cadence must not make them wait for whitespace they
// conventionally do not provide, so TALOS advances them by whole EGCs.
const CONTINUOUS_SCRIPT = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Thai}\p{Script=Lao}\p{Script=Khmer}\p{Script=Myanmar}]/u
const INDEPENDENT_CLUSTER = /[\p{Extended_Pictographic}\p{Regional_Indicator}\p{Punctuation}\p{Symbol}\u20E3]/u
const SPACED_WORD_CONTENT = /[\p{Letter}\p{Number}]/u

/**
 * Appending text can extend the final EGC (a combining mark or ZWJ continuation
 * may arrive in the next provider chunk). Keep that one trailing cluster
 * provisional unless another cluster or a whitespace boundary follows it.
 */
function stableStreamingBoundary(text: string, start: number, target: number): number {
    if (target < text.length) return target
    let previous = start
    for (const grapheme of splitGraphemes(text.slice(start, target))) {
        const next = previous + grapheme.length
        if (next >= target) return previous
        previous = next
    }
    return start
}

/**
 * TALOS UAX29-C2-2 reveal profile for scripts without whitespace word
 * separators. Latin/digit runs remain buffered; punctuation surrounding an
 * eligible script or standalone emoji stays attached to that safe unit.
 */
function continuousScriptBoundary(text: string, start: number, target: number): number {
    if (target <= start) return start
    let boundary = start
    let eligible = false

    for (const grapheme of splitGraphemes(text.slice(start, target))) {
        if (CONTINUOUS_SCRIPT.test(grapheme) || INDEPENDENT_CLUSTER.test(grapheme)) {
            eligible = true
            boundary += grapheme.length
            continue
        }
        if (SPACED_WORD_CONTENT.test(grapheme)) break
        boundary += grapheme.length
    }

    return eligible ? boundary : start
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
    // Pacing must keep moving while a word is buffered. Reusing the visible
    // cursor for both jobs either leaks partial letters or stalls forever.
    let progress = 0
    let charsPerMs = initial / 1_000
    let lastTickAt: number | null = null
    let lastArrivalAt: number | null = null
    let lastArrivedLength = 0
    let done = false

    function commit(target: number): string {
        if (done) {
            cursor = arrived.length
            return arrived
        }

        const grapheme = graphemeBoundary(arrived, Math.floor(target), cursor)
        const word = Math.max(cursor, wordBoundary(arrived, grapheme))
        const stable = stableStreamingBoundary(arrived, word, grapheme)
        const continuous = continuousScriptBoundary(arrived, word, stable)
        cursor = Math.max(cursor, word, continuous)
        return arrived.slice(0, cursor)
    }

    return {
        arrive(full, at) {
            if (full === arrived) return
            if (full.length < arrived.length) {
                // A shorter text is a different answer, not a correction.
                cursor = 0
                progress = 0
                lastArrivedLength = 0
            }
            arrived = full
            progress = Math.min(progress, arrived.length)
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
            if (!paced || done) {
                progress = arrived.length
                cursor = arrived.length
                return arrived
            }
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
            if (arrived.length - cursor > hardFlush) {
                progress = arrived.length
                return commit(progress)
            }
            if (since === 0) return arrived.slice(0, cursor)
            progress = Math.min(arrived.length, progress + charsPerMs * since)
            return commit(progress)
        },

        visible: () => arrived.slice(0, cursor),

        finish() {
            done = true
            progress = arrived.length
            cursor = arrived.length
            return arrived
        },

        abort() {
            done = true
            progress = arrived.length
            cursor = arrived.length
            return arrived
        },

        reset() {
            arrived = ''
            cursor = 0
            progress = 0
            charsPerMs = initial / 1_000
            lastTickAt = null
            lastArrivalAt = null
            lastArrivedLength = 0
            done = false
        },
    }
}
