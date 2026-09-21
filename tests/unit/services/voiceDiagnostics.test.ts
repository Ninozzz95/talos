import { beforeEach, describe, expect, it, vi } from 'vitest'

const bridge = vi.hoisted(() => ({
    beginDiagnostics: vi.fn(),
    endDiagnostics: vi.fn(),
    exportDiagnostics: vi.fn(),
}))

vi.mock('@capacitor/core', () => ({
    registerPlugin: () => bridge,
}))

const {
    talosBeginVoiceDiagnostics,
    talosEndVoiceDiagnostics,
    talosExportVoiceDiagnostics,
} = await import('@/services/voiceDiagnostics')

describe('voiceDiagnostics production bridge', () => {
    beforeEach(() => {
        bridge.beginDiagnostics.mockReset()
        bridge.endDiagnostics.mockReset()
        bridge.exportDiagnostics.mockReset()
    })

    it('VOICE-DIAG-TS-01 arms the native recorder with the immutable product route, not text or audio', async () => {
        bridge.beginDiagnostics.mockResolvedValue({ armed: true })
        const route = {
            traceId: 'voice-018fc5d8-4f44-7c22-8df1-3d15a1000001',
            readingId: 'assistant-message-42',
            source: 'chat' as const,
            requestedLocale: 'it-IT',
            requestedEngine: 'personal' as const,
            requestedProfileId: 'a1b2c3d4-e5f6-4789-a012-3456789abcde',
            appCommit: 'a'.repeat(40),
            expectedApkSha256: 'b'.repeat(64),
            usbTransportProof: 'USB\\VID_22D9&PID_2769\\deadbeef',
        }

        await expect(talosBeginVoiceDiagnostics(route, 'deadbeef')).resolves.toEqual({ armed: true })
        expect(bridge.beginDiagnostics).toHaveBeenCalledWith(route)
        expect(JSON.stringify(bridge.beginDiagnostics.mock.calls[0])).not.toContain('text')
        expect(JSON.stringify(bridge.beginDiagnostics.mock.calls[0])).not.toContain('pcm')
    })

    it('VOICE-DIAG-TS-02 malformed trace ids fail before the native bridge', async () => {
        await expect(talosBeginVoiceDiagnostics({
            traceId: '../voice.json',
            readingId: 'r1',
            source: 'assistant',
            requestedLocale: 'it-IT',
            requestedEngine: 'personal',
            requestedProfileId: null,
            appCommit: 'a'.repeat(40),
            expectedApkSha256: 'b'.repeat(64),
            usbTransportProof: 'USB\\VID_22D9&PID_2769\\deadbeef',
        }, 'deadbeef')).rejects.toThrow(/traceId/)
        expect(bridge.beginDiagnostics).not.toHaveBeenCalled()
    })

    it('VOICE-DIAG-TS-02B a missing or malformed authorizedUsbSerial fails before the native bridge, even with a proof that would otherwise match', async () => {
        const route = {
            traceId: 'voice-018fc5d8-4f44-7c22-8df1-3d15a1000002',
            readingId: 'assistant-message-43',
            source: 'chat' as const,
            requestedLocale: 'it-IT',
            requestedEngine: 'personal' as const,
            requestedProfileId: null,
            appCommit: 'a'.repeat(40),
            expectedApkSha256: 'b'.repeat(64),
            usbTransportProof: 'USB\\VID_22D9&PID_2769\\deadbeef',
        }
        await expect(talosBeginVoiceDiagnostics(route, '')).rejects.toThrow(/authorizedUsbSerial/)
        await expect(talosBeginVoiceDiagnostics(route, 'not a serial!')).rejects.toThrow(/authorizedUsbSerial/)
        expect(bridge.beginDiagnostics).not.toHaveBeenCalled()
    })

    it('VOICE-DIAG-TS-03 end and export preserve the native artifact identity', async () => {
        bridge.endDiagnostics.mockResolvedValue({
            traceId: 'voice-run-1',
            artifactPath: '/storage/emulated/0/Android/data/ai.talos/files/research/voice/voice-run-1.json',
            eventCount: 17,
        })
        bridge.exportDiagnostics.mockResolvedValue({
            traceId: 'voice-run-1',
            artifactPath: '/storage/emulated/0/Android/data/ai.talos/files/research/voice/voice-run-1.json',
        })

        await expect(talosEndVoiceDiagnostics('voice-run-1')).resolves.toMatchObject({ eventCount: 17 })
        await expect(talosExportVoiceDiagnostics('voice-run-1')).resolves.toMatchObject({ traceId: 'voice-run-1' })
        expect(bridge.endDiagnostics).toHaveBeenCalledWith({ traceId: 'voice-run-1' })
        expect(bridge.exportDiagnostics).toHaveBeenCalledWith({ traceId: 'voice-run-1' })
    })
})
