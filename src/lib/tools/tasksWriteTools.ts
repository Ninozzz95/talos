import { z } from 'zod'
import { defineTalosTool, type TalosToolDefinition } from '@/lib/tools/registry'
import { talosStripPromptEnvelope } from '@/lib/chat/promptEnvelope'

/**
 * Le attività si creano e si chiudono dalla chat, non solo si elencano.
 *
 * ## Lo stesso buco delle note, sulla funzione accanto
 *
 * Esisteva `tasks_list` e basta. «Segnati che devo chiamare l'idraulico» finiva
 * in una risposta cortese e in nessuna attività; «ho finito quella cosa» non
 * spuntava niente. Elencare senza poter cambiare è la forma di funzione a metà
 * che l'owner ha chiesto di smettere di produrre: due porte per ogni funzione,
 * la stazione **e** la chat.
 *
 * ## Perché chiudere un'attività è un tool a parte
 *
 * Perché è la cosa che si fa più spesso, e di gran lunga. Farla passare da un
 * `tasks_update` generico costringerebbe il modello a mandare uno stato fra tre
 * valori possibili per esprimere «fatto» — e a sbagliarlo. Un tool che dice cosa
 * fa nel nome viene chiamato quando serve; uno che chiede uno stato viene
 * chiamato anche quando non serve.
 *
 * ## Cosa NON c'è qui, di proposito
 *
 * La **pianificazione**: un'attività che parte da sola a un orario. È la funzione
 * che l'owner ha paragonato a «Pianificare» di ChatGPT, e arriva dopo il sistema
 * di notifiche — perché un lavoro che parte quando nessuno guarda e non lo dice
 * a nessuno non è una funzione, è un consumo di batteria. Questi tool restano
 * validi quando arriverà: pianificare aggiungerà un campo, non un'altra entità.
 */

export interface TalosTasksWriteSources {
    create(input: {
        title: string
        description: string | null
        priority: 'low' | 'normal' | 'high'
    }): Promise<{ id: string; title: string }>
    setStatus(taskId: string, status: 'todo' | 'doing' | 'done'): Promise<{ id: string; title: string }>
    update(taskId: string, patch: {
        title?: string
        description?: string | null
        priority?: 'low' | 'normal' | 'high'
    }): Promise<{ id: string; title: string }>
    remove(taskId: string): Promise<void>
    /**
     * Rilegge un'attivita' per id. Null se non c'e' piu'.
     *
     * ⛔ Serve alla POSTCONDIZIONE (A5), non al modello: e' la rilettura con cui
     * l'esecutore decide se l'effetto c'e' davvero quando la chiamata ha detto
     * il contrario. Vedi `verify` in `lib/tools/registry.ts`.
     */
    find(taskId: string): Promise<{
        id: string
        title: string
        status: 'todo' | 'doing' | 'done'
        priority: 'low' | 'normal' | 'high'
        description: string | null
    } | null>
}

const PRIORITIES = ['low', 'normal', 'high'] as const
const STATUSES = ['todo', 'doing', 'done'] as const

function failed(code: string, message: string, failure: unknown) {
    return {
        ok: false as const,
        content: message,
        evidence: {
            error_code: code,
            detail: failure instanceof Error ? failure.message : String(failure),
        },
    }
}

/** L'assenza si dice per quello che è, o il modello riprova identico. */
function missingTask(failure: unknown): boolean {
    return failure instanceof Error && failure.message === 'TALOS_TASK_NOT_FOUND'
}

