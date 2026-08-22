// @vitest-environment jsdom

import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import TalosMobileLocalModelRow from '@/components/talos/models/TalosMobileLocalModelRow.vue'

const model = {
    id: 'a publisher/Qwen 3.5 Coder GGUF',
    revision: 'immutable-sha',
    downloads: 4_900_000,
    likes: 81,
    gated: false,
    tags: ['license:apache-2.0'],
    licence: 'apache-2.0',
    gguf: { parameters: 30_000_000_000 },
}

const capacity = {
    tone: 'good' as const,
    ratio: 0.6,
    label: 'Runs comfortably',
    size: '17 GB',
    estimated: true,
}

describe('TalosMobileLocalModelRow', () => {
    it('uses named route params and preserves owner, repo, spaces, and revision', () => {
        const wrapper = mount(TalosMobileLocalModelRow, {
            props: { model, capacity },
            global: {
                stubs: {
                    RouterLink: {
                        props: ['to'],
                        template: '<a :data-to="JSON.stringify(to)"><slot /></a>',
                    },
                },
            },
        })

        expect(JSON.parse(wrapper.get('[data-testid="talos-models-result"]').attributes('data-to'))).toEqual({
            name: 'settings-models-local-repo',
            params: { owner: 'a publisher', repo: 'Qwen 3.5 Coder GGUF' },
            query: { revision: 'immutable-sha' },
        })
        expect(wrapper.get('[data-testid="talos-model-row-title"]').classes()).toContain('break-words')
        expect(wrapper.text()).toContain('apache-2.0')
        expect(wrapper.text()).toContain('30B')
        expect(wrapper.findComponent({ name: 'TalosModelFitBar' }).exists()).toBe(true)
    })

    it('C45-RED-13 is a compact list row with one metadata line, not a card', () => {
        const wrapper = mount(TalosMobileLocalModelRow, {
            props: { model, capacity },
            global: {
                stubs: {
                    RouterLink: {
                        props: ['to'],
                        template: '<a><slot /></a>',
                    },
                },
            },
        })
        const row = wrapper.get('[data-testid="talos-models-result"]')

        expect(row.classes()).not.toContain('rounded-[var(--talos-radius-card)]')
        expect(row.classes()).not.toContain('border')
        expect(row.findAll('[data-testid="talos-model-row-metadata"]')).toHaveLength(1)
        expect(row.text()).toContain('apache-2.0')
        expect(row.text()).toContain('30B')
        expect(row.text()).toContain('4.9M')
    })

    it('does not make a malformed repository id navigable', () => {
        const wrapper = mount(TalosMobileLocalModelRow, {
            props: { model: { ...model, id: 'missing-owner-boundary' }, capacity },
        })
        expect(wrapper.find('a').exists()).toBe(false)
        expect(wrapper.get('[data-testid="talos-model-row-invalid"]').attributes('aria-disabled')).toBe('true')
    })
})
