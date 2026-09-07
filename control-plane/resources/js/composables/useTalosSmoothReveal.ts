import { onBeforeUnmount, ref, watch, type Ref } from 'vue'
import { createTalosSmoothReveal } from '../lib/talosSmoothReveal'

export type TalosSmoothRevealDependencies = {
    raf?: (callback: (timestamp: number) => void) => number
    cancel?: (handle: number) => void
    paced?: () => boolean
    settled?: () => boolean
}

export const TALOS_COMMIT_INTERVAL_MS = 40

export function useTalosSmoothReveal(
    source: Ref<string>,
    dependencies: TalosSmoothRevealDependencies = {},
) {
    const raf = dependencies.raf ?? ((callback) => requestAnimationFrame(callback))
    const cancel = dependencies.cancel ?? ((handle) => cancelAnimationFrame(handle))
    const paced = dependencies.paced ?? (() => true)
    const revealed = ref('')

    let engine = createTalosSmoothReveal({ paced: paced() })
    let handle: number | null = null
    let lastCommit = 0

    function stop() {
        if (handle !== null) cancel(handle)
        handle = null
    }

    function frame(timestamp: number) {
        handle = null
        engine.arrive(source.value, timestamp)
        if (lastCommit === 0 || timestamp - lastCommit >= TALOS_COMMIT_INTERVAL_MS) {
            lastCommit = timestamp
            revealed.value = engine.tick(timestamp)
        }
        if (revealed.value.length < source.value.length) handle = raf(frame)
    }

    function pump() {
        if (handle === null) handle = raf(frame)
    }

    watch(source, (text) => {
        if (!text) {
            stop()
            engine = createTalosSmoothReveal({ paced: paced() })
            revealed.value = ''
            lastCommit = 0
            return
        }
        pump()
    }, { immediate: true })

    watch(() => dependencies.settled?.() ?? false, (settled) => {
        if (!settled) return
        stop()
        revealed.value = engine.finish()
    })

    onBeforeUnmount(stop)

    return { revealed }
}
