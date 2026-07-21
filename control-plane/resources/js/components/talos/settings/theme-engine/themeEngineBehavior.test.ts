// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, defineComponent, h, nextTick } from 'vue'
import { createDefaultTalosMotionV6Preferences } from '../../../../motion-v6/defaults'

const settingsHarness = vi.hoisted(() => {
    const mockRef = <T>(value: T) => ({ __v_isRef: true, value })

    return {
        settings: mockRef<Record<string, unknown> | null>(null),
        settingsError: mockRef(''),
        settingsSavedMessage: mockRef(''),
        savingSettings: mockRef(false),
    }
})

const settingsActions = vi.hoisted(() => ({
    loadSettings: vi.fn(),
    updateSettings: vi.fn(),
}))

Object.assign(settingsHarness, settingsActions)

vi.mock('../../../../composables/useTalosSettings', () => ({
    useTalosSettings: () => settingsHarness,
}))

import TalosThemeEngine from '../TalosThemeEngine.vue'

const mounted: Array<ReturnType<typeof createApp>> = []

function baseSettings(preferences: Record<string, unknown> = {}) {
    return {
        id: 'default',
        preferences: {
            theme: 'forge',
            theme_customization: {},
            theme_library: [],
            ...preferences,
        },
    }
}

function mountTheme(
    preferences: Record<string, unknown> = {},
    options: { onChangeTheme?: (theme: string) => void; initialTab?: string } = {},
) {
    const container = document.createElement('div')
    document.body.append(container)
    settingsHarness.settings.value = baseSettings(preferences)
    settingsHarness.loadSettings.mockResolvedValue(settingsHarness.settings.value)
    settingsHarness.updateSettings.mockImplementation(async (payload: { preferences?: Record<string, unknown> }) => {
        const next = {
            ...settingsHarness.settings.value,
            preferences: {
                ...(settingsHarness.settings.value as { preferences?: Record<string, unknown> } | null)?.preferences,
                ...payload.preferences,
            },
        }
        settingsHarness.settings.value = next
        return next
    })

    const app = createApp(defineComponent({
        setup() {
            return () => h(TalosThemeEngine, {
                theme: 'forge',
                initialTab: options.initialTab,
                onChangeTheme: options.onChangeTheme,
            })
        },
    }))

    mounted.push(app)
    app.mount(container)

    return container
}

async function clickByText(container: HTMLElement, text: string) {
    const button = Array.from(container.querySelectorAll<HTMLButtonElement>('button')).find((item) => item.textContent?.trim() === text)
    expect(button).toBeTruthy()
    button?.click()
    await nextTick()
}

async function fillField(container: HTMLElement, label: string, value: string) {
    const field = container.querySelector<HTMLInputElement | HTMLTextAreaElement>(`[aria-label="${label}"]`)
    expect(field).toBeTruthy()
    if (!field) return
    field.value = value
    field.dispatchEvent(new Event('input', { bubbles: true }))
    await nextTick()
}

// reka Select (themed dropdown) needs these APIs jsdom omits.
if (!Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = () => undefined
}
if (!Element.prototype.hasPointerCapture) {
    Element.prototype.hasPointerCapture = () => false
    Element.prototype.setPointerCapture = () => undefined
    Element.prototype.releasePointerCapture = () => undefined
}

function firePointer(element: Element, type: 'pointerdown' | 'pointerup') {
    const Ctor = typeof PointerEvent === 'function' ? PointerEvent : MouseEvent
    element.dispatchEvent(new Ctor(type, { bubbles: true, cancelable: true, button: 0 }))
}

async function themedSettle() {
    await nextTick()
    await new Promise((resolve) => setTimeout(resolve, 0))
    await nextTick()
}

// Drives a themed TalosThemedSelect (reka) by aria-label: open, then commit the
// target value with the keyboard (jsdom cannot settle reka's synthetic pointerup).
async function selectField(container: HTMLElement, label: string, value: string) {
    const trigger = container.querySelector<HTMLElement>(`[aria-label="${label}"]`)
    expect(trigger).toBeTruthy()
    if (!trigger) return
    firePointer(trigger, 'pointerdown')
    await themedSettle()
    const option = document.querySelector<HTMLElement>(`[data-value="${value}"]`)
    expect(option).toBeTruthy()
    option?.focus()
    option?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
    await themedSettle()
}

