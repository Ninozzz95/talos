import { reactive, readonly, ref, type Ref } from 'vue'
import type { TalosTranslate } from '@/i18n/contracts'
import { talosTranslatableErrorMessage } from '@/i18n/uiErrors'
import type {
    TalosMobileMessageRole,
    TalosMobileMessageState,
    TalosMobileMessageView,
    TalosMobileBrowserActivityView,
} from '@/components/chat/mobileChatTypes'
import { parseTalosMobileBrowserEvidenceEnvelope } from '@/lib/browser/browserContracts'
import { stripLibrarySaveMarkers } from '@/lib/chat/librarySave'
import { talosMessageReasoning } from '@/lib/chat/messageReasoning'
import type { TalosMobileInputPart } from '@/lib/chat/attachmentContracts'
import {
    createTalosChatSendIdentity,
    type TalosChatSendIdentity,
    type TalosChatSendPreparation,
    type TalosChatSendPreparationContext,
} from '@/lib/chat/sendSnapshot'
import {
    applyTalosSessionLibraryContextPolicyPatch,
    parseTalosSessionLibraryContextPolicy,
    type TalosLibraryTurnOverride,
    type TalosSessionLibraryContextPolicyPatch,
    type TalosSessionLibraryContextPolicyV1,
} from '@/lib/chat/libraryPolicy'
import type { TalosToolDefinition } from '@/lib/tools/registry'
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

/**
 * Owner 2026-07-25 (defect #4): opening a chat loaded EVERY message, so the
 * conversations you use most became the slowest to open. The newest page is
 * loaded first and older ones arrive as you scroll up — the shape WhatsApp and
 * ChatGPT both use. 40 covers most conversations in one read.
 */
export const TALOS_MESSAGE_PAGE_SIZE = 40
const CHAT_SESSION_NOT_FOUND = 'TALOS_CHAT_SESSION_NOT_FOUND'
const NEW_CHAT_TITLE = 'New chat'

/**
 * Defect #5: the trace is model output like any other — it can rehearse the
 * library-save syntax, and it can be enormous. Markers are stripped and the
 * text is capped, with the truncation stated rather than hidden.
 */
const REASONING_MAX_CHARS = 64_000

function capturedReasoning(text: string, translate: TalosTranslate): string {
    const clean = stripLibrarySaveMarkers(text)
    return clean.length <= REASONING_MAX_CHARS
        ? clean
        : `${clean.slice(0, REASONING_MAX_CHARS)}\n${translate('chat.reasoningTruncated', {
            count: REASONING_MAX_CHARS,
        })}`
}

/** Debt A1: a provider-agnostic tool call (hub-and-spoke IR — each adapter
 *  translates this to its own wire shape). */
export interface TalosToolCall {
    id: string
    name: string
    /** JSON-encoded arguments, exactly as the provider emitted them. */
    arguments: string
}

export interface ChatTurn {
    /** 'tool' carries a tool RESULT back to the model (the DB already had it). */
    role: 'user' | 'assistant' | 'tool'
    content: string
    parts?: TalosMobileInputPart[]
    /** Set on an assistant turn that requested tools. */
    toolCalls?: TalosToolCall[]
    /** Set on a tool turn: which call this result answers. */
    toolCallId?: string
    /**
     * Set on a tool turn: WHICH TOOL produced it. The OpenAI and Anthropic
     * families match a result to its call by id, so this looks redundant — but
     * Gemini matches by `functionResponse.name` and Ollama by `tool_name`, and
     * neither carries a call id at all. Without the name those two cannot be
     * handed a result, which is exactly why they shipped unwired.
     */
    toolName?: string
}

// F2-T4 streaming: the completion may stream partial text through handlers.
// Contract: chunks are LIVE-render only; the durable assistant write happens
// exactly once (final text, or the partial marked interrupted).
export interface TalosStreamHandlers {
    onChunk: (text: string) => void
    /**
     * Owner 2026-07-25 (defect #5): the model's reasoning arrives on its own
     * channel. It is rendered collapsed and persisted with the message — it was
     * being discarded, which threw away the one signal that explains an answer.
     */
    onReasoning?: (text: string) => void
    /**
     * Fired when the transport abandons a streamed attempt and re-asks over the
     * buffered path: the trace collected so far belongs to an answer nobody
     * will ever see.
     */
    onReasoningReset?: () => void
    signal?: AbortSignal
}

