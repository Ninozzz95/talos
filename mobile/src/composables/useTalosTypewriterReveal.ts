import { onBeforeUnmount, ref, watch, type Ref } from 'vue'
import {
    talosNextRevealCount,
    talosSafeRevealSlice,
    type TalosTypewriterOptions,
} from '@/lib/typewriterPacing'

/**
 * Owner 2026-07-25: the streamed reply must print letter by letter, fluidly.
 *
 * The reveal runs on a frame clock, independent of when provider chunks land
 * (see lib/typewriterPacing.ts for the why and the maths). Everything here is
 * injectable so the pacing can be driven deterministically in tests instead of
 * being observed through real time.
 */
export interface TalosTypewriterRevealDeps {
    now?: () => number
    raf?: (callback: (time: number) => void) => number
    cancel?: (handle: number) => void
    /** Reduced motion means "show me the text", not "animate it slower". */
    reducedMotion?: () => boolean
    /** Inactive animation modes must not own a frame loop. */
    enabled?: () => boolean
    pacing?: Partial<TalosTypewriterOptions>
}

export interface TalosTypewriterReveal {
    /** The text that may be painted right now. */
    revealed: Ref<string>
    /** True while characters are still owed to the user. */
    catchingUp: Ref<boolean>
}

export function useTalosTypewriterReveal(
    source: Ref<string>,
    deps: TalosTypewriterRevealDeps = {},
): TalosTypewriterReveal {
    const now = deps.now ?? (() => performance.now())
    const raf = deps.raf ?? ((callback) => requestAnimationFrame(callback))
    const cancel = deps.cancel ?? ((handle) => cancelAnimationFrame(handle))
    const reducedMotion = deps.reducedMotion ?? (() => typeof window !== 'undefined'
        && typeof window.matchMedia === 'function'
        && window.matchMedia('(prefers-reduced-motion: reduce)').matches)
    const enabled = deps.enabled ?? (() => true)

    const revealed = ref('')
    const catchingUp = ref(false)
    // Fractional: rounding every frame would stall a sub-1-char-per-frame pace.
    let count = 0
    let lastFrame = 0
    let handle: number | null = null

    function stop(): void {
        if (handle !== null) cancel(handle)
        handle = null
        catchingUp.value = false
    }

    function paint(): void {
        revealed.value = talosSafeRevealSlice(source.value, count)
    }

    function frame(time: number): void {
        handle = null
        if (!enabled()) {
            stop()
            return
        }
        const total = source.value.length
        const elapsed = Math.max(0, Math.min(120, time - lastFrame))
        lastFrame = time
        count = talosNextRevealCount(count, total, elapsed, deps.pacing)
        paint()
        if (count < total) {
            catchingUp.value = true
            handle = raf(frame)
        } else {
            catchingUp.value = false
        }
    }

    function schedule(): void {
        if (!enabled()) return
        if (handle !== null) return
        lastFrame = now()
        catchingUp.value = true
        handle = raf(frame)
    }

    watch(source, (text) => {
        if (!enabled()) {
            stop()
            return
        }
        // SF-MAJOR: `streamingText` is NOT monotonic — the store swaps in a
        // marker-stripped copy mid-reply (stripLibrarySaveMarkers). Restarting
        // from zero there made the loader flash and the whole reply re-type.
        // Clamp to what is still literally on screen instead; only an empty
        // source (a new reply) is a real reset.
        if (!text) {
            stop()
            count = 0
            revealed.value = ''
            return
        }
        const painted = revealed.value
        if (painted && !text.startsWith(painted)) {
            let shared = 0
            const limit = Math.min(painted.length, text.length)
            while (shared < limit && painted.charCodeAt(shared) === text.charCodeAt(shared)) shared += 1
            count = Math.min(count, shared)
            paint()
        }
        if (reducedMotion()) {
            stop()
            count = text.length
            paint()
            return
        }
        if (count < text.length) schedule()
    }, { immediate: true })

    watch(enabled, (active) => {
        if (!active) {
            stop()
            return
        }
        if (!source.value) return
        if (reducedMotion()) {
            stop()
            count = source.value.length
            paint()
            return
        }
        if (count < source.value.length) schedule()
    }, { immediate: true })

    // m4: with a source that is already complete (reduced motion, or a reply
    // restored in one shot) nothing else would ever fire a paint.
    paint()

    onBeforeUnmount(stop)

    return { revealed, catchingUp }
}
