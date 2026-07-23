import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'

const settings = vi.hoisted(() => ({
    setTone: vi.fn(async () => {}),
    state: {
        tone: { preset: 'balanced' },
        ai_defaults: {
            utility_model_mode: 'same_as_chat',
            research_model_mode: 'same_as_chat',
            vision_enabled: true,
        },
        keyboard_shortcuts: {
            search_conversations: 'Ctrl+K',
            toggle_sidebar: 'Ctrl+B',
            focus_chat_input: 'Ctrl+/',
            toggle_active_window: 'Ctrl+,',
            new_session: 'Ctrl+Alt+N',
            cancel_close: 'Esc',
            open_calendar: 'Ctrl+Alt+C',
            open_compare: '',
            open_cookbook: '',
            open_deep_research: '',
            open_gallery: '',
            open_library: '',
            open_memory: '',
            open_notes: '',
            open_tasks: '',
            open_theme: '',
        },
    },
    setAiDefaults: vi.fn().mockResolvedValue(undefined),
    setShortcut: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/stores/settings', () => ({ useSettingsStore: () => settings }))

import TalosMobileSettingsAiDefaultsPanel from '@/components/talos/settings/TalosMobileSettingsAiDefaultsPanel.vue'
import TalosMobileSettingsShortcutsPanel from '@/components/talos/settings/TalosMobileSettingsShortcutsPanel.vue'

beforeEach(() => {
    vi.clearAllMocks()
})
describe('local-first Settings panels', () => {
    it('persists utility, research, and vision defaults', async () => {
        const wrapper = mount(TalosMobileSettingsAiDefaultsPanel, {
            global: { stubs: { TalosThemedSelect: true } },
        })
        const selects = wrapper.findAllComponents({ name: 'TalosThemedSelect' })
        selects.find((select) => select.props('ariaLabel') === 'Utility model mode')?.vm.$emit('update:modelValue', 'default_profile')
        selects.find((select) => select.props('ariaLabel') === 'Research model mode')?.vm.$emit('update:modelValue', 'default_profile')
        await wrapper.get('[aria-label="Vision routing preference"]').setValue(false)

        expect(settings.setAiDefaults).toHaveBeenCalledWith({ utility_model_mode: 'default_profile' })
        expect(settings.setAiDefaults).toHaveBeenCalledWith({ research_model_mode: 'default_profile' })
        expect(settings.setAiDefaults).toHaveBeenCalledWith({ vision_enabled: false })
    })

    it('persists a captured shortcut through the settings store', async () => {
        const wrapper = mount(TalosMobileSettingsShortcutsPanel)
        await wrapper.get('[aria-label="Set Search commands shortcut"]').trigger('click')
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'P', ctrlKey: true, shiftKey: true, bubbles: true }))

        expect(settings.setShortcut).toHaveBeenCalledWith('search_conversations', 'Ctrl+Shift+P')
    })
})
