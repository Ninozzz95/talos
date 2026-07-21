import { computed, ref } from 'vue'
import {
    TalosDictationError,
    resolveTalosDictationEngine,
    type TalosDictationMode,
} from '../lib/talosDictation'

const STORAGE_KEY = 'talos.dictation_mode'
const MIME_CANDIDATES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus']

export type TalosDictationStatus = 'idle' | 'recording' | 'transcribing' | 'error'

function loadDictationMode(): TalosDictationMode {
    try {
        const stored = window.localStorage.getItem(STORAGE_KEY)
        if (stored === 'local' || stored === 'cloud' || stored === 'auto') return stored
    } catch {
        // localStorage unavailable (private mode / SSR) — fall through to default.
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

function pickMimeType(): string | undefined {
    if (typeof MediaRecorder === 'undefined' || typeof MediaRecorder.isTypeSupported !== 'function') return undefined
    return MIME_CANDIDATES.find((type) => MediaRecorder.isTypeSupported(type))
}

function dictationErrorMessage(error: unknown): string {
    if (error instanceof TalosDictationError) {
        switch (error.code) {
            case 'TALOS_STT_ENGINE_UNAVAILABLE': return 'The speech model is not available. Try again in a moment.'
            case 'TALOS_STT_AUDIO_INVALID': return 'TALOS could not read the recorded audio.'
            case 'TALOS_STT_AUDIO_TOO_LONG': return 'That clip is too long to transcribe.'
            case 'TALOS_STT_AUDIO_TOO_LARGE': return 'That recording is too large to transcribe.'
            case 'TALOS_STT_RATE_LIMITED': return 'Too many dictation requests. Wait a moment and retry.'
            case 'TALOS_STT_TIMEOUT': return 'Transcription timed out. Try a shorter clip.'
            default: return 'TALOS could not transcribe the audio.'
        }
    }
    return error instanceof Error ? error.message : 'TALOS could not transcribe the audio.'
}

export function useTalosDictation(options: { onTranscript: (text: string) => void }) {
    const status = ref<TalosDictationStatus>('idle')
    const error = ref<string | null>(null)
    const mode = sharedDictationMode

    const supported = computed(() => (
        typeof navigator !== 'undefined'
        && Boolean(navigator.mediaDevices?.getUserMedia)
        && typeof MediaRecorder !== 'undefined'
    ))
    const recording = computed(() => status.value === 'recording')
    const busy = computed(() => status.value === 'recording' || status.value === 'transcribing')

    let mediaRecorder: MediaRecorder | null = null
    let mediaStream: MediaStream | null = null
    let chunks: Blob[] = []
    let activeMimeType: string | undefined

    function releaseStream() {
        mediaStream?.getTracks().forEach((track) => track.stop())
        mediaStream = null
        mediaRecorder = null
    }

    async function finalize() {
        const blob = new Blob(chunks, { type: activeMimeType ?? 'audio/webm' })
        chunks = []
        releaseStream()

        if (blob.size === 0) {
            status.value = 'idle'
            return
        }

        status.value = 'transcribing'
        try {
            const engine = await resolveTalosDictationEngine(mode.value)
            const result = await engine.transcribe(blob)
            status.value = 'idle'
            const text = result.text.trim()
            if (text) options.onTranscript(text)
        } catch (transcribeError) {
            error.value = dictationErrorMessage(transcribeError)
            status.value = 'error'
        }
    }

    async function start() {
        if (busy.value || !supported.value) return
        error.value = null

        try {
            mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true })
        } catch {
            error.value = 'TALOS needs microphone permission to dictate.'
            status.value = 'error'
            return
        }

        chunks = []
        activeMimeType = pickMimeType()
        mediaRecorder = new MediaRecorder(mediaStream, activeMimeType ? { mimeType: activeMimeType } : undefined)
        mediaRecorder.ondataavailable = (event) => {
            if (event.data && event.data.size > 0) chunks.push(event.data)
        }
        mediaRecorder.onstop = () => { void finalize() }
        mediaRecorder.start()
        status.value = 'recording'
    }

    function stop() {
        if (mediaRecorder && status.value === 'recording') {
            mediaRecorder.stop()
        }
    }

    // Discards the in-flight recording without transcribing.
    function cancel() {
        if (mediaRecorder && status.value === 'recording') {
            mediaRecorder.onstop = null
            mediaRecorder.stop()
        }
        chunks = []
        releaseStream()
        status.value = 'idle'
        error.value = null
    }

    function toggle() {
        if (status.value === 'recording') stop()
        else if (!busy.value) void start()
    }

    return { status, error, mode, supported, recording, busy, start, stop, cancel, toggle, setMode: persistDictationMode }
}
