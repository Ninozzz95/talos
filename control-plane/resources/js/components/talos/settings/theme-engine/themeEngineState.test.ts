import { describe, expect, it } from 'vitest'
import { TALOS_DEFAULT_CHAT_LAYOUT } from '../../../../lib/talosChatLayout'
import { buildTalosThemeExport } from '../../../../lib/talosThemes'
import { createDefaultTalosMotionV6Preferences } from '../../../../motion-v6/defaults'
import {
    applyTalosNamedThemePreferences,
    inspectStrictTalosThemeImport,
    parseStrictTalosThemeImport,
    resetTalosThemePreferences,
    resetTalosCustomizationPreferences,
    validateTalosThemeAreaForSave,
    validateTalosThemeForSave,
    validateTalosThemeStateForSave,
} from './themeEngineState'

describe('Theme Engine persistence contract', () => {
    it('gives a selected named theme precedence over the current chat layout', () => {
        const motionV6 = createDefaultTalosMotionV6Preferences()
        motionV6.mode = 'complex'
        const currentPreferences = {
            theme: 'forge',
            chat_layout: {
                bubble_scale: 'compact',
                composer_mode: 'minimal',
                advanced_rail_expanded: false,
            },
            unrelated_preference: 'preserve-me',
        }
        const namedTheme = {
            id: 'operator-theme',
            name: 'Operator Theme',
            base_theme: 'terminal' as const,
            tokens: {},
            motion_v6: motionV6,
            chat_layout: {
                bubble_scale: 'expanded' as const,
                composer_mode: 'full' as const,
                advanced_rail_expanded: true,
            },
        }

        const nextPreferences = applyTalosNamedThemePreferences(currentPreferences, namedTheme)

        expect(nextPreferences.chat_layout).toEqual(namedTheme.chat_layout)
        expect(nextPreferences.theme_motion_v6).toEqual(motionV6)
        expect(nextPreferences.unrelated_preference).toBe('preserve-me')
    })

    it('resets every applied customization while preserving the base preset, library, and unrelated settings', () => {
        const currentPreferences = {
            theme: 'aurora',
            theme_library: [{ id: 'saved-theme' }],
            unrelated_preference: { keep: true },
            theme_customization: { accent: '#ff0000' },
            theme_area_tokens: { composer: { background: '#000000' } },
            theme_mode: 'dark',
            theme_motion: 'cinematic',
            theme_motion_disabled: true,
            theme_simple_animation: false,
            theme_background_disabled: true,
            ui_animation_profile: 'custom',
            ui_animation_customization: { intensity: 90 },
            active_custom_theme_id: 'saved-theme',
            chat_layout: { bubble_scale: 'expanded', composer_mode: 'minimal', advanced_rail_expanded: true },
            theme_motion_v6: { ...createDefaultTalosMotionV6Preferences(), mode: 'complex' },
        }

        const resetPreferences = resetTalosThemePreferences(currentPreferences)

        expect(resetPreferences).toMatchObject({
            theme: 'aurora',
            theme_library: currentPreferences.theme_library,
            unrelated_preference: currentPreferences.unrelated_preference,
            theme_customization: {},
            theme_area_tokens: {},
            theme_mode: 'system',
            theme_motion: 'cinematic',
            theme_motion_disabled: true,
            theme_simple_animation: false,
            theme_background_disabled: true,
            ui_animation_profile: 'custom',
            ui_animation_customization: { intensity: 90 },
            active_custom_theme_id: null,
            chat_layout: TALOS_DEFAULT_CHAT_LAYOUT,
            theme_motion_v6: createDefaultTalosMotionV6Preferences(),
        })
    })

    it('resets only customization without clearing motion, areas, or chat layout', () => {
        const preferences = {
            theme: 'claudius',
            theme_customization: { font: 'manrope', accent: '#112233' },
            theme_area_tokens: { composer: { background: '#111827' } },
            theme_mode: 'dark',
            theme_motion: 'cinematic',
            theme_motion_disabled: true,
            theme_background_disabled: true,
            ui_animation_profile: 'custom',
            ui_animation_customization: { intensity: 88 },
            active_custom_theme_id: 'claudius-custom',
            chat_layout: { bubble_scale: 'expanded', composer_mode: 'minimal', advanced_rail_expanded: true },
        }

        expect(resetTalosCustomizationPreferences(preferences)).toEqual({
            ...preferences,
            theme_customization: {},
            active_custom_theme_id: null,
        })
    })

    it('rejects unsafe normal-text customization before persistence', () => {
        const result = validateTalosThemeForSave({
            background: '#000000',
            panel: '#000000',
            text: '#010101',
            accent: '#020202',
        })

        expect(result.valid).toBe(false)
        expect(result.errors.length).toBeGreaterThan(0)
    })

    it('validates customization against the selected base theme instead of Forge', () => {
        const customization = { text: '#777777' }
        const paperResult = validateTalosThemeForSave(customization, 'paper')
        const terminalResult = validateTalosThemeForSave(customization, 'terminal')
        const paperBackgroundError = paperResult.errors.find((error) => error.field === 'light/text-on-background')
        const terminalBackgroundError = terminalResult.errors.find((error) => error.field === 'light/text-on-background')

        expect(paperBackgroundError?.ratio).toBeTypeOf('number')
        expect(terminalBackgroundError?.ratio).toBeTypeOf('number')
        expect(paperBackgroundError?.ratio).not.toBe(terminalBackgroundError?.ratio)
    })

    it('imports strict V1 themes through Motion V6 migration and accepts strict V2 exports', () => {
        const validExport = {
            schema: 'talos_theme_export_v1',
            exported_at: '2026-07-10T12:00:00.000Z',
            theme: {
                id: 'imported-theme',
                name: 'Imported Theme',
                base_theme: 'aurora',
                tokens: {},
                chat_layout: {
                    bubble_scale: 'expanded',
                    composer_mode: 'minimal',
                    advanced_rail_expanded: true,
                },
            },
        }

        expect(parseStrictTalosThemeImport(validExport)?.chat_layout).toEqual(validExport.theme.chat_layout)
        expect(parseStrictTalosThemeImport(validExport)?.motion_v6).toEqual(createDefaultTalosMotionV6Preferences())
        const motionV6 = createDefaultTalosMotionV6Preferences()
        motionV6.mode = 'complex'
        motionV6.scene_override = 'signal'
        const v2 = {
            ...validExport,
            schema: 'talos_theme_export_v2',
            theme: { ...validExport.theme, motion_v6: motionV6 },
        }
        expect(parseStrictTalosThemeImport(v2)?.motion_v6).toEqual(motionV6)
        expect(parseStrictTalosThemeImport({ ...v2, theme: { ...v2.theme, motion: 'cinematic' } })).toBeNull()
        expect(parseStrictTalosThemeImport({ ...v2, theme: { ...v2.theme, ui_animation_profile: 'custom' } })).toBeNull()
        expect(parseStrictTalosThemeImport({ ...v2, theme: { ...v2.theme, motion_v6: { ...motionV6, speed: 999 } } })).toBeNull()
        expect(parseStrictTalosThemeImport({ ...v2, theme: { ...v2.theme, unexpected: true } })).toBeNull()
        expect(parseStrictTalosThemeImport({ ...validExport, exported_at: undefined })).toBeNull()
        expect(parseStrictTalosThemeImport({ ...validExport, exported_at: '0' })).toBeNull()
        expect(parseStrictTalosThemeImport({ ...validExport, exported_at: '2026-02-30T12:00:00.000Z' })).toBeNull()
        expect(parseStrictTalosThemeImport({ ...validExport, unexpected: true })).toBeNull()
        expect(parseStrictTalosThemeImport({
            ...validExport,
            theme: { ...validExport.theme, created_at: '2026-07-10T12:00:00+23:59' },
        })).not.toBeNull()
        expect(parseStrictTalosThemeImport({
            ...validExport,
            theme: { ...validExport.theme, created_at: '2026-07-10T12:00:00+24:00' },
        })).toBeNull()
        expect(parseStrictTalosThemeImport({
            ...validExport,
            theme: { ...validExport.theme, created_at: '2026-02-30T12:00:00.000Z' },
        })).toBeNull()
        expect(parseStrictTalosThemeImport({
            ...validExport,
            theme: { ...validExport.theme, tokens: { background: '#000000', panel: '#000000', text: '#010101' } },
        })).toBeNull()
        expect(parseStrictTalosThemeImport({
            ...validExport,
            theme: {
                ...validExport.theme,
                area_tokens: {
                    composer: {
                        background: '#000000',
                        surface: '#000000',
                        text: '#111111',
                        muted: '#222222',
                    },
                },
            },
        })).toBeNull()
    })

    it('builds a V2 round-trip export that retains the complete Motion V6 contract', () => {
        const motionV6 = createDefaultTalosMotionV6Preferences()
        motionV6.mode = 'simple'
        motionV6.speed = 145
        motionV6.interface.categories.windows = false
        const theme = {
            id: 'v2-round-trip',
            name: 'V2 Round Trip',
            base_theme: 'signal' as const,
            tokens: {},
            motion_v6: motionV6,
        }

        const exported = buildTalosThemeExport(theme)
        expect(exported.schema).toBe('talos_theme_export_v2')
        expect(parseStrictTalosThemeImport(exported)).toEqual(theme)
    })

    it('strips legacy motion fields from V2 exports while retaining complete V6 motion', () => {
        const motionV6 = createDefaultTalosMotionV6Preferences()
        const exported = buildTalosThemeExport({
            id: 'legacy-library-entry',
            name: 'Legacy library entry',
            base_theme: 'forge',
            tokens: {},
            motion: 'cinematic',
            ui_animation_profile: 'custom',
            ui_animation_customization: { intensity: 80 },
            motion_v6: motionV6,
        })

        expect(exported.theme.motion_v6).toEqual(motionV6)
        expect(exported.theme).not.toHaveProperty('motion')
        expect(exported.theme).not.toHaveProperty('ui_animation_profile')
        expect(exported.theme).not.toHaveProperty('ui_animation_customization')
    })

    it('reports actionable strict-import errors for missing base and token fields', () => {
        const validExport = {
            schema: 'talos_theme_export_v1',
            exported_at: '2026-07-10T12:00:00.000Z',
            theme: {
                id: 'imported-theme',
                name: 'Imported Theme',
                base_theme: 'aurora',
                tokens: {},
            },
        }

        expect(inspectStrictTalosThemeImport({
            ...validExport,
            theme: { ...validExport.theme, base_theme: undefined },
        })).toEqual({
            theme: null,
            error: 'Theme import requires theme.base_theme to name a supported base preset.',
        })
        expect(inspectStrictTalosThemeImport({
            ...validExport,
            theme: { ...validExport.theme, tokens: undefined },
        })).toEqual({
            theme: null,
            error: 'Theme import requires theme.tokens to be an object.',
        })
    })

    it('accepts a valid legacy export with chat layout and migrates it to Motion V6', () => {
        const result = inspectStrictTalosThemeImport({
            schema: 'talos_theme_export_v1',
            exported_at: '2026-07-10T12:00:00.000Z',
            theme: {
                id: 'imported-lifecycle-theme',
                name: 'Imported Lifecycle',
                base_theme: 'terminal',
                tokens: {},
                chat_layout: {
                    bubble_scale: 'compact',
                    composer_mode: 'minimal',
                    advanced_rail_expanded: true,
                },
            },
        })

        expect(result.error).toBeNull()
        expect(result.theme).toMatchObject({
            id: 'imported-lifecycle-theme',
            motion_v6: { schema_version: 1 },
            chat_layout: { bubble_scale: 'compact', composer_mode: 'minimal' },
        })
    })

    it.each([
        ['unknown customization key', { tokens: { unknown: '#112233' } }],
        ['invalid font', { tokens: { font: 'not-a-font' } }],
        ['out-of-range intensity', { tokens: { effect_intensity: 999 } }],
        ['unknown area', { area_tokens: { admin: { background: '#112233' } } }],
        ['unknown area token', { area_tokens: { composer: { shadow: '#112233' } } }],
        ['invalid motion', { motion: 'warp' }],
        ['invalid animation profile', { ui_animation_profile: 'warp' }],
        ['invalid animation customization', { ui_animation_customization: { intensity: 999 } }],
        ['invalid chat layout', { chat_layout: { bubble_scale: 'giant' } }],
    ])('rejects strict import nested %s instead of sanitizing it', (_label, invalidFields) => {
        const imported = {
            schema: 'talos_theme_export_v1',
            exported_at: '2026-07-10T12:00:00.000Z',
            theme: {
                id: 'strict-import',
                name: 'Strict Import',
                base_theme: 'forge',
                tokens: {},
                ...invalidFields,
            },
        }

        expect(parseStrictTalosThemeImport(imported)).toBeNull()
        expect(inspectStrictTalosThemeImport(imported).error).toContain('rejected')
    })

    it('validates Advanced area text and muted pairs in both light and dark modes', () => {
        const unsafe = validateTalosThemeAreaForSave({
            baseTheme: 'paper',
            area: 'composer',
            tokens: {
                background: '#000000',
                surface: '#000000',
                text: '#111111',
                muted: '#222222',
            },
            customization: {},
        })

        expect(unsafe.valid).toBe(false)
        expect(unsafe.errors.map((error) => error.field)).toContain('light/composer/text-on-background')
        expect(unsafe.errors.map((error) => error.field)).toContain('dark/composer/muted-on-surface')

        const safe = validateTalosThemeAreaForSave({
            baseTheme: 'paper',
            area: 'composer',
            tokens: {
                background: '#111827',
                surface: '#1f2937',
                text: '#f9fafb',
                muted: '#cbd5e1',
            },
            customization: {},
        })

        expect(safe).toEqual({ valid: true, errors: [] })
    })

    it('validates window chrome and transparent button surfaces, not only opaque area fills', () => {
        const windowChrome = validateTalosThemeAreaForSave({
            baseTheme: 'paper',
            area: 'window',
            tokens: {
                surface: '#000000',
                text: '#ffffff',
                muted: '#cccccc',
            },
        })
        const transparentButton = validateTalosThemeAreaForSave({
            baseTheme: 'paper',
            area: 'button',
            tokens: {
                background: '#000000',
                surface: '#000000',
                text: '#ffffff',
                muted: '#cccccc',
            },
        })

        expect(windowChrome.valid).toBe(false)
        expect(windowChrome.errors.some((error) => error.field.includes('chrome'))).toBe(true)
        expect(transparentButton.valid).toBe(false)
        expect(transparentButton.errors.some((error) => error.field.includes('transparent'))).toBe(true)
    })

    it('rejects transparent button text that conflicts with another customized area', () => {
        const result = validateTalosThemeStateForSave({
            baseTheme: 'forge',
            customization: {
                background: '#000000',
                panel: '#000000',
                text: '#ffffff',
            },
            areaTokens: {
                window: {
                    background: '#ffffff',
                    surface: '#ffffff',
                    text: '#000000',
                    muted: '#333333',
                },
                button: {
                    background: '#000000',
                    surface: '#000000',
                    text: '#ffffff',
                    muted: '#cccccc',
                },
            },
        })

        expect(result.valid).toBe(false)
        expect(result.errors.some((error) => error.field.includes('button/text-on-window'))).toBe(true)
    })

    it('accepts a partial button override using the panel-derived background fallback', () => {
        const darkArea = {
            background: '#000000',
            surface: '#000000',
            text: '#ffffff',
            muted: '#cccccc',
        }
        const result = validateTalosThemeStateForSave({
            baseTheme: 'forge',
            customization: {
                background: '#000000',
                panel: '#000000',
                text: '#ffffff',
            },
            areaTokens: {
                sidebar: darkArea,
                chat: darkArea,
                composer: darkArea,
                window: darkArea,
                header: darkArea,
                card: darkArea,
                button: {
                    surface: '#000000',
                    text: '#ffffff',
                    muted: '#cccccc',
                },
            },
        })

        expect(result).toEqual({ valid: true, errors: [] })
    })
})
