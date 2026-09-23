import { describe, expect, it, vi } from 'vitest'
import { createTalosTasksWriteTools } from '@/lib/tools/tasksWriteTools'

function toolsOver(sources: Parameters<typeof createTalosTasksWriteTools>[0]) {
    const tools = createTalosTasksWriteTools(sources)
    const by = (name: string) => {
        const tool = tools.find((candidate) => candidate.name === name)
        if (!tool) throw new Error(`missing tool ${name}`)
        return tool
    }
    return {
        create: by('tasks_create'),
        complete: by('tasks_complete'),
        update: by('tasks_update'),
        remove: by('tasks_delete'),
    }
}

/**
 * C45-RED-19I — le attività si creano e si chiudono dalla chat.
 *
 * Stesso buco delle note, sulla funzione accanto: esisteva `tasks_list` e basta,
 * quindi «segnati che devo chiamare l'idraulico» non segnava niente e «ho finito
 * quella cosa» non spuntava niente.
 */
describe('C45-RED-19I tasks write tools', () => {
    it('adds a task, and says the id so the next turn can close it', async () => {
        const create = vi.fn(async () => ({ id: 'task-1', title: 'Chiamare l’idraulico' }))
        const { create: tool } = toolsOver({ create, setStatus: vi.fn(), update: vi.fn(), remove: vi.fn() } as never)

        const result = await tool.run({
            title: '  Chiamare l’idraulico  ',
            priority: 'normal',
        } as never, {} as never)

        expect(create).toHaveBeenCalledWith({
            title: 'Chiamare l’idraulico',
            description: null,
            priority: 'normal',
        })
        expect(result.ok).toBe(true)
        expect(result.content).toContain('task-1')
    })

    /**
     * Una descrizione fatta di spazi occuperebbe la riga del dettaglio senza
     * dire niente: vuoto e assente sono la stessa cosa, e diventano `null`.
     */
    it('treats a blank description as absent', async () => {
        const create = vi.fn(async () => ({ id: 'task-1', title: 'x' }))
        const { create: tool } = toolsOver({ create, setStatus: vi.fn(), update: vi.fn(), remove: vi.fn() } as never)

        await tool.run({ title: 'x', description: '   ', priority: 'low' } as never, {} as never)

        expect(create.mock.calls[0][0]).toMatchObject({ description: null })
    })

    it('closes a task by default, without needing a status', async () => {
        const setStatus = vi.fn(async () => ({ id: 'task-1', title: 'Chiamare' }))
        const { complete: tool } = toolsOver({ create: vi.fn(), setStatus, update: vi.fn(), remove: vi.fn() } as never)

        const result = await tool.run({ id: 'task-1', status: 'done' } as never, {} as never)

        expect(setStatus).toHaveBeenCalledWith('task-1', 'done')
        expect(result.ok).toBe(true)
        expect(result.evidence).toMatchObject({ status: 'done' })
    })

    it('can move a task back, not only forward', async () => {
        const setStatus = vi.fn(async () => ({ id: 'task-1', title: 'Chiamare' }))
        const { complete: tool } = toolsOver({ create: vi.fn(), setStatus, update: vi.fn(), remove: vi.fn() } as never)

        const result = await tool.run({ id: 'task-1', status: 'todo' } as never, {} as never)

        expect(setStatus).toHaveBeenCalledWith('task-1', 'todo')
        expect(result.ok).toBe(true)
    })

    it('says a missing task is missing, so the model does not retry identically', async () => {
        const setStatus = vi.fn(async () => { throw new Error('TALOS_TASK_NOT_FOUND') })
        const { complete: tool } = toolsOver({ create: vi.fn(), setStatus, update: vi.fn(), remove: vi.fn() } as never)

        const result = await tool.run({ id: 'ghost', status: 'done' } as never, {} as never)

        expect(result.ok).toBe(false)
        expect(result.evidence).toMatchObject({ error_code: 'TALOS_TASK_NOT_FOUND' })
    })

    /**
     * ⛔⭐ Il CRUD delle attività era senza la U.
     *
     * Owner 2026-08-07: «collega attività a TALOS in modo che possa chiamarle da
     * chat, tool CRUD completo». Mancava il pezzo più banale e più chiesto:
     * correggere. Chi sbagliava a dettare un titolo doveva cancellare
     * l'attività e rifarla — e rifarla le cambia l'identità, quindi con essa se
     * ne andavano lo storico, la pianificazione e il legame con l'esecuzione
     * che l'aveva generata. Un refuso non deve costare tutto questo.
     */
    it('cambia solo i campi mandati, e lascia stare gli altri', async () => {
        const update = vi.fn(async () => ({ id: 'task-1', title: 'Chiamare il dentista' }))
        const { update: tool } = toolsOver({
            create: vi.fn(), setStatus: vi.fn(), update, remove: vi.fn(),
        } as never)

        const result = await tool.run({ id: 'task-1', title: 'Chiamare il dentista' } as never, {} as never)

        // Un solo campo nella patch: la priorità e il dettaglio non compaiono,
        // ed è la differenza fra «modifica» e «riscrivi».
        expect(update).toHaveBeenCalledWith('task-1', { title: 'Chiamare il dentista' })
        expect(result.ok).toBe(true)
    })

    /**
     * `null` esplicito e assente NON sono la stessa cosa: «togli il dettaglio» e
     * «non toccare il dettaglio» sono due richieste diverse, e un tool che le
     * confonde cancella dati che nessuno gli aveva chiesto di cancellare.
     */
    it('distingue «togli il dettaglio» da «non toccare il dettaglio»', async () => {
        const update = vi.fn(async () => ({ id: 'task-1', title: 'x' }))
        const { update: tool } = toolsOver({
            create: vi.fn(), setStatus: vi.fn(), update, remove: vi.fn(),
        } as never)

        await tool.run({ id: 'task-1', description: null } as never, {} as never)
        expect(update.mock.calls[0][1]).toEqual({ description: null })

        await tool.run({ id: 'task-1', priority: 'high' } as never, {} as never)
        expect(update.mock.calls[1][1]).toEqual({ priority: 'high' })
    })

    /** Anche qui una descrizione di soli spazi è un'assenza, come in creazione. */
    it('tratta un dettaglio di soli spazi come vuoto', async () => {
        const update = vi.fn(async () => ({ id: 'task-1', title: 'x' }))
        const { update: tool } = toolsOver({
            create: vi.fn(), setStatus: vi.fn(), update, remove: vi.fn(),
        } as never)

        await tool.run({ id: 'task-1', description: '   ' } as never, {} as never)

        expect(update.mock.calls[0][1]).toEqual({ description: null })
    })

    /**
     * ⛔ Una modifica che non modifica niente si RIFIUTA.
     *
     * «Ho aggiornato l'attività» detto dopo aver toccato zero campi è la forma
     * di conferma che insegna a non fidarsi delle conferme. E succede davvero:
     * un modello che vuole spuntare un'attività manda l'id e basta, perché
     * anche cambiare stato è una modifica — per questo il rifiuto nomina
     * `tasks_complete` invece di dire soltanto no.
     */
    it('rifiuta una modifica vuota, e dice quale tool serviva', async () => {
        const update = vi.fn()
        const { update: tool } = toolsOver({
            create: vi.fn(), setStatus: vi.fn(), update, remove: vi.fn(),
        } as never)

        const result = await tool.run({ id: 'task-1' } as never, {} as never)

        expect(result.ok).toBe(false)
        expect(update).not.toHaveBeenCalled()
        expect(result.content).toContain('tasks_complete')
        expect(result.evidence).toMatchObject({ error_code: 'TALOS_TASK_UPDATE_EMPTY' })
    })

    it('e dice che l\'attività non c\'è, invece di fallire in modo generico', async () => {
        const update = vi.fn(async () => { throw new Error('TALOS_TASK_NOT_FOUND') })
        const { update: tool } = toolsOver({
            create: vi.fn(), setStatus: vi.fn(), update, remove: vi.fn(),
        } as never)

        const result = await tool.run({ id: 'ghost', title: 'x' } as never, {} as never)

        expect(result.ok).toBe(false)
        expect(result.evidence).toMatchObject({ error_code: 'TALOS_TASK_NOT_FOUND' })
    })

    /** Già assente è l'esito che si voleva, ottenuto da qualcun altro. */
    it('treats deleting an absent task as done', async () => {
        const remove = vi.fn(async () => { throw new Error('TALOS_TASK_NOT_FOUND') })
        const { remove: tool } = toolsOver({ create: vi.fn(), setStatus: vi.fn(), update: vi.fn(), remove } as never)

        const result = await tool.run({ id: 'ghost' } as never, {} as never)

        expect(result.ok).toBe(true)
        expect(result.evidence).toMatchObject({ already_absent: true })
    })

    /**
     * Il fallimento vero NON deve passare per «già assente»: sarebbe un «va
     * bene» su un'attività ancora lì, e l'utente smetterebbe di cercarla.
     */
    it('does not disguise a real failure as an absent task', async () => {
        const remove = vi.fn(async () => { throw new Error('DATABASE_LOCKED') })
        const { remove: tool } = toolsOver({ create: vi.fn(), setStatus: vi.fn(), update: vi.fn(), remove } as never)

        const result = await tool.run({ id: 'task-1' } as never, {} as never)

        expect(result.ok).toBe(false)
        expect(result.evidence).toMatchObject({ error_code: 'TALOS_TASK_DELETE_FAILED' })
    })
})

