import { describe, expect, it } from 'vitest'
import { cancelloSemantico } from '@/lib/kernel/semantica'
import type { TalosSorgente } from '@/lib/kernel/catalogo'

/**
 * ⛔⛔⛔ ZITTIRE UN ERRORE NON È RISOLVERLO.
 *
 * Il guard differenziale confronta le diagnostiche prima e dopo. Ma un modello
 * può far sparire una diagnostica in due modi opposti:
 *
 *   correggendo il riferimento    ← quello che vogliamo
 *   mettendoci sopra `@ts-ignore` ← quello che NON deve passare
 *
 * Nel secondo caso il conteggio delle diagnostiche non aumenta — anzi resta
 * uguale — e un guard che guarda solo quel conteggio dice di sì.
 */

const PREZZO = 'src/prezzo.ts'
const alberi = (t: string): TalosSorgente[] => ([{ percorso: PREZZO, testo: t }])

describe('le soppressioni introdotte', () => {
    it('⛔⛔ un `@ts-ignore` nuovo NON deve far passare un riferimento inventato', async () => {
        const prima = alberi('export const x = 1\n')
        const dopo = alberi('// @ts-ignore\nexport const x = nonEsisteProprio()\n')
        const esito = await cancelloSemantico(prima, dopo)
        expect(esito.stato).not.toBe('presente')
    })

    it('⛔ e nemmeno un `@ts-expect-error`', async () => {
        const prima = alberi('export const x = 1\n')
        const dopo = alberi('// @ts-expect-error\nexport const x = nonEsisteProprio()\n')
        const esito = await cancelloSemantico(prima, dopo)
        expect(esito.stato).not.toBe('presente')
    })

    it('⭐ ma una soppressione che c\'era GIÀ non blocca il lavoro legittimo', async () => {
        const conIgnora = '// @ts-ignore\nexport const vecchio = giaRotto()\n'
        const prima = alberi(`${conIgnora}export const x = 1\n`)
        const dopo = alberi(`${conIgnora}export const x = 2\n`)
        expect((await cancelloSemantico(prima, dopo)).stato).toBe('presente')
    })
})
