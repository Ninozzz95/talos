import { z } from 'zod'
import { defineTalosTool, type TalosToolDefinition } from '@/lib/tools/registry'
import { rankLibraryDocs, type LibraryDoc } from '@/lib/chat/libraryContext'
import { newTalosMobileId } from '@/lib/mobileIds'
import type { TalosLibraryFileType, TalosVaultOrigin } from '@/lib/vaultLibrary'
export type { TalosLibraryFileType } from '@/lib/vaultLibrary'

/**
 * The first tool set — read-only on purpose.
 *
 * It proves the whole path (registry → four translations → permission gate →
 * audit → agent loop) without a single destructive action, so the parts that
 * are hard to get right are exercised before anything can damage data. The
 * write tools follow once the consent sheet has been used in anger.
 *
 * Every result is DATA. Tool output is wrapped for the model the same way
 * Library documents are — it can be read, it can be quoted, and it is never
 * treated as an instruction, because a document that says "ignore your rules"
 * must not become one just by passing through a tool.
 */
export interface TalosLibraryListEntry {
    id: string
    displayName: string
    mediaType: string
    fileType: TalosLibraryFileType
    origin: TalosVaultOrigin
    originSessionId: string | null
    originSessionTitle: string | null
    createdAt: string
    updatedAt: string
}

export interface TalosToolSources {
    /** Metadata-only source for honest browse/list/count operations. */
    listLibraryEntries(): Promise<TalosLibraryListEntry[]>
    /** Complete extracted text, loaded only by an explicit search call. */
    listLibraryDocs(): Promise<LibraryDoc[]>
    readLibraryDoc(id: string): Promise<{
        name: string
        text: string
        /** Present for a file there is nothing to READ in, only to look at. */
        image?: { base64: string; mediaType: string }
    } | null>
    /**
     * Where one file came from — the second door of famiglia B.
     *
     * Metadata only: never the prompt reference. The record points at a message
     * in a conversation, and handing a model an id it cannot resolve gives it
     * noise and gives the user a thread they did not ask to exist.
     */
    readFileOrigin(id: string): Promise<{
        name: string
        origin: 'uploaded' | 'generated' | 'downloaded' | 'unknown'
        model: string | null
        provider: string | null
        createdAt: string | null
        originSessionTitle: string | null
        sourceUrl: string | null
    } | null>
    listNotes(): Promise<Array<{ title: string; content: string; updated_at: string }>>
    listTasks(): Promise<Array<{ title: string; status: string; priority: string }>>
    searchMemories(query: string): Promise<Array<{ title: string; content: string }>>
    now(): string
}

/** Keeps a tool answer from becoming most of the context window. */
const MAX_TOOL_CONTENT = 8_000

function clip(text: string): string {
    return text.length <= MAX_TOOL_CONTENT
        ? text
        : `${text.slice(0, MAX_TOOL_CONTENT)}\n… truncated at ${MAX_TOOL_CONTENT} characters.`
}

type RankedLibraryDoc = { doc: LibraryDoc; score: number }

function takeCodePoints(value: string, max: number): string {
    const oneLine = value.replace(/\s+/gu, ' ').trim()
    const points = Array.from(oneLine)
    if (points.length <= max) return oneLine
    return `${points.slice(0, Math.max(0, max - 1)).join('')}…`
}

function formatLibrarySearchRecord(doc: LibraryDoc): string {
    return [
        `id: ${takeCodePoints(doc.id, 128)}`,
        `name: ${takeCodePoints(doc.displayName, 256)}`,
        `origin: ${takeCodePoints(doc.origin, 32)}`,
        `from chat: ${takeCodePoints(doc.originSessionTitle ?? 'unknown', 160)}`,
        `excerpt: ${takeCodePoints(doc.text, 300)}`,
    ].join('\n')
}