beforeEach(() => {
    settingsHarness.settingsError.value = ''
    settingsHarness.settingsSavedMessage.value = ''
    settingsHarness.savingSettings.value = false
    settingsHarness.loadSettings.mockReset()
    settingsHarness.updateSettings.mockReset()
    if (!window.requestAnimationFrame) {
        window.requestAnimationFrame = (callback: FrameRequestCallback) => window.setTimeout(callback, 0)
    }
})

afterEach(() => {
    mounted.splice(0).forEach((app) => app.unmount())
    document.body.replaceChildren()
})

describe('Theme Engine behavior', () => {
    it('opens the requested tab when launched from another settings surface', async () => {
        const container = mountTheme({}, { initialTab: 'motion' })
        await nextTick()

        expect(container.querySelector('#talos-theme-control-tab-motion')?.getAttribute('aria-selected')).toBe('true')
        expect(container.querySelector('[data-testid="talos-motion-v6-editor"]')).toBeTruthy()
    })

    it('renders the complete Motion V6 control surface and saves one exact delta', async () => {
        const container = mountTheme()
        await nextTick()
        await clickByText(container, 'Motion')

        for (const label of ['Off', 'Static', 'Simple', 'Complex', 'Adaptive']) {
            expect(Array.from(container.querySelectorAll('button')).some((button) => button.textContent?.trim() === label)).toBe(true)
        }
        for (const label of [
            'Motion speed', 'Background intensity', 'Glow / lens flare', 'Scene density', 'Scene depth', 'Trail strength',
            'Ambient contrast', 'Parallax depth', 'Interface duration', 'Interface intensity', 'Interface stagger',
        ]) {
            expect(container.querySelector(`[aria-label="${label}"]`)).toBeTruthy()
        }
        for (const label of [
            'Procedural background', 'Interface motion', 'Pause when hidden', 'Respect data saver',
            'Animate windows', 'Animate surfaces', 'Animate navigation', 'Animate composer',
            'Animate messages', 'Animate feedback',
        ]) {
            expect(container.querySelector(`[aria-label="${label}"]`)).toBeTruthy()
        }

        await clickByText(container, 'Complex')
        const speed = container.querySelector<HTMLInputElement>('[aria-label="Motion speed"]')!
        speed.value = '145'
        speed.dispatchEvent(new Event('input', { bubbles: true }))
        await nextTick()
        const glow = container.querySelector<HTMLInputElement>('[aria-label="Glow / lens flare"]')!
        expect(glow.value).toBe('0')
        glow.value = '70'
        glow.dispatchEvent(new Event('input', { bubbles: true }))
        await nextTick()
        expect(settingsHarness.updateSettings).not.toHaveBeenCalled()

        await clickByText(container, 'Save motion')
        await vi.waitFor(() => expect(settingsHarness.updateSettings).toHaveBeenCalledOnce())
        const payload = settingsHarness.updateSettings.mock.calls[0][0] as { preferences?: Record<string, unknown> }
        expect(Object.keys(payload.preferences ?? {})).toEqual(['theme_motion_v6'])
        expect(payload.preferences?.theme_motion_v6).toMatchObject({ mode: 'complex', speed: 145, glow_intensity: 70 })
        expect(container.textContent).toContain('Requested')
        expect(container.textContent).toContain('Effective')
    })

    it('shows the canonical 50 percent interface duration on first run and after interface reset', async () => {
        const customized = createDefaultTalosMotionV6Preferences()
        customized.interface.duration_scale = 125
        const freshContainer = mountTheme()
        await nextTick()
        await clickByText(freshContainer, 'Motion')

        const freshDuration = freshContainer.querySelector<HTMLInputElement>('[aria-label="Interface duration"]')
        expect(freshDuration?.value).toBe('50')
        expect(freshDuration?.closest('label')?.querySelector('output')?.textContent?.trim()).toBe('50%')

        const customizedContainer = mountTheme({ theme_motion_v6: customized })
        await nextTick()
        await clickByText(customizedContainer, 'Motion')
        const duration = customizedContainer.querySelector<HTMLInputElement>('[aria-label="Interface duration"]')
        expect(duration?.value).toBe('125')
        expect(duration?.closest('label')?.querySelector('output')?.textContent?.trim()).toBe('125%')

        await clickByText(customizedContainer, 'Reset interface')
        expect(duration?.value).toBe('50')
        expect(duration?.closest('label')?.querySelector('output')?.textContent?.trim()).toBe('50%')
        expect(settingsHarness.updateSettings).not.toHaveBeenCalled()
    })

    it('shows renderer-off background as disabled and restores Adaptive when the user enables it', async () => {
        const motion = createDefaultTalosMotionV6Preferences()
        motion.mode = 'off'
        motion.background_enabled = true
        motion.interface_enabled = true
        motion.interface.profile = 'expressive'
        const container = mountTheme({ theme_motion_v6: motion }, { initialTab: 'motion' })
        await nextTick()
        await vi.waitFor(() => expect(settingsHarness.loadSettings).toHaveBeenCalledOnce())
        await nextTick()

        const background = container.querySelector<HTMLInputElement>('[aria-label="Procedural background"]')
        const interfaceMotion = container.querySelector<HTMLInputElement>('[aria-label="Interface motion"]')
        expect(background?.checked).toBe(false)
        expect(interfaceMotion?.checked).toBe(true)
        expect(container.querySelector('[data-testid="talos-background-motion-state"]')?.textContent).toContain('Off')
        expect(container.querySelector('[data-testid="talos-interface-motion-state"]')?.textContent).toContain('Active')
        expect(container.querySelector('[aria-label="Motion mode Off"]')?.getAttribute('aria-pressed')).toBe('true')

        background?.click()
        await nextTick()

        expect(container.querySelector('[aria-label="Motion mode Adaptive"]')?.getAttribute('aria-pressed')).toBe('true')
        expect(container.querySelector<HTMLInputElement>('[aria-label="Procedural background"]')?.checked).toBe(true)
        expect(container.querySelector<HTMLInputElement>('[aria-label="Interface motion"]')?.checked).toBe(true)
        expect(container.querySelector('[data-testid="talos-background-motion-state"]')?.textContent).toContain('Active')
        await clickByText(container, 'Save motion')
        await vi.waitFor(() => expect(settingsHarness.updateSettings).toHaveBeenCalledOnce())
        expect(settingsHarness.updateSettings.mock.calls[0]?.[0]?.preferences?.theme_motion_v6).toMatchObject({
            mode: 'adaptive',
            background_enabled: true,
            interface_enabled: true,
            interface: { profile: 'expressive' },
        })
    })

    it('shows an off interface profile as disabled and restores the preset profile when enabled', async () => {
        const motion = createDefaultTalosMotionV6Preferences()
        motion.interface_enabled = true
        motion.interface.profile = 'off'
        const container = mountTheme({ theme_motion_v6: motion }, { initialTab: 'motion' })
        await nextTick()
        await vi.waitFor(() => expect(settingsHarness.loadSettings).toHaveBeenCalledOnce())
        await nextTick()

        const interfaceMotion = container.querySelector<HTMLInputElement>('[aria-label="Interface motion"]')
        expect(interfaceMotion?.checked).toBe(false)
        expect(container.querySelector('[data-testid="talos-interface-motion-state"]')?.textContent).toContain('Off')

        interfaceMotion?.click()
        await nextTick()

        expect(container.querySelector<HTMLInputElement>('[aria-label="Interface motion"]')?.checked).toBe(true)
        expect(container.querySelector<HTMLElement>('[aria-label="Interface motion profile"]')?.textContent).toContain('Preset')
        expect(container.querySelector('[data-testid="talos-interface-motion-state"]')?.textContent).toContain('Active')
        await clickByText(container, 'Save motion')
        await vi.waitFor(() => expect(settingsHarness.updateSettings).toHaveBeenCalledOnce())
        expect(settingsHarness.updateSettings.mock.calls[0]?.[0]?.preferences?.theme_motion_v6).toMatchObject({
            mode: 'off',
            interface_enabled: true,
            interface: { profile: 'preset' },
        })
    })

    it('rolls a rejected Motion V6 edit back and exposes an explicit retry', async () => {
        const defaults = createDefaultTalosMotionV6Preferences()
        const container = mountTheme({ theme_motion_v6: defaults })
        settingsHarness.updateSettings.mockRejectedValueOnce(new Error('motion write rejected'))
        await nextTick()
        await clickByText(container, 'Motion')
        await clickByText(container, 'Complex')
        await clickByText(container, 'Save motion')

        await vi.waitFor(() => expect(container.textContent).toContain('motion write rejected'))
        expect(container.textContent).toContain('Retry last change')
        expect(container.querySelector('[aria-label="Motion mode Complex"]')?.getAttribute('aria-pressed')).toBe('false')
        expect(container.querySelector('[aria-label="Motion mode Off"]')?.getAttribute('aria-pressed')).toBe('true')
    })

    it('runs a stable real-scene product preview without persisting draft interactions', async () => {
        const container = mountTheme()
        await nextTick()
        await clickByText(container, 'Motion')
        await clickByText(container, 'Adaptive')
        await nextTick()
        const preview = container.querySelector<HTMLElement>('[data-testid="talos-motion-v6-preview"]')
        expect(preview).toBeTruthy()
        expect(preview?.querySelector('[data-talos-motion-stage]')).toBeTruthy()
        expect(preview?.querySelector('[data-preview-sample="window"]')).toBeTruthy()
        expect(preview?.querySelector('[data-preview-sample="menu"]')).toBeTruthy()
        expect(preview?.querySelector('[data-preview-sample="message"]')).toBeTruthy()
        expect(preview?.querySelector('[data-preview-sample="feedback"]')?.textContent).toContain('Success')
        expect(preview?.querySelector('[data-preview-sample="feedback"]')?.textContent).toContain('Warning')
        expect(preview?.querySelector('[data-preview-sample="feedback"]')?.textContent).toContain('Error')

        const previewRoot = preview
        for (const label of ['Light preview', 'Pause preview', 'Restart preview']) {
            const control = preview?.querySelector<HTMLButtonElement>(`[aria-label="${label}"]`)
            expect(control).toBeTruthy()
            control?.focus()
            expect(document.activeElement).toBe(control)
            control?.click()
            await nextTick()
        }

        expect(container.querySelector('[data-testid="talos-motion-v6-preview"]')).toBe(previewRoot)
        expect(preview?.querySelector('[data-testid="talos-motion-preview-diagnostics"]')?.textContent).toContain('adaptive')
        expect(settingsHarness.updateSettings).not.toHaveBeenCalled()
    })

    it('exports the active draft as strict talos_theme_export_v2 with Motion V6', async () => {
        const container = mountTheme()
        await nextTick()
        await clickByText(container, 'Motion')
        await clickByText(container, 'Complex')
        await clickByText(container, 'Library')
        await clickByText(container, 'Export active theme')

        const raw = container.querySelector<HTMLTextAreaElement>('[aria-label="Exported theme JSON"]')?.value ?? ''
        const exported = JSON.parse(raw)
        expect(exported).toMatchObject({
            schema: 'talos_theme_export_v2',
            theme: {
                base_theme: 'forge',
                motion_v6: { mode: 'complex', schema_version: 1 },
            },
        })
        expect(exported.theme).not.toHaveProperty('motion')
        expect(exported.theme).not.toHaveProperty('ui_animation_profile')
        expect(exported.theme).not.toHaveProperty('ui_animation_customization')
        expect(settingsHarness.updateSettings).not.toHaveBeenCalled()
    })

    it('imports and persists a strict V2 named theme with its Motion V6 policy', async () => {
        const motionV6 = createDefaultTalosMotionV6Preferences()
        motionV6.mode = 'simple'
        motionV6.scene_override = 'aurora'
        const container = mountTheme()
        await nextTick()
        await clickByText(container, 'Library')
        await fillField(container, 'Import theme JSON', JSON.stringify({
            schema: 'talos_theme_export_v2',
            exported_at: '2026-07-12T07:00:00.000Z',
            theme: {
                id: 'motion-v2-import',
                name: 'Motion V2 Import',
                base_theme: 'aurora',
                tokens: {},
                motion_v6: motionV6,
            },
        }))
        await clickByText(container, 'Import theme')

        await vi.waitFor(() => expect(settingsHarness.updateSettings).toHaveBeenCalledOnce())
        const preferences = settingsHarness.updateSettings.mock.calls[0][0].preferences as Record<string, unknown>
        expect(preferences.theme_motion_v6).toEqual(motionV6)
        expect(preferences.theme_library).toEqual([
            expect.objectContaining({ id: 'motion-v2-import', motion_v6: motionV6 }),
        ])
    })
    it('shows an unsafe customization error and does not write it', async () => {
        const container = mountTheme()
        await nextTick()
        await clickByText(container, 'Customize')
        await fillField(container, 'Background color', '#000000')
        await fillField(container, 'Panel color', '#000000')
        await fillField(container, 'Text color', '#010101')
        await clickByText(container, 'Save customization')

        expect(settingsHarness.updateSettings).not.toHaveBeenCalled()
        expect(container.textContent).toContain('contrast')
    })

    it('rejects a globally safe customization when it makes existing area tokens unreadable', async () => {
        const container = mountTheme({
            theme_customization: {
                background: '#ffffff',
                panel: '#ffffff',
                text: '#111827',
            },
            theme_area_tokens: {
                composer: {
                    background: '#ffffff',
                    surface: '#ffffff',
                },
            },
        })
        await nextTick()
        await clickByText(container, 'Customize')
        await fillField(container, 'Background color', '#111827')
        await fillField(container, 'Panel color', '#1f2937')
        await fillField(container, 'Text color', '#f9fafb')
        await clickByText(container, 'Save customization')

        expect(settingsHarness.updateSettings).not.toHaveBeenCalled()
        expect(container.textContent).toContain('composer')
        expect(container.textContent).toContain('contrast')
    })

    it('shows a blank rename error and does not write it', async () => {
        const container = mountTheme({
            theme_library: [{
                id: 'saved-theme',
                name: 'Saved Theme',
                base_theme: 'forge',
                tokens: {},
            }],
        })
        await nextTick()
        await clickByText(container, 'Library')
        await clickByText(container, 'Rename')
        await fillField(container, 'Rename theme', '')
        await clickByText(container, 'Save name')

        expect(settingsHarness.updateSettings).not.toHaveBeenCalled()
        expect(container.textContent).toContain('Theme name is required.')
    })

    it('renders the product preview in Customize', async () => {
        const container = mountTheme()
        await nextTick()
        await clickByText(container, 'Customize')

        expect(container.querySelector('[data-testid="talos-theme-product-preview"]')).toBeTruthy()
        expect(container.querySelector('[data-testid="talos-theme-preview-message"]')).toBeTruthy()
        expect(container.querySelector('[data-testid="talos-theme-preview-code"]')).toBeTruthy()
        expect(container.querySelector('[data-testid="talos-theme-preview-input"]')).toBeTruthy()
        expect(container.querySelector('[data-testid="talos-theme-product-preview"]')?.textContent).toContain('inter')
        expect(container.querySelector('[data-testid="talos-theme-product-preview"]')?.textContent).toContain('balanced messages, full composer')
        expect(container.querySelector('[data-testid="talos-theme-product-preview"]')?.textContent).toContain('#c98b32')
    })

    it('keeps legacy effect values as inert migration data when saving another customization', async () => {
        const container = mountTheme({
            theme_customization: {
                effect: 'trace-rain',
                effect_intensity: 88,
            },
        })
        await nextTick()
        await clickByText(container, 'Customize')

        expect(container.querySelector('[aria-label="Background effect"]')).toBeNull()
        expect(container.querySelector('[aria-label="Effect intensity"]')).toBeNull()

        await selectField(container, 'Font', 'mono')
        await clickByText(container, 'Save customization')

        await vi.waitFor(() => expect(settingsHarness.updateSettings).toHaveBeenCalledOnce())
        const payload = settingsHarness.updateSettings.mock.calls[0][0] as { preferences?: Record<string, unknown> }
        expect(payload.preferences?.theme_customization).toMatchObject({
            effect: 'trace-rain',
            effect_intensity: 88,
            font: 'mono',
        })
    })

    it('renders every preview font option with bundled product families only', async () => {
        const container = mountTheme()
        await nextTick()
        await clickByText(container, 'Customize')
        const preview = container.querySelector<HTMLElement>('[data-testid="talos-theme-product-preview"]')
        const expectedStacks = {
            inter: '"Instrument Sans", Manrope',
            manrope: 'Manrope, "Instrument Sans"',
            mono: '"JetBrains Mono"',
            system: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
            display: 'Sora, Manrope',
            serif: '"Source Serif 4", "Instrument Sans"',
        }

        for (const [font, expectedStack] of Object.entries(expectedStacks)) {
            await selectField(container, 'Font', font)
            expect(preview?.style.getPropertyValue('--talos-preview-font')).toBe(expectedStack)
        }

        expect(preview?.getAttribute('style')).not.toMatch(/Orbitron|\bInter\b|Geist|system-ui|Segoe UI|IBM Plex Mono|Cascadia/)
    })

    it('uses the preset declared font in the product preview when no font override exists', async () => {
        const container = mountTheme({ theme: 'paper' })
        await nextTick()
        await clickByText(container, 'Customize')

        const preview = container.querySelector<HTMLElement>('[data-testid="talos-theme-product-preview"]')
        expect(preview?.style.getPropertyValue('--talos-preview-font')).toBe('"Source Serif 4", "Instrument Sans"')
        expect(preview?.textContent).toContain('serif')
    })

    it('does not use placeholder copy inside Theme Engine inputs', async () => {
        const container = mountTheme()
        await nextTick()

        for (const tab of ['Customize', 'Library', 'Advanced']) {
            await clickByText(container, tab)
            expect(container.querySelector('[placeholder]')).toBeNull()
        }
    })

    it.each([
        {
            missingField: 'base_theme',
            expectedError: 'Theme import requires theme.base_theme to name a supported base preset.',
        },
        {
            missingField: 'tokens',
            expectedError: 'Theme import requires theme.tokens to be an object.',
        },
    ])('rejects a raw import missing $missingField before persistence', async ({ missingField, expectedError }) => {
        const container = mountTheme()
        await nextTick()
        await clickByText(container, 'Library')
        const theme: Record<string, unknown> = {
            id: 'raw-import',
            name: 'Raw Import',
            base_theme: 'paper',
            tokens: {},
        }
        delete theme[missingField]
        await fillField(container, 'Import theme JSON', JSON.stringify({
            schema: 'talos_theme_export_v1',
            exported_at: '2026-07-10T12:00:00.000Z',
            theme,
        }))
        await clickByText(container, 'Import theme')

        expect(settingsHarness.updateSettings).not.toHaveBeenCalled()
        expect(container.textContent).toContain(expectedError)
    })

    it('rejects a strict import with unreadable area tokens before persistence', async () => {
        const container = mountTheme()
        await nextTick()
        await clickByText(container, 'Library')
        await fillField(container, 'Import theme JSON', JSON.stringify({
            schema: 'talos_theme_export_v1',
            exported_at: '2026-07-10T12:00:00.000Z',
            theme: {
                id: 'unsafe-area-import',
                name: 'Unsafe Area Import',
                base_theme: 'paper',
                tokens: {},
                area_tokens: {
                    composer: {
                        background: '#000000',
                        surface: '#000000',
                        text: '#111111',
                        muted: '#222222',
                    },
                },
            },
        }))
        await clickByText(container, 'Import theme')

        expect(settingsHarness.updateSettings).not.toHaveBeenCalled()
        expect(container.textContent).toContain('contrast')
    })

    it('rejects a strict import with invalid nested values instead of silently cleaning it', async () => {
        const container = mountTheme()
        await nextTick()
        await clickByText(container, 'Library')
        await fillField(container, 'Import theme JSON', JSON.stringify({
            schema: 'talos_theme_export_v1',
            exported_at: '2026-07-10T12:00:00.000Z',
            theme: {
                id: 'invalid-nested-import',
                name: 'Invalid Nested Import',
                base_theme: 'forge',
                tokens: {
                    font: 'not-a-font',
                    effect_intensity: 999,
                },
                motion: 'warp',
            },
        }))
        await clickByText(container, 'Import theme')

        expect(settingsHarness.updateSettings).not.toHaveBeenCalled()
        expect(container.textContent).toContain('rejected')
    })

    it('rejects an imported theme whose id already exists instead of replacing it', async () => {
        const container = mountTheme({
            theme_library: [{
                id: 'existing-theme',
                name: 'Existing Theme',
                base_theme: 'forge',
                tokens: {},
            }],
        })
        await nextTick()
        await clickByText(container, 'Library')
        await fillField(container, 'Import theme JSON', JSON.stringify({
            schema: 'talos_theme_export_v1',
            exported_at: '2026-07-10T12:00:00.000Z',
            theme: {
                id: 'existing-theme',
                name: 'Replacement Theme',
                base_theme: 'paper',
                tokens: {},
            },
        }))
        await clickByText(container, 'Import theme')

        expect(settingsHarness.updateSettings).not.toHaveBeenCalled()
        expect(container.textContent).toContain('already exists')
    })

    it('shows an unsafe area contrast error and does not write area tokens', async () => {
        const container = mountTheme({ theme: 'paper' })
        await nextTick()
        await clickByText(container, 'Advanced')
        await fillField(container, 'Area background', '#000000')
        await fillField(container, 'Area surface', '#000000')
        await fillField(container, 'Area text', '#111111')
        await fillField(container, 'Area muted', '#222222')
        await clickByText(container, 'Save area tokens')

        expect(settingsHarness.updateSettings).not.toHaveBeenCalled()
        expect(container.textContent).toContain('Area token contrast rejected:')
        expect(container.textContent).toContain('composer')
    })

    it('rejects a non-hex Advanced value instead of treating it as an area reset', async () => {
        const container = mountTheme()
        await nextTick()
        await clickByText(container, 'Advanced')
        await fillField(container, 'Area background', 'red')
        await clickByText(container, 'Save area tokens')

        expect(settingsHarness.updateSettings).not.toHaveBeenCalled()
        expect(container.textContent).toContain('six-digit hex')
    })

    it('persists a Claudius font-only change without materializing preview colors', async () => {
        const container = mountTheme({ theme: 'claudius' })
        await nextTick()
        await clickByText(container, 'Customize')
        await selectField(container, 'Font', 'manrope')
        await clickByText(container, 'Save customization')

        const payload = settingsHarness.updateSettings.mock.calls[0]?.[0] as {
            preferences?: { theme_customization?: Record<string, unknown> }
        }
        expect(payload.preferences?.theme_customization).toEqual({ font: 'manrope' })
    })

    it('keeps motion, areas, and chat layout when Reset customization is used', async () => {
        const areaTokens = { composer: { background: '#111827' } }
        const chatLayout = { bubble_scale: 'expanded', composer_mode: 'minimal', advanced_rail_expanded: true }
        const container = mountTheme({
            theme: 'claudius',
            theme_customization: { font: 'manrope' },
            theme_area_tokens: areaTokens,
            theme_mode: 'dark',
            theme_motion: 'cinematic',
            theme_motion_disabled: true,
            theme_background_disabled: true,
            ui_animation_profile: 'custom',
            ui_animation_customization: { intensity: 88 },
            active_custom_theme_id: 'claudius-custom',
            chat_layout: chatLayout,
        })
        await nextTick()
        await clickByText(container, 'Customize')
        await clickByText(container, 'Reset customization')

        const preferences = settingsHarness.updateSettings.mock.calls[0]?.[0]?.preferences as Record<string, unknown>
        expect(preferences).toEqual({
            theme_customization: {},
            active_custom_theme_id: null,
        })
        expect((settingsHarness.settings.value as { preferences: Record<string, unknown> }).preferences).toMatchObject({
            theme_area_tokens: areaTokens,
            theme_mode: 'dark',
            theme_motion: 'cinematic',
            theme_motion_disabled: true,
            theme_background_disabled: true,
            ui_animation_profile: 'custom',
            ui_animation_customization: { intensity: 88 },
            chat_layout: chatLayout,
        })
    })

    it('rolls a Motion V6 background switch back when persistence is rejected', async () => {
        const container = mountTheme({ theme_background_disabled: true })
        await nextTick()
        await clickByText(container, 'Motion')
        settingsHarness.updateSettings.mockRejectedValueOnce(new Error('Rejected settings write.'))
        const control = container.querySelector<HTMLInputElement>('[aria-label="Procedural background"]')
        expect(control?.checked).toBe(false)

        control?.click()
        await nextTick()
        expect(control?.checked).toBe(true)
        expect(container.textContent).toContain('Unsaved motion changes')
        expect(Array.from(container.querySelectorAll<HTMLButtonElement>('button')).find((button) => button.textContent?.includes('Save motion'))?.disabled).toBe(false)
        expect(settingsHarness.updateSettings).not.toHaveBeenCalled()
        await clickByText(container, 'Save motion')
        await vi.waitFor(() => expect(settingsHarness.updateSettings).toHaveBeenCalledOnce())
        await vi.waitFor(() => expect(container.querySelector<HTMLInputElement>('[aria-label="Procedural background"]')?.checked).toBe(false))
    })

    it('offers one reset control for every Motion V6 value and saves canonical defaults only on confirmation', async () => {
        const customized = createDefaultTalosMotionV6Preferences()
        customized.mode = 'complex'
        customized.speed = 180
        customized.intensity = 92
        customized.contrast = 88
        customized.interface.profile = 'custom'
        customized.interface.duration_scale = 145
        customized.interface.categories.windows = false
        const container = mountTheme({ theme_motion_v6: customized })
        await nextTick()
        await clickByText(container, 'Motion')

        await clickByText(container, 'Reset all defaults')

        expect(container.querySelector<HTMLInputElement>('[aria-label="Background intensity"]')?.value).toBe('65')
        expect(container.querySelector<HTMLInputElement>('[aria-label="Motion speed"]')?.value).toBe('100')
        expect(container.querySelector<HTMLElement>('[aria-label="Interface motion profile"]')?.textContent).toContain('Preset')
        expect(container.querySelector<HTMLInputElement>('[aria-label="Animate windows"]')?.checked).toBe(true)
        expect(settingsHarness.updateSettings).not.toHaveBeenCalled()

        await clickByText(container, 'Save motion')
        await vi.waitFor(() => expect(settingsHarness.updateSettings).toHaveBeenCalledOnce())
        expect(settingsHarness.updateSettings.mock.calls[0]?.[0]?.preferences?.theme_motion_v6)
            .toEqual(createDefaultTalosMotionV6Preferences())
    })

    it('rolls theme mode and Motion V6 mode back when persistence is rejected', async () => {
        const container = mountTheme({ theme_mode: 'dark', theme_motion: 'cinematic' })
        await nextTick()

        let rejectColorMode!: (reason?: unknown) => void
        settingsHarness.updateSettings.mockImplementationOnce(() => new Promise((_, reject) => {
            rejectColorMode = reject
        }))
        await selectField(container, 'Theme color mode', 'light')
        await vi.waitFor(() => expect(settingsHarness.updateSettings).toHaveBeenCalledTimes(1))
        expect(settingsHarness.updateSettings.mock.calls[0]?.[0]?.preferences?.theme_mode).toBe('light')
        rejectColorMode(new Error('Rejected color-mode write.'))
        await vi.waitFor(() => expect(container.querySelector<HTMLElement>('[aria-label="Theme color mode"]')?.textContent).toContain('Dark'))

        await clickByText(container, 'Motion')
        let rejectMotionMode!: (reason?: unknown) => void
        settingsHarness.updateSettings.mockImplementationOnce(() => new Promise((_, reject) => {
            rejectMotionMode = reject
        }))
        await clickByText(container, 'Complex')
        await clickByText(container, 'Save motion')
        await vi.waitFor(() => expect(settingsHarness.updateSettings).toHaveBeenCalledTimes(2))
        rejectMotionMode(new Error('Rejected motion-mode write.'))
        await vi.waitFor(() => expect(container.querySelector('[aria-label="Motion mode Simple"]')?.getAttribute('aria-pressed')).toBe('true'))
    })

    it('rolls the renderer complexity selection back when persistence is rejected', async () => {
        const container = mountTheme({ theme_simple_animation: false })
        await nextTick()
        await clickByText(container, 'Motion')
        settingsHarness.updateSettings.mockRejectedValueOnce(new Error('Rejected animation-profile write.'))
        expect(container.querySelector('[aria-label="Motion mode Complex"]')?.getAttribute('aria-pressed')).toBe('true')

        await clickByText(container, 'Simple')
        await clickByText(container, 'Save motion')
        await vi.waitFor(() => expect(settingsHarness.updateSettings).toHaveBeenCalledOnce())
        await vi.waitFor(() => expect(container.querySelector('[aria-label="Motion mode Complex"]')?.getAttribute('aria-pressed')).toBe('true'))
    })

    it('rolls a named-theme apply back when persistence is rejected', async () => {
        const themeChanges: string[] = []
        localStorage.setItem('talos_theme', 'forge')
        const now = '2026-07-10T12:00:00.000Z'
        const container = mountTheme({
            theme: 'forge',
            theme_library: [{
                id: 'claudius-library-theme',
                name: 'Claudius library theme',
                base_theme: 'claudius',
                theme_mode: 'dark',
                tokens: {},
                area_tokens: {},
                motion: 'cinematic',
                ui_animation_profile: 'preset',
                ui_animation_customization: {},
                chat_layout: {},
                created_at: now,
                updated_at: now,
            }],
        }, {
            onChangeTheme: (theme) => {
                themeChanges.push(theme)
                localStorage.setItem('talos_theme', theme)
            },
        })
        await vi.waitFor(() => expect(themeChanges).toContain('forge'))
        themeChanges.splice(0)
        settingsHarness.updateSettings.mockRejectedValueOnce(new Error('Rejected named-theme write.'))

        await clickByText(container, 'Library')
        await clickByText(container, 'Apply')

        await vi.waitFor(() => expect(settingsHarness.updateSettings).toHaveBeenCalled())
        await Promise.resolve()
        await nextTick()
        expect(themeChanges).toEqual([])
        expect(localStorage.getItem('talos_theme')).toBe('forge')
    })
})
