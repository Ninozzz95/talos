import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
    TALOS_DOWNLOAD_CHECKPOINT_BYTES,
    TALOS_DOWNLOAD_CHECKPOINT_MS,
    TALOS_DOWNLOAD_STALL_MS,
    talosApplyDownloadOutcome,
    talosNextDownloadStep,
    talosNewDownload,
    type TalosDownloadState,
} from '@/lib/models/downloadPolicy'
import { TALOS_STORAGE_RESERVE_BYTES } from '@/lib/models/fit'

/**
 * Slice 3 — every decision a 4 GB download makes, with no I/O anywhere.
 *
 * This exists as a pure function because none of it can be tested honestly
 * against the real thing: a signature expiring mid-stream, a carrier 429, a
 * tunnel that hangs instead of failing, a phone killed at 61% — you cannot ask
 * Hugging Face for those on demand. Written as arithmetic over a state, they
 * are all one assertion each.
 *
 * The rules come from live probes on 2026-07-31 and from a critic who asked
 * what happens on a commuter train.
 */
const MIB = 1024 ** 2
const GIB = 1024 ** 3

/** Monotonic, always: `elapsedRealtime`, never the wall clock. */
const T0 = 1_000_000

function running(overrides: Partial<TalosDownloadState> = {}): TalosDownloadState {
    return {
        ...talosNewDownload({ totalBytes: 4 * GIB, startedAtMs: T0 }),
        url: 'https://us.aws.cdn.hf.co/xet-bridge-us/abc?Expires=1',
        urlDeadlineMs: T0 + 3_600_000,
        haveBytes: 1 * GIB,
        lastProgressAtMs: T0,
        lastCheckpointAtMs: T0,
        ...overrides,
    }
}

describe('getting a signed address', () => {
    it('resolves first, because there is nothing to ask yet', () => {
        const step = talosNextDownloadStep(talosNewDownload({ totalBytes: 4 * GIB, startedAtMs: T0 }), T0)

        expect(step.kind).toBe('resolve')
    })

    /**
     * Measured: the signature lives 3600 s and 4 GB at 1 MB/s needs 4295, so a
     * download CANNOT finish on one address. Re-resolving is normal operation.
     * Doing it before the deadline rather than after turns a guaranteed 403
     * into a request nobody notices.
     */
    it('resolves again before the signature expires, not after it fails', () => {
        const step = talosNextDownloadStep(running({ urlDeadlineMs: T0 + 120_000 }), T0)

        expect(step.kind).toBe('resolve')
    })

    it('keeps using an address that still has plenty of life', () => {
        expect(talosNextDownloadStep(running(), T0).kind).toBe('request')
    })
})

describe('asking for the next piece', () => {
    it('asks from exactly where the bytes on disk end', () => {
        const step = talosNextDownloadStep(running({ haveBytes: 2_147_483_648 }), T0)

        expect(step).toMatchObject({ kind: 'request', rangeFrom: 2_147_483_648 })
    })

    /**
     * The resolve window is large on purpose — re-resolving costs one unit of a
     * 3000-per-300s bucket, so there is no reason to do it every few megabytes.
     * A resolve boundary and a checkpoint boundary are not the same thing, and
     * fusing them is what produced the livelock below.
     */
    it('asks for a large window, not a few megabytes', () => {
        const step = talosNextDownloadStep(running(), T0)

        if (step.kind !== 'request') throw new Error('expected a request')
        // HTTP ranges are INCLUSIVE, so the window is to - from + 1. Getting
        // this wrong by one byte per window is how a download ends up
        // corrupt in a way only a hash would ever catch.
        expect(step.rangeTo - step.rangeFrom + 1).toBe(128 * MIB)
    })

    /** The same off-by-one, stated where a reader will look for it. */
    it('treats the range as inclusive, so the last byte is the last byte', () => {
        const step = talosNextDownloadStep(running({ totalBytes: 1000, haveBytes: 0 }), T0)

        expect(step).toMatchObject({ kind: 'request', rangeFrom: 0, rangeTo: 999 })
    })

    it('never asks past the end of the file', () => {
        const step = talosNextDownloadStep(running({ haveBytes: 4 * GIB - 1000 }), T0)

        if (step.kind !== 'request') throw new Error('expected a request')
        expect(step.rangeTo).toBe(4 * GIB - 1)
    })

    it('stops asking and verifies once every byte is on disk', () => {
        expect(talosNextDownloadStep(running({ haveBytes: 4 * GIB }), T0).kind).toBe('verify')
    })
})

