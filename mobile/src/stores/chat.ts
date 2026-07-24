import { reactive, readonly, ref, type Ref } from 'vue'
import type {
    TalosMobileMessageRole,
    TalosMobileMessageState,
    TalosMobileMessageView,
    TalosMobileBrowserActivityView,
} from '@/components/chat/mobileChatTypes'
import { parseTalosMobileBrowserEvidenceEnvelope } from '@/lib/browser/browserContracts'
import type { TalosMobileInputPart } from '@/lib/chat/attachmentContracts'
import { newTalosMobileId } from '@/lib/mobileIds'
import { TalosMobileProviderError } from '@/lib/chat/providerErrors'
import type {
    TalosChatRepository,
    AppendChatAttachmentInput,
    TalosChatAttachmentBinding,
    TalosLocalChatMessage,
    TalosLocalChatSession,
    TalosLocalToolActivity,
    TalosLocalChatSurface,
    CreateToolActivityInput,
} from '@/repositories/chatRepository'

export interface ChatTurn {
    role: 'user' | 'assistant'
    content: string
    parts?: TalosMobileInputPart[]
}

// F2-T4 streaming: the completion may stream partial text through handlers.
// Contract: chunks are LIVE-render only; the durable assistant write happens
// exactly once (final text, or the partial marked interrupted).
export interface TalosStreamHandlers {
    onChunk: (text: string) => void
    signal?: AbortSignal
}

export type ChatCompletion = (turns: ChatTurn[], stream?: TalosStreamHandlers) => Promise<string>
export type ChatPersistenceStatus = 'idle' | 'loading' | 'ready' | 'error'

export interface ChatState {
    sending: boolean
    streamingText: string | null
    lastError: string | null
    persistenceStatus: ChatPersistenceStatus
    persistenceError: string | null
}

export interface ChatStoreOptions {
    repository: TalosChatRepository
    makeId?: () => string
    now?: () => string
    resolveMessageParts?: (messageId: string) => Promise<TalosMobileInputPart[]>
}

export interface ChatStore {
    stopStreaming(): void
    readonly messages: readonly TalosMobileMessageView[]
    readonly sessionBrowserActivities: readonly TalosMobileBrowserActivityView[]
    readonly sessions: readonly TalosLocalChatSession[]
    readonly activeSession: Readonly<Ref<TalosLocalChatSession | null>>
    readonly state: Readonly<ChatState>
    initialize(): Promise<void>
    retryPersistence(): Promise<void>
    createSession(title?: string, modelProfileId?: string | null): Promise<TalosLocalChatSession>
    selectSession(sessionId: string): Promise<void>
    renameSession(sessionId: string, title: string): Promise<TalosLocalChatSession>
    deleteSession(sessionId: string): Promise<void>
    setSessionArchived(sessionId: string, archived: boolean): Promise<void>
    setSessionOrder(orderedIds: string[]): Promise<void>
    exportSnapshot(sessionId?: string): Promise<{
        session: TalosLocalChatSession
        messages: TalosLocalChatMessage[]
        activities: TalosLocalToolActivity[]
        attachments: Array<TalosChatAttachmentBinding & { sha256: string | null }>
    }>
    loadComposerDraft(scopeId?: string | null): Promise<string>
    saveComposerDraft(draft: string, scopeId?: string | null): Promise<void>
    setActiveModelProfile(modelProfileId: string | null): Promise<void>
    setSurface(surface: TalosLocalChatSurface): Promise<void>
    recordBrowserActivity(
        sessionId: string,
        input: Omit<CreateToolActivityInput, 'session_id' | 'message_id'>,
    ): Promise<void>
    send(
        text: string,
        modelProfileId?: string | null,
        metadata?: Record<string, unknown>,
        attachments?: readonly AppendChatAttachmentInput[],
    ): Promise<boolean>
}

