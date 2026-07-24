import { afterEach, describe, expect, it, vi } from 'vitest'

// Deep-debug diagnostics (owner: "metti debug profondo in doctor, dobbiamo
// debuggare esattamente quello che succede, non andare alla cieca"). The report
// must carry a BUILD STAMP (which APK is running) and, on native, a full
// plugin-method inventory + raw native results — not just a pass/fail.
vi.mock('@capacitor/core', () => ({
    Capacitor: {
        isNativePlatform: () => false,
        isPluginAvailable: () => false,
    },
}))
vi.mock('@capgo/capacitor-speech-recognition', () => ({ SpeechRecognition: {} }))

import { talosDictationDiagnostics } from '@/services/dictation'

afterEach(() => { vi.unstubAllGlobals() })

describe('talosDictationDiagnostics deep report', () => {
    it('always carries a build stamp so we know EXACTLY which APK is running', async () => {
        vi.stubGlobal('__TALOS_BUILD_ID__', 'abc1234 @ 2026-07-24T10:00:00.000Z')
        const report = await talosDictationDiagnostics()
        expect(report.buildId).toBe('abc1234 @ 2026-07-24T10:00:00.000Z')
    })

    it('falls back to a non-empty build id when the stamp is absent (dev/test)', async () => {
        const report = await talosDictationDiagnostics()
        expect(typeof report.buildId).toBe('string')
        expect(report.buildId.length).toBeGreaterThan(0)
    })

    it('exposes the full deep shape (methods, raw results, step chain)', async () => {
        const report = await talosDictationDiagnostics()
        expect(report).toHaveProperty('native')
        expect(report).toHaveProperty('registered')
        expect(report).toHaveProperty('pluginLoaded')
        expect(report).toHaveProperty('methods')
        expect(Array.isArray(report.methods)).toBe(true)
        expect(report).toHaveProperty('permissionsRaw')
        expect(report).toHaveProperty('availableRaw')
        expect(report).toHaveProperty('available')
        expect(report).toHaveProperty('error')
    })
})
