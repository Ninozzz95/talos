// @vitest-environment node

import { describe, expect, it, vi } from 'vitest'
import { creaFlussoNativo, type TalosFlussoHttpPonte } from '@/lib/chat/providers/flussoNativo'

/**
 * N15 — il flusso nativo (owner 13/10/2026: «Sì, risposta a pezzi»). Dalla pagina il flusso verso `api.openai.com` non può
 * riuscire (misurato sul Pad), e il trasporto nativo di sempre torna la risposta intera. Questo trasporto consegna il testo
 * mentre arriva, con gli STESSI errori del `fetch` in flusso, così tutto ciò che sta sopra non cambia.
 */
function ponte() {
    const ascoltatori = new Map<string, Set<(dati: Record<string, unknown>) => void>>()
    const p: TalosFlussoHttpPonte = {
        apri: vi.fn(async () => {}),
        chiudi: vi.fn(async () => {}),
        addListener: vi.fn(async (evento, cb) => {
            if (!ascoltatori.has(evento)) ascoltatori.set(evento, new Set())
            ascoltatori.get(evento)!.add(cb)
            return { remove: async () => { ascoltatori.get(evento)?.delete(cb) } }
        }),
    }
    const manda = (evento: string, dati: Record<string, unknown>) => { for (const cb of [...(ascoltatori.get(evento) ?? [])]) cb(dati) }
    const quanti = () => [...ascoltatori.values()].reduce((n, s) => n + s.size, 0)
    const idAperto = () => (vi.mocked(p.apri).mock.calls.at(-1)![0] as { id: string }).id
    return { p, manda, quanti, idAperto }
}

const RICHIESTA = { url: 'https://api.openai.com/v1/responses', headers: { authorization: 'Bearer x' }, body: { stream: true } }

