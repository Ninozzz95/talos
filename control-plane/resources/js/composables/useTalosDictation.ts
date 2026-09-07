import { computed, ref } from 'vue'
import type { TalosDictationMode } from '../lib/talosDictationModes'
import type { TalosDictationRuntime, TalosDictationStatus, TalosResolvedDictationMode } from '../lib/talosDictationRuntime'

export type { TalosDictationStatus } from '../lib/talosDictationRuntime'
export type { TalosResolvedDictationMode } from '../lib/talosDictationRuntime'

const STORAGE_KEY = 'talos.dictation_mode'

function loadDictationMode(): TalosDictationMode {
    try {
        const stored = window.localStorage.getItem(STORAGE_KEY)
        if (stored === 'local' || stored === 'cloud' || stored === 'auto') return stored
    } catch {
        // localStorage unavailable (private mode / SSR) - fall through to default.
    }
    return 'local'
}

// Dictation mode is a per-device FE-owned preference (localStorage). It is shared
// across the app so the composer mic and the Settings control stay in sync.
const sharedDictationMode = ref<TalosDictationMode>(loadDictationMode())

function persistDictationMode(next: TalosDictationMode) {
    sharedDictationMode.value = next
    try {
        window.localStorage.setItem(STORAGE_KEY, next)
    } catch {
        // Non-fatal: the mode still applies for this session.
    }
}

export function useTalosDictationMode() {
    return { mode: sharedDictationMode, setMode: persistDictationMode }
}

export function useTalosDictation(options: { onTranscript: (text: string) => void }) {
    const status = ref<TalosDictationStatus>('idle')
    const error = ref<string | null>(null)
    const recordingStartedAt = ref<number | null>(null)
    const resolvedMode = ref<TalosResolvedDictationMode | null>(null)
    const mode = sharedDictationMode
    const supported = computed(() => (
        typeof navigator !== 'undefined'
        && Boolean(navigator.mediaDevices?.getUserMedia)
        && typeof MediaRecorder !== 'undefined'
    ))
    const recording = computed(() => status.value === 'recording')
    const busy = computed(() => status.value === 'requesting' || status.value === 'recording' || status.value === 'transcribing')

    let runtime: TalosDictationRuntime | null = null
    let loaderRevision = 0
    let disposed = false

    function setStatus(next: TalosDictationStatus) {
        if (next === 'recording' && status.value !== 'recording') recordingStartedAt.value = Date.now()
        else if (next !== 'recording') recordingStartedAt.value = null
        status.value = next
    }

    async function start() {
        if (disposed || busy.value || !supported.value) return
        const revision = ++loaderRevision
        error.value = null
        resolvedMode.value = null
        setStatus('requesting')

        try {
            const { createTalosDictationRuntime } = await import('../lib/talosDictationRuntime')
            if (disposed || revision !== loaderRevision) return
            runtime ??= createTalosDictationRuntime({
                mode: () => mode.value,
                setStatus,
                setError: (next) => { error.value = next },
                setResolvedMode: (next) => { resolvedMode.value = next },
                onTranscript: options.onTranscript,
            })
            await runtime.start()
        } catch {
            if (disposed || revision !== loaderRevision) return
            error.value = 'TALOS could not start microphone capture. Try again.'
            setStatus('error')
        }
    }

    function stop() {
        runtime?.finish()
    }

    function cancel() {
        loaderRevision += 1
        runtime?.cancel()
        resolvedMode.value = null
        setStatus('idle')
        error.value = null
    }

    function dispose() {
        disposed = true
        loaderRevision += 1
        runtime?.dispose()
        runtime = null
        resolvedMode.value = null
        setStatus('idle')
        error.value = null
    }

    function toggle() {
        if (status.value === 'recording') stop()
        else if (!busy.value) void start()
    }

    return { status, error, mode, supported, recording, busy, recordingStartedAt, resolvedMode, start, stop, cancel, dispose, toggle, setMode: persistDictationMode }
}
