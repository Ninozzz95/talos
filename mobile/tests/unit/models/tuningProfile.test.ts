import { describe, expect, it } from 'vitest'
import {
    TALOS_TUNING_FAILURE_LIMIT,
    TALOS_TUNING_PROFILE_LIMIT,
    talosMarkTuningFailure,
    talosProfileFor,
    talosProfileFromMeasurement,
    talosSameTuningKey,
    talosStoreProfile,
    type TalosTuningKey,
    type TalosTuningProfile,
} from '@/lib/models/tuningProfile'
import { talosPreferFewerThreads } from '@/lib/models/engineTuning'

/**
 * Il profilo dei thread, misurato una volta e ricordato — con la sua chiave.
 *
 * Misurare costa: `nativeTuneThreads` prova ogni candidato con un prefill vero e
 * azzera la conversazione. Farlo una volta va benissimo; farlo a ogni apertura
 * vorrebbe dire buttare il contesto ogni volta che qualcuno vuole scrivere un
 * messaggio.
 *
 * ⛔ Ma un numero misurato ieri su un'altra cosa è **peggio di nessun numero**:
 * ha l'aria di un fatto. Queste prove guardano soprattutto **quando il profilo
 * NON si applica**, che è la parte che fa danno se sbagliata.
 */
const CHIAVE: TalosTuningKey = {
    deviceModel: 'OPD2415',
    cpuCores: 8,
    appBuild: '1.0.42',
    modelPath: '/models/unsloth/Qwen3-1.7B-GGUF/main/Qwen3-1.7B-Q8_0.gguf',
    modelBytes: 1_830_000_000,
    modelModifiedAt: 1_786_000_000_000,
}

function profilo(patch: Partial<TalosTuningProfile> = {}): TalosTuningProfile {
    return {
        key: CHIAVE,
        threads: 4,
        threadsBatch: 7,
        prefillPerSecond: 238.5,
        decodePerSecond: 26.06,
        measuredAt: 1_786_000_000_000,
        failures: 0,
        ...patch,
    }
}

describe('quando un profilo parla DAVVERO di questa situazione', () => {
    it('con la stessa chiave si riusa', () => {
        expect(talosProfileFor([profilo()], CHIAVE)?.threadsBatch).toBe(7)
    })

    /**
     * ⛔ Ogni componente della chiave conta, e ognuno per un motivo diverso. Un
     * test che ne provasse uno solo lascerebbe gli altri liberi di cambiare in
     * silenzio.
     */
    it.each([
        ['un altro telefono', { deviceModel: 'SM-S928B' }],
        ['un chip con altri core', { cpuCores: 6 }],
        ['una build nuova dell\'app, che può portare un altro motore', { appBuild: '1.0.43' }],
        ['un altro modello', { modelPath: '/models/altro.gguf' }],
        ['lo stesso nome ma un file diverso', { modelBytes: 900_000_000 }],
        ['lo stesso file riscaricato', { modelModifiedAt: 1_786_999_999_999 }],
    ])('con %s il profilo NON si applica', (_nome, differenza) => {
        const altra = { ...CHIAVE, ...differenza }
        expect(talosSameTuningKey(CHIAVE, altra)).toBe(false)
        expect(talosProfileFor([profilo()], altra)).toBeNull()
    })

    /**
     * `null` non è un guasto: significa «non lo so», e chi chiama ha già una
     * risposta onesta — il punto di partenza derivato dalla forma della CPU.
     */
    it('senza profili non inventa niente', () => {
        expect(talosProfileFor([], CHIAVE)).toBeNull()
    })

    it('e non applica un profilo con numeri impossibili', () => {
        expect(talosProfileFor([profilo({ threads: 0 })], CHIAVE)).toBeNull()
        expect(talosProfileFor([profilo({ threadsBatch: -1 })], CHIAVE)).toBeNull()
    })
})

describe('un profilo che fa cadere il motore', () => {
    /**
     * Si conta invece di cancellare al primo incidente: una caduta può avere
     * mille cause — memoria occupata da un'altra app, un modello mezzo
     * scaricato — e buttare una misura buona ogni volta significa rimisurare
     * per sempre.
     */
    it('alla prima caduta resta, perché una caduta non è una prova', () => {
        const dopo = talosMarkTuningFailure([profilo()], CHIAVE)
        expect(dopo[0]!.failures).toBe(1)
        expect(talosProfileFor(dopo, CHIAVE)).not.toBeNull()
    })

    it('⛔ alla seconda va in quarantena, per quanto veloce fosse', () => {
        let profiles = talosMarkTuningFailure([profilo()], CHIAVE)
        profiles = talosMarkTuningFailure(profiles, CHIAVE)
        expect(profiles[0]!.failures).toBe(TALOS_TUNING_FAILURE_LIMIT)
        expect(talosProfileFor(profiles, CHIAVE)).toBeNull()
    })

    it('e la caduta di un profilo non tocca gli altri', () => {
        const altro = profilo({ key: { ...CHIAVE, modelPath: '/models/altro.gguf' } })
        const dopo = talosMarkTuningFailure([profilo(), altro], CHIAVE)
        expect(dopo[1]!.failures).toBe(0)
    })
})

