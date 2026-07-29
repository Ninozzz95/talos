import {
    createTalosReadTools,
    type TalosLibraryListEntry,
    type TalosToolSources,
} from '@/lib/tools/readTools'
import { createTalosWebTools, type TalosWebToolSources } from '@/lib/search/webTools'
import { createTalosDocumentTools, type TalosDocumentToolSources } from '@/lib/documents/documentTools'
import { createTalosImageTools, type TalosImageToolSources } from '@/lib/images/imageTools'
import {
    createTalosLibraryExportTools,
    type TalosLibraryExportCandidate,
} from '@/lib/tools/libraryExportTools'
import {
    createTalosLibraryContextPolicyTools,
    type TalosLibraryContextPolicyToolSources,
} from '@/lib/tools/libraryContextPolicyTools'
import type { TalosToolAuditRow } from '@/lib/tools/executor'
import type { TalosToolConsentRequest } from '@/lib/tools/executor'
import { decideTalosToolPermission, type TalosToolPermissions } from '@/lib/tools/permissionTypes'
import {
    isTalosAgentToolEnabled,
    type TalosAgentToolEnabled,
} from '@/lib/tools/toolControls'
import { talosToolRequiredActions, type TalosToolDefinition } from '@/lib/tools/registry'
import type { LibraryDoc } from '@/lib/chat/libraryContext'
import type { TalosChatRepository } from '@/repositories/chatRepository'
import {
    isTalosLibraryFileShared,
    parseVaultOrigin,
    talosLibraryFileType,
} from '@/lib/vaultLibrary'
import { newTalosMobileId } from '@/lib/mobileIds'
import type {
    TalosDeviceFileSaveInput,
    TalosDeviceFileSaveResult,
} from '@/services/saveVaultFileToDevice'

/**
 * Everything the tool suite needs, assembled from what the app already owns.
 *
 * It lives in its own module so the chat controller does not grow another
 * responsibility (debt A2 is a god-object that this project is trying to shrink,
 * not feed), and so the audit row — which is the record a run can be explained
 * from afterwards — is written in exactly one place.
 */
/** Bytes to base64, in chunks: one huge spread argument blows the stack. */
function base64FromBytes(bytes: Uint8Array): string {
    let binary = ''
    const CHUNK = 0x8000
    for (let index = 0; index < bytes.length; index += CHUNK) {
        binary += String.fromCharCode(...bytes.subarray(index, index + CHUNK))
    }
    return btoa(binary)
}

export interface TalosToolsetDeps {
    repository: TalosChatRepository
    readVaultFileText(fileId: string): Promise<string | null>
    /**
     * The bytes of a Library file, for the ones there is nothing to read in.
     *
     * Owner 2026-07-27: TALOS could find an image in the Library and not look
     * at it — "per questa immagine non c'è nessun estratto testuale" — while
     * knowing perfectly well how to see one attached to a message. Absent means
     * this build cannot fetch bytes, and the tool says so instead of pretending
     * the file is empty.
     */
    readVaultFileBytes?(fileId: string): Promise<{ bytes: Uint8Array; mediaType: string } | null>
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
    /**
     * F2 — making documents. A `write`, so the permission gate governs it and
     * D12's "ask once per conversation" applies.
     */
    documents?(): TalosDocumentToolSources | null
    /**
     * Drawing. A `write` like documents: it spends the user's money and puts a
     * file on the device, so the permission gate governs it. Absent when no
     * configured provider can draw, in which case the tool is never offered
     * rather than offered and failing.
     */
    images?(): TalosImageToolSources | null
    /**
     * Durable user-visible Save-As. Absent means the current platform has no
     * honest export boundary, so `library_export` is not advertised.
     */
    saveVaultFileToDevice?(
        input: TalosDeviceFileSaveInput,
    ): Promise<TalosDeviceFileSaveResult>
    /** Dedicated policy mutation stays reachable while Library reads are off. */
    libraryContextPolicy?: TalosLibraryContextPolicyToolSources
    now?(): string
}

