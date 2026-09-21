import { ref, onBeforeUnmount, type Ref } from 'vue'

/**
 * One action at a time, and a spinner only when the wait is real.
 *
 * Two things are being kept apart here, because collapsing them produces the
 * two opposite defects. `pending` starts the instant the work does and blocks a
 * second tap — that part must never wait. `visible` starts only if the work is
 * still going after a delay, and it is what the screen draws.
 *
 * The delay exists because a rename or a delete against the local database
 * finishes in tens of milliseconds, and a spinner that appears and vanishes
 * within one frame reads as a glitch rather than as progress. Android and
 * Material publish no threshold for this — the research of 2026-08-03 looked,
 * and found none. Fluent 2 does: nothing under a second, a spinner between one
 * and three, a bar or a status line beyond three. Carbon and SAP use different
 * numbers, which is the proof that these are design-system conventions rather
 * than a fact about perception. So this is TALOS adopting one deliberately, and
 * saying so, instead of borrowing authority it does not have.
 */
export const TALOS_BUSY_DELAY_MS = 800

export interface TalosDeferredBusy {
    /** What is working, from the first millisecond. Guards against a second tap. */
    readonly pending: Ref<string | null>
    /** What the screen should DRAW as working. Empty for anything quick. */
    readonly visible: Ref<string | null>
    /**
     * Run the work under `key`.
     *
     * Returns `null` — and does not run — when something is already in flight.
     * The caller is a finger on a phone: a double tap on Delete must not send
     * two deletions, and on Pause must not write two stops.
     */
    run<T>(key: string, work: () => Promise<T>): Promise<T | null>
}

export function useTalosDeferredBusy(delay: number = TALOS_BUSY_DELAY_MS): TalosDeferredBusy {
    const pending = ref<string | null>(null)
    const visible = ref<string | null>(null)
    let timer: ReturnType<typeof setTimeout> | null = null

    function stop(): void {
        if (timer !== null) clearTimeout(timer)
        timer = null
        pending.value = null
        visible.value = null
    }

    // A screen can be left mid-action. The timer must not fire into a component
    // that is gone, and the refs must not be revived after it unmounts.
    onBeforeUnmount(stop)

    return {
        pending,
        visible,
        async run<T>(key: string, work: () => Promise<T>): Promise<T | null> {
            if (pending.value !== null) return null
            pending.value = key
            timer = setTimeout(() => { visible.value = key }, delay)
            try {
                return await work()
            } finally {
                stop()
            }
        },
    }
}
