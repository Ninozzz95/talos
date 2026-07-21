import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import ChatScreen from '@/screens/ChatScreen.vue'

describe('chat screen (brand hero, step-1)', () => {
    it('renders the TALOS brand hero: masked logo mark + Orbitron wordmark', () => {
        const w = mount(ChatScreen)
        expect(w.find('[data-testid="talos-empty-brand"]').exists()).toBe(true)
        expect(w.find('.talos-short-logo-mark').exists()).toBe(true)
        const wordmark = w.find('.talos-orbitron-brand')
        expect(wordmark.exists()).toBe(true)
        expect(wordmark.text()).toBe('TALOS')
    })

    it('renders the default welcome prompt (seed "talos") verbatim', () => {
        const w = mount(ChatScreen)
        expect(w.find('h1').text()).toBe('What claim should we benchmark?')
        expect(w.text()).toContain('Turn a prompt into comparable AVM ON/OFF evidence with matching model, context, evaluator, and logs.')
    })

    it('renders the 3 suggestion CTAs verbatim', () => {
        const w = mount(ChatScreen)
        for (const cta of ['Verify API', 'Analyze logs', 'Generate DAG']) {
            expect(w.text()).toContain(cta)
        }
    })

    it('docks the FV2-06.0 composer and opens Model Lab from its footer', async () => {
        const w = mount(ChatScreen)
        expect(w.find('[data-testid="talos-mobile-composer"]').exists()).toBe(true)
        expect(w.find('[data-testid="talos-model-catalog"]').exists()).toBe(false)
        await w.get('[data-testid="talos-composer-model-trigger"]').trigger('click')
        await w.get('[data-testid="talos-composer-modellab"]').trigger('click')
        expect(w.find('[data-testid="talos-model-catalog"]').exists()).toBe(true)
    })
})
