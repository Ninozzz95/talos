// @vitest-environment jsdom

import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import TalosMobileStatusMessage from '@/components/chat/TalosMobileStatusMessage.vue'
import type { TalosMobileMessageView } from '@/components/chat/mobileChatTypes'

function message(metadata: Record<string, unknown> = {}): TalosMobileMessageView {
    return {
        id: 'system-1',
        role: 'system',
        content: 'Provider failed.',
        created_at: '2026-07-22T12:00:00.000Z',
        state: 'failed',
        model_profile_id: 'deepseek:deepseek-chat',
        run_id: null,
        metadata,
    }
}

describe('TalosMobileStatusMessage', () => {
    it('renders an actionable controlled fault from persisted metadata', () => {
        const wrapper = mount(TalosMobileStatusMessage, {
            props: {
                message: message({ chat_error: {
                    layer: 'provider',
                    code: 'PROVIDER_HTTP_429',
                    message: 'Rate limit exceeded.',
                    next_action: 'Wait, then retry.',
                    retryable: true,
                    status: 429,
                    provider: 'deepseek',
                    model: 'deepseek-chat',
                } }),
            },
        })

        const alert = wrapper.get('[data-testid="talos-mobile-controlled-fault"]')
        expect(alert.attributes('role')).toBe('alert')
        expect(alert.attributes('data-fault-code')).toBe('PROVIDER_HTTP_429')
        expect(alert.text()).toContain('Provider failure')
        expect(alert.text()).toContain('Wait, then retry.')
        expect(alert.text()).toContain('deepseek / deepseek-chat')
        expect(alert.text()).toContain('HTTP 429')
        expect(alert.text()).toContain('Retry available')
    })

    /**
     * §40 del ledger del motore locale, dal Pad dell'owner: al posto della
     * risposta, `TALOS_LLAMA_NO_CHAT_TEMPLATE` nello slot della frase e
     * «controlla la connessione» detto a proposito di un modello LOCALE, che la
     * rete non la usa. Il codice non si butta: scende in piccolo fra i dati
     * della diagnostica.
     */
    it('§40 — never prints an internal code where the sentence goes', () => {
        const wrapper = mount(TalosMobileStatusMessage, {
            props: {
                message: message({ chat_error: {
                    layer: 'system',
                    code: 'CHAT_EXECUTION_FAILED',
                    message: 'TALOS_LLAMA_NO_CHAT_TEMPLATE',
                    next_action: 'Check the selected model and connection, then retry.',
                    retryable: null,
                    status: null,
                    provider: 'local',
                    model: '/storage/emulated/0/models/talos-prova-gemma.gguf',
                } }),
            },
        })

        const body = wrapper.get('[data-testid="talos-mobile-fault-message"]').text()
        expect(body).not.toContain('TALOS_LLAMA_NO_CHAT_TEMPLATE')
        expect(body).toContain('does not carry the instructions')

        const next = wrapper.get('[data-testid="talos-mobile-fault-next"]').text()
        expect(next).not.toContain('connection')
        expect(next).toContain('local model')

        // The code survives where it belongs: small, monospace, diagnostic.
        expect(wrapper.get('[data-testid="talos-mobile-fault-diagnostic"]').text())
            .toBe('TALOS_LLAMA_NO_CHAT_TEMPLATE')
        // And the envelope code chip is untouched.
        expect(wrapper.get('[data-testid="talos-mobile-controlled-fault"]')
            .attributes('data-fault-code')).toBe('CHAT_EXECUTION_FAILED')
        // Pad 12/09/2026: the footer read «local / /storage/…/talos-prova-gemma.gguf».
        // A local model is named like in the picker, and the path stays off screen.
        const footer = wrapper.text()
        expect(footer).toContain('On this device / talos-prova-gemma')
        expect(footer).not.toContain('/storage/')
    })

    /** AL CONTRARIO: a human sentence is shown exactly as written, no diagnostic chip. */
    it('leaves an already-human provider message alone', () => {
        const wrapper = mount(TalosMobileStatusMessage, {
            props: {
                message: message({ chat_error: {
                    layer: 'provider',
                    code: 'PROVIDER_HTTP_401',
                    message: 'Incorrect API key provided.',
                    next_action: 'Update the provider credential in Settings, then retry.',
                    retryable: false,
                    status: 401,
                    provider: 'openrouter',
                    model: 'z-ai/glm-5.3-flash',
                } }),
            },
        })

        expect(wrapper.get('[data-testid="talos-mobile-fault-message"]').text())
            .toBe('Incorrect API key provided.')
        expect(wrapper.find('[data-testid="talos-mobile-fault-diagnostic"]').exists()).toBe(false)
        expect(wrapper.text()).toContain('PROVIDER_HTTP_401')
    })

    it('renders malformed or ordinary system rows as a neutral status notice', () => {
        const wrapper = mount(TalosMobileStatusMessage, { props: { message: message() } })
        expect(wrapper.get('[role="status"]').text()).toContain('Provider failed.')
        expect(wrapper.find('[role="alert"]').exists()).toBe(false)
    })
})
