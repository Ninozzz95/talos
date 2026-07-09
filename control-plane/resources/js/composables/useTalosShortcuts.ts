import { onBeforeUnmount, onMounted, type ComputedRef } from 'vue'
import {
    isTypingTarget,
    shortcutFromKeyboardEvent,
    type TalosShortcutActionId,
} from '../lib/talosShortcuts'

export type TalosShortcutHandlers = Partial<Record<TalosShortcutActionId, (event: KeyboardEvent) => void>>

export function useTalosShortcuts(
    shortcuts: ComputedRef<Record<TalosShortcutActionId, string>>,
    handlers: TalosShortcutHandlers,
) {
    function handleShortcut(event: KeyboardEvent) {
        const binding = shortcutFromKeyboardEvent(event)
        if (!binding) {
            return
        }

        const action = Object.entries(shortcuts.value)
            .find(([, candidate]) => candidate && candidate.toLowerCase() === binding.toLowerCase())?.[0] as TalosShortcutActionId | undefined

        if (!action) {
            return
        }

        const allowWhileTyping = action === 'cancel_close'
            || action === 'focus_chat_input'
            || action === 'search_conversations'
        if (!allowWhileTyping && isTypingTarget(event.target)) {
            return
        }

        const handler = handlers[action]
        if (!handler) {
            return
        }

        event.preventDefault()
        handler(event)
    }

    onMounted(() => {
        window.addEventListener('keydown', handleShortcut)
    })

    onBeforeUnmount(() => {
        window.removeEventListener('keydown', handleShortcut)
    })

    return {
        handleShortcut,
    }
}
