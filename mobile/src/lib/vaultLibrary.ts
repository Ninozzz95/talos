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

/**
 * Where a saved page came from, as an address rather than a sentence.
 *
 * Owner 2026-07-27: sources read during a search should appear in the Library
 * as LINKS you can open, not only as a markdown transcript with `Source: …`
 * buried in the prose. Rummaging through the text of every file to find a URL
 * is both slow and a guess; the address belongs in the metadata, where it is a
 * fact.
 *
 * Only http(s) comes back. A Library row becomes something a thumb can tap, so
 * this decides what a tap can reach — `javascript:`, `file:` and `data:` are
 * not addresses, they are attacks.
 */
export function parseVaultSourceUrl(
    metadata: Record<string, unknown> | null | undefined,
): string | null {
    const value = metadata?.source_url
    if (typeof value !== 'string' || value === '') return null
    try {
        const url = new URL(value)
        return url.protocol === 'https:' || url.protocol === 'http:' ? value : null
    } catch {
        return null
    }
}

/** One saved page, as something you can tap rather than something to read. */
export interface TalosSavedLinkRow {
    /** The Library file holding the transcript — the copy that outlives the page. */
    fileId: string
    url: string
    /** The page's own title, not the filename it happens to be stored under. */
    title: string
    /** `corriere.it`, not `www.corriere.it` — the row is one line on a phone. */
    host: string
    savedAt: string
}

/**
 * The address of a page saved before the address was kept as a fact.
 *
 * Self-review 2026-07-27: every source already in the owner's Library predates
 * the metadata, so shipping the Links section without this would have shown him
 * an empty screen on the one Library that matters — the feature would read as
 * broken rather than new. The transcript has always opened with a `Source:`
 * header, so only a header LINE counts: a url quoted further down is something
 * the page mentioned, not where the page lives.
 *
 * New saves never reach here — the stored value wins — so this shrinks to
 * nothing on its own as the old rows are replaced.
 */
function sourceUrlFromTranscript(text: string | null | undefined): string | null {
    if (!text) return null
    for (const line of text.slice(0, 600).split('\n')) {
        const match = /^Source:\s*(\S+)\s*$/.exec(line)
        if (match) return parseVaultSourceUrl({ source_url: match[1] })
    }
    return null
}

/**
 * The links a search left behind.
 *
 * Owner 2026-07-27 asked for these to be PRINTED as links, next to (not instead
 * of) the markdown transcript TALOS keeps. Reading the same page three times in
 * one session is normal, and three identical rows would be noise, so a URL
 * appears once — pointing at the most recent copy, which is the one whose text
 * matches the page as it is now.
 */
export function talosSavedLinkRows(files: readonly TalosLocalVaultFile[]): TalosSavedLinkRow[] {
    const byUrl = new Map<string, TalosSavedLinkRow>()
    for (const file of files) {
        if (parseVaultKind(file.metadata) !== 'web_source') continue
        const url = parseVaultSourceUrl(file.metadata) ?? sourceUrlFromTranscript(file.extracted_text)
        if (!url) continue
        const previous = byUrl.get(url)
        if (previous && previous.savedAt >= file.created_at) continue
        byUrl.set(url, {
            fileId: file.id,
            url,
            title: file.display_name.replace(/\.md$/i, ''),
            host: new URL(url).hostname.replace(/^www\./, ''),
            savedAt: file.created_at,
        })
    }
    return [...byUrl.values()].sort((a, b) => b.savedAt.localeCompare(a.savedAt))
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
