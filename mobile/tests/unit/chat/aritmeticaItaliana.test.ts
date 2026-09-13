import { describe, expect, it } from 'vitest'

import { normalizzaAritmetica, numeroDaParola } from '@/lib/chat/aritmeticaItaliana'

/**
 * ⭐⭐⭐ «SETTE PER OTTO» — le prove della normalizzazione, nei due versi.
 *
 * Misurato sul Pad l'11/09/2026 con `llama cli` dal sottomodulo pinnato: «7 x 8»
 * dà 56 su sette modelli su sette; «sette per otto» sbaglia su cinque, e LFM2.5
 * risponde 0,875 — cioè 7 ÷ 8. La cura riscrive l'operazione nella forma
 * misurata, e SOLO l'operazione.
 *
 * ⛔ Metà di queste prove sono AL CONTRARIO: «per cento», «uno per uno», «il
 * Settecento». Una normalizzazione che cambia troppo fa più danno di quella
 * che non c'è, e senza queste prove nessuno se ne accorgerebbe.
 */

describe('NUMERALI — le regole di formazione dell italiano', () => {
    it('ARI-01 unità, decine e i numeri da dieci a diciannove', () => {
        expect(numeroDaParola('sette')).toBe(7)
        expect(numeroDaParola('otto')).toBe(8)
        expect(numeroDaParola('quattordici')).toBe(14)
        expect(numeroDaParola('novanta')).toBe(90)
    })

    /**
     * ⛔ L'elisione vale SOLO davanti a vocale. Se la regola la accettasse
     * sempre, «ventdue» diventerebbe un numero, e parole a caso pure.
     */
    it('ARI-02 la decina perde la vocale solo davanti a uno e otto', () => {
        expect(numeroDaParola('ventuno')).toBe(21)
        expect(numeroDaParola('ventotto')).toBe(28)
        expect(numeroDaParola('trentotto')).toBe(38)
        expect(numeroDaParola('ventidue')).toBe(22)
        expect(numeroDaParola('ventdue')).toBeNull()
        expect(numeroDaParola('ventiuno')).toBeNull()
    })

    it('ARI-03 tré con e senza accento, perché al telefono spesso non si scrive', () => {
        expect(numeroDaParola('trentatré')).toBe(33)
        expect(numeroDaParola('trentatre')).toBe(33)
        expect(numeroDaParola('centotré')).toBe(103)
    })

    it('ARI-04 cento invariabile, mille che diventa mila', () => {
        expect(numeroDaParola('cento')).toBe(100)
        expect(numeroDaParola('duecento')).toBe(200)
        expect(numeroDaParola('centottanta')).toBe(180)
        expect(numeroDaParola('mille')).toBe(1000)
        expect(numeroDaParola('duemila')).toBe(2000)
        expect(numeroDaParola('duemilatrecento')).toBe(2300)
    })

    /**
     * ⛔ AL CONTRARIO: «mila» senza moltiplicatore e «duemille» non esistono.
     */
    it('ARI-05 le forme sbagliate non sono numeri', () => {
        expect(numeroDaParola('mila')).toBeNull()
        expect(numeroDaParola('unomila')).toBeNull()
        expect(numeroDaParola('gatto')).toBeNull()
        expect(numeroDaParola('')).toBeNull()
    })
})

describe('OPERAZIONI — la forma che sette modelli su sette leggono giusta', () => {
    /**
     * ⭐ IL CASO MISURATO: questa è la domanda che cinque modelli su sette
     * sbagliavano, e questa è la forma in cui la rispondono tutti.
     */
    it('ARI-06 «sette per otto» diventa «7 x 8»', () => {
        expect(normalizzaAritmetica('Quanto fa sette per otto?')).toBe('Quanto fa 7 x 8?')
    })

    it('ARI-07 anche con le cifre, e anche col segno che non abbiamo misurato', () => {
        expect(normalizzaAritmetica('Quanto fa 7 per 8?')).toBe('Quanto fa 7 x 8?')
        expect(normalizzaAritmetica('Quanto fa sette × otto?')).toBe('Quanto fa 7 x 8?')
        expect(normalizzaAritmetica('quanto fa 7*8')).toBe('quanto fa 7 x 8')
    })

    it('ARI-08 le altre tre operazioni, nella stessa forma', () => {
        expect(normalizzaAritmetica('sette più otto')).toBe('7 + 8')
        expect(normalizzaAritmetica('venti meno tre')).toBe('20 - 3')
        expect(normalizzaAritmetica('trenta diviso sei')).toBe('30 / 6')
        expect(normalizzaAritmetica('trenta diviso per sei')).toBe('30 / 6')
        expect(normalizzaAritmetica('sette moltiplicato per otto')).toBe('7 x 8')
    })

    it('ARI-09 idempotente: la forma misurata non si ritocca', () => {
        expect(normalizzaAritmetica('Quanto fa 7 x 8?')).toBe('Quanto fa 7 x 8?')
        expect(normalizzaAritmetica(normalizzaAritmetica('sette per otto'))).toBe('7 x 8')
    })
})

describe('AL CONTRARIO — ciò che una regola ingenua romperebbe', () => {
    /**
     * ⛔⛔ IL TEST CHE MORDE PIÙ DEGLI ALTRI. «cento» è un numero, quindi senza
     * questa esclusione il 5 % diventerebbe una moltiplicazione.
     */
    it('ARI-10 «cinque per cento» è una percentuale e resta tale', () => {
        expect(normalizzaAritmetica('lo sconto è del cinque per cento')).toBe('lo sconto è del cinque per cento')
        expect(normalizzaAritmetica('tre per mille')).toBe('tre per mille')
        expect(normalizzaAritmetica('il 10 per 100 degli iscritti')).toBe('il 10 per 100 degli iscritti')
    })

    it('ARI-11 «uno per uno» vuol dire uno alla volta', () => {
        expect(normalizzaAritmetica('controlla i file uno per uno')).toBe('controlla i file uno per uno')
    })

    it('ARI-12 un numero da solo non si converte: il Settecento è un secolo', () => {
        expect(normalizzaAritmetica('arte del Settecento')).toBe('arte del Settecento')
        expect(normalizzaAritmetica('ho sette anni')).toBe('ho sette anni')
    })

    it('ARI-13 «per» senza un numero da entrambe le parti resta com è', () => {
        for (const frase of [
            'per favore aiutami',
            'tre volte per settimana',
            '10 euro per persona',
            'passo per passo',
            'un regalo per mamma',
        ]) {
            expect(normalizzaAritmetica(frase)).toBe(frase)
        }
    })

    it('ARI-14 una lettera x in mezzo a parole non è un operatore', () => {
        expect(normalizzaAritmetica('il punto x del grafico')).toBe('il punto x del grafico')
    })
})
