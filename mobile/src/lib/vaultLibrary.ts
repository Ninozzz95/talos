/**
 * Cross-chat document Library (owner 2026-07-24 — ChatGPT "Library" parity + the
 * TALOS one-up: search INSIDE documents via extracted text, all local-first).
 *
 * The vault (repository.listVaultFiles) is already global/cross-chat; this module
 * adds the two things the Library needs on top of it — an uploaded/generated
 * origin (stored in metadata.origin, fail-closed for legacy rows) and a pure,
 * testable filter/sort over the file list.
 */
import type { TalosLocalVaultFile } from '@/repositories/chatRepository'

export type TalosVaultOrigin = 'uploaded' | 'generated'

/** Fail-closed: anything not explicitly 'generated' is treated as an upload. */
export function parseVaultOrigin(metadata: Record<string, unknown> | null | undefined): TalosVaultOrigin {
    return metadata && metadata.origin === 'generated' ? 'generated' : 'uploaded'
}

export interface LibraryFilter {
    query: string
    origin: 'all' | TalosVaultOrigin
}

export function filterLibraryFiles(
    files: readonly TalosLocalVaultFile[],
    filter: LibraryFilter,
): TalosLocalVaultFile[] {
    const query = filter.query.trim().toLowerCase()
    return files
        .filter((file) => filter.origin === 'all' || parseVaultOrigin(file.metadata) === filter.origin)
        .filter((file) => query === ''
            || file.display_name.toLowerCase().includes(query)
            || (file.extracted_text?.toLowerCase().includes(query) ?? false))
        .slice()
        .sort((a, b) => b.created_at.localeCompare(a.created_at))
}
