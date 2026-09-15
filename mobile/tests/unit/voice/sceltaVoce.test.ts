import { describe, expect, it } from 'vitest'
import {
    talosSiglaVoce,
    talosVoceDaUsare,
    talosVoceGenerica,
    talosVociOrdinate,
    type TalosVoceDispositivo,
} from '@/lib/voice/sceltaVoce'

/**
 * ⛔⛔ IL SELETTORE DELLE VOCI ERA VUOTO, E IL MOTORE STAVA SULLA GENERICA.
 *
 * MISURATO sul Pad il 2026-08-10, i due elenchi chiesti nello stesso istante:
 *
 * ```
 *   Web Speech API (quello che la schermata mostrava)     0 voci
 *   plugin nativo  (quello che parla davvero)           473 voci
 *   voce in uso                                    it-IT-language
 * ```
 *
 * Owner: «la voce è troppo robotica». Non c'era una scelta sbagliata: non
 * c'era nessuna scelta.
 *
 * Le nove voci italiane del Pad — usate qui come dati veri, non inventati.
 */
const PAD: TalosVoceDispositivo[] = [
    'it-IT-language',
    'it-it-x-itb-local', 'it-it-x-itb-network',
    'it-it-x-itc-local', 'it-it-x-itc-network',
    'it-it-x-itd-local', 'it-it-x-itd-network',
    'it-it-x-kda-local', 'it-it-x-kda-network',
].map((name) => ({
    name,
    locale: 'it-IT',
    quality: 400,
    latency: 200,
    network: name.endsWith('-network'),
    notInstalled: false,
}))

describe('⛔ quale voce, fra quelle vere del telefono', () => {
    it('la GENERICA non è mai la prima: è il ripiego del motore', () => {
        const offline = talosVociOrdinate(PAD, { lingua: 'it', rete: false })
        expect(offline[0]!.name, 'la generica sarebbe «it-IT-language»').not.toBe('it-IT-language')
        expect(offline.at(-1)!.name, 'e finisce in fondo').toBe('it-IT-language')
    })

    it('con la rete accettata vince la NEURALE, non quella sul telefono', () => {
        const conRete = talosVociOrdinate(PAD, { lingua: 'it', rete: true })
        expect(conRete[0]!.network).toBe(true)
        expect(conRete[0]!.name).toMatch(/-x-\w+-network$/)
    })

    it('offline la rete non compare: offrirla sarebbe offrire il silenzio', () => {
        const offline = talosVociOrdinate(PAD, { lingua: 'it', rete: false })
        expect(offline.some((v) => v.network)).toBe(false)
        expect(offline.length).toBe(5)
    })

    it('⛔ la qualità dichiarata NON basta: sul Pad sono tutte 400', () => {
        // Se l'ordinamento guardasse solo `quality`, l'elenco resterebbe com'era
        // e la generica potrebbe restare in testa. Questo caso è la prova che
        // il criterio vero è un altro.
        expect(new Set(PAD.map((v) => v.quality)).size).toBe(1)
        const primo = talosVociOrdinate(PAD, { lingua: 'it', rete: false })[0]!
        expect(talosVoceGenerica(primo)).toBe(false)
    })

    it('una voce DA SCARICARE non si offre: parlerebbe il silenzio', () => {
        const con = [...PAD, {
            name: 'it-it-x-zzz-local', locale: 'it-IT', quality: 500,
            latency: 100, network: false, notInstalled: true,
        }]
        const ordinate = talosVociOrdinate(con, { lingua: 'it', rete: false })
        expect(ordinate.some((v) => v.name === 'it-it-x-zzz-local')).toBe(false)
    })

    it('le lingue non si mescolano', () => {
        const con = [...PAD, {
            name: 'en-us-x-tpf-local', locale: 'en-US', quality: 400,
            latency: 200, network: false, notInstalled: false,
        }]
        const ordinate = talosVociOrdinate(con, { lingua: 'it-IT', rete: false })
        expect(ordinate.every((v) => v.locale.startsWith('it'))).toBe(true)
    })

    it('la sigla distingue le voci senza promettere un genere che Android non dichiara', () => {
        expect(talosSiglaVoce(PAD.find((v) => v.name === 'it-it-x-kda-network')!)).toBe('kda')
        // ⛔ e per la generica non si inventa niente: resta il suo nome.
        expect(talosSiglaVoce(PAD[0]!)).toBe('it-IT-language')
    })
})

describe('⛔ la voce SCELTA vince — finché esiste', () => {
    it('rispetta la scelta della persona', () => {
        const r = talosVoceDaUsare(PAD, { lingua: 'it', rete: false, scelta: 'it-it-x-itd-local' })
        expect(r.motivo).toBe('scelta')
        expect(r.voce!.name).toBe('it-it-x-itd-local')
    })

    it('⛔ una scelta SPARITA non lascia il motore sulla generica in silenzio', () => {
        // Le voci spariscono quando il motore si aggiorna. Prima si sarebbe
        // tornati al ripiego senza dirlo; qui si scivola sulla migliore E si
        // dice che è successo.
        const r = talosVoceDaUsare(PAD, { lingua: 'it', rete: false, scelta: 'it-it-x-mai-esistita' })
        expect(r.motivo).toBe('migliore')
        expect(talosVoceGenerica(r.voce!)).toBe(false)
    })

    it('una lingua senza voci lo dice, invece di scegliere a caso', () => {
        const r = talosVoceDaUsare(PAD, { lingua: 'ja', rete: true, scelta: null })
        expect(r.motivo).toBe('nessuna')
        expect(r.voce).toBeNull()
    })
})
