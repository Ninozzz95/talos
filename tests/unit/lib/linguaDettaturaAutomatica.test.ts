import { describe, expect, it } from 'vitest'
import {
    TALOS_LINGUA_AUTOMATICA,
    TALOS_LINGUA_DI_SISTEMA,
    parseTalosDictationLanguageMode,
    resolveTalosDictationLanguageTag,
    talosRilevamentoAcceso,
} from '@/lib/dictationPolicy'
import { talosLingueDaAscoltare } from '@/lib/voice/lingueDaAscoltare'

/**
 * ⛔⛔ IL DIFETTO CHE HA APERTO QUESTO FILE.
 *
 * Owner 2026-08-10: parlava italiano con la dettatura su inglese, e il motore
 * non ha sentito niente. Prima l'elenco era di DUE voci scritte a mano; adesso
 * l'automatico è il default e le lingue le dichiara il dispositivo.
 */
describe('⛔ la lingua della dettatura non si chiede più', () => {
    it('senza niente di salvato si parte in AUTOMATICO, non in inglese', () => {
        expect(parseTalosDictationLanguageMode(undefined)).toBe(TALOS_LINGUA_AUTOMATICA)
        expect(parseTalosDictationLanguageMode(null)).toBe(TALOS_LINGUA_AUTOMATICA)
        expect(parseTalosDictationLanguageMode('qualunque cosa')).toBe(TALOS_LINGUA_AUTOMATICA)
    })

    it('⛔⛔ i TRE valori del vecchio mondo diventano AUTOMATICO', () => {
        // Nessuno ha mai potuto sceglierli CONTRO l'automatico: non c'era.
        // Lasciare `en` a chi ce l'ha significa ripresentare il difetto
        // identico il giorno dopo l'aggiornamento.
        expect(parseTalosDictationLanguageMode('it')).toBe(TALOS_LINGUA_AUTOMATICA)
        expect(parseTalosDictationLanguageMode('en')).toBe(TALOS_LINGUA_AUTOMATICA)
        expect(parseTalosDictationLanguageMode(TALOS_LINGUA_DI_SISTEMA))
            .toBe(TALOS_LINGUA_AUTOMATICA)
    })

    it('accetta un tag qualunque purché abbia la FORMA giusta — niente elenco chiuso', () => {
        expect(parseTalosDictationLanguageMode('pt-BR')).toBe('pt-BR')
        expect(parseTalosDictationLanguageMode('cmn-Hans-CN')).toBe('cmn-Hans-CN')
        expect(parseTalosDictationLanguageMode('es-419')).toBe('es-419')
        expect(parseTalosDictationLanguageMode('it_IT')).toBe(TALOS_LINGUA_AUTOMATICA)
        // ⛔ Senza regione è un valore del VECCHIO mondo, non una scelta nuova.
        expect(parseTalosDictationLanguageMode('pt')).toBe(TALOS_LINGUA_AUTOMATICA)
    })

    it('⛔ auto e system NON mandano nessun tag al motore, ma solo auto rileva', () => {
        expect(resolveTalosDictationLanguageTag(TALOS_LINGUA_AUTOMATICA)).toBeUndefined()
        expect(resolveTalosDictationLanguageTag(TALOS_LINGUA_DI_SISTEMA)).toBeUndefined()
        expect(resolveTalosDictationLanguageTag('it-IT')).toBe('it-IT')

        expect(talosRilevamentoAcceso(TALOS_LINGUA_AUTOMATICA)).toBe(true)
        // Una scelta esplicita si RISPETTA: chi ha detto «inglese» vuole inglese.
        expect(talosRilevamentoAcceso('en-US')).toBe(false)
        expect(talosRilevamentoAcceso(TALOS_LINGUA_DI_SISTEMA)).toBe(false)
    })
})

describe('⛔ quali lingue si danno al commutatore', () => {
    it('il caso dell owner: sistema italiano, interfaccia italiana, dispositivo bilingue', () => {
        expect(talosLingueDaAscoltare({
            sistema: ['it-IT', 'en-US'],
            interfaccia: 'it-IT',
            supportate: ['it-IT', 'en-US', 'fr-FR', 'de-DE'],
        })).toEqual(['it-IT', 'en-US'])
    })

    it('⛔ MAI più di tre: oltre, il commutatore scambia una parola per un cambio', () => {
        expect(talosLingueDaAscoltare({
            sistema: ['it-IT', 'en-US', 'fr-FR', 'de-DE', 'es-ES'],
        })).toHaveLength(3)
    })

    it('⛔ una lingua che il dispositivo NON sa ascoltare si scarta', () => {
        // Chiedere una lingua senza pacchetto è un modo elegante di non farsi capire.
        expect(talosLingueDaAscoltare({
            sistema: ['it-IT', 'sw-KE'],
            supportate: ['it-IT', 'en-US'],
        })).toEqual(['it-IT'])
    })

    it('⛔ la stessa lingua con due regioni conta UNA volta', () => {
        expect(talosLingueDaAscoltare({
            sistema: ['en-US', 'en-GB', 'it-IT'],
        })).toEqual(['en-US', 'it-IT'])
    })

    it('la preferenza del servizio vocale viene PRIMA di tutto il resto', () => {
        expect(talosLingueDaAscoltare({
            sistema: ['en-US'],
            preferita: 'it-IT',
        })).toEqual(['it-IT', 'en-US'])
    })

    it('e la forma del tag dichiarata dal dispositivo VINCE sulla nostra', () => {
        // Android può dichiarare `cmn-Hans-CN` dove il sistema dice `zh-CN`:
        // al motore si manda la SUA scrittura, non la nostra.
        expect(talosLingueDaAscoltare({
            sistema: ['it-IT'],
            supportate: ['it-CH'],
        })).toEqual(['it-CH'])
    })

    it('senza niente da cui misurare, non si inventa nessuna lingua', () => {
        expect(talosLingueDaAscoltare({ sistema: [] })).toEqual([])
    })
})
