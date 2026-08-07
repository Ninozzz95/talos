import { TALOS_CONTENT_ORIGIN_FALLBACK } from '@/lib/tools/security'
import {
    cloneJsonObject,
    normalizeChatTitle,
    normalizeChatSurface,
    normalizeComposerDraft,
    normalizeComposerDraftScope,
    normalizeFileAuthorityPermissions,
    normalizeRepositoryId,
    normalizeStationTitle,
    normalizeToolOperation,
    normalizeVaultDisplayName,
    normalizeVaultMediaType,
    normalizeVaultSha256,
    normalizeVaultSize,
    type AppendChatMessageInput,
    type ChatRepositoryOptions,
    type CreateChatSessionInput,
    type CreateFileAuthorityGrantInput,
    type CreateMemoryInput,
    type CreateNoteInput,
    type UpdateNoteInput,
    type CreateTaskInput,
    type CreateVaultFileInput,
    type CreateToolActivityInput,
    type TalosChatAttachmentBinding,
    type TalosChatRepository,
    type TalosLocalChatMessage,
    type TalosLocalChatSession,
    type TalosLocalToolActivity,
    type TalosLocalFileAuthorityGrant,
    type TalosLocalMemory,
    type TalosResearchJournalEntry,
    type TalosResearchRunRow,
    type TalosLocalNote,
    type TalosLocalTask,
    type TalosMemoryStatus,
    type TalosTaskStatus,
    type UpdateMemoryPatch,
    type UpdateTaskPatch,
    type TalosLocalVaultFile,
    type UpdateChatSessionInput,
    type UpdateVaultFileInput,
    type UpdateToolActivityInput,
} from '@/repositories/chatRepository'

function copySession(session: TalosLocalChatSession): TalosLocalChatSession {
    return { ...session, metadata: cloneJsonObject(session.metadata) }
}

function copyMessage(message: TalosLocalChatMessage): TalosLocalChatMessage {
    return { ...message, metadata: cloneJsonObject(message.metadata) }
}

function copyVaultFile(file: TalosLocalVaultFile): TalosLocalVaultFile {
    return { ...file, metadata: cloneJsonObject(file.metadata) }
}

function copyGrant(grant: TalosLocalFileAuthorityGrant): TalosLocalFileAuthorityGrant {
    return { ...grant, permissions: [...grant.permissions] }
}

function copyBinding(binding: TalosChatAttachmentBinding): TalosChatAttachmentBinding {
    return { ...binding, permissions: [...binding.permissions] }
}

function copyToolActivity(activity: TalosLocalToolActivity): TalosLocalToolActivity {
    return {
        ...activity,
        payload: cloneJsonObject(activity.payload),
        evidence: cloneJsonObject(activity.evidence),
    }
}

function byMostRecent(left: TalosLocalChatSession, right: TalosLocalChatSession): number {
    return right.updated_at.localeCompare(left.updated_at)
        || right.created_at.localeCompare(left.created_at)
        || right.id.localeCompare(left.id)
}

function byMostRecentVaultFile(left: TalosLocalVaultFile, right: TalosLocalVaultFile): number {
    return right.updated_at.localeCompare(left.updated_at)
        || right.created_at.localeCompare(left.created_at)
        || right.id.localeCompare(left.id)
}