export interface TalosToolset {
    /** Every tool that exists. Never advertise this list — see `offer`. */
    tools: TalosToolDefinition<never>[]
    /** Live Agent Tools plus global Library policy, shared by offer and execution. */
    isEnabled(
        name: string,
        enabledTools: Readonly<TalosAgentToolEnabled>,
    ): boolean
    /**
     * What may be offered to the model RIGHT NOW. Evaluated per send, not at
     * construction: the toolset is built once and memoised, so a permission
     * or Library switch flipped in Settings must take effect on the next
     * message rather than on the next launch.
     *
     * The same list is used to look a call up before running it, so a tool the
     * user has withdrawn cannot be reached by replaying an older call either.
     */
    offer(
        permissions: Partial<TalosToolPermissions> | undefined,
        enabledTools: Readonly<TalosAgentToolEnabled>,
    ): TalosToolDefinition<never>[]
    requestConsent(request: TalosToolConsentRequest): Promise<boolean | 'busy'>
    audit(row: TalosToolAuditRow, sessionId: string | null): Promise<void>
}

export async function createTalosToolset(deps: TalosToolsetDeps): Promise<TalosToolset> {
    const now = deps.now ?? (() => new Date().toISOString())
    const libraryAllowed = (): boolean => {
        if (!deps.libraryEnabled) return true
        try {
            return deps.libraryEnabled()
        } catch {
            // A missing/broken settings source cannot broaden Vault access.
            return false
        }
    }
    const requireLibraryEnabled = (): void => {
        if (!libraryAllowed()) throw new Error('TALOS_LIBRARY_DISABLED')
    }
    const isEnabled = (
        name: string,
        enabledTools: Readonly<TalosAgentToolEnabled>,
    ): boolean => isTalosAgentToolEnabled(name, enabledTools)
        && (
            name === 'library_context_policy_update'
            || !name.startsWith('library_')
            || libraryAllowed()
        )

    /**
     * Explicit Library tools search what the Library surface promises:
     * available uploaded AND generated files the user still shares with chat.
     *
     * This deliberately differs from AMBIENT injection, which remains
     * uploaded-only so model-authored output is never fed back into every later
     * turn automatically. Explicit search is still bounded by the global
     * switch, this per-file opt-out, read-only permissions, and the executor's
     * untrusted-data wrapper.
     */
    async function librarySummaries() {
        requireLibraryEnabled()
        const summaries = await deps.repository.listVaultFileSummaries()
        requireLibraryEnabled()
        return summaries
            .filter((file) => file.status === 'available')
            .filter((file) => isTalosLibraryFileShared(file.metadata))
    }

    async function libraryEntries(): Promise<TalosLibraryListEntry[]> {
        const summaries = await librarySummaries()
        const titles = deps.sessionTitles ? await deps.sessionTitles() : new Map<string, string>()
        requireLibraryEnabled()
        return summaries.map((file) => {
            const originSessionId = (file.metadata as { origin_session_id?: string | null }).origin_session_id ?? null
            return {
                id: file.id,
                displayName: file.display_name,
                mediaType: file.media_type,
                fileType: talosLibraryFileType(file),
                origin: parseVaultOrigin(file.metadata),
                originSessionId,
                originSessionTitle: originSessionId ? (titles.get(originSessionId) ?? null) : null,
                createdAt: file.created_at,
                updatedAt: file.updated_at,
            } satisfies TalosLibraryListEntry
        })
    }

    async function libraryDocs(): Promise<LibraryDoc[]> {
        // Explicit content search is the one operation allowed to transfer the
        // complete extracted corpus. Browse and ambient context stay on
        // summaries; otherwise every ordinary send would pay this bridge cost.
        requireLibraryEnabled()
        const rows = await deps.repository.listVaultFiles()
        requireLibraryEnabled()
        const files = rows
            .filter((file) => file.status === 'available')
            .filter((file) => isTalosLibraryFileShared(file.metadata))
        const titles = deps.sessionTitles ? await deps.sessionTitles() : new Map<string, string>()
        requireLibraryEnabled()
        return files.map((file) => {
            const originSessionId = (file.metadata as { origin_session_id?: string | null }).origin_session_id ?? null
            return {
                id: file.id,
                displayName: file.display_name,
                origin: parseVaultOrigin(file.metadata),
                originSessionId,
                originSessionTitle: originSessionId ? (titles.get(originSessionId) ?? null) : null,
                createdAt: file.created_at,
                text: file.extracted_text ?? '',
            } satisfies LibraryDoc
        })
    }

    /** Metadata-only candidates, under the same per-file agent-read policy. */
    async function libraryExportCandidates(): Promise<TalosLibraryExportCandidate[]> {
        requireLibraryEnabled()
        const summaries = await deps.repository.listVaultFileSummaries()
        requireLibraryEnabled()
        return summaries
            .filter((file) => file.status === 'available')
            .filter((file) => isTalosLibraryFileShared(file.metadata))
            .map((file) => ({
                id: file.id,
                displayName: file.display_name,
                mediaType: file.media_type,
            }))
    }

    const sources: TalosToolSources = {
        listLibraryEntries: libraryEntries,
        listLibraryDocs: libraryDocs,
        async readLibraryDoc(id) {
            const summaries = await librarySummaries()
            const summary = summaries.find((entry) => entry.id === id)
            if (!summary) return null

            // An image has no extracted text, and returning null for it is what
            // made the Library able to FIND a photo and not look at it.
            if (summary.media_type.startsWith('image/') && deps.readVaultFileBytes) {
                const file = await deps.readVaultFileBytes(id)
                requireLibraryEnabled()
                if (file) {
                    return {
                        name: summary.display_name,
                        text: '',
                        image: { base64: base64FromBytes(file.bytes), mediaType: file.mediaType },
                    }
                }
            }

            const text = await deps.readVaultFileText(id)
            requireLibraryEnabled()
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
    const readExportBytes = deps.readVaultFileBytes
    const saveExport = deps.saveVaultFileToDevice
    const libraryExports = readExportBytes && saveExport
        ? createTalosLibraryExportTools({
            listCandidates: libraryExportCandidates,
            async exportById(fileId) {
                // TOCTOU boundary: the candidate can be deleted or withdrawn
                // while consent/picker UI is open. Re-list immediately before
                // touching decrypted bytes.
                const allowed = (await libraryExportCandidates())
                    .find((candidate) => candidate.id === fileId)
                if (!allowed) return null
                const file = await readExportBytes(fileId)
                requireLibraryEnabled()
                if (!file) throw new Error('TALOS_FILE_EXPORT_SOURCE_MISSING')
                return saveExport({
                    displayName: allowed.displayName,
                    mediaType: file.mediaType,
                    bytes: file.bytes,
                })
            },
        })
        : []
    const policyTools = deps.libraryContextPolicy
        ? createTalosLibraryContextPolicyTools(deps.libraryContextPolicy, { now })
        : []
    return {
        tools: [...all, ...libraryExports, ...policyTools],
        isEnabled,
        offer(permissions, enabledTools) {
            // Evaluated per send, like the permissions: the toolset is memoised,
            // so a search source configured a minute ago must govern THIS
            // message rather than the next launch.
            const web = deps.web?.() ?? null
            const documents = deps.documents?.() ?? null
            const images = deps.images?.() ?? null
            return [
                ...all,
                ...libraryExports,
                ...policyTools,
                ...(web ? createTalosWebTools(web) : []),
                ...(documents ? createTalosDocumentTools(documents) : []),
                ...(images ? createTalosImageTools(images) : []),
            ]
                .filter((tool) => isEnabled(tool.name, enabledTools))
                // SF-MAJOR: the gate refused at EXECUTION but the schemas were
                // advertised anyway, so "never" meant the model called a tool,
                // was refused, and tried again — up to five billed round trips
                // for one message that could never succeed. A tool the policy
                // always denies is not offered at all.
                .filter((tool) => talosToolRequiredActions(tool)
                    .every((action) => decideTalosToolPermission(action, permissions) !== 'deny'))
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
                payload: {
                    action: row.action,
                    required_actions: [...row.requiredActions],
                    input: row.input,
                    outcome: row.status,
                },
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