describe('the answers that are not failures', () => {
    /**
     * The signature expired mid-stream. It is the expected end of every signed
     * address on a large file, and treating it as an error is what makes a
     * download fail at 85% for everyone on mobile data.
     */
    it('reads a 403 as "the address expired", keeping every byte already written', () => {
        const before = running({ haveBytes: 3 * GIB })

        const { state, step } = talosApplyDownloadOutcome(before, { kind: 'status', status: 403 }, T0)

        expect(step.kind).toBe('resolve')
        expect(state.haveBytes).toBe(3 * GIB)
        // It counts, though. This assertion used to demand zero, and that is
        // what let a 403 which never stops — a gated repo, a revoked token —
        // loop at full speed forever with no sleep: found by an adversarial
        // review on 2026-08-01, and the test was holding the bug in place.
        // Arriving BYTES are what clear the count; see the case below.
        expect(state.consecutiveFailures).toBe(1)
    })

    /**
     * And it is bytes, not a hopeful-looking status, that mean the link works.
     * One 403 followed by real progress must leave nothing behind.
     */
    it('lets arriving bytes clear what a 403 counted', () => {
        const expired = talosApplyDownloadOutcome(
            running({ haveBytes: 3 * GIB }), { kind: 'status', status: 403 }, T0)

        const { state } = talosApplyDownloadOutcome(
            expired.state, { kind: 'bytes', count: 1 * MIB }, T0)

        expect(state.consecutiveFailures).toBe(0)
    })

    /**
     * A 416 is different in kind: the server is saying the range does not exist,
     * which means the file is not the file we started. Resuming into it would
     * write a mixture of two files that still passes a length check.
     */
    it('reads a 416 as "the file changed upstream" and refuses to resume into it', () => {
        const { state, step } = talosApplyDownloadOutcome(
            running({ haveBytes: 3 * GIB }), { kind: 'status', status: 416 }, T0,
        )

        expect(step).toMatchObject({ kind: 'give-up', reason: 'file-changed' })
        expect(state.haveBytes).toBe(0)
    })

    /** Probed: no `Retry-After`, so the countdown is whatever the Hub reported. */
    it('waits exactly as long as the Hub said, when it said', () => {
        const { step } = talosApplyDownloadOutcome(
            running(), { kind: 'status', status: 429, retryAfterSeconds: 254 }, T0,
        )

        expect(step).toMatchObject({ kind: 'wait', seconds: 254, reason: 'rate-limited' })
    })

    it('waits a bounded amount when the Hub said nothing, rather than guessing forever', () => {
        const { step } = talosApplyDownloadOutcome(
            running(), { kind: 'status', status: 429, retryAfterSeconds: null }, T0,
        )

        if (step.kind !== 'wait') throw new Error('expected a wait')
        expect(step.seconds).toBeGreaterThan(0)
        expect(step.seconds).toBeLessThanOrEqual(300)
    })
})

describe('writing progress down', () => {
    /**
     * THE livelock the critic found. Checkpointing every 128 MiB means a link
     * that drops every 90 seconds discards everything since the last boundary —
     * so on a commuter route the download makes zero net progress and the bar
     * walks backwards. Time-based checkpointing bounds the loss in SECONDS at
     * any link speed.
     */
    it('checkpoints on time even when almost nothing has arrived', () => {
        const state = running({ lastCheckpointAtMs: T0 })

        const step = talosNextDownloadStep(
            { ...state, bytesSinceCheckpoint: 12 * 1024 },
            T0 + TALOS_DOWNLOAD_CHECKPOINT_MS + 1,
        )

        expect(step.kind).toBe('checkpoint')
    })

    it('checkpoints on bytes when they arrive faster than the clock', () => {
        const step = talosNextDownloadStep(
            running({ bytesSinceCheckpoint: TALOS_DOWNLOAD_CHECKPOINT_BYTES + 1 }),
            T0 + 100,
        )

        expect(step.kind).toBe('checkpoint')
    })

    it('does not checkpoint on every packet', () => {
        const step = talosNextDownloadStep(running({ bytesSinceCheckpoint: 64 * 1024 }), T0 + 500)

        expect(step.kind).not.toBe('checkpoint')
    })
})

describe('a link that hangs instead of failing', () => {
    /**
     * A tunnel does not produce an error — it produces a socket that sits there.
     * Without a watchdog the UI shows a moving spinner over a dead connection,
     * which is the indeterminate-spinner state this feature forbids.
     */
    it('names the stall instead of waiting forever', () => {
        const step = talosNextDownloadStep(
            running({ lastProgressAtMs: T0 }), T0 + TALOS_DOWNLOAD_STALL_MS + 1,
        )

        expect(step).toMatchObject({ kind: 'stall' })
    })

    it('is not a stall while bytes are still arriving', () => {
        const step = talosNextDownloadStep(
            running({ lastProgressAtMs: T0 + 1000 }), T0 + TALOS_DOWNLOAD_STALL_MS,
        )

        expect(step.kind).not.toBe('stall')
    })
})

