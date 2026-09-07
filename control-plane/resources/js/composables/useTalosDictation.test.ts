// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { resolveMock, transcribeMock } = vi.hoisted(() => {
    const transcribeMock = vi.fn(async () => ({ text: 'ciao' }))
    return {
        transcribeMock,
        resolveMock: vi.fn(async () => ({ id: 'browser-whisper', isAvailable: async () => true, transcribe: transcribeMock })),
    }
})
vi.mock('../lib/talosDictation', async () => {
    const actual = await vi.importActual<typeof import('../lib/talosDictation')>('../lib/talosDictation')
    return { ...actual, resolveTalosDictationEngine: resolveMock }
})

import { useTalosDictation, useTalosDictationMode } from './useTalosDictation'

class FakeMediaRecorder {
    static latest: FakeMediaRecorder | null = null
    static isTypeSupported() { return true }
    ondataavailable: ((event: { data: Blob }) => void) | null = null
    onstop: (() => void) | null = null
    onerror: ((event: { error: Error }) => void) | null = null
    state = 'inactive'
    constructor(public stream: unknown, public options?: unknown) { FakeMediaRecorder.latest = this }
    start() { this.state = 'recording' }
    stop() {
        this.state = 'inactive'
        this.ondataavailable?.({ data: new Blob(['audio'], { type: 'audio/webm' }) })
        this.onstop?.()
    }
    fail(error = new Error('Recorder hardware failed')) {
        this.state = 'inactive'
        this.onerror?.({ error })
    }
}

const getUserMedia = vi.fn()

beforeEach(() => {
    FakeMediaRecorder.latest = null
    vi.stubGlobal('MediaRecorder', FakeMediaRecorder)
    getUserMedia.mockReset()
    getUserMedia.mockResolvedValue({ getTracks: () => [{ stop: vi.fn() }] })
    Object.defineProperty(navigator, 'mediaDevices', { value: { getUserMedia }, configurable: true })
    try { window.localStorage.clear() } catch { /* ignore */ }
    // Reset the shared, module-level dictation mode between tests.
    useTalosDictationMode().setMode('local')
})

afterEach(() => {
    resolveMock.mockClear()
    transcribeMock.mockClear()
    vi.unstubAllGlobals()
})

