import { describe, expect, it } from 'vitest'
import { talosComposerBusy } from '@/lib/chat/composerBusy'

/**
 * Owner 2026-08-03: «faccio partire una chat … e poi mentre sta stampando
 * l'output inizio una nuova chat: nella nuova chat il pulsante send diventa il
 * pulsante stop finché il modello dell'altra chat non finisce di parlare».
 *
 * The button was the mild symptom. The two that matter: the new chat refused to
 * send at all, silently, and that Stop button called the GLOBAL stop — killing
 * the answer in the conversation the person was not looking at.
 */
describe('whose generation the composer is looking at', () => {
    it('is idle when nothing is generating anywhere', () => {
        expect(talosComposerBusy(false, null, 'chat-1')).toBe('idle')
        // Even with a stale owner id left behind: `sending` is the fact.
        expect(talosComposerBusy(false, 'chat-2', 'chat-1')).toBe('idle')
    })

    it('belongs to this chat when this chat is the one generating', () => {
        expect(talosComposerBusy(true, 'chat-1', 'chat-1')).toBe('this-chat')
    })

    it('does NOT offer Stop for another chat’s answer', () => {
        // The whole defect in one line: pressing Stop here used to kill chat-2.
        expect(talosComposerBusy(true, 'chat-2', 'chat-1')).toBe('other-chat')
    })

    it('keeps a brand-new conversation as its own, before it has an id', () => {
        // A send whose session is not written yet was started from the chat you
        // are on. Calling it 'other-chat' would print «I am answering somewhere
        // else» on the very chat that is answering.
        expect(talosComposerBusy(true, null, null)).toBe('this-chat')
        expect(talosComposerBusy(true, null, 'chat-1')).toBe('this-chat')
    })

    it('treats a chat you have left as another chat', () => {
        // Started in chat-1, then the person moved to the empty composer of a
        // conversation that does not exist yet.
        expect(talosComposerBusy(true, 'chat-1', null)).toBe('other-chat')
    })
})