describe('creaFlussoNativo', () => {
    it('FLUSSO-NAT-01: i pezzi arrivano in ordine a chi ascolta, la fine chiude, e gli ascoltatori si tolgono', async () => {
        const b = ponte()
        const visti: string[] = []
        const fatto = creaFlussoNativo(b.p)({ ...RICHIESTA, onText: (t) => visti.push(t) })
        await vi.waitFor(() => expect(b.p.apri).toHaveBeenCalledTimes(1))
        const aperta = vi.mocked(b.p.apri).mock.calls[0]![0]
        expect(aperta).toMatchObject({ url: RICHIESTA.url, headers: RICHIESTA.headers, body: JSON.stringify(RICHIESTA.body) })
        b.manda('talosFlussoPezzo', { id: b.idAperto(), testo: 'data: {"a":1}\n' })
        b.manda('talosFlussoPezzo', { id: b.idAperto(), testo: 'data: {"a":2}\n' })
        b.manda('talosFlussoFine', { id: b.idAperto(), stato: 200 })
        await fatto
        expect(visti).toEqual(['data: {"a":1}\n', 'data: {"a":2}\n'])
        expect(b.quanti()).toBe(0)
    })

    it('FLUSSO-NAT-02: uno stato non riuscito diventa lo stesso errore del fetch in flusso, col suo Retry-After', async () => {
        const b = ponte()
        const fatto = creaFlussoNativo(b.p)({ ...RICHIESTA, onText: () => {} })
        await vi.waitFor(() => expect(b.p.apri).toHaveBeenCalledTimes(1))
        b.manda('talosFlussoFine', { id: b.idAperto(), stato: 429, dettaglio: '{"error":{"type":"usage_limit_reached"}}', retryAfter: '120' })
        const guasto = await fatto.then(() => null, (e: unknown) => e as Error & { retryAfter?: string })
        expect(guasto?.message).toBe('stream HTTP 429: {"error":{"type":"usage_limit_reached"}}')
        expect(guasto?.retryAfter).toBe('120')
        expect(b.quanti()).toBe(0)
    })

    it('FLUSSO-NAT-03: un guasto di rete, o un «apri» rifiutato, esce come errore e non lascia ascoltatori', async () => {
        const b = ponte()
        const fatto = creaFlussoNativo(b.p)({ ...RICHIESTA, onText: () => {} })
        await vi.waitFor(() => expect(b.p.apri).toHaveBeenCalledTimes(1))
        b.manda('talosFlussoGuasto', { id: b.idAperto(), messaggio: 'UnknownHostException' })
        await expect(fatto).rejects.toThrow('stream failed: UnknownHostException')
        expect(b.quanti()).toBe(0)

        const c = ponte()
        vi.mocked(c.p.apri).mockRejectedValueOnce(new Error('TALOS_FLUSSO_HOST_NON_AMMESSO'))
        await expect(creaFlussoNativo(c.p)({ ...RICHIESTA, onText: () => {} })).rejects.toThrow('TALOS_FLUSSO_HOST_NON_AMMESSO')
        expect(c.quanti()).toBe(0)
    })

    it('FLUSSO-NAT-04: lo Stop chiude il flusso nativo ed esce come AbortError; già fermo prima di partire, non apre niente', async () => {
        const b = ponte()
        const stop = new AbortController()
        const fatto = creaFlussoNativo(b.p)({ ...RICHIESTA, signal: stop.signal, onText: () => {} })
        await vi.waitFor(() => expect(b.p.apri).toHaveBeenCalledTimes(1))
        const id = b.idAperto()
        stop.abort()
        const guasto = await fatto.then(() => null, (e: unknown) => e as Error)
        expect(guasto?.name).toBe('AbortError')
        expect(b.p.chiudi).toHaveBeenCalledWith({ id })
        expect(b.quanti()).toBe(0)

        const c = ponte()
        const fermo = new AbortController()
        fermo.abort()
        const prima = await creaFlussoNativo(c.p)({ ...RICHIESTA, signal: fermo.signal, onText: () => {} }).then(() => null, (e: unknown) => e as Error)
        expect(prima?.name).toBe('AbortError')
        expect(c.p.apri).not.toHaveBeenCalled()
    })

    it('FLUSSO-NAT-05: gli eventi di un altro flusso non toccano questo', async () => {
        const b = ponte()
        const visti: string[] = []
        const fatto = creaFlussoNativo(b.p)({ ...RICHIESTA, onText: (t) => visti.push(t) })
        await vi.waitFor(() => expect(b.p.apri).toHaveBeenCalledTimes(1))
        b.manda('talosFlussoPezzo', { id: 'un-altro', testo: 'non mio' })
        b.manda('talosFlussoFine', { id: 'un-altro', stato: 200 })
        b.manda('talosFlussoPezzo', { id: b.idAperto(), testo: 'mio' })
        b.manda('talosFlussoFine', { id: b.idAperto(), stato: 200 })
        await fatto
        expect(visti).toEqual(['mio'])
    })

    it('FLUSSO-NAT-06: il silenzio ha lo stesso nome di sempre — primo pezzo che non arriva, o flusso che si ferma — e chiude il nativo', async () => {
        vi.useFakeTimers()
        try {
            const b = ponte()
            const mai = creaFlussoNativo(b.p)({ ...RICHIESTA, firstByteMs: 1_000, stallMs: 500, onText: () => {} })
            const esitoMai = mai.then(() => null, (e: unknown) => e as Error)
            await vi.advanceTimersByTimeAsync(1_050)
            expect((await esitoMai)?.message).toBe('stream first byte timeout after 1000ms')
            expect(b.p.chiudi).toHaveBeenCalledTimes(1)

            const c = ponte()
            const fermo = creaFlussoNativo(c.p)({ ...RICHIESTA, firstByteMs: 1_000, stallMs: 500, onText: () => {} })
            const esitoFermo = fermo.then(() => null, (e: unknown) => e as Error)
            await vi.advanceTimersByTimeAsync(10)
            c.manda('talosFlussoPezzo', { id: c.idAperto(), testo: 'x' })
            await vi.advanceTimersByTimeAsync(550)
            expect((await esitoFermo)?.message).toBe('stream stalled: no data received for 500ms')
            expect(c.quanti()).toBe(0)
        } finally { vi.useRealTimers() }
    })
})
