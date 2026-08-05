import type { TalosChatRepository } from '@/repositories/chatRepository'
import { newTalosMobileId } from '@/lib/mobileIds'
import { upsertTalosDisplayNameMemory } from '@/services/profileMemory'

/**
 * R2-8 — station CRUD facades extracted from the chat controller (it had
 * grown into a 1000+ line god-facade; pinia guidance favors small
 * single-responsibility modules). The facades stay the stations' ONLY entry
 * point: they own id generation, timestamps and session-scope resolution —
 * moving that into the screens would duplicate it three times.
 */
export interface TalosStationFacadesDeps {
    repository: TalosChatRepository
    activeSessionId(): string | null
}

export function createStationFacades(deps: TalosStationFacadesDeps) {
    // F4 Memory station — rows are untrusted by construction; the station is
    // the only writer.
    const memories = {
        list: () => deps.repository.listMemories(),
        create: (input: {
            title: string
            content: string
            kind: 'preference' | 'project_fact' | 'procedure' | 'policy_note'
            scope_type: 'global' | 'project' | 'session'
            scope_id: string | null
        }) => deps.repository.createMemory({
            id: newTalosMobileId(),
            scope_type: input.scope_type,
            scope_id: input.scope_type === 'session'
                ? deps.activeSessionId()
                : input.scope_id,
            kind: input.kind,
            title: input.title,
            content: input.content,
            source: 'talos_mobile_station',
            metadata: { created_from: 'talos_mobile_station' },
            created_at: new Date().toISOString(),
        }),
        upsertDisplayName: (displayName: string) =>
            upsertTalosDisplayNameMemory(deps.repository, displayName),
        setStatus: (memoryId: string, status: 'active' | 'disabled' | 'quarantined' | 'rejected') =>
            deps.repository.updateMemoryStatus(memoryId, status),
        remove: (memoryId: string) => deps.repository.deleteMemory(memoryId),
    }

    // F5 stations — run-linked local tasks and untrusted notes (airplane-mode
    // functional; the stations are the only writers).
    const tasks = {
        list: () => deps.repository.listTasks(),
        create: (input: { title: string; description: string | null; run_id: string | null; priority: 'low' | 'normal' | 'high' }) =>
            deps.repository.createTask({
                id: newTalosMobileId(),
                title: input.title,
                description: input.description,
                run_id: input.run_id,
                priority: input.priority,
                created_at: new Date().toISOString(),
            }),
        setStatus: (taskId: string, status: 'todo' | 'doing' | 'done') =>
            deps.repository.setTaskStatus(taskId, status),
        remove: (taskId: string) => deps.repository.deleteTask(taskId),
    }

    const notes = {
        list: () => deps.repository.listNotes(),
        create: (input: { title: string; content: string }) =>
            deps.repository.createNote({
                id: newTalosMobileId(),
                title: input.title,
                content: input.content,
                created_at: new Date().toISOString(),
            }),
        /**
         * Correggere una nota, senza perderla e riscriverla.
         *
         * Prima non c'era: chi trovava un refuso doveva cancellare e ricreare,
         * cioè cambiare identità alla nota e perderne la data di nascita. Il
         * campo `updated_at` esisteva dall'inizio e non si muoveva mai.
         */
        update: (input: { id: string; title?: string; content?: string }) =>
            deps.repository.updateNote(input),
        remove: (noteId: string) => deps.repository.deleteNote(noteId),
    }

    return { memories, tasks, notes }
}
