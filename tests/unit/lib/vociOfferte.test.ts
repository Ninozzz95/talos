import { describe, expect, it } from 'vitest'
import { talosVociOfferte, type TalosVoceDispositivo } from '@/lib/voice/sceltaVoce'

/**
 * ⛔ LE DUE VOCI CHE SI OFFRONO — e la mediana che deve restare fuori.
 *
 * Owner 2026-08-10: «vorrei solo le prime tre, le altre sono troppo robotiche».
 * Owner 2026-08-11: «togli la voce predefinita e mantieni solo la prima e
 * l'ultima voce (rete)».
 *
 * ⛔ L'elenco qui sotto NON è inventato: sono le NOVE voci italiane che il Pad
 * (OPD2415, OxygenOS 16) dichiara davvero, lette dal motore l'11 agosto 2026,
 * nell'ordine in cui le consegna. Un test su voci finte avrebbe verificato la
 * mia idea dell'ordinamento invece dell'ordinamento.
 *
 * ⛔ E il caso che morde è il TERZO: «le prime due» sarebbe stato più semplice
 * da scrivere e avrebbe tenuto proprio la voce scartata.
 */
const voce = (name: string, network: boolean): TalosVoceDispositivo => ({
    name,
    locale: 'it-IT',
    quality: 400,
    latency: 200,
    network,
    notInstalled: false,
})

/** Le nove del Pad, nell'ordine vero del motore. */
const PAD: TalosVoceDispositivo[] = [
    voce('it-it-x-itb-local', false),
    voce('it-it-x-itb-network', true),
    voce('it-it-x-itc-local', false),
    voce('it-IT-language', false),
    voce('it-it-x-kda-network', true),
    voce('it-it-x-itc-network', true),
    voce('it-it-x-itd-local', false),
    voce('it-it-x-itd-network', true),
    voce('it-it-x-kda-local', false),
]

const IN_RETE = { lingua: 'it-IT', rete: true }

describe('⛔ le voci offerte a chi sceglie', () => {
    it('⭐ ne offre DUE, non tre e non nove', () => {
        expect(talosVociOfferte(PAD, IN_RETE)).toHaveLength(2)
    })

    it('⭐ sono la PRIMA e l’ULTIMA delle tre in testa', () => {
        expect(talosVociOfferte(PAD, IN_RETE).map((v) => v.name))
            .toEqual(['it-it-x-itb-network', 'it-it-x-itd-network'])
    })

    /*
     * ⛔ Il caso che morde davvero: `itc` è la voce che l'owner ha scartato
     * ascoltandola, ed è la seconda in graduatoria. Se qualcuno «semplifica» in
     * `slice(0, 2)`, questo test diventa rosso.
     */
    it('⛔ la MEDIANA resta fuori: non è «le prime due»', () => {
        expect(talosVociOfferte(PAD, IN_RETE).map((v) => v.name))
            .not.toContain('it-it-x-itc-network')
    })

    it('⛔ la voce GENERICA non si offre mai', () => {
        expect(talosVociOfferte(PAD, IN_RETE).map((v) => v.name)).not.toContain('it-IT-language')
    })

    it('⛔ senza rete restano le locali, e sempre due', () => {
        const senzaRete = talosVociOfferte(PAD, { lingua: 'it-IT', rete: false })
        expect(senzaRete).toHaveLength(2)
        expect(senzaRete.every((v) => !v.network)).toBe(true)
    })

    /*
     * ⛔ Con poche voci non si inventa niente: un dispositivo che ne ha una sola
     * deve poterla comunque scegliere, o il menù resta vuoto su un telefono che
     * parla benissimo.
     */
    it('⛔ con due o meno le restituisce tutte, senza buchi', () => {
        expect(talosVociOfferte([voce('it-it-x-itb-network', true)], IN_RETE)).toHaveLength(1)
        expect(talosVociOfferte([], IN_RETE)).toHaveLength(0)
    })
})
