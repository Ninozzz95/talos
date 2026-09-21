import { describe, expect, it } from 'vitest'
import { talosShouldWarmLocalModel, type TalosWarmTriggerSignals } from '@/lib/models/localWarmTrigger'

function segnali(over: Partial<TalosWarmTriggerSignals>): TalosWarmTriggerSignals {
    return {
        thermal: 'none',
        availableRamBytes: 5_000_000_000,
        lowMemoryThresholdBytes: 300_000_000,
        ...over,
    }
}

describe('talosShouldWarmLocalModel', () => {
    it.each(['none', 'light', 'moderate'] as const)(
        'via libera con termico %s e RAM sopra soglia',
        (thermal) => {
            expect(talosShouldWarmLocalModel(segnali({ thermal }))).toBe(true)
        },
    )

    /** ⛔⛔ §19.2: mai un warm-load sotto termico severo o critico. */
    it.each(['severe', 'critical'] as const)('AL CONTRARIO — mai con termico %s', (thermal) => {
        expect(talosShouldWarmLocalModel(segnali({ thermal }))).toBe(false)
    })

    it('AL CONTRARIO — RAM sotto la soglia di bassa memoria: no', () => {
        expect(talosShouldWarmLocalModel(segnali({
            availableRamBytes: 200_000_000,
            lowMemoryThresholdBytes: 300_000_000,
        }))).toBe(false)
    })

    /**
     * ⛔ Il segnale mancante è prudenza, non "procedi lo stesso" — a
     * differenza delle capacità di un modello, dove ignoto non deve mai
     * diventare no. Qui l'asimmetria è opposta: il costo di NON scaldare è
     * tre secondi in meno risparmiati, il costo di scaldare alla cieca è
     * lavoro e memoria spesi su un telefono di cui non sappiamo nulla.
     */
    it('AL CONTRARIO — termico ignoto: no, non un evento neutro', () => {
        expect(talosShouldWarmLocalModel(segnali({ thermal: null }))).toBe(false)
    })

    it('AL CONTRARIO — memoria ignota: no', () => {
        expect(talosShouldWarmLocalModel(segnali({ availableRamBytes: null }))).toBe(false)
        expect(talosShouldWarmLocalModel(segnali({ lowMemoryThresholdBytes: null }))).toBe(false)
    })

    it('il confine è "sopra", non "sopra o uguale": esattamente sulla soglia è già poco', () => {
        expect(talosShouldWarmLocalModel(segnali({
            availableRamBytes: 300_000_000,
            lowMemoryThresholdBytes: 300_000_000,
        }))).toBe(false)
    })
})
