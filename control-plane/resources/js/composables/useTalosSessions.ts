import { computed, ref } from 'vue'
import { talosFetch } from '../lib/api'
import type { TalosMessage, TalosMessageRole, TalosSession } from '../lib/talosTypes'

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

function sessionMessagesEndpoint(sessionId: string) {
    return `/api/talos/sessions/${sessionId}/messages`
}

export function useTalosSessions() {
    const sessions = ref<TalosSession[]>([])
    const activeSession = ref<TalosSession | null>(null)
    const messages = ref<TalosMessage[]>([])
    const loadingSessions = ref(false)
    const loadingMessages = ref(false)
    const sessionError = ref<string | null>(null)
    const messageError = ref<string | null>(null)

    const hasSessions = computed(() => sessions.value.length > 0)

    function upsertSession(session: TalosSession) {
        const index = sessions.value.findIndex((item) => item.id === session.id)

        if (index >= 0) {
            sessions.value.splice(index, 1, session)
        } else {
            sessions.value.unshift(session)
        }
    }

    async function loadSessions() {
        loadingSessions.value = true
        sessionError.value = null

        try {
            const response = await talosFetch<ApiEnvelope<TalosSession[]>>('/api/talos/sessions')
            sessions.value = response.data
            return response.data
        } catch (error) {
            sessionError.value = error instanceof Error ? error.message : 'TALOS could not load chat sessions.'
            throw error
        } finally {
            loadingSessions.value = false
        }
    }

    async function createSession(title = 'New chat') {
        sessionError.value = null

        try {
            const response = await talosFetch<ApiEnvelope<TalosSession>>('/api/talos/sessions', {
                method: 'POST',
                body: JSON.stringify({
                    title,
                    mode: 'verified_execution',
                    metadata: {
                        surface: 'chat',
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

    function replaceMessages(nextMessages: TalosMessage[]) {
        messages.value = nextMessages
    }

    return {
        sessions,
        activeSession,
        messages,
        loadingSessions,
        loadingMessages,
        sessionError,
        messageError,
        hasSessions,
        loadSessions,
        createSession,
        updateSessionTitle,
        selectSession,
        loadMessages,
        createMessage,
        replaceMessages,
    }
}
