import { onBeforeUnmount, ref, watch, type Ref } from 'vue'
import { createTalosSmoothReveal } from '@/lib/chat/smoothReveal'

export interface TalosSmoothRevealDeps {
    raf?: (callback: (timestamp: number) => void) => number
    cancel?: (handle: number) => void
    /** False for reduced motion: no pacing at all, text as it arrives. */
    paced?: () => boolean
    /** True once the answer is complete, so the remainder is handed over. */
    settled?: () => boolean
    /** Inactive animation modes must not own a frame loop. */
    enabled?: () => boolean
}

/**
 * The paced view of a growing answer, driven by the frame clock.
 *
 * The pacing itself lives in `createTalosSmoothReveal` — pure, clock-injected,
 * tested. This is only the loop that drives it, kept thin on purpose.
 *
 * requestAnimationFrame rather than an interval, and the frame TIMESTAMP rather
 * than a fresh clock reading: rAF is vsync-aligned and pauses when the app is
 * hidden (battery, on a phone that matters), and using the timestamp is what
 * stops the reveal running half again as fast on a 90 or 120 Hz Android panel.
 *
 * Committing at ~25 Hz, not every frame: 40ms stays close to Convex's
 * client-side smoothing cadence and leaves the rest of the frame for the
 * Markdown work that follows each commit. Vercel AI SDK 7.0.40 defaults to a
 * 10ms upstream word transform, but that boundary does not pay Vue/DOM parsing
 * work and is therefore not a like-for-like mobile paint budget.
 */
export const TALOS_COMMIT_INTERVAL_MS = 40

export function useTalosSmoothReveal(
    source: Ref<string>,
    deps: TalosSmoothRevealDeps = {},
): { revealed: Ref<string> } {
    const raf = deps.raf ?? ((callback) => requestAnimationFrame(callback))
    const cancel = deps.cancel ?? ((handle) => cancelAnimationFrame(handle))
    const paced = deps.paced ?? (() => true)
    const enabled = deps.enabled ?? (() => true)

    const revealed = ref('')
    let engine = createTalosSmoothReveal({ paced: paced() })
    let handle: number | null = null
    let lastCommit = 0

    function stop(): void {
        if (handle !== null) cancel(handle)
        handle = null
    }

    function frame(timestamp: number): void {
        handle = null
        if (!enabled()) return
        // Arrivals are stamped with the SAME clock as the ticks. Reading
        // `performance.now()` for one and the frame timestamp for the other
        // mixed two time origins: on a device they happen to share one, so it
        // worked by luck, and anywhere they do not the elapsed time comes out
        // negative and the reveal never advances.
        engine.arrive(source.value, timestamp)
        if (lastCommit === 0 || timestamp - lastCommit >= TALOS_COMMIT_INTERVAL_MS) {
            lastCommit = timestamp
            revealed.value = engine.tick(timestamp)
        }
        // Keep going while there is still text held back. Stopping the moment
        // the source stops growing would strand whatever is still buffered.
        if (revealed.value.length < source.value.length) handle = raf(frame)
    }

    function pump(): void {
        if (!enabled()) return
        if (handle === null) handle = raf(frame)
    }

    watch(source, (text) => {
        if (!enabled()) {
            stop()
            return
        }
        if (!text) {
            stop()
            engine = createTalosSmoothReveal({ paced: paced() })
            revealed.value = ''
            lastCommit = 0
            return
        }
        pump()
    }, { immediate: true })

    watch(enabled, (active) => {
        if (!active) {
            stop()
            return
        }
        if (source.value) pump()
    }, { immediate: true })

    watch(() => deps.settled?.() ?? false, (settled) => {
        // The answer is done: hand over the remainder in one go rather than
        // letting the buffer trickle after the model has stopped. A UI still
        // typing when the work is finished reads as a hang.
        if (!settled) return
        if (!enabled()) return
        stop()
        revealed.value = engine.finish()
    })

    onBeforeUnmount(stop)

    return { revealed }
}
