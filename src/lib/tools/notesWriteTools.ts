import { z } from 'zod'
import { defineTalosTool, type TalosToolDefinition } from '@/lib/tools/registry'
import { talosStripPromptEnvelope } from '@/lib/chat/promptEnvelope'

/**
 * Le note si scrivono dalla chat, non solo si leggono.
 *
 * ## Il buco, e perché era invisibile
 *
 * Esisteva `notes_list` e basta. «Prendi nota che il codice del cancello è
 * 4471» produceva una risposta cortese e **nessuna nota**: il modello poteva
 * elencare gli appunti dell'utente ma non aggiungerne uno. È lo stesso difetto
 * già trovato sulla memoria — letta e non scritta — ripetuto su un'altra
 * funzione, e questo è il motivo per cui l'owner ha chiesto esplicitamente che
 * ogni funzione avesse **entrambe** le porte.
 *
 * Sotto c'era un buco più profondo: nel deposito una nota si poteva creare e
 * cancellare, **mai modificare**. Correggere un refuso voleva dire cancellare e
 * riscrivere, cioè perdere la data di creazione e l'identità della nota. Il
 * campo `updated_at` esisteva dal primo giorno e non si muoveva mai.
 *
 * ## Perché non sono i tool della memoria
 *
 * Una memoria il modello **la rilegge da solo** in ogni conversazione futura;
 * una nota no: è dell'utente, e la legge l'utente. Per questo qui le regole sono
 * meno strette — annotare qualcosa non può cambiare il comportamento di TALOS
 * domani — ma la porta resta `write`, perché resta roba che sopravvive alla
 * conversazione e che l'utente ritroverà.
 *
 * ## Perché aggiornare vuole l'identificativo e non il titolo
 *
 * Cercare la nota per titolo sarebbe più comodo da chiamare e sbagliato: due
 * note possono chiamarsi uguale, e la scelta ricadrebbe sul modello senza che
 * l'utente lo sappia. `notes_list` restituisce già gli identificativi; leggere
 * prima e poi scrivere è un giro in più che rende la modifica **deliberata**.
 */

export interface TalosNotesWriteSources {
    create(input: { title: string; content: string }): Promise<{ id: string; title: string }>
    update(input: { id: string; title?: string; content?: string }): Promise<{ id: string; title: string }>
    remove(noteId: string): Promise<void>
    /**
     * Rilegge una nota per id. Null se non c'e' piu'.
     *
     * ⛔ Serve alla POSTCONDIZIONE (A5), non al modello: e' la rilettura con cui
     * l'esecutore decide se l'effetto c'e' davvero quando la chiamata ha detto
     * il contrario. Vedi `verify` in `lib/tools/registry.ts`.
     */
    find(noteId: string): Promise<{ id: string; title: string; content: string } | null>
}

/** Un guasto detto per nome: «va bene» su una nota mai scritta è peggio. */
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

