import { describe, expect, it } from 'vitest'
import { talosFitBadge, talosFitDelta } from '@/lib/models/fitBadge'

const GB = 1024 * 1024 * 1024

/**
 * Owner 2026-08-04, approvando il mockup: «come etichetta che vedo sempre».
 *
 * Non un filtro: nascondere un modello perché oggi non c'è spazio toglie
 * l'informazione che domani, liberando memoria, potrebbe starci — e toglie
 * anche il motivo per liberarla.
 */
describe('la capienza si vede, non si calcola', () => {
    it('la barra OLTREPASSA il segno quando il modello sfora', () => {
        // È ciò che rende il limite visibile invece di leggibile: una barra che
        // si ferma al bordo dice «pieno», non «non ci sta».
        const troppo = talosFitBadge({ band: 'wont-run', needsBytes: 5.4 * GB, availableBytes: 4.1 * GB })
        expect(troppo.ratio).toBeGreaterThan(1)
        expect(troppo.tone).toBe('over')

        const comodo = talosFitBadge({ band: 'comfortable', needsBytes: 2.6 * GB, availableBytes: 4.1 * GB })
        expect(comodo.ratio).toBeLessThan(1)
        expect(comodo.tone).toBe('ok')
    })

    it('un modello enorme non disegna una barra fuori dallo schermo', () => {
        // «Dieci volte troppo» e «due volte troppo» portano alla stessa
        // decisione: il numero esatto resta nella frase, non nella barra.
        const enorme = talosFitBadge({ band: 'wont-run', needsBytes: 400 * GB, availableBytes: 4 * GB })
        expect(enorme.ratio).toBeLessThanOrEqual(1.6)
    })

    it('«girerà lentissimo» si colora come «non ci sta»', () => {
        /**
         * Per chi guarda una lista la decisione è la stessa: non prenderlo. La
         * sfumatura resta nella frase sotto, che è il posto dove si può
         * spiegare.
         */
        expect(talosFitBadge({ band: 'will-crawl', needsBytes: GB, availableBytes: 4 * GB }).tone)
            .toBe('over')
        // Ma la FRASE resta la sua: non si perde il perché.
        expect(talosFitBadge({ band: 'will-crawl', needsBytes: GB, availableBytes: 4 * GB }).reasonKey)
            .toContain('will-crawl')
    })

    it('il numero è azionabile: quanto resta, o quanto manca', () => {
        // «5,4 GB» non dice a nessuno quanto deve liberare.
        expect(talosFitDelta(2.6 * GB, 4.1 * GB)).toBeGreaterThan(0)
        expect(talosFitDelta(5.4 * GB, 4.1 * GB)).toBeLessThan(0)
    })

    it('una memoria libera a zero non fa esplodere il conto', () => {
        // Succede: un dispositivo sotto pressione riporta zero. Una divisione
        // per zero qui darebbe una barra infinita invece di un verdetto.
        const esito = talosFitBadge({ band: 'wont-run', needsBytes: GB, availableBytes: 0 })
        expect(Number.isFinite(esito.ratio)).toBe(true)
    })
})
