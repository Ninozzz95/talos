import { describe, expect, it, vi } from 'vitest'
import { creaCustodeGiriCodice, idSessioneDaUrlEventi } from '@/lib/harness/custodeGiriCodice'

/**
 * ⛔ F4 (14/10/2026, owner «Notifica solo mentre lavora»): con il Codice in casa Node è figlio dell'app e sta nel suo
 * cgroup; se l'app va in cache Android la congela e il giro si ferma. Il flusso degli eventi dice quando un giro comincia e
 * finisce; il servizio in primo piano lo tiene il NATIVO (`TalosCodiceCustode.kt`), perché in secondo piano la WebView è
 * congelata (misurato sul Pad: giro finito alle 09:22, servizio ancora acceso 4 minuti dopo col custode in JavaScript).
 * Ledger `LEDGER-CODICE-SENZA-PONTE-2026-10-13.md` §14-15.
 */

const URL_EVENTI = 'http://localhost:4174/api/v1/sessions/sess-1/events'

function flusso() {
    const bersaglio = new EventTarget()
    return {
        sorgente: bersaglio as unknown as EventSource,
        manda(evento: unknown) {
            bersaglio.dispatchEvent(new MessageEvent('message', { data: typeof evento === 'string' ? evento : JSON.stringify(evento) }))
        },
    }
}

function banco(opzioni: { inCasa?: boolean } = {}) {
    const segui = vi.fn(async () => true)
    const lascia = vi.fn(async () => {})
    const custode = creaCustodeGiriCodice({ segui, lascia })
    const opzioniOsserva = { titolo: 'Sistema i test', testo: 'Il Codice sta lavorando', inCasa: async () => opzioni.inCasa ?? true }
    return { custode, segui, lascia, opzioniOsserva }
}

const pausa = () => new Promise((r) => setTimeout(r, 0))

describe('custode dei giri del Codice (F4)', () => {
    it('COD-F4-01 RunStarted chiede al nativo di seguire la sessione col suo titolo e il testo', async () => {
        const { custode, segui, lascia, opzioniOsserva } = banco()
        const f = flusso()
        custode.osserva(URL_EVENTI, f.sorgente, opzioniOsserva)
        f.manda({ type: 'RunStarted' })
        await pausa()
        expect(segui).toHaveBeenCalledWith('sess-1', 'Sistema i test', 'Il Codice sta lavorando')
        expect(lascia).not.toHaveBeenCalled()
    })

    it('COD-F4-02 RunFinished e RunError lasciano la sessione (via veloce con l\'app davanti)', async () => {
        const { custode, lascia, opzioniOsserva } = banco()
        const f = flusso()
        custode.osserva(URL_EVENTI, f.sorgente, opzioniOsserva)
        f.manda({ type: 'RunStarted' })
        f.manda({ type: 'RunFinished' })
        f.manda({ type: 'RunStarted' })
        f.manda({ type: 'RunError', code: 'RUN_STOPPED' })
        await pausa()
        expect(lascia).toHaveBeenCalledTimes(2)
        expect(lascia).toHaveBeenCalledWith('sess-1')
    })

    it('COD-F4-03 gli eventi che non sono inizio o fine del giro, o non sono JSON, non toccano niente', async () => {
        const { custode, segui, lascia, opzioniOsserva } = banco()
        const f = flusso()
        custode.osserva(URL_EVENTI, f.sorgente, opzioniOsserva)
        f.manda('{rotto')
        f.manda({ type: 'TextMessageContent' })
        f.manda(null)
        await pausa()
        expect(segui).not.toHaveBeenCalled()
        expect(lascia).not.toHaveBeenCalled()
    })

    it('COD-F4-04 sulla strada del ponte (server non in casa) il nativo non viene chiamato', async () => {
        const { custode, segui, opzioniOsserva } = banco({ inCasa: false })
        const f = flusso()
        custode.osserva(URL_EVENTI, f.sorgente, opzioniOsserva)
        f.manda({ type: 'RunStarted' })
        await pausa()
        expect(segui).not.toHaveBeenCalled()
    })

    it('COD-F4-05 un indirizzo senza sessione non fa niente', async () => {
        const { custode, segui, opzioniOsserva } = banco()
        const f = flusso()
        custode.osserva('http://localhost:4174/api/v1/sessions', f.sorgente, opzioniOsserva)
        f.manda({ type: 'RunStarted' })
        await pausa()
        expect(segui).not.toHaveBeenCalled()
    })

    it('COD-F4-06 un errore del nativo non arriva mai alla schermata', async () => {
        // Funzioni semplici, non `vi.fn`: vitest aggancia un suo gestore alle promesse che `vi.fn` restituisce (per
        // registrarne l'esito), e un rifiuto lasciato senza `.catch` sembrerebbe gestito — il mutante sopravviveva.
        const chiamate = { segui: 0, lascia: 0 }
        const segui = async () => { chiamate.segui += 1; throw new Error('plugin assente') }
        const lascia = async () => { chiamate.lascia += 1; throw new Error('plugin assente') }
        const custode = creaCustodeGiriCodice({ segui, lascia })
        const f = flusso()
        custode.osserva(URL_EVENTI, f.sorgente, { titolo: 't', testo: 'x', inCasa: async () => true })
        const rifiuti: unknown[] = []
        const ascolta = (motivo: unknown) => { rifiuti.push(motivo) }
        process.on('unhandledRejection', ascolta)
        f.manda({ type: 'RunStarted' })
        f.manda({ type: 'RunFinished' })
        await pausa()
        await pausa()
        process.off('unhandledRejection', ascolta)
        expect(chiamate).toEqual({ segui: 1, lascia: 1 })
        expect(rifiuti).toEqual([])
    })

    it('COD-F4-07 l\'id della sessione si legge dall\'indirizzo del flusso, anche codificato', () => {
        expect(idSessioneDaUrlEventi(URL_EVENTI)).toBe('sess-1')
        expect(idSessioneDaUrlEventi('http://localhost:4174/api/v1/sessions/a%2Fb%20c/events')).toBe('a/b c')
        expect(idSessioneDaUrlEventi('http://localhost:4174/api/v1/sessions/s/events?after=3')).toBe('s')
        expect(idSessioneDaUrlEventi('http://localhost:4174/api/v1/sessions')).toBeNull()
        expect(idSessioneDaUrlEventi('http://localhost:4174/api/v1/sessions/%E0%A4%A/events')).toBeNull()
    })
})