/*
 * ⭐⭐⭐ LA POSTCONDIZIONE su `tasks_update` — A5.
 *
 * ⛔ La descrizione del tool promette «Send only the fields that change. What
 * you omit stays as it is.» Una verifica che pretendesse anche i campi omessi
 * smentirebbe la promessa invece dell'effetto: e la stessa regola gia scritta
 * per le note, e vale qui per la stessa ragione.
 */
describe('la postcondizione di tasks_update', () => {
    const riga = (patch: Record<string, unknown> = {}) => ({
        id: 't1', title: 'Vecchio', status: 'todo', priority: 'normal', description: null, ...patch,
    })

    it('⭐ se il titolo e cambiato davvero, la verifica regge', async () => {
        const { update } = toolsOver({
            create: vi.fn(), setStatus: vi.fn(), update: vi.fn(), remove: vi.fn(),
            find: vi.fn(async () => riga({ title: 'Nuovo' })),
        } as never)
        const verdetto = await update.verify!({ id: 't1', title: 'Nuovo' } as never, null, {} as never)
        expect(verdetto).toEqual({ held: true })
    })

    it('⛔⛔ se il titolo e ancora quello vecchio, verify BOCCIA', async () => {
        const { update } = toolsOver({
            create: vi.fn(), setStatus: vi.fn(), update: vi.fn(), remove: vi.fn(),
            find: vi.fn(async () => riga()),
        } as never)
        const verdetto = await update.verify!({ id: 't1', title: 'Nuovo' } as never, null, {} as never)
        expect(verdetto.held).toBe(false)
    })

    it('⛔ un campo NON mandato non fa fallire la verifica', async () => {
        const { update } = toolsOver({
            create: vi.fn(), setStatus: vi.fn(), update: vi.fn(), remove: vi.fn(),
            find: vi.fn(async () => riga({ priority: 'high' })),
        } as never)
        // Si cambia solo la priorita: il titolo resta «Vecchio», e va bene cosi.
        const verdetto = await update.verify!({ id: 't1', priority: 'high' } as never, null, {} as never)
        expect(verdetto.held).toBe(true)
    })

    it('⛔⛔ e se l attivita e sparita, la verifica lo dice invece di tacere', async () => {
        const { update } = toolsOver({
            create: vi.fn(), setStatus: vi.fn(), update: vi.fn(), remove: vi.fn(),
            find: vi.fn(async () => null),
        } as never)
        const verdetto = await update.verify!({ id: 't1', title: 'Nuovo' } as never, null, {} as never)
        expect(verdetto.held).toBe(false)
    })
})

