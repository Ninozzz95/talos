import { describe, expect, it } from 'vitest'
import {
    talosEstimatedLatencyMs,
    talosSelectBestProfile,
    type TalosProfileForSelection,
} from '@/lib/models/localProfileSelector'

function profilo(over: Partial<TalosProfileForSelection>): TalosProfileForSelection {
    return {
        backendRegistry: 'cpu',
        backendDevice: null,
        outcome: 'CORRECT',
        ttftMs: 1000,
        decodeTokPerSec: 10,
        ...over,
    }
}

describe('talosEstimatedLatencyMs', () => {
    it('un profilo FAILED non è un candidato, indipendentemente da quanto era veloce', () => {
        expect(talosEstimatedLatencyMs(profilo({ outcome: 'FAILED', decodeTokPerSec: 1000 }), 100, true))
            .toBeNull()
    })

    it('nessuna misura di decodifica -> nessuna stima, mai un numero indovinato', () => {
        expect(talosEstimatedLatencyMs(profilo({ decodeTokPerSec: null }), 100, true)).toBeNull()
    })

    /**
     * ⛔⛔ CR-12 — il cuore del blocco. Il profilo ATTIVO non paga
     * transizione: 100 token / 10 tok/s = 10.000 ms, punto.
     */
    it('il profilo attivo non paga il costo di transizione', () => {
        const stima = talosEstimatedLatencyMs(profilo({ ttftMs: 5000, decodeTokPerSec: 10 }), 100, true)
        expect(stima).toBe(10_000)
    })

    /** ⛔⛔ CR-12 — un candidato NON attivo paga ttftMs per intero, prima di generare un solo token. */
    it('un profilo NON attivo paga il costo di transizione per intero', () => {
        const stima = talosEstimatedLatencyMs(profilo({ ttftMs: 5000, decodeTokPerSec: 10 }), 100, false)
        expect(stima).toBe(5000 + 10_000)
    })
})

describe('talosSelectBestProfile — CR-12: una configurazione steady più veloce perde se il reload non si ammortizza', () => {
    const attivoLento = profilo({
        backendRegistry: 'cpu', ttftMs: 500, decodeTokPerSec: 8,
    })
    // 2× più veloce a regime, ma richiede 8 secondi di riapertura.
    const candidatoVeloceMaFreddo = profilo({
        backendRegistry: 'opencl', backendDevice: 'GPUOpenCL', ttftMs: 8000, decodeTokPerSec: 16,
    })

    it('output BREVE: il candidato perde — il reload non si ammortizza in tempo', () => {
        // attivo:    0 + 20/8*1000     = 2.500 ms
        // candidato: 8000 + 20/16*1000 = 9.250 ms
        const scelto = talosSelectBestProfile([attivoLento, candidatoVeloceMaFreddo], 'cpu', 20)
        expect(scelto?.backendRegistry).toBe('cpu')
    })

    it('output LUNGO: il candidato vince — il vantaggio di regime supera il costo di apertura', () => {
        // attivo:    0    + 5000/8*1000  = 625.000 ms
        // candidato: 8000 + 5000/16*1000 = 320.500 ms
        const scelto = talosSelectBestProfile([attivoLento, candidatoVeloceMaFreddo], 'cpu', 5000)
        expect(scelto?.backendRegistry).toBe('opencl')
    })

    /**
     * AL CONTRARIO del test precedente: appena sotto il break-even reale
     * (verificato numericamente, non a occhio: `T_attivo(R)=R/8·1000`,
     * `T_candidato(R)=8000+R/16·1000`, uguali a `R*=128`), il candidato
     * NON deve ancora vincere.
     */
    it('AL CONTRARIO — appena sotto il punto di pareggio il profilo attivo tiene ancora', () => {
        const scelto = talosSelectBestProfile([attivoLento, candidatoVeloceMaFreddo], 'cpu', 100)
        expect(scelto?.backendRegistry).toBe('cpu')
    })
})

describe('talosSelectBestProfile — la regola del rumore (§21.2)', () => {
    it('entro il 3%, il profilo ATTIVO vince anche se nominalmente un pelo più lento', () => {
        const attivo = profilo({ backendRegistry: 'cpu', ttftMs: 0, decodeTokPerSec: 10 })
        // 2% più veloce a regime — dentro la banda di rumore.
        const candidato = profilo({ backendRegistry: 'opencl', ttftMs: 0, decodeTokPerSec: 10.2 })
        const scelto = talosSelectBestProfile([attivo, candidato], 'cpu', 1000)
        expect(scelto?.backendRegistry).toBe('cpu')
    })

    it('AL CONTRARIO — oltre il 3%, il migliore vince anche se non è quello attivo', () => {
        const attivo = profilo({ backendRegistry: 'cpu', ttftMs: 0, decodeTokPerSec: 10 })
        // 10% più veloce, zero costo di transizione in questo test: un vantaggio vero, non rumore.
        const candidato = profilo({ backendRegistry: 'opencl', ttftMs: 0, decodeTokPerSec: 11 })
        const scelto = talosSelectBestProfile([attivo, candidato], 'cpu', 1000)
        expect(scelto?.backendRegistry).toBe('opencl')
    })
})

describe('talosSelectBestProfile — casi limite', () => {
    it('nessun profilo -> null, non un candidato indovinato', () => {
        expect(talosSelectBestProfile([], 'cpu', 100)).toBeNull()
    })

    it('tutti FAILED o senza misura -> null', () => {
        const profili = [
            profilo({ outcome: 'FAILED' }),
            profilo({ decodeTokPerSec: null }),
        ]
        expect(talosSelectBestProfile(profili, 'cpu', 100)).toBeNull()
    })

    it('nessun profilo attivo fra i candidati: sceglie comunque il migliore stimato', () => {
        const solounCandidato = profilo({ backendRegistry: 'opencl', ttftMs: 2000, decodeTokPerSec: 20 })
        const scelto = talosSelectBestProfile([solounCandidato], 'cpu', 100)
        expect(scelto?.backendRegistry).toBe('opencl')
    })
})
