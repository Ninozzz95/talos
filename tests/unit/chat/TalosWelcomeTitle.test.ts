// @vitest-environment jsdom

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { mount } from '@vue/test-utils'

const useTalosWelcome = vi.hoisted(() => vi.fn())
const context = vi.hoisted(() => ({
    locale: { value: 'en' },
    activeSession: { value: { id: 'session-13' } },
}))

vi.mock('@/composables/useTalosWelcome', () => ({ useTalosWelcome }))
vi.mock('@/i18n', () => ({
    useTalosI18n: () => ({
        locale: context.locale,
        t: (key: string) => key === 'chat.welcomeHeadline'
            ? 'How can TALOS help?'
            : key,
    }),
}))
vi.mock('@/stores/chatController', () => ({
    useChatController: () => ({
        chat: { activeSession: context.activeSession },
    }),
}))

import TalosWelcomeTitle from '@/components/chat/TalosWelcomeTitle.vue'

describe('TalosWelcomeTitle', () => {
    beforeEach(() => {
        useTalosWelcome.mockReset()
        useTalosWelcome.mockReturnValue({
            title: ref('A focused start'),
            easterEgg: ref(null),
            condition: ref('morning'),
            index: ref(3),
        })
    })

    it('WELCOME-TITLE-01 renders one title-only heading and wires reactive selection inputs', async () => {
        const wrapper = mount(TalosWelcomeTitle)

        const headings = wrapper.findAll('h1')
        expect(headings).toHaveLength(1)
        expect(headings[0].text()).toBe('A focused start')
        expect(wrapper.findAll('p')).toHaveLength(0)
        expect(headings[0].classes()).toEqual(['talos-welcome-title'])

        const options = useTalosWelcome.mock.calls[0][0]
        expect(options.locale.value).toBe('en')
        expect(options.sessionId.value).toBe('session-13')
        expect(options.fallbackTitle()).toBe('How can TALOS help?')
    })

    it('WELCOME-TITLE-02 shares exact expanded and compact typography through the hero state', () => {
        const css = readFileSync(resolve(process.cwd(), 'src/style.css'), 'utf8')

        expect(css).toMatch(/\.talos-welcome-title\s*\{[^}]*margin-top:\s*1\.5rem;/s)
        expect(css).toMatch(/\.talos-welcome-title\s*\{[^}]*font-size:\s*var\(--text-2xl\);/s)
        expect(css).toMatch(/\[data-composer-expanded="true"\]\s*>\s*\.talos-welcome-title\s*\{[^}]*margin-top:\s*0\.75rem;/s)
        expect(css).toMatch(/\[data-composer-expanded="true"\]\s*>\s*\.talos-welcome-title\s*\{[^}]*font-size:\s*var\(--text-lg\);/s)
    })
})