export function createTalosTasksWriteTools(
    sources: TalosTasksWriteSources,
): TalosToolDefinition<never>[] {
    return [
        defineTalosTool({
            name: 'tasks_create',
            title: 'Add a task',
            description: [
                'Add a task to the user\'s list on this device.',
                'Use it when the user asks to be reminded of something to DO — "add a task", "remind me to…", "put it on my list".',
                'One task per call, phrased as the action to take. Put any detail in the description rather than lengthening the title.',
                'This does not schedule anything and will not run on its own: it is a list the user reads.',
            ].join(' '),
            action: 'write',
            input: z.object({
                title: z.string().min(1).max(200)
                    .describe('The action to take, short enough to read in a list.'),
                description: z.string().max(2000).optional()
                    .describe('Any detail that does not belong in the title.'),
                priority: z.enum(PRIORITIES).default('normal')
                    .describe('Use high only when the user said it is urgent — do not infer urgency from tone.'),
            }),
            async run(input) {
                try {
                    const saved = await sources.create({
                        title: talosStripPromptEnvelope(input.title).trim(),
                        // Vuoto e assente sono la stessa cosa qui, e diventano
                        // null: una descrizione fatta di spazi occuperebbe la
                        // riga del dettaglio senza dire niente.
                        description: input.description?.trim() || null,
                        priority: input.priority,
                    })
                    return {
                        ok: true,
                        content: `Added the task «${saved.title}» (id ${saved.id}).`,
                        evidence: { id: saved.id, title: saved.title, priority: input.priority },
                    }
                } catch (failure) {
                    return failed('TALOS_TASK_CREATE_FAILED', 'That task could not be saved on this device.', failure)
                }
            },
        }) as TalosToolDefinition<never>,

        defineTalosTool({
            name: 'tasks_complete',
            title: 'Mark a task done',
            description: [
                'Mark one of the user\'s tasks as done, or move it back to in-progress or not-started.',
                'Call tasks_list first to get the task id — do not guess it from the title.',
                'Only change a task the user actually referred to. Finishing something adjacent is not the same task.',
            ].join(' '),
            action: 'write',
            input: z.object({
                id: z.string().min(1).describe('The task id, from tasks_list.'),
                status: z.enum(STATUSES).default('done')
                    .describe('done = finished; doing = started; todo = back to not started.'),
            }),
            /**
             * A5 — la postcondizione: **lo stato e' quello chiesto**.
             *
             * Costa una rilettura per id. Vale nelle due direzioni: se la
             * chiamata e' fallita ma lo stato e' gia' quello giusto, era
             * riuscita e si e' persa la conferma — e dire «fallito» li' e'
             * l'istruzione che fa ritentare.
             */
            async verify(input) {
                const attivita = await sources.find(input.id)
                if (!attivita) return { held: false, reason: 'that task no longer exists' }
                return attivita.status === input.status
                    ? { held: true }
                    : { held: false, reason: `it is still "${attivita.status}"` }
            },
            async run(input) {
                try {
                    const saved = await sources.setStatus(input.id, input.status)
                    return {
                        ok: true,
                        content: input.status === 'done'
                            ? `Marked «${saved.title}» as done.`
                            : `Moved «${saved.title}» to ${input.status}.`,
                        evidence: { id: saved.id, title: saved.title, status: input.status },
                    }
                } catch (failure) {
                    return missingTask(failure)
                        ? {
                            ok: false,
                            content: 'There is no task with that id. Call tasks_list to see the current ones.',
                            evidence: { error_code: 'TALOS_TASK_NOT_FOUND', id: input.id },
                        }
                        : failed('TALOS_TASK_UPDATE_FAILED', 'That task could not be updated on this device.', failure)
                }
            },
        }) as TalosToolDefinition<never>,

        defineTalosTool({
            name: 'tasks_update',
            title: 'Edit a task',
            /**
             * ⛔ La descrizione dice per differenza quando NON usarlo, perché
             * l'errore che il modello fa da solo è scegliere questo per
             * spuntare un'attività — «cambia lo stato» è pur sempre una
             * modifica. `tasks_complete` esiste apposta e dice cosa fa nel nome.
             */
            description: [
                'Change the title, the detail or the priority of a task that already exists.',
                'Call tasks_list first to get the task id — do not guess it from the title, because two tasks can share a name.',
                'Do NOT use this to mark something done or started: that is tasks_complete.',
                'Send only the fields that change. What you omit stays as it is.',
            ].join(' '),
            action: 'write',
            input: z.object({
                id: z.string().min(1).describe('The task id, from tasks_list.'),
                title: z.string().min(1).max(200).optional()
                    .describe('The new action to take. Omit to leave the title alone.'),
                description: z.string().max(2000).nullable().optional()
                    .describe('The new detail. Send null to clear it, omit to leave it alone.'),
                priority: z.enum(PRIORITIES).optional()
                    .describe('Use high only when the user said it is urgent — do not infer urgency from tone.'),
            }),
            async run(input) {
                /*
                 * Una chiamata che non cambia niente si rifiuta invece di
                 * riuscire: «ho aggiornato l'attività» detto dopo aver toccato
                 * zero campi è la forma di conferma che insegna a non fidarsi
                 * delle conferme. E succede davvero — un modello che vuole
                 * spuntare un'attività manda l'id e basta.
                 */
                if (input.title === undefined && input.description === undefined
                    && input.priority === undefined) {
                    return {
                        ok: false,
                        content: 'Nothing to change: send at least a title, a description or a priority. '
                            + 'To mark a task done, use tasks_complete.',
                        evidence: { error_code: 'TALOS_TASK_UPDATE_EMPTY', id: input.id },
                    }
                }
                try {
                    const saved = await sources.update(input.id, {
                        ...(input.title === undefined
                            ? {}
                            : { title: talosStripPromptEnvelope(input.title).trim() }),
                        ...(input.description === undefined
                            ? {}
                            // Vuoto e null sono la stessa cosa qui, come in
                            // creazione: una descrizione di soli spazi
                            // occuperebbe la riga del dettaglio senza dire nulla.
                            : { description: input.description?.trim() || null }),
                        ...(input.priority === undefined ? {} : { priority: input.priority }),
                    })
                    return {
                        ok: true,
                        content: `Updated the task «${saved.title}».`,
                        evidence: { id: saved.id, title: saved.title },
                    }
                } catch (failure) {
                    return missingTask(failure)
                        ? {
                            ok: false,
                            content: 'There is no task with that id. Call tasks_list to see the current ones.',
                            evidence: { error_code: 'TALOS_TASK_NOT_FOUND', id: input.id },
                        }
                        : failed('TALOS_TASK_UPDATE_FAILED', 'That task could not be updated on this device.', failure)
                }
            },
        }) as TalosToolDefinition<never>,

        defineTalosTool({
            name: 'tasks_delete',
            title: 'Delete a task',
            description: [
                'Delete one of the user\'s tasks, permanently.',
                'Prefer tasks_complete when the work is finished: a completed task is a record, a deleted one is gone.',
                'Call this only when the user asked for the task to be removed, and say which one before doing it.',
            ].join(' '),
            // `write` e non un'azione «delete» sua: le azioni sono tre e sono la
            // grammatica dei permessi di tutta l'app. Vedi la nota estesa in
            // `notesWriteTools.ts` — la domanda è la stessa e va decisa una volta
            // per tutte le funzioni, non qui.
            action: 'write',
            input: z.object({
                id: z.string().min(1).describe('The task id, from tasks_list.'),
            }),
            /** A5 — la postcondizione di una cancellazione: **non c'e' piu'**. */
            async verify(input) {
                const resta = await sources.find(input.id)
                return resta
                    ? { held: false, reason: `the task "${resta.title}" is still there` }
                    : { held: true }
            },
            async run(input) {
                try {
                    await sources.remove(input.id)
                    return {
                        ok: true,
                        content: 'That task has been deleted.',
                        evidence: { id: input.id },
                    }
                } catch (failure) {
                    return missingTask(failure)
                        ? {
                            // Già assente è l'esito voluto, ottenuto da altri.
                            ok: true,
                            content: 'There was no task with that id — nothing to delete.',
                            evidence: { id: input.id, already_absent: true },
                        }
                        : failed('TALOS_TASK_DELETE_FAILED', 'That task could not be deleted on this device.', failure)
                }
            },
        }) as TalosToolDefinition<never>,
    ]
}
