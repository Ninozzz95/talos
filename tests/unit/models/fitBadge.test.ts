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
        const troppo = talosFitBadge({
            state: 'memory-blocked',
            limit: 'memory',
            needsBytes: 5.4 * GB,
            availableBytes: 4.1 * GB,
            missingBytes: 1.3 * GB,
        })
        expect(troppo.ratio).toBeGreaterThan(1)
        expect(troppo.tone).toBe('over')

        const comodo = talosFitBadge({
            state: 'fits',
            limit: 'memory',
            needsBytes: 2.6 * GB,
            availableBytes: 4.1 * GB,
            missingBytes: 0,
        })
        expect(comodo.ratio).toBeLessThan(1)
        expect(comodo.tone).toBe('ok')
    })

    it('un modello enorme non disegna una barra fuori dallo schermo', () => {
        // «Dieci volte troppo» e «due volte troppo» portano alla stessa
        // decisione: il numero esatto resta nella frase, non nella barra.
        const enorme = talosFitBadge({
            state: 'storage-blocked',
            limit: 'storage',
            needsBytes: 400 * GB,
            availableBytes: 4 * GB,
            missingBytes: 396 * GB,
        })
        expect(enorme.ratio).toBeLessThanOrEqual(1.6)
    })

    it('memoria e disco hanno parole diverse', () => {
        const memory = talosFitBadge({
            state: 'memory-blocked', limit: 'memory', needsBytes: 5 * GB,
            availableBytes: 4 * GB, missingBytes: GB,
        })
        const storage = talosFitBadge({
            state: 'storage-blocked', limit: 'storage', needsBytes: 5 * GB,
            availableBytes: 4 * GB, missingBytes: GB,
        })

        expect(memory.labelKey).toBe('models.fitLabel.no-memory')
        expect(storage.labelKey).toBe('models.fitLabel.no-space')
        expect(memory.reasonKey).not.toBe(storage.reasonKey)
    })

    it('il numero è azionabile: quanto resta, o quanto manca', () => {
        // «5,4 GB» non dice a nessuno quanto deve liberare.
        expect(talosFitDelta(2.6 * GB, 4.1 * GB)).toBeGreaterThan(0)
        expect(talosFitDelta(5.4 * GB, 4.1 * GB)).toBeLessThan(0)
    })

    it('una memoria libera a zero non fa esplodere il conto', () => {
        // Succede: un dispositivo sotto pressione riporta zero. Una divisione
        // per zero qui darebbe una barra infinita invece di un verdetto.
        const esito = talosFitBadge({
            state: 'memory-blocked', limit: 'memory', needsBytes: GB,
            availableBytes: 0, missingBytes: GB,
        })
        expect(Number.isFinite(esito.ratio)).toBe(true)
    })

    it('un verdetto sconosciuto non disegna un rapporto fittizio', () => {
        const esito = talosFitBadge({
            state: 'unknown',
            reason: 'storage-measurement',
        })

        expect(esito).toMatchObject({
            tone: 'unknown',
            ratio: null,
            labelKey: 'models.fitLabel.unknown',
            reasonKey: 'models.fitReason.unknown-storage-measurement',
        })
    })
})
