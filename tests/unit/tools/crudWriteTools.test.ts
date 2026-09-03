import { describe, expect, it, vi } from 'vitest'
import { createTalosMemoryWriteTools } from '@/lib/tools/memoryWriteTools'
import { createTalosLibraryWriteTools } from '@/lib/tools/libraryWriteTools'

/**
 * Il CRUD di Memoria e Libreria, e le due proprieta' che lo rendono robusto.
 *
 * Owner 2026-08-07: «la libreria e la memoria non hanno un tool crud completo,
 * hanno solo inserimento e read». Questi test coprono i quattro verbi mancanti,
 * ma soprattutto le due proprieta' che la ricerca dice essere quelle che
 * contano davvero quando un agente scrive:
 *
 * 1. **Deduplicazione.** Salvare due volte la stessa cosa non produce due
 *    righe. (Anthropic, «Writing effective tools for AI agents»: gli errori
 *    devono guidare, e una scrittura ripetuta va resa innocua.)
 * 2. **Verifica della postcondizione.** Se la scrittura riesce ma la risposta
 *    si perde, il tool rilegge e dice la verita' invece di dire «fallito» —
 *    perche' «fallito» e' l'istruzione che fa ritentare, e il ritentativo e'
 *    cio' che crea il doppione. Misurato: doppioni dal 72% al 20%
 *    (arXiv 2608.02645), con quasi tutto il guadagno dalla sola verifica.
 */

function memoria(overrides: Partial<Parameters<typeof createTalosMemoryWriteTools>[0]> = {}) {
    return createTalosMemoryWriteTools({
        create: vi.fn(async () => ({ title: 'Risposte brevi' })),
        update: vi.fn(async () => ({ id: 'm1', title: 'Risposte brevi' })),
        remove: vi.fn(async () => undefined),
        find: vi.fn(async () => null),
        findByTitle: vi.fn(async () => null),
        ...overrides,
    })
}

function tool(lista: ReturnType<typeof memoria>, nome: string) {
    const trovato = lista.find((riga) => riga.name === nome)
    if (!trovato) throw new Error(`tool assente: ${nome}`)
    return trovato
}

const CONTESTO = {} as never

describe('memoria: i verbi che mancavano', () => {
    it('memory_update rifiuta una patch vuota e indica memory_delete', async () => {
        const update = vi.fn(async () => ({ id: 'm1', title: 'x' }))
        const esito = await tool(memoria({ update }), 'memory_update')
            .run({ id: 'm1' } as never, CONTESTO)

        expect(esito.ok).toBe(false)
        expect(esito.code).toBe('TALOS_MEMORY_UPDATE_EMPTY')
        expect(esito.content).toContain('memory_delete')
        // La prova che morde: non deve aver TOCCATO il deposito.
        expect(update).not.toHaveBeenCalled()
    })

    it('memory_update corregge, e non riattiva quello che l utente aveva spento', async () => {
        const update = vi.fn(async () => ({ id: 'm1', title: 'Risposte brevi e in italiano' }))
        const esito = await tool(memoria({ update }), 'memory_update')
            .run({ id: 'm1', content: 'brevi e in italiano' } as never, CONTESTO)

        expect(esito.ok).toBe(true)
        // Passa un patch, non una riga intera: e' quello che tiene fermo lo stato.
        expect(update).toHaveBeenCalledWith({
            id: 'm1', title: undefined, content: 'brevi e in italiano', kind: undefined,
        })
    })

    it('memory_delete dice che un backup gia fatto conserva comunque una copia', async () => {
        const esito = await tool(memoria(), 'memory_delete')
            .run({ id: 'm1' } as never, CONTESTO)

        expect(esito.ok).toBe(true)
        expect(esito.content.toLowerCase()).toContain('backup')
    })

    it('un id che non esiste manda a memory_search invece di dire «errore»', async () => {
        const update = vi.fn(async () => { throw new Error('TALOS_MEMORY_NOT_FOUND') })
        const esito = await tool(memoria({ update }), 'memory_update')
            .run({ id: 'inventato', content: 'x' } as never, CONTESTO)

        expect(esito.ok).toBe(false)
        expect(esito.code).toBe('TALOS_MEMORY_NOT_FOUND')
        expect(esito.content).toContain('memory_search')
    })
})

