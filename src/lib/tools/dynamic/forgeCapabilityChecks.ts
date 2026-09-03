import type { TalosChatRepository } from '@/repositories/chatRepository'
import type { TalosPremessaEsito, TalosToolVerdict } from '@/lib/tools/registry'

/**
 * ⛔⛔⛔ Owner 2026-08-27 — Tool Forge Fase 4, la parte che né la ZIP né la
 * revisione ingegneristica avevano visto (trovata in Fase 0): `registry.ts`
 * definisce `premesse` (precondizione, tri-stato presente/assente/ignoto,
 * verificata PRIMA della scheda di consenso) e `verify` (postcondizione,
 * verificata DOPO `run`, che promuove un fallimento non-atomico a successo
 * o degrada un falso successo a fallimento) — attivamente invocati
 * dall'esecutore (`executor.ts:257-269`, `:461-471`, `:652-666`). Nessun
 * tool forgiato li dichiarava.
 *
 * ⛔ Confine onesto — perché SOLO queste cinque capability, e perché per
 * ORA solo quando il tool le chiama senza trasformare l'input:
 *
 * Un tool forgiato è un DAG arbitrario. Il proprio `input` dichiarato (lo
 * schema del manifest) NON è garantito avere la stessa forma dell'input
 * che una capability interna riceve — il DSL può rimappare campi con
 * `set`/`$ref` prima di chiamarla. Un premise/verify generico che
 * assumesse "l'input del tool è l'input della capability" sarebbe giusto
 * per caso, non per costruzione — esattamente il tipo di scorciatoia che
 * REGOLA ZERO vieta.
 *
 * ⇒ Questi controlli si attivano SOLO quando `talosIntegration.ts` verifica
 * (staticamente, sul manifest) che: (a) la capability raggiungibile è
 * UNA sola, e (b) quel nodo passa l'input del tool alla capability senza
 * trasformarlo (`input: {$ref: '$.input'}` — un pass-through letterale).
 * In quel caso, e SOLO in quel caso, l'input del tool coincide
 * dimostrabilmente con l'input della capability, e la rilettura è "gratis"
 * come richiede `registry.ts`. Un tool più complesso resta senza
 * premesse/verify — l'assenza è il comportamento sicuro, non un difetto:
 * lo stesso vale per la maggioranza dei tool statici esistenti.
 */

export interface ForgeCapabilityCheck {
    premise?(input: any, repository: TalosChatRepository): Promise<TalosPremessaEsito>
    verify?(input: any, repository: TalosChatRepository): Promise<TalosToolVerdict>
}

export const FORGE_CAPABILITY_CHECKS: Readonly<Record<string, ForgeCapabilityCheck>> = Object.freeze({
    'tasks.setStatus': {
        // Precondizione: il task esiste? `listTasks()` è una lettura
        // completa (nessuna paginazione), quindi la copertura è sempre
        // 'completa' quando la risposta arriva.
        async premise(input, repository) {
            try {
                const tasks = await repository.listTasks()
                const exists = tasks.some((task) => task.id === input?.id)
                return exists
                    ? { stato: 'presente' }
                    : { stato: 'assente', perche: `Nessun task con id "${input?.id}".`, copertura: 'completa' }
            } catch (error) {
                return { stato: 'ignoto', perche: error instanceof Error ? error.message : String(error) }
            }
        },
        // Postcondizione: lo stato è DAVVERO cambiato?
        async verify(input, repository) {
            try {
                const tasks = await repository.listTasks()
                const task = tasks.find((entry) => entry.id === input?.id)
                if (!task) return { held: false, reason: `Il task "${input?.id}" non esiste più.` }
                return task.status === input?.status
                    ? { held: true }
                    : { held: false, reason: `Lo stato è "${task.status}", non "${input?.status}".` }
            } catch (error) {
                return { held: false, reason: error instanceof Error ? error.message : String(error) }
            }
        },
    },
    'notes.update': {
        async premise(input, repository) {
            try {
                const notes = await repository.listNotes()
                const exists = notes.some((note) => note.id === input?.id)
                return exists
                    ? { stato: 'presente' }
                    : { stato: 'assente', perche: `Nessuna nota con id "${input?.id}".`, copertura: 'completa' }
            } catch (error) {
                return { stato: 'ignoto', perche: error instanceof Error ? error.message : String(error) }
            }
        },
        async verify(input, repository) {
            try {
                const notes = await repository.listNotes()
                const note = notes.find((entry) => entry.id === input?.id)
                if (!note) return { held: false, reason: `La nota "${input?.id}" non esiste più.` }
                if (input?.title !== undefined && note.title !== input.title) {
                    return { held: false, reason: 'Il titolo non risulta aggiornato.' }
                }
                if (input?.content !== undefined && note.content !== input.content) {
                    return { held: false, reason: 'Il contenuto non risulta aggiornato.' }
                }
                return { held: true }
            } catch (error) {
                return { held: false, reason: error instanceof Error ? error.message : String(error) }
            }
        },
    },
    // Le create non hanno precondizione (niente deve esistere prima), solo
    // postcondizione: rilegge e cerca una riga che corrisponde a quello
    // che è stato chiesto — l'id generato non è noto al chiamante, quindi
    // si verifica per CONTENUTO, non per id.
    'tasks.create': {
        async verify(input, repository) {
            try {
                const tasks = await repository.listTasks()
                const found = tasks.some((task) => task.title === input?.title
                    && (input?.description === undefined || task.description === input.description))
                return found ? { held: true } : { held: false, reason: 'Il task non risulta creato.' }
            } catch (error) {
                return { held: false, reason: error instanceof Error ? error.message : String(error) }
            }
        },
    },
    'notes.create': {
        async verify(input, repository) {
            try {
                const notes = await repository.listNotes()
                const found = notes.some((note) => note.title === input?.title && note.content === input?.content)
                return found ? { held: true } : { held: false, reason: 'La nota non risulta creata.' }
            } catch (error) {
                return { held: false, reason: error instanceof Error ? error.message : String(error) }
            }
        },
    },
    'memory.create': {
        async verify(input, repository) {
            try {
                const memories = await repository.listMemories()
                const found = memories.some((memory) => memory.title === input?.title && memory.content === input?.content)
                return found ? { held: true } : { held: false, reason: 'La memoria non risulta creata.' }
            } catch (error) {
                return { held: false, reason: error instanceof Error ? error.message : String(error) }
            }
        },
    },
})
