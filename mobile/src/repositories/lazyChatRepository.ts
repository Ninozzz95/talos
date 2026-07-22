import type {
    AppendChatMessageInput,
    CreateChatSessionInput,
    CreateFileAuthorityGrantInput,
    CreateVaultFileInput,
    CreateToolActivityInput,
    TalosChatRepository,
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
        async listMessages(sessionId: string) {
            return (await ready()).listMessages(sessionId)
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
        async listMessageAttachments(messageId: string) {
            return (await ready()).listMessageAttachments(messageId)
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
