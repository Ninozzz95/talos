// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { TALOS_DEFAULT_MOBILE_BROWSER_PREFERENCES } from '@/lib/browser/browserContracts'

const mockSettings = vi.hoisted(() => ({
    state: {
        browser: {
            schema_version: 1 as const,
            hmi_mode: 'confirm_sensitive' as const,
            presentation: 'isolated_webview' as const,
            suggest_for_urls: true,
            developer_untrusted_evidence: false,
        },
    },
    setBrowserPreferences: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('@/stores/settings', () => ({ useSettingsStore: () => mockSettings }))

import TalosMobileSettingsBrowserPanel from '@/components/talos/settings/TalosMobileSettingsBrowserPanel.vue'

beforeEach(() => {
    Object.assign(mockSettings.state.browser, TALOS_DEFAULT_MOBILE_BROWSER_PREFERENCES)
    mockSettings.setBrowserPreferences.mockClear()
})

// The settings switches are the shared TalosThemedSwitch since 2026-08-02:
// buttons with role="switch" and aria-checked, not native checkboxes. A tap is
// a click, and the value read is the one announced to a screen reader.
async function tapSwitch(wrapper: { get: (s: string) => { trigger: (e: string) => Promise<void> } }, label: string): Promise<void> {
    await wrapper.get(`[role="switch"][aria-label="${label}"]`).trigger('click')
}

describe('TalosMobileSettingsBrowserPanel', () => {
    it('exposes manual browsing and the exact three policy modes without a blanket bypass', () => {
        const wrapper = mount(TalosMobileSettingsBrowserPanel, { props: { developmentMode: false } })
        const selects = wrapper.findAllComponents({ name: 'TalosThemedSelect' })

        expect(selects.find((select) => select.props('ariaLabel') === 'Browser interaction policy')?.props('items'))
            .toEqual([
                { value: 'read_only', label: 'Read only' },
                { value: 'confirm_sensitive', label: 'Confirm sensitive only' },
                { value: 'confirm_every_interaction', label: 'Confirm every interaction' },
            ])
        expect(wrapper.text()).toContain('payments, credentials, uploads, downloads and external writes')
        expect(wrapper.text()).toContain('Trusted node not paired')
        expect(wrapper.text()).not.toContain('Never confirm')
    })

    it('persists interaction, presentation and suggestion preferences', async () => {
        const wrapper = mount(TalosMobileSettingsBrowserPanel, { props: { developmentMode: false } })
        const selects = wrapper.findAllComponents({ name: 'TalosThemedSelect' })
        selects.find((select) => select.props('ariaLabel') === 'Browser interaction policy')
            ?.vm.$emit('update:modelValue', 'confirm_every_interaction')
        selects.find((select) => select.props('ariaLabel') === 'Open browser links in')
            ?.vm.$emit('update:modelValue', 'system_browser')
        await tapSwitch(wrapper, 'Suggest Browse for links')

        expect(mockSettings.setBrowserPreferences).toHaveBeenCalledWith({ hmi_mode: 'confirm_every_interaction' })
        expect(mockSettings.setBrowserPreferences).toHaveBeenCalledWith({ presentation: 'system_browser' })
        expect(mockSettings.setBrowserPreferences).toHaveBeenCalledWith({ suggest_for_urls: false })
    })

    it('renders raw untrusted evidence controls only in development', () => {
        const production = mount(TalosMobileSettingsBrowserPanel, { props: { developmentMode: false } })
        expect(production.find('[aria-label="Show untrusted browser evidence"]').exists()).toBe(false)

        const development = mount(TalosMobileSettingsBrowserPanel, { props: { developmentMode: true } })
        expect(development.find('[aria-label="Show untrusted browser evidence"]').exists()).toBe(true)
    })
})
