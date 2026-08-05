// @vitest-environment jsdom

import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import TalosMobileCatalogProfileRow from '@/components/talos/models/TalosMobileCatalogProfileRow.vue'

const profile = {
    id: 'anthropic:claude-sonnet-4-very-long-profile-name',
    provider: 'anthropic' as const,
    model: 'claude-sonnet-4-very-long-profile-name',
    display_name: 'Claude Sonnet with a deliberately long visible name',
    status: 'untested' as const,
    has_secret: true,
    effort_levels: ['low', 'high'],
    supports_thinking: true,
    show_in_composer: true,
    capabilities: {
        provenance: 'observed',
        context_length: 128_000,
        input_modalities: ['text'],
    },
    probe_ok: null,
}

describe('TalosMobileCatalogProfileRow', () => {
    it('keeps the identity readable and groups secondary actions in one native disclosure', () => {
        const wrapper = mount(TalosMobileCatalogProfileRow, {
            props: { profile, selected: false, busy: false },
        })

        expect(wrapper.attributes('data-model-card')).toBeDefined()
        expect(wrapper.get('[data-testid="talos-model-catalog-name"]').classes()).toContain('break-words')
        expect(wrapper.get('[data-testid="talos-model-catalog-name"]').classes()).not.toContain('truncate')
        expect(wrapper.findAll('details')).toHaveLength(1)
        expect(wrapper.findAll('[data-primary-model-action]')).toHaveLength(2)
    })

    it('emits selection, visibility, probe, and the edited display name without owning controller state', async () => {
        const wrapper = mount(TalosMobileCatalogProfileRow, {
            props: { profile, selected: false, busy: false },
        })

        await wrapper.get('[aria-label="Use Claude Sonnet with a deliberately long visible name as default model"]').trigger('click')
        await wrapper.get('[aria-label="Show Claude Sonnet with a deliberately long visible name in composer"]').trigger('click')
        await wrapper.get('[aria-label="Test Claude Sonnet with a deliberately long visible name completion"]').trigger('click')
        await wrapper.get('[aria-label="Display name for Claude Sonnet with a deliberately long visible name"]').setValue('Primary Claude')
        await wrapper.get('[aria-label="Save display name for Claude Sonnet with a deliberately long visible name"]').trigger('click')

        expect(wrapper.emitted('select')).toEqual([[profile.id]])
        expect(wrapper.emitted('toggle-visibility')).toEqual([[profile.id, false]])
        expect(wrapper.emitted('probe')).toEqual([[profile.id]])
        expect(wrapper.emitted('save-display-name')).toEqual([[profile.id, 'Primary Claude']])
    })
})
