import { beforeEach, describe, expect, it, vi } from 'vitest'

const bridge = vi.hoisted(() => ({
    status: vi.fn(),
    profiles: vi.fn(),
    renameProfile: vi.fn(),
    deleteProfile: vi.fn(),
    speak: vi.fn(),
    stop: vi.fn(),
    addListener: vi.fn(),
}))

vi.mock('@capacitor/core', () => ({
    registerPlugin: () => bridge,
}))

const {
    talosPersonalVoiceStatus,
    talosPersonalVoiceProfiles,
    talosSpeakForReading,
} = await import('@/services/personalVoice')

const PROFILE_ID = 'a1b2c3d4-e5f6-4789-a012-3456789abcde'
const READY_PROFILES = {
    profiles: [
        { id: PROFILE_ID, name: 'Antonino', language: 'it-IT', style: 'neutral', engineBuild: 'x'.repeat(64), compatible: true, createdAtEpochMs: 0, enrollmentDurationMs: 0 },
    ],
}

describe('personalVoice service', () => {
    beforeEach(() => {
        bridge.status.mockReset()
        bridge.profiles.mockReset()
    })

    // §40's own contract: ready means installed AND at least one COMPATIBLE
    // profile - not just "the model files are there".
    it('PVOICE-STATUS-01 not ready when installed but every saved profile is incompatible', async () => {
        bridge.status.mockResolvedValue({ supported: true, installed: true })
        bridge.profiles.mockResolvedValue({
            profiles: [
                { id: 'a', name: 'A', language: 'it-IT', style: 'neutral', engineBuild: 'x', compatible: false, createdAtEpochMs: 0, enrollmentDurationMs: 0 },
            ],
        })
        const status = await talosPersonalVoiceStatus()
        expect(status).toEqual({ supported: true, installed: true, ready: false, active: false, failure: undefined })
    })

    it('PVOICE-STATUS-02 ready when at least one saved profile is compatible', async () => {
        bridge.status.mockResolvedValue({ supported: true, installed: true })
        bridge.profiles.mockResolvedValue({
            profiles: [
                { id: 'a', name: 'A', language: 'it-IT', style: 'neutral', engineBuild: 'x', compatible: false, createdAtEpochMs: 0, enrollmentDurationMs: 0 },
                { id: 'b', name: 'B', language: 'it-IT', style: 'neutral', engineBuild: 'y', compatible: true, createdAtEpochMs: 0, enrollmentDurationMs: 0 },
            ],
        })
        const status = await talosPersonalVoiceStatus()
        expect(status.ready).toBe(true)
    })

    it('PVOICE-STATUS-03 not installed short-circuits without a second bridge call', async () => {
        bridge.status.mockResolvedValue({ supported: false, installed: false, failure: 'model files missing' })
        const status = await talosPersonalVoiceStatus()
        expect(status).toEqual({ supported: false, installed: false, ready: false, active: false, failure: 'model files missing' })
        expect(bridge.profiles).not.toHaveBeenCalled()
    })

    it('PVOICE-STATUS-04 a thrown bridge error reads as fully unsupported, never as a crash', async () => {
        bridge.status.mockRejectedValue(new Error('bridge unavailable'))
        const status = await talosPersonalVoiceStatus()
        expect(status).toEqual({ supported: false, installed: false, ready: false, active: false })
    })

    it('PVOICE-PROFILES-01 a thrown bridge error reads as an empty list, not a crash', async () => {
        bridge.profiles.mockRejectedValue(new Error('bridge unavailable'))
        await expect(talosPersonalVoiceProfiles()).resolves.toEqual([])
    })

    // talosSpeakForReading - the real router decision through to the real
    // bridge call, the piece useTalosSpeech.test.ts mocks away entirely so
    // THIS file is where that wiring actually gets exercised end to end.
    describe('talosSpeakForReading', () => {
        beforeEach(() => {
            bridge.speak.mockReset()
        })

        it('system engine never touches the bridge at all', async () => {
            const spoken = await talosSpeakForReading('system', PROFILE_ID, 'Ciao', { rate: 1, pitch: 1 })
            expect(spoken).toBe(false)
            expect(bridge.status).not.toHaveBeenCalled()
            expect(bridge.speak).not.toHaveBeenCalled()
        })

        it('personal engine with no chosen profile falls back without touching the bridge', async () => {
            const spoken = await talosSpeakForReading('personal', null, 'Ciao', { rate: 1, pitch: 1 })
            expect(spoken).toBe(false)
            expect(bridge.speak).not.toHaveBeenCalled()
        })

        it('personal engine not ready (no compatible profile) falls back, speak() never called', async () => {
            bridge.status.mockResolvedValue({ supported: true, installed: true })
            bridge.profiles.mockResolvedValue({ profiles: [] })
            const spoken = await talosSpeakForReading('personal', PROFILE_ID, 'Ciao', { rate: 1, pitch: 1 })
            expect(spoken).toBe(false)
            expect(bridge.speak).not.toHaveBeenCalled()
        })

        it('personal engine ready calls the real bridge speak() with the resolved profile and reports true', async () => {
            bridge.status.mockResolvedValue({ supported: true, installed: true })
            bridge.profiles.mockResolvedValue(READY_PROFILES)
            bridge.speak.mockResolvedValue({ accepted: true })
            const spoken = await talosSpeakForReading('personal', PROFILE_ID, 'Ciao', { rate: 1, pitch: 1 })
            expect(spoken).toBe(true)
            expect(bridge.speak).toHaveBeenCalledWith(expect.objectContaining({
                text: 'Ciao', profileId: PROFILE_ID, rate: 1, pitch: 1,
            }))
        })

        it('the reading id passed to the bridge is unique per call, so two readings never share a completion event', async () => {
            bridge.status.mockResolvedValue({ supported: true, installed: true })
            bridge.profiles.mockResolvedValue(READY_PROFILES)
            bridge.speak.mockResolvedValue({ accepted: true })
            await talosSpeakForReading('personal', PROFILE_ID, 'One', { rate: 1, pitch: 1 })
            await talosSpeakForReading('personal', PROFILE_ID, 'Two', { rate: 1, pitch: 1 })
            const [firstCall, secondCall] = bridge.speak.mock.calls
            expect(firstCall[0].readingId).not.toBe(secondCall[0].readingId)
        })
    })
})
