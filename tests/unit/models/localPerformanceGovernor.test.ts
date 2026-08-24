import { describe, expect, it } from 'vitest'
import {
    TALOS_PERFORMANCE_GOVERNOR_INITIAL,
    talosAdvancePerformanceGovernor,
    type TalosPerformanceGovernorTracker,
} from '@/lib/models/localPerformanceGovernor'
import type { TalosPerformanceSignals } from '@/services/localEngine'

const TRANQUILLO: TalosPerformanceSignals = {
    cpuHeadroom: 90, gpuHeadroom: 90, thermalHeadroom: 90, thermalForecast: 90,
    thermalStatus: 'none', sampledAtElapsedMs: 0,
}

const SOTTO_PRESSIONE: TalosPerformanceSignals = {
    cpuHeadroom: 5, gpuHeadroom: 90, thermalHeadroom: 90, thermalForecast: 90,
    thermalStatus: 'none', sampledAtElapsedMs: 0,
}

const TERMICO_SEVERO: TalosPerformanceSignals = {
    cpuHeadroom: 90, gpuHeadroom: 90, thermalHeadroom: 90, thermalForecast: 90,
    thermalStatus: 'severe', sampledAtElapsedMs: 0,
}

const TUTTO_NULLO: TalosPerformanceSignals = {
    cpuHeadroom: null, gpuHeadroom: null, thermalHeadroom: null, thermalForecast: null,
    thermalStatus: null, sampledAtElapsedMs: 0,
}

function avanzaNVolte(
    partenza: TalosPerformanceGovernorTracker,
    segnali: TalosPerformanceSignals,
    volte: number,
): TalosPerformanceGovernorTracker {
    let stato = partenza
    for (let i = 0; i < volte; i += 1) stato = talosAdvancePerformanceGovernor(stato, segnali)
    return stato
}

describe('talosAdvancePerformanceGovernor — isteresi asimmetrica', () => {
    it('resta balanced sotto un carico tranquillo', () => {
        const stato = avanzaNVolte(TALOS_PERFORMANCE_GOVERNOR_INITIAL, TRANQUILLO, 10)
        expect(stato.state).toBe('balanced')
    })

    it('⛔ un solo campione cattivo NON basta a entrare in constrained', () => {
        const stato = talosAdvancePerformanceGovernor(TALOS_PERFORMANCE_GOVERNOR_INITIAL, SOTTO_PRESSIONE)
        expect(stato.state).toBe('balanced')
        expect(stato.consecutiveBad).toBe(1)
    })

    it('entra in constrained dopo ESATTAMENTE 3 campioni cattivi di fila', () => {
        const dueCattivi = avanzaNVolte(TALOS_PERFORMANCE_GOVERNOR_INITIAL, SOTTO_PRESSIONE, 2)
        expect(dueCattivi.state).toBe('balanced')

        const treCattivi = talosAdvancePerformanceGovernor(dueCattivi, SOTTO_PRESSIONE)
        expect(treCattivi.state).toBe('constrained')
    })

    it('il termico severo/critico da solo basta a contare come campione cattivo', () => {
        const stato = avanzaNVolte(TALOS_PERFORMANCE_GOVERNOR_INITIAL, TERMICO_SEVERO, 3)
        expect(stato.state).toBe('constrained')
    })

    it('⛔ un campione cattivo interrompe la sequenza: il contatore riparte da zero', () => {
        const dueCattivi = avanzaNVolte(TALOS_PERFORMANCE_GOVERNOR_INITIAL, SOTTO_PRESSIONE, 2)
        const unoBuono = talosAdvancePerformanceGovernor(dueCattivi, TRANQUILLO)
        expect(unoBuono.consecutiveBad).toBe(0)

        // Altri due cattivi dopo l'interruzione: ancora non e' constrained,
        // perche' la sequenza precedente non "conta" piu'.
        const dueCattiviDiNuovo = avanzaNVolte(unoBuono, SOTTO_PRESSIONE, 2)
        expect(dueCattiviDiNuovo.state).toBe('balanced')
    })

    it('⭐ AL CONTRARIO — l\'isteresi e\' ASIMMETRICA: uscire costa PIU\' campioni di entrare', () => {
        const constrained = avanzaNVolte(TALOS_PERFORMANCE_GOVERNOR_INITIAL, SOTTO_PRESSIONE, 3)
        expect(constrained.state).toBe('constrained')

        // Quattro buoni di fila (meno dei 5 richiesti): resta constrained.
        const quattroBuoni = avanzaNVolte(constrained, TRANQUILLO, 4)
        expect(quattroBuoni.state).toBe('constrained')

        // Il quinto fa uscire.
        const cinqueBuoni = talosAdvancePerformanceGovernor(quattroBuoni, TRANQUILLO)
        expect(cinqueBuoni.state).toBe('balanced')
    })

    it('⛔ mai un salto diretto constrained -> burst, anche con letture eccezionali', () => {
        const constrained = avanzaNVolte(TALOS_PERFORMANCE_GOVERNOR_INITIAL, SOTTO_PRESSIONE, 3)
        const cinqueBuoni = avanzaNVolte(constrained, TRANQUILLO, 5)
        expect(cinqueBuoni.state).toBe('balanced')
        expect(cinqueBuoni.state).not.toBe('burst')
    })

    it('un campione buono interrotto da uno cattivo NON esce da constrained', () => {
        const constrained = avanzaNVolte(TALOS_PERFORMANCE_GOVERNOR_INITIAL, SOTTO_PRESSIONE, 3)
        const quattroBuoni = avanzaNVolte(constrained, TRANQUILLO, 4)
        const interrotto = talosAdvancePerformanceGovernor(quattroBuoni, SOTTO_PRESSIONE)
        expect(interrotto.state).toBe('constrained')
        expect(interrotto.consecutiveGood).toBe(0)

        // Deve ricominciare la sequenza di 5 da capo.
        const quattroBuoniDiNuovo = avanzaNVolte(interrotto, TRANQUILLO, 4)
        expect(quattroBuoniDiNuovo.state).toBe('constrained')
        const quintoBuono = talosAdvancePerformanceGovernor(quattroBuoniDiNuovo, TRANQUILLO)
        expect(quintoBuono.state).toBe('balanced')
    })

    it('segnali tutti null (device sotto la soglia API) non contano ne\' come buoni ne\' come cattivi da soli', () => {
        // thermalStatus null fa fallire sia "cattivo" (nessuno stato severo) sia
        // "buono" (non e' fra gli stati tranquilli): resta balanced, mai un
        // salto in una direzione basato su dati che non ci sono.
        const stato = avanzaNVolte(TALOS_PERFORMANCE_GOVERNOR_INITIAL, TUTTO_NULLO, 10)
        expect(stato.state).toBe('balanced')
    })
})
