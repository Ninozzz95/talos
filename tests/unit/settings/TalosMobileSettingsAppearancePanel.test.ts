// @vitest-environment jsdom

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
            shell: {
                immersive_header: false,
                launcher_icon_follows_theme: false,
                composer_shape: 'standard',
                composer_plus: 'drawer',
            },
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
    // The panel remembers the section you left, and jsdom keeps one localStorage
    // for the whole file — so without this, one test's trip through Motion
    // decides where every later test opens. Worth knowing rather than papering
    // over: it is exactly the behaviour the "opens again on the section you
    // left" test below asserts.
    localStorage.clear()
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
    it('MOTION-SETTINGS-02 gives every Design/Motion panel the shared active-motion contract', async () => {
        const wrapper = mount(TalosMobileSettingsAppearancePanel, {
            attachTo: document.body,
            global: {
                stubs: {
                    TalosThemedSelect: true,
                    TalosMobileVoiceSettings: true,
                },
            },
        })

        for (const label of ['Design', 'Motion']) {
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

    it('opens again on the section you left, not on the one that happens to be first', async () => {
        // Before the shared strip, Appearance always came back on Design, so
        // someone tuning Motion paid for the trip on every visit. The proof is a
        // second, independent mount — not a call to the memory.
        const first = mount(TalosMobileSettingsAppearancePanel, {
            attachTo: document.body,
            global: { stubs: { TalosThemedSelect: true, TalosMobileVoiceSettings: true } },
        })
        await activateTab(first, 'Motion')
        first.unmount()

        const second = mount(TalosMobileSettingsAppearancePanel, {
            attachTo: document.body,
            global: { stubs: { TalosThemedSelect: true, TalosMobileVoiceSettings: true } },
        })
        expect(second.get('[data-appearance-section="motion"]').attributes('data-state')).toBe('active')
        // Not `.exists()`: Reka keeps an inactive panel in the DOM, hidden, so
        // the question is which one is showing — not which one is present.
        expect(second.find('[data-appearance-section="design"]').attributes('data-state')).not.toBe('active')
        second.unmount()
    })

    /**
     * The composer was three switches that influenced one another; the first
     * repair fused them into one list, and the owner caught it at once — "hai
     * mischiato la forma del compositore e il tipo della sezione +". They are
     * two questions: what the bar looks like, and where the "+" opens (which is
     * where attach, Library and Browse live). These keep them apart.
     */
    it('asks the two questions separately, and stores each on its own', () => {
        const wrapper = mount(TalosMobileSettingsAppearancePanel, {
            attachTo: document.body,
            global: { stubs: { TalosThemedSelect: true, TalosMobileVoiceSettings: true } },
        })
        const select = (label: string) => wrapper.findAllComponents({ name: 'TalosThemedSelect' })
            .find((entry) => entry.props('ariaLabel') === label)

        expect((select('Composer shape')?.props('items') as Array<{ value: string }>).map((i) => i.value))
            .toEqual(['classic', 'standard', 'compact'])
        expect((select('The “+” opens')?.props('items') as Array<{ value: string }>).map((i) => i.value))
            .toEqual(['drawer', 'menu'])

        select('Composer shape')?.vm.$emit('update:modelValue', 'compact')
        expect(stores.settings.setShell).toHaveBeenCalledWith({ composer_shape: 'compact' })
        select('The “+” opens')?.vm.$emit('update:modelValue', 'menu')
        expect(stores.settings.setShell).toHaveBeenCalledWith({ composer_plus: 'menu' })
        wrapper.unmount()
    })

    it('goes quiet about the “+” on the classic bar, and says why', async () => {
        // The classic row carries attach, context and Browse inline, so there
        // is no "+" for the setting to place. Offered but inert, with the
        // reason beside it — never a live-looking control that does nothing.
        stores.settings.state.shell.composer_shape = 'classic'
        const wrapper = mount(TalosMobileSettingsAppearancePanel, {
            attachTo: document.body,
            global: { stubs: { TalosThemedSelect: true, TalosMobileVoiceSettings: true } },
        })

        const plus = wrapper.findAllComponents({ name: 'TalosThemedSelect' })
            .find((entry) => entry.props('ariaLabel') === 'The “+” opens')
        expect(plus?.props('disabled')).toBe(true)
        expect(wrapper.text()).toContain('The classic bar has no')

        stores.settings.state.shell.composer_shape = 'standard'
        wrapper.unmount()
    })

    it('refuses a value it never offered, instead of storing it', () => {
        const wrapper = mount(TalosMobileSettingsAppearancePanel, {
            attachTo: document.body,
            global: { stubs: { TalosThemedSelect: true, TalosMobileVoiceSettings: true } },
        })
        wrapper.findAllComponents({ name: 'TalosThemedSelect' })
            .find((entry) => entry.props('ariaLabel') === 'Composer shape')
            ?.vm.$emit('update:modelValue', 'a-shape-we-never-shipped')

        expect(stores.settings.setShell).not.toHaveBeenCalled()
        wrapper.unmount()
    })

    it('keeps the everyday settings in the open and folds the rest away, still closed', () => {
        // Owner 2026-08-02: twelve settings on one plane. Folded, not deleted —
        // a disclosure that starts open is the same wall with an extra click.
        const wrapper = mount(TalosMobileSettingsAppearancePanel, {
            attachTo: document.body,
            global: { stubs: { TalosThemedSelect: true, TalosMobileVoiceSettings: true } },
        })
        const advanced = wrapper.get('[data-testid="talos-appearance-advanced"]')
        expect(advanced.attributes('open')).toBeUndefined()

        const inside = (label: string): boolean => advanced.findAllComponents({ name: 'TalosThemedSelect' })
            .some((select) => select.props('ariaLabel') === label)
        expect(inside('Chat message style')).toBe(true)
        expect(inside('Answer animation')).toBe(true)
        // …and the ones people actually come here for are not behind it.
        expect(inside('Theme preset')).toBe(false)
        expect(inside('Composer shape')).toBe(false)
        wrapper.unmount()
    })

    it('has no hand-drawn switch left in this panel', () => {
        // "One switch app-wide" was claimed on 2026-08-02 while five of them
        // were still drawn by hand right here. A claim worth re-checking rather
        // than repeating.
        const wrapper = mount(TalosMobileSettingsAppearancePanel, {
            attachTo: document.body,
            global: { stubs: { TalosThemedSelect: true, TalosMobileVoiceSettings: true } },
        })
        const switches = wrapper.findAll('[role="switch"]')
        expect(switches.length).toBeGreaterThan(0)
        expect(switches.every((control) => control.attributes('data-testid') === 'talos-themed-switch'))
            .toBe(true)
        wrapper.unmount()
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
        await tapSwitch(wrapper, 'Background motion')
        await tapSwitch(wrapper, 'Interface motion')
        await wrapper.get('[aria-label="Background speed"]').setValue('150')
        await tapSwitch(wrapper, 'Pause motion when hidden')

        expect(stores.settings.setMotionPreferences).toHaveBeenCalledWith({ mode: 'complex' })
        expect(stores.settings.setMotionPreferences).toHaveBeenCalledWith({ background_enabled: false })
        expect(stores.settings.setMotionPreferences).toHaveBeenCalledWith({ interface_enabled: false })
        expect(stores.settings.setMotionPreferences).toHaveBeenCalledWith({ speed: 150 })
        expect(stores.settings.setMotionPreferences).toHaveBeenCalledWith({ pause_when_hidden: false })
    })
})

/**
 * The motion switches are the shared TalosThemedSwitch since 2026-08-02, so they
 * are buttons carrying role="switch" and aria-checked — not native checkboxes.
 * Reading `.checked` on them returns undefined and setting it does nothing, so
 * the tests below read the announced state and tap the control instead.
 */
function switchState(wrapper: ReturnType<typeof mount>, label: string): string | undefined {
    return wrapper.get(`[role="switch"][aria-label="${label}"]`).attributes('aria-checked')
}

async function tapSwitch(wrapper: ReturnType<typeof mount>, label: string): Promise<void> {
    await wrapper.get(`[role="switch"][aria-label="${label}"]`).trigger('click')
}

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
        // Announced OFF even though the flag is set, because the renderer is off.
        expect(switchState(wrapper, 'Background motion')).toBe('false')
        await tapSwitch(wrapper, 'Background motion')
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
        expect(switchState(wrapper, 'Background motion')).toBe('true')
        await tapSwitch(wrapper, 'Background motion')
        expect(stores.settings.setMotionPreferences).toHaveBeenCalledWith({ background_enabled: false })
        wrapper.unmount()
    })
})
