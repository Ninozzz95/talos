import { beforeEach, describe, expect, it, vi } from 'vitest'

const bridge = vi.hoisted(() => ({ traccia: vi.fn(async (_o: { testo: string }) => ({})) }))
vi.mock('@capacitor/core', () => ({
    Capacitor: { Plugins: { TalosDictation: { traccia: bridge.traccia } } },
}))

const { talosNewLocalTraceId, talosLocalTrace } = await import('@/lib/chat/providers/localTrace')

describe('localTrace — B1, l\'id che lega una generazione locale ai suoi eventi', () => {
    beforeEach(() => {
        bridge.traccia.mockClear()
    })

    it('TRACE-01 due id consecutivi sono diversi - due generazioni vicine restano distinguibili', () => {
        const a = talosNewLocalTraceId()
        const b = talosNewLocalTraceId()
        expect(a).not.toBe(b)
    })

    it('AL CONTRARIO: lo stesso id passato due volte a talosLocalTrace produce righe che lo portano entrambe', async () => {
        const id = talosNewLocalTraceId()
        talosLocalTrace(id, 'adapter_start')
        talosLocalTrace(id, 'complete')
        // talosTracciaFuori è fire-and-forget (mai await): si aspetta il
        // microtask della Promise interna prima di leggere le chiamate.
        await Promise.resolve()
        await Promise.resolve()
        expect(bridge.traccia).toHaveBeenCalledTimes(2)
        const primaRiga = bridge.traccia.mock.calls.at(0)?.[0].testo
        const secondaRiga = bridge.traccia.mock.calls.at(1)?.[0].testo
        expect(primaRiga).toContain(`local:${id} adapter_start`)
        expect(secondaRiga).toContain(`local:${id} complete`)
    })

    it('due id diversi non si mescolano nella stessa riga', async () => {
        const id1 = talosNewLocalTraceId()
        const id2 = talosNewLocalTraceId()
        talosLocalTrace(id1, 'adapter_start')
        talosLocalTrace(id2, 'adapter_start')
        await Promise.resolve()
        await Promise.resolve()
        const righe = bridge.traccia.mock.calls.map((c) => c[0]?.testo)
        expect(righe[0]).toContain(id1)
        expect(righe[0]).not.toContain(id2)
        expect(righe[1]).toContain(id2)
        expect(righe[1]).not.toContain(id1)
    })
})
