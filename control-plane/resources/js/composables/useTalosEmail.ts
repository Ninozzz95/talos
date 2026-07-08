import { ref } from 'vue'
import { talosFetch } from '../lib/api'
import type { TalosEmailConnectorStatus, TalosEmailContext, TalosEmailDraft, TalosEmailMessage } from '../lib/talosTypes'

type ApiEnvelope<T> = {
    data: T
}

export type TalosCreateEmailDraftInput = {
    message_ids?: string[]
    to: string[]
    cc?: string[]
    subject: string
    body: string
    metadata?: Record<string, unknown> | null
}

export function useTalosEmail() {
    const connectorStatus = ref<TalosEmailConnectorStatus | null>(null)
    const messages = ref<TalosEmailMessage[]>([])
    const messageContext = ref<TalosEmailContext | null>(null)
    const drafts = ref<TalosEmailDraft[]>([])
    const loadingConnectorStatus = ref(false)
    const loadingMessages = ref(false)
    const loadingDrafts = ref(false)
    const loadingMessageContext = ref(false)
    const creatingDraft = ref(false)
    const sendingDraftId = ref<string | null>(null)
    const emailError = ref<string | null>(null)

    async function loadConnectorStatus() {
        loadingConnectorStatus.value = true
        emailError.value = null

        try {
            const response = await talosFetch<ApiEnvelope<TalosEmailConnectorStatus>>('/api/talos/email/connector-status')
            connectorStatus.value = response.data
            return response.data
        } catch (error) {
            emailError.value = error instanceof Error ? error.message : 'TALOS could not load email connector status.'
            throw error
        } finally {
            loadingConnectorStatus.value = false
        }
    }

    async function loadMessages() {
        loadingMessages.value = true
        emailError.value = null

        try {
            const response = await talosFetch<ApiEnvelope<TalosEmailMessage[]>>('/api/talos/email/messages')
            messages.value = response.data
            return response.data
        } catch (error) {
            emailError.value = error instanceof Error ? error.message : 'TALOS could not load email messages.'
            throw error
        } finally {
            loadingMessages.value = false
        }
    }

    async function loadMessageContext(messageIds: string[]) {
        loadingMessageContext.value = true
        emailError.value = null
        const params = new URLSearchParams()
        for (const messageId of messageIds) {
            params.append('message_ids[]', messageId)
        }

        try {
            const response = await talosFetch<TalosEmailContext>(`/api/talos/email/messages/context?${params.toString()}`)
            messageContext.value = response
            return response
        } catch (error) {
            emailError.value = error instanceof Error ? error.message : 'TALOS could not load email context.'
            throw error
        } finally {
            loadingMessageContext.value = false
        }
    }

    async function loadDrafts() {
        loadingDrafts.value = true
        emailError.value = null

        try {
            const response = await talosFetch<ApiEnvelope<TalosEmailDraft[]>>('/api/talos/email/drafts')
            drafts.value = response.data
            return response.data
        } catch (error) {
            emailError.value = error instanceof Error ? error.message : 'TALOS could not load email drafts.'
            throw error
        } finally {
            loadingDrafts.value = false
        }
    }

    async function createDraft(input: TalosCreateEmailDraftInput) {
        creatingDraft.value = true
        emailError.value = null

        try {
            const response = await talosFetch<ApiEnvelope<TalosEmailDraft>>('/api/talos/email/drafts', {
                method: 'POST',
                body: JSON.stringify(input),
                validationMessage: 'TALOS rejected this email draft.',
            })
            drafts.value = [response.data, ...drafts.value.filter((draft) => draft.id !== response.data.id)]
            return response.data
        } catch (error) {
            emailError.value = error instanceof Error ? error.message : 'TALOS could not create this email draft.'
            throw error
        } finally {
            creatingDraft.value = false
        }
    }

    async function sendDraft(draftId: string) {
        sendingDraftId.value = draftId
        emailError.value = null

        try {
            return await talosFetch<{ error?: string, send_enabled?: boolean, draft_id?: string }>(`/api/talos/email/drafts/${draftId}/send`, {
                method: 'POST',
            })
        } catch (error) {
            emailError.value = error instanceof Error ? error.message : 'EMAIL_SEND_DISABLED'
            throw error
        } finally {
            sendingDraftId.value = null
        }
    }

    return {
        connectorStatus,
        messages,
        messageContext,
        drafts,
        loadingConnectorStatus,
        loadingMessages,
        loadingDrafts,
        loadingMessageContext,
        creatingDraft,
        sendingDraftId,
        emailError,
        loadConnectorStatus,
        loadMessages,
        loadMessageContext,
        loadDrafts,
        createDraft,
        sendDraft,
    }
}
