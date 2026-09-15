export const DEFAULT_MOTION_CLOCK_MAX_DELTA_MS = 100
export const ABSOLUTE_MOTION_CLOCK_MAX_DELTA_MS = 1_000

export const MOTION_CLOCK_FAULT_CODES = Object.freeze([
    'synchronous_frame',
    'request_frame_failed',
    'frame_callback_failed',
    'cancel_frame_failed',
] as const)

export type MotionClockFaultCode = typeof MOTION_CLOCK_FAULT_CODES[number]
export type MotionFrameHandle = unknown

export type MotionClockFault = Readonly<{
    code: MotionClockFaultCode
    cause: unknown
}>

export type MotionFrameScheduler = {
    now: () => number
    requestFrame: (callback: () => void) => MotionFrameHandle
    cancelFrame: (handle: MotionFrameHandle) => void
}

export type MotionFrameSample = Readonly<{
    logicalTimeMs: number
    deltaMs: number
}>

export type MotionClock = {
    start: () => void
    pause: () => void
    resume: () => void
    dispose: () => void
}

export type MotionClockOptions = {
    scheduler: MotionFrameScheduler
    onFrame: (sample: MotionFrameSample) => void
    onError?: (fault: MotionClockFault) => void
    maxDeltaMs?: number
}

type ClockState = 'idle' | 'running' | 'paused' | 'faulted' | 'disposed'

type PendingFrame = {
    handle: MotionFrameHandle
    handleAssigned: boolean
}

function normalizeMaxDelta(value: number | undefined): number {
    if (value === undefined) return DEFAULT_MOTION_CLOCK_MAX_DELTA_MS
    if (!Number.isFinite(value) || value < 0) return DEFAULT_MOTION_CLOCK_MAX_DELTA_MS
    return Math.min(value, ABSOLUTE_MOTION_CLOCK_MAX_DELTA_MS)
}

/**
 * Scheduler and callback faults are terminal. After a fault, public operations and
 * callbacks retained by an external scheduler are inert; dispose remains idempotent.
 */
export function createMotionClock(options: MotionClockOptions): MotionClock {
    const maxDeltaMs = normalizeMaxDelta(options.maxDeltaMs)
    let logicalTimeMs = 0
    let previousNowMs: number | undefined
    let firstFrame = true
    let state: ClockState = 'idle'
    let pendingFrame: PendingFrame | null = null

    const readNow = (): number => {
        try {
            const now = options.scheduler.now()
            if (Number.isFinite(now)) return now
        } catch {
            // A broken clock source must not create a negative or non-finite delta.
        }
        return previousNowMs ?? 0
    }

    const notifyFault = (code: MotionClockFaultCode, cause: unknown): void => {
        try {
            options.onError?.({ code, cause })
        } catch {
            // Error observers cannot revive or destabilize a terminal clock.
        }
    }

    const failTerminally = (code: MotionClockFaultCode, cause: unknown): void => {
        if (state === 'faulted' || state === 'disposed') return
        pendingFrame = null
        state = 'faulted'
        notifyFault(code, cause)
    }

    const cancelPending = (nextState: 'paused' | 'disposed'): void => {
        const pending = pendingFrame
        pendingFrame = null
        state = nextState
        if (!pending?.handleAssigned) return

        try {
            options.scheduler.cancelFrame(pending.handle)
        } catch (cause) {
            if (nextState === 'disposed') {
                notifyFault('cancel_frame_failed', cause)
                return
            }
            failTerminally('cancel_frame_failed', cause)
        }
    }

    const scheduleNext = (): void => {
        if (state !== 'running' || pendingFrame !== null) return

        const pending: PendingFrame = {
            handle: undefined,
            handleAssigned: false,
        }
        pendingFrame = pending

        const callback = (): void => {
            if (!pending.handleAssigned) {
                if (state === 'running' && pendingFrame === pending) {
                    failTerminally(
                        'synchronous_frame',
                        new Error('requestFrame callbacks must run asynchronously.'),
                    )
                }
                return
            }
            if (state !== 'running' || pendingFrame !== pending) return

            pendingFrame = null
            const nowMs = readNow()
            let sample: MotionFrameSample
            if (firstFrame) {
                firstFrame = false
                previousNowMs = nowMs
                sample = { logicalTimeMs: 0, deltaMs: 0 }
            } else {
                const previous = previousNowMs ?? nowMs
                const monotonicNow = Math.max(previous, nowMs)
                const rawDeltaMs = monotonicNow - previous
                const deltaMs = Math.min(maxDeltaMs, Math.max(0, rawDeltaMs))
                logicalTimeMs += deltaMs
                previousNowMs = monotonicNow
                sample = { logicalTimeMs, deltaMs }
            }

            try {
                options.onFrame(sample)
            } catch (cause) {
                failTerminally('frame_callback_failed', cause)
                return
            }

            scheduleNext()
        }

        try {
            const handle = options.scheduler.requestFrame(callback)
            pending.handle = handle
            pending.handleAssigned = true

            if (state !== 'running' || pendingFrame !== pending) {
                try {
                    options.scheduler.cancelFrame(handle)
                } catch (cause) {
                    if ((state as ClockState) === 'faulted' || (state as ClockState) === 'disposed') {
                        notifyFault('cancel_frame_failed', cause)
                    } else {
                        failTerminally('cancel_frame_failed', cause)
                    }
                }
            }
        } catch (cause) {
            if (state === 'running' && pendingFrame === pending) {
                failTerminally('request_frame_failed', cause)
            }
        }
    }

    return {
        start: () => {
            if (state !== 'idle') return
            state = 'running'
            previousNowMs = readNow()
            scheduleNext()
        },
        pause: () => {
            if (state !== 'running') return
            previousNowMs = readNow()
            cancelPending('paused')
        },
        resume: () => {
            if (state !== 'paused') return
            state = 'running'
            previousNowMs = readNow()
            scheduleNext()
        },
        dispose: () => {
            if (state === 'disposed') return
            cancelPending('disposed')
        },
    }
}
