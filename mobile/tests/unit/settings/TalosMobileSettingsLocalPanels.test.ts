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
        shell: {
            library_context_enabled: true,
            library_context_policy: null as {
                schema_version: 1
                revision: number
                enabled: boolean
                mode: 'broad_compat_v1' | 'smart_relevant_v1' | 'ask_before_use_v1' | 'agentic_on_demand_v1'
                included_file_ids: string[]
                excluded_file_ids: string[]
                updated_at: string | null
            } | null,
            library_autosave_generated: true,
        },
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
    setLibraryContextPolicy: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/stores/settings', () => ({ useSettingsStore: () => settings }))

import TalosMobileSettingsAiDefaultsPanel from '@/components/talos/settings/TalosMobileSettingsAiDefaultsPanel.vue'

beforeEach(() => {
    vi.clearAllMocks()
    settings.state.shell.library_context_enabled = true
    settings.state.shell.library_context_policy = null
    settings.state.shell.library_autosave_generated = true
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

        expect(settings.setLibraryContextPolicy).toHaveBeenCalledWith({ enabled: false }, 0)
        expect(settings.setShell).toHaveBeenCalledWith({ library_autosave_generated: false })
    })

    it('P1-CTX-UI-01 requires an explicit mode before committing a fresh enable', async () => {
        settings.state.shell.library_context_enabled = false
        const wrapper = mount(TalosMobileSettingsAiDefaultsPanel, {
            global: { stubs: { TalosThemedSelect: true } },
        })

        await wrapper.get('[aria-label="Let chats use your Library"]').setValue(true)

        expect(settings.setLibraryContextPolicy).not.toHaveBeenCalled()
        expect(wrapper.get('[data-testid="talos-library-mode-chooser"]').exists()).toBe(true)

        const modeSelect = wrapper.findAllComponents({ name: 'TalosThemedSelect' })
            .find((select) => select.props('ariaLabel') === 'Library context mode')
        expect(modeSelect?.props('modelValue')).toBe('')
        modeSelect?.vm.$emit('update:modelValue', 'smart_relevant_v1')
        await wrapper.vm.$nextTick()

        expect(settings.setLibraryContextPolicy).toHaveBeenCalledWith({
            enabled: true,
            mode: 'smart_relevant_v1',
        }, 0)
    })

    it('P1-CTX-UI-02 renders legacy enabled state as broad compatibility', () => {
        const wrapper = mount(TalosMobileSettingsAiDefaultsPanel, {
            global: { stubs: { TalosThemedSelect: true } },
        })

        const modeSelect = wrapper.findAllComponents({ name: 'TalosThemedSelect' })
            .find((select) => select.props('ariaLabel') === 'Library context mode')

        expect(wrapper.get('[data-testid="talos-library-mode-chooser"]').attributes('data-policy-source'))
            .toBe('legacy')
        expect(modeSelect?.props('modelValue')).toBe('broad_compat_v1')
    })

    it('P0-COPY-01 states the active outbound and persistent-write web contract', () => {
        const wrapper = mount(TalosMobileSettingsAiDefaultsPanel, {
            global: { stubs: { TalosThemedSelect: true } },
        })

        expect(wrapper.text()).toMatch(
            /web search.*send.*off this device.*encrypted Library.*create or change/is,
        )
        expect(wrapper.text()).not.toMatch(/Nothing in TALOS does this today/i)
    })
})
