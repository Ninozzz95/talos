/**
 * Local-first chat store: holds the conversation and drives a single send at a time
 * through an injected `completion` (which resolves the selected model + key + provider
 * client). The store is framework state only — no provider/HTTP/secret logic lives here,
 * so it is fully unit-testable with a mock completion.
 */
import { reactive, readonly } from 'vue'
import type {
    TalosMobileMessageRole,
    TalosMobileMessageState,
    TalosMobileMessageView,
} from '@/components/chat/mobileChatTypes'

export interface ChatTurn {
    role: 'user' | 'assistant'
    content: string
}

/** Given the running conversation turns, resolve the assistant reply text (or throw). */
export type ChatCompletion = (turns: ChatTurn[]) => Promise<string>

export interface ChatState {
    sending: boolean
    lastError: string | null
}

export interface ChatStore {
    readonly messages: readonly TalosMobileMessageView[]
    readonly state: Readonly<ChatState>
    send(text: string): Promise<void>
    reset(): void
}

let globalSeq = 0
function defaultMakeId(): string {
    globalSeq += 1
    return `talos-msg-${globalSeq}`
}

export function createChatStore(complete: ChatCompletion, makeId: () => string = defaultMakeId): ChatStore {
    const messages = reactive<TalosMobileMessageView[]>([])
    const state = reactive<ChatState>({ sending: false, lastError: null })

    function append(role: TalosMobileMessageRole, content: string, msgState: TalosMobileMessageState): void {
        messages.push({
            id: makeId(),
            role,
            content,
            created_at: new Date().toISOString(),
            state: msgState,
        })
    }

    async function send(text: string): Promise<void> {
        const trimmed = text.trim()
        if (trimmed === '' || state.sending) return
        state.lastError = null
        append('user', trimmed, 'persisted')

        const turns: ChatTurn[] = messages
            .filter((message) => message.role === 'user' || message.role === 'assistant')
            .map((message) => ({ role: message.role as 'user' | 'assistant', content: message.content }))

        state.sending = true
        try {
            const reply = await complete(turns)
            append('assistant', reply, 'persisted')
        } catch (error) {
            const message = error instanceof Error && error.message ? error.message : 'The request failed.'
            state.lastError = message
            append('system', message, 'failed')
        } finally {
            state.sending = false
        }
    }

    function reset(): void {
        messages.splice(0, messages.length)
        state.sending = false
        state.lastError = null
    }

    return {
        messages: readonly(messages),
        state: readonly(state),
        send,
        reset,
    }
}
