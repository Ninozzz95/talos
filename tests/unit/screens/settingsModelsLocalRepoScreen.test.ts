// @vitest-environment jsdom

import { reactive } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const route = reactive({
    params: { owner: 'unsloth', repo: 'Qwen 3.5 GGUF' } as Record<string, unknown>,
    query: { revision: 'pinned-revision' } as Record<string, unknown>,
})

vi.mock('vue-router', () => ({ useRoute: () => route }))

import SettingsModelsLocalRepoScreen from '@/screens/SettingsModelsLocalRepoScreen.vue'

describe('SettingsModelsLocalRepoScreen', () => {
    beforeEach(() => {
        route.params = { owner: 'unsloth', repo: 'Qwen 3.5 GGUF' }
        route.query = { revision: 'pinned-revision' }
    })

    it('recomposes decoded named params and preserves the immutable revision', async () => {
        const wrapper = mount(SettingsModelsLocalRepoScreen, {
            global: {
                stubs: {
                    TalosMobileLocalRepoDetail: {
                        props: ['repoId', 'revision'],
                        template: '<main data-testid="repo-detail" :data-repo="repoId" :data-revision="revision" />',
                    },
                },
            },
        })
        await flushPromises()

        const detail = wrapper.get('[data-testid="repo-detail"]')
        expect(detail.attributes('data-repo')).toBe('unsloth/Qwen 3.5 GGUF')
        expect(detail.attributes('data-revision')).toBe('pinned-revision')
        expect(wrapper.find('[data-testid="talos-models-back"]').exists()).toBe(false)
        expect(wrapper.find('[data-testid="talos-model-lab-device"]').exists()).toBe(false)
    })

    it.each([
        [{ owner: [], repo: 'x' }],
        [{ owner: 'a', repo: '' }],
        [{ owner: 'a/b', repo: 'x' }],
        [{ owner: 'a', repo: 'b/c' }],
    ])('rejects malformed params without mounting a corrupted repository', async (params) => {
        route.params = params
        const wrapper = mount(SettingsModelsLocalRepoScreen, {
            global: { stubs: { TalosMobileLocalRepoDetail: true } },
        })
        await flushPromises()

        expect(wrapper.find('[data-testid="repo-detail"]').exists()).toBe(false)
        expect(wrapper.get('[data-testid="talos-models-invalid-repo"]').attributes('role')).toBe('alert')
    })
})
