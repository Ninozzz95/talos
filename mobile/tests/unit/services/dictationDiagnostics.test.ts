import { afterEach, describe, expect, it, vi } from 'vitest'

// Deep-debug diagnostics (owner: "metti debug profondo in doctor, dobbiamo
// debuggare esattamente quello che succede, non andare alla cieca"). The report
// must carry a BUILD STAMP (which APK is running) and, on native, a full
// plugin-method inventory + raw native results — not just a pass/fail.
//
// R-mic ROOT CAUSE (device Doctor: resolve:FAIL TIMEOUT on a STATIC return):
// a Capacitor plugin proxy is THENABLE — its get-trap returns a caller
// function for ANY property, including `then`. So `await pluginProxy` /
// `Promise.resolve(pluginProxy)` calls `proxy.then(...)`, which the bridge
// forwards as a native method "then" that never answers → hang. The engine
// and diagnostics must therefore NEVER await the plugin OBJECT (only its
// method results). This mock reproduces that thenable proxy.
const platform = vi.hoisted(() => ({ native: false }))
const thenableProxy = vi.hoisted(() => new Proxy({}, {
    get(_t, prop) {
        if (prop === 'checkPermissions') return () => Promise.resolve({ speechRecognition: 'granted' })
        if (prop === 'available') return () => Promise.resolve({ available: true })
        if (prop === 'getPluginVersion') return () => Promise.resolve({ version: '8.1.7' })
        if (prop === 'start' || prop === 'stop' || prop === 'addListener' || prop === 'removeAllListeners') return () => Promise.resolve()
        // The lethal part: `then` is a function → the object is thenable, and
        // calling it NEVER settles (mirrors the native bridge hang).
        if (prop === 'then') return () => {}
        return undefined
    },
}))
vi.mock('@capacitor/core', () => ({
    Capacitor: {
        isNativePlatform: () => platform.native,
        isPluginAvailable: () => true,
    },
}))
vi.mock('@capgo/capacitor-speech-recognition', () => ({ SpeechRecognition: thenableProxy }))

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

    it('R-mic: native diagnostics resolve WITHOUT hanging on the thenable plugin proxy', async () => {
        platform.native = true
        vi.useFakeTimers()
        try {
            const settled = talosDictationDiagnostics().then((r) => r, (e) => e)
            // If any step awaited the plugin OBJECT, its `then` would hang and
            // only the fences (≥3s) could end it. Advance a tiny amount: the
            // report must already be resolving because nothing awaits the proxy.
            await vi.advanceTimersByTimeAsync(50)
            const report = await settled
            expect(report.registered).toBe(true)
            expect(report.pluginLoaded).toBe(true)
            expect(report.methods).toContain('available')
            expect(report.methods).toContain('checkPermissions')
            // The `then` trap must NEVER be inventoried as a real method.
            expect(report.methods).not.toContain('then')
            expect(report.available).toBe(true)
            expect(report.error).not.toMatch(/resolve:FAIL/)
        } finally {
            vi.useRealTimers()
            platform.native = false
        }
    })
})
