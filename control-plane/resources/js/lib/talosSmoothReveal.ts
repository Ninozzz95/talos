export type TalosSmoothRevealOptions = {
    initialCharsPerSec?: number
    minCharsPerSec?: number
    maxCharsPerSec?: number
    backlogHardFlush?: number
    paced?: boolean
    firstStepMs?: number
}

export type TalosSmoothReveal = {
    arrive: (full: string, at: number) => void
    tick: (at: number) => string
    visible: () => string
    finish: () => string
    abort: () => string
    reset: () => void
}

const DEFAULTS = {
    initialCharsPerSec: 150,
    minCharsPerSec: 60,
    maxCharsPerSec: 1_200,
    backlogHardFlush: 1_500,
}

const graphemeSegmenter = typeof Intl !== 'undefined' && 'Segmenter' in Intl
    ? new Intl.Segmenter(undefined, { granularity: 'grapheme' })
    : null

function fallbackGraphemeBoundary(text: string, target: number) {
    let index = target
    const code = text.charCodeAt(index)
    if (code >= 0xdc00 && code <= 0xdfff) index -= 1
    while (index > 0 && (text.charCodeAt(index) === 0x200d || text.charCodeAt(index - 1) === 0x200d)) {
        index -= 1
    }
    while (index > 0 && text.charCodeAt(index) === 0xfe0f) index -= 1
    return index
}

function graphemeBoundary(text: string, target: number) {
    if (target >= text.length) return text.length
    if (target <= 0) return 0
    if (!graphemeSegmenter) return fallbackGraphemeBoundary(text, target)

    let boundary = 0
    for (const segment of graphemeSegmenter.segment(text)) {
        if (segment.index > target) break
        boundary = segment.index
        if (segment.index + segment.segment.length <= target) {
            boundary = segment.index + segment.segment.length
        }
    }
    return boundary
}

function wordBoundary(text: string, target: number) {
    if (target >= text.length) return text.length
    for (let index = target; index > 0; index -= 1) {
        if (/\s/.test(text[index - 1]!)) return index
    }
    return 0
}

export function createTalosSmoothReveal(options: TalosSmoothRevealOptions = {}): TalosSmoothReveal {
    const initial = options.initialCharsPerSec ?? DEFAULTS.initialCharsPerSec
    const min = options.minCharsPerSec ?? DEFAULTS.minCharsPerSec
    const max = options.maxCharsPerSec ?? DEFAULTS.maxCharsPerSec
    const hardFlush = options.backlogHardFlush ?? DEFAULTS.backlogHardFlush
    const paced = options.paced !== false
    const firstStepMs = options.firstStepMs ?? 40

    let arrived = ''
    let cursor = 0
    let progress = 0
    let charsPerMs = initial / 1_000
    let lastTickAt: number | null = null
    let lastArrivalAt: number | null = null
    let lastArrivedLength = 0
    let done = false

    function commit(target: number) {
        const grapheme = graphemeBoundary(arrived, Math.floor(target))
        if (done || grapheme >= arrived.length) {
            cursor = grapheme
            return arrived.slice(0, cursor)
        }
        const snapped = wordBoundary(arrived, grapheme)
        cursor = snapped > 0 ? snapped : grapheme
        return arrived.slice(0, cursor)
    }

    return {
        arrive(full, at) {
            if (full.length < arrived.length) {
                cursor = 0
                progress = 0
                lastArrivedLength = 0
            }
            arrived = full
            if (lastArrivalAt !== null && at > lastArrivalAt) {
                const elapsed = at - lastArrivalAt
                const latest = (arrived.length - lastArrivedLength) / elapsed
                const rateError = latest - charsPerMs
                const lagRate = Math.max(0, arrived.length - cursor) / elapsed
                const target = latest + Math.max(0, (rateError + lagRate) / 2)
                charsPerMs = Math.min((2 * target + charsPerMs) / 3, charsPerMs * 2)
                charsPerMs = Math.min(Math.max(charsPerMs, min / 1_000), max / 1_000)
            }
            lastArrivalAt = at
            lastArrivedLength = arrived.length
        },
        tick(at) {
            if (!paced || done) {
                cursor = arrived.length
                progress = arrived.length
                return arrived
            }
            const elapsed = lastTickAt === null
                ? Math.max(firstStepMs, at - (lastArrivalAt ?? at))
                : Math.max(0, at - lastTickAt)
            lastTickAt = at
            if (arrived.length - cursor > hardFlush) {
                progress = arrived.length
                return commit(progress)
            }
            if (elapsed === 0) return arrived.slice(0, cursor)
            progress = Math.min(
                arrived.length,
                Math.max(progress, cursor) + charsPerMs * elapsed,
            )
            return commit(progress)
        },
        visible: () => arrived.slice(0, cursor),
        finish() {
            done = true
            cursor = arrived.length
            progress = arrived.length
            return arrived
        },
        abort() {
            done = true
            cursor = arrived.length
            progress = arrived.length
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
