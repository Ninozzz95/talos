// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import TalosMobileMessageActions from '@/components/chat/TalosMobileMessageActions.vue'
import type { TalosMobileMessageView } from '@/components/chat/mobileChatTypes'

function message(role: 'user' | 'assistant'): TalosMobileMessageView {
    return {
        id: `${role}-1`, role, content: 'content', state: 'persisted',
        created_at: '2026-07-22T12:00:00.000Z', model_profile_id: null,
        run_id: null, metadata: {},
    }
}

afterEach(() => { document.body.innerHTML = '' })

describe('TalosMobileMessageActions', () => {
    it('exposes direct copy/resend plus a Reka overflow reuse action for user messages', async () => {
        const wrapper = mount(TalosMobileMessageActions, {
            attachTo: document.body,
            props: { message: message('user'), busy: false, canRetry: false },
        })

        expect(wrapper.find('[aria-label="Copy message"]').exists()).toBe(true)
        expect(wrapper.find('[aria-label="Resend message"]').exists()).toBe(true)
        expect(wrapper.find('[aria-label="Retry assistant response"]').exists()).toBe(false)
        await wrapper.get('[aria-label="Copy message"]').trigger('click')
        await wrapper.get('[aria-label="Resend message"]').trigger('click')
        expect(wrapper.emitted('copy')).toEqual([[expect.objectContaining({ id: 'user-1' })]])
        expect(wrapper.emitted('resend')).toEqual([[expect.objectContaining({ id: 'user-1' })]])

        await vi.waitFor(() => {
            expect(wrapper.find('[aria-label="More message actions"]').exists()).toBe(true)
        })
        await wrapper.get('[aria-label="More message actions"]').trigger('click')
        await flushPromises()
        const reuse = document.body.querySelector<HTMLElement>('[role="menuitem"][aria-label="Reuse prompt"]')
        expect(reuse).not.toBeNull()
        reuse!.click()
        await flushPromises()
        expect(wrapper.emitted('reuse')).toEqual([[expect.objectContaining({ id: 'user-1' })]])
    })

    it('exposes copy and retry only for assistant messages and honours busy state', () => {
        const wrapper = mount(TalosMobileMessageActions, {
            props: { message: message('assistant'), busy: true, canRetry: true },
        })
        expect(wrapper.find('[aria-label="Copy message"]').exists()).toBe(true)
        expect(wrapper.get('[aria-label="Retry assistant response"]').attributes('disabled')).toBeDefined()
        expect(wrapper.find('[aria-label="Resend message"]').exists()).toBe(false)
        expect(wrapper.find('[aria-label="More message actions"]').exists()).toBe(false)
    })
})

/**
 * ⛔ OGNI comando della riga ha un nome, e il gruppo che li contiene pure.
 *
 * Dal dump di `uiautomator` sul Pad, sotto una risposta dell'assistente, si
 * leggevano solo Copia / Riprova / Salva: il comando «ascolta» (TTS) non
 * portava nome. Un pulsante senza nome accessibile, su Android, è un quadrato
 * che si può premere e non si può capire.
 *
 * E il contenitore aveva lo stesso difetto in forma peggiore: `aria-label` su
 * un `<div>` senza `role` è PROIBITO dalla specifica — il ruolo implicito è
 * `generic`, che non supporta il nome — quindi l'etichetta era scritta e
 * scartata in silenzio (MDN, *ARIA: generic role*, letto 12/09/2026).
 *
 * Il test non elenca i pulsanti uno per uno di proposito: guarda TUTTI quelli
 * che ci sono. Un elenco a mano resta verde il giorno che se ne aggiunge uno
 * senza etichetta, che è esattamente come è successo.
 */
describe('accessibilità della riga di azioni', () => {
    it.each(['assistant', 'user'] as const)('ogni pulsante della riga (%s) ha un nome', (role) => {
        const wrapper = mount(TalosMobileMessageActions, {
            props: { message: message(role), busy: false, canRetry: true },
        })

        const gruppo = wrapper.get('[role="group"]')
        expect(gruppo.attributes('aria-label')).toBeTruthy()

        const pulsanti = wrapper.findAll('button')
        expect(pulsanti.length).toBeGreaterThan(0)
        for (const pulsante of pulsanti) {
            const nome = pulsante.attributes('aria-label')
            expect(nome, `pulsante senza aria-label: ${pulsante.html().slice(0, 120)}`).toBeTruthy()
            expect(nome?.trim()).not.toBe('')
            // ⛔ E il nome è una parola per una persona, non una chiave i18n
            // sfuggita alla traduzione.
            expect(nome).not.toMatch(/^[a-z]+\.[A-Za-z]+$/)
        }
    })

    it('il comando «ascolta» esiste sotto ogni risposta e si annuncia', () => {
        const wrapper = mount(TalosMobileMessageActions, {
            props: { message: message('assistant'), busy: false, canRetry: false },
        })
        const ascolta = wrapper.get('[data-testid="talos-message-speak"]')
        expect(ascolta.attributes('aria-label')).toBe('Speak message')
        expect(ascolta.attributes('aria-pressed')).toBe('false')
    })

    /** AL CONTRARIO: sul messaggio della persona non c'è niente da leggere. */
    it('e NON compare sul messaggio della persona', () => {
        const wrapper = mount(TalosMobileMessageActions, {
            props: { message: message('user'), busy: false, canRetry: false },
        })
        expect(wrapper.find('[data-testid="talos-message-speak"]').exists()).toBe(false)
    })
})
