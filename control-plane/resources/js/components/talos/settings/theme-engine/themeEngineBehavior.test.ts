// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, defineComponent, h, nextTick } from 'vue'

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
    options: { onChangeTheme?: (theme: string) => void } = {},
) {
    const container = document.createElement('div')
    document.body.append(container)
    settingsHarness.settings.value = baseSettings(preferences)
    settingsHarness.loadSettings.mockResolvedValue(settingsHarness.settings.value)
    settingsHarness.updateSettings.mockResolvedValue(settingsHarness.settings.value)

    const app = createApp(defineComponent({
        setup() {
            return () => h(TalosThemeEngine, {
                theme: 'forge',
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

async function selectField(container: HTMLElement, label: string, value: string) {
    const field = container.querySelector<HTMLSelectElement>(`[aria-label="${label}"]`)
    expect(field).toBeTruthy()
    if (!field) return
    field.value = value
    field.dispatchEvent(new Event('change', { bubbles: true }))
    await nextTick()
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
        expect(preferences).toMatchObject({
            theme_customization: {},
            theme_area_tokens: areaTokens,
            theme_mode: 'dark',
            theme_motion: 'cinematic',
            theme_motion_disabled: true,
            theme_background_disabled: true,
            ui_animation_profile: 'custom',
            ui_animation_customization: { intensity: 88 },
            active_custom_theme_id: null,
            chat_layout: chatLayout,
        })
    })

    it('rolls a motion switch back when persistence is rejected', async () => {
        const container = mountTheme({ theme_background_disabled: true })
        await nextTick()
        await clickByText(container, 'Motion')
        settingsHarness.updateSettings.mockRejectedValueOnce(new Error('Rejected settings write.'))
        const control = container.querySelector<HTMLInputElement>('[aria-label="Disable procedural background"]')
        expect(control?.checked).toBe(true)

        control?.click()
        await vi.waitFor(() => expect(settingsHarness.updateSettings).toHaveBeenCalled())
        await vi.waitFor(() => expect(container.querySelector<HTMLInputElement>('[aria-label="Disable procedural background"]')?.checked).toBe(true))
    })

    it('rolls theme mode and motion mode back when persistence is rejected', async () => {
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
        await vi.waitFor(() => expect(container.querySelector<HTMLSelectElement>('[aria-label="Theme color mode"]')?.value).toBe('dark'))

        await clickByText(container, 'Motion')
        let rejectMotionMode!: (reason?: unknown) => void
        settingsHarness.updateSettings.mockImplementationOnce(() => new Promise((_, reject) => {
            rejectMotionMode = reject
        }))
        await selectField(container, 'Theme motion', 'normal')
        await vi.waitFor(() => expect(settingsHarness.updateSettings).toHaveBeenCalledTimes(2))
        rejectMotionMode(new Error('Rejected motion-mode write.'))
        await vi.waitFor(() => expect(container.querySelector<HTMLSelectElement>('[aria-label="Theme motion"]')?.value).toBe('cinematic'))
    })

    it('rolls the animation complexity switch back when persistence is rejected', async () => {
        const container = mountTheme({ theme_simple_animation: false })
        await nextTick()
        await clickByText(container, 'Motion')
        settingsHarness.updateSettings.mockRejectedValueOnce(new Error('Rejected animation-profile write.'))
        const control = container.querySelector<HTMLInputElement>('[aria-label="Use simple animation"]')
        expect(control?.checked).toBe(false)

        control?.click()
        await vi.waitFor(() => expect(settingsHarness.updateSettings).toHaveBeenCalled())
        await vi.waitFor(() => expect(container.querySelector<HTMLInputElement>('[aria-label="Use simple animation"]')?.checked).toBe(false))
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
