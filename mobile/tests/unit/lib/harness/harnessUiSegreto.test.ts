// @vitest-environment jsdom

/*
 * ⛔⛔ 70-A (30/09/2026, contratto desktop 70) — l'app legge il segreto del server del Codice e lo manda in ogni
 * richiesta. Il server lo crea a ogni avvio (owner, 30/09 sera: «Lo crea il server») e l'app lo legge dal ponte adb.
 * Ledger `.claude/ragionamento/LEDGER-70A-SERVER-CODICE-PROTETTO-2026-09-30.md`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const ponte = vi.hoisted(() => ({
    disponibile: vi.fn(() => true),
    leggi: vi.fn(),
}))
vi.mock('@/lib/harness/terminalePonte', () => ({
    talosTerminaleDisponibile: ponte.disponibile,
    leggiSegretoServerDalPonte: ponte.leggi,
}))

const costruiti = vi.hoisted(() => [] as Array<{ url: string, opzioni: { fetch: (input: string, init: { headers?: Record<string, string> }) => Promise<Response> } }>)
vi.mock('eventsource', () => ({
    EventSource: class {
        constructor(url: string, opzioni: never) { costruiti.push({ url, opzioni }) }
    },
}))

const UNO = '1'.repeat(64)
const DUE = '2'.repeat(64)
const risposta = (segreto: string | null) => ({ ok: segreto !== null, segreto, motivo: segreto ? null : 'segreto assente o non valido' })

async function modulo() {
    vi.resetModules()
    return import('@/lib/harness/harnessUiSegreto')
}

describe('SEC70-TS — il segreto del server del Codice lato app', () => {
    beforeEach(() => {
        ponte.disponibile.mockReturnValue(true)
        ponte.leggi.mockReset()
        costruiti.length = 0
        vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 200 })))
    })
    afterEach(() => {
        vi.unstubAllGlobals()
    })

    it('SEC70-TS-01 lo legge una volta e lo ricorda', async () => {
        const { leggiSegretoServerCodice } = await modulo()
        ponte.leggi.mockResolvedValue(risposta(UNO))
        expect(await leggiSegretoServerCodice()).toBe(UNO)
        expect(await leggiSegretoServerCodice()).toBe(UNO)
        expect(ponte.leggi).toHaveBeenCalledTimes(1)
    })

    it('SEC70-TS-02 «rinnova» lo rilegge (server riavviato)', async () => {
        const { leggiSegretoServerCodice } = await modulo()
        ponte.leggi.mockResolvedValueOnce(risposta(UNO)).mockResolvedValueOnce(risposta(DUE))
        expect(await leggiSegretoServerCodice()).toBe(UNO)
        expect(await leggiSegretoServerCodice({ rinnova: true })).toBe(DUE)
        expect(await leggiSegretoServerCodice()).toBe(DUE)
    })

    it('SEC70-TS-03 un formato non valido non passa mai come segreto', async () => {
        const { leggiSegretoServerCodice } = await modulo()
        ponte.leggi.mockResolvedValue({ ok: true, segreto: 'A'.repeat(64), motivo: null })
        expect(await leggiSegretoServerCodice({ attesaMs: 0 })).toBeNull()
    })

    it('SEC70-TS-04 mentre il server parte aspetta il file, poi lo usa; senza ponte non chiede niente', async () => {
        const { leggiSegretoServerCodice } = await modulo()
        ponte.leggi.mockResolvedValueOnce(risposta(null)).mockResolvedValueOnce(risposta(null)).mockResolvedValueOnce(risposta(UNO))
        expect(await leggiSegretoServerCodice({ attesaMs: 5000, pausaMs: 1 })).toBe(UNO)
        expect(ponte.leggi).toHaveBeenCalledTimes(3)

        const secondo = await modulo()
        ponte.disponibile.mockReturnValue(false)
        ponte.leggi.mockClear()
        expect(await secondo.leggiSegretoServerCodice()).toBeNull()
        expect(ponte.leggi).not.toHaveBeenCalled()
    })

    it('SEC70-TS-05 le intestazioni portano Authorization: Bearer, e niente quando il segreto manca', async () => {
        const { intestazioniServerCodice } = await modulo()
        ponte.leggi.mockResolvedValue(risposta(UNO))
        expect(await intestazioniServerCodice()).toEqual({ Authorization: `Bearer ${UNO}` })

        const secondo = await modulo()
        ponte.disponibile.mockReturnValue(false)
        expect(await secondo.intestazioniServerCodice()).toEqual({})
    })

    it('SEC70-TS-06 il flusso degli eventi passa dalla libreria con Authorization, e un 401 rinnova una volta', async () => {
        const { apriEventiServerCodice } = await modulo()
        ponte.leggi.mockResolvedValueOnce(risposta(UNO)).mockResolvedValueOnce(risposta(DUE))
        vi.mocked(fetch)
            .mockResolvedValueOnce(new Response('', { status: 401 }))
            .mockResolvedValueOnce(new Response('', { status: 200 }))
        apriEventiServerCodice('http://localhost:4174/api/v1/sessions/s1/events')
        expect(costruiti).toHaveLength(1)
        expect(costruiti[0].url).toBe('http://localhost:4174/api/v1/sessions/s1/events')
        const esito = await costruiti[0].opzioni.fetch('http://localhost:4174/api/v1/sessions/s1/events', { headers: { Accept: 'text/event-stream', 'Last-Event-ID': '7' } })
        expect(esito.status).toBe(200)
        const chiamate = vi.mocked(fetch).mock.calls
        expect(chiamate).toHaveLength(2)
        expect((chiamate[0][1] as { headers: Record<string, string> }).headers).toEqual({ Accept: 'text/event-stream', 'Last-Event-ID': '7', Authorization: `Bearer ${UNO}` })
        expect((chiamate[1][1] as { headers: Record<string, string> }).headers.Authorization).toBe(`Bearer ${DUE}`)
    })
})
