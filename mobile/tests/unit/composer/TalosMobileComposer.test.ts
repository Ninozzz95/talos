import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import TalosMobileComposer from '@/components/composer/TalosMobileComposer.vue'

describe('TalosMobileComposer (FV2-06.0 composer)', () => {
    it('shows the selected model on the trigger and opens the themed picker', async () => {
        const w = mount(TalosMobileComposer)
        expect(w.get('[data-testid="talos-composer-model-trigger"]').text()).toContain('Claude Opus')
        expect(w.find('[data-testid="talos-model-popover"]').exists()).toBe(false)
        await w.get('[data-testid="talos-composer-model-trigger"]').trigger('click')
        expect(w.find('[data-testid="talos-model-popover"]').exists()).toBe(true)
        expect(w.find('[data-testid="talos-composer-model-picker"]').exists()).toBe(true)
    })

    it('selecting a model updates the trigger label and clamps effort into its ladder', async () => {
        const w = mount(TalosMobileComposer)
        await w.get('[data-testid="talos-composer-model-trigger"]').trigger('click')
        await w.get('[data-model-profile-id="haiku"]').trigger('click') // haiku effort_levels low/high
        expect(w.get('[data-testid="talos-composer-model-trigger"]').text()).toContain('Claude Haiku')
        // 'high' stays valid in haiku's ladder (off/low/high)
        expect(w.get('[data-testid="talos-composer-effort-chip"]').text()).toContain('Effort · High')
    })

    it('shows the effort chip and opens the ladder built from the model levels', async () => {
        const w = mount(TalosMobileComposer)
        expect(w.get('[data-testid="talos-composer-effort-chip"]').text()).toContain('Effort · High')
        await w.get('[data-testid="talos-composer-effort-chip"]').trigger('click')
        expect(w.find('[data-testid="talos-effort-popover"]').exists()).toBe(true)
        expect(w.find('[data-effort-level="off"]').exists()).toBe(true)
        expect(w.find('[data-effort-level="medium"]').exists()).toBe(true) // opus ladder off/low/medium/high
    })

    it('choosing an effort level updates the chip', async () => {
        const w = mount(TalosMobileComposer)
        await w.get('[data-testid="talos-composer-effort-chip"]').trigger('click')
        await w.get('[data-effort-level="low"]').trigger('click')
        expect(w.get('[data-testid="talos-composer-effort-chip"]').text()).toContain('Effort · Low')
    })

    it('exposes extended thinking as a switch for thinking-capable models', async () => {
        const w = mount(TalosMobileComposer)
        await w.get('[data-testid="talos-composer-effort-chip"]').trigger('click')
        const sw = w.get('[data-testid="talos-thinking-switch"]')
        expect(sw.attributes('aria-checked')).toBe('false')
        await sw.trigger('click')
        expect(w.get('[data-testid="talos-thinking-switch"]').attributes('aria-checked')).toBe('true')
    })

    it('gates send until the runtime lands (disabled)', () => {
        const w = mount(TalosMobileComposer)
        expect(w.get('[data-testid="talos-composer-send"]').attributes('disabled')).toBeDefined()
    })

    it('emits openModelLab from the picker footer', async () => {
        const w = mount(TalosMobileComposer)
        await w.get('[data-testid="talos-composer-model-trigger"]').trigger('click')
        await w.get('[data-testid="talos-composer-modellab"]').trigger('click')
        expect(w.emitted('openModelLab')).toHaveLength(1)
    })
})
