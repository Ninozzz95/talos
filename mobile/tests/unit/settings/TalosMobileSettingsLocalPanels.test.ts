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
        // Library behaviour lives in shell prefs but is surfaced on this panel.
        shell: { library_context_enabled: true, library_autosave_generated: true },
        // The tool block: what the model may do on its own, same panel.
        tools: { read: 'allow', write: 'ask', outbound: 'deny' },
        // F1: the web-search source panel is mounted here too. Absent means the
        // panel reads `search.source` off undefined and the whole page dies —
        // which is why the mount test in searchSourcePanel.test.ts exists.
        search: { source: null, endpoint: null },
    },
    setToolPermissions: vi.fn(async () => {}),
    setSearchPreferences: vi.fn(async () => {}),
    setAiDefaults: vi.fn().mockResolvedValue(undefined),
    setShell: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/stores/settings', () => ({ useSettingsStore: () => settings }))

import TalosMobileSettingsAiDefaultsPanel from '@/components/talos/settings/TalosMobileSettingsAiDefaultsPanel.vue'

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

    // Owner 2026-07-25: Library behaviour is an AI default, not an Appearance setting.
    it('exposes the Library toggles on the AI Defaults panel and persists them', async () => {
        const wrapper = mount(TalosMobileSettingsAiDefaultsPanel, {
            global: { stubs: { TalosThemedSelect: true } },
        })
        await wrapper.get('[aria-label="Let chats use your Library"]').setValue(false)
        await wrapper.get('[aria-label="Auto-save generated files to the Library"]').setValue(false)

        expect(settings.setShell).toHaveBeenCalledWith({ library_context_enabled: false })
        expect(settings.setShell).toHaveBeenCalledWith({ library_autosave_generated: false })
    })
})
