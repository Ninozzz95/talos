// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { requestTalosDictationCapture } from './talosDictationCapture'

class FakeMediaRecorder {
    static latest: FakeMediaRecorder | null = null
    static isTypeSupported(type: string) { return type === 'audio/webm;codecs=opus' }

    ondataavailable: ((event: { data: Blob }) => void) | null = null
    onstop: (() => void) | null = null
    onerror: ((event: { error: Error }) => void) | null = null
    state: RecordingState = 'inactive'
    stopCalls = 0
    deferStopEvents = false

    constructor(public stream: MediaStream, public options?: MediaRecorderOptions) {
        FakeMediaRecorder.latest = this
    }

    start() { this.state = 'recording' }

    stop() {
        this.stopCalls += 1
        this.state = 'inactive'
        if (this.deferStopEvents) return
        this.flushStop()
    }

    flushStop() {
        this.ondataavailable?.({ data: new Blob(['recorded-audio'], { type: 'audio/webm;codecs=opus' }) })
        this.onstop?.()
    }

    fail(error = new Error('Recorder hardware failed')) {
        this.state = 'inactive'
        this.onerror?.({ error })
    }
}

const getUserMedia = vi.fn()
const firstTrackStop = vi.fn()
const secondTrackStop = vi.fn()

beforeEach(() => {
    FakeMediaRecorder.latest = null
    firstTrackStop.mockReset()
    secondTrackStop.mockReset()
    getUserMedia.mockReset()
    getUserMedia.mockResolvedValue({
        getTracks: () => [{ stop: firstTrackStop }, { stop: secondTrackStop }],
    })
    vi.stubGlobal('MediaRecorder', FakeMediaRecorder)
    Object.defineProperty(navigator, 'mediaDevices', { value: { getUserMedia }, configurable: true })
})

afterEach(() => {
    vi.unstubAllGlobals()
})

describe('talosDictationCapture', () => {
    it('finishes exactly once and releases every media track', async () => {
        const session = await requestTalosDictationCapture()

        expect(getUserMedia).toHaveBeenCalledWith({ audio: true })
        expect(FakeMediaRecorder.latest?.state).toBe('recording')

        const firstFinish = session.finish()
        const secondFinish = session.finish()

        expect(secondFinish).toBe(firstFinish)
        await expect(firstFinish).resolves.toEqual(expect.objectContaining({
            size: expect.any(Number),
            type: 'audio/webm;codecs=opus',
        }))
        expect(FakeMediaRecorder.latest?.stopCalls).toBe(1)
        expect(firstTrackStop).toHaveBeenCalledTimes(1)
        expect(secondTrackStop).toHaveBeenCalledTimes(1)
    })

    it('waits for queued recorder data when Finish is pressed twice', async () => {
        const session = await requestTalosDictationCapture()
        const recorder = FakeMediaRecorder.latest!
        recorder.deferStopEvents = true

        const firstFinish = session.finish()
        const secondFinish = session.finish()

        expect(secondFinish).toBe(firstFinish)
        expect(recorder.stopCalls).toBe(1)
        let settled = false
        void firstFinish.then(() => { settled = true })
        await Promise.resolve()
        expect(settled).toBe(false)

        recorder.flushStop()
        await expect(firstFinish).resolves.toEqual(expect.objectContaining({
            size: new Blob(['recorded-audio']).size,
            type: 'audio/webm;codecs=opus',
        }))
    })

    it('reports a recorder failure before Finish and observes the pending rejection', async () => {
        const onError = vi.fn()
        const session = await requestTalosDictationCapture({ onError })
        const recorderError = new Error('Recorder hardware failed')

        FakeMediaRecorder.latest!.fail(recorderError)

        expect(onError).toHaveBeenCalledWith(recorderError)
        await expect(session.finish()).rejects.toBe(recorderError)
        expect(firstTrackStop).toHaveBeenCalledTimes(1)
        expect(secondTrackStop).toHaveBeenCalledTimes(1)
    })

    it('cancels without returning recorded chunks', async () => {
        const session = await requestTalosDictationCapture()

        session.cancel()

        await expect(session.finish()).resolves.toBeNull()
        expect(FakeMediaRecorder.latest?.stopCalls).toBe(1)
        expect(firstTrackStop).toHaveBeenCalledTimes(1)
        expect(secondTrackStop).toHaveBeenCalledTimes(1)
    })
})
