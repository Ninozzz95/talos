// @vitest-environment jsdom

import { createApp, h } from 'vue'
import { describe, expect, it } from 'vitest'
import TalosProviderIcon from './TalosProviderIcon.vue'

describe('TalosProviderIcon', () => {
    it('renders a local accessible image with a stable aspect ratio', () => {
        const container = document.createElement('div')
        const app = createApp({
            render: () => h(TalosProviderIcon, { provider: 'deepseek' }),
        })

        app.mount(container)

        const image = container.querySelector('img')
        expect(image).not.toBeNull()
        expect(image?.getAttribute('src')).toMatch(/deepseek\.svg$/)
        expect(image?.getAttribute('alt')).toBe('DeepSeek logo')
        expect(image?.getAttribute('aria-hidden')).toBe('true')
        expect(image?.className).toContain('object-contain')
        expect(container.textContent).toContain('DeepSeek')

        app.unmount()
    })

    it('renders a neutral fallback identity for an unknown provider', () => {
        const container = document.createElement('div')
        const app = createApp({
            render: () => h(TalosProviderIcon, { provider: 'unknown-provider' }),
        })

        app.mount(container)

        expect(container.querySelector('img')).toBeNull()
        expect(container.querySelector('[data-provider-fallback]')).not.toBeNull()
        expect(container.textContent).toContain('Unknown provider')
        const icon = container.firstElementChild
        expect(icon?.getAttribute('class')).toContain('border-[var(--talos-border-strong)]')
        expect(icon?.getAttribute('class')).toContain('bg-[var(--talos-panel-soft)]')
        expect(icon?.getAttribute('class')).toContain('text-[var(--talos-muted)]')
        expect(icon?.getAttribute('class')).not.toMatch(/var\(--talos-(?:success|warning|danger|accent)\)/)

        app.unmount()
    })

    it('maps known provider tones to semantic theme variables', () => {
        const container = document.createElement('div')
        const app = createApp({
            render: () => h(TalosProviderIcon, { provider: 'gemini' }),
        })

        app.mount(container)

        const icon = container.firstElementChild
        expect(icon?.getAttribute('class')).toContain('var(--talos-warning)')
        expect(icon?.getAttribute('class')).not.toMatch(/amber-/)

        app.unmount()
    })
})