/**
 * Owner 2026-07-26: one search result/page the answer rests on. Kept per ANSWER so the chat
 * can show a "Sources" chip under that reply — a chip listing everything the
 * conversation ever read would not be a citation.
 */
export interface TalosMobileWebSource {
    url: string
    title: string
    site: string | null
    publishedAt: string | null
}

/** Debt A1: the result, not a bare string — `finishReason` is what an agent loop
 *  dispatches on, and it used to be produced by every adapter and then discarded. */
export interface ChatCompletionResult {
    text: string
    /** Controller-owned durable assistant evidence; never provider output. */
    metadata?: Readonly<Record<string, unknown>>
    finishReason?: string | null
    /**
     * Token accounting exactly as the provider reported it.
     *
     * Every adapter already produced this and nothing consumed it. The Doctor
     * reads it now to show what prompt caching actually did — otherwise
     * "caching is on" is a claim the owner would have to take on faith.
     * Optional and untouched by anything that ignores it.
     */
    usage?: Record<string, number> | null
    toolCalls?: TalosToolCall[]
    /** Defect #5: kept beside the answer, never mixed into it. */
    reasoning?: string
    /**
     * Owner 2026-07-26: the search results/pages this answer rests on, so the chat can show a
     * "Sources" chip under it. Per ANSWER, never per chat — a chip listing
     * everything the conversation ever read is not a citation.
     */
    sources?: readonly TalosMobileWebSource[]
    /** Tool-produced Vault bindings persisted on the final assistant row. */
    attachments?: readonly AppendChatAttachmentInput[]
}

export interface ChatCompletionInvocation<Runtime> {
    readonly identity: Readonly<TalosChatSendIdentity>
    readonly runtime: Runtime
    /** Durable assistant-only resume; never inferred from the selected chat. */
    readonly continuation?: Readonly<{
        checkpoint_id: string
        checkpoint: Readonly<Record<string, unknown>>
    }>
}

export interface TalosChatContinuationInput<Runtime> {
    readonly identity: Readonly<TalosChatSendIdentity>
    readonly runtime: Runtime
    readonly checkpoint_id: string
    readonly checkpoint: Readonly<Record<string, unknown>>
}

export type ChatCompletion<Runtime = undefined> = (
    turns: ChatTurn[],
    stream?: TalosStreamHandlers,
    /** Tools this turn may call; omitted by callers that have no suite. */
    tools?: readonly TalosToolDefinition<never>[],
    invocation?: ChatCompletionInvocation<Runtime>,
) => Promise<ChatCompletionResult>
export type ChatPersistenceStatus = 'idle' | 'loading' | 'ready' | 'error'

export interface ChatState {
    sending: boolean
    streamingText: string | null
    /**
     * WHICH conversation the in-flight reply belongs to.
     *
     * Owner 2026-07-26: he left a chat generating, opened a new one, and a
     * message appeared there on its own. It was not a new message — it was the
     * OTHER chat's reply, because the streaming text is one global field and
     * `selectSession` replaces the message list without touching it. The
     * durable write always went to the right session; only the live rendering
     * was homeless.
     */
    streamingSessionId: string | null
    /** Defect #5: the reasoning of the reply being streamed right now. */
    streamingReasoning: string | null
    /** Defect #4: false once the oldest message of the session is on screen. */
    hasOlderMessages: boolean
    loadingOlderMessages: boolean
    lastError: string | null
    persistenceStatus: ChatPersistenceStatus
    persistenceError: string | null
}

export interface ChatStoreOptions<Runtime = undefined> {
    repository: TalosChatRepository
    translate: TalosTranslate
    makeId?: () => string
    now?: () => string
    resolveMessageParts?: (messageId: string) => Promise<TalosMobileInputPart[]>
    /**
     * Synchronous boundary: copies controller-owned state after session capture
     * and before any retrieval await.
     */
    captureSendRuntime?: (
        identity: Readonly<TalosChatSendIdentity>,
        turnPolicy: TalosLibraryTurnOverride | null,
    ) => Runtime
    prepareSend?: (
        context: TalosChatSendPreparationContext<Runtime>,
    ) => Promise<TalosChatSendPreparation<Runtime>>
}

declare const TALOS_CHAT_STORE_RUNTIME: unique symbol