describe('conservare un profilo', () => {
    /**
     * ⛔ Sostituzione e non aggiunta: due profili per la stessa situazione sono
     * due risposte alla stessa domanda, e la seconda volta se ne prende una a
     * caso.
     */
    it('la misura nuova SOSTITUISCE quella vecchia per la stessa chiave', () => {
        const prima = profilo({ threadsBatch: 4 })
        const dopo = talosStoreProfile([prima], profilo({ threadsBatch: 8 }))
        expect(dopo).toHaveLength(1)
        expect(dopo[0]!.threadsBatch).toBe(8)
    })

    it('e azzera il conto delle cadute, perché è una configurazione nuova', () => {
        const caduto = profilo({ failures: 2 })
        const dopo = talosStoreProfile([caduto], profilo({ threadsBatch: 6 }))
        expect(dopo[0]!.failures).toBe(0)
    })

    it('la lista non cresce per sempre: i più vecchi escono', () => {
        let profiles: TalosTuningProfile[] = []
        for (let index = 0; index < TALOS_TUNING_PROFILE_LIMIT + 5; index++) {
            profiles = talosStoreProfile(profiles, profilo({
                key: { ...CHIAVE, modelPath: `/models/${index}.gguf` },
            }))
        }
        expect(profiles).toHaveLength(TALOS_TUNING_PROFILE_LIMIT)
        // Il più recente in testa: rimisurare uno vecchio costa poco, perdere
        // quello appena misurato costerebbe subito.
        expect(profiles[0]!.key.modelPath).toContain(String(TALOS_TUNING_PROFILE_LIMIT + 4))
    })
})

/**
 * Dalla misura al profilo, con la griglia vera presa sul Pad.
 */
describe('trasformare una misura in una scelta', () => {
    const GRIGLIA_DEL_PAD = {
        threads: 4,
        threadsBatch: 8,
        prefillPerSecond: 260.2,
        decodePerSecond: 26.06,
        grid: [
            { threads: 2, prefill: 126.0, decode: 25.89 },
            { threads: 4, prefill: 174.6, decode: 26.06 },
            { threads: 6, prefill: 238.1, decode: 26.06 },
            { threads: 7, prefill: 238.5, decode: 19.80 },
            { threads: 8, prefill: 260.2, decode: 23.95 },
        ],
    }

    /**
     * ⛔ Il fatto che rende utile la regola del 3%: sulla generazione **due
     * thread valgono quanto sei** (25,89 contro 26,06, lo 0,7%). Prendere il
     * massimo nominale significherebbe usare tre volte i core per niente, e
     * pagarlo in calore sulle risposte lunghe.
     */
    it('sulla generazione sceglie DUE thread, non sei', () => {
        const scelto = talosProfileFromMeasurement(
            CHIAVE, GRIGLIA_DEL_PAD, talosPreferFewerThreads, 1)
        expect(scelto?.threads).toBe(2)
    })

    it('e sul prefill sceglie otto, perché lì la differenza è vera', () => {
        const scelto = talosProfileFromMeasurement(
            CHIAVE, GRIGLIA_DEL_PAD, talosPreferFewerThreads, 1)
        expect(scelto?.threadsBatch).toBe(8)
    })

    it('conserva i numeri da cui la scelta è nata', () => {
        const scelto = talosProfileFromMeasurement(
            CHIAVE, GRIGLIA_DEL_PAD, talosPreferFewerThreads, 42)
        expect(scelto?.prefillPerSecond).toBe(260.2)
        expect(scelto?.measuredAt).toBe(42)
        expect(scelto?.failures).toBe(0)
    })

    it('una misura senza niente di valido non produce un profilo inventato', () => {
        expect(talosProfileFromMeasurement(CHIAVE, {
            threads: 0, threadsBatch: 0, prefillPerSecond: 0, decodePerSecond: 0, grid: [],
        }, talosPreferFewerThreads, 1)).toBeNull()
    })
})