describe('knowing when to stop', () => {
    it('retries a transport failure, keeping what is on disk', () => {
        const { state, step } = talosApplyDownloadOutcome(running(), { kind: 'error' }, T0)

        expect(step.kind).toBe('wait')
        expect(state.consecutiveFailures).toBe(1)
        expect(state.haveBytes).toBe(1 * GIB)
    })

    it('backs off further each time rather than hammering', () => {
        let state = running()
        const waits: number[] = []
        for (let attempt = 0; attempt < 3; attempt += 1) {
            const outcome = talosApplyDownloadOutcome(state, { kind: 'error' }, T0)
            state = outcome.state
            if (outcome.step.kind === 'wait') waits.push(outcome.step.seconds)
        }

        expect(waits[1]).toBeGreaterThan(waits[0]!)
        expect(waits[2]).toBeGreaterThan(waits[1]!)
    })

    /** Retrying for ever is not perseverance, it is a spinner with extra steps. */
    it('gives up with a reason after enough consecutive failures', () => {
        const { step } = talosApplyDownloadOutcome(
            running({ consecutiveFailures: 20 }), { kind: 'error' }, T0,
        )

        expect(step).toMatchObject({ kind: 'give-up', reason: 'unreachable' })
    })

    it('forgets the failures as soon as bytes arrive again', () => {
        const { state } = talosApplyDownloadOutcome(
            running({ consecutiveFailures: 3 }), { kind: 'bytes', count: 8 * MIB }, T0,
        )

        expect(state.consecutiveFailures).toBe(0)
        expect(state.haveBytes).toBe(1 * GIB + 8 * MIB)
    })
})

/**
 * The shared table — the reason two implementations of one rule cannot drift.
 *
 * The download loop must run natively (the WebView is suspended in the
 * background, which is why the job exists), so the same policy exists in Java.
 * Neither copy owns the rules: `downloadPolicy.cases.json` does, and both test
 * suites execute it. A difference between them fails here or in
 * `TalosModelDownloadPolicyTest`, instead of waiting to be found on a phone.
 */
describe('the shared case table, run by this implementation', () => {
    const cases = JSON.parse(
        readFileSync(resolve(process.cwd(), 'src/lib/models/downloadPolicy.cases.json'), 'utf8'),
    ) as {
        constants: Record<string, number>
        steps: Array<{ name: string; state: TalosDownloadState; nowMs: number; expect: Record<string, unknown> }>
        outcomes: Array<{
            name: string
            state: TalosDownloadState
            outcome: Parameters<typeof talosApplyDownloadOutcome>[1]
            nowMs: number
            expectStep?: Record<string, unknown>
            expectState?: Record<string, unknown>
        }>
    }

    /** The constants are part of the contract, not an implementation detail. */
    it('agrees with the table about the numbers themselves', () => {
        expect(cases.constants.checkpointMs).toBe(TALOS_DOWNLOAD_CHECKPOINT_MS)
        expect(cases.constants.checkpointBytes).toBe(TALOS_DOWNLOAD_CHECKPOINT_BYTES)
        expect(cases.constants.stallMs).toBe(TALOS_DOWNLOAD_STALL_MS)
    })

    /**
     * The fit gate answers "will it fit" before the download starts and the
     * native transfer plan answers it again before a byte moves. Two answers to
     * one question is a bug waiting for a user with an awkward amount of free
     * space, so the number lives in the table and both halves read it.
     */
    it('reserves the same storage as the half of the app that downloads', () => {
        expect(cases.constants.storageReserveBytes).toBe(TALOS_STORAGE_RESERVE_BYTES)
    })

    it.each(0 === cases.steps.length ? [] : cases.steps.map((c) => [c.name, c] as const))(
        'step: %s',
        (_name, testCase) => {
            expect(talosNextDownloadStep(testCase.state, testCase.nowMs)).toMatchObject(testCase.expect)
        },
    )

    it.each(cases.outcomes.map((c) => [c.name, c] as const))(
        'outcome: %s',
        (_name, testCase) => {
            const result = talosApplyDownloadOutcome(testCase.state, testCase.outcome, testCase.nowMs)
            if (testCase.expectStep) expect(result.step).toMatchObject(testCase.expectStep)
            if (testCase.expectState) expect(result.state).toMatchObject(testCase.expectState)
        },
    )
})