export interface ChatStore<Runtime = undefined> {
    /** @internal Type-only link between a store and its completion runtime. */
    readonly [TALOS_CHAT_STORE_RUNTIME]?: Runtime
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
    /** Defect #4: prepend the page above the oldest message; returns how many. */
    loadOlderMessages(): Promise<number>
    renameSession(sessionId: string, title: string): Promise<TalosLocalChatSession>
    deleteSession(sessionId: string): Promise<void>
    setSessionArchived(sessionId: string, archived: boolean): Promise<void>
    setSessionLibraryContextPolicy(
        sessionId: string,
        patch: TalosSessionLibraryContextPolicyPatch,
        expectedRevision: number,
    ): Promise<TalosSessionLibraryContextPolicyV1>
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
        // Fired the moment the user message is COMMITTED (persisted), before the
        // assistant stream — so the composer (text + attachments) can clear
        // immediately instead of lingering for the whole generation.
        onPersisted?: () => void,
        turnPolicy?: TalosLibraryTurnOverride | null,
    ): Promise<boolean>
    /**
     * Resume durable assistant work on its captured owner. The continuation is
     * queued behind an active send and never invents another user message.
     */
    continueFromCheckpoint(input: TalosChatContinuationInput<Runtime>): Promise<boolean>
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

function errorMessage(error: unknown, translate: TalosTranslate): string {
    return error instanceof Error && error.message
        ? error.message
        : translate('chat.localStorageFailed')
}

function titleFromPrompt(prompt: string): string {
    return prompt.replace(/\s+/g, ' ').trim().slice(0, 255) || NEW_CHAT_TITLE
}

