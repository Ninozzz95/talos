import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import TalosMobileIntroModal from '@/components/intro/TalosMobileIntroModal.vue'

// F2-T6 — intro modal: 6 slides, only the current slide mounted, honest
// ROADMAP chips (mobile-truth claims), every close path emits ONE outcome.
function mountModal() {
    return mount(TalosMobileIntroModal, { attachTo: document.body })
}

describe('TalosMobileIntroModal (F2-T6)', () => {
    it('opens on slide 1 with step semantics and only the current slide mounted', () => {
        const wrapper = mountModal()
        expect(wrapper.text()).toContain('Step 1 of 6')
        expect(wrapper.text()).toContain('Meet TALOS')
        expect(wrapper.text()).not.toContain('Answers you can verify')
        wrapper.unmount()
    })

    it('navigates Next/Back and marks the active dot', async () => {
        const wrapper = mountModal()
        await wrapper.get('button[aria-label="Next"]').trigger('click')
        expect(wrapper.text()).toContain('Step 2 of 6')
        expect(wrapper.text()).toContain('Answers you can verify')
        const dots = wrapper.findAll('[data-testid="talos-intro-dot"]')
        expect(dots).toHaveLength(6)
        expect(dots[1].attributes('aria-current')).toBe('step')
        await wrapper.get('button[aria-label="Back"]').trigger('click')
        expect(wrapper.text()).toContain('Step 1 of 6')
        wrapper.unmount()
    })

    it('marks AVM as roadmap on mobile (no fake feature) with a ROADMAP chip', async () => {
        const wrapper = mountModal()
        await wrapper.get('button[aria-label="Next"]').trigger('click')
        await wrapper.get('button[aria-label="Next"]').trigger('click')
        expect(wrapper.text()).toContain('Step 3 of 6')
        expect(wrapper.text()).toContain('ROADMAP')
        expect(wrapper.text()).toMatch(/on the roadmap/i)
        wrapper.unmount()
    })

    it('emits skipped from the Skip control and completed from the final CTA', async () => {
        const skip = mountModal()
        await skip.get('button[aria-label="Skip introduction"]').trigger('click')
        expect(skip.emitted('close')).toEqual([['skipped']])
        skip.unmount()

        const complete = mountModal()
        for (let step = 0; step < 5; step += 1) {
            await complete.get('button[aria-label="Next"]').trigger('click')
        }
        expect(complete.text()).toContain('Step 6 of 6')
        await complete.get('[data-testid="talos-intro-cta"]').trigger('click')
        expect(complete.emitted('close')).toEqual([['completed']])
        complete.unmount()
    })

    it('supports ArrowRight/ArrowLeft slide navigation', async () => {
        const wrapper = mountModal()
        await wrapper.get('[data-testid="talos-intro-modal"]').trigger('keydown', { key: 'ArrowRight' })
        expect(wrapper.text()).toContain('Step 2 of 6')
        await wrapper.get('[data-testid="talos-intro-modal"]').trigger('keydown', { key: 'ArrowLeft' })
        expect(wrapper.text()).toContain('Step 1 of 6')
        wrapper.unmount()
    })

    it('keeps keys-in-keystore truth on the MODELS slide (no server-side claim)', async () => {
        const wrapper = mountModal()
        for (let step = 0; step < 3; step += 1) {
            await wrapper.get('button[aria-label="Next"]').trigger('click')
        }
        expect(wrapper.text()).toContain('Step 4 of 6')
        expect(wrapper.text()).toMatch(/Keystore/i)
        expect(wrapper.text()).not.toMatch(/server-side/i)
        wrapper.unmount()
    })
})
