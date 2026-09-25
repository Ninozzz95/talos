// @vitest-environment jsdom

/**
 * ⭐ B3 F4-A — il compositore a giro vivo (decisioni owner 24/09, D-B3-01 e D-B3-04).
 *
 * - campo vuoto ⇒ solo Stop, come prima;
 * - con testo ⇒ Stop RESTA `talos-composer-action` (contratto della prova «durante una risposta il comando resta
 *   stop») e accanto compare Accoda, `talos-composer-queue`, azione principale;
 * - l'Invio a giro vivo con testo ACCODA: mai `send`, e mai un reindirizzo (desktop `legacy/invio-durante-il-giro.js`);
 * - Accoda spento resta VISIBILE con il motivo (`aria-disabled`, W3C APG «Focusability of disabled controls», letto il
 *   24/09/2026: «When a disabled element does need to remain discoverable, aria-disabled="true" is applied»);
 * - la chat B mentre risponde la chat A: con testo compare Accoda, al posto dell'invio spento.
 */
import { afterEach, describe, expect, it } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import TalosMobileComposer from '@/components/chat/TalosMobileComposer.vue'
import type { TalosMobileModelProfileView } from '@/components/chat/mobileChatTypes'

let wrapper: VueWrapper | null = null

afterEach(() => {
    wrapper?.unmount()
    wrapper = null
})

const modelProfiles: TalosMobileModelProfileView[] = [{
    id: 'profile-deepseek',
    provider: 'deepseek',
    model: 'deepseek-chat',
    display_name: 'DeepSeek Chat',
    status: 'healthy',
    has_secret: true,
    effort_levels: ['low', 'medium', 'high'],
    supports_thinking: true,
    show_in_composer: true,
    capabilities: { vision: true },
    probe_ok: true,
}]

function mountComposer(overrides: Record<string, unknown> = {}): VueWrapper {
    wrapper = mount(TalosMobileComposer, {
        attachTo: document.body,
        global: { stubs: { teleport: true } },
        props: {
            prompt: '',
            modelProfiles,
            selectedModelProfileId: 'profile-deepseek',
            selectedEffort: 'medium',
            thinking: false,
            canSend: false,
            sending: true,
            sendDisabledReason: '',
            canQueue: true,
            queueDisabledReason: '',
            ...overrides,
        },
    })
    return wrapper
}

