// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import TalosMobileComposerModelPicker from '@/components/chat/TalosMobileComposerModelPicker.vue'
import type {
    TalosMobileModelProfileView,
    TalosMobileRoutingProfileView,
} from '@/components/chat/mobileChatTypes'

let wrapper: VueWrapper | null = null

afterEach(() => {
    wrapper?.unmount()
    wrapper = null
})

function profile(overrides: Partial<TalosMobileModelProfileView> = {}): TalosMobileModelProfileView {
    return {
        id: 'profile-openai',
        provider: 'openai',
        model: 'gpt-5.2',
        display_name: 'GPT-5.2',
        status: 'healthy',
        has_secret: true,
        effort_levels: ['low', 'medium', 'high'],
        supports_thinking: false,
        show_in_composer: true,
        capabilities: null,
        probe_ok: true,
        ...overrides,
    }
}

function route(overrides: Partial<TalosMobileRoutingProfileView> = {}): TalosMobileRoutingProfileView {
    return {
        id: 'route-balanced',
        name: 'Balanced routing',
        status: 'enabled',
        lane_count: 2,
        ...overrides,
    }
}

function mountPicker(overrides: Record<string, unknown> = {}) {
    wrapper = mount(TalosMobileComposerModelPicker, {
        attachTo: document.body,
        props: {
            modelProfiles: [
                profile(),
                profile({ id: 'profile-deepseek', provider: 'deepseek', display_name: 'DeepSeek', model: 'deepseek-chat' }),
            ],
            routingProfiles: [route()],
            selectedModelProfileId: 'profile-openai',
            selectedRoutingProfileId: null,
            ...overrides,
        },
    })
    return wrapper
}

