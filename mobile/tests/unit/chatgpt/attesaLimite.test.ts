// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import { TENTATIVI_LIMITE_DEL_PIANO, conAttesaDelLimiteDelPiano, dormiFinoA } from '@/lib/chatgpt/attesaLimite'

/**
 * N15 fetta 9 (mobile, 13/10/2026) — il limite d'uso del piano è una PAUSA: il giro aspetta e rifà la stessa richiesta, come
 * il desktop (r4 `runtime-owner-adapter.mjs:1270-1281`) e come deciso dall'owner per il telefono. Mai un altro fornitore.
 */
const MIN = 60_000
const limite = (extra: Record<string, unknown> = {}) => Object.assign(new Error('CHATGPT_LIMITE_DEL_PIANO'), extra)
function scena() {
    let ora = 1_000_000
    const dormite: number[] = []
    return {
        clock: () => ora,
        dormite,
        dormi: vi.fn(async (quando: number) => { dormite.push(quando - ora); ora = quando }),
    }
}

describe('N15 — l attesa del limite d uso del piano', () => {
    it('N15-LIM-01: al limite aspetta 30 minuti, lo dice (ora e «tentativo 1 di 9»), poi rifà la STESSA richiesta e dà la risposta', async () => {
        const s = scena()
        const lavoro = vi.fn<() => Promise<string>>().mockRejectedValueOnce(limite()).mockResolvedValueOnce('risposta')
        const viste: unknown[] = []
        const esito = await conAttesaDelLimiteDelPiano(lavoro, { clock: s.clock, dormi: s.dormi, onAttesa: (a) => viste.push(a) })
        expect(esito).toBe('risposta')
        expect(lavoro).toHaveBeenCalledTimes(2)
        expect(s.dormite).toEqual([30 * MIN])
        expect(viste).toEqual([{ riprendeAlle: 1_000_000 + 30 * MIN, tentativo: 1, totale: TENTATIVI_LIMITE_DEL_PIANO }, null])
    })

    it('N15-LIM-02: se OpenAI dice quanto aspettare si aspetta quello; se dice «più di 24 ore» (null) non si aspetta affatto', async () => {
        const s = scena()
        const lavoro = vi.fn<() => Promise<string>>().mockRejectedValueOnce(limite({ attesaMs: 2 * MIN })).mockResolvedValueOnce('ok')
        await conAttesaDelLimiteDelPiano(lavoro, { clock: s.clock, dormi: s.dormi })
        expect(s.dormite).toEqual([2 * MIN])

        const lungo = limite({ attesaMs: null })
        const mai = vi.fn<() => Promise<string>>().mockRejectedValue(lungo)
        await expect(conAttesaDelLimiteDelPiano(mai, { clock: s.clock, dormi: s.dormi })).rejects.toBe(lungo)
        expect(mai).toHaveBeenCalledTimes(1)
        expect(s.dormite).toHaveLength(1)
    })

    it('N15-LIM-03: nove attese al massimo, contate; poi il giro si ferma col suo errore del piano', async () => {
        const s = scena()
        const guasto = limite()
        const lavoro = vi.fn<() => Promise<string>>().mockRejectedValue(guasto)
        const tentativi: number[] = []
        await expect(conAttesaDelLimiteDelPiano(lavoro, { clock: s.clock, dormi: s.dormi, onAttesa: (a) => { if (a) tentativi.push(a.tentativo) } })).rejects.toBe(guasto)
        expect(tentativi).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9])
        expect(lavoro).toHaveBeenCalledTimes(10)
    })

    it('N15-LIM-04: «Ferma l attesa» (il segnale) la chiude subito: niente nuova richiesta, la carta sparisce, ed è uno Stop, non un errore', async () => {
        const fermo = new AbortController()
        const lavoro = vi.fn<() => Promise<string>>().mockRejectedValue(limite())
        const viste: unknown[] = []
        const corsa = conAttesaDelLimiteDelPiano(lavoro, { signal: fermo.signal, onAttesa: (a) => viste.push(a) })
        await vi.waitFor(() => expect(viste).toHaveLength(1))
        fermo.abort()
        await expect(corsa).rejects.toMatchObject({ name: 'AbortError' })
        expect(lavoro).toHaveBeenCalledTimes(1)
        expect(viste.at(-1)).toBeNull()
    })

    it('N15-LIM-05 AL CONTRARIO: ogni altro errore esce subito com è, senza attese; e una risposta buona non aspetta niente', async () => {
        const s = scena()
        const altro = new Error('CHATGPT_ACCESSO_NON_VALIDO')
        const lavoro = vi.fn<() => Promise<string>>().mockRejectedValue(altro)
        await expect(conAttesaDelLimiteDelPiano(lavoro, { clock: s.clock, dormi: s.dormi })).rejects.toBe(altro)
        expect(lavoro).toHaveBeenCalledTimes(1)
        expect(s.dormi).not.toHaveBeenCalled()
        expect(await conAttesaDelLimiteDelPiano(async () => 'subito', { clock: s.clock, dormi: s.dormi })).toBe('subito')
    })

    it('N15-LIM-06: l attesa guarda l OROLOGIO a piccoli passi — un timer che arriva tardi non allunga l attesa oltre l ora detta', async () => {
        vi.useFakeTimers()
        try {
            let ora = 0
            let finita = false
            const attesa = dormiFinoA(60_000, undefined, () => ora, 15_000).then(() => { finita = true })
            // il telefono «dorme»: l'orologio salta avanti di un'ora, il primo timer che scatta se ne accorge
            ora = 3_600_000
            await vi.advanceTimersByTimeAsync(15_000)
            await attesa
            expect(finita).toBe(true)
        } finally { vi.useRealTimers() }
    })
})
