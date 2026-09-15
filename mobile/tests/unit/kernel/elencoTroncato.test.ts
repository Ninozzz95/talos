import { describe, expect, it } from 'vitest'
import { costruisciCatalogo, risolviSimbolo } from '@/lib/kernel/catalogo'

/**
 * ⛔⛔⛔ LA COPERTURA HA DUE LIVELLI, e ne avevo uno solo.
 *
 * ```
 * ho potuto LEGGERE ogni file che ho elencato?   ← c'era
 * ho ELENCATO tutti i file che ci sono?          ← non c'era
 * ```
 *
 * Il secondo non è teorico: su un telefono lo spazio di lavoro ha un tetto —
 * non si tiene in memoria un progetto senza limite — e una cartella può fallire
 * a metà lettura. In entrambi i casi il catalogo non sa di essere parziale, e
 * un file esistente ma non elencato produce **«ASSENTE: il file non esiste»**.
 *
 * ⇒ È la bugia peggiore che questo kernel possa dire, perché ha la forma esatta
 * della verità che sa produrre.
 */

const elencati = [{ percorso: 'src/a.ts', testo: 'export const alfa = 1\n' }]

describe('un elenco TRONCATO non può concludere ASSENTE', () => {
    it('⛔ su un file che non è stato elencato', async () => {
        const c = await costruisciCatalogo(elencati, { elenco: { troncato: 'stopped at 500 files' } })
        const e = risolviSimbolo(c, 'beta', 'src/b.ts')
        expect(e.stato).toBe('ignoto')
        expect(e.stato === 'ignoto' && e.perche).toContain('500')
    })

    it('⛔ e nemmeno su una cartella elencata solo in parte', async () => {
        const c = await costruisciCatalogo(elencati, { elenco: { troncato: 'the folder could not be listed fully' } })
        expect(risolviSimbolo(c, 'beta', 'src').stato).toBe('ignoto')
    })

    it('⭐ ma PRESENTE resta presente: un testimone visto è visto', async () => {
        const c = await costruisciCatalogo(elencati, { elenco: { troncato: 'stopped at 500 files' } })
        expect(risolviSimbolo(c, 'alfa', 'src/a.ts').stato).toBe('presente')
        // ⛔ Un elenco parziale toglie il potere di dire «non c'è», non quello
        // di dire «c'è»: averlo visto è una prova che il troncamento non tocca.
    })

    it('⭐ e con l\'elenco completo si conclude come prima', async () => {
        const c = await costruisciCatalogo(elencati)
        expect(risolviSimbolo(c, 'beta', 'src/b.ts').stato).toBe('assente')
        expect(risolviSimbolo(c, 'beta', 'src').stato).toBe('assente')
    })
})