describe('la proprieta 1: non si sdoppia', () => {
    it('memory_write non crea una seconda memoria con lo stesso titolo', async () => {
        const create = vi.fn(async () => ({ title: 'Risposte brevi' }))
        const findByTitle = vi.fn(async () => ({ id: 'm1', title: 'Risposte brevi' }))
        const esito = await tool(memoria({ create, findByTitle }), 'memory_write')
            .run({ title: 'Risposte brevi', content: 'Le preferisco corte.', kind: 'preference' } as never, CONTESTO)

        expect(esito.ok).toBe(true)
        expect(create).not.toHaveBeenCalled()
        expect(esito.evidence).toMatchObject({ deduplicated: true, id: 'm1' })
        // E indica la strada giusta se il fatto e' cambiato davvero.
        expect(esito.content).toContain('memory_update')
    })

    it('ma scrive normalmente quando il titolo e nuovo', async () => {
        const create = vi.fn(async () => ({ title: 'Risposte brevi' }))
        const esito = await tool(memoria({ create }), 'memory_write')
            .run({ title: 'Risposte brevi', content: 'Le preferisco corte.', kind: 'preference' } as never, CONTESTO)

        expect(esito.ok).toBe(true)
        expect(create).toHaveBeenCalledTimes(1)
    })
})

describe('la proprieta 2: si verifica prima di dire «non e andata»', () => {
    it('memory_delete: se la riga non c e piu, la cancellazione ERA riuscita', async () => {
        // Il caso non atomico: l'effetto c'e', la risposta si e' persa.
        const remove = vi.fn(async () => { throw new Error('bridge timeout') })
        const find = vi.fn(async () => null)
        const esito = await tool(memoria({ remove, find }), 'memory_delete')
            .run({ id: 'm1' } as never, CONTESTO)

        expect(esito.ok).toBe(true)
        expect(esito.evidence).toMatchObject({ verified_after_error: true })
    })

    it('memory_delete: se la riga c e ancora, il guasto e vero e si dice', async () => {
        const remove = vi.fn(async () => { throw new Error('bridge timeout') })
        const find = vi.fn(async () => ({ id: 'm1', title: 'x', content: 'y' }))
        const esito = await tool(memoria({ remove, find }), 'memory_delete')
            .run({ id: 'm1' } as never, CONTESTO)

        expect(esito.ok).toBe(false)
        expect(esito.code).toBe('TALOS_MEMORY_DELETE_FAILED')
    })

    it('memory_update: se il testo risulta gia corretto, era riuscita', async () => {
        const update = vi.fn(async () => { throw new Error('bridge timeout') })
        const find = vi.fn(async () => ({ id: 'm1', title: 'x', content: 'brevi e in italiano' }))
        const esito = await tool(memoria({ update, find }), 'memory_update')
            .run({ id: 'm1', content: 'brevi e in italiano' } as never, CONTESTO)

        expect(esito.ok).toBe(true)
        expect(esito.evidence).toMatchObject({ verified_after_error: true })
    })

    it('memory_update: se il testo e ancora quello vecchio, NON si dice riuscita', async () => {
        const update = vi.fn(async () => { throw new Error('bridge timeout') })
        const find = vi.fn(async () => ({ id: 'm1', title: 'x', content: 'quello vecchio' }))
        const esito = await tool(memoria({ update, find }), 'memory_update')
            .run({ id: 'm1', content: 'brevi e in italiano' } as never, CONTESTO)

        expect(esito.ok).toBe(false)
    })
})

function libreria(overrides: Partial<Parameters<typeof createTalosLibraryWriteTools>[0]> = {}) {
    return createTalosLibraryWriteTools({
        describe: vi.fn(async () => ({ id: 'f1', name: 'bilancio.xlsx' })),
        rename: vi.fn(async () => ({ id: 'f1', name: 'bilancio 2026.xlsx' })),
        remove: vi.fn(async () => undefined),
        ...overrides,
    })
}