function toMessageView(
    message: TalosLocalChatMessage,
    attachments: TalosChatAttachmentBinding[] = [],
    toolActivities: TalosLocalToolActivity[] = [],
): TalosMobileMessageView {
    // Debt A1: tool turns are persistable AND readable now (they were collapsed
    // to 'system', which made a tool loop impossible to render).
    const role: TalosMobileMessageRole = message.role
    const view: TalosMobileMessageView = {
        id: message.id,
        ordinal: message.ordinal,
        role,
        content: message.content,
        created_at: message.created_at,
        state: message.state as TalosMobileMessageState,
        model_profile_id: message.model_profile_id,
        run_id: message.run_id,
        metadata: message.metadata,
        // A completed chat row consumes a typed view value, not a second
        // ad-hoc read from the metadata bag. The export uses the same extractor.
        reasoning: message.role === 'assistant'
            ? talosMessageReasoning(message.metadata)
            : null,
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

function providerFault(
    error: unknown,
    modelProfileId: string | null,
    translate: TalosTranslate,
): Record<string, unknown> {
    const identity = modelIdentity(modelProfileId)
    if (error instanceof TalosMobileProviderError) {
        const status = error.status ?? null
        const retryable = status === null
            ? null
            : status === 408 || status === 429 || status >= 500
        return {
            layer: 'provider',
            code: status ? `PROVIDER_HTTP_${status}` : 'PROVIDER_CHAT_FAILED',
            message: talosTranslatableErrorMessage(error, translate) ?? error.message,
            next_action: status === 401 || status === 403
                ? translate('chat.updateProviderCredential')
                : translate('chat.checkProviderHealth'),
            retryable,
            status,
            provider: error.provider || identity.provider,
            model: identity.model,
        }
    }
    return {
        layer: 'system',
        code: 'CHAT_EXECUTION_FAILED',
        message: talosTranslatableErrorMessage(error, translate)
            ?? errorMessage(error, translate),
        next_action: translate('chat.checkModelConnection'),
        retryable: null,
        status: null,
        provider: identity.provider,
        model: identity.model,
    }
}

export function createChatStore<Runtime = undefined>(
    complete: ChatCompletion<Runtime>,
    options: ChatStoreOptions<Runtime>,
): ChatStore<Runtime> {
    const repository = options.repository
    const translate = options.translate
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
        streamingSessionId: null,
        streamingReasoning: null,
        hasOlderMessages: false,
        loadingOlderMessages: false,
        lastError: null,
        persistenceStatus: 'idle',
        persistenceError: null,
    })
    let initialization: Promise<void> | null = null
    let navigationRevision = 0
    const sessionMutationTails = new Map<string, Promise<void>>()
    const desiredModelProfileBySession = new Map<string, string | null>()
    const continuationQueue: Array<{
        input: TalosChatContinuationInput<Runtime>
        resolve(value: boolean): void
    }> = []
    let drainingContinuations = false

    async function loadMessageView(message: TalosLocalChatMessage): Promise<TalosMobileMessageView> {
        const [attachments, toolActivities] = await Promise.all([
            repository.listMessageAttachments(message.id),
            repository.listMessageToolActivities(message.id),
        ])
        return toMessageView(message, attachments, toolActivities)
    }

    /**
     * Defect #4: a full page means there is probably more above it. Asking the
     * database for a count on every open would cost the scan the paging exists
     * to avoid — a full page is the cheap, honest signal, and the first
     * `loadOlderMessages` corrects it if it was wrong.
     */
    function markPageLoaded(rows: readonly unknown[]): void {
        state.hasOlderMessages = rows.length >= TALOS_MESSAGE_PAGE_SIZE
    }

    function markPersistenceFailure(error: unknown): void {
        const detail = errorMessage(error, translate)
        state.persistenceStatus = 'error'
        state.persistenceError = translate('chat.localStorageUnavailableDetail', { detail })
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
        const restoredRows = active
            ? await repository.listMessages(active.id, { limit: TALOS_MESSAGE_PAGE_SIZE })
            : []
        markPageLoaded(restoredRows)
        const restored = await Promise.all(restoredRows.map(loadMessageView))
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
            throw new Error(state.persistenceError ?? translate('chat.localStorageNotReady'))
        }
    }

    /**
     * SQLite writes for one session are ordered by invocation, so a slow older
     * model write cannot land after a newer user selection.
     */
    function enqueueSessionMutation<T>(
        sessionId: string,
        operation: () => Promise<T>,
    ): Promise<T> {
        const previous = sessionMutationTails.get(sessionId) ?? Promise.resolve()
        const current = previous.catch(() => undefined).then(operation)
        let tail!: Promise<void>
        tail = current.then(() => undefined, () => undefined).finally(() => {
            if (sessionMutationTails.get(sessionId) === tail) {
                sessionMutationTails.delete(sessionId)
            }
        })
        sessionMutationTails.set(sessionId, tail)
        return current
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

    /** Defect #4: a fresh thread has nothing above it. */
    function resetPaging(): void {
        state.hasOlderMessages = false
        state.loadingOlderMessages = false
    }

    async function createSession(
        title = NEW_CHAT_TITLE,
        modelProfileId: string | null = null,
    ): Promise<TalosLocalChatSession> {
        const revision = ++navigationRevision
        resetPaging()
        requirePersistence()
        try {
            const created = await repository.createSession({
                id: makeId(),
                title,
                active_model_profile_id: modelProfileId,
                created_at: now(),
            })
            await refreshSessionList()
            if (revision !== navigationRevision) return created
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

    /**
     * Defect #4: prepend the page ABOVE the oldest message on screen. Returns
     * how many arrived so the list can restore the scroll anchor — prepending
     * without that makes the view jump, which is worse than the slow open it
     * replaced.
     */
    async function loadOlderMessages(): Promise<number> {
        const session = activeSession.value
        const oldest = messages[0]
        if (!session || !oldest || state.loadingOlderMessages || !state.hasOlderMessages) return 0
        state.loadingOlderMessages = true
        try {
            const rows = await repository.listMessages(session.id, {
                limit: TALOS_MESSAGE_PAGE_SIZE,
                before: { ordinal: oldest.ordinal ?? 0, id: oldest.id },
            })
            if (rows.length === 0) {
                state.hasOlderMessages = false
                return 0
            }
            const older = await Promise.all(rows.map(loadMessageView))
            // SF-MAJOR: `session` and `oldest` were captured BEFORE two awaits.
            // Tapping another chat while SQLite answered used to splice one
            // conversation's history into the top of another — and the model
            // then received it as context. Re-check before touching the array.
            if (activeSession.value?.id !== session.id || messages[0]?.id !== oldest.id) return 0
            state.hasOlderMessages = rows.length >= TALOS_MESSAGE_PAGE_SIZE
            messages.splice(0, 0, ...older)
            return older.length
        } catch (error) {
            markPersistenceFailure(error)
            return 0
        } finally {
            state.loadingOlderMessages = false
        }
    }

    async function selectSession(sessionId: string): Promise<void> {
        const revision = ++navigationRevision
        requirePersistence()
        try {
            await repository.selectSession(sessionId)
            const restoredRows = await repository.listMessages(sessionId, { limit: TALOS_MESSAGE_PAGE_SIZE })
            markPageLoaded(restoredRows)
            const restored = await Promise.all(restoredRows.map(async (message) => loadMessageView(message)))
            const browserActivities = (await repository.listSessionToolActivities(sessionId))
                .filter((activity) => activity.message_id === null)
                .flatMap((activity) => {
                    const view = toBrowserActivityView(activity)
                    return view ? [view] : []
                })
            await refreshSessionList()
            const selected = sessions.find((session) => session.id === sessionId)
            if (!selected) throw new Error(CHAT_SESSION_NOT_FOUND)
            if (revision !== navigationRevision) return
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
        const revision = ++navigationRevision
        requirePersistence()
        try {
            const nextId = await repository.deleteSession(sessionId)
            const available = await repository.listSessions()
            const next = available.find((session) => session.id === nextId) ?? null
            const nextRows = next
                ? await repository.listMessages(next.id, { limit: TALOS_MESSAGE_PAGE_SIZE })
                : []
            markPageLoaded(nextRows)
            const restored = await Promise.all(nextRows.map(loadMessageView))
            const browserActivities = next
                ? (await repository.listSessionToolActivities(next.id))
                    .filter((activity) => activity.message_id === null)
                    .flatMap((activity) => {
                        const view = toBrowserActivityView(activity)
                        return view ? [view] : []
                    })
                : []
            if (revision !== navigationRevision) return
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
        if (!active) return
        const currentDesired = desiredModelProfileBySession.has(active.id)
            ? desiredModelProfileBySession.get(active.id)
            : active.active_model_profile_id
        if (currentDesired === modelProfileId) return
        desiredModelProfileBySession.set(active.id, modelProfileId)
        try {
            await enqueueSessionMutation(active.id, () => repository.updateSession(active.id, {
                active_model_profile_id: modelProfileId,
            }))
            if (desiredModelProfileBySession.get(active.id) === modelProfileId) {
                await refreshSessionList()
            }
        } catch (error) {
            if (desiredModelProfileBySession.get(active.id) === modelProfileId) {
                desiredModelProfileBySession.delete(active.id)
            }
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
        if (!targetId) throw new Error(CHAT_SESSION_NOT_FOUND)
        const session = sessions.find((candidate) => candidate.id === targetId)
        if (!session) throw new Error(CHAT_SESSION_NOT_FOUND)
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
        if (!current) throw new Error(CHAT_SESSION_NOT_FOUND)
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

    async function setSessionLibraryContextPolicy(
        sessionId: string,
        patch: TalosSessionLibraryContextPolicyPatch,
        expectedRevision: number,
    ): Promise<TalosSessionLibraryContextPolicyV1> {
        requirePersistence()
        return enqueueSessionMutation(sessionId, async () => {
            const current = sessions.find((session) => session.id === sessionId)
            if (!current) throw new Error(CHAT_SESSION_NOT_FOUND)
            const stored = parseTalosSessionLibraryContextPolicy(
                current.metadata.library_context_policy,
            )
            const candidate = applyTalosSessionLibraryContextPolicyPatch(
                stored ?? {
                    schema_version: 1,
                    revision: 0,
                    enabled: null,
                    mode: null,
                    included_file_ids: [],
                    excluded_file_ids: [],
                    updated_at: null,
                },
                patch,
                expectedRevision,
                now(),
            )
            try {
                const updated = await repository.updateSessionMetadata(sessionId, {
                    ...current.metadata,
                    library_context_policy: candidate,
                })
                const index = sessions.findIndex((session) => session.id === sessionId)
                if (index >= 0) sessions[index] = updated
                if (activeSession.value?.id === sessionId) activeSession.value = updated
                return candidate
            } catch (error) {
                markPersistenceFailure(error)
                throw error
            }
        })
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
        if (!active) active = await createSession(NEW_CHAT_TITLE)
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

        const targetSessionId = active.id
        const projectionRevision = navigationRevision
        const update: { title?: string; active_model_profile_id?: string | null } = {}
        if (active.active_model_profile_id !== modelProfileId) update.active_model_profile_id = modelProfileId
        if (messages.length === 0 && active.title === NEW_CHAT_TITLE) update.title = titleFromPrompt(prompt)
        if (Object.keys(update).length > 0) {
            if ('active_model_profile_id' in update) {
                desiredModelProfileBySession.set(targetSessionId, modelProfileId)
            }
            active = await enqueueSessionMutation(
                targetSessionId,
                () => repository.updateSession(targetSessionId, update),
            )
            const isLatestModel = !('active_model_profile_id' in update)
                || desiredModelProfileBySession.get(targetSessionId) === modelProfileId
            if (isLatestModel) {
                if (
                    projectionRevision === navigationRevision
                    && activeSession.value?.id === targetSessionId
                ) {
                    activeSession.value = active
                }
                await refreshSessionList()
            }
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
        const view = await loadMessageView(persisted)
        if (activeSession.value?.id === sessionId) messages.push(view)
        bumpSessionRecency(sessionId, persisted.created_at)
    }

    async function runContinuation(
        input: TalosChatContinuationInput<Runtime>,
    ): Promise<boolean> {
        state.sending = true
        state.lastError = null
        const abort = new AbortController()
        activeStreamAbort = abort
        let streamed = ''
        let reasoned = ''
        try {
            const owner = (await repository.listSessions()).find(
                (session) => session.id === input.identity.sessionId,
            )
            if (!owner) {
                state.lastError = CHAT_SESSION_NOT_FOUND
                return false
            }

            // Crash reconciliation: the final assistant row is the receipt.
            // If it exists, no provider or tool call may happen again.
            const existing = await repository.listMessages(owner.id)
            if (existing.some((message) =>
                message.role === 'assistant'
                && message.metadata?.tool_authorization_checkpoint_id === input.checkpoint_id)) {
                return true
            }

            state.streamingSessionId = owner.id
            const handlers: TalosStreamHandlers = {
                onChunk: (text) => {
                    streamed += text
                    state.streamingText = streamed.includes('[TALOS_SAVE_LIBRARY')
                        ? stripLibrarySaveMarkers(streamed)
                        : streamed
                },
                onReasoning: (text) => {
                    reasoned += text
                    state.streamingReasoning = reasoned
                },
                onReasoningReset: () => {
                    reasoned = ''
                    state.streamingReasoning = null
                },
                signal: abort.signal,
            }
            const invocation: ChatCompletionInvocation<Runtime> = Object.freeze({
                identity: input.identity,
                runtime: input.runtime,
                continuation: Object.freeze({
                    checkpoint_id: input.checkpoint_id,
                    checkpoint: input.checkpoint,
                }),
            })
            const reply = await complete([], handlers, undefined, invocation)
            const rawThinking = reply.reasoning ?? (reasoned || undefined)
            const thinking = rawThinking ? capturedReasoning(rawThinking, translate) : undefined
            const assistantMetadata = {
                ...(reply.metadata ?? {}),
                tool_authorization_checkpoint_id: input.checkpoint_id,
                ...(reply.toolCalls?.length
                    ? { tool_calls: reply.toolCalls, finish_reason: reply.finishReason ?? null }
                    : {}),
                ...(thinking ? { reasoning: thinking } : {}),
                ...(reply.sources?.length ? { sources: reply.sources } : {}),
            }
            await appendDurable(
                owner.id,
                'assistant',
                reply.text,
                'persisted',
                input.identity.modelProfileId,
                assistantMetadata,
                reply.attachments,
            )
            return true
        } catch (error) {
            const aborted = error instanceof Error && error.name === 'AbortError'
            if (streamed || reasoned) {
                try {
                    await appendDurable(
                        input.identity.sessionId,
                        'assistant',
                        stripLibrarySaveMarkers(streamed),
                        'persisted',
                        input.identity.modelProfileId,
                        {
                            interrupted: true,
                            ...(reasoned
                                ? { reasoning: capturedReasoning(reasoned, translate) }
                                : {}),
                        },
                    )
                } catch (persistenceError) {
                    markPersistenceFailure(persistenceError)
                }
            }
            if (!aborted) {
                state.lastError = errorMessage(error, translate)
                try {
                    await appendDurable(
                        input.identity.sessionId,
                        'system',
                        state.lastError,
                        'failed',
                        input.identity.modelProfileId,
                        { chat_error: providerFault(error, input.identity.modelProfileId, translate) },
                    )
                } catch (persistenceError) {
                    markPersistenceFailure(persistenceError)
                }
            }
            return false
        } finally {
            state.streamingText = null
            state.streamingSessionId = null
            state.streamingReasoning = null
            if (activeStreamAbort === abort) activeStreamAbort = null
            state.sending = false
        }
    }

    async function drainContinuationQueue(): Promise<void> {
        if (drainingContinuations || state.sending) return
        drainingContinuations = true
        try {
            while (continuationQueue.length > 0 && !state.sending) {
                const queued = continuationQueue.shift()!
                queued.resolve(await runContinuation(queued.input))
            }
        } finally {
            drainingContinuations = false
            if (continuationQueue.length > 0 && !state.sending) {
                void drainContinuationQueue()
            }
        }
    }

    function continueFromCheckpoint(
        input: TalosChatContinuationInput<Runtime>,
    ): Promise<boolean> {
        if (
            !input.checkpoint_id
            || !input.identity.sessionId
            || !input.identity.sendId
            || input.checkpoint === null
            || typeof input.checkpoint !== 'object'
            || Array.isArray(input.checkpoint)
        ) {
            return Promise.resolve(false)
        }
        return new Promise<boolean>((resolve) => {
            continuationQueue.push({ input, resolve })
            void drainContinuationQueue()
        })
    }

    async function send(
        text: string,
        modelProfileId: string | null = null,
        metadata: Record<string, unknown> = {},
        attachments: readonly AppendChatAttachmentInput[] = [],
        onPersisted?: () => void,
        turnPolicy: TalosLibraryTurnOverride | null = null,
    ): Promise<boolean> {
        const trimmed = text.trim()
        if ((!trimmed && attachments.length === 0) || state.sending) return false
        if (state.persistenceStatus !== 'ready') {
            state.lastError = state.persistenceError ?? translate('chat.localStorageNotReady')
            return false
        }

        state.sending = true
        state.lastError = null
        const acceptedAt = new Date().toISOString()
        const abort = new AbortController()
        activeStreamAbort = abort
        const finishSend = (): void => {
            state.streamingText = null
            state.streamingSessionId = null
            state.streamingReasoning = null
            activeStreamAbort = null
            state.sending = false
            void drainContinuationQueue()
        }
        let session: TalosLocalChatSession
        let invocation: ChatCompletionInvocation<Runtime>
        try {
            session = await ensureActiveSession(trimmed || 'Shared files', modelProfileId)
        } catch (error) {
            markPersistenceFailure(error)
            finishSend()
            return false
        }

        let preparedMetadata = { ...metadata }
        try {
            const identity = createTalosChatSendIdentity({
                sendId: newTalosMobileId(),
                sessionId: session.id,
                sessionTitle: session.title,
                surface: session.surface,
                modelProfileId,
                acceptedAt,
            })
            let runtime = options.captureSendRuntime
                ? options.captureSendRuntime(identity, turnPolicy)
                : undefined as Runtime
            if (options.prepareSend) {
                const prepared = await options.prepareSend({
                    identity,
                    text: trimmed,
                    metadata: Object.freeze({ ...metadata }),
                    attachments: Object.freeze([...attachments]),
                    signal: abort.signal,
                    runtime,
                })
                runtime = prepared.runtime
                preparedMetadata = {
                    ...preparedMetadata,
                    ...(prepared.metadata ?? {}),
                }
            }
            if (abort.signal.aborted) {
                finishSend()
                return false
            }
            invocation = Object.freeze({ identity, runtime })
        } catch (error) {
            state.lastError = errorMessage(error, translate)
            finishSend()
            return false
        }

        try {
            await appendDurable(
                session.id,
                'user',
                trimmed,
                'persisted',
                modelProfileId,
                preparedMetadata,
                attachments,
            )
        } catch (error) {
            markPersistenceFailure(error)
            finishSend()
            return false
        }

        // From here the live reply BELONGS to this conversation. Switching chats
        // must not carry it across, and the previous behaviour did exactly that.
        state.streamingSessionId = session.id

        // The user turn is committed — let the composer clear NOW (text +
        // attachments) instead of lingering for the whole assistant stream.
        onPersisted?.()

        let turns: ChatTurn[]
        try {
            // Defect #4 follow-up (found while re-reviewing the six changes
            // together): the view is PAGED now, so building turns from it would
            // have silently truncated the model's memory to the last page on
            // any long conversation — the answer would get worse the longer you
            // had talked. The model's history is read in full, from the store.
            const history = await repository.listMessages(session.id)
            const withAttachments = new Set(await repository.listSessionAttachmentMessageIds(session.id))
            turns = await Promise.all(history
                .filter((message) => message.role === 'user' || message.role === 'assistant' || message.role === 'tool')
                .map(async (message) => {
                    const turn: ChatTurn = {
                        role: message.role as ChatTurn['role'],
                        content: message.content,
                    }
                    // Assistant attachments are durable visual results. Replaying
                    // them on every later request would silently grant ambient
                    // model access and repeatedly upload the same generated bytes.
                    if (message.role === 'user' && withAttachments.has(message.id)) {
                        if (!options.resolveMessageParts) {
                            throw new Error('TALOS_ATTACHMENT_RESOLVER_UNAVAILABLE')
                        }
                        const parts = await options.resolveMessageParts(message.id)
                        if (parts.length > 0) turn.parts = parts
                    }
                    return turn
                }))
        } catch (error) {
            state.lastError = errorMessage(error, translate)
            try {
                await appendDurable(session.id, 'system', state.lastError, 'failed', modelProfileId, {
                    chat_error: providerFault(error, modelProfileId, translate),
                })
            } catch (persistenceError) {
                markPersistenceFailure(persistenceError)
            }
            finishSend()
            return true
        }

        let streamed = ''
        let reasoned = ''
        try {
            const handlers: TalosStreamHandlers = {
                onChunk: (text) => {
                    streamed += text
                    // Security review: never render raw save-markers mid-stream.
                    // Round 3: stripping the WHOLE buffer on every chunk was O(n²)
                    // (measured 8.3s for a marker-heavy reply). Only pay for it once
                    // a marker character has actually appeared.
                    state.streamingText = streamed.includes('[TALOS_SAVE_LIBRARY')
                        ? stripLibrarySaveMarkers(streamed)
                        : streamed
                },
                onReasoning: (text) => {
                    reasoned += text
                    state.streamingReasoning = reasoned
                },
                onReasoningReset: () => {
                    reasoned = ''
                    state.streamingReasoning = null
                },
                signal: abort.signal,
            }
            const reply = options.captureSendRuntime || options.prepareSend
                ? await complete(turns, handlers, undefined, invocation)
                : await complete(turns, handlers)
            // Debt A1: the loop dispatches on finishReason. No tool is registered
            // yet, so 'tool_calls' cannot occur — but the turn is persisted with its
            // calls so the round-trip is durable the moment tools land, instead of
            // the send path being rewritten again.
            const rawThinking = reply.reasoning ?? (reasoned || undefined)
            const thinking = rawThinking ? capturedReasoning(rawThinking, translate) : undefined
            const assistantMetadata = {
                ...(reply.metadata ?? {}),
                ...(reply.toolCalls?.length
                    ? { tool_calls: reply.toolCalls, finish_reason: reply.finishReason ?? null }
                    : {}),
                // Defect #5: persisted, so it survives the session and reaches
                // the export — a reasoning trace you cannot revisit is a demo.
                ...(thinking ? { reasoning: thinking } : {}),
                // Persisted with the message: a citation that disappears on
                // reload is not a citation.
                ...(reply.sources?.length ? { sources: reply.sources } : {}),
            }
            await appendDurable(
                session.id,
                'assistant',
                reply.text,
                'persisted',
                modelProfileId,
                Object.keys(assistantMetadata).length ? assistantMetadata : undefined,
                reply.attachments,
            )
        } catch (error) {
            const aborted = error instanceof Error && error.name === 'AbortError'
            // A streamed partial is preserved honestly, never re-fetched or dropped.
            if (streamed || reasoned) {
                try {
                    // Sanitize at the PERSISTENCE boundary: an interrupted reply used
                    // to store raw markers, which then fed back as in-context examples.
                    await appendDurable(session.id, 'assistant', stripLibrarySaveMarkers(streamed), 'persisted', modelProfileId,
                        reasoned
                            // Stop after 30s of thinking and before the first
                            // token used to discard everything — exactly the
                            // case where the trace is the only artifact left.
                            ? { interrupted: true, reasoning: stripLibrarySaveMarkers(reasoned) }
                            : { interrupted: true })
                } catch (persistenceError) {
                    markPersistenceFailure(persistenceError)
                }
            }
            if (!aborted) {
                const providerError = talosTranslatableErrorMessage(error, translate)
                    ?? errorMessage(error, translate)
                state.lastError = providerError
                try {
                    await appendDurable(session.id, 'system', providerError, 'failed', modelProfileId, {
                        chat_error: providerFault(error, modelProfileId, translate),
                    })
                } catch (persistenceError) {
                    markPersistenceFailure(persistenceError)
                }
            }
        } finally {
            finishSend()
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
        loadOlderMessages,
        renameSession,
        deleteSession,
        setSessionArchived,
        setSessionLibraryContextPolicy,
        setSessionOrder,
        exportSnapshot,
        loadComposerDraft,
        saveComposerDraft,
        setActiveModelProfile,
        setSurface,
        recordBrowserActivity,
        send,
        continueFromCheckpoint,
    }
}
