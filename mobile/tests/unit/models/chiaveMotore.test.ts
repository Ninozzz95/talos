import { describe, expect, it } from 'vitest'
import { talosSameTuningKey, type TalosTuningKey } from '@/lib/models/tuningProfile'

/**
 * ⛔⛔⛔ IL MOTORE PUÒ CAMBIARE SENZA CHE CAMBI LA VERSIONE DELL'APP.
 *
 * La chiave della messa a punto era già accorta: dispositivo, core, build
 * dell'app, e percorso, byte e data del modello — cioè «è ancora lo stesso
 * telefono, la stessa app, lo stesso file».
 *
 * Mancava una cosa sola, e non è teorica: **è successa oggi**.
 *
 * Ho promosso llama.cpp da b10218 a b10354 per una correzione che riaccende
 * l'affinità CPU su Android. La versione dell'app non è cambiata — è ancora
 * `0.0.0-dev`. Quindi una misura presa col motore VECCHIO, dove ogni thread
 * girava su tutti e otto i core, verrebbe riusata dal motore NUOVO, che li può
 * confinare.
 *
 * ⇒ La misura descriveva un mondo che non c'è più, e niente lo diceva.
 *
 * ## ⭐ E l'incoerenza era già visibile in casa
 *
 * La cache dei prefissi usa **già** `engineBuild` nella propria identità. Due
 * memorie nella stessa app, una si accorge che il motore è cambiato e l'altra
 * no. Quando due parti dello stesso programma non sono d'accordo su cosa
 * identifichi una cosa, una delle due sta sbagliando — e qui si sapeva quale.
 */

const BASE: TalosTuningKey = {
    deviceModel: 'OPD2415',
    cpuCores: 8,
    appBuild: '0.0.0-dev',
    engineBuild: 'b10218',
    modelPath: '/data/modelli/llama-3.2-3b.gguf',
    modelBytes: 2_019_377_696,
    modelModifiedAt: 1_755_000_000_000,
}

describe('la chiave conosce il motore, non solo l\'app', () => {
    it('⛔ due motori diversi NON sono la stessa situazione', () => {
        expect(talosSameTuningKey(BASE, { ...BASE, engineBuild: 'b10354' })).toBe(false)
        /*
         * ⛔ È il caso vero di oggi: stessa app, stesso telefono, stesso file di
         * modello, motore diverso. Senza questo campo la misura del vecchio
         * veniva applicata al nuovo — e il nuovo sa fare una cosa che il vecchio
         * non faceva.
         */
    })

    it('⭐ e lo stesso motore resta la stessa situazione', () => {
        expect(talosSameTuningKey(BASE, { ...BASE })).toBe(true)
    })

    it('⛔ gli altri campi continuano a contare come prima', () => {
        for (const diverso of [
            { deviceModel: 'un altro telefono' },
            { cpuCores: 6 },
            { appBuild: '0.2.0' },
            { modelPath: '/altro/posto.gguf' },
            { modelBytes: 1 },
            { modelModifiedAt: 1 },
        ]) {
            expect(
                talosSameTuningKey(BASE, { ...BASE, ...diverso }),
                `cambiando ${Object.keys(diverso)[0]} la chiave doveva differire`,
            ).toBe(false)
        }
    })
})
