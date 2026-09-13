// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchTalosHarnessSessionsStatus } from '@/lib/harness/harnessUiSessionStatus'

// ⭐⭐⭐ 2/9, piano §16.1 — stato vivo nella lista sessioni. Il server
// on-device è spento più spesso di quanto sia acceso (solo una sessione
// specifica lo stagia) — questo modulo deve fallire chiuso in OGNI forma
// di assenza (rete morta, risposta non-ok, JSON malformato, campi
// inattesi), mai propagare un errore a chi lo chiama.

function envelope(items: unknown[]) {
    return { ok: true, data: { items } }
}

describe('fetchTalosHarnessSessionsStatus (§16.1)', () => {
    beforeEach(() => {
        vi.stubGlobal('fetch', vi.fn())
    })
    afterEach(() => {
        vi.unstubAllGlobals()
    })

    it('maps the real server shape (sessionId/conclusa/interrotta/ultimoMessaggio/inAttesaApprovazione/ultimoEsito) into the status Map', async () => {
        vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify(envelope([
            { sessionId: 'a', conclusa: false, interrotta: false, ultimoMessaggio: null, inAttesaApprovazione: true, ultimoEsito: null },
            { sessionId: 'b', conclusa: true, interrotta: true, ultimoMessaggio: 'Fatto.', inAttesaApprovazione: false, ultimoEsito: null },
            { sessionId: 'c', conclusa: true, interrotta: false, ultimoMessaggio: 'Errore reale.', inAttesaApprovazione: false, ultimoEsito: 'errore' },
        ])), { status: 200 }))

        const mappa = await fetchTalosHarnessSessionsStatus()

        expect(mappa.get('a')).toEqual({ conclusa: false, interrotta: false, ultimoMessaggio: null, inAttesaApprovazione: true, ultimoEsito: null })
        expect(mappa.get('b')).toEqual({ conclusa: true, interrotta: true, ultimoMessaggio: 'Fatto.', inAttesaApprovazione: false, ultimoEsito: null })
        expect(mappa.get('c')).toEqual({ conclusa: true, interrotta: false, ultimoMessaggio: 'Errore reale.', inAttesaApprovazione: false, ultimoEsito: 'errore' })
        expect(mappa.size).toBe(3)
    })

    it('⛔ AL CONTRARIO — un ultimoEsito fuori dai due valori ammessi (errore/successo) diventa null, mai un valore inventato', async () => {
        vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify(envelope([
            { sessionId: 'a', conclusa: true, interrotta: false, ultimoMessaggio: null, ultimoEsito: 'qualcosa-di-inatteso' },
        ])), { status: 200 }))

        const mappa = await fetchTalosHarnessSessionsStatus()
        expect(mappa.get('a')?.ultimoEsito).toBeNull()
    })

    it('⛔ AL CONTRARIO: a rejected fetch (server not running) returns an empty Map, never throws', async () => {
        vi.mocked(fetch).mockRejectedValue(new Error('ECONNREFUSED'))
        await expect(fetchTalosHarnessSessionsStatus()).resolves.toEqual(new Map())
    })

    it('⛔ AL CONTRARIO: a non-ok HTTP response returns an empty Map, never throws', async () => {
        vi.mocked(fetch).mockResolvedValue(new Response('', { status: 500 }))
        await expect(fetchTalosHarnessSessionsStatus()).resolves.toEqual(new Map())
    })

    it('⛔ AL CONTRARIO: an envelope with ok:false returns an empty Map', async () => {
        vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ ok: false, error: { code: 'X' } }), { status: 200 }))
        await expect(fetchTalosHarnessSessionsStatus()).resolves.toEqual(new Map())
    })

    it('⛔ AL CONTRARIO: malformed JSON returns an empty Map, never throws', async () => {
        vi.mocked(fetch).mockResolvedValue(new Response('<!doctype html>not json', { status: 200 }))
        await expect(fetchTalosHarnessSessionsStatus()).resolves.toEqual(new Map())
    })

    it('⛔ AL CONTRARIO: a row missing a real sessionId is skipped, not crashed on or inserted under a fake key', async () => {
        vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify(envelope([
            { conclusa: true },
            { sessionId: '', conclusa: true },
            { sessionId: 'real', conclusa: true, interrotta: false, ultimoMessaggio: null },
        ])), { status: 200 }))

        const mappa = await fetchTalosHarnessSessionsStatus()
        expect(mappa.size).toBe(1)
        expect(mappa.has('real')).toBe(true)
    })

    it('sends a real GET request to the same on-device base every other harness call uses', async () => {
        vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify(envelope([])), { status: 200 }))
        await fetchTalosHarnessSessionsStatus()
        expect(fetch).toHaveBeenCalledWith(
            expect.stringContaining('/api/v1/sessions'),
            expect.objectContaining({ method: 'GET' }),
        )
    })
})
