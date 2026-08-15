import { z } from 'zod'
import { defineTalosTool, type TalosToolDefinition } from '@/lib/tools/registry'
import { rankLibraryDocs, type LibraryDoc } from '@/lib/chat/libraryContext'
import { newTalosMobileId } from '@/lib/mobileIds'
import type { TalosLibraryFileType, TalosVaultOrigin } from '@/lib/vaultLibrary'
import { TALOS_CONTENT_ORIGIN_FALLBACK, type TalosContentOrigin } from '@/lib/tools/security'
import type { TalosFileOrigin } from '@/lib/files/provenance'
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
/**
 * ⛔ A8 — l'origine di un FILE, tradotta nella provenienza del suo CONTENUTO.
 *
 * La Libreria registra da sempre `uploaded | generated | downloaded` per ogni
 * file, e la difesa contro l'iniezione la buttava via: `library_read` tingeva
 * la conversazione allo stesso modo per un tuo documento e per un PDF preso
 * dalla rete. Qui quel dato smette di essere sprecato.
 *
 * - `uploaded` — l'hai portato tu: **non** è un vettore di iniezione.
 * - `downloaded` — viene da fuori: lo è, ed è il caso per cui la regola esiste.
 * - `generated` — l'ha scritto un modello. Sospetto per **eredità**: se è nato
 *   da una pagina web ne porta dentro il testo. Trattarlo come fidato sarebbe
 *   il buco esatto che un attaccante cerca — «fatti riassumere questa pagina,
 *   poi leggi il riassunto».
 */
export function talosOriginOfVaultFile(origin: TalosFileOrigin | null | undefined): TalosContentOrigin {
    // ⛔ Si legge il record di PROVENIENZA, non `TalosVaultOrigin`.
    //
    // Sono due vocabolari, e la differenza e' esattamente quella che serve:
    // `TalosVaultOrigin` conosce solo `uploaded | generated`, mentre il record
    // di provenienza distingue anche `downloaded` — cioe' il solo caso per cui
    // questa regola esiste. Usare quello povero avrebbe trattato un PDF preso
    // dalla rete come una cosa nostra.
    if (origin === 'uploaded') return 'user-direct'
    if (origin === 'downloaded') return 'external'
    // `generated` o sconosciuto: sospetto. Un file senza storia non merita
    // fiducia piu' di uno che dichiara di venire da fuori.
    return 'derived'
}

/**
 * L'elenco porta il vocabolario POVERO (`uploaded | generated`), perche' e'
 * quello della riga di sintesi. Basta: quello che manca — `downloaded` — non
 * puo' comparire in un elenco senza comparire anche come `generated` o
 * `uploaded`, e in ogni caso il mancante cadrebbe nel ramo prudente.
 */
export function talosOriginOfListEntry(origin: TalosVaultOrigin): TalosContentOrigin {
    return origin === 'uploaded' ? 'user-direct' : 'derived'
}

