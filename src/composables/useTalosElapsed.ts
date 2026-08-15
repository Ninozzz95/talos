import { onBeforeUnmount, onMounted, ref, type Ref } from 'vue'

/**
 * How long this has been going on, in seconds, ticking.
 *
 * Owner 2026-07-26: "metti il tempo che è passato in secondi del ragionamento e
 * dei tool sia nella riga che nel drawer". A model that thinks for fifty
 * seconds and a model that has hung look identical without it — and after his
 * 110-second run, knowing WHICH is the difference between waiting and giving up.
 *
 * It counts from MOUNT rather than from a timestamp passed in, because that is
 * exactly when the row for a tool, or the block for reasoning, first appears —
 * threading start times through three components to arrive at the same number
 * would only add ways to get it wrong.
 */
export function useTalosElapsed(options: { tickMs?: number } = {}): Ref<number> {
    const seconds = ref(0)
    let timer: ReturnType<typeof setInterval> | null = null

    onMounted(() => {
        const startedAt = performance.now()
        timer = setInterval(() => {
            seconds.value = Math.floor((performance.now() - startedAt) / 1_000)
        }, options.tickMs ?? 1_000)
    })

    // Always: a timer that outlives its row keeps waking the device to count
    // something nobody is looking at.
    onBeforeUnmount(() => {
        if (timer !== null) clearInterval(timer)
        timer = null
    })

    return seconds
}

/**
 * The same number as text, in the shortest honest form.
 *
 * Nothing under a second: a row that flickers "0s" while it appears is noise,
 * and the reason to show a clock at all is the long cases.
 */
export function talosElapsedLabel(seconds: number): string {
    if (seconds < 1) return ''
    if (seconds < 60) return `${seconds}s`
    const minutes = Math.floor(seconds / 60)
    const rest = seconds % 60
    return rest === 0 ? `${minutes}m` : `${minutes}m ${rest}s`
}
