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

    it('never censors message text — owner F4 directive: censor obliterated', async () => {
        const wrapper = mount(TalosMobileMessageContent, {
            attachTo: document.body,
            props: {
                content: 'Contact first@example.com, password: hunter2secret1, link https://example.com/articolo?id=42',
            },
        })
        await flushPromises()
        await new Promise((resolve) => setTimeout(resolve, 0))
        await flushPromises()
        expect(wrapper.findAll('.talos-censored')).toHaveLength(0)
        const text = wrapper.get('[data-testid="talos-mobile-message-content"]').element.textContent ?? ''
        expect(text).toContain('first@example.com')
        expect(text).toContain('https://example.com/articolo?id=42')
        expect(text).toContain('password: hunter2secret1')
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
