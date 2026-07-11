import { computed, ref } from 'vue'
import { talosFetch } from '../lib/api'
import type { TalosMessage, TalosMessageRole, TalosSession, TalosSessionExportFormat, TalosSessionExportPayload, TalosSessionSurface } from '../lib/talosTypes'

type ApiEnvelope<T> = {
    data: T
}

export type CreateTalosMessagePayload = {
    role: TalosMessageRole
    content: string
    model_profile_id?: string | null
    run_id?: string | null
    metadata?: Record<string, unknown>
}

export type TalosSessionPersistenceMode = 'persistent' | 'temporary'

export type TalosSessionChatState = {
    favorite: boolean
    archived: boolean
    selected: boolean
    folder: string
    browse_enabled: boolean
    copied_from_session_id?: string
}

function sessionMessagesEndpoint(sessionId: string) {
    return `/api/talos/sessions/${sessionId}/messages`
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function asString(value: unknown) {
    return typeof value === 'string' ? value.trim() : ''
}

export function sessionChatState(session: TalosSession): TalosSessionChatState {
    const metadata = isRecord(session.metadata) ? session.metadata : {}
    const chatState = isRecord(metadata.chat_state) ? metadata.chat_state : {}
    const copiedFromSessionId = asString(chatState.copied_from_session_id)

    return {
        favorite: chatState.favorite === true,
        archived: chatState.archived === true,
        selected: chatState.selected === true,
        folder: asString(chatState.folder),
        browse_enabled: chatState.browse_enabled === true,
        ...(copiedFromSessionId ? { copied_from_session_id: copiedFromSessionId } : {}),
    }
}

export function useTalosSessions(surface: TalosSessionSurface = 'chat') {
    const sessions = ref<TalosSession[]>([])
    const activeSession = ref<TalosSession | null>(null)
    const messages = ref<TalosMessage[]>([])
    const loadingSessions = ref(false)
    const loadingMessages = ref(false)
    const exportingSession = ref(false)
    const sessionError = ref<string | null>(null)
    const messageError = ref<string | null>(null)
    const sessionExportError = ref<string | null>(null)

    const hasSessions = computed(() => sessions.value.length > 0)

    function upsertSession(session: TalosSession) {
        const index = sessions.value.findIndex((item) => item.id === session.id)

        if (index >= 0) {
            sessions.value.splice(index, 1, session)
        } else {
            sessions.value.unshift(session)
        }
    }

    function findSession(sessionId: string) {
        return sessions.value.find((session) => session.id === sessionId) ?? null
    }

    function mergedSessionMetadata(sessionId: string, patch: Record<string, unknown>) {
        const session = findSession(sessionId)
        const currentMetadata = isRecord(session?.metadata) ? session.metadata : {}
        const currentChatState = isRecord(currentMetadata.chat_state) ? currentMetadata.chat_state : {}
        const nextChatState = isRecord(patch.chat_state)
            ? {
                ...currentChatState,
                ...patch.chat_state,
            }
            : currentChatState

        return {
            ...currentMetadata,
            ...patch,
            ...(isRecord(patch.chat_state) ? { chat_state: nextChatState } : {}),
        }
    }

    async function loadSessions() {
        loadingSessions.value = true
        sessionError.value = null

        try {
            const response = await talosFetch<ApiEnvelope<TalosSession[]>>(`/api/talos/sessions?${new URLSearchParams({ surface }).toString()}`)
            sessions.value = response.data
            return response.data
        } catch (error) {
            sessionError.value = error instanceof Error ? error.message : 'TALOS could not load chat sessions.'
            throw error
        } finally {
            loadingSessions.value = false
        }
    }

    async function createSession(title = 'New chat', persistenceMode: TalosSessionPersistenceMode = 'persistent') {
        sessionError.value = null

        try {
            const response = await talosFetch<ApiEnvelope<TalosSession>>('/api/talos/sessions', {
                method: 'POST',
                body: JSON.stringify({
                    title,
                    mode: 'verified_execution',
                    persistence_mode: persistenceMode,
                    surface,
                    metadata: {
                        surface,
                    },
                }),
            })

            upsertSession(response.data)
            activeSession.value = response.data
            messages.value = []

            return response.data
        } catch (error) {
            sessionError.value = error instanceof Error ? error.message : 'TALOS could not create a chat session.'
            throw error
        }
    }

    async function updateSessionTitle(sessionId: string, title: string) {
        const response = await talosFetch<ApiEnvelope<TalosSession>>(`/api/talos/sessions/${sessionId}`, {
            method: 'PATCH',
            body: JSON.stringify({ title }),
        })

        upsertSession(response.data)

        if (activeSession.value?.id === response.data.id) {
            activeSession.value = response.data
        }

        return response.data
    }

    async function updateSessionMetadata(sessionId: string, metadataPatch: Record<string, unknown>) {
        const response = await talosFetch<ApiEnvelope<TalosSession>>(`/api/talos/sessions/${sessionId}`, {
            method: 'PATCH',
            body: JSON.stringify({
                metadata: mergedSessionMetadata(sessionId, metadataPatch),
            }),
        })

        upsertSession(response.data)

        if (activeSession.value?.id === response.data.id) {
            activeSession.value = response.data
        }

        return response.data
    }

    async function toggleSessionFavorite(session: TalosSession) {
        const current = sessionChatState(session)

        return updateSessionMetadata(session.id, {
            chat_state: {
                ...current,
                favorite: !current.favorite,
            },
        })
    }

    async function toggleManagedSessionSelected(session: TalosSession) {
        const current = sessionChatState(session)

        return updateSessionMetadata(session.id, {
            chat_state: {
                ...current,
                selected: !current.selected,
            },
        })
    }

    async function archiveSession(session: TalosSession) {
        const current = sessionChatState(session)

        return updateSessionMetadata(session.id, {
            chat_state: {
                ...current,
                archived: true,
            },
        })
    }

    async function moveSessionToFolder(session: TalosSession, folder: string) {
        const current = sessionChatState(session)

        return updateSessionMetadata(session.id, {
            chat_state: {
                ...current,
                archived: false,
                folder: folder.trim(),
            },
        })
    }

    async function deleteSession(sessionId: string) {
        await talosFetch<void>(`/api/talos/sessions/${sessionId}`, {
            method: 'DELETE',
        })

        const wasActive = activeSession.value?.id === sessionId
        sessions.value = sessions.value.filter((session) => session.id !== sessionId)

        if (!wasActive) {
            return
        }

        const nextSession = sessions.value[0] ?? null
        activeSession.value = nextSession

        if (nextSession) {
            await loadMessages(nextSession.id)
        } else {
            messages.value = []
        }
    }

    async function copySession(session: TalosSession) {
        const state = sessionChatState(session)
        const sourceMessages = await talosFetch<ApiEnvelope<TalosMessage[]>>(sessionMessagesEndpoint(session.id))
        const response = await talosFetch<ApiEnvelope<TalosSession>>('/api/talos/sessions', {
            method: 'POST',
            body: JSON.stringify({
                title: `${session.title || 'Untitled chat'} copy`,
                mode: session.mode,
                persistence_mode: session.persistence_mode ?? 'persistent',
                surface,
                active_model_profile_id: session.active_model_profile_id ?? null,
                metadata: {
                    surface,
                    chat_state: {
                        favorite: false,
                        archived: false,
                        selected: false,
                        folder: state.folder,
                        copied_from_session_id: session.id,
                    },
                },
            }),
        })

        for (const sourceMessage of sourceMessages.data) {
            await talosFetch<ApiEnvelope<TalosMessage>>(sessionMessagesEndpoint(response.data.id), {
                method: 'POST',
                body: JSON.stringify({
                    role: sourceMessage.role,
                    content: sourceMessage.content,
                    model_profile_id: sourceMessage.model_profile_id ?? null,
                    metadata: {
                        ...(isRecord(sourceMessage.metadata) ? sourceMessage.metadata : {}),
                        source: 'talos_chat_copy',
                        copied_from_session_id: session.id,
                        copied_from_message_id: sourceMessage.id,
                        ...(sourceMessage.run_id ? { copied_from_run_id: sourceMessage.run_id } : {}),
                    },
                }),
            })
        }

        upsertSession(response.data)

        return response.data
    }

    async function loadMessages(sessionId: string) {
        loadingMessages.value = true
        messageError.value = null

        try {
            const response = await talosFetch<ApiEnvelope<TalosMessage[]>>(sessionMessagesEndpoint(sessionId))
            messages.value = response.data
            return response.data
        } catch (error) {
            messageError.value = error instanceof Error ? error.message : 'TALOS could not load chat messages.'
            throw error
        } finally {
            loadingMessages.value = false
        }
    }

    async function selectSession(session: TalosSession) {
        activeSession.value = session
        await loadMessages(session.id)
    }

    async function createMessage(sessionId: string, payload: CreateTalosMessagePayload) {
        messageError.value = null

        try {
            const response = await talosFetch<ApiEnvelope<TalosMessage>>(sessionMessagesEndpoint(sessionId), {
                method: 'POST',
                body: JSON.stringify(payload),
            })

            if (activeSession.value?.id === sessionId) {
                messages.value.push(response.data)
            }

            return response.data
        } catch (error) {
            messageError.value = error instanceof Error ? error.message : 'TALOS could not persist the chat message.'
            throw error
        }
    }

    async function exportSession(sessionId: string, format: TalosSessionExportFormat = 'json') {
        exportingSession.value = true
        sessionExportError.value = null

        try {
            const params = new URLSearchParams({ format })
            return await talosFetch<TalosSessionExportPayload>(`/api/talos/sessions/${sessionId}/export?${params.toString()}`, {
                validationMessage: 'TALOS could not export this session.',
            })
        } catch (error) {
            sessionExportError.value = error instanceof Error ? error.message : 'TALOS could not export this session.'
            throw error
        } finally {
            exportingSession.value = false
        }
    }

    function replaceMessages(nextMessages: TalosMessage[]) {
        messages.value = nextMessages
    }

    return {
        sessions,
        activeSession,
        messages,
        loadingSessions,
        loadingMessages,
        exportingSession,
        sessionError,
        messageError,
        sessionExportError,
        hasSessions,
        loadSessions,
        createSession,
        updateSessionTitle,
        updateSessionMetadata,
        toggleSessionFavorite,
        toggleManagedSessionSelected,
        archiveSession,
        moveSessionToFolder,
        deleteSession,
        copySession,
        selectSession,
        loadMessages,
        createMessage,
        exportSession,
        replaceMessages,
    }
}
