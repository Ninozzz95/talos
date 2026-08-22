import { describe, expect, it } from 'vitest'
import { readFile } from 'node:fs/promises'
import { CATENA_ES2022, componiLibreria } from '@/lib/kernel/libreriaStandard'
import { cancelloSemantico } from '@/lib/kernel/semantica'
import { sostituisciEsistente } from '@/lib/kernel/mutazione'
import type { TalosSorgente } from '@/lib/kernel/catalogo'

/**
 * ⛔⛔⛔ IL FALSO POSITIVO CHE CHIUDEVA IL CANCELLO.
 *
 * Senza la libreria standard, `righe.length` diventa «Property 'length' does not
 * exist on type '{}'». Un cancello che accusa codice sano viene spento al terzo
 * falso allarme — e con lui se ne va anche la garanzia vera.
 */

/* ⛔ Nei test la lettura passa da `node:fs`; sul telefono passerà da altro. È il
 * motivo per cui `componiLibreria` prende la lettura da fuori. */
const daNodeModules = async (nome: string) => {
    try { return await readFile(`node_modules/typescript/lib/${nome}`, 'utf8') }
    catch { return null }
}

const PREZZO = 'src/prezzo.ts'
const conArray = (): TalosSorgente[] => ([{
    percorso: PREZZO,
    testo: 'export function totale(righe: number[]) {\n    return righe.reduce((s, r) => s + r, 0)\n}\n',
}])

describe('senza la libreria standard', () => {
    it('⛔⛔ il cancello ACCUSA codice sano', async () => {
        const esito = await sostituisciEsistente(conArray(), { percorso: PREZZO, nome: 'totale' },
            'export function totale(righe: number[]) {\n    return righe.length\n}')
        expect(esito.stato).toBe('rifiutata')
        if (esito.stato !== 'rifiutata') return
        expect(esito.messaggio).toContain('length')
        // È il difetto: `length` esiste eccome. Non lo sa il compilatore.
    })
})

describe('con la libreria standard', () => {
    it('⭐⭐ lo stesso codice sano PASSA', async () => {
        const libreria = await componiLibreria(daNodeModules)
        expect(libreria.file.size).toBe(CATENA_ES2022.length)

        const prima = conArray()
        const dopo: TalosSorgente[] = [{
            percorso: PREZZO,
            testo: 'export function totale(righe: number[]) {\n    return righe.length\n}\n',
        }]
        const esito = await cancelloSemantico(prima, dopo, libreria)
        expect(esito.stato).toBe('presente')
    })

    it('⛔ e continua a vedere i riferimenti VERAMENTE rotti', async () => {
        const libreria = await componiLibreria(daNodeModules)
        const dopo: TalosSorgente[] = [{
            percorso: PREZZO,
            testo: 'export function totale(righe: number[]) {\n    return applicaScontoVip(righe)\n}\n',
        }]
        const esito = await cancelloSemantico(conArray(), dopo, libreria)
        expect(esito.stato).toBe('assente')
        expect(esito.stato === 'assente' && esito.perche).toContain('applicaScontoVip')
        // ⛔ Il verso contrario: una libreria che zittisce tutto non è una cura.
    })

    it('⭐ e conosce Math, Promise, JSON — le cose che un progetto vero usa', async () => {
        const libreria = await componiLibreria(daNodeModules)
        const prima: TalosSorgente[] = [{ percorso: PREZZO, testo: 'export const x = 1\n' }]
        const dopo: TalosSorgente[] = [{
            percorso: PREZZO,
            testo: 'export const x = Math.round(1.5)\nexport const y = JSON.stringify({})\nexport const z = Promise.resolve(1)\n',
        }]
        expect((await cancelloSemantico(prima, dopo, libreria)).stato).toBe('presente')
    })
})

describe('quando la libreria è incompleta', () => {
    it('⛔ un file che manca non ferma tutto — la garanzia si restringe, non sparisce', async () => {
        const libreria = await componiLibreria(async (n) => (n === 'lib.es5.d.ts' ? null : daNodeModules(n)))
        expect(libreria.file.size).toBe(CATENA_ES2022.length - 1)
        // ⛔ E chi chiama può contare `file.size` e accorgersene: un cancello
        // che si restringe in silenzio sarebbe peggio di uno che si ferma.
    })
})
