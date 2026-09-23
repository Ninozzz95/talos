import { z } from 'zod'
import { defineTalosTool, type TalosToolDefinition } from '@/lib/tools/registry'
import { talosStripPromptEnvelope } from '@/lib/chat/promptEnvelope'

/**
 * La Libreria si poteva riempire, ma non riordinare.
 *
 * Fino a qui il modello aveva `library_list`, `library_search`, `library_read`,
 * `library_file_origin` e `library_export` — e `document_create` e
 * `generate_image` per METTERCI dentro roba. Mancavano i due verbi che
 * trasformano un deposito in un archivio: **rinominare** e **togliere**.
 *
 * Owner, 2026-08-07: «la libreria e la memoria non hanno un tool crud completo,
 * hanno solo inserimento e read, quindi la chat puo' solo chiamare questi
 * strumenti». Vero, e la conseguenza si vedeva: «cancella quel PDF che abbiamo
 * generato per sbaglio» finiva in una risposta cortese e in nessuna
 * cancellazione, e il file restava li' a occupare spazio e a comparire nelle
 * ricerche.
 *
 * ## Perche' un modulo suo e non dentro `readTools`
 *
 * Perche' questi due tool **cambiano** qualcosa, e i tool di lettura no. Tenere
 * un `action: 'write'` in mezzo a una dozzina di `action: 'read'` e' il modo in
 * cui un giorno qualcuno registra il gruppo intero come sola lettura senza
 * accorgersene.
 *
 * ## Il vincolo che vale su entrambi
 *
 * L'id arriva sempre da `library_list` o `library_search`. Non si accettano
 * nomi: due file possono chiamarsi uguale, e cancellare «quello sbagliato con
 * lo stesso nome» e' un danno che l'utente scopre settimane dopo.
 */

export interface TalosLibraryWriteSources {
    /** Il nome attuale, per poterlo dire prima e dopo. Null se non esiste. */
    describe(fileId: string): Promise<{ id: string, name: string } | null>
    rename(fileId: string, displayName: string): Promise<{ id: string, name: string }>
    remove(fileId: string): Promise<void>
}

/**
 * Il nome di un file non e' testo libero: e' un'etichetta.
 *
 * Si tolgono i separatori di percorso e i caratteri di controllo perche' questo
 * nome finisce in un'esportazione verso il selettore di sistema, dove una barra
 * smetterebbe di essere una lettera e diventerebbe una cartella.
 */
