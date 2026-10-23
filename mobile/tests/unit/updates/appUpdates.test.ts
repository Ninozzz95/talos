import { afterEach, describe, expect, it } from 'vitest'
import {
    talosAggiornamenti,
    talosAggiornamentoDaMostrare,
    talosApplicaStatoAggiornamenti,
    talosAzzeraAggiornamentiPerTest,
} from '@/services/appUpdates'

/*
 * Lo stato dell'aggiornamento arriva dal nativo (`TalosAggiornamentiPlugin.stato()`, evento `cambio`). Si copia campo per campo e
 * per TIPO (regola «Typed Tool Response Parsing»): un campo assente o di un altro tipo non sporca lo stato.
 * Ledger: `.claude/ragionamento/LEDGER-AGGIORNAMENTO-AUTOMATICO-MOBILE-2026-10-22.md`.
 */
afterEach(() => { talosAzzeraAggiornamentiPerTest() })

describe('stato dell\'aggiornamento', () => {
    it('UPD-SRV-01 copia lo stato del nativo', () => {
        talosApplicaStatoAggiornamenti({
            fase: 'PRONTA', installata: '0.1.43', versione: '0.1.44', dimensione: 192749764, ultimoControllo: 1000,
            permessoConcesso: true, automatici: false, soloWifi: false, avvisami: false, allUscita: true,
            note: { en: ['Faster engine.'], it: ['Motore più veloce.'] }, pagina: 'https://github.com/Ninozzz95/talos/releases/tag/v0.1.44',
        })
        expect(talosAggiornamenti.fase).toBe('PRONTA')
        expect(talosAggiornamenti.versione).toBe('0.1.44')
        expect(talosAggiornamenti.dimensione).toBe(192749764)
        expect(talosAggiornamenti.automatici).toBe(false)
        expect(talosAggiornamenti.allUscita).toBe(true)
        expect(talosAggiornamenti.note).toEqual({ en: ['Faster engine.'], it: ['Motore più veloce.'] })
    })

    it('UPD-SRV-02 una fase sconosciuta o campi di un altro tipo non cambiano niente', () => {
        talosApplicaStatoAggiornamenti({ fase: 'PRONTA', versione: '0.1.44', automatici: true })
        talosApplicaStatoAggiornamenti({ fase: 'BOH' as never, versione: 44 as never, automatici: 'no' as never })
        expect(talosAggiornamenti.fase).toBe('PRONTA')
        expect(talosAggiornamenti.versione).toBeNull()
        expect(talosAggiornamenti.automatici).toBe(true)
        talosApplicaStatoAggiornamenti(null)
        talosApplicaStatoAggiornamenti('stringa' as never)
        expect(talosAggiornamenti.fase).toBe('PRONTA')
    })

    it('UPD-SRV-03 note senza una delle due lingue non si mostrano', () => {
        talosApplicaStatoAggiornamenti({ note: { en: ['Only English.'] } as never })
        expect(talosAggiornamenti.note).toBeNull()
        talosApplicaStatoAggiornamenti({ note: { en: ['A'], it: [3] } as never })
        expect(talosAggiornamenti.note).toBeNull()
        talosApplicaStatoAggiornamenti({ note: { en: [], it: [] } as never })
        expect(talosAggiornamenti.note).toBeNull()
    })

    it('UPD-SRV-04 c\'è qualcosa da dire solo se pronta, scartata, in installazione o appena aggiornata', () => {
        expect(talosAggiornamentoDaMostrare({ fase: 'NESSUNA', appenaAggiornata: null })).toBe(false)
        expect(talosAggiornamentoDaMostrare({ fase: 'IN_SCARICAMENTO', appenaAggiornata: null })).toBe(false)
        expect(talosAggiornamentoDaMostrare({ fase: 'PRONTA', appenaAggiornata: null })).toBe(true)
        expect(talosAggiornamentoDaMostrare({ fase: 'FALLITA', appenaAggiornata: null })).toBe(true)
        expect(talosAggiornamentoDaMostrare({ fase: 'IN_INSTALLAZIONE', appenaAggiornata: null })).toBe(true)
        expect(talosAggiornamentoDaMostrare({ fase: 'NESSUNA', appenaAggiornata: '0.1.44' })).toBe(true)
    })
})
