/**
 * Every decision a four-gigabyte download makes — and no I/O at all.
 *
 * It lives here, as arithmetic over a state, because none of it can be tested
 * honestly against the real thing. A signature expiring mid-stream, a carrier
 * 429, a tunnel that hangs instead of failing, a phone killed at 61%: nobody
 * can ask Hugging Face for those on demand. Written this way each one is a
 * single assertion, and the native side becomes a loop that does what it is
 * told.
 *
 * Every duration is MONOTONIC — `elapsedRealtime` on Android, which keeps
 * counting through deep sleep. Never the wall clock: the phone with the wrong
 * clock is disproportionately the cheap phone this feature exists for, and a
 * download that spans a night must not be confused by an NTP correction.
 */

const MIB = 1024 ** 2

/**
 * The transfer window. Large on purpose: re-resolving costs one unit of a
 * 3000-per-300-seconds bucket, so there is no reason to pay it every few
 * megabytes. A resolve boundary and a checkpoint boundary are NOT the same
 * thing, and fusing them is what produced the livelock the checkpoint rules
 * below exist to prevent.
 */
export const TALOS_DOWNLOAD_WINDOW_BYTES = 128 * MIB

/**
 * Checkpoint on TIME, not on bytes.
 *
 * Checkpointing every 128 MiB means a link that drops every 90 seconds discards
 * everything since the last boundary — so on a commuter route the download
 * makes zero net progress and the progress bar walks backwards. Time bounds the
 * loss in seconds at any link speed; the byte rule is only there so a fast link
 * does not go five seconds without a durable point.
 */
export const TALOS_DOWNLOAD_CHECKPOINT_MS = 5_000
export const TALOS_DOWNLOAD_CHECKPOINT_BYTES = 8 * MIB

/**
 * A tunnel does not produce an error. It produces a socket that sits there, and
 * without this the interface shows a moving spinner over a dead connection —
 * the indeterminate state this feature forbids.
 */
export const TALOS_DOWNLOAD_STALL_MS = 8_000

/** Re-resolve this long before the signature dies, so nobody ever sees the 403. */
export const TALOS_DOWNLOAD_RESOLVE_MARGIN_MS = 5 * 60_000

/** Past this, retrying is not perseverance — it is a spinner with extra steps. */
export const TALOS_DOWNLOAD_MAX_FAILURES = 8

export interface TalosDownloadState {
    totalBytes: number
    /** Bytes durably on disk. Never optimistic: this is what a resume trusts. */
    haveBytes: number
    url: string | null
    /** Monotonic deadline for the signed address, or null when there is none. */
    urlDeadlineMs: number | null
    consecutiveFailures: number
    lastProgressAtMs: number
    lastCheckpointAtMs: number
    bytesSinceCheckpoint: number
}

export type TalosDownloadStep =
    | { kind: 'resolve' }
    | { kind: 'request'; url: string; rangeFrom: number; rangeTo: number }
    | { kind: 'checkpoint' }
    | { kind: 'wait'; seconds: number; reason: 'rate-limited' | 'backoff' }
    | { kind: 'stall'; sinceMs: number }
    | { kind: 'verify' }
    // `forbidden` and `rate-limited` are the two that arrive after repetition
    // rather than at once: a 403 or a 429 that keeps coming used to loop
    // forever, so both now count towards the same ceiling as a transport
    // failure and stop with a name the screen can explain.
    | { kind: 'give-up'; reason: 'file-changed' | 'unreachable' | 'gone' | 'forbidden' | 'rate-limited' }

export type TalosDownloadOutcome =
    | { kind: 'bytes'; count: number }
    | { kind: 'status'; status: number; retryAfterSeconds?: number | null }
    | { kind: 'error' }

export function talosNewDownload(input: {
    totalBytes: number
    startedAtMs: number
}): TalosDownloadState {
    return {
        totalBytes: input.totalBytes,
        haveBytes: 0,
        url: null,
        urlDeadlineMs: null,
        consecutiveFailures: 0,
        lastProgressAtMs: input.startedAtMs,
        lastCheckpointAtMs: input.startedAtMs,
        bytesSinceCheckpoint: 0,
    }
}

/**
 * What to do next, given where we are and what time it is.
 *
 * The order is the argument: finishing beats checkpointing, a durable point
 * beats fetching more, and naming a stall beats asking for bytes that are not
 * coming.
 */