export function createTalosNotesWriteTools(
    sources: TalosNotesWriteSources,
): TalosToolDefinition<never>[] {
    return [
        defineTalosTool({
            name: 'notes_create',
            title: 'Write a note',
            description: [
                'Save a note for the user on this device.',
                'Use it when the user asks to note, jot down, or keep something — "take a note", "remember this for me in my notes".',
                'The note is for the USER to read later; it does not change how TALOS behaves. To store a lasting instruction about behaviour, use memory_write instead.',
                'Give it a title that will make sense in a list weeks from now, and put the substance in the body.',
            ].join(' '),
            action: 'write',
            input: z.object({
                title: z.string().min(1).max(120)
                    .describe('A few words naming the note, as it will appear in the list.'),
                content: z.string().min(1).max(8000)
                    .describe('The note itself. Markdown is fine.'),
            }),
            async run(input) {
                try {
                    const saved = await sources.create({
                        title: talosStripPromptEnvelope(input.title).trim(),
                        content: talosStripPromptEnvelope(input.content).trim(),
                    })
                    return {
                        ok: true,
                        // Si dice l'identificativo perché la mossa successiva —
                        // «no, cambia il titolo» — ha bisogno di quello, e
                        // altrimenti costerebbe un elenco intero per ritrovarlo.
                        content: `Saved the note «${saved.title}» (id ${saved.id}).`,
                        evidence: { id: saved.id, title: saved.title },
                    }
                } catch (failure) {
                    return failed('TALOS_NOTE_CREATE_FAILED', 'That note could not be saved on this device.', failure)
                }
            },
        }) as TalosToolDefinition<never>,

        defineTalosTool({
            name: 'notes_update',
            title: 'Edit a note',
            description: [
                'Change the title or the body of a note that already exists.',
                'Call notes_list first to get the note id — do not guess it from the title, because two notes can share a name.',
                'Send ONLY the fields you are changing: an omitted field is left untouched, it is not cleared.',
                'Prefer this over deleting and re-creating: the note keeps its identity and its creation date.',
            ].join(' '),
            action: 'write',
            input: z.object({
                id: z.string().min(1).describe('The note id, from notes_list.'),
                title: z.string().min(1).max(120).optional()
                    .describe('The new title. Omit to leave the title alone.'),
                content: z.string().min(1).max(8000).optional()
                    .describe('The new body, replacing the old one. Omit to leave the body alone.'),
            }),
            /**
             * A5 — la postcondizione di una modifica: **il testo e' quello nuovo**.
             *
             * Si confrontano solo i campi mandati: chi non ha chiesto di
             * cambiare il titolo non puo' vedersi bocciare la chiamata perche'
             * il titolo e' rimasto quello di prima.
             */
            async verify(input) {
                const nota = await sources.find(input.id)
                if (!nota) return { held: false, reason: 'that note no longer exists' }
                if (input.title !== undefined && nota.title !== input.title) {
                    return { held: false, reason: 'the title is still the old one' }
                }
                if (input.content !== undefined && nota.content !== input.content) {
                    return { held: false, reason: 'the body is still the old one' }
                }
                return { held: true }
            },
            async run(input) {
                // Rifiutato QUI e non nello schema: `zod` può dire «almeno uno
                // dei due», ma il messaggio che ne esce parla di forme e non di
                // cose. Il modello deve leggere cosa gli manca, non dove.
                if (input.title === undefined && input.content === undefined) {
                    return {
                        ok: false,
                        content: 'Nothing to change: pass a new title, a new body, or both.',
                        evidence: { error_code: 'TALOS_NOTE_UPDATE_EMPTY' },
                    }
                }
                try {
                    const saved = await sources.update({
                        id: input.id,
                        ...(input.title === undefined ? {} : { title: talosStripPromptEnvelope(input.title).trim() }),
                        ...(input.content === undefined ? {} : { content: talosStripPromptEnvelope(input.content).trim() }),
                    })
                    return {
                        ok: true,
                        content: `Updated the note «${saved.title}».`,
                        evidence: { id: saved.id, title: saved.title },
                    }
                } catch (failure) {
                    // L'assenza si dice per quello che è. «Non è riuscito»
                    // manderebbe il modello a riprovare la stessa chiamata.
                    const missing = failure instanceof Error && failure.message === 'TALOS_NOTE_NOT_FOUND'
                    return missing
                        ? {
                            ok: false,
                            content: 'There is no note with that id. Call notes_list to see the current ones.',
                            evidence: { error_code: 'TALOS_NOTE_NOT_FOUND', id: input.id },
                        }
                        : failed('TALOS_NOTE_UPDATE_FAILED', 'That note could not be updated on this device.', failure)
                }
            },
        }) as TalosToolDefinition<never>,

        defineTalosTool({
            name: 'notes_delete',
            title: 'Delete a note',
            description: [
                'Delete one of the user\'s notes, permanently.',
                'Call this ONLY when the user has clearly asked for that note to be removed. There is no undo.',
                'Call notes_list first to get the id, and say which note you are about to delete before doing it.',
            ].join(' '),
            /*
             * `write`, e la scelta merita di essere spiegata perché la tentazione
             * era un'altra.
             *
             * Cancellare e scrivere sono due domande a cui una persona risponde
             * in modo diverso: chi ha detto sì a «prendi appunti» non ha detto sì
             * a «cancella i miei appunti». Servirebbe un'azione a parte.
             *
             * Ma le azioni sono tre — `read`, `write`, `outbound` — e sono la
             * grammatica dei permessi di TUTTA l'app, che l'owner ha dichiarato
             * unica e non negoziabile (2026-08-04). Aggiungerne una quarta qui
             * vorrebbe dire cambiarla di soppiatto da una funzione secondaria,
             * toccando la pagina dei permessi, le impostazioni e la migrazione —
             * cioè fare da soli una decisione che è dell'owner.
             *
             * Quindi: `write` adesso, e la domanda resta scritta. Appartiene alla
             * review R-C sui comportamenti distruttivi, che è il posto dove
             * quella decisione si prende per tutte le funzioni insieme invece
             * che per questa sola.
             *
             * Intanto il rischio è contenuto dove si può senza cambiare
             * grammatica: la descrizione impone di chiedere prima, e di dire
             * QUALE nota si sta per cancellare.
             */
            action: 'write',
            input: z.object({
                id: z.string().min(1).describe('The note id, from notes_list.'),
            }),
            /**
             * A5 — la postcondizione di una cancellazione: **non c'e' piu'**.
             *
             * Costa una rilettura per id, cioe' niente, ed e' la sola prova che
             * distingue «cancellata» da «credo di averla cancellata». Vale in
             * entrambe le direzioni: se `run` e' fallito ma la nota non c'e',
             * era riuscita e la risposta si e' persa — e dire «fallito» li'
             * sarebbe l'istruzione che fa ritentare.
             */
            async verify(input) {
                const resta = await sources.find(input.id)
                return resta
                    ? { held: false, reason: `the note "${resta.title}" is still there` }
                    : { held: true }
            },
            async run(input) {
                try {
                    await sources.remove(input.id)
                    return {
                        ok: true,
                        content: 'That note has been deleted.',
                        evidence: { id: input.id },
                    }
                } catch (failure) {
                    const missing = failure instanceof Error && failure.message === 'TALOS_NOTE_NOT_FOUND'
                    return missing
                        ? {
                            // Già assente è l'esito che si voleva, ottenuto da
                            // qualcun altro: non è un guasto da segnalare.
                            ok: true,
                            content: 'There was no note with that id — nothing to delete.',
                            evidence: { id: input.id, already_absent: true },
                        }
                        : failed('TALOS_NOTE_DELETE_FAILED', 'That note could not be deleted on this device.', failure)
                }
            },
        }) as TalosToolDefinition<never>,
    ]
}
