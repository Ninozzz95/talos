import { describe, expect, it } from 'vitest'
import { TALOS_EN_MESSAGES } from '@/i18n/locales/en'
import { TALOS_IT_MESSAGES } from '@/i18n/locales/it'

/**
 * ⭐ NOMI-OPZIONI-01 (e2e `mobile-f4-regressions` #22, 25/09/2026): il pulsante Opzioni dell'elenco delle chat (A3-84) si
 * chiamava «Chat options», come il menu ⋯ della chat aperta. Due controlli diversi con lo stesso nome accessibile: il
 * test del browser ne trovava due, e chi usa un lettore di schermo non li distingue. I due nomi restano diversi in ogni
 * lingua.
 */
describe('NOMI-OPZIONI-01: le opzioni dell’elenco non si chiamano come il menu della chat', () => {
    it.each([
        ['en', TALOS_EN_MESSAGES],
        ['it', TALOS_IT_MESSAGES],
    ] as const)('%s: «opzioni dell’elenco» ≠ «opzioni della chat»', (_lingua, messaggi) => {
        expect(messaggi.chats.options).not.toBe(messaggi.chat.chatOptions)
        expect(messaggi.chats.optionsActive.startsWith(messaggi.chat.chatOptions + ',')).toBe(false)
    })
})
