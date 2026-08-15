import type {
    AppendChatMessageInput,
    CreateChatSessionInput,
    CreateFileAuthorityGrantInput,
    CreateMemoryInput,
    CreateNoteInput,
    UpdateNoteInput,
    CreateTaskInput,
    CreateVaultFileInput,
    CreateToolActivityInput,
    TalosChatRepository,
    TalosMemoryStatus,
    TalosTaskStatus,
    UpdateMemoryPatch,
    UpdateTaskPatch,
    UpdateChatSessionInput,
    UpdateVaultFileInput,
    UpdateToolActivityInput,
} from '@/repositories/chatRepository'

export type ChatRepositoryLoader = () => Promise<TalosChatRepository>

export function createLazyChatRepository(loader: ChatRepositoryLoader): TalosChatRepository {
    let repository: TalosChatRepository | null = null
    let initialization: Promise<void> | null = null

    async function prepare(): Promise<void> {
        let candidate: TalosChatRepository | null = null
        try {
            candidate = await loader()
            await candidate.initialize()
            repository = candidate
        } catch (error) {
            if (candidate) {
                try {
                    await candidate.close()
                } catch {
                    // Preserve the initialization fault. A later explicit retry
                    // receives a fresh repository instance from the loader.
                }
            }
            throw error
        }
    }

    async function initialize(): Promise<void> {
        if (repository) return
        if (!initialization) {
            const pending = prepare().finally(() => {
                if (initialization === pending) initialization = null
            })
            initialization = pending
        }
        await initialization
    }

    async function ready(): Promise<TalosChatRepository> {
        await initialize()
        if (!repository) throw new Error('TALOS_CHAT_REPOSITORY_UNAVAILABLE')
        return repository
    }

    return {
        initialize,
        async listSessions() {
            return (await ready()).listSessions()
        },
        async getActiveSessionId() {
            return (await ready()).getActiveSessionId()
        },
        async createSession(input: CreateChatSessionInput) {
            return (await ready()).createSession(input)
        },
        async selectSession(sessionId: string) {
            return (await ready()).selectSession(sessionId)
        },
        async renameSession(sessionId: string, title: string) {
            return (await ready()).renameSession(sessionId, title)
        },
        async updateSession(sessionId: string, input: UpdateChatSessionInput) {
            return (await ready()).updateSession(sessionId, input)
        },
        async deleteSession(sessionId: string) {
            return (await ready()).deleteSession(sessionId)
        },
        async listMessages(sessionId: string, options?: Parameters<TalosChatRepository['listMessages']>[1]) {
            // SF-CRITICAL: this wrapper is what production actually uses, and it
            // dropped the paging options on the floor — TypeScript cannot catch
            // it, because a 1-arity function satisfies a 2-arity signature. The
            // effect was worse than "no paging": the cursor was dropped too, so
            // scrolling up prepended the WHOLE thread again, doubling it every
            // time and sending the model each message twice.
            return (await ready()).listMessages(sessionId, options)
        },
        async appendMessage(input: AppendChatMessageInput) {
            return (await ready()).appendMessage(input)
        },
        async appendToolActivity(input: CreateToolActivityInput) {
            return (await ready()).appendToolActivity(input)
        },
        async updateToolActivity(activityId: string, input: UpdateToolActivityInput) {
            return (await ready()).updateToolActivity(activityId, input)
        },
        async listMessageToolActivities(messageId: string) {
            return (await ready()).listMessageToolActivities(messageId)
        },
        async listSessionToolActivities(sessionId: string) {
            return (await ready()).listSessionToolActivities(sessionId)
        },
        async listVaultFiles() {
            return (await ready()).listVaultFiles()
        },
        async listVaultFileSummaries() {
            return (await ready()).listVaultFileSummaries()
        },
        async matchVaultFileTerms(terms: readonly string[]) {
            return (await ready()).matchVaultFileTerms(terms)
        },
        async getVaultFile(fileId: string) {
            return (await ready()).getVaultFile(fileId)
        },
        async createVaultFile(input: CreateVaultFileInput) {
            return (await ready()).createVaultFile(input)
        },
        async updateVaultFile(fileId: string, input: UpdateVaultFileInput) {
            return (await ready()).updateVaultFile(fileId, input)
        },
        async deleteVaultFile(fileId: string) {
            return (await ready()).deleteVaultFile(fileId)
        },
        async createFileAuthorityGrant(input: CreateFileAuthorityGrantInput) {
            return (await ready()).createFileAuthorityGrant(input)
        },
        async revokeFileAuthorityGrant(grantId: string) {
            return (await ready()).revokeFileAuthorityGrant(grantId)
        },
        async listSessionAttachmentMessageIds(sessionId: string) {
            return (await ready()).listSessionAttachmentMessageIds(sessionId)
        },
        async listSessionAttachmentFileIds(sessionId: string) {
            return (await ready()).listSessionAttachmentFileIds(sessionId)
        },
        async listMessageAttachments(messageId: string) {
            return (await ready()).listMessageAttachments(messageId)
        },
        async updateSessionMetadata(sessionId: string, metadata: Record<string, unknown>) {
            return (await ready()).updateSessionMetadata(sessionId, metadata)
        },
        async createTask(input: CreateTaskInput) {
            return (await ready()).createTask(input)
        },
        async listTasks() {
            return (await ready()).listTasks()
        },
        async setTaskStatus(taskId: string, status: TalosTaskStatus) {
            return (await ready()).setTaskStatus(taskId, status)
        },
        async updateTask(taskId: string, patch: UpdateTaskPatch) {
            return (await ready()).updateTask(taskId, patch)
        },
        async deleteTask(taskId: string) {
            return (await ready()).deleteTask(taskId)
        },
        async createNote(input: CreateNoteInput) {
            return (await ready()).createNote(input)
        },
        async listNotes() {
            return (await ready()).listNotes()
        },
        async appendResearchEvent(entry) {
            return (await ready()).appendResearchEvent(entry)
        },
        async readResearchJournal(runId) {
            return (await ready()).readResearchJournal(runId)
        },
        async upsertResearchRun(row) {
            return (await ready()).upsertResearchRun(row)
        },
        async listResearchRuns() {
            return (await ready()).listResearchRuns()
        },
        async deleteResearchRun(runId: string) {
            return (await ready()).deleteResearchRun(runId)
        },
        async updateNote(input: UpdateNoteInput) {
            return (await ready()).updateNote(input)
        },
        async deleteNote(noteId: string) {
            return (await ready()).deleteNote(noteId)
        },
        async createMemory(input: CreateMemoryInput) {
            return (await ready()).createMemory(input)
        },
        async upsertMemory(input: CreateMemoryInput) {
            return (await ready()).upsertMemory(input)
        },
        async listMemories() {
            return (await ready()).listMemories()
        },
        async updateMemory(memoryId: string, patch: UpdateMemoryPatch) {
            return (await ready()).updateMemory(memoryId, patch)
        },
        async updateMemoryStatus(memoryId: string, status: TalosMemoryStatus) {
            return (await ready()).updateMemoryStatus(memoryId, status)
        },
        async touchMemories(memoryIds: string[], usedAt: string) {
            return (await ready()).touchMemories(memoryIds, usedAt)
        },
        async deleteMemory(memoryId: string) {
            return (await ready()).deleteMemory(memoryId)
        },
        async loadComposerDraft(scopeId: string) {
            return (await ready()).loadComposerDraft(scopeId)
        },
        async saveComposerDraft(scopeId: string, draft: string) {
            return (await ready()).saveComposerDraft(scopeId, draft)
        },
        async close() {
            if (initialization) {
                try {
                    await initialization
                } catch {
                    return
                }
            }
            const current = repository
            repository = null
            initialization = null
            if (current) await current.close()
        },
    }
}
