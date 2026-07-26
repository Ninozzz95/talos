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

/**
 * Which chat a document came from — the upload site, or the chat whose model
 * generated it. Lives in the untyped metadata bag; this is its one reader.
 */
export function parseVaultOriginSession(
    metadata: Record<string, unknown> | null | undefined,
): string | null {
    const value = metadata?.origin_session_id
    return typeof value === 'string' && value !== '' ? value : null
}

/**
 * The per-document opt-out from model context.
 *
 * The injection path gates on `library_shared !== false`, so an ABSENT flag
 * means shared. Reading it as a plain boolean would silently withdraw every
 * legacy document from the model the day a toggle shipped — this exists so the
 * UI and the gate cannot drift on that point.
 */
export function isTalosLibraryFileShared(
    metadata: Record<string, unknown> | null | undefined,
): boolean {
    return (metadata as { library_shared?: boolean } | null | undefined)?.library_shared !== false
}

/**
 * Whether a file is something the user (or the model) MADE, or a page that was
 * read while researching. Fifteen sources from one search must not bury the
 * user's own documents — see `kind` in the vault service.
 */
export function parseVaultKind(
    metadata: Record<string, unknown> | null | undefined,
): 'document' | 'web_source' {
    return metadata?.kind === 'web_source' ? 'web_source' : 'document'
}

export interface LibraryFilter {
    query: string
    origin: 'all' | TalosVaultOrigin
    /**
     * Owner 2026-07-26 — the per-chat gallery. Narrows to documents whose
     * ORIGIN is this chat: uploaded here, or generated here by the model.
     */
    sessionId?: string | null
    /** Omit sources, or show only them. Absent means everything. */
    kind?: 'document' | 'web_source'
    /**
     * Extra ids to admit regardless of origin — the files actually ATTACHED in
     * this chat, which may have been picked from the global Library and so
     * carry a different origin. Origin alone would hide them; attachments alone
     * would hide everything the model generated, since a generated document is
     * never a message attachment. The gallery needs both.
     */
    alsoFileIds?: readonly string[]
}

export function filterLibraryFiles(
    files: readonly TalosLocalVaultFile[],
    filter: LibraryFilter,
): TalosLocalVaultFile[] {
    const query = filter.query.trim().toLowerCase()
    const admitted = new Set(filter.alsoFileIds ?? [])
    return files
        .filter((file) => !filter.kind || parseVaultKind(file.metadata) === filter.kind)
        .filter((file) => !filter.sessionId
            || admitted.has(file.id)
            || parseVaultOriginSession(file.metadata) === filter.sessionId)
        .filter((file) => filter.origin === 'all' || parseVaultOrigin(file.metadata) === filter.origin)
        .filter((file) => query === ''
            || file.display_name.toLowerCase().includes(query)
            || (file.extracted_text?.toLowerCase().includes(query) ?? false))
        .slice()
        .sort((a, b) => b.created_at.localeCompare(a.created_at))
}
