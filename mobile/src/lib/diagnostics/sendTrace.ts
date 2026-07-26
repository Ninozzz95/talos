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
export interface TalosToolTrace {
    name: string
    /** Milliseconds from the start of the send, so rows can be compared. */
    startedAtMs: number
    durationMs: number
    ok: boolean
}

export interface TalosRoundTrace {
    startedAtMs: number
    durationMs: number
    /**
     * How long until the first CHUNK of the answer arrived this round.
     *
     * Chunk, not token, and the distinction is deliberate: OpenTelemetry splits
     * client metrics from server ones precisely because a client reading an SSE
     * stream sees chunks whose boundaries are network and buffering artifacts,
     * never tokens. Their client-side key is `time_to_first_chunk`. Calling it
     * TTFT would claim a precision this side of the wire does not have.
     *
     * Null, never 0, when the round never spoke: a tool-only turn produces no
     * chunk, and a fictional best-case in the middle of a latency report is
     * worse than an admitted gap.
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
}

export interface TalosToolTraceHandle {
    finish(ok: boolean): void
}

export interface TalosRoundTraceHandle {
    /** The model said its first word. Ignored if called twice. */
    firstChunk(): void
    tool(name: string): TalosToolTraceHandle
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
    const sends: TalosSendTrace[] = []

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
            }
            sends.unshift(trace)
            if (sends.length > keep) sends.length = keep

            return {
                round() {
                    const roundStart = options.now()
                    const round: TalosRoundTrace = {
                        startedAtMs: roundStart - sendStart,
                        durationMs: 0,
                        timeToFirstChunkMs: null,
                        tools: [],
                        parallel: false,
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
                            round.timeToFirstChunkMs = options.now() - roundStart
                        },
                        tool(name) {
                            const toolStart = options.now()
                            const tool: TalosToolTrace = {
                                name,
                                startedAtMs: toolStart - sendStart,
                                durationMs: 0,
                                ok: false,
                            }
                            round.tools.push(tool)
                            inFlight += 1
                            if (inFlight > 1) round.parallel = true
                            let done = false
                            return {
                                finish(ok) {
                                    if (done) return
                                    done = true
                                    inFlight -= 1
                                    tool.durationMs = options.now() - toolStart
                                    tool.ok = ok
                                },
                            }
                        },
                        finish() {
                            round.durationMs = options.now() - roundStart
                        },
                    }
                },
                finish(outcome) {
                    trace.durationMs = options.now() - sendStart
                    trace.outcome = outcome
                    if (wallStart !== null && options.wallNow) {
                        const wallElapsed = options.wallNow() - wallStart
                        trace.clockSuspect = Math.abs(wallElapsed - trace.durationMs)
                            > TALOS_CLOCK_DRIFT_TOLERANCE_MS
                    }
                },
            }
        },
        sends: () => sends,
        clear() { sends.length = 0 },
    }
}
