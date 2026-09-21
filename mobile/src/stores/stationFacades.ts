import type { TalosChatRepository, UpdateTaskPatch } from '@/repositories/chatRepository'
import type { TalosContentOrigin } from '@/lib/tools/security'
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
            /**
             * ⛔ A8 — da dove viene il testo, deciso da CHI CHIAMA.
             *
             * La stazione non lo passa e resta `user-direct` implicito: quello
             * che l'utente scrive a mano viene dall'utente. Lo passa invece il
             * tool della chat, che lo prende dallo stato della catena — perche'
             * una memoria annotata dopo aver letto una pagina web viene da li',
             * e il modello la rileggera' in ogni conversazione futura.
             */
            content_origin?: TalosContentOrigin
        }) => deps.repository.createMemory({
            content_origin: input.content_origin ?? 'user-direct',
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
        /**
         * Correggere una memoria, senza toccare la decisione dell'utente.
         *
         * Passa da `updateMemory` e non da `upsertMemory` di proposito: il
         * secondo rimette `status = 'active'`, quindi una correzione al testo
         * risveglierebbe una memoria che l'utente aveva spento.
         */
        update: (input: {
            id: string
            title?: string
            content?: string
            kind?: 'preference' | 'project_fact' | 'procedure' | 'policy_note'
        }) => deps.repository.updateMemory(input.id, {
            title: input.title,
            content: input.content,
            kind: input.kind,
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
        create: (input: {
            title: string
            description: string | null
            run_id: string | null
            priority: 'low' | 'normal' | 'high'
            schedule_json?: string | null
            instruction?: string | null
            /** A8 — vedi la memoria qui sopra. */
            content_origin?: TalosContentOrigin
        }) =>
            deps.repository.createTask({
                id: newTalosMobileId(),
                content_origin: input.content_origin ?? 'user-direct',
                title: input.title,
                description: input.description,
                run_id: input.run_id,
                priority: input.priority,
                // Assente e nullo sono la stessa cosa: un'attività senza
                // pianificazione. Il `?? null` lo dice una volta qui invece di
                // lasciarlo decidere a ogni chiamante.
                schedule_json: input.schedule_json ?? null,
                instruction: input.instruction ?? null,
                created_at: new Date().toISOString(),
            }),
        setStatus: (taskId: string, status: 'todo' | 'doing' | 'done') =>
            deps.repository.setTaskStatus(taskId, status),
        /**
         * Correggere un'attività, senza cancellarla e rifarla.
         *
         * Stessa forma della nota qui sotto, e per la stessa ragione: rifare
         * un'attività le cambia l'identità, e con l'identità se ne vanno lo
         * storico, la pianificazione e il legame con l'esecuzione che l'ha
         * generata. Un refuso nel titolo non deve costare tutto questo.
         */
        update: (taskId: string, patch: UpdateTaskPatch) =>
            deps.repository.updateTask(taskId, patch),
        remove: (taskId: string) => deps.repository.deleteTask(taskId),
    }

    const notes = {
        list: () => deps.repository.listNotes(),
        create: (input: {
            title: string
            content: string
            /** A8 — vedi la memoria qui sopra: la passa il tool, non la stazione. */
            content_origin?: TalosContentOrigin
        }) =>
            deps.repository.createNote({
                id: newTalosMobileId(),
                title: input.title,
                content: input.content,
                content_origin: input.content_origin ?? 'user-direct',
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
