import { describe, expect, it, vi } from 'vitest'
import { createTalosNotesWriteTools } from '@/lib/tools/notesWriteTools'
import { createMemoryChatRepository } from '@/repositories/memoryChatRepository'

function toolsOver(sources: Parameters<typeof createTalosNotesWriteTools>[0]) {
    const tools = createTalosNotesWriteTools(sources)
    const by = (name: string) => {
        const tool = tools.find((candidate) => candidate.name === name)
        if (!tool) throw new Error(`missing tool ${name}`)
        return tool
    }
    return { create: by('notes_create'), update: by('notes_update'), remove: by('notes_delete') }
}

/**
 * C45-RED-19G — le note si SCRIVONO dalla chat.
 *
 * Owner 2026-08-05: ogni funzione deve avere le due porte. Le note avevano solo
 * `notes_list`, quindi «prendi nota che…» produceva una risposta cortese e
 * nessuna nota. Sotto c'era un buco più profondo: nel deposito una nota si
 * poteva creare e cancellare, mai modificare.
 */
describe('C45-RED-19G notes write tools', () => {
    it('saves a note and says the id, so the next turn can correct it', async () => {
        const create = vi.fn(async () => ({ id: 'note-1', title: 'Codice cancello' }))
        const { create: tool } = toolsOver({
            create,
            update: vi.fn(),
            remove: vi.fn(),
        } as never)

        const result = await tool.run({ title: '  Codice cancello  ', content: '  4471  ' } as never, {} as never)

        // Ripulito prima di salvare: uno spazio in coda diventa un titolo che
        // non si riordina come ci si aspetta.
        expect(create).toHaveBeenCalledWith({ title: 'Codice cancello', content: '4471' })
        expect(result.ok).toBe(true)
        expect(result.content).toContain('note-1')
    })

    it('refuses an update that changes nothing, in words the model can act on', async () => {
        const update = vi.fn()
        const { update: tool } = toolsOver({ create: vi.fn(), update, remove: vi.fn() } as never)

        const result = await tool.run({ id: 'note-1' } as never, {} as never)

        expect(result.ok).toBe(false)
        expect(update).not.toHaveBeenCalled()
    })

    /**
     * Il caso che rende la modifica sicura: un modello che vuole correggere il
     * titolo manda SOLO il titolo. Se il campo assente valesse «svuota», quella
     * chiamata cancellerebbe il corpo della nota — e la perdita si vedrebbe solo
     * aprendola.
     */
    it('an omitted field is left alone, never cleared', async () => {
        const update = vi.fn(async () => ({ id: 'note-1', title: 'Nuovo titolo' }))
        const { update: tool } = toolsOver({ create: vi.fn(), update, remove: vi.fn() } as never)

        await tool.run({ id: 'note-1', title: 'Nuovo titolo' } as never, {} as never)

        expect(update).toHaveBeenCalledWith({ id: 'note-1', title: 'Nuovo titolo' })
        expect(update.mock.calls[0][0]).not.toHaveProperty('content')
    })

    it('says a missing note is missing, instead of failing generically', async () => {
        const update = vi.fn(async () => { throw new Error('TALOS_NOTE_NOT_FOUND') })
        const { update: tool } = toolsOver({ create: vi.fn(), update, remove: vi.fn() } as never)

        const result = await tool.run({ id: 'ghost', title: 'x' } as never, {} as never)

        expect(result.ok).toBe(false)
        expect(result.evidence).toMatchObject({ error_code: 'TALOS_NOTE_NOT_FOUND' })
    })

    /** Già assente è l'esito che si voleva, ottenuto da qualcun altro. */
    it('treats deleting an absent note as done, not as a failure', async () => {
        const remove = vi.fn(async () => { throw new Error('TALOS_NOTE_NOT_FOUND') })
        const { remove: tool } = toolsOver({ create: vi.fn(), update: vi.fn(), remove } as never)

        const result = await tool.run({ id: 'ghost' } as never, {} as never)

        expect(result.ok).toBe(true)
        expect(result.evidence).toMatchObject({ already_absent: true })
    })

    /**
     * La prova che conta davvero: contro il deposito vero, non contro finzioni.
     *
     * `updateNote` non esisteva affatto — l'entità portava `updated_at` dal primo
     * giorno e nessuno lo muoveva mai. Qui si guarda l'ESITO: la nota cambia,
     * tiene la sua identità e la sua data di nascita, e il campo di modifica si
     * muove per davvero.
     */
    it('C45-RED-19G updates a real note in place, keeping id and birth date', async () => {
        const repository = createMemoryChatRepository()
        const created = await repository.createNote({
            id: 'note-1',
            title: 'Titolo con refuo',
            content: 'Il corpo lungo che non va perso.',
            created_at: '2026-08-01T10:00:00.000Z',
        })

        const updated = await repository.updateNote({ id: 'note-1', title: 'Titolo corretto' })

        expect(updated.id).toBe(created.id)
        expect(updated.created_at).toBe(created.created_at)
        expect(updated.title).toBe('Titolo corretto')
        // Il corpo NON è stato toccato: è il punto di tutto.
        expect(updated.content).toBe('Il corpo lungo che non va perso.')
        expect(updated.updated_at).not.toBe(created.updated_at)

        const [listed] = await repository.listNotes()
        expect(listed).toMatchObject({ id: 'note-1', title: 'Titolo corretto' })
    })

    it('C45-RED-19G refuses to update a note that is not there', async () => {
        const repository = createMemoryChatRepository()
        await expect(repository.updateNote({ id: 'ghost', title: 'x' }))
            .rejects.toThrow('TALOS_NOTE_NOT_FOUND')
    })
})
