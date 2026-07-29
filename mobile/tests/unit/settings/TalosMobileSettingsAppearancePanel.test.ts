import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import { nextTick } from 'vue'

const stores = vi.hoisted(() => ({
    theme: {
        state: { theme: 'telemetry', mode: 'system' },
        setTheme: vi.fn().mockResolvedValue(undefined),
        setMode: vi.fn().mockResolvedValue(undefined),
    },
    settings: {
        state: {
            shell: { immersive_header: false },
            chat_layout: {
                message_style: 'sections',
                bubble_scale: 'balanced',
                composer_mode: 'full',
                advanced_rail_expanded: false,
                mobile_window_presentation: 'drawer',
            },
            appearance_visibility: {
                chat_area: { session_header: true },
                chat_bar: { web_search: true },
                sidebar: { brand_name: true },
            },
            motion_v6: {
                mode: 'off', background_enabled: true, interface_enabled: true,
                speed: 100, intensity: 65, glow_intensity: 0, density: 100,
                depth: 50, trails: 35, contrast: 60, parallax: 20,
                quality: 'adaptive', pause_when_hidden: true, respect_data_saver: true,
                interface: {
                    profile: 'preset', duration_scale: 50, intensity: 65,
                    easing: 'precise', stagger: 40,
                    categories: { windows: true, surfaces: true, navigation: true, composer: true, messages: true, feedback: true },
                },
            },
        },
        setChatLayout: vi.fn().mockResolvedValue(undefined),
        setShell: vi.fn().mockResolvedValue(undefined),
        setVisibility: vi.fn().mockResolvedValue(undefined),
        resetVisibility: vi.fn().mockResolvedValue(undefined),
        setMotionPreferences: vi.fn().mockResolvedValue(undefined),
        resetMotionPreferences: vi.fn().mockResolvedValue(undefined),
    },
}))

vi.mock('@/stores/theme', () => ({ useThemeStore: () => stores.theme }))
vi.mock('@/stores/settings', () => ({ useSettingsStore: () => stores.settings }))

import TalosMobileSettingsAppearancePanel from '@/components/talos/settings/TalosMobileSettingsAppearancePanel.vue'

beforeEach(() => {
    vi.clearAllMocks()
    stores.settings.state.motion_v6.mode = 'off'
    stores.settings.state.motion_v6.background_enabled = true
})

async function activateTab(wrapper: VueWrapper, label: string): Promise<void> {
    const tab = wrapper.findAll('[role="tab"]').find((candidate) => candidate.text().includes(label))
    if (!tab) throw new Error(`Missing ${label} tab`)
    ;(tab.element as HTMLElement).focus()
    tab.element.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, cancelable: true, button: 0 }))
    tab.element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }))
    await nextTick()
    await new Promise((resolve) => setTimeout(resolve, 0))
    await nextTick()
}

