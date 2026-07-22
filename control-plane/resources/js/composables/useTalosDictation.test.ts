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
    static isTypeSupported() { return true }
    ondataavailable: ((event: { data: Blob }) => void) | null = null
    onstop: (() => void) | null = null
    state = 'inactive'
    constructor(public stream: unknown, public options?: unknown) {}
    start() { this.state = 'recording' }
    stop() {
        this.state = 'inactive'
        this.ondataavailable?.({ data: new Blob(['audio'], { type: 'audio/webm' }) })
        this.onstop?.()
    }
}

const getUserMedia = vi.fn()

// finalize() lazily `import()`s the engine module, so wait on the observable outcome
// rather than a fixed number of ticks (the dynamic import adds an extra async hop).
async function flushUntil(predicate: () => boolean, tries = 50) {
    for (let i = 0; i < tries && !predicate(); i += 1) {
        await Promise.resolve()
        await new Promise((resolve) => setTimeout(resolve, 0))
    }
}

beforeEach(() => {
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
        await flushUntil(() => transcribeMock.mock.calls.length > 0)

        expect(transcribeMock).toHaveBeenCalledTimes(1)
        expect(onTranscript).toHaveBeenCalledWith('ciao')
        expect(dictation.status.value).toBe('idle')
    })

    it('surfaces an error when microphone permission is denied', async () => {
        getUserMedia.mockRejectedValueOnce(new Error('denied'))
        const dictation = useTalosDictation({ onTranscript: vi.fn() })
        await dictation.start()
        expect(dictation.status.value).toBe('error')
        expect(dictation.error.value).toContain('microphone')
    })

    it('persists the dictation mode to localStorage', () => {
        const dictation = useTalosDictation({ onTranscript: vi.fn() })
        dictation.setMode('cloud')
        expect(dictation.mode.value).toBe('cloud')
        expect(window.localStorage.getItem('talos.dictation_mode')).toBe('cloud')
    })
})
