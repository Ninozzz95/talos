const MIME_CANDIDATES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus']

export interface TalosDictationCaptureSession {
    finish: () => Promise<Blob | null>
    cancel: () => void
}

export interface TalosDictationCaptureHooks {
    onError?: (error: unknown) => void
}

function pickMimeType(): string | undefined {
    if (typeof MediaRecorder.isTypeSupported !== 'function') return undefined
    return MIME_CANDIDATES.find((type) => MediaRecorder.isTypeSupported(type))
}

export function talosMediaCaptureErrorMessage(error: unknown): string {
    const name = error && typeof error === 'object' && 'name' in error
        ? String((error as { name?: unknown }).name ?? '')
        : ''

    switch (name) {
        case 'NotAllowedError':
        case 'SecurityError':
            return 'Microphone access is blocked. In your browser site controls, allow Microphone for TALOS, then try again.'
        case 'NotFoundError':
            return 'No microphone was detected. Connect or enable a microphone, then try again.'
        case 'NotReadableError':
            return 'The microphone is unavailable or being used by another application. Close the other application, then try again.'
        case 'AbortError':
            return 'The browser could not start the microphone. Try again.'
        default:
            return 'TALOS could not access the microphone. Check your browser site controls, then try again.'
    }
}

export async function requestTalosDictationCapture(hooks: TalosDictationCaptureHooks = {}): Promise<TalosDictationCaptureSession> {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    const releaseStream = (() => {
        let released = false
        return () => {
            if (released) return
            released = true
            stream.getTracks().forEach((track) => track.stop())
        }
    })()

    const mimeType = pickMimeType()
    let recorder: MediaRecorder
    try {
        recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
    } catch (error) {
        releaseStream()
        throw error
    }

    let chunks: Blob[] = []
    let discarded = false
    let settled = false
    let stopRequested = false
    let resolveCompletion!: (blob: Blob | null) => void
    let rejectCompletion!: (error: unknown) => void
    const completion = new Promise<Blob | null>((resolve, reject) => {
        resolveCompletion = resolve
        rejectCompletion = reject
    })
    // Recorder errors may arrive before Finish attaches a consumer. Keep the
    // original rejecting promise for callers, while preventing a global
    // unhandled-rejection event during the active recording phase.
    void completion.catch(() => undefined)

    const settle = (blob: Blob | null, error?: unknown) => {
        if (settled) return
        settled = true
        recorder.ondataavailable = null
        recorder.onstop = null
        recorder.onerror = null
        releaseStream()
        if (error !== undefined) rejectCompletion(error)
        else resolveCompletion(blob)
    }

    recorder.ondataavailable = (event) => {
        if (!discarded && event.data?.size > 0) chunks.push(event.data)
    }
    recorder.onstop = () => {
        const blob = discarded ? null : new Blob(chunks, { type: mimeType ?? 'audio/webm' })
        chunks = []
        settle(blob)
    }
    recorder.onerror = (event) => {
        const recorderError = 'error' in event ? event.error : new Error('The browser recorder failed.')
        settle(null, recorderError)
        try {
            hooks.onError?.(recorderError)
        } catch {
            // A UI notification hook must never escape the native event handler.
        }
    }

    try {
        recorder.start()
    } catch (error) {
        settle(null, error)
        throw error
    }

    const finish = () => {
        if (settled || stopRequested) return completion
        stopRequested = true
        if (recorder.state !== 'inactive') recorder.stop()
        else settle(discarded ? null : new Blob(chunks, { type: mimeType ?? 'audio/webm' }))
        return completion
    }

    const cancel = () => {
        if (settled) return
        discarded = true
        chunks = []
        if (!stopRequested && recorder.state !== 'inactive') {
            stopRequested = true
            recorder.stop()
        } else if (!stopRequested) {
            stopRequested = true
            settle(null)
        }
        releaseStream()
    }

    return { finish, cancel }
}
