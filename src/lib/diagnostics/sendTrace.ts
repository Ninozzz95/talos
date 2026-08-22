import { shallowRef } from 'vue'

/**
 * Where one send spends its time.
 *
 * Owner 2026-07-26: he was asked to measure a slow prompt with a stopwatch,
 * because TALOS had no instrumentation at all — "aggiungi le strumentazioni di
 * timing dietro il checkbox di debug nella sezione Doctor".
 *
 * Capture lives here, apart from any export format: what happened and when is
 * the same fact whatever a schema decides to call it, and this half has to be
 * right before the other half can be useful.
 *
 * Two rules shape the whole file:
 *  - OFF COSTS NOTHING. Not "records and discards" — the clock is not even
 *    read. Debug must not be paid for by the people who left it off.
 *  - IT IS NEVER GIVEN A SECRET. The surface takes a tool NAME, a provider and
 *    a model. No prompt, no file name, no key ever reaches it, so no redaction
 *    pass can forget one. A diagnostics export is the most natural way for a
 *    secret to leave an app, and the defence belongs at the boundary.
 */
import { readTalosCacheUsage } from '@/lib/chat/promptCache'

export interface TalosToolTrace {
    name: string
    /** Milliseconds from the start of the send, so rows can be compared. */
    startedAtMs: number
    /** The WORK, with any wait for a permission sheet taken out. */
    durationMs: number
    /**
     * How long this call sat waiting for the user to answer a permission sheet.
     *
     * SF-critic 2026-07-26: the stopwatch started before the consent gate, so
     * a tool doing 2ms of work behind a sheet the user took a minute over was
     * recorded as a one-minute tool — and the owner would have gone hunting for
     * a slow network. Human time is real time, but it is not TALOS being slow,
     * so it is reported beside the work rather than folded into it.
     */
    waitedForConsentMs: number
    ok: boolean
    /**
     * WHY it failed, as a code and nothing else. Null when it worked.
     *
     * Owner's R37 trace: `document_create` failed after sixty seconds of the
     * model writing the document, the whole thing was regenerated, and forty
     * per cent of the wall clock went to that retry — with `ok: false` as the
     * only evidence. The code, never the message: a failure message can quote a
     * file name or a fragment of what the user asked for, and this payload is
     * pasted into a chat.
     */
    errorCode: string | null
}

export interface TalosRoundTrace {
    startedAtMs: number
    durationMs: number
    /**
     * Prefix tokens this round read from, or wrote to, the provider's cache.
     *
     * `null` means the provider said nothing about a cache, which is a
     * different fact from "the cache saved nothing" and must not be shown as a
     * zero. This is what makes the caching work checkable rather than a claim.
     */
    cache: import('@/lib/chat/promptCache').TalosCacheUsage | null
    /**
     * How long until the first bytes of the response arrived this round.
     *
     * Chunk, not token, and the distinction is deliberate: OpenTelemetry splits
     * client metrics from server ones precisely because a client reading an SSE
     * stream sees chunks whose boundaries are network and buffering artifacts,
     * never tokens. Their client-side key is `time_to_first_chunk`. Calling it
     * TTFT would claim a precision this side of the wire does not have.
     *
     * EITHER channel counts — visible text or reasoning. SF-critic 2026-07-26:
     * only `onChunk` was wrapped, so on a reasoning model (DeepSeek, the
     * owner's own provider) a round with bytes on the wire at 300ms that then
     * thought for 44s reported 44300 — measuring the thinking, not the wait.
     *
     * Null, never 0, when the round never spoke at all: a tool-only turn
     * produces nothing, and a fictional best-case in the middle of a latency
     * report is worse than an admitted gap.
     */
    timeToFirstChunkMs: number | null
    tools: TalosToolTrace[]
    /**
     * Whether any two calls in this round were in flight at the same moment.
     *
     * This is the diagnosis the owner actually needs: false means his provider
     * asked for one tool per turn, so the concurrency work has nothing to act
     * on and the time is going somewhere else.
     */
    parallel: boolean
}

export interface TalosSendTrace {
    provider: string
    model: string
    durationMs: number
    outcome: 'ok' | 'error' | 'stopped'
    rounds: TalosRoundTrace[]
    /**
     * True when the two clocks disagree, so this duration cannot be trusted.
     *
     * On Android `performance.now()` rides CLOCK_MONOTONIC, which does NOT
     * advance while the device is suspended; `Date.now()` breaks the other way
     * when the system clock is corrected. The owner leaves the app WHILE it
     * generates, so this is his case and not a corner one: forty real seconds
     * can be reported as three. Admitting a sample is unreliable is worth more
     * than a confident wrong number in the one report meant to settle an
     * argument.
     */
    clockSuspect: boolean
    /**
     * The same span measured on the WALL clock.
     *
     * SF-critic 2026-07-26: the disagreement was detected and then the only
     * usable number was thrown away — the monotonic total was still printed in
     * bold under a footnote saying not to trust it. When the two disagree, THIS
     * is the one that survived a device sleep.
     */
    wallDurationMs: number | null
}

export interface TalosToolTraceHandle {
    finish(ok: boolean, waitedForConsentMs?: number, errorCode?: string | null): void
}

export interface TalosRoundTraceHandle {
    /** The model said its first word. Ignored if called twice. */
    firstChunk(): void
    tool(name: string): TalosToolTraceHandle
    /**
     * What the provider said its cache did this round.
     *
     * Optional so nothing that builds a handle by hand has to change. Called
     * with whatever `usage` the provider returned; the dialects are reconciled
     * in `readTalosCacheUsage`.
     */
    cache?(usage: Record<string, number> | null | undefined): void
    finish(): void
}

