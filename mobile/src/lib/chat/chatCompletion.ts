/**
 * Resolves a chat send into a concrete provider call: takes the currently selected
 * model profile + its key (from the keystore) + effort/thinking, and routes to the
 * right device-side client. Anthropic is wired for the MVP; other providers surface a
 * clear "not available yet" error until their adapter lands.
 */
import { sendAnthropicChat, type HttpTransport } from '@/lib/chat/anthropicClient'
import type { ChatCompletion, ChatTurn } from '@/stores/chat'
import type { TalosMobileModelProfileView } from '@/components/chat/mobileChatTypes'

export class ChatConfigError extends Error {
    constructor(message: string) {
        super(message)
        this.name = 'ChatConfigError'
    }
}

export interface CompletionContext {
    profile: TalosMobileModelProfileView | null
    apiKey: string | null
    effort: string
    thinking: boolean
    system?: string
}

export function buildChatCompletion(
    getContext: () => CompletionContext,
    transport?: HttpTransport,
): ChatCompletion {
    return async (turns: ChatTurn[]): Promise<string> => {
        const context = getContext()
        if (!context.profile) {
            throw new ChatConfigError('Select a model before sending.')
        }
        if (!context.apiKey) {
            throw new ChatConfigError(`Add your ${context.profile.provider} API key in Settings to start chatting.`)
        }
        if (context.profile.provider === 'anthropic') {
            return sendAnthropicChat(
                context.apiKey,
                {
                    model: context.profile.model,
                    turns,
                    system: context.system,
                    effort: context.effort,
                    thinking: context.thinking,
                },
                transport,
            )
        }
        throw new ChatConfigError(`The ${context.profile.provider} provider is not available on mobile yet.`)
    }
}