function toBrowserActivityView(activity: TalosLocalToolActivity): TalosMobileBrowserActivityView | null {
    if (!['session_start', 'navigate', 'snapshot', 'screenshot', 'read', 'click', 'scroll', 'upload', 'wait', 'tabs']
        .includes(activity.operation)) return null
    try {
        return {
            id: activity.id,
            operation: activity.operation,
            status: activity.status,
            occurred_at: activity.created_at,
            evidence: parseTalosMobileBrowserEvidenceEnvelope(activity.evidence),
            failure_code: null,
        }
    } catch {
        return {
            id: activity.id,
            operation: activity.operation,
            status: activity.status,
            occurred_at: activity.created_at,
            evidence: null,
            failure_code: 'TALOS_BROWSER_EVIDENCE_INVALID',
        }
    }
}

function errorMessage(error: unknown): string {
    return error instanceof Error && error.message ? error.message : 'Local chat storage failed.'
}

function titleFromPrompt(prompt: string): string {
    return prompt.replace(/\s+/g, ' ').trim().slice(0, 255) || 'New chat'
}

function toMessageView(
    message: TalosLocalChatMessage,
    attachments: TalosChatAttachmentBinding[] = [],
    toolActivities: TalosLocalToolActivity[] = [],
): TalosMobileMessageView {
    const role: TalosMobileMessageRole = message.role === 'tool' ? 'system' : message.role
    const view: TalosMobileMessageView = {
        id: message.id,
        role,
        content: message.content,
        created_at: message.created_at,
        state: message.state as TalosMobileMessageState,
        model_profile_id: message.model_profile_id,
        run_id: message.run_id,
        metadata: message.metadata,
    }
    if (attachments.length > 0) {
        view.attachments = attachments.map((attachment) => ({
            id: attachment.id,
            vault_file_id: attachment.vault_file_id,
            grant_id: attachment.grant_id,
            display_name: attachment.display_name,
            media_type: attachment.media_type,
            size_bytes: attachment.size_bytes,
            permissions: [...attachment.permissions],
            grant_status: attachment.grant_status,
        }))
    }
    const browserActivities = toolActivities.flatMap((activity): TalosMobileBrowserActivityView[] => {
        const view = toBrowserActivityView(activity)
        return view ? [view] : []
    })
    if (browserActivities.length > 0) view.browserActivities = browserActivities
    return view
}

function modelIdentity(modelProfileId: string | null): { provider: string | null; model: string | null } {
    if (!modelProfileId) return { provider: null, model: null }
    const separator = modelProfileId.indexOf(':')
    if (separator < 1 || separator === modelProfileId.length - 1) {
        return { provider: null, model: modelProfileId }
    }
    return {
        provider: modelProfileId.slice(0, separator),
        model: modelProfileId.slice(separator + 1),
    }
}

function providerFault(error: unknown, modelProfileId: string | null): Record<string, unknown> {
    const identity = modelIdentity(modelProfileId)
    if (error instanceof TalosMobileProviderError) {
        const status = error.status ?? null
        const retryable = status === null
            ? null
            : status === 408 || status === 429 || status >= 500
        return {
            layer: 'provider',
            code: status ? `PROVIDER_HTTP_${status}` : 'PROVIDER_CHAT_FAILED',
            message: error.message,
            next_action: status === 401 || status === 403
                ? 'Update the provider credential in Settings, then retry.'
                : 'Check provider health and retry the message.',
            retryable,
            status,
            provider: error.provider || identity.provider,
            model: identity.model,
        }
    }
    return {
        layer: 'system',
        code: 'CHAT_EXECUTION_FAILED',
        message: errorMessage(error),
        next_action: 'Check the selected model and connection, then retry.',
        retryable: null,
        status: null,
        provider: identity.provider,
        model: identity.model,
    }
}

