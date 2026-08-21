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
} = await import('@/services/personalVoice')

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
})
