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
import { canonicalTalosWebSourceUrl } from '@/lib/search/webSourceArchive'
import { matchesTalosLibrarySearchFields } from '@/lib/librarySearchText'

export type TalosVaultOrigin = 'uploaded' | 'generated'
export type TalosLibraryFileType = 'image' | 'document' | 'link'
export type TalosLibrarySurfaceTab = 'all' | 'images' | 'files' | 'links'

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
 * One product identity for every Library surface and the agent tool boundary.
 *
 * A web source is retained as Markdown so its evidence survives a dead page,
 * but that storage MIME must not turn its user-facing identity back into a
 * document. Source kind therefore takes precedence over MIME.
 */
export function talosLibraryFileType(
    file: Pick<TalosLocalVaultFile, 'media_type' | 'metadata'>,
): TalosLibraryFileType {
    if (parseVaultKind(file.metadata) === 'web_source') return 'link'
    return file.media_type.startsWith('image/') ? 'image' : 'document'
}

/**
 * Global and per-chat Libraries deliberately share one mutually-exclusive
 * FILE-branch contract. `all` admits every non-link file; a surface that owns
 * a Links projection aggregates it separately so research addresses are never
 * duplicated as transcript tiles.
 */
export function matchesTalosLibrarySurfaceTab(
    file: Pick<TalosLocalVaultFile, 'media_type' | 'metadata'>,
    tab: TalosLibrarySurfaceTab,
): boolean {
    const type = talosLibraryFileType(file)
    if (tab === 'all') return type !== 'link'
    if (tab === 'images') return type === 'image'
    if (tab === 'files') return type === 'document'
    return type === 'link'
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
    return canonicalTalosWebSourceUrl(metadata?.source_url)
}

function safeStoredLinkTitle(value: unknown, url: string): string {
    if (typeof value === 'string') {
        const title = value
            .normalize('NFKC')
            .replace(/[\u0000-\u001f\u007f-\u009f\u00ad\u200b-\u200f\u202a-\u202e\u2066-\u2069\ufeff]/g, '')
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, 200)
        if (title) return title
    }
    return new URL(url).hostname.replace(/^www\./, '')
}

/**
 * One compact search dossier can project multiple links. Treat the untyped
 * metadata bag as hostile: exact object fields, canonical web URL, bounded
 * display title, and per-file URL deduplication.
 */
function parseVaultSourceLinks(
    metadata: Record<string, unknown> | null | undefined,
): Array<{ url: string; title: string }> {
    const raw = metadata?.source_links
    if (!Array.isArray(raw)) return []
    const byUrl = new Map<string, { url: string; title: string }>()
    for (const candidate of raw.slice(0, 10)) {
        if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) continue
        const row = candidate as Record<string, unknown>
        const url = canonicalTalosWebSourceUrl(row.url)
        if (!url || byUrl.has(url)) continue
        byUrl.set(url, { url, title: safeStoredLinkTitle(row.title, url) })
    }
    return [...byUrl.values()]
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
        const multiple = parseVaultSourceLinks(file.metadata)
        const single = parseVaultSourceUrl(file.metadata) ?? (
            multiple.length === 0 ? sourceUrlFromTranscript(file.extracted_text) : null
        )
        const links = [
            ...multiple,
            ...(single
                ? [{ url: single, title: file.display_name.replace(/\.md$/i, '') }]
                : []),
        ]
        for (const link of links) {
            const previous = byUrl.get(link.url)
            if (previous && previous.savedAt >= file.created_at) continue
            byUrl.set(link.url, {
                fileId: file.id,
                url: link.url,
                title: link.title,
                host: new URL(link.url).hostname.replace(/^www\./, ''),
                savedAt: file.created_at,
            })
        }
    }
    return [...byUrl.values()].sort((a, b) => b.savedAt.localeCompare(a.savedAt))
}

/**
 * Search the logical saved-link projection by what the user can identify.
 *
 * The retained Markdown dossier remains useful search evidence, but it is not
 * the row identity. Title, host and canonical URL therefore participate too,
 * through the same Unicode-safe matcher used by ordinary Library files.
 */
export function filterTalosSavedLinkRows(
    files: readonly TalosLocalVaultFile[],
    query: string,
): TalosSavedLinkRow[] {
    const filesById = new Map(files.map((file) => [file.id, file]))
    const rows = talosSavedLinkRows(files)
    const directMatches = rows.filter((row) => (
        matchesTalosLibrarySearchFields(query, [
            { text: row.title, weight: 3 },
            { text: row.host, weight: 2 },
            { text: row.url, weight: 2 },
        ])
    ))
    // A real dossier repeats every result URL in one body. Once the query
    // identifies a visible row, admitting siblings through that shared text
    // would make a host filter look broken. Copy-text search is therefore a
    // fallback only when no logical row identity matched.
    if (directMatches.length > 0) return directMatches
    return rows.filter((row) => {
        const retainedCopy = filesById.get(row.fileId)
        return matchesTalosLibrarySearchFields(query, [
            { text: retainedCopy?.display_name, weight: 3 },
            { text: retainedCopy?.extracted_text },
        ])
    })
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
    const admitted = new Set(filter.alsoFileIds ?? [])
    return files
        .filter((file) => !filter.kind || parseVaultKind(file.metadata) === filter.kind)
        .filter((file) => !filter.sessionId
            || admitted.has(file.id)
            || parseVaultOriginSession(file.metadata) === filter.sessionId)
        .filter((file) => filter.origin === 'all' || parseVaultOrigin(file.metadata) === filter.origin)
        .filter((file) => matchesTalosLibrarySearchFields(filter.query, [
            { text: file.display_name },
            { text: file.extracted_text },
        ]))
        .slice()
        .sort((a, b) => b.created_at.localeCompare(a.created_at))
}
