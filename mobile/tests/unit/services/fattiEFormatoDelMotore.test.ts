import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Revisione avversaria del 22/10/2026 — due letture del ponte che trasformavano un «non lo so» in una risposta.
 *
 *  - Rilievo 3: `talosLocalEngineBackendFacts` scriveva `gpuLayersEffective: 0` quando il ponte non lo diceva (plugin che
 *    lancia, istantanea malformata: `TalosLlamaPlugin.available` OMETTE il campo apposta). Con `backendDevice: null` è la
 *    stessa faccia di «gira sulla CPU», e `talosLocalBackendKindOpen` ne faceva una certezza ⇒ riapertura inutile.
 *  - Rilievo 14: `talosLocalModelQuantisation` metteva in cache `null` anche dopo un errore passeggero di `modelFormat`;
 *    ora la legge anche il riscaldamento, e senza formato l'NPU resta fuori fino al riavvio.
 */

const bridge = vi.hoisted(() => ({
    available: vi.fn(),
    modelFormat: vi.fn(),
    addListener: vi.fn(),
}))

vi.mock('@capacitor/core', () => ({
    registerPlugin: () => bridge,
    Capacitor: { isNativePlatform: () => true },
}))

const { talosLocalEngineBackendFacts, talosLocalModelQuantisation } = await import('@/services/localEngine')
const { talosLocalBackendKindOpen } = await import('@/lib/models/localBackendChoice')

beforeEach(() => {
    bridge.available.mockReset()
    bridge.modelFormat.mockReset()
})

describe('FATTI-01 dove gira il modello aperto: «non lo so» resta «non lo so»', () => {
    it('il ponte che lancia non diventa «CPU»', async () => {
        bridge.available.mockRejectedValue(new Error('ponte assente'))

        const fatti = await talosLocalEngineBackendFacts()

        expect(fatti.gpuLayersEffective).toBeNull()
        expect(talosLocalBackendKindOpen(fatti)).toBeNull()
    })

    it('l’istantanea senza `gpuLayersEffective` (malformata: il nativo omette il campo) non diventa «CPU»', async () => {
        bridge.available.mockResolvedValue({ available: true, backends: 'CPU,HTP', loadedPath: '/m.gguf', offloadDevices: 1 })

        expect(talosLocalBackendKindOpen(await talosLocalEngineBackendFacts())).toBeNull()
    })

    it('AL CONTRARIO — zero strati dichiarati e nessun dispositivo: la CPU, con certezza', async () => {
        bridge.available.mockResolvedValue({ available: true, backends: 'CPU,HTP', gpuLayersEffective: 0, offloadDevices: 1 })

        expect(talosLocalBackendKindOpen(await talosLocalEngineBackendFacts())).toBe('cpu')
    })
})

describe('FORMATO-01 il formato dei pesi: un errore non si ricorda', () => {
    it('dopo un errore passeggero di `modelFormat` la lettura successiva riprova', async () => {
        bridge.modelFormat
            .mockRejectedValueOnce(new Error('filo occupato'))
            .mockResolvedValue({ format: JSON.stringify({ fileType: 2 }) })

        expect(await talosLocalModelQuantisation('/m/passeggero.gguf')).toBeNull()
        expect(await talosLocalModelQuantisation('/m/passeggero.gguf')).toBe('Q4_0')
    })

    it('AL CONTRARIO — una risposta vera si legge una volta sola per percorso', async () => {
        bridge.modelFormat.mockResolvedValue({ format: JSON.stringify({ fileType: 2 }) })

        await talosLocalModelQuantisation('/m/letto.gguf')
        await talosLocalModelQuantisation('/m/letto.gguf')

        expect(bridge.modelFormat).toHaveBeenCalledTimes(1)
    })
})