describe('TalosMobileComposer — Accoda a giro vivo (B3 F4-A)', () => {
    it('COMP-CODA-01 campo vuoto durante una risposta ⇒ solo Stop, niente Accoda', () => {
        const view = mountComposer({ prompt: '' })
        expect(view.find('[data-testid="talos-composer-queue"]').exists()).toBe(false)
        expect(view.get('[data-testid="talos-composer-action"]').attributes('data-talos-action')).toBe('stop')
    })

    it('COMP-CODA-02 con testo: Stop resta talos-composer-action e accanto compare Accoda, che accoda il testo', async () => {
        const view = mountComposer({ prompt: 'La prossima domanda' })
        const stop = view.get('[data-testid="talos-composer-action"]')
        expect(stop.attributes('aria-label')).toBe('Stop response')
        expect(stop.attributes('data-talos-action')).toBe('stop')
        const queue = view.get('[data-testid="talos-composer-queue"]')
        expect(queue.attributes('aria-label')).toBe('Queue')
        expect(queue.attributes('aria-disabled')).not.toBe('true')
        await queue.trigger('click')
        expect(view.emitted('queue')).toEqual([['La prossima domanda']])
        expect(view.emitted('send')).toBeUndefined()
        expect(view.emitted('stop')).toBeUndefined()
        // Lo Stop continua a fermare, anche con Accoda accanto.
        await stop.trigger('click')
        expect(view.emitted('stop')).toEqual([[]])
    })

    it('COMP-CODA-03 l\'Invio a giro vivo con testo ACCODA: mai send', async () => {
        const view = mountComposer({ prompt: '' })
        const field = view.get<HTMLTextAreaElement>('textarea')
        await field.setValue('scritto durante il giro')
        await field.trigger('keydown', { key: 'Enter', shiftKey: false })
        expect(view.emitted('queue')).toEqual([['scritto durante il giro']])
        expect(view.emitted('send')).toBeUndefined()
        // Maiuscolo+Invio resta un a capo.
        await field.trigger('keydown', { key: 'Enter', shiftKey: true })
        expect(view.emitted('queue')).toHaveLength(1)
    })

    it('COMP-CODA-04 un doppio tocco accoda UNA volta', async () => {
        const view = mountComposer({ prompt: 'una volta sola' })
        const queue = view.get('[data-testid="talos-composer-queue"]')
        await queue.trigger('click')
        await queue.trigger('click')
        expect(view.emitted('queue')).toHaveLength(1)
        // Un testo NUOVO riapre il cancello.
        await view.setProps({ prompt: '' })
        await view.setProps({ prompt: 'la seconda' })
        await view.get('[data-testid="talos-composer-queue"]').trigger('click')
        expect(view.emitted('queue')).toEqual([['una volta sola'], ['la seconda']])
    })

    it('COMP-CODA-05 canQueue falso con testo ⇒ Accoda VISIBILE ma spento, col motivo detto e leggibile', async () => {
        const reason = 'With an attachment, wait for the answer to finish: the queue carries text only.'
        const view = mountComposer({ prompt: 'con allegato', canQueue: false, queueDisabledReason: reason })
        const queue = view.get('[data-testid="talos-composer-queue"]')
        expect(queue.attributes('aria-disabled')).toBe('true')
        expect(queue.attributes('title')).toBe(reason)
        expect(view.get('[data-testid="talos-composer-queue-reason"]').text()).toBe(reason)
        await queue.trigger('click')
        const field = view.get<HTMLTextAreaElement>('textarea')
        await field.trigger('keydown', { key: 'Enter' })
        expect(view.emitted('queue')).toBeUndefined()
        expect(view.emitted('send')).toBeUndefined()
    })

    it('COMP-CODA-06 chat B mentre risponde la chat A: con testo compare Accoda al posto dell\'invio spento', async () => {
        const view = mountComposer({
            prompt: 'domanda per la chat B',
            sending: false,
            canSend: false,
            sendDisabledReason: 'I am answering in another chat.',
        })
        expect(view.find('[data-testid="talos-composer-action"]').exists()).toBe(false)
        const queue = view.get('[data-testid="talos-composer-queue"]')
        await queue.trigger('click')
        expect(view.emitted('queue')).toEqual([['domanda per la chat B']])
        expect(view.emitted('send')).toBeUndefined()
        // Campo vuoto: torna il microfono, e la riga del motivo resta.
        await view.setProps({ prompt: '' })
        expect(view.find('[data-testid="talos-composer-queue"]').exists()).toBe(false)
        expect(view.get('[data-testid="talos-composer-action"]').attributes('data-talos-action')).toBe('mic')
        expect(view.get('[data-testid="talos-composer-blocked-reason"]').text()).toBe('I am answering in another chat.')
    })

    it('COMP-CODA-07 chat B: anche l\'Invio accoda', async () => {
        const view = mountComposer({ prompt: '', sending: false, canSend: false })
        const field = view.get<HTMLTextAreaElement>('textarea')
        await field.setValue('dalla tastiera')
        await field.trigger('keydown', { key: 'Enter' })
        expect(view.emitted('queue')).toEqual([['dalla tastiera']])
        expect(view.emitted('send')).toBeUndefined()
    })

    it('COMP-CODA-08 app libera: nessun Accoda, l\'Invio invia come sempre', async () => {
        const view = mountComposer({ prompt: '', sending: false, canSend: true, canQueue: false })
        const field = view.get<HTMLTextAreaElement>('textarea')
        await field.setValue('invio normale')
        expect(view.find('[data-testid="talos-composer-queue"]').exists()).toBe(false)
        await field.trigger('keydown', { key: 'Enter' })
        expect(view.emitted('send')).toHaveLength(1)
        expect(view.emitted('queue')).toBeUndefined()
    })
})