describe('libreria: rinominare e togliere', () => {
    it('library_rename dice ENTRAMBI i nomi, per accorgersi del file sbagliato', async () => {
        const esito = await tool(libreria() as never, 'library_rename')
            .run({ id: 'f1', name: 'bilancio 2026.xlsx' } as never, CONTESTO)

        expect(esito.ok).toBe(true)
        expect(esito.content).toContain('bilancio.xlsx')
        expect(esito.content).toContain('bilancio 2026.xlsx')
    })

    it('un nome fatto solo di barre viene rifiutato, non trasformato in cartelle', async () => {
        const rename = vi.fn(async () => ({ id: 'f1', name: 'x' }))
        const esito = await tool(libreria({ rename }) as never, 'library_rename')
            .run({ id: 'f1', name: '///' } as never, CONTESTO)

        expect(esito.ok).toBe(false)
        expect(esito.code).toBe('TALOS_LIBRARY_NAME_EMPTY')
        expect(rename).not.toHaveBeenCalled()
    })

    it('un id inesistente non arriva mai alla cancellazione', async () => {
        const remove = vi.fn(async () => undefined)
        const esito = await tool(
            libreria({ describe: vi.fn(async () => null), remove }) as never,
            'library_delete',
        ).run({ id: 'mai-esistito' } as never, CONTESTO)

        expect(esito.ok).toBe(false)
        expect(esito.code).toBe('TALOS_LIBRARY_FILE_NOT_FOUND')
        expect(remove).not.toHaveBeenCalled()
    })

    it('library_delete nomina il file che ha tolto', async () => {
        const esito = await tool(libreria() as never, 'library_delete')
            .run({ id: 'f1' } as never, CONTESTO)

        expect(esito.ok).toBe(true)
        expect(esito.content).toContain('bilancio.xlsx')
    })

    it('library_delete: sparito dopo un errore vuol dire riuscito', async () => {
        let chiamate = 0
        const describe = vi.fn(async () => {
            chiamate += 1
            // La prima lettura e' quella PRIMA della cancellazione.
            return chiamate === 1 ? { id: 'f1', name: 'bilancio.xlsx' } : null
        })
        const remove = vi.fn(async () => { throw new Error('bridge timeout') })
        const esito = await tool(libreria({ describe, remove }) as never, 'library_delete')
            .run({ id: 'f1' } as never, CONTESTO)

        expect(esito.ok).toBe(true)
        expect(esito.evidence).toMatchObject({ verified_after_error: true })
    })
})

/*
 * ⭐⭐⭐ LA POSTCONDIZIONE SULLA LIBRERIA — A5.
 *
 * `run` gia si verifica nel ramo del GUASTO («se e andata comunque, dillo»).
 * `verify` copre il verso opposto, che mancava: un `run` che dice di si e non
 * ha lasciato traccia. Peggiore dei due, perche nessuno va a controllare.
 */
describe('la postcondizione: un «fatto» che non regge si DEGRADA', () => {
    it('⭐ library_rename: se il nome e cambiato davvero, la verifica regge', async () => {
        const strumenti = libreria({ describe: vi.fn(async () => ({ id: 'f1', name: 'bilancio 2026.xlsx' })) })
        const rinomina = tool(strumenti as never, 'library_rename')
        const input = { id: 'f1', name: 'bilancio 2026.xlsx' } as never
        expect(await rinomina.verify!(input, null, CONTESTO)).toEqual({ held: true })
    })

    it('⛔⛔ library_rename: se il file ha ancora il nome VECCHIO, verify boccia', async () => {
        const strumenti = libreria()   // `describe` continua a rispondere «bilancio.xlsx»
        const rinomina = tool(strumenti as never, 'library_rename')
        const input = { id: 'f1', name: 'bilancio 2026.xlsx' } as never
        const verdetto = await rinomina.verify!(input, null, CONTESTO)
        expect(verdetto.held).toBe(false)
    })

    /*
     * ⛔ Il nome si confronta NORMALIZZATO. `run` toglie i separatori di
     * percorso prima di rinominare: confrontare la stringa grezza accuserebbe
     * il tool di non aver fatto proprio la cosa che ha fatto bene.
     */
    it('⛔ library_rename: una barra nel nome chiesto NON fa fallire la verifica', async () => {
        const strumenti = libreria({ describe: vi.fn(async () => ({ id: 'f1', name: 'a b.xlsx' })) })
        const rinomina = tool(strumenti as never, 'library_rename')
        const verdetto = await rinomina.verify!({ id: 'f1', name: 'a/b.xlsx' } as never, null, CONTESTO)
        expect(verdetto.held).toBe(true)
    })

    it('⭐ library_delete: se il file non c e piu, la verifica regge', async () => {
        const strumenti = libreria({ describe: vi.fn(async () => null) })
        const cancella = tool(strumenti as never, 'library_delete')
        expect(await cancella.verify!({ id: 'f1' } as never, null, CONTESTO)).toEqual({ held: true })
    })

    /*
     * ⛔ Il caso peggiore del banco: il modello dice «cancellato» e il file e
     * ancora li. Un'assenza non si vede finche non la si cerca.
     */
    it('⛔⛔ library_delete: se il file e ancora li, verify boccia', async () => {
        const strumenti = libreria()   // `describe` lo trova ancora
        const cancella = tool(strumenti as never, 'library_delete')
        const verdetto = await cancella.verify!({ id: 'f1' } as never, null, CONTESTO)
        expect(verdetto.held).toBe(false)
    })
})