describe('TalosMobileComposerModelPicker', () => {
    it('is a themed listbox with grouped Auto and model rows and no native select', () => {
        const view = mountPicker()

        expect(view.get('[role="listbox"]').attributes('aria-label')).toBe('Model for this conversation')
        expect(view.find('select').exists()).toBe(false)
        expect(view.find('option').exists()).toBe(false)
        expect(view.findAll('[data-testid="talos-mobile-model-route-option"]')).toHaveLength(1)
        expect(view.findAll('[data-testid="talos-mobile-model-option"]')).toHaveLength(2)
        expect(view.text()).toContain('Auto')
        expect(view.text()).toContain('Models')
    })

    it('emits exact IDs for callable model and enabled Auto route', async () => {
        const view = mountPicker()

        await view.get('[data-model-profile-id="profile-deepseek"]').trigger('click')
        await view.get('[data-routing-profile-id="route-balanced"]').trigger('click')

        expect(view.emitted('selectModelProfile')).toEqual([['profile-deepseek']])
        expect(view.emitted('selectModelRoutingProfile')).toEqual([['route-balanced']])
    })

    it('keeps unavailable profiles visible but disabled and unselectable', async () => {
        const view = mountPicker({
            modelProfiles: [profile({ id: 'profile-disabled', status: 'failed' })],
            routingProfiles: [route({ id: 'route-disabled', lane_count: 0 })],
        })

        const model = view.get<HTMLButtonElement>('[data-model-profile-id="profile-disabled"]')
        const routing = view.get<HTMLButtonElement>('[data-routing-profile-id="route-disabled"]')
        expect(model.element.disabled).toBe(true)
        expect(routing.element.disabled).toBe(true)
        await model.trigger('click')
        await routing.trigger('click')
        expect(view.emitted('selectModelProfile')).toBeUndefined()
        expect(view.emitted('selectModelRoutingProfile')).toBeUndefined()
    })

    it('shows compatibility and context metadata for every discovered model', () => {
        const view = mountPicker({
            modelProfiles: [profile({
                capabilities: {
                    chat_compatibility: 'supported',
                    context_length: 128000,
                    input_modalities: ['text', 'image'],
                },
            })],
            routingProfiles: [],
        })

        const option = view.get('[data-model-profile-id="profile-openai"]')
        expect(option.text()).toContain('supported')
        expect(option.text()).toContain('128k context')
        expect(option.text()).toContain('text + image')
    })

    it('marks the selected profile independently from DOM focus', () => {
        const view = mountPicker()
        expect(view.get('[data-model-profile-id="profile-openai"]').attributes('aria-selected')).toBe('true')
        expect(view.get('[data-model-profile-id="profile-deepseek"]').attributes('aria-selected')).toBe('false')
    })

    it('moves focus across enabled rows with Arrow keys and Home End', async () => {
        const view = mountPicker()
        const routeOption = view.get<HTMLButtonElement>('[data-routing-profile-id="route-balanced"]')
        const firstModel = view.get<HTMLButtonElement>('[data-model-profile-id="profile-openai"]')
        const lastModel = view.get<HTMLButtonElement>('[data-model-profile-id="profile-deepseek"]')

        routeOption.element.focus()
        await routeOption.trigger('keydown', { key: 'ArrowDown' })
        expect(document.activeElement).toBe(firstModel.element)

        await firstModel.trigger('keydown', { key: 'End' })
        expect(document.activeElement).toBe(lastModel.element)

        await lastModel.trigger('keydown', { key: 'ArrowDown' })
        expect(document.activeElement).toBe(routeOption.element)

        await routeOption.trigger('keydown', { key: 'Home' })
        expect(document.activeElement).toBe(routeOption.element)

        await routeOption.trigger('keydown', { key: 'ArrowUp' })
        expect(document.activeElement).toBe(lastModel.element)
    })

    it('emits a close request on Escape', async () => {
        const view = mountPicker()
        await view.get('[role="listbox"]').trigger('keydown', { key: 'Escape' })
        expect(view.emitted('requestClose')).toHaveLength(1)
    })

    /**
     * An empty list has two causes and they need opposite advice.
     *
     * "No models available, add one in the Model Lab" is right when discovery
     * SUCCEEDED and found nothing, and wrong — confidently, in the user's face —
     * when discovery failed. On 2026-08-01 that sentence was shown on a tablet
     * with a two-gigabyte model sitting in a folder the app could not open, and
     * it sent the search in the wrong direction for three rounds.
     */
    it('says why the list is empty instead of advising a download that will not help', () => {
        const view = mountPicker({
            modelProfiles: [],
            discoveryProblems: [{
                message: 'TALOS cannot read the local models folder.',
                detail: '/storage/emulated/0/Android/data/ai.talos/files/models',
            }],
        })

        const shown = view.findAll('[data-testid="talos-model-discovery-problem"]')
        expect(shown).toHaveLength(1)
        expect(shown[0].text()).toContain('cannot read the local models folder')
        // The path arrives readable. It used to be interpolated into the
        // sentence, where HTML escaping turned every slash into `&#x2F;` and
        // handed the user a correct diagnosis they could not read.
        const detail = view.get('[data-testid="talos-model-discovery-detail"]')
        expect(detail.text()).toBe('/storage/emulated/0/Android/data/ai.talos/files/models')
        expect(detail.text()).not.toContain('&#x2F;')
        expect(view.text()).not.toContain('open Model Lab to add one')
    })

    it('still gives the ordinary hint when discovery succeeded and found nothing', () => {
        const view = mountPicker({ modelProfiles: [], discoveryProblems: [] })

        expect(view.findAll('[data-testid="talos-model-discovery-problem"]')).toHaveLength(0)
        expect(view.text()).toContain('open Model Lab to add one')
    })

    it('keeps Refresh and Model Lab commands outside the listbox', async () => {
        const view = mountPicker()
        const listbox = view.get('[role="listbox"]')
        const refresh = view.get('[aria-label="Refresh model catalog"]')
        const modelLab = view.get('[aria-label="Open Model Lab"]')

        expect(listbox.element.contains(refresh.element)).toBe(false)
        expect(listbox.element.contains(modelLab.element)).toBe(false)
        await refresh.trigger('click')
        await modelLab.trigger('click')
        expect(view.emitted('refreshModels')).toHaveLength(1)
        expect(view.emitted('openModelLab')).toHaveLength(1)
    })
})