describe('useTalosDictation', () => {
    it('reports supported and defaults to local mode', () => {
        const dictation = useTalosDictation({ onTranscript: vi.fn() })
        expect(dictation.supported.value).toBe(true)
        expect(dictation.mode.value).toBe('local')
    })

    it('records, transcribes on stop, and emits the transcript', async () => {
        const onTranscript = vi.fn()
        const dictation = useTalosDictation({ onTranscript })
        await dictation.start()
        expect(dictation.status.value).toBe('recording')

        dictation.stop()
        // finalize() lazily imports the engine. Wait on its observable call rather
        // than counting event-loop ticks, which is unstable under the full suite.
        await vi.waitFor(() => expect(transcribeMock).toHaveBeenCalledTimes(1), { timeout: 5_000 })

        expect(transcribeMock).toHaveBeenCalledTimes(1)
        expect(onTranscript).toHaveBeenCalledWith('ciao')
        expect(dictation.status.value).toBe('idle')
    })

    it('tracks the real recording start timestamp and clears it after cancellation', async () => {
        const dictation = useTalosDictation({ onTranscript: vi.fn() })
        expect(dictation.recordingStartedAt.value).toBeNull()

        await dictation.start()

        expect(dictation.recordingStartedAt.value).toEqual(expect.any(Number))
        expect(dictation.recordingStartedAt.value).toBeLessThanOrEqual(Date.now())
        dictation.cancel()
        expect(dictation.recordingStartedAt.value).toBeNull()
    })

    it('surfaces a recorder failure before Finish', async () => {
        const dictation = useTalosDictation({ onTranscript: vi.fn() })
        await dictation.start()

        FakeMediaRecorder.latest!.fail()

        await vi.waitFor(() => expect(dictation.status.value).toBe('error'))
        expect(dictation.error.value).toBe('The browser recorder failed. Try again.')
    })

    it('exposes the engine actually selected by auto mode', async () => {
        let resolveTranscription!: (result: { text: string }) => void
        transcribeMock.mockReturnValueOnce(new Promise((resolve) => { resolveTranscription = resolve }))
        const dictation = useTalosDictation({ onTranscript: vi.fn() })
        dictation.setMode('auto')

        await dictation.start()
        dictation.stop()

        await vi.waitFor(() => expect(dictation.resolvedMode.value).toBe('local'))
        expect(dictation.status.value).toBe('transcribing')
        resolveTranscription({ text: 'auto local transcript' })
        await vi.waitFor(() => expect(dictation.status.value).toBe('idle'))
    })

    it('exposes the resolved cloud destination from the engine id', async () => {
        let resolveTranscription!: (result: { text: string }) => void
        const cloudTranscribe = vi.fn(() => new Promise<{ text: string }>((resolve) => { resolveTranscription = resolve }))
        resolveMock.mockResolvedValueOnce({ id: 'server-whisper', isAvailable: async () => true, transcribe: cloudTranscribe })
        const dictation = useTalosDictation({ onTranscript: vi.fn() })
        dictation.setMode('auto')

        await dictation.start()
        dictation.stop()

        await vi.waitFor(() => expect(dictation.resolvedMode.value).toBe('cloud'))
        expect(dictation.status.value).toBe('transcribing')
        resolveTranscription({ text: 'cloud transcript' })
        await vi.waitFor(() => expect(dictation.status.value).toBe('idle'))
    })

    it('maps unsupported recorded audio to actionable copy', async () => {
        transcribeMock.mockRejectedValueOnce({ code: 'TALOS_STT_UNSUPPORTED_FORMAT' })
        const dictation = useTalosDictation({ onTranscript: vi.fn() })

        await dictation.start()
        dictation.stop()

        await vi.waitFor(() => expect(dictation.status.value).toBe('error'))
        expect(dictation.error.value).toBe('This browser audio format is not supported. Try a different browser or dictation mode.')
    })

    it('reports requesting while the browser permission decision is unresolved', async () => {
        let resolvePermission!: (stream: { getTracks: () => Array<{ stop: () => void }> }) => void
        getUserMedia.mockReturnValueOnce(new Promise((resolve) => { resolvePermission = resolve }))

        const dictation = useTalosDictation({ onTranscript: vi.fn() })
        const start = dictation.start()

        expect(dictation.status.value).toBe('requesting')

        resolvePermission({ getTracks: () => [{ stop: vi.fn() }] })
        await start
        expect(dictation.status.value).toBe('recording')
    })

    it('cancels an unresolved permission request and releases the late stream', async () => {
        const lateTrackStop = vi.fn()
        let resolvePermission!: (stream: { getTracks: () => Array<{ stop: () => void }> }) => void
        getUserMedia.mockReturnValueOnce(new Promise((resolve) => { resolvePermission = resolve }))

        const onTranscript = vi.fn()
        const dictation = useTalosDictation({ onTranscript })
        const start = dictation.start()

        await vi.waitFor(() => expect(getUserMedia).toHaveBeenCalledTimes(1))
        dictation.cancel()
        expect(dictation.status.value).toBe('idle')

        resolvePermission({ getTracks: () => [{ stop: lateTrackStop }] })
        await start

        expect(lateTrackStop).toHaveBeenCalledTimes(1)
        expect(dictation.status.value).toBe('idle')
        expect(onTranscript).not.toHaveBeenCalled()
    })

    it('ignores a transcription result after cancellation', async () => {
        let resolveTranscription!: (result: { text: string }) => void
        transcribeMock.mockReturnValueOnce(new Promise((resolve) => { resolveTranscription = resolve }))
        const onTranscript = vi.fn()
        const dictation = useTalosDictation({ onTranscript })

        await dictation.start()
        dictation.stop()
        await vi.waitFor(() => expect(dictation.status.value).toBe('transcribing'))

        dictation.cancel()
        resolveTranscription({ text: 'late transcript' })
        await new Promise((resolve) => setTimeout(resolve, 0))

        expect(dictation.status.value).toBe('idle')
        expect(onTranscript).not.toHaveBeenCalled()
    })

    it('releases the active microphone when disposed', async () => {
        const trackStop = vi.fn()
        getUserMedia.mockResolvedValueOnce({ getTracks: () => [{ stop: trackStop }] })
        const dictation = useTalosDictation({ onTranscript: vi.fn() })

        await dictation.start()
        dictation.dispose()

        expect(trackStop).toHaveBeenCalledTimes(1)
        expect(dictation.status.value).toBe('idle')
    })

    it('surfaces actionable recovery when microphone permission is denied', async () => {
        getUserMedia.mockRejectedValueOnce(new DOMException('Permission denied', 'NotAllowedError'))
        const dictation = useTalosDictation({ onTranscript: vi.fn() })
        await dictation.start()
        expect(dictation.status.value).toBe('error')
        expect(dictation.error.value).toBe('Microphone access is blocked. In your browser site controls, allow Microphone for TALOS, then try again.')
    })

    it('keeps a missing microphone visible and retryable', async () => {
        getUserMedia.mockRejectedValueOnce(new DOMException('Requested device not found', 'NotFoundError'))
        const dictation = useTalosDictation({ onTranscript: vi.fn() })

        await dictation.start()

        expect(dictation.status.value).toBe('error')
        expect(dictation.error.value).toBe('No microphone was detected. Connect or enable a microphone, then try again.')
    })

    it('keeps browser site recovery actionable for a nonstandard capture rejection', async () => {
        getUserMedia.mockRejectedValueOnce(new DOMException('Not supported', 'NotSupportedError'))
        const dictation = useTalosDictation({ onTranscript: vi.fn() })
        await dictation.start()
        expect(dictation.status.value).toBe('error')
        expect(dictation.error.value).toBe('TALOS could not access the microphone. Check your browser site controls, then try again.')
    })

    it('persists the dictation mode to localStorage', () => {
        const dictation = useTalosDictation({ onTranscript: vi.fn() })
        dictation.setMode('cloud')
        expect(dictation.mode.value).toBe('cloud')
        expect(window.localStorage.getItem('talos.dictation_mode')).toBe('cloud')
    })
})
