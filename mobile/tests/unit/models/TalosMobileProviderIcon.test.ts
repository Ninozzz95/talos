// @vitest-environment jsdom

import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import TalosMobileProviderIcon from '@/components/models/TalosMobileProviderIcon.vue'
// AVVIO (25/09/2026): stessi file del componente, che per questi tre usa `?no-inline` (fuori dal pezzo d'avvio).
import anthropicLogo from '@/assets/providers/anthropic.svg?no-inline'
import deepseekLogo from '@/assets/providers/deepseek.svg?no-inline'
import geminiLogo from '@/assets/providers/gemini.svg'
import ollamaLogo from '@/assets/providers/ollama.svg'
import openaiLogo from '@/assets/providers/openai.svg?no-inline'
import openrouterLogo from '@/assets/providers/openrouter.svg'

const expectedLogos = {
    anthropic: anthropicLogo,
    deepseek: deepseekLogo,
    gemini: geminiLogo,
    ollama: ollamaLogo,
    openai: openaiLogo,
    openrouter: openrouterLogo,
} as const

describe('TalosMobileProviderIcon', () => {
    it('uses the canonical local provider mark and accessible provider name', () => {
        const wrapper = mount(TalosMobileProviderIcon, {
            props: { provider: 'openai' },
        })

        const identity = wrapper.get('[role="img"]')
        expect(identity.attributes('aria-label')).toBe('OpenAI')
        expect(identity.attributes('title')).toBe('OpenAI')

        const mark = wrapper.get('img')
        expect(mark.attributes('src')).toBe(openaiLogo)
        expect(mark.attributes('aria-hidden')).toBe('true')
        expect(wrapper.find('[data-provider-fallback]').exists()).toBe(false)
    })

    /*
     * 22/10/2026 (fase «dispositivi», regola dell'owner «ogni parola in inglese e italiano»): il nome del motore del dispositivo era
     * fisso in italiano nel registro dei fornitori («Motore locale») e il lettore di schermo lo diceva così anche in inglese.
     */
    it('PROV-LABEL-01 the on-device engine is named in the app language', () => {
        const wrapper = mount(TalosMobileProviderIcon, { props: { provider: 'local' } })
        const identity = wrapper.get('[role="img"]')
        expect(identity.attributes('aria-label')).toBe('On-device engine')
        expect(identity.attributes('title')).toBe('On-device engine')
    })

    it('PROV-LABEL-02 in Italian the on-device engine reads «Motore locale»', async () => {
        const { createTalosI18n } = await import('@/i18n')
        const { TALOS_IT_MESSAGES } = await import('@/i18n/locales/it')
        const globale = (await createTalosI18n()).global as unknown as { mergeLocaleMessage(l: string, m: object): void, locale: { value: string } }
        globale.mergeLocaleMessage('it', TALOS_IT_MESSAGES)
        const prima = globale.locale.value
        globale.locale.value = 'it'
        try {
            const wrapper = mount(TalosMobileProviderIcon, { props: { provider: 'local' } })
            expect(wrapper.get('[role="img"]').attributes('aria-label')).toBe('Motore locale')
        } finally {
            globale.locale.value = prima
        }
    })

    it('renders a controlled fallback for unknown provider input', () => {
        const wrapper = mount(TalosMobileProviderIcon, {
            props: { provider: 'unsupported-provider' },
        })

        expect(wrapper.get('[role="img"]').attributes('aria-label')).toBe('Unknown provider')
        expect(wrapper.find('img').exists()).toBe(false)
        expect(wrapper.get('[data-provider-fallback]').exists()).toBe(true)
    })

    // A3-84 seconda parte (25/09/2026): nella riga dell'elenco Chat il logo sta nella riga di testo, alto quanto lei.
    // Sul Pad la forma normale (riquadro da 36 px, bordo e fondo del tono) alzava ogni riga: la forma compatta no.
    it('PROVIDER-COMPATTO-01 compact: small, no box, same identity', () => {
        const wrapper = mount(TalosMobileProviderIcon, { props: { provider: 'openrouter', compatto: true } })
        const identity = wrapper.get('[role="img"]')
        expect(identity.attributes('data-compatto')).toBe('true')
        expect(identity.classes()).toContain('size-4')
        expect(identity.classes()).not.toContain('size-9')
        expect(identity.classes()).not.toContain('border')
        expect(wrapper.get('img').classes()).toContain('size-3.5')
        const normale = mount(TalosMobileProviderIcon, { props: { provider: 'openrouter' } })
        expect(normale.get('[role="img"]').classes()).toContain('size-9')
        expect(normale.get('[role="img"]').attributes('data-compatto')).toBeUndefined()
    })

    it.each(Object.entries(expectedLogos))('binds %s to its checked-in local mark', (provider, expectedAsset) => {
        const wrapper = mount(TalosMobileProviderIcon, { props: { provider } })
        expect(wrapper.get('img').attributes('src')).toBe(expectedAsset)
    })
})
