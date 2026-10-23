import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Il riscaldamento apriva sulla CPU un modello che la misura dava più veloce sull'NPU.
 *
 * ## MISURATO sul Pad il 22/10/2026 (APK di prova dal worktree, llama.cpp v0.7.0, condizioni NPU accettate)
 *
 * LFM2.5-2.6B-QAD-Q4_0.gguf: `qualifyBackend` → `decisionBackend:'hexagon', decisionReason:'faster'`;
 * `localPerformanceProfiles` → CPU (scrittura 26,94, lettura 103,4) e hexagon/HTP0 (scrittura 25,90, lettura 1298,9),
 * entrambi CORRECT. Riavvio dell'app, scelta del modello nel compositore: la prova risponde «niente da misurare» e il
 * riscaldamento apre con `offloaded 0/31 layers`, cioè sulla CPU.
 *
 * ## La causa
 *
 * `backendDelRiscaldamento` raccoglieva preferenza, registry, offload e profili, ma NON il formato dei pesi. Senza formato
 * `talosLocalBackendOptions` mette l'NPU fuori («l'incertezza non è un permesso»), il profilo hexagon viene scartato e fra
 * quelli rimasti vince la CPU. L'adattatore della chat lo legge (`talosLocalModelQuantisation`); il riscaldamento no.
 */

const bridge = vi.hoisted(() => ({
    open: vi.fn(),
    available: vi.fn(),
    localPerformanceProfiles: vi.fn(),
    modelFormat: vi.fn(),
    close: vi.fn(),
    cancelQualification: vi.fn(),
    addListener: vi.fn(),
}))

vi.mock('@capacitor/core', () => ({
    registerPlugin: () => bridge,
    Capacitor: { isNativePlatform: () => true },
}))

// «Automatico»: nessuna scelta salvata.
vi.mock('@capacitor/preferences', () => ({
    Preferences: {
        get: vi.fn(async () => ({ value: null })),
        set: vi.fn(async () => undefined),
        remove: vi.fn(async () => undefined),
    },
}))

const { talosWarmLocalModel } = await import('@/services/localEngine')

const LFM = '/data/user/0/ai.talos.dev/files/models/LiquidAI/LFM2.5-2.6B-GGUF/LFM2.5-2.6B-QAD-Q4_0.gguf'

/** I due profili come li ha restituiti `localPerformanceProfiles` sul Pad. */
const PROFILI_DEL_PAD = [
    {
        backendRegistry: 'CPU', backendDevice: null, outcome: 'CORRECT',
        ttftMs: 5_002, decodeTokPerSec: 26.94, prefillTokPerSec: 103.4, openMs: -1,
        qualificationLevel: 'Q1', measuredAtMs: 1_761_100_000_000,
    },
    {
        backendRegistry: 'hexagon', backendDevice: 'HTP0', outcome: 'CORRECT',
        ttftMs: 501, decodeTokPerSec: 25.90, prefillTokPerSec: 1298.9, openMs: -1,
        qualificationLevel: 'Q1', measuredAtMs: 1_761_100_000_000,
    },
]

beforeEach(() => {
    bridge.open.mockReset().mockResolvedValue({ contextTokens: 4096 })
    bridge.available.mockReset().mockResolvedValue({
        available: true, backends: 'CPU,OpenCL,HTP', loadedPath: null, offloadDevices: 2,
    })
    bridge.localPerformanceProfiles.mockReset().mockResolvedValue({ profiles: PROFILI_DEL_PAD })
    // `general.file_type = 2` è Q4_0, il formato che l'NPU mangia.
    bridge.modelFormat.mockReset().mockResolvedValue({ format: JSON.stringify({ fileType: 2 }) })
})

describe('il riscaldamento dopo un riavvio, con le due misure in mano', () => {
    it('apre sull’NPU che la misura ha dato più veloce, nominandola', async () => {
        const esito = await talosWarmLocalModel(LFM)

        expect(esito).toMatchObject({ opened: true, withoutMeasuredProfiles: false })
        expect(bridge.open).toHaveBeenCalledTimes(1)
        expect(bridge.open.mock.calls[0]![0]).toMatchObject({ path: LFM, gpuLayers: -1, backend: 'HTP' })
    })

    it('AL CONTRARIO — su un formato che l’NPU non mangia resta fuori, anche con la sua misura', async () => {
        // `general.file_type = 14` è Q4_K_S: fuori dall'elenco misurato (`TALOS_FORMATI_PER_NPU`).
        bridge.modelFormat.mockResolvedValue({ format: JSON.stringify({ fileType: 14 }) })

        await talosWarmLocalModel(`${LFM}.altro`)

        expect(bridge.open.mock.calls[0]![0]).toMatchObject({ gpuLayers: 0 })
        expect(bridge.open.mock.calls[0]![0]).not.toHaveProperty('backend')
    })
})
