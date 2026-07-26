import { createTalosReadTools, type TalosToolSources } from '@/lib/tools/readTools'
import { createTalosWebTools, type TalosWebToolSources } from '@/lib/search/webTools'
import type { TalosToolAuditRow } from '@/lib/tools/executor'
import type { TalosToolConsentRequest } from '@/lib/tools/executor'
import { decideTalosToolPermission, type TalosToolPermissions } from '@/lib/tools/permissionTypes'
import type { TalosToolDefinition } from '@/lib/tools/registry'
import type { LibraryDoc } from '@/lib/chat/libraryContext'
import type { TalosChatRepository } from '@/repositories/chatRepository'
import { parseVaultOrigin } from '@/lib/vaultLibrary'
import { newTalosMobileId } from '@/lib/mobileIds'

/**
 * Everything the tool suite needs, assembled from what the app already owns.
 *
 * It lives in its own module so the chat controller does not grow another
 * responsibility (debt A2 is a god-object that this project is trying to shrink,
 * not feed), and so the audit row — which is the record a run can be explained
 * from afterwards — is written in exactly one place.
 */
export interface TalosToolsetDeps {
    repository: TalosChatRepository
    readVaultFileText(fileId: string): Promise<string | null>
    /** Asks the human. Absent means: nothing can be confirmed, so writes fail closed. */
    requestConsent?(request: TalosToolConsentRequest): Promise<boolean | 'busy'>
    /** Session id → title, so a search result can say which chat it came from. */
    sessionTitles?(): Promise<Map<string, string>>
    /**
     * The user's "let chats use your Library" switch. When it is off the
     * ambient injection reads nothing, so the Library tools must not exist
     * either — otherwise the tools are a way around the opt-out.
     */
    libraryEnabled?(): boolean
    /**
     * F1 — the web tools, present only when a search source is configured.
     *
     * D3: with nothing chosen the model does not receive the schemas at all, so
     * it cannot promise a search it will not perform. Absent here means absent
     * to the model — the same shape as the Library opt-out above.
     */
    web?(): TalosWebToolSources | null
    now?(): string
}

export interface TalosToolset {
    /** Every tool that exists. Never advertise this list — see `offer`. */
    tools: TalosToolDefinition<never>[]
    /**
     * What may be offered to the model RIGHT NOW. Evaluated per send, not at
     * construction: the toolset is built once and memoised, so a permission
     * or Library switch flipped in Settings must take effect on the next
     * message rather than on the next launch.
     *
     * The same list is used to look a call up before running it, so a tool the
     * user has withdrawn cannot be reached by replaying an older call either.
     */
    offer(permissions: Partial<TalosToolPermissions> | undefined): TalosToolDefinition<never>[]
    requestConsent(request: TalosToolConsentRequest): Promise<boolean | 'busy'>
    audit(row: TalosToolAuditRow, sessionId: string | null): Promise<void>
}

export async function createTalosToolset(deps: TalosToolsetDeps): Promise<TalosToolset> {
    const now = deps.now ?? (() => new Date().toISOString())

    /**
     * The same filters the context injection uses: only available, uploaded
     * documents the user has not excluded. A tool must never reach a file the
     * ambient injection would refuse — that would be a way around the user's
     * own per-document opt-out.
     */
    async function librarySummaries() {
        return (await deps.repository.listVaultFileSummaries())
            .filter((file) => file.status === 'available')
            .filter((file) => parseVaultOrigin(file.metadata) === 'uploaded')
            .filter((file) => (file.metadata as { library_shared?: boolean }).library_shared !== false)
    }

    async function libraryDocs(): Promise<LibraryDoc[]> {
        const summaries = await librarySummaries()
        const titles = deps.sessionTitles ? await deps.sessionTitles() : new Map<string, string>()
        // Rank on the PREVIEW: hydrating every document to answer one search
        // would read the whole Library off disk on every call.
        return summaries.map((file) => {
            const originSessionId = (file.metadata as { origin_session_id?: string | null }).origin_session_id ?? null
            return {
                id: file.id,
                displayName: file.display_name,
                origin: parseVaultOrigin(file.metadata),
                originSessionId,
                originSessionTitle: originSessionId ? (titles.get(originSessionId) ?? null) : null,
                createdAt: file.created_at,
                text: file.text_preview ?? '',
            } satisfies LibraryDoc
        })
    }

    const sources: TalosToolSources = {
        listLibraryDocs: libraryDocs,
        async readLibraryDoc(id) {
            const summaries = await librarySummaries()
            const summary = summaries.find((entry) => entry.id === id)
            if (!summary) return null
            const text = await deps.readVaultFileText(id)
            return text === null ? null : { name: summary.display_name, text }
        },
        async listNotes() {
            return (await deps.repository.listNotes()).map((note) => ({
                title: note.title,
                content: note.content,
                updated_at: note.updated_at,
            }))
        },
        async listTasks() {
            return (await deps.repository.listTasks()).map((task) => ({
                title: task.title,
                status: task.status,
                priority: task.priority,
            }))
        },
        async searchMemories(query) {
            const terms = query.toLowerCase().split(/\s+/).filter(Boolean)
            const memories = await deps.repository.listMemories()
            return memories
                .filter((memory) => memory.status === 'active')
                .map((memory) => {
                    const haystack = `${memory.title} ${memory.content}`.toLowerCase()
                    const score = terms.reduce((total, term) => total + (haystack.includes(term) ? 1 : 0), 0)
                    return { memory, score }
                })
                .filter((entry) => entry.score > 0)
                .sort((left, right) => right.score - left.score)
                .map((entry) => ({ title: entry.memory.title, content: entry.memory.content }))
        },
        now,
    }

    const all = createTalosReadTools(sources)
    return {
        tools: all,
        offer(permissions) {
            const libraryAllowed = deps.libraryEnabled ? deps.libraryEnabled() : true
            // Evaluated per send, like the permissions: the toolset is memoised,
            // so a search source configured a minute ago must govern THIS
            // message rather than the next launch.
            const web = deps.web?.() ?? null
            return [...all, ...(web ? createTalosWebTools(web) : [])]
                .filter((tool) => libraryAllowed || !tool.name.startsWith('library_'))
                // SF-MAJOR: the gate refused at EXECUTION but the schemas were
                // advertised anyway, so "never" meant the model called a tool,
                // was refused, and tried again — up to five billed round trips
                // for one message that could never succeed. A tool the policy
                // always denies is not offered at all.
                .filter((tool) => decideTalosToolPermission(tool.action, permissions) !== 'deny')
        },
        // Fail CLOSED: with no consent surface wired, an "ask" permission is a
        // refusal, never an implicit yes.
        requestConsent: deps.requestConsent ?? (async () => false),
        async audit(row, sessionId) {
            if (!sessionId) return
            await deps.repository.appendToolActivity({
                id: newTalosMobileId(),
                session_id: sessionId,
                message_id: null,
                operation: `tool.${row.tool}`,
                status: row.status === 'succeeded' ? 'succeeded' : 'failed',
                payload: { action: row.action, input: row.input, outcome: row.status },
                evidence: {
                    contract: 'talos.mobile.tool.activity.v1',
                    ...(row.evidence ?? {}),
                    ...(row.error ? { error: row.error } : {}),
                },
                created_at: now(),
            })
        },
    }
}
