// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest'

const { talosFetchMock } = vi.hoisted(() => ({ talosFetchMock: vi.fn() }))
vi.mock('./api', async () => {
    const actual = await vi.importActual<typeof import('./api')>('./api')
    return { ...actual, talosFetch: talosFetchMock }
})

import { TalosApiError } from './api'
import {
    TALOS_DICTATION_MODE_OPTIONS,
    TalosDictationError,
    createTalosServerWhisperEngine,
    resolveTalosDictationEngine,
    talosDictationFaultFrom,
} from './talosDictation'

afterEach(() => {
    talosFetchMock.mockReset()
})

describe('talosDictationFaultFrom', () => {
    it('maps a known TALOS_STT_* control-plane fault to a typed dictation error', () => {
        const fault = talosDictationFaultFrom(new TalosApiError('rate limited', {
            details: { error: { code: 'TALOS_STT_RATE_LIMITED' } },
        }))
        expect(fault).toBeInstanceOf(TalosDictationError)
        expect(fault.code).toBe('TALOS_STT_RATE_LIMITED')
    })

    it('collapses unknown errors to TALOS_STT_UNKNOWN', () => {
        expect(talosDictationFaultFrom(new Error('boom')).code).toBe('TALOS_STT_UNKNOWN')
    })

    it('passes an already-typed dictation error through unchanged', () => {
        const original = new TalosDictationError('TALOS_STT_TIMEOUT', 'timeout')
        expect(talosDictationFaultFrom(original)).toBe(original)
    })
})

describe('server whisper engine', () => {
    it('reports unavailable when the health check throws', async () => {
        talosFetchMock.mockRejectedValueOnce(new Error('network'))
        const engine = createTalosServerWhisperEngine()
        expect(engine.id).toBe('server-whisper')
        expect(await engine.isAvailable()).toBe(false)
    })

    it('reports available when health says so', async () => {
        talosFetchMock.mockResolvedValueOnce({ available: true })
        expect(await createTalosServerWhisperEngine().isAvailable()).toBe(true)
    })

    it('transcribes by posting multipart audio and normalises the response', async () => {
        talosFetchMock.mockResolvedValueOnce({ text: 'ciao', language: 'it', duration_ms: 1200 })
        const result = await createTalosServerWhisperEngine().transcribe(new Blob(['x'], { type: 'audio/webm' }), { language: 'it' })
        expect(result).toEqual({ text: 'ciao', language: 'it', durationMs: 1200 })

        const [url, init] = talosFetchMock.mock.calls[0] as [string, RequestInit]
        expect(String(url)).toContain('/api/talos/stt/transcribe')
        expect(init.method).toBe('POST')
        expect(init.body).toBeInstanceOf(FormData)
    })

    it('maps a control-plane STT fault when transcription fails', async () => {
        talosFetchMock.mockRejectedValueOnce(new TalosApiError('too long', {
            details: { error: { code: 'TALOS_STT_AUDIO_TOO_LONG' } },
        }))
        await expect(createTalosServerWhisperEngine().transcribe(new Blob(['x'], { type: 'audio/webm' })))
            .rejects.toMatchObject({ code: 'TALOS_STT_AUDIO_TOO_LONG' })
    })
})

describe('dictation modes', () => {
    it('exposes local, cloud and auto', () => {
        expect(TALOS_DICTATION_MODE_OPTIONS.map((option) => option.value)).toEqual(['local', 'cloud', 'auto'])
    })
})

describe('resolveTalosDictationEngine', () => {
    it('uses the server engine for cloud mode', async () => {
        expect((await resolveTalosDictationEngine('cloud')).id).toBe('server-whisper')
    })

    it('uses the on-device engine for local mode', async () => {
        expect((await resolveTalosDictationEngine('local')).id).toBe('browser-whisper')
    })

    it('prefers the reachable server engine in auto mode', async () => {
        talosFetchMock.mockResolvedValueOnce({ available: true })
        expect((await resolveTalosDictationEngine('auto')).id).toBe('server-whisper')
    })

    it('falls back to on-device in auto mode when the server is down', async () => {
        talosFetchMock.mockRejectedValueOnce(new Error('down'))
        expect((await resolveTalosDictationEngine('auto')).id).toBe('browser-whisper')
    })
})
