import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * ⭐ Punto 2 (01/10/2026) — i programmi della GPU pronti prima del primo uso.
 *
 * Misurato sul Pad: la prima apertura GPU dopo ogni aggiornamento costava 52 s, di cui 41 per compilare. Owner
 * 01/10: precompilazione «Alla prima partenza», solo se c'è almeno un modello locale; e una riga onesta mentre la
 * GPU compila, solo in quel caso.
 */

const ponte = vi.hoisted(() => ({
    installed: vi.fn(),
    prepareGpu: vi.fn(),
    loadProgress: vi.fn(),
}))

vi.mock('@capacitor/core', () => ({
    registerPlugin: () => ponte,
    Capacitor: { isNativePlatform: () => true, getPlatform: () => 'android' },
}))

vi.mock('@capacitor/preferences', () => ({
    Preferences: { get: vi.fn(async () => ({ value: null })), set: vi.fn(async () => {}) },
}))

const { talosPrepareGpuInBackground, talosLocalModelLoadState } = await import('@/services/localEngine')

const MODELLO = { path: '/m/qwen.gguf', name: 'qwen.gguf', bytes: 2_497_281_312, modifiedAt: 1 }

describe('GPU pronta — la precompilazione in sottofondo', () => {
    beforeEach(() => {
        ponte.installed.mockReset()
        ponte.prepareGpu.mockReset()
        ponte.loadProgress.mockReset()
    })

    it('GPU-07a senza modelli locali non compila niente', async () => {
        ponte.installed.mockResolvedValue({ models: [], unreadable: [] })
        expect(await talosPrepareGpuInBackground()).toBe('no-local-models')
        expect(ponte.prepareGpu).not.toHaveBeenCalled()
    })

    it('GPU-07b con un modello locale chiede al motore di preparare la GPU, una volta', async () => {
        ponte.installed.mockResolvedValue({ models: [MODELLO], unreadable: [] })
        ponte.prepareGpu.mockResolvedValue({ state: 'prepared', ms: 41_000 })
        expect(await talosPrepareGpuInBackground()).toBe('prepared')
        expect(ponte.prepareGpu).toHaveBeenCalledTimes(1)
    })

    it('GPU-12 passa al motore i modelli GGUF installati, perché li riscaldi', async () => {
        ponte.installed.mockResolvedValue({ models: [MODELLO, { ...MODELLO, path: '/m/note.txt', name: 'note.txt' }], unreadable: [] })
        ponte.prepareGpu.mockResolvedValue({ state: 'prepared', ms: 9_000 })
        await talosPrepareGpuInBackground()
        expect(ponte.prepareGpu).toHaveBeenCalledWith({ models: ['/m/qwen.gguf'] })
    })

    it('GPU-07c un ponte che cade non rompe l\'avvio', async () => {
        ponte.installed.mockResolvedValue({ models: [MODELLO], unreadable: [] })
        ponte.prepareGpu.mockRejectedValue(new Error('bridge'))
        expect(await talosPrepareGpuInBackground()).toBe('error')
    })
})

describe('GPU pronta — lo stato del caricamento', () => {
    // ⛔ Le graffe servono: un valore restituito da beforeEach vitest lo chiama come pulizia.
    beforeEach(() => { ponte.loadProgress.mockReset() })

    it('GPU-08a mentre la GPU compila lo dice, anche senza percentuale', async () => {
        ponte.loadProgress.mockResolvedValue({ permille: -1, loading: false, gpuPreparing: true })
        expect(await talosLocalModelLoadState()).toEqual({ fraction: null, preparingGpu: true })
    })

    it('GPU-08b un nativo vecchio (senza il campo) vale «non compila»', async () => {
        ponte.loadProgress.mockResolvedValue({ permille: 500, loading: true })
        expect(await talosLocalModelLoadState()).toEqual({ fraction: 0.5, preparingGpu: false })
    })

    it('GPU-08c un ponte che non risponde è «non lo so»', async () => {
        ponte.loadProgress.mockRejectedValue(new Error('bridge'))
        expect(await talosLocalModelLoadState()).toEqual({ fraction: null, preparingGpu: false })
    })
})