function buildLibrarySearchPage(
    matching: ReadonlyArray<RankedLibraryDoc>,
    offset: number,
    requestedLimit: number,
): {
    entries: RankedLibraryDoc[]
    content: string
    nextOffset: number | null
} {
    const entries: RankedLibraryDoc[] = []
    const records: string[] = []
    const candidates = matching.slice(offset, offset + requestedLimit)

    for (const candidate of candidates) {
        const record = formatLibrarySearchRecord(candidate.doc)
        const candidateEnd = offset + entries.length + 1
        const candidateNextOffset = candidateEnd < matching.length ? candidateEnd : null
        const candidateHeading = `Library search: showing ${offset + 1}-${candidateEnd} of ${matching.length} matching files.`
            + (candidateNextOffset === null ? '' : ` Next offset: ${candidateNextOffset}.`)
        const candidateContent = [candidateHeading, ...records, record].join('\n\n')
        if (candidateContent.length > MAX_TOOL_CONTENT) break
        entries.push(candidate)
        records.push(record)
    }

    // Every field is bounded above, so one record always fits. Keep the
    // invariant explicit: a valid offset must never return an empty page with
    // a self-repeating continuation.
    if (entries.length === 0 && candidates.length > 0) {
        const first = candidates[0]!
        entries.push(first)
        records.push(formatLibrarySearchRecord(first.doc))
    }

    const end = offset + entries.length
    const nextOffset = end < matching.length ? end : null
    const heading = `Library search: showing ${offset + 1}-${end} of ${matching.length} matching files.`
        + (nextOffset === null ? '' : ` Next offset: ${nextOffset}.`)
    const content = [heading, ...records].join('\n\n')
    if (content.length > MAX_TOOL_CONTENT) {
        throw new Error('Library search record exceeds the bounded tool-result contract.')
    }
    return { entries, content, nextOffset }
}

type LibraryListOrigin = 'all' | TalosVaultOrigin
type LibraryListFileType = 'all' | TalosLibraryFileType

interface LibraryListCursorState {
    origin: LibraryListOrigin
    fileType: LibraryListFileType
    seen: number
    after: Pick<TalosLibraryListEntry, 'updatedAt' | 'createdAt' | 'id'>
}

const MAX_LIBRARY_LIST_CURSORS = 128
const LIBRARY_LIST_HEADING_RESERVE = 320

function compareLibraryListEntries(
    left: TalosLibraryListEntry,
    right: TalosLibraryListEntry,
): number {
    return right.updatedAt.localeCompare(left.updatedAt)
        || right.createdAt.localeCompare(left.createdAt)
        || right.id.localeCompare(left.id)
}

function isAfterLibraryListCursor(
    entry: TalosLibraryListEntry,
    after: LibraryListCursorState['after'],
): boolean {
    if (entry.updatedAt !== after.updatedAt) return entry.updatedAt < after.updatedAt
    if (entry.createdAt !== after.createdAt) return entry.createdAt < after.createdAt
    return entry.id < after.id
}

function formatLibraryListRecord(entry: TalosLibraryListEntry): string {
    return [
        `id: ${takeCodePoints(entry.id, 128)}`,
        `name: ${takeCodePoints(entry.displayName, 256)}`,
        `type: ${entry.fileType}`,
        `media type: ${takeCodePoints(entry.mediaType, 128)}`,
        `origin: ${entry.origin}`,
        `from chat: ${takeCodePoints(entry.originSessionTitle ?? 'unknown', 160)}`,
        `created: ${takeCodePoints(entry.createdAt, 40)}`,
    ].join('\n')
}

function boundedLibraryListPage(
    candidates: readonly TalosLibraryListEntry[],
    requestedPageSize: number,
): { entries: TalosLibraryListEntry[]; records: string[] } {
    const entries: TalosLibraryListEntry[] = []
    const records: string[] = []
    for (const entry of candidates.slice(0, requestedPageSize)) {
        const record = formatLibraryListRecord(entry)
        const candidateContent = records.length === 0
            ? record
            : `${records.join('\n\n')}\n\n${record}`
        if (candidateContent.length + LIBRARY_LIST_HEADING_RESERVE > MAX_TOOL_CONTENT) break
        entries.push(entry)
        records.push(record)
    }

    // Every field above is independently bounded. Keep forward progress even
    // if a future heading grows near its reserved budget.
    if (entries.length === 0 && candidates.length > 0) {
        entries.push(candidates[0]!)
        records.push(formatLibraryListRecord(candidates[0]!))
    }
    return { entries, records }
}

