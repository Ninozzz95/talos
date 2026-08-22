import { z } from 'zod'
import { defineTalosTool, type TalosToolDefinition } from '@/lib/tools/registry'
import type { TalosDeviceFileSaveResult } from '@/services/saveVaultFileToDevice'

export interface TalosLibraryExportCandidate {
    id: string
    displayName: string
    mediaType: string
}

export interface TalosLibraryExportSources {
    /**
     * Metadata only. The body remains unread until the executor has passed the
     * read-plus-write boundary and an unambiguous candidate has been selected.
     */
    listCandidates(): Promise<TalosLibraryExportCandidate[]>
    /**
     * Re-authorizes the id, reads its bytes, then invokes the canonical
     * Save-As service. Null means it disappeared or was withdrawn meanwhile.
     */
    exportById(fileId: string): Promise<TalosDeviceFileSaveResult | null>
}

function normalizedName(value: string): string {
    return value.normalize('NFKC').trim().toLowerCase()
}

/**
 * Trusted system-prompt guidance, kept beside the tool whose distinction it
 * defines. Private Library persistence and a user-visible external copy are
 * deliberately never synonyms.
 */
export function talosLibraryExportInstruction(): string {
    return [
        'Files created or uploaded in TALOS live in its private Library; that is not a copy in shared phone storage.',
        'When the user explicitly asks to download, export, or save a Library file to the device, call library_export.',
        'If this turn first creates the file, wait for its Library id/name and call library_export in a later tool round; never guess or call both tools in parallel.',
        'After creating a Library file you may offer a device copy once when useful, but never open the system picker unless the user asked for or accepted that copy.',
    ].join(' ')
}

export function createTalosLibraryExportTools(
    sources: TalosLibraryExportSources,
): TalosToolDefinition<never>[] {
    const exportFile = defineTalosTool({
        name: 'library_export',
        title: 'Save a Library file to device',
        description: [
            'Create a durable copy of one exact TALOS Library file at a location the user chooses in the system Save-As picker.',
            'Use only when the user asks to download, export, or save a file outside the private Library.',
            'Pass either the exact Library id returned by another tool or the complete visible filename.',
            'If another tool is creating the file now, call this in a later tool round with its returned id/name; never call both in parallel.',
            'Do not fuzzy-match or guess filenames.',
        ].join(' '),
        action: 'write',
        requiredActions: ['read', 'write'],
        input: z.object({
            reference: z.string().trim().min(1).max(240)
                .describe('Exact Library id or complete visible filename.'),
        }),
        async run(input) {
            const candidates = await sources.listCandidates()
            const byId = candidates.find((candidate) => candidate.id === input.reference)
            let selected: TalosLibraryExportCandidate | null = byId ?? null

            if (!selected) {
                const wanted = normalizedName(input.reference)
                const matches = candidates.filter(
                    (candidate) => normalizedName(candidate.displayName) === wanted,
                )
                if (matches.length > 1) {
                    return {
                        ok: false,
                        code: 'TALOS_LIBRARY_EXPORT_AMBIGUOUS',
                        content: `More than one Library file is named "${input.reference}". Ask the user which one; do not choose for them.`,
                    }
                }
                selected = matches[0] ?? null
            }

            if (!selected) {
                return {
                    ok: false,
                    code: 'TALOS_LIBRARY_EXPORT_NOT_FOUND',
                    content: `No available Library file exactly matches "${input.reference}". Ask for the exact filename or Library id.`,
                }
            }

            const result = await sources.exportById(selected.id)
            if (!result) {
                return {
                    ok: false,
                    code: 'TALOS_LIBRARY_EXPORT_NOT_FOUND',
                    content: `"${selected.displayName}" is no longer available to this chat. No copy was saved.`,
                }
            }
            if (result.status === 'cancelled') {
                return {
                    ok: false,
                    code: 'TALOS_FILE_EXPORT_CANCELLED',
                    content: `The system Save-As picker was cancelled. No copy was saved. Do not retry unless the user asks again.`,
                }
            }

            if (result.status === 'started') {
                return {
                    ok: true,
                    content: `Started the browser download for "${result.displayName}" (${result.bytesWritten} bytes). The browser, not TALOS, controls final completion.`,
                    evidence: {
                        library_file_id: selected.id,
                        file_name: result.displayName,
                        bytes: result.bytesWritten,
                        delivery: result.delivery,
                    },
                }
            }

            return {
                ok: true,
                content: `Saved "${result.displayName}" to the location the user chose and verified all ${result.bytesWritten} bytes.`,
                /*
                 * ⛔ Il file è uscito dalla Libreria e sta dove l'ha messo la
                 * persona: **niente `dove`**, perché TALOS non sa aprire una
                 * cartella di sistema e un pulsante che non porta da nessuna
                 * parte è peggio di nessun pulsante.
                 *
                 * ⇒ E i byte sono nel dettaglio, non nella frase soltanto:
                 * «verificato» qui vuol dire che sono stati RILETTI dopo la
                 * scrittura, ed è il numero che lo dimostra.
                 */
                scheda: {
                    tipo: 'creato' as const,
                    titolo: result.displayName,
                    genere: 'File salvato',
                    dettaglio: `${result.bytesWritten} byte`,
                },
                evidence: {
                    library_file_id: selected.id,
                    file_name: result.displayName,
                    bytes: result.bytesWritten,
                    delivery: result.delivery,
                },
            }
        },
    })

    return [exportFile] as TalosToolDefinition<never>[]
}