export function createMemoryChatRepository(options: ChatRepositoryOptions = {}): TalosChatRepository {
    const sessions = new Map<string, TalosLocalChatSession>()
    const messages = new Map<string, TalosLocalChatMessage[]>()
    const composerDrafts = new Map<string, string>()
    const vaultFiles = new Map<string, TalosLocalVaultFile>()
    const grants = new Map<string, TalosLocalFileAuthorityGrant>()
    const attachmentBindings = new Map<string, TalosChatAttachmentBinding[]>()
    const toolActivities = new Map<string, TalosLocalToolActivity>()
    const memories = new Map<string, TalosLocalMemory>()
    const tasks = new Map<string, TalosLocalTask>()
    const researchJournals = new Map<string, TalosResearchJournalEntry[]>()
    const researchRuns = new Map<string, TalosResearchRunRow>()
    const notes = new Map<string, TalosLocalNote>()
    let activeSessionId: string | null = null
    const now = options.now ?? (() => new Date().toISOString())

    function requireSession(id: string): TalosLocalChatSession {
        const session = sessions.get(id)
        if (!session) throw new Error('TALOS_CHAT_SESSION_NOT_FOUND')
        return session
    }

    function requireVaultFile(id: string): TalosLocalVaultFile {
        const file = vaultFiles.get(id)
        if (!file || file.status === 'revoked') throw new Error('TALOS_VAULT_FILE_NOT_FOUND')
        return file
    }

    function validatedBinding(
        input: NonNullable<AppendChatMessageInput['attachments']>[number],
        message: TalosLocalChatMessage,
    ): TalosChatAttachmentBinding {
        const file = requireVaultFile(input.vault_file_id)
        if (file.status !== 'available') throw new Error('TALOS_VAULT_FILE_UNAVAILABLE')
        const grant = grants.get(input.grant_id)
        if (!grant) throw new Error('TALOS_FILE_GRANT_NOT_FOUND')
        if (grant.vault_file_id !== file.id) throw new Error('TALOS_FILE_GRANT_MISMATCH')
        if (grant.status !== 'active') throw new Error('TALOS_FILE_GRANT_INACTIVE')
        if (!grant.permissions.includes('model.read')) throw new Error('TALOS_FILE_GRANT_PERMISSION_INVALID')
        return {
            id: normalizeRepositoryId(input.id),
            session_id: message.session_id,
            message_id: message.id,
            vault_file_id: file.id,
            grant_id: grant.id,
            display_name: file.display_name,
            media_type: file.media_type,
            size_bytes: file.size_bytes,
            permissions: [...grant.permissions],
            grant_status: grant.status,
            created_at: message.created_at,
        }
    }

    return {
        async initialize() {},
        async listSessions() {
            return [...sessions.values()].sort(byMostRecent).map((session) => ({
                ...copySession(session),
                has_messages: (messages.get(session.id) ?? []).length > 0,
            }))
        },
        async getActiveSessionId() {
            return activeSessionId
        },
        async createSession(input: CreateChatSessionInput) {
            if (sessions.has(input.id)) throw new Error('TALOS_CHAT_SESSION_EXISTS')
            const session: TalosLocalChatSession = {
                id: input.id,
                title: normalizeChatTitle(input.title),
                surface: normalizeChatSurface(input.surface ?? 'chat'),
                mode: input.mode ?? 'verified_execution',
                persistence_mode: input.persistence_mode ?? 'persistent',
                active_model_profile_id: input.active_model_profile_id,
                metadata: cloneJsonObject(input.metadata),
                created_at: input.created_at,
                updated_at: input.created_at,
            }
            sessions.set(session.id, session)
            messages.set(session.id, [])
            activeSessionId = session.id
            return copySession(session)
        },
        async selectSession(sessionId: string) {
            requireSession(sessionId)
            activeSessionId = sessionId
        },
        async renameSession(sessionId: string, title: string) {
            const session = requireSession(sessionId)
            session.title = normalizeChatTitle(title)
            session.updated_at = now()
            return copySession(session)
        },
        async updateSession(sessionId: string, input: UpdateChatSessionInput) {
            const session = requireSession(sessionId)
            if (input.title !== undefined) session.title = normalizeChatTitle(input.title)
            if (input.surface !== undefined) session.surface = normalizeChatSurface(input.surface)
            if (input.active_model_profile_id !== undefined) {
                session.active_model_profile_id = input.active_model_profile_id
            }
            if (input.metadata !== undefined) session.metadata = cloneJsonObject(input.metadata)
            session.updated_at = now()
            return copySession(session)
        },
        async deleteSession(sessionId: string) {
            // SF-10: session-scoped memories die with their session.
            for (const [memoryId, memory] of [...memories]) {
                if (memory.scope_type === 'session' && memory.scope_id === sessionId) memories.delete(memoryId)
            }
            requireSession(sessionId)
            sessions.delete(sessionId)
            const removedMessages = messages.get(sessionId) ?? []
            messages.delete(sessionId)
            for (const message of removedMessages) attachmentBindings.delete(message.id)
            for (const [activityId, activity] of toolActivities) {
                if (activity.session_id === sessionId) toolActivities.delete(activityId)
            }
            composerDrafts.delete(sessionId)
            if (activeSessionId === sessionId) {
                activeSessionId = [...sessions.values()].sort(byMostRecent)[0]?.id ?? null
            }
            return activeSessionId
        },
        async listMessages(sessionId: string, options?: { limit?: number; before?: { ordinal: number; id: string } }) {
            const all = (messages.get(sessionId) ?? [])
                .slice()
                .sort((left, right) => left.ordinal - right.ordinal
                    || left.created_at.localeCompare(right.created_at)
                    || left.id.localeCompare(right.id))
                .map(copyMessage)
            if (options?.limit === undefined) return all
            const cursor = options.before
            const older = cursor
                ? all.filter((message) => message.ordinal < cursor.ordinal
                    || (message.ordinal === cursor.ordinal && message.id < cursor.id))
                : all
            // Same contract as SQLite: the NEWEST `limit` of what remains.
            return older.slice(Math.max(0, older.length - options.limit))
        },
        async appendMessage(input: AppendChatMessageInput) {
            const session = requireSession(input.session_id)
            const sessionMessages = messages.get(input.session_id) ?? []
            if (sessionMessages.some((message) => message.id === input.id)) {
                throw new Error('TALOS_CHAT_MESSAGE_EXISTS')
            }
            const message: TalosLocalChatMessage = {
                id: input.id,
                session_id: input.session_id,
                role: input.role,
                content: input.content,
                state: input.state,
                model_profile_id: input.model_profile_id ?? null,
                run_id: input.run_id ?? null,
                ordinal: sessionMessages.length,
                metadata: cloneJsonObject(input.metadata),
                created_at: input.created_at,
                updated_at: input.created_at,
            }
            const bindingIds = new Set<string>()
            const fileIds = new Set<string>()
            const bindings = [...(input.attachments ?? [])].map((binding) => {
                if (bindingIds.has(binding.id) || fileIds.has(binding.vault_file_id)) {
                    throw new Error('TALOS_CHAT_ATTACHMENT_DUPLICATE')
                }
                bindingIds.add(binding.id)
                fileIds.add(binding.vault_file_id)
                return validatedBinding(binding, message)
            })
            sessionMessages.push(message)
            messages.set(input.session_id, sessionMessages)
            if (bindings.length > 0) attachmentBindings.set(message.id, bindings)
            session.updated_at = input.created_at
            return copyMessage(message)
        },
        async appendToolActivity(input: CreateToolActivityInput) {
            const id = normalizeRepositoryId(input.id)
            if (toolActivities.has(id)) throw new Error('TALOS_TOOL_ACTIVITY_EXISTS')
            requireSession(input.session_id)
            if (input.message_id !== null) {
                const owner = (messages.get(input.session_id) ?? []).find((message) => message.id === input.message_id)
                if (!owner) throw new Error('TALOS_CHAT_MESSAGE_NOT_FOUND')
            }
            const activity: TalosLocalToolActivity = {
                id,
                session_id: normalizeRepositoryId(input.session_id),
                message_id: input.message_id === null ? null : normalizeRepositoryId(input.message_id),
                operation: normalizeToolOperation(input.operation),
                status: input.status,
                payload: cloneJsonObject(input.payload),
                evidence: cloneJsonObject(input.evidence),
                created_at: input.created_at,
                updated_at: input.created_at,
            }
            toolActivities.set(id, activity)
            return copyToolActivity(activity)
        },
        async updateToolActivity(activityId: string, input: UpdateToolActivityInput) {
            const activity = toolActivities.get(normalizeRepositoryId(activityId))
            if (!activity) throw new Error('TALOS_TOOL_ACTIVITY_NOT_FOUND')
            if (input.status !== undefined) activity.status = input.status
            if (input.payload !== undefined) activity.payload = cloneJsonObject(input.payload)
            if (input.evidence !== undefined) activity.evidence = cloneJsonObject(input.evidence)
            activity.updated_at = now()
        },
        async listMessageToolActivities(messageId: string) {
            return [...toolActivities.values()]
                .filter((activity) => activity.message_id === messageId)
                .sort((left, right) => left.created_at.localeCompare(right.created_at) || left.id.localeCompare(right.id))
                .map(copyToolActivity)
        },
        async listSessionToolActivities(sessionId: string) {
            return [...toolActivities.values()]
                .filter((activity) => activity.session_id === sessionId)
                .sort((left, right) => left.created_at.localeCompare(right.created_at) || left.id.localeCompare(right.id))
                .map(copyToolActivity)
        },
        async listVaultFiles() {
            return [...vaultFiles.values()]
                .filter((file) => file.status !== 'revoked')
                .sort(byMostRecentVaultFile)
                .map(copyVaultFile)
        },
        async listVaultFileSummaries() {
            return [...vaultFiles.values()]
                .filter((file) => file.status !== 'revoked')
                .sort(byMostRecentVaultFile)
                .map((file) => {
                    const { extracted_text: text, ...rest } = copyVaultFile(file)
                    return { ...rest, text_preview: text === null ? null : text.slice(0, 600) }
                })
        },
        /** I-03: the same contract as SQL, over the whole text rather than a preview. */
        async matchVaultFileTerms(terms: readonly string[]) {
            const cleaned = [...new Set(
                terms.map((term) => term.trim().toLowerCase()).filter((term) => term.length > 0),
            )].slice(0, 12)
            if (cleaned.length === 0) return {}
            const matched: Record<string, number> = {}
            for (const file of vaultFiles.values()) {
                if (file.status === 'revoked') continue
                const text = (file.extracted_text ?? '').toLowerCase()
                if (text === '') continue
                const hits = cleaned.filter((term) => text.includes(term)).length
                if (hits > 0) matched[file.id] = hits
            }
            return matched
        },
        async getVaultFile(fileId: string) {
            const file = vaultFiles.get(fileId)
            return !file || file.status === 'revoked' ? null : copyVaultFile(file)
        },
        async createVaultFile(input: CreateVaultFileInput) {
            const id = normalizeRepositoryId(input.id)
            if (vaultFiles.has(id)) throw new Error('TALOS_VAULT_FILE_EXISTS')
            const file: TalosLocalVaultFile = {
                id,
                display_name: normalizeVaultDisplayName(input.display_name),
                media_type: normalizeVaultMediaType(input.media_type),
                size_bytes: normalizeVaultSize(input.size_bytes),
                private_uri: input.private_uri,
                status: input.status,
                trust: input.trust,
                sha256: normalizeVaultSha256(input.sha256),
                extracted_text: input.extracted_text,
                failure_code: input.failure_code,
                metadata: cloneJsonObject(input.metadata),
                created_at: input.created_at,
                updated_at: input.created_at,
            }
            vaultFiles.set(id, file)
            return copyVaultFile(file)
        },
        async updateVaultFile(fileId: string, input: UpdateVaultFileInput) {
            const file = requireVaultFile(fileId)
            if (input.display_name !== undefined) file.display_name = input.display_name
            if (input.status !== undefined) file.status = input.status
            if (input.private_uri !== undefined) file.private_uri = input.private_uri
            if (input.sha256 !== undefined) file.sha256 = normalizeVaultSha256(input.sha256)
            if (input.extracted_text !== undefined) file.extracted_text = input.extracted_text
            if (input.failure_code !== undefined) file.failure_code = input.failure_code
            if (input.metadata !== undefined) file.metadata = cloneJsonObject(input.metadata)
            file.updated_at = now()
            return copyVaultFile(file)
        },
        async deleteVaultFile(fileId: string) {
            const file = requireVaultFile(fileId)
            file.status = 'revoked'
            file.private_uri = ''
            file.extracted_text = null
            file.updated_at = now()
            for (const grant of grants.values()) {
                if (grant.vault_file_id === fileId && grant.status === 'active') {
                    grant.status = 'revoked'
                    grant.revoked_at = file.updated_at
                    grant.updated_at = file.updated_at
                }
            }
        },
        async createFileAuthorityGrant(input: CreateFileAuthorityGrantInput) {
            const id = normalizeRepositoryId(input.id)
            if (grants.has(id)) throw new Error('TALOS_FILE_GRANT_EXISTS')
            const file = requireVaultFile(input.vault_file_id)
            if (file.status !== 'available') throw new Error('TALOS_VAULT_FILE_UNAVAILABLE')
            const grant: TalosLocalFileAuthorityGrant = {
                id,
                vault_file_id: file.id,
                permissions: normalizeFileAuthorityPermissions(input.permissions),
                status: 'active',
                label: normalizeVaultDisplayName(input.label),
                created_at: input.created_at,
                updated_at: input.created_at,
                revoked_at: null,
            }
            grants.set(id, grant)
            return copyGrant(grant)
        },
        async revokeFileAuthorityGrant(grantId: string) {
            const grant = grants.get(grantId)
            if (!grant) throw new Error('TALOS_FILE_GRANT_NOT_FOUND')
            if (grant.status === 'revoked') return
            grant.status = 'revoked'
            grant.updated_at = now()
            grant.revoked_at = grant.updated_at
        },
        async listSessionAttachmentFileIds(sessionId: string): Promise<string[]> {
            const ids = new Set<string>()
            for (const bindings of attachmentBindings.values()) {
                for (const binding of bindings) {
                    if (binding.session_id === sessionId) ids.add(binding.vault_file_id)
                }
            }
            return [...ids]
        },
        async listSessionAttachmentMessageIds(sessionId: string): Promise<string[]> {
            const ids: string[] = []
            for (const [messageId, bindings] of attachmentBindings) {
                if (bindings.some((binding) => binding.session_id === sessionId)) ids.push(messageId)
            }
            return ids
        },
        async listMessageAttachments(messageId: string) {
            return (attachmentBindings.get(messageId) ?? []).map((binding) => {
                const grant = grants.get(binding.grant_id)
                return copyBinding({
                    ...binding,
                    permissions: grant?.permissions ?? binding.permissions,
                    grant_status: grant?.status ?? 'revoked',
                })
            })
        },
        async loadComposerDraft(scopeId: string) {
            return composerDrafts.get(normalizeComposerDraftScope(scopeId)) ?? ''
        },
        async saveComposerDraft(scopeId: string, draft: string) {
            const scope = normalizeComposerDraftScope(scopeId)
            const value = normalizeComposerDraft(draft)
            if (value === '') composerDrafts.delete(scope)
            else composerDrafts.set(scope, value)
        },
        async updateSessionMetadata(sessionId: string, metadata: Record<string, unknown>) {
            const session = sessions.get(sessionId)
            if (!session) throw new Error('TALOS_CHAT_SESSION_NOT_FOUND')
            const updated = { ...session, metadata: cloneJsonObject(metadata) }
            sessions.set(sessionId, updated)
            return { ...updated }
        },
        async createTask(input: CreateTaskInput) {
            const task: TalosLocalTask = {
                id: normalizeRepositoryId(input.id),
                title: normalizeStationTitle(input.title),
                description: input.description,
                run_id: input.run_id,
                priority: input.priority,
                status: 'todo',
                content_origin: input.content_origin ?? TALOS_CONTENT_ORIGIN_FALLBACK,
                schedule_json: input.schedule_json ?? null,
                instruction: input.instruction ?? null,
                last_run_at: null,
                created_at: input.created_at,
                updated_at: input.created_at,
            }
            tasks.set(task.id, task)
            return { ...task }
        },
        async listTasks() {
            return [...tasks.values()]
                .sort((left, right) => right.updated_at.localeCompare(left.updated_at) || right.id.localeCompare(left.id))
                .map((task) => ({ ...task }))
        },
        async setTaskStatus(taskId: string, status: TalosTaskStatus) {
            const task = tasks.get(taskId)
            if (!task) throw new Error('TALOS_TASK_NOT_FOUND')
            const updated: TalosLocalTask = { ...task, status, updated_at: now() }
            tasks.set(taskId, updated)
            return { ...updated }
        },
        async updateTask(taskId: string, patch: UpdateTaskPatch) {
            const task = tasks.get(taskId)
            if (!task) throw new Error('TALOS_TASK_NOT_FOUND')
            const updated: TalosLocalTask = {
                ...task,
                ...(patch.title === undefined ? {} : { title: normalizeStationTitle(patch.title) }),
                ...(patch.description === undefined ? {} : { description: patch.description }),
                ...(patch.priority === undefined ? {} : { priority: patch.priority }),
                ...(patch.schedule_json === undefined ? {} : { schedule_json: patch.schedule_json }),
                ...(patch.instruction === undefined ? {} : { instruction: patch.instruction }),
                updated_at: now(),
            }
            tasks.set(taskId, updated)
            return { ...updated }
        },
        async deleteTask(taskId: string) {
            if (!tasks.delete(taskId)) throw new Error('TALOS_TASK_NOT_FOUND')
        },
        async createNote(input: CreateNoteInput) {
            const note: TalosLocalNote = {
                id: normalizeRepositoryId(input.id),
                title: normalizeStationTitle(input.title),
                content: input.content,
                trust_level: 'untrusted',
                content_origin: input.content_origin ?? TALOS_CONTENT_ORIGIN_FALLBACK,
                created_at: input.created_at,
                updated_at: input.created_at,
            }
            notes.set(note.id, note)
            return { ...note }
        },
        async appendResearchEvent(entry) {
            const journal = researchJournals.get(entry.run_id) ?? []
            // Refused, not thrown: a duplicate is what a process that died
            // between writing and hearing back produces on its next boot.
            if (journal.some((existing) => existing.seq === entry.seq)) return false
            journal.push({ ...entry })
            journal.sort((left, right) => left.seq - right.seq)
            researchJournals.set(entry.run_id, journal)
            return true
        },
        async readResearchJournal(runId) {
            return (researchJournals.get(runId) ?? []).map((entry) => ({ ...entry }))
        },
        async upsertResearchRun(row) {
            researchRuns.set(row.id, { ...row })
        },
        async deleteResearchRun(runId: string) {
            const journal = researchJournals.get(runId) ?? []
            const dossiers = new Set<string>()
            for (const entry of journal) {
                let parsed: { resultRef?: unknown }
                try { parsed = JSON.parse(entry.payload_json) as { resultRef?: unknown } } catch { continue }
                if (typeof parsed.resultRef === 'string' && parsed.resultRef.length > 0) {
                    dossiers.add(parsed.resultRef)
                }
            }
            const removed: string[] = []
            for (const fileId of dossiers) {
                const file = vaultFiles.get(fileId)
                if (!file || file.status === 'revoked') continue
                file.status = 'revoked'
                file.private_uri = ''
                file.extracted_text = null
                file.updated_at = now()
                for (const grant of grants.values()) {
                    if (grant.vault_file_id === fileId && grant.status === 'active') {
                        grant.status = 'revoked'
                        grant.updated_at = now()
                    }
                }
                removed.push(fileId)
            }
            researchJournals.delete(runId)
            researchRuns.delete(runId)
            return removed
        },
        async listResearchRuns() {
            return [...researchRuns.values()]
                .sort((left, right) => right.updated_at.localeCompare(left.updated_at) || right.id.localeCompare(left.id))
                .map((row) => ({ ...row }))
        },
        async listNotes() {
            return [...notes.values()]
                .sort((left, right) => right.updated_at.localeCompare(left.updated_at) || right.id.localeCompare(left.id))
                .map((note) => ({ ...note }))
        },
        async updateNote(input: UpdateNoteInput) {
            const current = notes.get(input.id)
            if (!current) throw new Error('TALOS_NOTE_NOT_FOUND')
            // Assente vuol dire «non toccarlo», non «svuotalo»: vedi la nota
            // sull'implementazione SQLite, che deve comportarsi allo stesso modo
            // o le prove passerebbero su un deposito e non sull'altro.
            const updated = {
                ...current,
                title: input.title ?? current.title,
                content: input.content ?? current.content,
                updated_at: now(),
            }
            notes.set(input.id, updated)
            return { ...updated }
        },
        async deleteNote(noteId: string) {
            if (!notes.delete(noteId)) throw new Error('TALOS_NOTE_NOT_FOUND')
        },
        async createMemory(input: CreateMemoryInput) {
            const memory: TalosLocalMemory = {
                id: normalizeRepositoryId(input.id),
                scope_type: input.scope_type,
                scope_id: input.scope_id,
                kind: input.kind,
                status: 'active',
                title: input.title,
                content: input.content,
                source: input.source,
                metadata: cloneJsonObject(input.metadata),
                trust_level: 'untrusted',
                content_origin: input.content_origin ?? TALOS_CONTENT_ORIGIN_FALLBACK,
                last_used_at: null,
                created_at: input.created_at,
                updated_at: input.created_at,
            }
            memories.set(memory.id, memory)
            return { ...memory }
        },
        async upsertMemory(input: CreateMemoryInput) {
            const id = normalizeRepositoryId(input.id)
            const existing = memories.get(id)
            const memory: TalosLocalMemory = {
                id,
                scope_type: input.scope_type,
                scope_id: input.scope_id,
                kind: input.kind,
                status: 'active',
                content_origin: input.content_origin ?? TALOS_CONTENT_ORIGIN_FALLBACK,
                title: input.title,
                content: input.content,
                source: input.source,
                metadata: cloneJsonObject(input.metadata),
                trust_level: 'untrusted',
                last_used_at: existing?.last_used_at ?? null,
                created_at: existing?.created_at ?? input.created_at,
                updated_at: input.created_at,
            }
            memories.set(memory.id, memory)
            return { ...memory, metadata: cloneJsonObject(memory.metadata) }
        },
        async listMemories() {
            return [...memories.values()]
                .sort((left, right) => right.updated_at.localeCompare(left.updated_at) || right.id.localeCompare(left.id))
                .map((memory) => ({ ...memory }))
        },
        async updateMemory(memoryId: string, patch: UpdateMemoryPatch) {
            const memory = memories.get(memoryId)
            if (!memory) throw new Error('TALOS_MEMORY_NOT_FOUND')
            if (patch.title === undefined && patch.content === undefined && patch.kind === undefined) {
                throw new Error('TALOS_MEMORY_UPDATE_EMPTY')
            }
            const updated: TalosLocalMemory = {
                ...memory,
                title: patch.title ?? memory.title,
                content: patch.content ?? memory.content,
                kind: patch.kind ?? memory.kind,
                updated_at: now(),
            }
            memories.set(memoryId, updated)
            return { ...updated }
        },
        async updateMemoryStatus(memoryId: string, status: TalosMemoryStatus) {
            const memory = memories.get(memoryId)
            if (!memory) throw new Error('TALOS_MEMORY_NOT_FOUND')
            const updated: TalosLocalMemory = { ...memory, status, updated_at: now() }
            memories.set(memoryId, updated)
            return { ...updated }
        },
        async touchMemories(memoryIds: string[], usedAt: string) {
            for (const memoryId of memoryIds) {
                const memory = memories.get(memoryId)
                if (memory) memories.set(memoryId, { ...memory, last_used_at: usedAt })
            }
        },
        async deleteMemory(memoryId: string) {
            if (!memories.delete(memoryId)) throw new Error('TALOS_MEMORY_NOT_FOUND')
        },
        async close() {},
    }
}