export function createTalosReadTools(sources: TalosToolSources): TalosToolDefinition<never>[] {
    const libraryListCursors = new Map<string, LibraryListCursorState>()

    function issueLibraryListCursor(state: LibraryListCursorState): string {
        while (libraryListCursors.size >= MAX_LIBRARY_LIST_CURSORS) {
            const oldest = libraryListCursors.keys().next().value as string | undefined
            if (!oldest) break
            libraryListCursors.delete(oldest)
        }
        let token = newTalosMobileId()
        while (libraryListCursors.has(token)) token = newTalosMobileId()
        libraryListCursors.set(token, state)
        return token
    }

    const libraryList = defineTalosTool({
        name: 'library_list',
        title: 'Browse the Library',
        description: 'List, browse, count or filter every local Library file the user currently lets this chat access. Use this when the user asks what/all files are in the Library without a keyword; use library_search only for filename or content matching. Follow next_page_token until it is null when the user asks for all files, repeating the same origin and file_type filters.',
        action: 'read',
        input: z.object({
            origin: z.enum(['all', 'uploaded', 'generated']).default('all')
                .describe('Filter by how the file entered the Library.'),
            file_type: z.enum(['all', 'image', 'document', 'link']).default('all')
                .describe('Filter images, ordinary documents, or archived web links.'),
            page_size: z.number().int().min(1).max(20).default(10)
                .describe('Maximum entries in this page; a byte bound may return fewer.'),
            page_token: z.string().min(1).max(128).optional()
                .describe('Opaque next_page_token from the preceding library_list result. Repeat the same filters.'),
        }),
        async run(input) {
            const cursor = input.page_token
                ? libraryListCursors.get(input.page_token)
                : undefined
            if (input.page_token && !cursor) {
                return {
                    ok: false,
                    content: 'That Library page token is invalid or expired. Restart library_list without page_token.',
                    evidence: {
                        listed: [],
                        returned: 0,
                        next_page_token: null,
                        error_code: 'TALOS_LIBRARY_LIST_CURSOR_INVALID',
                    },
                }
            }
            if (cursor && (
                cursor.origin !== input.origin
                || cursor.fileType !== input.file_type
            )) {
                return {
                    ok: false,
                    content: 'Library pagination must continue with the same filters. Restart library_list without page_token to change filters.',
                    evidence: {
                        listed: [],
                        returned: 0,
                        next_page_token: null,
                        error_code: 'TALOS_LIBRARY_LIST_FILTER_DRIFT',
                    },
                }
            }

            const filtered = (await sources.listLibraryEntries())
                .filter((entry) => input.origin === 'all' || entry.origin === input.origin)
                .filter((entry) => input.file_type === 'all' || entry.fileType === input.file_type)
                .slice()
                .sort(compareLibraryListEntries)
            const candidates = cursor
                ? filtered.filter((entry) => isAfterLibraryListCursor(entry, cursor.after))
                : filtered
            const page = boundedLibraryListPage(candidates, input.page_size)
            const seenBefore = cursor?.seen ?? 0
            const seenAfter = seenBefore + page.entries.length
            const hasMore = candidates.length > page.entries.length
            const last = page.entries.at(-1)
            const nextPageToken = hasMore && last
                ? issueLibraryListCursor({
                    origin: input.origin,
                    fileType: input.file_type,
                    seen: seenAfter,
                    after: {
                        updatedAt: last.updatedAt,
                        createdAt: last.createdAt,
                        id: last.id,
                    },
                })
                : null

            if (page.entries.length === 0) {
                return {
                    ok: true,
                    content: filtered.length === 0
                        ? 'There are no Library files for those filters.'
                        : `No more Library files. Total current files for those filters: ${filtered.length}.`,
                    evidence: {
                        listed: [],
                        total_size: filtered.length,
                        returned: 0,
                        next_page_token: null,
                        filters: { origin: input.origin, file_type: input.file_type },
                    },
                }
            }

            const heading = `Library list: showing ${seenBefore + 1}-${seenAfter} of ${filtered.length} current files.`
                + (nextPageToken
                    ? ` Next page token: ${nextPageToken}. Repeat the same origin and file_type filters.`
                    : ' End of Library list.')
            const content = [heading, ...page.records].join('\n\n')
            if (content.length > MAX_TOOL_CONTENT) {
                throw new Error('Library list record exceeds the bounded tool-result contract.')
            }
            return {
                ok: true,
                content,
                evidence: {
                    listed: page.entries.map((entry) => entry.id),
                    total_size: filtered.length,
                    returned: page.entries.length,
                    next_page_token: nextPageToken,
                    filters: { origin: input.origin, file_type: input.file_type },
                },
            }
        },
    })

    const librarySearch = defineTalosTool({
        name: 'library_search',
        title: 'Search the Library',
        description: 'Search the user\'s local uploaded and generated Library files and return a bounded page of genuine matches with their id, name, origin and a short excerpt. Use it before answering questions about the user\'s own files, and follow next_offset when more matches are needed.',
        action: 'read',
        input: z.object({
            query: z.string().min(1).describe('What to look for, in natural language.'),
            limit: z.number().int().min(1).max(20).default(5).describe('How many matching files to return in this page.'),
            offset: z.number().int().min(0).default(0).describe('Zero-based result offset. Use next_offset from the previous page.'),
        }),
        async run(input) {
            const docs = await sources.listLibraryDocs()
            // rankLibraryDocs intentionally keeps score-zero rows as a recency
            // fallback for ambient context. A SEARCH result cannot do that:
            // calling unrelated photos a match is fabricated evidence.
            const matching = rankLibraryDocs(docs, input.query)
                .filter(({ score }) => score > 0)
            if (matching.length === 0) {
                return {
                    ok: true,
                    content: 'No document in the Library matched that.',
                    evidence: {
                        matched: [],
                        matched_total: 0,
                        returned: 0,
                        offset: input.offset,
                        next_offset: null,
                    },
                }
            }
            if (input.offset >= matching.length) {
                return {
                    ok: true,
                    content: `No more Library matches. Total matching files: ${matching.length}.`,
                    evidence: {
                        matched: [],
                        matched_total: matching.length,
                        returned: 0,
                        offset: input.offset,
                        next_offset: null,
                    },
                }
            }
            const page = buildLibrarySearchPage(matching, input.offset, input.limit)
            return {
                ok: true,
                content: page.content,
                evidence: {
                    matched: page.entries.map(({ doc }) => doc.id),
                    matched_total: matching.length,
                    returned: page.entries.length,
                    offset: input.offset,
                    next_offset: page.nextOffset,
                },
            }
        },
    })

    const libraryRead = defineTalosTool({
        name: 'library_read',
        title: 'Read a Library document',
        description: 'Read one Library item by its id, as returned by library_list or library_search. Documents come back as text; an image comes back as an image for you to look at.',
        action: 'read',
        input: z.object({ id: z.string().min(1).describe('The file id from library_list or library_search.') }),
        async run(input) {
            const doc = await sources.readLibraryDoc(input.id)
            if (!doc) return { ok: false, content: `No Library document has the id "${input.id}".` }

            if (doc.image) {
                // Handed over as a part on the next user turn, which is the one
                // shape every provider accepts — and it puts the picture in the
                // conversation, so the user can see what the model was given.
                const mediaType = doc.image.mediaType === 'image/png'
                    || doc.image.mediaType === 'image/webp' ? doc.image.mediaType : 'image/jpeg'
                return {
                    ok: true,
                    content: `name: ${doc.name} — this is an image; it follows for you to look at.`,
                    images: [{
                        type: 'image' as const,
                        attachmentId: input.id,
                        name: doc.name,
                        mediaType,
                        base64: doc.image.base64,
                        sha256: '',
                    }],
                    evidence: { id: input.id },
                }
            }

            return { ok: true, content: clip(`name: ${doc.name}\n\n${doc.text}`), evidence: { id: input.id } }
        },
    })

    /**
     * Owner's standing rule: every feature has TWO doors — the station and the
     * tool. The origin card is the station; this is the other one, so a model in
     * ANOTHER chat can be asked "who made this?" and can answer.
     *
     * In the `library` group deliberately: incognito withdraws the whole group,
     * and tracing a file back to a conversation is precisely what an anonymous
     * chat must not be able to do.
     */
    const libraryFileOrigin = defineTalosTool({
        name: 'library_file_origin',
        title: 'Where a Library file came from',
        description: 'Report where one Library file came from: whether a model generated it or the user brought it in, which model and provider made it, when, and which chat it came from. Use it when the user asks who or what made a file, or whether a file is AI-generated. Ids come from library_list or library_search.',
        action: 'read',
        input: z.object({
            id: z.string().min(1).describe('The file id from library_list or library_search.'),
        }),
        async run(input) {
            const record = await sources.readFileOrigin(input.id)
            if (!record) return { ok: false, content: `No Library file has the id "${input.id}".` }

            const lines = [`name: ${takeCodePoints(record.name, 200)}`]
            if (record.origin === 'unknown') {
                // An honest answer IS an answer. Not a failure, and not a
                // sentence invented to fill the silence.
                lines.push('origin: not recorded')
                lines.push('This file predates the origin record, or it was made in a chat that keeps none.')
            } else {
                lines.push(`origin: ${record.origin}`)
                if (record.origin === 'generated') {
                    // Bounded and whitespace-collapsed like every sibling field.
                    // A model id is user-supplied (Model Lab accepts a manual
                    // one) and this output is a newline-delimited record the
                    // model is told to read as fact — an id containing a
                    // newline could forge an `origin:` or `from chat:` line
                    // about a file it does not describe.
                    lines.push(`made by: ${record.model ? takeCodePoints(record.model, 120) : 'an unrecorded model'}`)
                    lines.push(`provider: ${record.provider ? takeCodePoints(record.provider, 60) : 'not recorded'}`)
                }
                if (record.createdAt) lines.push(`created: ${takeCodePoints(record.createdAt, 40)}`)
                if (record.originSessionTitle) {
                    lines.push(`from chat: ${takeCodePoints(record.originSessionTitle, 160)}`)
                }
                if (record.sourceUrl) lines.push(`source: ${takeCodePoints(record.sourceUrl, 400)}`)
            }
            return {
                ok: true,
                content: lines.join('\n'),
                evidence: { id: input.id, origin: record.origin },
            }
        },
    })

    const notesList = defineTalosTool({
        name: 'notes_list',
        title: 'List notes',
        description: 'List the notes the user keeps on this device, most recently updated first.',
        action: 'read',
        input: z.object({ limit: z.number().int().min(1).max(50).default(20) }),
        async run(input) {
            const notes = (await sources.listNotes()).slice(0, input.limit)
            if (notes.length === 0) return { ok: true, content: 'There are no notes.' }
            return {
                ok: true,
                content: clip(notes.map((note) => `- ${note.title}: ${note.content.slice(0, 200)}`).join('\n')),
            }
        },
    })

    const tasksList = defineTalosTool({
        name: 'tasks_list',
        title: 'List tasks',
        description: 'List the user\'s tasks with their status and priority.',
        action: 'read',
        input: z.object({
            status: z.enum(['all', 'open', 'done']).default('all').describe('Filter by completion.'),
            limit: z.number().int().min(1).max(50).default(20),
        }),
        async run(input) {
            const all = await sources.listTasks()
            const filtered = input.status === 'all'
                ? all
                : all.filter((task) => (input.status === 'done' ? task.status === 'done' : task.status !== 'done'))
            const tasks = filtered.slice(0, input.limit)
            if (tasks.length === 0) return { ok: true, content: 'There are no matching tasks.' }
            return {
                ok: true,
                content: clip(tasks.map((task) => `- [${task.status}] ${task.title} (${task.priority})`).join('\n')),
            }
        },
    })

    const memorySearch = defineTalosTool({
        name: 'memory_search',
        title: 'Search memory',
        description: 'Search what the user has explicitly asked TALOS to remember.',
        action: 'read',
        input: z.object({ query: z.string().min(1), limit: z.number().int().min(1).max(20).default(5) }),
        async run(input) {
            const found = (await sources.searchMemories(input.query)).slice(0, input.limit)
            if (found.length === 0) return { ok: true, content: 'Nothing remembered matches that.' }
            return {
                ok: true,
                content: clip(found.map((entry) => `- ${entry.title}: ${entry.content.slice(0, 300)}`).join('\n')),
            }
        },
    })

    const timeNow = defineTalosTool({
        name: 'time_now',
        title: 'Current date and time',
        description: 'The current local date and time on this device. Use it instead of guessing today\'s date.',
        action: 'read',
        input: z.object({}),
        async run() {
            return { ok: true, content: sources.now() }
        },
    })

    return [
        libraryList,
        librarySearch,
        libraryRead,
        libraryFileOrigin,
        notesList,
        tasksList,
        memorySearch,
        timeNow,
    ] as TalosToolDefinition<never>[]
}
