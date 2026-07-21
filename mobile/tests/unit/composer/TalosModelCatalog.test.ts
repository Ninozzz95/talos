import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import TalosModelCatalog from '@/components/composer/TalosModelCatalog.vue'

describe('TalosModelCatalog (Model Lab)', () => {
    it('renders a card per model with provider·model and the effort ladder', () => {
        const w = mount(TalosModelCatalog)
        expect(w.findAll('[data-testid="talos-catalog-card"]')).toHaveLength(3)
        expect(w.text()).toContain('Models, effort and composer visibility')
        expect(w.text()).toContain('anthropic · claude-opus-4-8')
    })

    it('filters by provider', async () => {
        const w = mount(TalosModelCatalog)
        await w.get('[data-provider-filter="anthropic"]').trigger('click')
        expect(w.findAll('[data-testid="talos-catalog-card"]')).toHaveLength(3)
    })

    it('filters by search query', async () => {
        const w = mount(TalosModelCatalog)
        await w.get('[aria-label="Search models"]').setValue('haiku')
        expect(w.findAll('[data-testid="talos-catalog-card"]')).toHaveLength(1)
        expect(w.text()).toContain('Claude Haiku')
    })
})
