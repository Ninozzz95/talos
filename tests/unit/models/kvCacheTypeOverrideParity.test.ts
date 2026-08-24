import { describe, expect, it } from 'vitest'
import { talosKvBytesPerElement, TALOS_KV_BYTES_PER_ELEMENT } from '@/services/localEngine'
import { talosModelFit, type TalosKvCacheTypeOverride } from '@/lib/models/fit'

/**
 * `fit.ts` porta una copia DELIBERATA della tabella byte-per-elemento che
 * vive in `services/localEngine.ts` (vedi il commento su
 * `kvBytesPerElementForOverride` in fit.ts sul perché non è un import).
 *
 * Una copia che nessuno controlla è una copia che diverge in silenzio: questo
 * file chiama ENTRAMBE le fonti sullo stesso input e pretende lo stesso
 * numero. Se un giorno il motore reale imparasse un terzo tipo di cache, e
 * `fit.ts` non venisse aggiornato insieme, è QUESTO test a fallire — non un
 * bug scoperto sul Pad mesi dopo.
 */
const MODEL = {
    weightBytes: 4_680_000_000,
    layers: 28,
    kvHeads: 4,
    headDim: 128,
    trainedContext: 131_072,
    kvBytesPerElement: 2, // simula un header letto in f16, cosi' l'override si vede
}

const DEVICE = {
    totalRamBytes: 12_000_000_000,
    availableRamBytes: 8_000_000_000,
    lowMemoryThresholdBytes: 512_000_000,
    freeStorageBytes: 64_000_000_000,
    memoryBandwidthBytesPerSecond: 20_000_000_000,
    thermal: 'none' as const,
    abiSupported: true,
}

describe('la copia in fit.ts e la tabella reale di localEngine.ts non divergono', () => {
    it('f16 e q8_0 pesano lo stesso in entrambe le fonti', () => {
        expect(TALOS_KV_BYTES_PER_ELEMENT.f16).toBe(2)
        expect(TALOS_KV_BYTES_PER_ELEMENT.q8_0).toBeCloseTo(34 / 32, 10)
    })

    it('un tipo forzato in talosModelFit produce la STESSA cache KV che talosKvBytesPerElement predirebbe', () => {
        const context = 8192
        for (const override of ['f16', 'q8_0'] as const) {
            const atteso = talosKvBytesPerElement(override)
                * MODEL.layers * MODEL.kvHeads * MODEL.headDim * 2 * context
            const esito = talosModelFit({
                model: MODEL, device: DEVICE, context, fileBytes: MODEL.weightBytes,
                kvCacheTypeOverride: override,
            })
            expect(esito.kvCacheBytes).toBeCloseTo(atteso, 0)
        }
    })

    it('un tipo non riconosciuto (simulando un valore persistito corrotto) vale f16 in entrambe le fonti', () => {
        const corrotto = 'q4_0' as TalosKvCacheTypeOverride
        const context = 4096
        const attesoDaMotore = talosKvBytesPerElement('q4_0')
            * MODEL.layers * MODEL.kvHeads * MODEL.headDim * 2 * context
        const esito = talosModelFit({
            model: MODEL, device: DEVICE, context, fileBytes: MODEL.weightBytes,
            kvCacheTypeOverride: corrotto,
        })
        expect(esito.kvCacheBytes).toBeCloseTo(attesoDaMotore, 0)
    })
})
