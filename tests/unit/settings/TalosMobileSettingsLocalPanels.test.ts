// @vitest-environment jsdom

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
// The settings switches are the shared TalosThemedSwitch since 2026-08-02:
// buttons with role="switch" and aria-checked, not native checkboxes. A tap is
// a click, and the value read is the one announced to a screen reader.
async function tapSwitch(wrapper: { get: (s: string) => { trigger: (e: string) => Promise<void> } }, label: string): Promise<void> {
    await wrapper.get(`[role="switch"][aria-label="${label}"]`).trigger('click')
}

describe('local-first Settings panels', () => {
    it('persiste la scelta sulla vista, che è l’unica delle tre che governa qualcosa', async () => {
        /**
         * Le altre due tendine — «modalità modello di utilità» e «modalità
         * modello di ricerca» — sono state TOLTE il 2026-08-04.
         *
         * Non erano nel posto sbagliato: **non erano lette da nessuno**.
         * Nessuna riga consultava `utility_model_mode` o
         * `research_model_mode`. Un comando inerte è peggio di uno assente:
         * chi lo trova crede di aver deciso, e quando il risultato non cambia
         * cerca la causa da un'altra parte.
         *
         * `vision_enabled` invece è vivo — lo legge `chatController` per
         * dirottare su un modello che vede le immagini — e resta.
         */
        const wrapper = mount(TalosMobileSettingsAiDefaultsPanel, {
            global: { stubs: { TalosThemedSelect: true } },
        })
        const selects = wrapper.findAllComponents({ name: 'TalosThemedSelect' })
        expect(selects.some((select) => /model mode/i.test(String(select.props('ariaLabel'))))).toBe(false)
        // E al loro posto c'è il rimando a dove la scelta vive davvero.
        expect(wrapper.text()).toContain('chosen in the composer')

        await tapSwitch(wrapper, 'Vision routing preference')
        expect(settings.setAiDefaults).toHaveBeenCalledWith({ vision_enabled: false })
    })

    // Owner 2026-07-25: Library behaviour is an AI default, not an Appearance setting.
    it('exposes the Library toggles on the AI Defaults panel and persists them', async () => {
        const wrapper = mount(TalosMobileSettingsAiDefaultsPanel, {
            global: { stubs: { TalosThemedSelect: true } },
        })
        await tapSwitch(wrapper, 'Let chats use your Library')
        await tapSwitch(wrapper, 'Auto-save generated files to the Library')

        expect(settings.setLibraryContextPolicy).toHaveBeenCalledWith({ enabled: false }, 0)
        expect(settings.setShell).toHaveBeenCalledWith({ library_autosave_generated: false })
    })

    it('P1-CTX-UI-01 requires an explicit mode before committing a fresh enable', async () => {
        settings.state.shell.library_context_enabled = false
        const wrapper = mount(TalosMobileSettingsAiDefaultsPanel, {
            global: { stubs: { TalosThemedSelect: true } },
        })

        await tapSwitch(wrapper, 'Let chats use your Library')

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

})
