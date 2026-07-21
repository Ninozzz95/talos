import { TalosApiError, talosFetch } from './api'

// TALOS dictation (speech-to-text) — a pluggable engine contract so the mic UX is
// built once and the engine is chosen at runtime. The default is in-browser Whisper
// (privacy/local-first, works offline and on mobile-standalone); the server engine
// powers the optional cloud mode against the control-plane STT worker.

export type TalosDictationMode = 'local' | 'cloud' | 'auto'
export type TalosDictationEngineId = 'browser-whisper' | 'server-whisper'

export const TALOS_DICTATION_MODE_OPTIONS: Array<{ value: TalosDictationMode; label: string }> = [
    { value: 'local', label: 'On device (private)' },
    { value: 'cloud', label: 'Cloud (accurate)' },
    { value: 'auto', label: 'Automatic' },
]

// Typed fault codes — mirror the control-plane STT contract (TALOS_STT_* prefix).
export type TalosSttFaultCode =
    | 'TALOS_STT_AUDIO_INVALID'
    | 'TALOS_STT_UNSUPPORTED_FORMAT'
    | 'TALOS_STT_AUDIO_TOO_LARGE'
    | 'TALOS_STT_AUDIO_TOO_LONG'
    | 'TALOS_STT_ENGINE_UNAVAILABLE'
    | 'TALOS_STT_TIMEOUT'
    | 'TALOS_STT_RATE_LIMITED'
    | 'TALOS_STT_UNKNOWN'

const KNOWN_STT_FAULTS = new Set<string>([
    'TALOS_STT_AUDIO_INVALID',
    'TALOS_STT_UNSUPPORTED_FORMAT',
    'TALOS_STT_AUDIO_TOO_LARGE',
    'TALOS_STT_AUDIO_TOO_LONG',
    'TALOS_STT_ENGINE_UNAVAILABLE',
    'TALOS_STT_TIMEOUT',
    'TALOS_STT_RATE_LIMITED',
])

export class TalosDictationError extends Error {
    code: TalosSttFaultCode

    constructor(code: TalosSttFaultCode, message: string) {
        super(message)
        this.name = 'TalosDictationError'
        this.code = code
    }
}

export type TalosDictationResult = { text: string; language?: string; durationMs?: number }
export type TalosTranscribeOptions = { language?: string; signal?: AbortSignal }

export interface TalosDictationEngine {
    readonly id: TalosDictationEngineId
    isAvailable(): Promise<boolean>
    transcribe(audio: Blob, options?: TalosTranscribeOptions): Promise<TalosDictationResult>
    dispose?(): void
}

type SttTranscribeResponse = { text?: unknown; language?: unknown; duration_ms?: unknown }
type SttHealthResponse = { available?: unknown }

// Maps a control-plane error into a typed dictation fault; anything unrecognised
// collapses to TALOS_STT_UNKNOWN so callers always get a stable code.
export function talosDictationFaultFrom(error: unknown): TalosDictationError {
    if (error instanceof TalosDictationError) return error

    if (error instanceof TalosApiError) {
        const detail = error.details as { error?: { code?: unknown } } | undefined
        const code = detail?.error?.code
        if (typeof code === 'string' && KNOWN_STT_FAULTS.has(code)) {
            return new TalosDictationError(code as TalosSttFaultCode, error.message)
        }
    }

    return new TalosDictationError(
        'TALOS_STT_UNKNOWN',
        error instanceof Error ? error.message : 'TALOS could not transcribe the audio.',
    )
}

// Cloud mode — relays the clip to the control-plane STT worker. Fully wired to the
// confirmed contract; it simply reports unavailable until the endpoint is deployed,
// so `auto` transparently falls back to the in-browser engine.
export function createTalosServerWhisperEngine(): TalosDictationEngine {
    return {
        id: 'server-whisper',
        async isAvailable() {
            try {
                const health = await talosFetch<SttHealthResponse>('/api/talos/stt/health', {
                    redirectOnAuthFailure: false,
                })
                return health?.available === true
            } catch {
                return false
            }
        },
        async transcribe(audio, options = {}) {
            const form = new FormData()
            form.append('audio', audio, audio instanceof File ? audio.name : 'dictation.webm')
            if (options.language) form.append('language', options.language)

            try {
                const response = await talosFetch<SttTranscribeResponse>('/api/talos/stt/transcribe', {
                    method: 'POST',
                    body: form,
                    signal: options.signal,
                    redirectOnAuthFailure: false,
                })

                return {
                    text: typeof response?.text === 'string' ? response.text : '',
                    language: typeof response?.language === 'string' ? response.language : undefined,
                    durationMs: typeof response?.duration_ms === 'number' ? response.duration_ms : undefined,
                }
            } catch (error) {
                throw talosDictationFaultFrom(error)
            }
        },
    }
}

// Picks the engine for the requested mode. The browser engine (and, through it, the
// heavy transformers.js runtime) is loaded via a dynamic import so it never enters
// the initial app chunk. `auto` prefers the reachable cloud worker, else on-device.
export async function resolveTalosDictationEngine(mode: TalosDictationMode): Promise<TalosDictationEngine> {
    if (mode === 'cloud') {
        return createTalosServerWhisperEngine()
    }

    if (mode === 'auto') {
        const server = createTalosServerWhisperEngine()
        if (await server.isAvailable()) return server
    }

    const { createTalosBrowserWhisperEngine } = await import('./talosDictationBrowser')
    return createTalosBrowserWhisperEngine()
}