export function talosSafeLibraryName(value: string): string {
    const name = talosStripPromptEnvelope(value)
        .normalize('NFKC')
        .replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ')
        .replace(/[/\\:*?"<>|]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .replace(/^\.+\s*/, '')
        .trim()
    return name
}

export function createTalosLibraryWriteTools(
    sources: TalosLibraryWriteSources,
): TalosToolDefinition<never>[] {
    return [
        defineTalosTool({
            name: 'library_rename',
            title: 'Rename a Library file',
            description: [
                'Give a Library file a different name.',
                'Get the id from library_list or library_search first — never guess it, and never pass a file name as the id.',
                'Use this when the user asks to rename something, or when a generated file kept a placeholder name.',
                'The contents do not change; only the name shown in the Library and used when exporting.',
            ].join(' '),
            action: 'write',
            input: z.object({
                id: z.string().min(1).max(128)
                    .describe('The file id from library_list or library_search.'),
                name: z.string().min(1).max(180)
                    .describe('The new name, including the extension if the file has one.'),
            }),
            /**
             * ⛔ Si confronta col nome NORMALIZZATO, non con quello chiesto.
             *
             * `run` passa a `rename` il nome ripulito dai separatori di percorso
             * (`talosSafeLibraryName`): confrontare qui la stringa grezza
             * boccerebbe ogni rinomina che conteneva una barra — cioe accuserebbe
             * il tool di non aver fatto proprio la cosa che ha fatto bene.
             */
            async verify(input) {
                const atteso = talosSafeLibraryName(input.name)
                if (!atteso) return { held: true }
                const adesso = await sources.describe(input.id)
                if (!adesso) return { held: false, reason: 'that file is no longer in the Library' }
                if (adesso.name !== atteso) return { held: false, reason: 'the file still has its old name' }
                return { held: true }
            },
            async run(input) {
                const name = talosSafeLibraryName(input.name)
                if (!name) {
                    return {
                        ok: false,
                        code: 'TALOS_LIBRARY_NAME_EMPTY',
                        content: 'That name is empty once path characters are removed. Choose a plain name.',
                    }
                }
                const before = await sources.describe(input.id)
                if (!before) {
                    return {
                        ok: false,
                        code: 'TALOS_LIBRARY_FILE_NOT_FOUND',
                        content: `No Library file has the id "${input.id}". Use library_list or library_search to find it.`,
                    }
                }
                try {
                    const after = await sources.rename(input.id, name)
                    // Si dicono ENTRAMBI i nomi: chi legge deve poter accorgersi
                    // subito di aver rinominato il file sbagliato.
                    return {
                        ok: true,
                        content: `Renamed «${before.name}» to «${after.name}».`,
                        evidence: { id: after.id, from: before.name, to: after.name },
                    }
                } catch (failure) {
                    /*
                     * Verifica prima di dire «non e' andata».
                     *
                     * arXiv 2608.02645: quando l'effetto c'e' ma la risposta si
                     * perde, dire «fallito» e' l'istruzione che fa ritentare — e
                     * il ritentativo e' cio' che produce il doppione. Qui il
                     * doppione sarebbe un secondo rinomina a vuoto; su
                     * `library_delete` sarebbe peggio.
                     */
                    const adesso = await sources.describe(input.id).catch(() => null)
                    if (adesso?.name === name) {
                        return {
                            ok: true,
                            content: `Renamed «${before.name}» to «${name}».`,
                            evidence: { id: input.id, from: before.name, to: name, verified_after_error: true },
                        }
                    }
                    return {
                        ok: false,
                        code: 'TALOS_LIBRARY_RENAME_FAILED',
                        content: 'That file could not be renamed on this device.',
                        evidence: { detail: failure instanceof Error ? failure.message : String(failure) },
                    }
                }
            },
        }) as TalosToolDefinition<never>,

        /**
         * ⛔ L'unico tool di questo gruppo che distrugge qualcosa.
         *
         * Passa dal permesso come tutti, ma con una differenza che conta: la
         * descrizione impone di **nominare il file** prima di chiamarlo. Un
         * cartellino di consenso che dice «vuole cancellare un file» non e' una
         * domanda a cui si possa rispondere; «vuole cancellare "bilancio
         * 2026.xlsx"» lo e'.
         */
        defineTalosTool({
            name: 'library_delete',
            title: 'Delete a Library file',
            description: [
                'Remove a file from the user\'s Library.',
                'Call this ONLY when the user asks to delete something.',
                'Get the id from library_list or library_search first, and say the file\'s name in your message before calling, so the user can stop you if it is the wrong one.',
                'This also removes the file from any chat that referenced it. A backup exported earlier still contains it.',
            ].join(' '),
            action: 'write',
            input: z.object({
                id: z.string().min(1).max(128)
                    .describe('The file id from library_list or library_search.'),
            }),
            /**
             * ⛔ La postcondizione di una cancellazione e un'ASSENZA, e un'assenza
             * non si vede finche non la si cerca. `describe` la cerca, e costa
             * una lettura sola — la stessa che `run` fa gia nel suo ramo di
             * recupero, quindi non e un giro in piu: e lo stesso giro, chiesto
             * anche quando le cose sono andate bene.
             */
            async verify(input) {
                const resta = await sources.describe(input.id)
                if (resta) return { held: false, reason: 'that file is still in the Library' }
                return { held: true }
            },
            async run(input) {
                const before = await sources.describe(input.id)
                if (!before) {
                    return {
                        ok: false,
                        code: 'TALOS_LIBRARY_FILE_NOT_FOUND',
                        content: `No Library file has the id "${input.id}". It may already be gone.`,
                    }
                }
                try {
                    await sources.remove(input.id)
                    return {
                        ok: true,
                        content: `«${before.name}» has been removed from the Library on this device. `
                            + 'If a backup was exported before now, it still holds a copy.',
                        evidence: { id: input.id, name: before.name },
                    }
                } catch (failure) {
                    // Se non risulta piu', era andata: si e' persa la conferma.
                    const resta = await sources.describe(input.id).catch(() => null)
                    if (!resta) {
                        return {
                            ok: true,
                            content: `«${before.name}» is gone from the Library on this device. `
                                + 'If a backup was exported before now, it still holds a copy.',
                            evidence: { id: input.id, name: before.name, verified_after_error: true },
                        }
                    }
                    return {
                        ok: false,
                        code: 'TALOS_LIBRARY_DELETE_FAILED',
                        content: `«${before.name}» could not be removed on this device.`,
                        evidence: { detail: failure instanceof Error ? failure.message : String(failure) },
                    }
                }
            },
        }) as TalosToolDefinition<never>,
    ]
}
