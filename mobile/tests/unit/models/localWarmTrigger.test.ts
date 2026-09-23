import { describe, expect, it } from 'vitest'
import {
    talosShouldWarmLocalModel,
    talosWhyNotWarmLocalModel,
    type TalosWarmTriggerSignals,
} from '@/lib/models/localWarmTrigger'

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

/**
 * ⛔⛔ PERCHE' NO — 2026-09-10.
 *
 * Il cancello rispondeva `false` e basta, e un `false` e' indistinguibile da un
 * riscaldamento mai partito: e' per questo che il 10/09 nessuno ha potuto dire
 * QUALE delle tre spiegazioni fosse quella vera. Owner, stesso giorno: «un
 * riscaldamento che non parte per calore e' una scelta legittima; un
 * riscaldamento che non parte in silenzio e' un difetto».
 */
describe('il cancello dice PERCHE’, non solo no', () => {
    it('distingue le quattro ragioni, che si riparano in modi diversi', () => {
        expect(talosWhyNotWarmLocalModel(segnali({ thermal: null }))).toBe('unknown-heat')
        expect(talosWhyNotWarmLocalModel(segnali({ thermal: 'severe' }))).toBe('too-warm')
        expect(talosWhyNotWarmLocalModel(segnali({ thermal: 'critical' }))).toBe('too-warm')
        expect(talosWhyNotWarmLocalModel(segnali({ availableRamBytes: null }))).toBe('unknown-memory')
        expect(talosWhyNotWarmLocalModel(segnali({ lowMemoryThresholdBytes: null })))
            .toBe('unknown-memory')
        expect(talosWhyNotWarmLocalModel(segnali({ availableRamBytes: 100_000_000 })))
            .toBe('low-memory')
    })

    it('AL CONTRARIO — quando si puo’ scaldare non inventa una ragione', () => {
        expect(talosWhyNotWarmLocalModel(segnali({}))).toBeNull()
    })

    /**
     * ⛔ Una sola implementazione, due letture. Se un giorno qualcuno le
     * scrivesse separate, questo test lo direbbe: sono la stessa regola, e due
     * copie della stessa regola divergono sempre.
     */
    it('il predicato e la ragione non possono divergere', () => {
        const casi: Partial<TalosWarmTriggerSignals>[] = [
            {},
            { thermal: null },
            { thermal: 'light' },
            { thermal: 'moderate' },
            { thermal: 'severe' },
            { thermal: 'critical' },
            { availableRamBytes: null },
            { lowMemoryThresholdBytes: null },
            { availableRamBytes: 100_000_000 },
            { availableRamBytes: 300_000_000, lowMemoryThresholdBytes: 300_000_000 },
        ]
        for (const caso of casi) {
            expect(talosShouldWarmLocalModel(segnali(caso)))
                .toBe(talosWhyNotWarmLocalModel(segnali(caso)) === null)
        }
    })
})
