// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest'

const { pipelineMock, transcriberMock } = vi.hoisted(() => {
    const transcriberMock = vi.fn(async () => ({ text: '  Ciao TALOS  ' }))
    return { transcriberMock, pipelineMock: vi.fn(async () => transcriberMock) }
})
vi.mock('@huggingface/transformers', () => ({ pipeline: pipelineMock }))

import { createTalosBrowserWhisperEngine } from './talosDictationBrowser'

class FakeAudioContext {
    constructor(_options?: unknown) {}
    async decodeAudioData(_buffer: ArrayBuffer) {
        return { getChannelData: (_channel: number) => new Float32Array(16000) }
    }
    async close() {}
}

afterEach(() => {
    pipelineMock.mockClear()
    transcriberMock.mockClear()
    delete (window as unknown as { AudioContext?: unknown }).AudioContext
})

describe('browser whisper engine', () => {
    it('reports available when Web Audio and WebAssembly exist', async () => {
        (window as unknown as { AudioContext: unknown }).AudioContext = FakeAudioContext
        const engine = createTalosBrowserWhisperEngine()
        expect(engine.id).toBe('browser-whisper')
        expect(await engine.isAvailable()).toBe(true)
    })

    it('decodes the clip to 16k mono samples and returns the trimmed transcript', async () => {
        (window as unknown as { AudioContext: unknown }).AudioContext = FakeAudioContext
        const engine = createTalosBrowserWhisperEngine()
        const result = await engine.transcribe(new Blob(['x'], { type: 'audio/webm' }), { language: 'it' })

        expect(result.text).toBe('Ciao TALOS')
        expect(transcriberMock).toHaveBeenCalledTimes(1)
        const [samples, options] = transcriberMock.mock.calls[0] as [Float32Array, Record<string, unknown>]
        expect(samples).toBeInstanceOf(Float32Array)
        expect(options).toMatchObject({ task: 'transcribe', language: 'it' })
    })

    it('raises a typed fault when the audio cannot be decoded', async () => {
        class BrokenAudioContext extends FakeAudioContext {
            async decodeAudioData() {
                throw new Error('bad audio')
            }
        }
        (window as unknown as { AudioContext: unknown }).AudioContext = BrokenAudioContext
        const engine = createTalosBrowserWhisperEngine()

        await expect(engine.transcribe(new Blob(['x'], { type: 'audio/webm' })))
            .rejects.toMatchObject({ code: 'TALOS_STT_AUDIO_INVALID' })
    })
})
