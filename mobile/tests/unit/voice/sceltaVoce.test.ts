import { describe, expect, it } from 'vitest'
import { talosVociOfferte, talosVoceDiSerie,
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

/**
 * ⛔ VOCE-SERIE — owner 13/10/2026, dal Pad: «nel drop down della selezione voce appare una terza voce, tipo legacy, troppo
 * robotica, invece delle due migliori… togliamola definitivamente: rimane come predefinita nelle risposte».
 *
 * MISURATO sul Pad (nove voci italiane, tutte `quality: 400`): senza una scelta salvata la voce «di ripiego» si calcolava
 * rifiutando la rete, quindi era `it-it-x-itb-local` — fuori dalle due offerte (`itb · rete`, `itd · rete`). Il menù la
 * aggiungeva come terza perché «è quella in uso», e le risposte si leggevano con lei. La voce di serie è la PRIMA delle
 * offerte; una scelta salvata vale solo se è fra le offerte (o è di un'altra lingua, scelta apposta da «tutte le lingue»).
 */
describe('talosVoceDiSerie — la voce quando nessuno ha scelto, e le scelte fuori elenco', () => {
    const v = (name: string, network = false, locale = 'it-IT') => ({ name, locale, quality: 400, latency: 200, network, notInstalled: false })
    const PAD = [
        v('it-it-x-itb-local'), v('it-it-x-itb-network', true), v('it-it-x-itc-local'), v('it-IT-language'),
        v('it-it-x-kda-network', true), v('it-it-x-itc-network', true), v('it-it-x-itd-local'), v('it-it-x-itd-network', true),
        v('it-it-x-kda-local'), v('en-us-x-sfg-network', true, 'en-US'),
    ]

    it('VOCE-SERIE-01: senza scelta, in rete, è la SECONDA delle due offerte (owner: «la seconda non la prima») — mai la voce sul telefono', () => {
        expect(talosVoceDiSerie(PAD, { lingua: 'it-IT', rete: true, scelta: null })?.name).toBe('it-it-x-itd-network')
        // con una voce sola, quella; e se la seconda offerta è quella sul telefono, resta la prima
        expect(talosVoceDiSerie([v('it-it-x-itb-network', true), v('it-it-x-itc-local')], { lingua: 'it-IT', rete: true, scelta: null })?.name).toBe('it-it-x-itb-network')
        expect(talosVoceDiSerie([v('it-it-x-itb-network', true)], { lingua: 'it-IT', rete: true, scelta: null })?.name).toBe('it-it-x-itb-network')
        expect(talosVociOfferte(PAD, { lingua: 'it-IT', rete: true }).map((x) => x.name)).toEqual(['it-it-x-itb-network', 'it-it-x-itd-network'])
    })

    it('VOCE-SERIE-02: una scelta salvata fuori dalle offerte (la robotica) non vale più; una fra le offerte sì', () => {
        expect(talosVoceDiSerie(PAD, { lingua: 'it-IT', rete: true, scelta: 'it-it-x-itb-local' })?.name).toBe('it-it-x-itd-network')
        expect(talosVoceDiSerie(PAD, { lingua: 'it-IT', rete: true, scelta: 'it-IT-language' })?.name).toBe('it-it-x-itd-network')
        expect(talosVoceDiSerie(PAD, { lingua: 'it-IT', rete: true, scelta: 'it-it-x-itb-network' })?.name).toBe('it-it-x-itb-network')
    })

    it('VOCE-SERIE-03: una voce di un altra lingua, scelta apposta, resta quella scelta', () => {
        expect(talosVoceDiSerie(PAD, { lingua: 'it-IT', rete: true, scelta: 'en-us-x-sfg-network' })?.name).toBe('en-us-x-sfg-network')
    })

    it('VOCE-SERIE-04: senza rete si offre e si usa ciò che il telefono ha, e niente voci non dichiara niente', () => {
        expect(talosVoceDiSerie(PAD, { lingua: 'it-IT', rete: false, scelta: 'it-it-x-itd-network' })?.name).toBe('it-it-x-itd-local')
        expect(talosVoceDiSerie([], { lingua: 'it-IT', rete: true, scelta: null })).toBeNull()
    })
})