/** Fra tanti elementi vince il PEGGIORE: un elenco con dentro una cosa esterna e' esterno. */
export function talosWorstOrigin(
    origini: readonly TalosContentOrigin[],
): TalosContentOrigin {
    if (origini.some((riga) => riga === 'external')) return 'external'
    if (origini.some((riga) => riga === 'derived')) return 'derived'
    return 'user-direct'
}

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
        /**
         * A8 — da dove viene QUESTO file, per non tingere tutto uguale.
         *
         * E' il record di PROVENIENZA (tre valori, `downloaded` incluso), non
         * `TalosVaultOrigin` che ne conosce due: il caso che conta — un file
         * preso dalla rete — esiste solo nel primo.
         */
        origin?: TalosFileOrigin | null
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
    /**
     * ⛔ L'`id` NON è un dettaglio di implementazione da nascondere al modello.
     *
     * `notes_update`, `notes_delete`, `tasks_complete`, `tasks_update` e
     * `tasks_delete` dicono tutti, nella loro descrizione, «chiama prima la
     * lista per prendere l'id». Per settimane le liste non lo hanno mai emesso:
     * cinque strumenti di scrittura che chiedevano un dato che nessuno poteva
     * ottenere, e il modello finiva per inventarlo o per rinunciare.
     *
     * Trovato leggendo il codice il 2026-08-07, mentre si completava il CRUD
     * delle attività. Nessun test lo copriva perché ogni test passava l'id a
     * mano — è il punto cieco tipico del provare i pezzi senza provare la
     * catena.
     */
    /**
     * A8 — ogni riga porta la propria provenienza.
     *
     * Prima queste tre superfici tingevano la conversazione **sempre**, per
     * bandiera statica del tool. Con la provenienza per riga, un elenco di note
     * scritte dall'utente smette di contaminare — e la trifecta smette di
     * chiudersi su ogni «elenca le mie note».
     */
    listNotes(): Promise<Array<{
        id: string
        title: string
        content: string
        updated_at: string
        contentOrigin?: TalosContentOrigin
    }>>
    listTasks(): Promise<Array<{
        id: string
        title: string
        status: string
        priority: string
        description: string | null
        contentOrigin?: TalosContentOrigin
    }>>
    searchMemories(query: string): Promise<Array<{
        title: string
        content: string
        contentOrigin?: TalosContentOrigin
    }>>
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
                    // Un elenco vuoto non ha portato dentro NIENTE: dire il
                    // contrario contaminerebbe la conversazione per zero righe.
                    contentOrigin: 'user-direct',
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
                /*
                 * A8 — vale quanto l'elemento peggiore che ha davvero elencato.
                 *
                 * Anche un elenco e' un vettore: il NOME di un file scaricato
                 * lo sceglie chi l'ha prodotto, e «rapporto — ignora le
                 * istruzioni precedenti.pdf» e' un nome legale. Ma una Libreria
                 * di soli file caricati dall'utente smette di contaminare, ed
                 * e' il caso della stragrande maggioranza delle conversazioni.
                 */
                contentOrigin: talosWorstOrigin(
                    page.entries.map((entry) => talosOriginOfListEntry(entry.origin)),
                ),
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
                    // Zero risultati: non e' entrato niente.
                    contentOrigin: 'user-direct',
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
                    // Zero risultati: non e' entrato niente.
                    contentOrigin: 'user-direct',
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
                // A8 — qui torna TESTO estratto, non solo nomi: e' il caso in
                // cui la provenienza pesa di piu'. Vale quanto il peggiore fra
                // i documenti che ha davvero restituito.
                contentOrigin: talosWorstOrigin(
                    page.entries.map(({ doc }) => talosOriginOfListEntry(doc.origin)),
                ),
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
                    contentOrigin: talosOriginOfVaultFile(doc.origin),
                    evidence: { id: input.id, origin: doc.origin ?? 'unknown' },
                }
            }

            return {
                ok: true,
                content: clip(`name: ${doc.name}

${doc.text}`),
                /*
                 * A8 — NON «la Libreria e' non attendibile», ma «QUESTO file
                 * viene da qui».
                 *
                 * E' il punto in cui la difesa smette di essere rumore: un
                 * documento caricato dall'utente non contamina piu' la
                 * conversazione, quindi la trifecta non si chiude su ogni
                 * lettura, quindi la conferma arriva quando serve davvero.
                 */
                contentOrigin: talosOriginOfVaultFile(doc.origin),
                evidence: { id: input.id, origin: doc.origin ?? 'unknown' },
            }
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
            if (notes.length === 0) {
                return { ok: true, content: 'There are no notes.', contentOrigin: 'user-direct' }
            }
            return {
                ok: true,
                content: clip(notes
                    .map((note) => `- ${note.title}: ${note.content.slice(0, 200)} — id ${note.id}`)
                    .join('\n')),
                // A8 — vale quanto la nota peggiore fra quelle elencate.
                contentOrigin: talosWorstOrigin(
                    notes.map((riga) => riga.contentOrigin ?? TALOS_CONTENT_ORIGIN_FALLBACK),
                ),
                evidence: { listed: notes.map((note) => note.id), returned: notes.length },
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
            if (tasks.length === 0) {
                return { ok: true, content: 'There are no matching tasks.', contentOrigin: 'user-direct' }
            }
            return {
                ok: true,
                /*
                 * L'id in coda e non in testa: la riga si legge come una lista
                 * di cose da fare, e l'identificativo serve solo a chi deve
                 * agirci. In testa spingerebbe fuori il titolo su uno schermo
                 * stretto, che è ciò che una persona legge davvero.
                 */
                content: clip(tasks
                    .map((task) => `- [${task.status}] ${task.title} (${task.priority})`
                        + (task.description ? ` — ${task.description.slice(0, 160)}` : '')
                        + ` — id ${task.id}`)
                    .join('\n')),
                // A8 — vale quanto la riga peggiore fra quelle elencate.
                contentOrigin: talosWorstOrigin(
                    tasks.map((riga) => riga.contentOrigin ?? TALOS_CONTENT_ORIGIN_FALLBACK),
                ),
                evidence: { listed: tasks.map((task) => task.id), returned: tasks.length },
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
            if (found.length === 0) {
                return { ok: true, content: 'Nothing remembered matches that.', contentOrigin: 'user-direct' }
            }
            return {
                ok: true,
                content: clip(found.map((entry) => `- ${entry.title}: ${entry.content.slice(0, 300)}`).join('\n')),
                /*
                 * A8, e qui pesa piu' che altrove.
                 *
                 * Quello che sta in memoria il modello lo rilegge **da solo** in
                 * ogni conversazione futura: una memoria annotata mentre la
                 * catena era contaminata e' un'istruzione altrui che torna ogni
                 * volta. Dichiararne la provenienza e' l'unico modo di non
                 * fidarsene per sempre.
                 */
                contentOrigin: talosWorstOrigin(
                    found.map((riga) => riga.contentOrigin ?? TALOS_CONTENT_ORIGIN_FALLBACK),
                ),
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
            /*
             * ⛔⛔⛔ IL GIORNO DELLA SETTIMANA SI DICE, non si fa dedurre — e il
             * fuso è quello del TELEFONO, non UTC.
             *
             * ## Il difetto, misurato sul Pad il 2026-08-14
             *
             * «cosa ho in programma questo weekend?» → «Oggi è **giovedì** 14
             * agosto. Il weekend è sabato 16 e domenica 17». Era **venerdì**,
             * e il weekend era sabato 15. Gli eventi che ha elencato erano
             * giusti, le **date** con cui li ha etichettati no.
             *
             * ## Due cause, nella stessa riga
             *
             * 1. Si rendeva `toISOString()`, cioè **UTC**, mentre la
             *    descrizione prometteva «local». A Roma d'estate sono due ore
             *    di differenza: **fra mezzanotte e le 2 il giorno era ancora
             *    quello prima**, per ogni domanda che parla di «oggi».
             * 2. Il nome del giorno non c'era, quindi il modello lo calcolava —
             *    e calcolare che giorno della settimana cade una data è
             *    esattamente il genere di cosa in cui un modello sbaglia in
             *    silenzio.
             *
             * ⇒ Si dice tutto: data locale, ora, **giorno della settimana** e
             * **fuso**. Costa una riga e toglie una deduzione.
             *
             * ⛔ `sources.now()` resta la fonte — è iniettabile e i test la
             * fissano. Qui si cambia solo COME si racconta.
             */
            const adesso = new Date(sources.now())
            const fuso = Intl.DateTimeFormat().resolvedOptions().timeZone
            const locale = adesso.toLocaleString('en-GB', {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
            })
            return { ok: true, content: `${locale} (${fuso}). ISO: ${sources.now()}` }
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
