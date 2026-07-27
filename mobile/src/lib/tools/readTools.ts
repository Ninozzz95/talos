import { z } from 'zod'
import { defineTalosTool, type TalosToolDefinition } from '@/lib/tools/registry'
import { rankLibraryDocs, type LibraryDoc } from '@/lib/chat/libraryContext'

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
export interface TalosToolSources {
    listLibraryDocs(): Promise<LibraryDoc[]>
    readLibraryDoc(id: string): Promise<{
        name: string
        text: string
        /** Present for a file there is nothing to READ in, only to look at. */
        image?: { base64: string; mediaType: string }
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

export function createTalosReadTools(sources: TalosToolSources): TalosToolDefinition<never>[] {
    const librarySearch = defineTalosTool({
        name: 'library_search',
        title: 'Search the Library',
        description: 'Search the user\'s local document Library and return the best matching documents with their id, name and a short excerpt. Use it before answering questions about the user\'s own files.',
        action: 'read',
        input: z.object({
            query: z.string().min(1).describe('What to look for, in natural language.'),
            limit: z.number().int().min(1).max(10).default(5).describe('How many documents to return.'),
        }),
        async run(input) {
            const docs = await sources.listLibraryDocs()
            const ranked = rankLibraryDocs(docs, input.query).slice(0, input.limit)
            if (ranked.length === 0) return { ok: true, content: 'No document in the Library matched that.' }
            const lines = ranked.map(({ doc }) => [
                `id: ${doc.id}`,
                `name: ${doc.displayName}`,
                `from chat: ${doc.originSessionTitle ?? 'unknown'}`,
                `excerpt: ${doc.text.slice(0, 300).replace(/\s+/g, ' ')}`,
            ].join('\n'))
            return {
                ok: true,
                content: clip(lines.join('\n\n')),
                evidence: { matched: ranked.map(({ doc }) => doc.id) },
            }
        },
    })

    const libraryRead = defineTalosTool({
        name: 'library_read',
        title: 'Read a Library document',
        description: 'Read one Library item by its id, as returned by library_search. Documents come back as text; an image comes back as an image for you to look at.',
        action: 'read',
        input: z.object({ id: z.string().min(1).describe('The document id from library_search.') }),
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

    return [librarySearch, libraryRead, notesList, tasksList, memorySearch, timeNow] as TalosToolDefinition<never>[]
}
