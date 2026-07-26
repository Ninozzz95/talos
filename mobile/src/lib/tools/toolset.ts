import { createTalosReadTools, type TalosToolSources } from '@/lib/tools/readTools'
import type { TalosToolAuditRow } from '@/lib/tools/executor'
import type { TalosToolConsentRequest } from '@/lib/tools/executor'
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
    requestConsent?(request: TalosToolConsentRequest): Promise<boolean>
    /** Session id → title, so a search result can say which chat it came from. */
    sessionTitles?(): Promise<Map<string, string>>
    now?(): string
}

export interface TalosToolset {
    tools: TalosToolDefinition<never>[]
    requestConsent(request: TalosToolConsentRequest): Promise<boolean>
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

    return {
        tools: createTalosReadTools(sources),
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
