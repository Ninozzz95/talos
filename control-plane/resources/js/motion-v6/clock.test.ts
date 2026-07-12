import { describe, expect, it } from 'vitest'
import {
    ABSOLUTE_MOTION_CLOCK_MAX_DELTA_MS,
    DEFAULT_MOTION_CLOCK_MAX_DELTA_MS,
    createMotionClock,
    type MotionClockFault,
    type MotionFrameScheduler,
} from './clock'

function createControlledScheduler(startTime = 0) {
    let currentTime = startTime
    let nextHandle = 1
    const pending = new Map<number, () => void>()
    const cancelled: number[] = []

    const scheduler: MotionFrameScheduler = {
        now: () => currentTime,
        requestFrame: (callback) => {
            const handle = nextHandle++
            pending.set(handle, callback)
            return handle
        },
        cancelFrame: (handle) => {
            cancelled.push(handle)
            pending.delete(handle)
        },
    }

    return {
        scheduler,
        pending,
        cancelled,
        setTime(time: number) {
            currentTime = time
        },
        flushNext() {
            const entry = pending.entries().next().value as [number, () => void] | undefined
            if (!entry) throw new Error('No frame is pending.')
            pending.delete(entry[0])
            entry[1]()
        },
    }
}

describe('Theme Motion Engine V6 deterministic clock', () => {
    it('accepts deltas above the default and clamps configured values at the absolute cap', () => {
        expect(DEFAULT_MOTION_CLOCK_MAX_DELTA_MS).toBe(100)
        expect(ABSOLUTE_MOTION_CLOCK_MAX_DELTA_MS).toBeGreaterThan(DEFAULT_MOTION_CLOCK_MAX_DELTA_MS)

        const controlled = createControlledScheduler(0)
        const samples: Array<{ logicalTimeMs: number; deltaMs: number }> = []
        const clock = createMotionClock({
            scheduler: controlled.scheduler,
            maxDeltaMs: ABSOLUTE_MOTION_CLOCK_MAX_DELTA_MS + 1,
            onFrame: (sample) => samples.push(sample),
        })

        clock.start()
        controlled.flushNext()
        controlled.setTime(101)
        controlled.flushNext()
        controlled.setTime(5_000)
        controlled.flushNext()

        expect(samples).toEqual([
            { logicalTimeMs: 0, deltaMs: 0 },
            { logicalTimeMs: 101, deltaMs: 101 },
            {
                logicalTimeMs: 101 + ABSOLUTE_MOTION_CLOCK_MAX_DELTA_MS,
                deltaMs: ABSOLUTE_MOTION_CLOCK_MAX_DELTA_MS,
            },
        ])
    })

    it('fails terminally when requestFrame invokes its callback synchronously', () => {
        const callbacks: Array<() => void> = []
        const cancelled: unknown[] = []
        const faults: MotionClockFault[] = []
        let requestCount = 0
        let frameCount = 0
        const clock = createMotionClock({
            scheduler: {
                now: () => 0,
                requestFrame: (callback) => {
                    requestCount += 1
                    callbacks.push(callback)
                    if (requestCount === 1) callback()
                    return 41
                },
                cancelFrame: (handle) => cancelled.push(handle),
            },
            onFrame: () => {
                frameCount += 1
            },
            onError: (fault) => faults.push(fault),
        })

        expect(() => clock.start()).not.toThrow()
        callbacks[0]?.()
        clock.start()
        clock.resume()

        expect(requestCount).toBe(1)
        expect(frameCount).toBe(0)
        expect(cancelled).toEqual([41])
        expect(faults.map((fault) => fault.code)).toEqual(['synchronous_frame'])
    })

    it('contains cancellation faults after a synchronous frame without recursion or leaks', () => {
        const cancelCause = new Error('synchronous handle cancellation failed')
        const faults: MotionClockFault[] = []
        let staleCallback: (() => void) | undefined
        let requestCount = 0
        let cancelCount = 0
        let frameCount = 0
        const clock = createMotionClock({
            scheduler: {
                now: () => 0,
                requestFrame: (callback) => {
                    requestCount += 1
                    staleCallback = callback
                    callback()
                    return 73
                },
                cancelFrame: () => {
                    cancelCount += 1
                    staleCallback?.()
                    throw cancelCause
                },
            },
            onFrame: () => {
                frameCount += 1
            },
            onError: (fault) => faults.push(fault),
        })

        expect(() => clock.start()).not.toThrow()
        staleCallback?.()
        clock.start()
        clock.resume()
        clock.dispose()
        clock.dispose()

        expect(requestCount).toBe(1)
        expect(cancelCount).toBe(1)
        expect(frameCount).toBe(0)
        expect(faults.map((fault) => fault.code)).toEqual([
            'synchronous_frame',
            'cancel_frame_failed',
        ])
        expect(faults[1]?.cause).toBe(cancelCause)
    })

    it('fails terminally when requestFrame throws', () => {
        const cause = new Error('request failed')
        const faults: MotionClockFault[] = []
        let requestCount = 0
        const clock = createMotionClock({
            scheduler: {
                now: () => 0,
                requestFrame: () => {
                    requestCount += 1
                    throw cause
                },
                cancelFrame: () => undefined,
            },
            onFrame: () => undefined,
            onError: (fault) => faults.push(fault),
        })

        expect(() => clock.start()).not.toThrow()
        clock.start()
        clock.resume()

        expect(requestCount).toBe(1)
        expect(faults).toEqual([{
            code: 'request_frame_failed',
            cause,
        }])
    })

    it('fails terminally when onFrame throws and does not schedule a successor', () => {
        const controlled = createControlledScheduler()
        const cause = new Error('renderer frame failed')
        const faults: MotionClockFault[] = []
        const clock = createMotionClock({
            scheduler: controlled.scheduler,
            onFrame: () => {
                throw cause
            },
            onError: (fault) => faults.push(fault),
        })

        clock.start()
        expect(() => controlled.flushNext()).not.toThrow()
        clock.start()
        clock.resume()

        expect(controlled.pending.size).toBe(0)
        expect(faults).toEqual([{
            code: 'frame_callback_failed',
            cause,
        }])
    })

    it('fails terminally when cancelFrame throws and leaves the stale callback inert', () => {
        const cause = new Error('cancel failed')
        const faults: MotionClockFault[] = []
        let staleCallback: (() => void) | undefined
        let requestCount = 0
        let cancelCount = 0
        let frameCount = 0
        const clock = createMotionClock({
            scheduler: {
                now: () => 0,
                requestFrame: (callback) => {
                    requestCount += 1
                    staleCallback = callback
                    return requestCount
                },
                cancelFrame: () => {
                    cancelCount += 1
                    throw cause
                },
            },
            onFrame: () => {
                frameCount += 1
            },
            onError: (fault) => faults.push(fault),
        })

        clock.start()
        expect(() => clock.pause()).not.toThrow()
        staleCallback?.()
        clock.resume()
        clock.start()
        clock.dispose()
        clock.dispose()

        expect(requestCount).toBe(1)
        expect(cancelCount).toBe(1)
        expect(frameCount).toBe(0)
        expect(faults).toEqual([{
            code: 'cancel_frame_failed',
            cause,
        }])
    })

    it('swallows onError failures while remaining terminal and inert', () => {
        let requestCount = 0
        let errorCount = 0
        const clock = createMotionClock({
            scheduler: {
                now: () => 0,
                requestFrame: () => {
                    requestCount += 1
                    throw new Error('request failed')
                },
                cancelFrame: () => undefined,
            },
            onFrame: () => undefined,
            onError: () => {
                errorCount += 1
                throw new Error('observer failed')
            },
        })

        expect(() => clock.start()).not.toThrow()
        clock.start()
        clock.resume()

        expect(requestCount).toBe(1)
        expect(errorCount).toBe(1)
    })

    it('emits a deterministic first sample and bounded non-negative deltas', () => {
        const controlled = createControlledScheduler(10)
        const samples: Array<{ logicalTimeMs: number; deltaMs: number }> = []
        const clock = createMotionClock({
            scheduler: controlled.scheduler,
            maxDeltaMs: 100,
            onFrame: (sample) => samples.push(sample),
        })

        clock.start()
        controlled.setTime(16)
        controlled.flushNext()
        controlled.setTime(40)
        controlled.flushNext()
        controlled.setTime(1_000)
        controlled.flushNext()
        controlled.setTime(900)
        controlled.flushNext()

        expect(samples).toEqual([
            { logicalTimeMs: 0, deltaMs: 0 },
            { logicalTimeMs: 24, deltaMs: 24 },
            { logicalTimeMs: 124, deltaMs: 100 },
            { logicalTimeMs: 124, deltaMs: 0 },
        ])
    })

    it('keeps at most one scheduled callback and excludes paused wall time', () => {
        const controlled = createControlledScheduler()
        const samples: Array<{ logicalTimeMs: number; deltaMs: number }> = []
        const clock = createMotionClock({
            scheduler: controlled.scheduler,
            onFrame: (sample) => samples.push(sample),
        })

        clock.start()
        clock.start()
        expect(controlled.pending.size).toBe(1)

        controlled.setTime(10)
        controlled.flushNext()
        expect(controlled.pending.size).toBe(1)

        controlled.setTime(20)
        clock.pause()
        expect(controlled.pending.size).toBe(0)
        expect(controlled.cancelled).toHaveLength(1)

        controlled.setTime(1_000)
        clock.resume()
        expect(controlled.pending.size).toBe(1)
        controlled.setTime(1_016)
        controlled.flushNext()

        expect(samples).toEqual([
            { logicalTimeMs: 0, deltaMs: 0 },
            { logicalTimeMs: 16, deltaMs: 16 },
        ])
    })

    it('disposes idempotently, cancels exactly once, and never ticks after disposal', () => {
        const controlled = createControlledScheduler()
        let frameCount = 0
        const clock = createMotionClock({
            scheduler: controlled.scheduler,
            onFrame: () => {
                frameCount += 1
            },
        })

        clock.start()
        const pendingCallback = controlled.pending.values().next().value as (() => void) | undefined
        expect(pendingCallback).toBeDefined()

        clock.dispose()
        clock.dispose()
        pendingCallback?.()

        expect(frameCount).toBe(0)
        expect(controlled.cancelled).toHaveLength(1)
        expect(controlled.pending.size).toBe(0)
    })

    it('does not schedule a successor when a frame callback disposes the clock', () => {
        const controlled = createControlledScheduler()
        let clock: ReturnType<typeof createMotionClock>
        clock = createMotionClock({
            scheduler: controlled.scheduler,
            onFrame: () => clock.dispose(),
        })

        clock.start()
        controlled.flushNext()

        expect(controlled.pending.size).toBe(0)
        expect(controlled.cancelled).toHaveLength(0)
    })
})