export function talosNextDownloadStep(
    state: TalosDownloadState,
    nowMs: number,
): TalosDownloadStep {
    if (state.haveBytes >= state.totalBytes) return { kind: 'verify' }

    const sinceCheckpoint = nowMs - state.lastCheckpointAtMs
    if (
        state.bytesSinceCheckpoint > 0
        && (sinceCheckpoint > TALOS_DOWNLOAD_CHECKPOINT_MS
            || state.bytesSinceCheckpoint > TALOS_DOWNLOAD_CHECKPOINT_BYTES)
    ) {
        return { kind: 'checkpoint' }
    }

    const sinceProgress = nowMs - state.lastProgressAtMs
    if (state.url !== null && sinceProgress > TALOS_DOWNLOAD_STALL_MS) {
        return { kind: 'stall', sinceMs: sinceProgress }
    }

    // Ahead of the deadline, not after it. The signature dying is the expected
    // end of every signed address on a file this size, so meeting it early
    // turns a guaranteed failure into a request nobody notices.
    const expiring = state.urlDeadlineMs !== null
        && state.urlDeadlineMs - nowMs <= TALOS_DOWNLOAD_RESOLVE_MARGIN_MS
    if (state.url === null || expiring) return { kind: 'resolve' }

    const rangeFrom = state.haveBytes
    const rangeTo = Math.min(rangeFrom + TALOS_DOWNLOAD_WINDOW_BYTES, state.totalBytes) - 1
    return { kind: 'request', url: state.url, rangeFrom, rangeTo }
}

/** Bounded exponential backoff: growing, but never a wait nobody would sit through. */
function backoffSeconds(failures: number): number {
    return Math.min(2 ** Math.min(failures, 6), 120)
}

export function talosApplyDownloadOutcome(
    state: TalosDownloadState,
    outcome: TalosDownloadOutcome,
    nowMs: number,
): { state: TalosDownloadState; step: TalosDownloadStep } {
    if (outcome.kind === 'bytes') {
        const next: TalosDownloadState = {
            ...state,
            haveBytes: state.haveBytes + outcome.count,
            bytesSinceCheckpoint: state.bytesSinceCheckpoint + outcome.count,
            lastProgressAtMs: nowMs,
            // Arriving bytes are the only proof that the link works, so they
            // are what clears the failure count — not the passage of time.
            consecutiveFailures: 0,
        }
        return { state: next, step: talosNextDownloadStep(next, nowMs) }
    }

    if (outcome.kind === 'status') {
        /**
         * 403 is the signature expiring, which is the expected end of every
         * signed address on a large file. Reading it as an error is what makes
         * a download fail at 85% for everyone on mobile data.
         */
        if (outcome.status === 403) {
            // The failure count is NOT cleared. It was, and a 403 that keeps
            // coming — a gated repo, a revoked token — then reset the count on
            // every attempt and returned `resolve`, which the loop takes without
            // sleeping: an unbounded request loop at full speed with no way out.
            // Arriving BYTES clear the count; a status that merely looks
            // recoverable does not. Found by an adversarial review, 2026-08-01.
            const failures = state.consecutiveFailures + 1
            const next = { ...state, url: null, urlDeadlineMs: null, consecutiveFailures: failures }
            if (failures >= TALOS_DOWNLOAD_MAX_FAILURES) {
                return { state: next, step: { kind: 'give-up', reason: 'forbidden' } }
            }
            return { state: next, step: { kind: 'resolve' } }
        }
        /**
         * 416 is different in kind: the range does not exist, so the file is
         * not the file we started. Resuming into it would splice two files into
         * one that still passes a length check — and only a hash would ever
         * catch it. Start again rather than write that.
         */
        if (outcome.status === 416) {
            const next = { ...state, haveBytes: 0, bytesSinceCheckpoint: 0, url: null, urlDeadlineMs: null }
            return { state: next, step: { kind: 'give-up', reason: 'file-changed' } }
        }
        if (outcome.status === 429) {
            // Counted, so the wait actually grows. It was not, so the backoff
            // came from a number that never moved: two seconds forever, a client
            // doubling its own rate against the limiter it was meant to be
            // respecting, and never reaching the failure ceiling that stops it.
            const failures = state.consecutiveFailures + 1
            const next = { ...state, url: null, urlDeadlineMs: null, consecutiveFailures: failures }
            if (failures >= TALOS_DOWNLOAD_MAX_FAILURES) {
                return { state: next, step: { kind: 'give-up', reason: 'rate-limited' } }
            }
            const reported = outcome.retryAfterSeconds ?? null
            return {
                state: next,
                step: {
                    kind: 'wait',
                    // The Hub sends no `Retry-After`; when it reported nothing
                    // at all, wait a bounded amount rather than inventing a
                    // number that pretends to be its answer.
                    seconds: reported ?? Math.min(60, backoffSeconds(failures)),
                    reason: 'rate-limited',
                },
            }
        }
        if (outcome.status === 404 || outcome.status === 410) {
            return { state, step: { kind: 'give-up', reason: 'gone' } }
        }
    }

    const failures = state.consecutiveFailures + 1
    const next = { ...state, consecutiveFailures: failures, url: null, urlDeadlineMs: null }
    if (failures >= TALOS_DOWNLOAD_MAX_FAILURES) {
        return { state: next, step: { kind: 'give-up', reason: 'unreachable' } }
    }
    return { state: next, step: { kind: 'wait', seconds: backoffSeconds(failures), reason: 'backoff' } }
}