describe('TalosMobileSettingsAppearancePanel', () => {
    it('MOTION-SETTINGS-02 gives every Design/Motion/Voice panel the shared active-motion contract', async () => {
        const wrapper = mount(TalosMobileSettingsAppearancePanel, {
            attachTo: document.body,
            global: {
                stubs: {
                    TalosThemedSelect: true,
                    TalosMobileVoiceSettings: true,
                },
            },
        })

        for (const label of ['Design', 'Motion', 'Voice']) {
            await activateTab(wrapper, label)
            const panel = wrapper.get(`[data-appearance-section="${label.toLowerCase()}"]`)
            expect(panel.classes()).toContain('talos-motion-tab-panel')
            expect(panel.attributes('data-state')).toBe('active')
        }
        wrapper.unmount()
    })

    it('offers all fourteen presets and changes preset and color mode through the theme store', async () => {
        const wrapper = mount(TalosMobileSettingsAppearancePanel, {
            attachTo: document.body,
            global: { stubs: { TalosThemedSelect: true } },
        })
        const selects = wrapper.findAllComponents({ name: 'TalosThemedSelect' })
        const theme = selects.find((select) => select.props('ariaLabel') === 'Theme preset')
        const mode = selects.find((select) => select.props('ariaLabel') === 'Theme color mode')
        expect(theme?.props('items')).toHaveLength(14)

        theme?.vm.$emit('update:modelValue', 'aurora')
        mode?.vm.$emit('update:modelValue', 'dark')
        expect(stores.theme.setTheme).toHaveBeenCalledWith('aurora')
        expect(stores.theme.setMode).toHaveBeenCalledWith('dark')
    })

    it('changes section on a horizontal swipe (owner: left → next, right → prev; vertical is ignored)', async () => {
        const wrapper = mount(TalosMobileSettingsAppearancePanel, {
            attachTo: document.body,
            global: { stubs: { TalosThemedSelect: true } },
        })
        const activeText = (): string | undefined =>
            wrapper.findAll('[role="tab"]').find((t) => t.attributes('data-state') === 'active')?.text()
        const swipe = async (fromX: number, toX: number, toY = 104): Promise<void> => {
            wrapper.element.dispatchEvent(new MouseEvent('pointerdown', { clientX: fromX, clientY: 100, bubbles: true }))
            wrapper.element.dispatchEvent(new MouseEvent('pointerup', { clientX: toX, clientY: toY, bubbles: true }))
            await nextTick()
        }
        expect(activeText()).toContain('Design')
        await swipe(240, 110) // left → next
        expect(activeText()).toContain('Motion')
        await swipe(110, 240) // right → prev
        expect(activeText()).toContain('Design')
        await swipe(110, 130, 420) // vertical-dominant → no change
        expect(activeText()).toContain('Design')
    })

    // Product review 2026-07-25: the "Chat composer" select and the 34 Interface
    // Visibility switches had NO consumer anywhere in src/ — they animated and
    // persisted while changing nothing. They were deleted; chat text size is now a
    // real setting (see the message list), so this asserts what still exists.
    it('persists the real chat text size and tool-window presentation', async () => {
        const wrapper = mount(TalosMobileSettingsAppearancePanel, {
            attachTo: document.body,
            global: { stubs: { TalosThemedSelect: true } },
        })
        const selects = wrapper.findAllComponents({ name: 'TalosThemedSelect' })
        selects.find((select) => select.props('ariaLabel') === 'Chat message size')?.vm.$emit('update:modelValue', 'expanded')
        selects.find((select) => select.props('ariaLabel') === 'Mobile tool window presentation')?.vm.$emit('update:modelValue', 'fullscreen')

        expect(stores.settings.setChatLayout).toHaveBeenCalledWith({ bubble_scale: 'expanded' })
        expect(stores.settings.setChatLayout).toHaveBeenCalledWith({ mobile_window_presentation: 'fullscreen' })
        // the dead controls are gone from the panel entirely
        expect(selects.some((select) => select.props('ariaLabel') === 'Chat composer mode')).toBe(false)
        expect(wrapper.text()).not.toContain('Interface visibility')
    })

    it('persists renderer, interface, performance, and visibility Motion V6 controls', async () => {
        // T6.5 contract: the Background switch reflects the EFFECTIVE state
        // (enabled && mode !== off) — start from a running renderer so the
        // uncheck below actually transitions.
        stores.settings.state.motion_v6.mode = 'complex'
        const wrapper = mount(TalosMobileSettingsAppearancePanel, {
            attachTo: document.body,
            global: { stubs: { TalosThemedSelect: true } },
        })
        await activateTab(wrapper, 'Motion')
        wrapper.findAllComponents({ name: 'TalosThemedSelect' })
            .find((select) => select.props('ariaLabel') === 'Motion renderer mode')
            ?.vm.$emit('update:modelValue', 'complex')
        await wrapper.get('[aria-label="Background motion"]').setValue(false)
        await wrapper.get('[aria-label="Interface motion"]').setValue(false)
        await wrapper.get('[aria-label="Background speed"]').setValue('150')
        await wrapper.get('[aria-label="Pause motion when hidden"]').setValue(false)

        expect(stores.settings.setMotionPreferences).toHaveBeenCalledWith({ mode: 'complex' })
        expect(stores.settings.setMotionPreferences).toHaveBeenCalledWith({ background_enabled: false })
        expect(stores.settings.setMotionPreferences).toHaveBeenCalledWith({ interface_enabled: false })
        expect(stores.settings.setMotionPreferences).toHaveBeenCalledWith({ speed: 150 })
        expect(stores.settings.setMotionPreferences).toHaveBeenCalledWith({ pause_when_hidden: false })
    })
})

describe('background motion toggle promotion (T6.5)', () => {
    it('shows OFF for the device-defect state (enabled flag but mode off) and promotes on tap', async () => {
        // The REAL device defect: background_enabled defaults to true while
        // mode defaults to 'off' — the switch looked ON with nothing moving.
        stores.settings.state.motion_v6.mode = 'off'
        stores.settings.state.motion_v6.background_enabled = true
        const wrapper = mount(TalosMobileSettingsAppearancePanel, {
            attachTo: document.body,
            global: { stubs: { TalosThemedSelect: true } },
        })
        await activateTab(wrapper, 'Motion')
        const toggle = wrapper.get('[role="switch"][aria-label="Background motion"]')
        expect((toggle.element as HTMLInputElement).checked).toBe(false)
        ;(toggle.element as HTMLInputElement).checked = true
        await toggle.trigger('change')
        expect(stores.settings.setMotionPreferences).toHaveBeenCalledWith({
            background_enabled: true,
            mode: 'simple',
        })
        wrapper.unmount()
    })

    it('turning the background OFF never touches the renderer mode', async () => {
        stores.settings.state.motion_v6.mode = 'complex'
        stores.settings.state.motion_v6.background_enabled = true
        const wrapper = mount(TalosMobileSettingsAppearancePanel, {
            attachTo: document.body,
            global: { stubs: { TalosThemedSelect: true } },
        })
        await activateTab(wrapper, 'Motion')
        const toggle = wrapper.get('[role="switch"][aria-label="Background motion"]')
        ;(toggle.element as HTMLInputElement).checked = false
        await toggle.trigger('change')
        expect(stores.settings.setMotionPreferences).toHaveBeenCalledWith({ background_enabled: false })
        wrapper.unmount()
    })
})
