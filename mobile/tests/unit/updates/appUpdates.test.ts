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

    // ⛔ D-UPD-1: l'avanzamento dello scaricamento (byte arrivati) viene dal nativo, al massimo una volta al secondo
    it('UPD-SRV-05 i byte scaricati si copiano solo se sono un numero', () => {
        talosApplicaStatoAggiornamenti({ fase: 'IN_SCARICAMENTO', scaricati: 41_000_000 })
        expect(talosAggiornamenti.scaricati).toBe(41_000_000)
        talosApplicaStatoAggiornamenti({ scaricati: '41' as never })
        expect(talosAggiornamenti.scaricati).toBeNull()
    })

    /*
     * ⛔ B1/B2 (27/10/2026): dopo «visto()» il nativo manda lo stato INTERO con `appenaAggiornata: null` (`statoPerJs`, `JSONObject.NULL`;
     * prima la chiave spariva e il segnale «aggiornata» restava acceso). Un `null` presente azzera; un oggetto parziale tocca solo i
     * suoi campi.
     */
    it('UPD-SRV-06 un campo che torna null si azzera; un campo assente in un oggetto parziale resta com\'era', () => {
        talosApplicaStatoAggiornamenti({ fase: 'AGGIORNATA', appenaAggiornata: '0.1.47', motivo: 'rete', versione: '0.1.47' })
        talosApplicaStatoAggiornamenti({ fase: 'NESSUNA', appenaAggiornata: null, motivo: null })
        expect(talosAggiornamenti.appenaAggiornata).toBeNull()
        expect(talosAggiornamenti.motivo).toBeNull()
        expect(talosAggiornamenti.versione).toBe('0.1.47')
        expect(talosAggiornamentoDaMostrare(talosAggiornamenti)).toBe(false)
    })
})
