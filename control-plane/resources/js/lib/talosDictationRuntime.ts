import { requestTalosDictationCapture, talosMediaCaptureErrorMessage, type TalosDictationCaptureSession } from './talosDictationCapture'
import { resolveTalosDictationEngine } from './talosDictation'
import type { TalosDictationMode } from './talosDictationModes'

export type TalosDictationStatus = 'idle' | 'requesting' | 'recording' | 'transcribing' | 'error'
export type TalosResolvedDictationMode = 'local' | 'cloud'

export interface TalosDictationRuntimeHooks {
    mode: () => TalosDictationMode
    setStatus: (status: TalosDictationStatus) => void
    setError: (error: string | null) => void
    setResolvedMode: (mode: TalosResolvedDictationMode | null) => void
    onTranscript: (text: string) => void
}

export interface TalosDictationRuntime {
    start: () => Promise<void>
    finish: () => void
    cancel: () => void
    dispose: () => void
}

function sttFaultCode(error: unknown): string | null {
    if (error && typeof error === 'object' && 'code' in error) {
        const code = (error as { code?: unknown }).code
        if (typeof code === 'string' && code.startsWith('TALOS_STT_')) return code
    }
    return null
}

function dictationErrorMessage(error: unknown): string {
    switch (sttFaultCode(error)) {
        case 'TALOS_STT_ENGINE_UNAVAILABLE': return 'The speech model is not available. Try again in a moment.'
        case 'TALOS_STT_AUDIO_INVALID': return 'TALOS could not read the recorded audio.'
        case 'TALOS_STT_UNSUPPORTED_FORMAT': return 'This browser audio format is not supported. Try a different browser or dictation mode.'
        case 'TALOS_STT_AUDIO_TOO_LONG': return 'That clip is too long to transcribe.'
        case 'TALOS_STT_AUDIO_TOO_LARGE': return 'That recording is too large to transcribe.'
        case 'TALOS_STT_RATE_LIMITED': return 'Too many dictation requests. Wait a moment and retry.'
        case 'TALOS_STT_TIMEOUT': return 'Transcription timed out. Try a shorter clip.'
        case null: return error instanceof Error ? error.message : 'TALOS could not transcribe the audio.'
        default: return 'TALOS could not transcribe the audio.'
    }
}

export function createTalosDictationRuntime(hooks: TalosDictationRuntimeHooks): TalosDictationRuntime {
    let activeCapture: TalosDictationCaptureSession | null = null
    let operationRevision = 0
    let disposed = false

    const active = (revision: number) => !disposed && revision === operationRevision

    async function transcribe(capture: TalosDictationCaptureSession, revision: number) {
        let blob: Blob | null
        try {
            blob = await capture.finish()
        } catch (recordingError) {
            if (!active(revision)) return
            hooks.setError(recordingError instanceof Error ? recordingError.message : 'The browser could not finish the recording.')
            hooks.setStatus('error')
            return
        }

        if (!active(revision)) return
        if (!blob || blob.size === 0) {
            hooks.setStatus('idle')
            return
        }

        try {
            const engine = await resolveTalosDictationEngine(hooks.mode())
            if (!active(revision)) return
            hooks.setResolvedMode(engine.id === 'server-whisper' ? 'cloud' : 'local')
            const result = await engine.transcribe(blob)
            if (!active(revision)) return
            hooks.setStatus('idle')
            const text = result.text.trim()
            if (text) hooks.onTranscript(text)
        } catch (transcribeError) {
            if (!active(revision)) return
            hooks.setError(dictationErrorMessage(transcribeError))
            hooks.setStatus('error')
        }
    }

    async function start() {
        if (disposed) return
        const revision = ++operationRevision
        hooks.setError(null)
        hooks.setResolvedMode(null)
        hooks.setStatus('requesting')

        try {
            const capture = await requestTalosDictationCapture({
                onError: () => {
                    if (!active(revision)) return
                    operationRevision += 1
                    activeCapture = null
                    hooks.setResolvedMode(null)
                    hooks.setError('The browser recorder failed. Try again.')
                    hooks.setStatus('error')
                },
            })
            if (!active(revision)) {
                capture.cancel()
                return
            }
            activeCapture = capture
            hooks.setStatus('recording')
        } catch (captureError) {
            if (!active(revision)) return
            hooks.setError(talosMediaCaptureErrorMessage(captureError))
            hooks.setStatus('error')
        }
    }

    function finish() {
        if (!activeCapture || disposed) return
        const capture = activeCapture
        activeCapture = null
        hooks.setStatus('transcribing')
        void transcribe(capture, operationRevision)
    }

    function cancel() {
        operationRevision += 1
        activeCapture?.cancel()
        activeCapture = null
        hooks.setResolvedMode(null)
        hooks.setStatus('idle')
        hooks.setError(null)
    }

    function dispose() {
        disposed = true
        cancel()
    }

    return { start, finish, cancel, dispose }
}
