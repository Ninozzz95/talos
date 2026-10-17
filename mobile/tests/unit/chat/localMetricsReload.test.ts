// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * ⛔ N13-TPS-01 — MISURATO sul Pad l'11/10/2026 (LFM2.5, app di sviluppo): la riga «… tokens/sec» sotto la risposta
 * locale c'era, e dopo il ricaricamento della chat era sparita. Il legame misura → messaggio viveva solo in memoria
 * (debito scritto in `useTalosLocalMetrics.ts`). L'owner il 12/10 ha chiesto di curarlo.
 *
 * Il ricaricamento qui è un modulo importato DA CAPO (`vi.resetModules`): la memoria del modulo riparte vuota, come
 * nella WebView ricaricata; resta solo ciò che è stato salvato.
 */
vi.mock('@capacitor/core', () => ({ Capacitor: { Plugins: {} } }))

function misuraFinta(finishedAt: number) {
    return {
        traceId: 't1', finishedAt, firstVisibleMs: 351, tokensPerSecond: 9.7, msPerToken: 103,
        producedTokens: 40, promptTokens: 120, prefillMs: 200, engineFirstTokenMs: null,
    }
}

async function caricaDaCapo() {
    vi.resetModules()
    const trace = await import('@/lib/chat/providers/localTrace')
    const legame = await import('@/components/chat/useTalosLocalMetrics')
    return { ...trace, ...legame }
}

describe('N13-TPS — la riga della velocità sopravvive al ricaricamento', () => {
    beforeEach(() => { window.localStorage.clear() })

    it('N13-TPS-01: una misura legata a una risposta c è ancora dopo il ricaricamento', async () => {
        const prima = await caricaDaCapo()
        prima.talosAggiornaMisureDeiMessaggi([])
        prima.talosAggiornaMisureDeiMessaggi([{ id: 'u1', role: 'user' }])
        prima.talosRegistraMisuraLocale(misuraFinta(Date.now()) as never)
        prima.talosAggiornaMisureDeiMessaggi([{ id: 'u1', role: 'user' }, { id: 'a1', role: 'assistant' }])
        expect(prima.talosMisureDelMessaggio('a1')?.tokensPerSecond).toBe(9.7)

        const dopo = await caricaDaCapo()
        expect(dopo.talosMisureDelMessaggio('a1')?.tokensPerSecond).toBe(9.7)
        expect(dopo.talosMisureDelMessaggio('a1')?.firstVisibleMs).toBe(351)
    })

    it('N13-TPS-02 AL CONTRARIO: dati salvati rotti o di forma sbagliata non diventano una riga (né un errore)', async () => {
        window.localStorage.setItem('talos.misure-locali.v1', '{non json')
        expect((await caricaDaCapo()).talosMisureDelMessaggio('a1')).toBeNull()
        window.localStorage.setItem('talos.misure-locali.v1', JSON.stringify({ a1: { tokensPerSecond: 'veloce' } }))
        expect((await caricaDaCapo()).talosMisureDelMessaggio('a1')).toBeNull()
    })

    it('N13-TPS-03: il salvato ha un tetto, e a cadere sono le misure più vecchie', async () => {
        const m = await caricaDaCapo()
        const ids: Array<{ id: string, role: string }> = []
        m.talosAggiornaMisureDeiMessaggi([])
        for (let i = 0; i < 310; i++) {
            ids.push({ id: `u${i}`, role: 'user' })
            m.talosAggiornaMisureDeiMessaggi([...ids])
            m.talosRegistraMisuraLocale(misuraFinta(Date.now()) as never)
            ids.push({ id: `a${i}`, role: 'assistant' })
            m.talosAggiornaMisureDeiMessaggi([...ids])
        }
        const dopo = await caricaDaCapo()
        expect(dopo.talosMisureDelMessaggio('a309')).not.toBeNull()
        expect(dopo.talosMisureDelMessaggio('a0')).toBeNull()
        expect(dopo.talosQuanteMisureLegate.value).toBeLessThanOrEqual(300)
    })
})
