import { describe, expect, it } from 'vitest'
import {
    talosModelFit,
    talosResourceLedger,
    type TalosDeviceCapacity,
    type TalosKvCacheTypeOverride,
    type TalosModelShape,
} from '@/lib/models/fit'

/**
 * Model Lab, Blocco 1 — il ledger risorse.
 *
 * Non un secondo calcolo: una DECOMPOSIZIONE dello stesso conto che
 * `talosModelFit` già fa, voce per voce, ciascuna con la sua etichetta di
 * provenienza (`exact`/`predicted`/`policy`). Ogni prova qui sotto verifica
 * che il ledger torni COERENTE col verdetto — mai due numeri diversi per la
 * stessa domanda, che è esattamente il difetto che questa disciplina esiste
 * per impedire.
 */
const GIB = 1024 ** 3
const MIB = 1024 ** 2

const MODEL: TalosModelShape = {
    weightBytes: 4.68 * GIB,
    layers: 28,
    kvHeads: 4,
    headDim: 128,
    trainedContext: 131072,
    kvBytesPerElement: 2, // f16, come dichiarato dall'header in questo scenario
}

const DEVICE: TalosDeviceCapacity = {
    totalRamBytes: 12 * GIB,
    availableRamBytes: 8 * GIB,
    lowMemoryThresholdBytes: 512 * MIB,
    freeStorageBytes: 64 * GIB,
    memoryBandwidthBytesPerSecond: 20 * GIB,
    thermal: 'none',
    abiSupported: true,
}

function byLabel(rows: ReturnType<typeof talosResourceLedger>) {
    return Object.fromEntries(rows.map((row) => [row.label, row])) as Record<
        (typeof rows)[number]['label'], (typeof rows)[number]
    >
}

describe('talosResourceLedger — ogni riga etichettata, mai un numero senza dire da dove viene', () => {
    it('produce esattamente le otto voci dichiarate, una volta ciascuna', () => {
        const rows = talosResourceLedger({ model: MODEL, device: DEVICE, context: 8192 })
        const labels = rows.map((row) => row.label)
        expect(labels).toEqual([
            'weights', 'kvCache', 'compute', 'runtime', 'safetyMargin',
            'totalRuntime', 'availableRam', 'margin',
        ])
        expect(new Set(labels).size).toBe(labels.length)
    })

    it('pesi e cache KV, SENZA forzare il tipo, sono etichettati exact', () => {
        const { weights, kvCache } = byLabel(
            talosResourceLedger({ model: MODEL, device: DEVICE, context: 8192 }),
        )
        expect(weights.provenance).toBe('exact')
        expect(kvCache.provenance).toBe('exact')
    })

    it('la cache KV diventa predicted SOLO quando il tipo è stato forzato', () => {
        const { kvCache } = byLabel(
            talosResourceLedger({
                model: MODEL, device: DEVICE, context: 8192, kvCacheTypeOverride: 'q8_0',
            }),
        )
        expect(kvCache.provenance).toBe('predicted')
    })

    it('"auto" non forza niente: resta exact come se non fosse stato passato', () => {
        const { kvCache } = byLabel(
            talosResourceLedger({
                model: MODEL, device: DEVICE, context: 8192, kvCacheTypeOverride: 'auto',
            }),
        )
        expect(kvCache.provenance).toBe('exact')
    })

    it('compute, runtime e safety margin sono sempre policy — sono costanti nostre, non misure', () => {
        const { compute, runtime, safetyMargin } = byLabel(
            talosResourceLedger({ model: MODEL, device: DEVICE, context: 8192 }),
        )
        expect(compute.provenance).toBe('policy')
        expect(runtime.provenance).toBe('policy')
        expect(safetyMargin.provenance).toBe('policy')
    })

    it('la RAM disponibile del dispositivo è exact: viene sempre da una misura reale', () => {
        const { availableRam } = byLabel(
            talosResourceLedger({ model: MODEL, device: DEVICE, context: 8192 }),
        )
        expect(availableRam.bytes).toBe(DEVICE.availableRamBytes)
        expect(availableRam.provenance).toBe('exact')
    })

    /**
     * ⛔ Il controllo che conta davvero: il ledger non è un secondo calcolo che
     * può disallinearsi da `talosModelFit`. Le somme devono tornare esatte, non
     * "vicine".
     */
    it('la somma delle voci coincide ESATTAMENTE con requiredBytes e residentBytes del verdetto', () => {
        for (const override of [undefined, 'f16', 'q8_0'] as const) {
            const verdetto = talosModelFit({
                model: MODEL, device: DEVICE, context: 8192, fileBytes: MODEL.weightBytes + 8 * MIB,
                kvCacheTypeOverride: override,
            })
            const { kvCache, compute, runtime, safetyMargin, totalRuntime, margin } = byLabel(
                talosResourceLedger({
                    model: MODEL, device: DEVICE, context: 8192, kvCacheTypeOverride: override,
                }),
            )
            expect(kvCache.bytes).toBeCloseTo(verdetto.kvCacheBytes, 0)
            expect(kvCache.bytes + compute.bytes + runtime.bytes).toBeCloseTo(verdetto.requiredBytes, 0)
            expect(totalRuntime.bytes).toBeCloseTo(
                MODEL.weightBytes + verdetto.requiredBytes + safetyMargin.bytes, 0,
            )
            expect(DEVICE.availableRamBytes - DEVICE.lowMemoryThresholdBytes - verdetto.requiredBytes
                - safetyMargin.bytes - MODEL.weightBytes).toBeCloseTo(margin.bytes, 0)
            expect(DEVICE.availableRamBytes - DEVICE.lowMemoryThresholdBytes - verdetto.requiredBytes
                - safetyMargin.bytes).toBeCloseTo(verdetto.residentBytes, 0)
        }
    })

    /** AL CONTRARIO: un tipo non riconosciuto non produce righe mancanti o NaN, si comporta come f16. */
    it('un tipo non riconosciuto produce un ledger valido, identico a quello di f16', () => {
        const asF16 = talosResourceLedger({
            model: MODEL, device: DEVICE, context: 8192, kvCacheTypeOverride: 'f16',
        })
        // Cast, non un letterale nell'union: simula un valore persistito
        // corrotto — lo stesso caso di modelFit.test.ts.
        const corrotto = 'q4_0' as unknown as TalosKvCacheTypeOverride
        const unknown = talosResourceLedger({
            model: MODEL, device: DEVICE, context: 8192, kvCacheTypeOverride: corrotto,
        })
        expect(unknown).toEqual(asF16)
        expect(unknown.every((row) => Number.isFinite(row.bytes))).toBe(true)
    })
})
