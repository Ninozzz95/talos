import { describe, expect, it, vi } from 'vitest'
import { TALOS_OPENROUTER_MODELS_URL, talosLoadOpenRouterPriceList, talosParseOpenRouterPrices, type TalosPriceListPorts } from '@/services/openRouterPriceList'

/**
 * Owner 2026-09-13 — il listino per la stima: anonimo, al massimo una volta al giorno,
 * tenuto sul telefono; senza rete l'ultimo salvato o niente.
 */
const LISTINO = {
    data: [
        { id: 'z-ai/glm-5.3-flash', pricing: { prompt: '0.00000015', completion: '0.0000005', input_cache_read: '0.00000003' } },
        { id: 'anthropic/claude-fable-5.1', pricing: { prompt: '0.00001', completion: '0.00005' } },
        { id: 'senza-prezzo', pricing: { prompt: '0.1' } },
    ],
}
const GIORNO = 24 * 60 * 60 * 1000

function porte(risposta: () => Promise<{ status: number, data: unknown }>, inizio = Date.parse('2026-09-13T10:00:00Z')) {
    const archivio = new Map<string, string>()
    const orologio = { t: inizio }
    const request = vi.fn(risposta)
    const ports: TalosPriceListPorts = {
        transport: { request },
        storage: { get: async (k) => archivio.get(k) ?? null, set: async (k, v) => { archivio.set(k, v) } },
        now: () => orologio.t,
    }
    return { ports, request, orologio }
}

describe('talosParseOpenRouterPrices', () => {
    it('stringhe in USD per token → numeri; un modello senza prezzo di uscita si scarta', () => {
        const prezzi = talosParseOpenRouterPrices(LISTINO)
        expect(prezzi.get('z-ai/glm-5.3-flash')).toEqual({ prompt: 0.00000015, completion: 0.0000005, cacheRead: 0.00000003 })
        expect(prezzi.get('anthropic/claude-fable-5.1')?.cacheRead).toBeNull()
        expect(prezzi.has('senza-prezzo')).toBe(false)
    })
})

describe('talosLoadOpenRouterPriceList', () => {
    it('la prima volta scarica, ANONIMA, e tiene la data del listino', async () => {
        const { ports, request } = porte(async () => ({ status: 200, data: LISTINO }))
        const listino = await talosLoadOpenRouterPriceList(ports)
        expect(listino?.date).toBe('2026-09-13')
        expect(listino?.prices.size).toBe(2)
        expect(request).toHaveBeenCalledTimes(1)
        const [chiamata] = request.mock.calls[0] as unknown as [{ url: string, headers?: unknown }]
        expect(chiamata.url).toBe(TALOS_OPENROUTER_MODELS_URL)
        // ⛔ Nessuna chiave: la richiesta non porta intestazioni.
        expect(chiamata.headers).toBeUndefined()
    })

    it('entro un giorno non riscarica; dopo un giorno si', async () => {
        const { ports, request, orologio } = porte(async () => ({ status: 200, data: LISTINO }))
        await talosLoadOpenRouterPriceList(ports)
        orologio.t += GIORNO - 1
        await talosLoadOpenRouterPriceList(ports)
        expect(request).toHaveBeenCalledTimes(1)
        orologio.t += 2
        await talosLoadOpenRouterPriceList(ports)
        expect(request).toHaveBeenCalledTimes(2)
    })

    /** ⛔ «Al massimo una volta al giorno» vale anche quando la rete manca: non si riprova a ogni apertura. */
    it('senza rete: nessun listino la prima volta, e nessun nuovo tentativo entro il giorno', async () => {
        const { ports, request, orologio } = porte(async () => { throw new Error('offline') })
        expect(await talosLoadOpenRouterPriceList(ports)).toBeNull()
        orologio.t += 60_000
        expect(await talosLoadOpenRouterPriceList(ports)).toBeNull()
        expect(request).toHaveBeenCalledTimes(1)
    })

    it('un giorno dopo, se la rete manca, resta l\'ultimo listino salvato', async () => {
        let online = true
        const { ports, orologio } = porte(async () => { if (!online) throw new Error('offline'); return { status: 200, data: LISTINO } })
        await talosLoadOpenRouterPriceList(ports)
        online = false
        orologio.t += GIORNO + 1
        const listino = await talosLoadOpenRouterPriceList(ports)
        expect(listino?.date).toBe('2026-09-13')
        expect(listino?.prices.has('z-ai/glm-5.3-flash')).toBe(true)
    })
})
