/**
 * Whose generation is the composer looking at.
 *
 * Owner 2026-08-03: «faccio partire una chat … e poi mentre sta stampando
 * l'output inizio una nuova chat: nella nuova chat il pulsante send diventa il
 * pulsante stop finché il modello dell'altra chat non finisce di parlare».
 *
 * The button was the mild symptom. `state.sending` is ONE boolean for the whole
 * application, so every composer showed the state of whatever was generating
 * anywhere — and the two real consequences were worse than a wrong icon:
 *
 * - the new chat refused to send at all, silently, because `send()` opens with
 *   `if (… || state.sending) return false`;
 * - that Stop button called `stopStreaming()`, which is global — pressing Stop
 *   in a chat where nothing was happening killed the answer in the other one.
 *   A control that acts on something you are not looking at.
 *
 * The store already knew which session was generating. Nothing asked it.
 */
export type TalosComposerBusy =
    /** Nothing is generating anywhere. */
    | 'idle'
    /** THIS chat is generating: Stop belongs here, and stops this. */
    | 'this-chat'
    /** Another chat is generating: this composer must say so, not offer Stop. */
    | 'other-chat'

export function talosComposerBusy(
    sending: boolean,
    sendingSessionId: string | null,
    activeSessionId: string | null,
): TalosComposerBusy {
    if (!sending) return 'idle'
    /**
     * A send whose session is not resolved yet was started from the chat you
     * are on — a brand-new conversation has no id until it is written. Calling
     * that 'other-chat' would print «I am answering somewhere else» on the very
     * chat that is answering.
     */
    if (sendingSessionId === null) return 'this-chat'
    return sendingSessionId === activeSessionId ? 'this-chat' : 'other-chat'
}