export function createChatStore(complete: ChatCompletion, options: ChatStoreOptions): ChatStore {
    const repository = options.repository
    const makeId = options.makeId ?? newTalosMobileId
    const now = options.now ?? (() => new Date().toISOString())
    const messages = reactive<TalosMobileMessageView[]>([])
    const sessionBrowserActivities = reactive<TalosMobileBrowserActivityView[]>([])
    const sessions = reactive<TalosLocalChatSession[]>([])
    const activeSession = ref<TalosLocalChatSession | null>(null)
    let activeStreamAbort: AbortController | null = null
    const state = reactive<ChatState>({
        sending: false,
        streamingText: null,
        lastError: null,
        persistenceStatus: 'idle',
        persistenceError: null,
    })
    let initialization: Promise<void> | null = null

    async function loadMessageView(message: TalosLocalChatMessage): Promise<TalosMobileMessageView> {
        const [attachments, toolActivities] = await Promise.all([
            repository.listMessageAttachments(message.id),
            repository.listMessageToolActivities(message.id),
        ])
        return toMessageView(message, attachments, toolActivities)
    }

    function markPersistenceFailure(error: unknown): void {
        const detail = errorMessage(error)
        state.persistenceStatus = 'error'
        state.persistenceError = `Local chat storage is unavailable. ${detail}`
        state.lastError = state.persistenceError
    }

    async function readSnapshot(): Promise<{
        sessions: TalosLocalChatSession[]
        active: TalosLocalChatSession | null
        messages: TalosMobileMessageView[]
        sessionBrowserActivities: TalosMobileBrowserActivityView[]
    }> {
        const available = await repository.listSessions()
        let activeId = await repository.getActiveSessionId()
        if (!available.some((session) => session.id === activeId)) {
            activeId = available[0]?.id ?? null
            if (activeId) await repository.selectSession(activeId)
        }
        const active = available.find((session) => session.id === activeId) ?? null
        const restored = active
            ? await Promise.all((await repository.listMessages(active.id)).map(loadMessageView))
            : []
        const browserActivities = active
            ? (await repository.listSessionToolActivities(active.id))
                .filter((activity) => activity.message_id === null)
                .flatMap((activity) => {
                    const view = toBrowserActivityView(activity)
                    return view ? [view] : []
                })
            : []
        return { sessions: available, active, messages: restored, sessionBrowserActivities: browserActivities }
    }

    function applySnapshot(snapshot: Awaited<ReturnType<typeof readSnapshot>>): void {
        sessions.splice(0, sessions.length, ...snapshot.sessions)
        activeSession.value = snapshot.active
        messages.splice(0, messages.length, ...snapshot.messages)
        sessionBrowserActivities.splice(0, sessionBrowserActivities.length, ...snapshot.sessionBrowserActivities)
    }

    async function performInitialize(force: boolean): Promise<void> {
        if (!force && state.persistenceStatus === 'ready') return
        state.persistenceStatus = 'loading'
        state.persistenceError = null
        try {
            await repository.initialize()
            applySnapshot(await readSnapshot())
            state.persistenceStatus = 'ready'
            state.persistenceError = null
            state.lastError = null
        } catch (error) {
            markPersistenceFailure(error)
        }
    }

    async function initialize(): Promise<void> {
        if (!initialization) {
            initialization = performInitialize(false).finally(() => { initialization = null })
        }
        await initialization
    }

    async function retryPersistence(): Promise<void> {
        if (!initialization) {
            initialization = performInitialize(true).finally(() => { initialization = null })
        }
        await initialization
    }

    function requirePersistence(): void {
        if (state.persistenceStatus !== 'ready') {
            throw new Error(state.persistenceError ?? 'Local chat storage is not ready.')
        }
    }

    async function refreshSessionList(): Promise<void> {
        const available = await repository.listSessions()
        sessions.splice(0, sessions.length, ...available)
        const activeId = activeSession.value?.id
        activeSession.value = available.find((session) => session.id === activeId) ?? null
    }

    // R2-9: appendMessage bumps ONLY the session's updated_at in the DB —
    // mirror that locally instead of a full-table round-trip on EVERY user
    // and assistant append (it was two listSessions per exchange).
    function bumpSessionRecency(sessionId: string, updatedAt: string): void {
        const index = sessions.findIndex((session) => session.id === sessionId)
        if (index < 0) return
        const updated = { ...sessions[index], updated_at: updatedAt }
        sessions.splice(index, 1)
        // listSessions orders by updated_at DESC — the freshest bump leads.
        sessions.unshift(updated)
        if (activeSession.value?.id === sessionId) activeSession.value = updated
    }

    async function createSession(
        title = 'New chat',
        modelProfileId: string | null = null,
    ): Promise<TalosLocalChatSession> {
        requirePersistence()
        try {
            const created = await repository.createSession({
                id: makeId(),
                title,
                active_model_profile_id: modelProfileId,
                created_at: now(),
            })
            await refreshSessionList()
            activeSession.value = sessions.find((session) => session.id === created.id) ?? created
            messages.splice(0, messages.length)
            sessionBrowserActivities.splice(0, sessionBrowserActivities.length)
            state.lastError = null
            return activeSession.value
        } catch (error) {
            markPersistenceFailure(error)
            throw error
        }
    }

    async function selectSession(sessionId: string): Promise<void> {
        requirePersistence()
        try {
            await repository.selectSession(sessionId)
            const restored = await Promise.all((await repository.listMessages(sessionId)).map(async (message) =>
                loadMessageView(message),
            ))
            const browserActivities = (await repository.listSessionToolActivities(sessionId))
                .filter((activity) => activity.message_id === null)
                .flatMap((activity) => {
                    const view = toBrowserActivityView(activity)
                    return view ? [view] : []
                })
            await refreshSessionList()
            const selected = sessions.find((session) => session.id === sessionId)
            if (!selected) throw new Error('TALOS_CHAT_SESSION_NOT_FOUND')
            activeSession.value = selected
            messages.splice(0, messages.length, ...restored)
            sessionBrowserActivities.splice(0, sessionBrowserActivities.length, ...browserActivities)
            state.lastError = null
        } catch (error) {
            markPersistenceFailure(error)
            throw error
        }
    }

    async function renameSession(sessionId: string, title: string): Promise<TalosLocalChatSession> {
        requirePersistence()
        try {
            const renamed = await repository.renameSession(sessionId, title)
            await refreshSessionList()
            if (activeSession.value?.id === sessionId) activeSession.value = renamed
            return renamed
        } catch (error) {
            markPersistenceFailure(error)
            throw error
        }
    }

    async function deleteSession(sessionId: string): Promise<void> {
        requirePersistence()
        try {
            const nextId = await repository.deleteSession(sessionId)
            const available = await repository.listSessions()
            const next = available.find((session) => session.id === nextId) ?? null
            const restored = next
                ? await Promise.all((await repository.listMessages(next.id)).map(loadMessageView))
                : []
            const browserActivities = next
                ? (await repository.listSessionToolActivities(next.id))
                    .filter((activity) => activity.message_id === null)
                    .flatMap((activity) => {
                        const view = toBrowserActivityView(activity)
                        return view ? [view] : []
                    })
                : []
            sessions.splice(0, sessions.length, ...available)
            activeSession.value = next
            messages.splice(0, messages.length, ...restored)
            sessionBrowserActivities.splice(0, sessionBrowserActivities.length, ...browserActivities)
            state.lastError = null
        } catch (error) {
            markPersistenceFailure(error)
            throw error
        }
    }

    function composerDraftScope(scopeId?: string | null): string {
        return scopeId ?? activeSession.value?.id ?? 'new'
    }

    async function loadComposerDraft(scopeId?: string | null): Promise<string> {
        requirePersistence()
        return repository.loadComposerDraft(composerDraftScope(scopeId))
    }

    async function saveComposerDraft(draft: string, scopeId?: string | null): Promise<void> {
        requirePersistence()
        await repository.saveComposerDraft(composerDraftScope(scopeId), draft)
    }

    async function setActiveModelProfile(modelProfileId: string | null): Promise<void> {
        requirePersistence()
        const active = activeSession.value
        if (!active || active.active_model_profile_id === modelProfileId) return
        try {
            const updated = await repository.updateSession(active.id, {
                active_model_profile_id: modelProfileId,
            })
            activeSession.value = updated
            await refreshSessionList()
        } catch (error) {
            markPersistenceFailure(error)
            throw error
        }
    }

    // F4-#16 — raw snapshot for the local export builders: session, ordered
    // messages, session tool activities, and attachment bindings enriched
    // with the vault sha256 (name+hash provenance, never storage paths).
    async function exportSnapshot(sessionId?: string) {
        requirePersistence()
        const targetId = sessionId ?? activeSession.value?.id
        if (!targetId) throw new Error('TALOS_CHAT_SESSION_NOT_FOUND')
        const session = sessions.find((candidate) => candidate.id === targetId)
        if (!session) throw new Error('TALOS_CHAT_SESSION_NOT_FOUND')
        const exportMessages = await repository.listMessages(targetId)
        const activities = await repository.listSessionToolActivities(targetId)
        const attachments = []
        for (const message of exportMessages) {
            for (const binding of await repository.listMessageAttachments(message.id)) {
                const vaultFile = await repository.getVaultFile(binding.vault_file_id).catch(() => null)
                attachments.push({ ...binding, sha256: vaultFile?.sha256 ?? null })
            }
        }
        return { session, messages: exportMessages, activities, attachments }
    }

    // F4-#23 — archive flag and manual order live in session metadata: they
    // survive restart, stay local-first, and need no schema migration.
    async function setSessionArchived(sessionId: string, archived: boolean): Promise<void> {
        requirePersistence()
        const current = sessions.find((session) => session.id === sessionId)
        if (!current) throw new Error('TALOS_CHAT_SESSION_NOT_FOUND')
        try {
            const updated = await repository.updateSessionMetadata(sessionId, {
                ...current.metadata, archived,
            })
            if (activeSession.value?.id === sessionId) activeSession.value = updated
            await refreshSessionList()
        } catch (error) {
            markPersistenceFailure(error)
            throw error
        }
    }

    async function setSessionOrder(orderedIds: string[]): Promise<void> {
        requirePersistence()
        try {
            for (const [index, sessionId] of orderedIds.entries()) {
                const current = sessions.find((session) => session.id === sessionId)
                if (!current) continue
                const updated = await repository.updateSessionMetadata(sessionId, {
                    ...current.metadata, sort_index: index,
                })
                if (activeSession.value?.id === sessionId) activeSession.value = updated
            }
            await refreshSessionList()
        } catch (error) {
            markPersistenceFailure(error)
            throw error
        }
    }

    async function setSurface(surface: TalosLocalChatSurface): Promise<void> {
        requirePersistence()
        let active = activeSession.value
        if (!active) active = await createSession('New chat')
        if (active.surface === surface) return
        try {
            const updated = await repository.updateSession(active.id, { surface })
            activeSession.value = updated
            await refreshSessionList()
        } catch (error) {
            markPersistenceFailure(error)
            throw error
        }
    }

    async function recordBrowserActivity(
        sessionId: string,
        input: Omit<CreateToolActivityInput, 'session_id' | 'message_id'>,
    ): Promise<void> {
        requirePersistence()
        try {
            const activity = await repository.appendToolActivity({
                ...input,
                session_id: sessionId,
                message_id: null,
            })
            const view = toBrowserActivityView(activity)
            if (view && activeSession.value?.id === sessionId) sessionBrowserActivities.push(view)
            await refreshSessionList()
        } catch (error) {
            markPersistenceFailure(error)
            throw error
        }
    }

    async function ensureActiveSession(prompt: string, modelProfileId: string | null): Promise<TalosLocalChatSession> {
        let active = activeSession.value
        if (!active) return createSession(titleFromPrompt(prompt), modelProfileId)

        const update: { title?: string; active_model_profile_id?: string | null } = {}
        if (active.active_model_profile_id !== modelProfileId) update.active_model_profile_id = modelProfileId
        if (messages.length === 0 && active.title === 'New chat') update.title = titleFromPrompt(prompt)
        if (Object.keys(update).length > 0) {
            active = await repository.updateSession(active.id, update)
            activeSession.value = active
            await refreshSessionList()
        }
        return active
    }

    async function appendDurable(
        sessionId: string,
        role: 'user' | 'assistant' | 'system',
        content: string,
        messageState: TalosMobileMessageState,
        modelProfileId: string | null,
        metadata: Record<string, unknown> = {},
        attachments: readonly AppendChatAttachmentInput[] = [],
    ): Promise<void> {
        const persisted = await repository.appendMessage({
            id: makeId(),
            session_id: sessionId,
            role,
            content,
            state: messageState,
            model_profile_id: modelProfileId,
            metadata,
            attachments,
            created_at: now(),
        })
        messages.push(await loadMessageView(persisted))
        bumpSessionRecency(sessionId, persisted.created_at)
    }

    async function send(
        text: string,
        modelProfileId: string | null = null,
        metadata: Record<string, unknown> = {},
        attachments: readonly AppendChatAttachmentInput[] = [],
    ): Promise<boolean> {
        const trimmed = text.trim()
        if ((!trimmed && attachments.length === 0) || state.sending) return false
        if (state.persistenceStatus !== 'ready') {
            state.lastError = state.persistenceError ?? 'Local chat storage is not ready.'
            return false
        }

        state.sending = true
        state.lastError = null
        let session: TalosLocalChatSession
        try {
            session = await ensureActiveSession(trimmed || 'Shared files', modelProfileId)
            await appendDurable(
                session.id,
                'user',
                trimmed,
                'persisted',
                modelProfileId,
                metadata,
                attachments,
            )
        } catch (error) {
            markPersistenceFailure(error)
            state.sending = false
            return false
        }

        let turns: ChatTurn[]
        try {
            turns = await Promise.all(messages
                .filter((message) => message.role === 'user' || message.role === 'assistant')
                .map(async (message) => {
                    const turn: ChatTurn = {
                        role: message.role as 'user' | 'assistant',
                        content: message.content,
                    }
                    if (message.attachments?.length) {
                        if (!options.resolveMessageParts) {
                            throw new Error('TALOS_ATTACHMENT_RESOLVER_UNAVAILABLE')
                        }
                        const parts = await options.resolveMessageParts(message.id)
                        if (parts.length > 0) turn.parts = parts
                    }
                    return turn
                }))
        } catch (error) {
            state.lastError = errorMessage(error)
            try {
                await appendDurable(session.id, 'system', state.lastError, 'failed', modelProfileId, {
                    chat_error: providerFault(error, modelProfileId),
                })
            } catch (persistenceError) {
                markPersistenceFailure(persistenceError)
            }
            state.sending = false
            return true
        }

        const abort = new AbortController()
        activeStreamAbort = abort
        let streamed = ''
        try {
            const reply = await complete(turns, {
                onChunk: (text) => {
                    streamed += text
                    state.streamingText = streamed
                },
                signal: abort.signal,
            })
            await appendDurable(session.id, 'assistant', reply, 'persisted', modelProfileId)
        } catch (error) {
            const aborted = error instanceof Error && error.name === 'AbortError'
            // A streamed partial is preserved honestly, never re-fetched or dropped.
            if (streamed) {
                try {
                    await appendDurable(session.id, 'assistant', streamed, 'persisted', modelProfileId, { interrupted: true })
                } catch (persistenceError) {
                    markPersistenceFailure(persistenceError)
                }
            }
            if (!aborted) {
                const providerError = errorMessage(error)
                state.lastError = providerError
                try {
                    await appendDurable(session.id, 'system', providerError, 'failed', modelProfileId, {
                        chat_error: providerFault(error, modelProfileId),
                    })
                } catch (persistenceError) {
                    markPersistenceFailure(persistenceError)
                }
            }
        } finally {
            state.streamingText = null
            activeStreamAbort = null
            state.sending = false
        }
        return true
    }

    function stopStreaming(): void {
        activeStreamAbort?.abort()
    }

    return {
        stopStreaming,
        messages: readonly(messages),
        sessionBrowserActivities: readonly(sessionBrowserActivities),
        sessions: readonly(sessions),
        activeSession: readonly(activeSession),
        state: readonly(state),
        initialize,
        retryPersistence,
        createSession,
        selectSession,
        renameSession,
        deleteSession,
        setSessionArchived,
        setSessionOrder,
        exportSnapshot,
        loadComposerDraft,
        saveComposerDraft,
        setActiveModelProfile,
        setSurface,
        recordBrowserActivity,
        send,
    }
}
