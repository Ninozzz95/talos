// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'

vi.mock('@/stores/chatController', () => ({
    useChatController: () => ({
        profiles: { value: [] },
        secrets: {},
        init: vi.fn().mockResolvedValue(undefined),
    }),
}))
vi.mock('@/services/localEngine', () => ({
    talosLocalInstalledModels: vi.fn().mockResolvedValue({ models: [], unreadable: [] }),
}))
const refreshHuggingFaceToken = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
vi.mock('@/stores/localModels', () => ({
    talosLocalModels: { hasToken: true },
    talosRefreshHuggingFaceToken: refreshHuggingFaceToken,
}))

import TalosMobileModelLabHub from '@/components/talos/models/TalosMobileModelLabHub.vue'

describe('TalosMobileModelLabHub', () => {
    it('renders one device card followed by three real links, never a tablist', async () => {
        const router = createRouter({
            history: createMemoryHistory(),
            routes: [
                { name: 'settings-models', path: '/settings/models', component: { template: '<div />' } },
                { name: 'settings-models-providers', path: '/settings/models/providers', component: { template: '<div />' } },
                { name: 'settings-models-catalog', path: '/settings/models/catalog', component: { template: '<div />' } },
                { name: 'settings-models-local', path: '/settings/models/local', component: { template: '<div />' } },
            ],
        })
        await router.push('/settings/models')
        await router.isReady()

        const wrapper = mount(TalosMobileModelLabHub, {
            global: {
                plugins: [router],
                stubs: { TalosMobileDeviceCapacityCard: { template: '<article data-testid="talos-model-lab-device" />' } },
            },
        })
        expect(wrapper.findAll('[data-testid="talos-model-lab-device"]')).toHaveLength(1)
        expect(wrapper.find('[role="tablist"]').exists()).toBe(false)
        expect(wrapper.findAll('[data-testid="talos-model-lab-destination"]').map((link) => link.attributes('href')))
            .toEqual(['/settings/models/providers', '/settings/models/catalog', '/settings/models/local'])
        expect(refreshHuggingFaceToken).toHaveBeenCalledTimes(1)
    })
})