export interface TalosSendTraceHandle {
    round(): TalosRoundTraceHandle
    finish(outcome: TalosSendTrace['outcome']): void
}

export interface TalosTraceRecorder {
    begin(context: { provider: string; model: string }): TalosSendTraceHandle
    /** Newest first — a diagnostics screen shows the run you have just done. */
    sends(): readonly TalosSendTrace[]
    clear(): void
}

export interface TalosTraceRecorderOptions {
    enabled(): boolean
    /**
     * A MONOTONIC clock. `performance.now()` in the app: `Date.now()` can jump
     * backwards when the system clock is corrected, which would print negative
     * durations in a report meant to settle an argument.
     */
    now(): number
    /** The WALL clock, read alongside the monotonic one to cross-check it. */
    wallNow?: () => number
    /** How many sends to keep. Bounded, so a debug switch left on cannot grow. */
    keep?: number
}

/**
 * How far the two clocks may drift apart before a sample is called suspect.
 *
 * Generous on purpose: normal scheduling jitter is milliseconds, so a quarter
 * of a second only fires on a real suspend or a real clock correction.
 */
export const TALOS_CLOCK_DRIFT_TOLERANCE_MS = 250

/** Handles that record nothing, handed out while the switch is off. */
const NULL_TOOL: TalosToolTraceHandle = { finish() {} }
const NULL_ROUND: TalosRoundTraceHandle = {
    firstChunk() {},
    tool: () => NULL_TOOL,
    finish() {},
}
const NULL_SEND: TalosSendTraceHandle = { round: () => NULL_ROUND, finish() {} }

export function createTalosTraceRecorder(
    options: TalosTraceRecorderOptions,
): TalosTraceRecorder {
    const keep = options.keep ?? 10
    /**
     * A shallowRef holding a REPLACED array, not a mutated one.
     *
     * SF-critic 2026-07-26: this was a plain array in a closure, so a screen
     * reading it through a computed had no reactive dependency at all — the
     * computed ran once and never again. "Clear timings" emptied the data and
     * left the list on screen, and a send recorded while the Doctor was open
     * never appeared. The button LOOKED like it worked, which is worse than not
     * having one.
     *
     * Shallow rather than deep on purpose: the handles mutate a trace in place
     * while it runs, and making every field reactive would put a dependency on
     * the hot path of every tool call for no gain — a running send is rendered
     * from the array identity it was added with.
     */
    const sends = shallowRef<TalosSendTrace[]>([])

    return {
        begin(context) {
            // Checked ONCE, at the start: a send that began recording finishes
            // recording, so a switch flipped mid-answer cannot leave a trace
            // with a beginning and no end.
            if (!options.enabled()) return NULL_SEND

            const sendStart = options.now()
            const wallStart = options.wallNow?.() ?? null
            const trace: TalosSendTrace = {
                provider: context.provider,
                model: context.model,
                durationMs: 0,
                outcome: 'ok',
                rounds: [],
                clockSuspect: false,
                wallDurationMs: null,
            }
            sends.value = [trace, ...sends.value].slice(0, keep)

            return {
                round() {
                    const roundStart = options.now()
                    const round: TalosRoundTrace = {
                        startedAtMs: Math.round(roundStart - sendStart),
                        durationMs: 0,
                        timeToFirstChunkMs: null,
                        tools: [],
                        parallel: false,
                        cache: null,
                    }
                    trace.rounds.push(round)
                    // How many calls are in flight right now. Overlap is
                    // observed, not inferred from timestamps after the fact —
                    // two calls can share a millisecond on a coarse clock
                    // without ever having run together.
                    let inFlight = 0

                    return {
                        firstChunk() {
                            if (round.timeToFirstChunkMs !== null) return
                            round.timeToFirstChunkMs = Math.round(options.now() - roundStart)
                        },
                        cache(usage) {
                            round.cache = readTalosCacheUsage(usage)
                        },
                        tool(name) {
                            const toolStart = options.now()
                            const tool: TalosToolTrace = {
                                name,
                                startedAtMs: Math.round(toolStart - sendStart),
                                durationMs: 0,
                                waitedForConsentMs: 0,
                                ok: false,
                                errorCode: null,
                            }
                            round.tools.push(tool)
                            inFlight += 1
                            if (inFlight > 1) round.parallel = true
                            let done = false
                            return {
                                finish(ok, waitedForConsentMs = 0, errorCode = null) {
                                    if (done) return
                                    done = true
                                    inFlight -= 1
                                    tool.waitedForConsentMs = Math.round(waitedForConsentMs)
                                    // The WORK, with the human's time removed.
                                    tool.durationMs = Math.max(
                                        0,
                                        Math.round(options.now() - toolStart - waitedForConsentMs),
                                    )
                                    tool.ok = ok
                                    tool.errorCode = ok ? null : errorCode
                                },
                            }
                        },
                        finish() {
                            round.durationMs = Math.round(options.now() - roundStart)
                        },
                    }
                },
                finish(outcome) {
                    trace.durationMs = Math.round(options.now() - sendStart)
                    trace.outcome = outcome
                    if (wallStart !== null && options.wallNow) {
                        const wallElapsed = options.wallNow() - wallStart
                        trace.wallDurationMs = Math.round(wallElapsed)
                        trace.clockSuspect = Math.abs(wallElapsed - trace.durationMs)
                            > TALOS_CLOCK_DRIFT_TOLERANCE_MS
                    }
                },
            }
        },
        sends: () => sends.value,
        clear() { sends.value = [] },
    }
}
