import { describe, expect, it, vi } from 'vitest'
import { createTalosTasksWriteTools } from '@/lib/tools/tasksWriteTools'

function toolsOver(sources: Parameters<typeof createTalosTasksWriteTools>[0]) {
    const tools = createTalosTasksWriteTools(sources)
    const by = (name: string) => {
        const tool = tools.find((candidate) => candidate.name === name)
        if (!tool) throw new Error(`missing tool ${name}`)
        return tool
    }
    return { create: by('tasks_create'), complete: by('tasks_complete'), remove: by('tasks_delete') }
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
        const { create: tool } = toolsOver({ create, setStatus: vi.fn(), remove: vi.fn() } as never)

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
        const { create: tool } = toolsOver({ create, setStatus: vi.fn(), remove: vi.fn() } as never)

        await tool.run({ title: 'x', description: '   ', priority: 'low' } as never, {} as never)

        expect(create.mock.calls[0][0]).toMatchObject({ description: null })
    })

    it('closes a task by default, without needing a status', async () => {
        const setStatus = vi.fn(async () => ({ id: 'task-1', title: 'Chiamare' }))
        const { complete: tool } = toolsOver({ create: vi.fn(), setStatus, remove: vi.fn() } as never)

        const result = await tool.run({ id: 'task-1', status: 'done' } as never, {} as never)

        expect(setStatus).toHaveBeenCalledWith('task-1', 'done')
        expect(result.ok).toBe(true)
        expect(result.evidence).toMatchObject({ status: 'done' })
    })

    it('can move a task back, not only forward', async () => {
        const setStatus = vi.fn(async () => ({ id: 'task-1', title: 'Chiamare' }))
        const { complete: tool } = toolsOver({ create: vi.fn(), setStatus, remove: vi.fn() } as never)

        const result = await tool.run({ id: 'task-1', status: 'todo' } as never, {} as never)

        expect(setStatus).toHaveBeenCalledWith('task-1', 'todo')
        expect(result.ok).toBe(true)
    })

    it('says a missing task is missing, so the model does not retry identically', async () => {
        const setStatus = vi.fn(async () => { throw new Error('TALOS_TASK_NOT_FOUND') })
        const { complete: tool } = toolsOver({ create: vi.fn(), setStatus, remove: vi.fn() } as never)

        const result = await tool.run({ id: 'ghost', status: 'done' } as never, {} as never)

        expect(result.ok).toBe(false)
        expect(result.evidence).toMatchObject({ error_code: 'TALOS_TASK_NOT_FOUND' })
    })

    /** Già assente è l'esito che si voleva, ottenuto da qualcun altro. */
    it('treats deleting an absent task as done', async () => {
        const remove = vi.fn(async () => { throw new Error('TALOS_TASK_NOT_FOUND') })
        const { remove: tool } = toolsOver({ create: vi.fn(), setStatus: vi.fn(), remove } as never)

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
        const { remove: tool } = toolsOver({ create: vi.fn(), setStatus: vi.fn(), remove } as never)

        const result = await tool.run({ id: 'task-1' } as never, {} as never)

        expect(result.ok).toBe(false)
        expect(result.evidence).toMatchObject({ error_code: 'TALOS_TASK_DELETE_FAILED' })
    })
})
