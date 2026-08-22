import { describe, expect, it } from 'vitest'
import { createTalosResearchTools } from '@/lib/tools/researchTools'

/**
 * Owner 2026-08-03: «per concludere il blocco research dobbiamo fare la stessa
 * cosa che abbiamo fatto per la libreria … chiedendo alla chat quali sono le
 * mie ricerche. Non dobbiamo inventarci nulla.»
 *
 * E subito dopo l'avvertimento che conta: «mi raccomando non mi schiamo i due
 * metodi. La Libreria deve rispondere ai prompt riguardo alla libreria, e
 * quelli della ricerca… quelli della ricerca. Sembra una cosa scontata, ma non
 * lo e'.»
 */
function run(over: Record<string, unknown> = {}) {
    return {
        id: 'r1',
        question: 'quanti abitanti ha Palermo',
        title: null,
        status: 'done',
        startedAt: '2026-08-01T10:00:00.000Z',
        updatedAt: '2026-08-01T10:05:00.000Z',
        plan: [],
        steps: [],
        ...over,
    } as never
}

function tool(runs: unknown[], running: string[] = []) {
    return createTalosResearchTools({
        list: async () => runs as never,
        isRunning: (id) => running.includes(id),
    })[0]!
}

describe('research_list', () => {
    it('si distingue da library_list NELLA DESCRIZIONE, che e dove serve', () => {
        /**
         * I rapporti di ricerca SONO file di Libreria: `library_list` li elenca
         * come documenti qualsiasi. Senza questa riga il modello risponderebbe
         * a «che ricerche ho fatto» sfogliando la Libreria — e sembrerebbe pure
         * che funzioni, mentre restituisce anche la lista della spesa e non sa
         * dire se una ricerca e' finita, in pausa o fallita.
         */
        const definizione = tool([])
        expect(definizione.name).toBe('research_list')
        expect(definizione.description).toContain('library_list')
        expect(definizione.description.toLowerCase()).toContain('do not use library_list')
    })

    it('e una LETTURA, quindi passa dal permesso read come gli altri', () => {
        expect(tool([]).action).toBe('read')
    })

    it('elenca le ricerche, le piu recenti per prime', async () => {
        const esito = await tool([
            run({ id: 'vecchia', question: 'prima', startedAt: '2026-07-01T09:00:00.000Z' }),
            run({ id: 'nuova', question: 'seconda', startedAt: '2026-08-02T09:00:00.000Z' }),
        ]).run({ status: 'all', page_size: 10, offset: 0 } as never, {} as never)
        expect(esito.ok).toBe(true)
        expect(esito.content.indexOf('seconda')).toBeLessThan(esito.content.indexOf('prima'))
    })

    it('distingue «nessuna» da «nessuna di quel tipo»', async () => {
        // Dire la prima quando vale la seconda manda a rifare una ricerca che
        // esiste gia'.
        const vuota = await tool([]).run({ status: 'all', page_size: 10, offset: 0 } as never, {} as never)
        expect(vuota.content).toMatch(/no deep research has been run/i)

        const filtrata = await tool([run()]).run({ status: 'failed', page_size: 10, offset: 0 } as never, {} as never)
        expect(filtrata.content).toMatch(/though others exist/i)
    })

    it('non fa sparire la lista quando il giornale non si legge', async () => {
        const rotto = createTalosResearchTools({
            list: async () => { throw new Error('sqlite') },
            isRunning: () => false,
        })[0]!
        const esito = await rotto.run({ status: 'all', page_size: 10, offset: 0 } as never, {} as never)
        // Un guasto detto per nome, non un elenco vuoto che sembra «non ne hai».
        expect(esito.ok).toBe(false)
        expect(esito.content).toMatch(/could not be read/i)
    })
})
