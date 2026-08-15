// @vitest-environment jsdom

import { mount } from '@vue/test-utils'
import { reactive } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import TalosMobileSettingsLanguagePanel from '@/components/talos/settings/TalosMobileSettingsLanguagePanel.vue'

const setMode = vi.fn(async () => {})

vi.mock('@/i18n', () => ({
    useTalosLocalization: () => ({
        state: reactive({
            mode: 'system',
            locale: 'it',
            systemLocale: 'it',
            switching: false,
            error: null,
        }),
        setMode,
    }),
    talosT: (key: string) => key,
}))

describe('TalosMobileSettingsLanguagePanel', () => {
    it('I18N-03 exposes system, Italian and English as one dedicated setting', async () => {
        const wrapper = mount(TalosMobileSettingsLanguagePanel)
        const choices = wrapper.findAll('[data-testid="talos-language-choice"]')

        expect(choices).toHaveLength(3)
        expect(choices.map(choice => choice.attributes('data-language-mode'))).toEqual([
            'system',
            'it',
            'en',
        ])
        expect(choices[0]!.attributes('aria-checked')).toBe('true')

        await choices[2]!.trigger('click')
        expect(setMode).toHaveBeenCalledWith('en')
    })
})

