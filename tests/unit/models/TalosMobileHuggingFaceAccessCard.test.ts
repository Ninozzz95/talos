// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'

const store = vi.hoisted(() => ({
    state: { hasToken: false },
    refresh: vi.fn(async () => undefined),
    save: vi.fn(async () => undefined),
    forget: vi.fn(async () => undefined),
}))

vi.mock('@/stores/localModels', () => ({
    talosLocalModels: store.state,
    talosRefreshHuggingFaceToken: store.refresh,
    talosSetHuggingFaceToken: store.save,
    talosForgetHuggingFaceToken: store.forget,
}))

import TalosMobileHuggingFaceAccessCard from '@/components/talos/models/TalosMobileHuggingFaceAccessCard.vue'

describe('TalosMobileHuggingFaceAccessCard', () => {
    beforeEach(() => {
        store.state.hasToken = false
        store.refresh.mockReset().mockResolvedValue(undefined)
        store.save.mockReset().mockResolvedValue(undefined)
        store.forget.mockReset().mockResolvedValue(undefined)
    })

    it('C45-RED-09A uses the provider accordion contract and starts collapsed', async () => {
        const wrapper = mount(TalosMobileHuggingFaceAccessCard)
        await flushPromises()

        const toggle = wrapper.get('[data-testid="talos-hf-access-toggle"]')
        const panel = wrapper.get('[data-testid="talos-hf-access-panel"]')
        expect(toggle.element.tagName).toBe('BUTTON')
        expect(toggle.attributes('aria-expanded')).toBe('false')
        expect(toggle.attributes('aria-controls')).toBe('talos-hf-access-panel')
        expect(toggle.text()).toContain('Hugging Face access')
        expect(toggle.text()).toContain('🤗')
        expect((panel.element as HTMLElement).style.display).toBe('none')

        await toggle.trigger('click')
        expect(toggle.attributes('aria-expanded')).toBe('true')
        expect((panel.element as HTMLElement).style.display).not.toBe('none')
        expect(panel.get('[data-testid="talos-hf-access-input"]').attributes('type')).toBe('password')
    })

    it('C45-RED-09A2 keeps the access state in the collapsed mobile supporting copy', async () => {
        const wrapper = mount(TalosMobileHuggingFaceAccessCard)
        await flushPromises()

        const copy = wrapper.get('[data-testid="talos-hf-access-copy"]')
        const status = wrapper.get('[data-testid="talos-hf-access-status"]')
        expect(copy.element.contains(status.element)).toBe(true)
        expect(status.classes()).not.toContain('hidden')
        expect(status.classes()).not.toContain('sm:inline')
        expect(status.text()).toBe('not configured')
    })

    it('refreshes boolean status and never accepts a token prop', async () => {
        const wrapper = mount(TalosMobileHuggingFaceAccessCard)
        await flushPromises()

        expect(store.refresh).toHaveBeenCalledTimes(1)
        expect(wrapper.props()).not.toHaveProperty('token')
        expect(Object.keys(store.state)).toEqual(['hasToken'])
        expect(wrapper.get('[data-testid="talos-hf-access-input"]').attributes('type')).toBe('password')
    })

    it('clears the draft before secure persistence settles', async () => {
        let release!: () => void
        store.save.mockImplementation(() => new Promise<void>((resolve) => { release = resolve }))
        const wrapper = mount(TalosMobileHuggingFaceAccessCard)
        await flushPromises()
        const input = wrapper.get('[data-testid="talos-hf-access-input"]')

        await input.setValue('hf_super_secret')
        await wrapper.get('form').trigger('submit')

        expect(store.save).toHaveBeenCalledWith('hf_super_secret')
        expect((input.element as HTMLInputElement).value).toBe('')
        expect(wrapper.html()).not.toContain('hf_super_secret')
        release()
        await flushPromises()
    })

    it('does not echo a rejected secret through its generic error', async () => {
        store.save.mockRejectedValue(new Error('hf_leaked_by_backend'))
        const wrapper = mount(TalosMobileHuggingFaceAccessCard)
        await flushPromises()

        await wrapper.get('[data-testid="talos-hf-access-input"]').setValue('hf_leaked_by_backend')
        await wrapper.get('form').trigger('submit')
        await flushPromises()

        expect(wrapper.get('[data-testid="talos-hf-access-error"]').exists()).toBe(true)
        expect(wrapper.html()).not.toContain('hf_leaked_by_backend')
    })

    it('offers forget only for a saved access', async () => {
        store.state.hasToken = true
        const wrapper = mount(TalosMobileHuggingFaceAccessCard)
        await flushPromises()

        await wrapper.get('[data-testid="talos-hf-access-forget"]').trigger('click')
        await flushPromises()
        expect(store.forget).toHaveBeenCalledTimes(1)
    })
})
