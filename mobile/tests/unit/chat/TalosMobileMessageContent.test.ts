// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'

const writeText = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
vi.mock('@/services/clipboard', () => ({ writeTalosClipboardText: writeText }))

import TalosMobileMessageContent from '@/components/chat/TalosMobileMessageContent.vue'

afterEach(() => {
    document.body.innerHTML = ''
    writeText.mockClear()
})

describe('TalosMobileMessageContent', () => {
    it('renders safe Markdown and copies fenced code from the final rendered text', async () => {
        const wrapper = mount(TalosMobileMessageContent, {
            attachTo: document.body,
            props: { content: '## Result\n\n```ts\nconst value = 4\n```' },
        })
        await flushPromises()

        expect(wrapper.get('h2').text()).toBe('Result')
        expect(wrapper.get('code').text()).toBe('const value = 4')
        await wrapper.get('[data-talos-copy-code]').trigger('click')
        await flushPromises()
        expect(writeText).toHaveBeenCalledWith('const value = 4\n')
        expect(wrapper.get('[role="status"]').text()).toBe('Code copied.')
    })

    it('censors independent sensitive values without changing the copyable text', async () => {
        const wrapper = mount(TalosMobileMessageContent, {
            attachTo: document.body,
            props: { content: 'Contact first@example.com or second@example.com.' },
        })
        await vi.waitFor(() => {
            expect(wrapper.findAll('button.talos-censored')).toHaveLength(2)
        })
        const textBefore = wrapper.get('[data-testid="talos-mobile-message-content"]').element.textContent
        await wrapper.findAll('button.talos-censored')[0]!.trigger('click')
        expect(wrapper.findAll('button.talos-censored')[0]!.attributes('aria-pressed')).toBe('true')
        expect(wrapper.findAll('button.talos-censored')[1]!.attributes('aria-pressed')).toBe('false')
        expect(wrapper.get('[data-testid="talos-mobile-message-content"]').element.textContent).toBe(textBefore)
    })

    it('reports a clipboard failure without mutating the code block', async () => {
        writeText.mockRejectedValueOnce(new Error('permission denied'))
        const wrapper = mount(TalosMobileMessageContent, {
            attachTo: document.body,
            props: { content: '```sh\necho safe\n```' },
        })
        await wrapper.get('[data-talos-copy-code]').trigger('click')
        await flushPromises()
        expect(wrapper.get('[role="status"]').text()).toBe('Code copy failed.')
        expect(wrapper.get('code').text()).toBe('echo safe')
    })
})
