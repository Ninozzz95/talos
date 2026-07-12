import { describe, expect, it } from 'vitest'
import {
    TALOS_NORMAL_TEXT_TOKEN_PAIRS,
    talosContrastRatio,
    talosNormalTextPairsFromStyle,
    validateTalosNormalTextPair,
    validateTalosNormalTextPairs,
} from './talosContrast'
import {
    TALOS_THEME_PRESETS,
    parseTalosThemeExport,
    sanitizeTalosThemeCustomization,
    talosThemeNormalTextContrast,
    talosThemeAreaTokenStyle,
    talosThemeCustomizationStyle,
    talosThemeModeVariantStyle,
    validateTalosThemeCustomizationContrast,
} from './talosThemes'

const EXPECTED_NORMAL_TEXT_PAIR_FIELDS = [
    'text-on-background',
    'text-on-panel',
    'muted-on-background',
    'muted-on-panel',
    'composer-text-on-surface',
    'assistant-text-on-surface',
    'user-text-on-surface',
    'system-text-on-surface',
    'chat-error-text-on-surface',
    'success-text-on-surface',
    'warning-text-on-surface',
    'danger-text-on-surface',
    'info-text-on-surface',
    'code-text-on-surface',
] as const
const BASE_SENSITIVE_CUSTOMIZATION = { text: '#edf2f7' }
const BUNDLED_PRESET_FONTS = new Set([
    'Instrument Sans',
    'Manrope',
    'JetBrains Mono',
    'Sora',
    'Source Serif 4',
])

function channel(value: number) {
    const normalized = value / 255
    return normalized <= 0.04045
        ? normalized / 12.92
        : ((normalized + 0.055) / 1.055) ** 2.4
}

function luminance(color: string) {
    const match = color.match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i)
    if (!match) throw new Error(`Expected an opaque hex color, received ${color}`)

    return (0.2126 * channel(Number.parseInt(match[1], 16)))
        + (0.7152 * channel(Number.parseInt(match[2], 16)))
        + (0.0722 * channel(Number.parseInt(match[3], 16)))
}

function contrast(first: string, second: string) {
    const bright = Math.max(luminance(first), luminance(second))
    const dark = Math.min(luminance(first), luminance(second))
    return (bright + 0.05) / (dark + 0.05)
}

describe('TALOS theme token contract', () => {
    it('keeps the authoritative 12 preset registry', () => {
        expect(TALOS_THEME_PRESETS.map((preset) => preset.id)).toEqual([
            'forge',
            'paper',
            'terminal',
            'aurora',
            'glacier',
            'ember',
            'atlas',
            'noir',
            'signal',
            'violet',
            'claudius',
            'basicus',
        ])
    })

    it.each(['light', 'dark'] as const)('provides complete readable accent tokens in %s mode', (mode) => {
        const unsafeInteractivePairs: string[] = []
        const required = [
            '--talos-background',
            '--talos-panel',
            '--talos-text',
            '--talos-muted',
            '--talos-border',
            '--talos-accent',
            '--talos-accent-text',
            '--talos-composer-bg',
            '--talos-user',
            '--talos-user-text',
            '--talos-assistant',
            '--talos-assistant-text',
            '--talos-code-bg',
            '--talos-code-text',
        ]

        for (const preset of TALOS_THEME_PRESETS) {
            const style = talosThemeModeVariantStyle(preset.id, mode)
            for (const token of required) {
                expect(style[token], `${preset.id}/${mode}/${token}`).toBeTruthy()
            }

            expect(
                contrast(style['--talos-accent'], style['--talos-accent-text']),
                `${preset.id}/${mode} accent pair`,
            ).toBeGreaterThanOrEqual(4.5)
            const hoverRatio = talosContrastRatio(style['--talos-accent-hover'], style['--talos-accent-text'], style)
            if (hoverRatio < 4.5) unsafeInteractivePairs.push(`${preset.id}/${mode}:${hoverRatio.toFixed(2)}`)
            const focusRatio = talosContrastRatio(style['--talos-ring'], style['--talos-composer-surface'], style)
            if (focusRatio < 3) unsafeInteractivePairs.push(`${preset.id}/${mode}/focus:${focusRatio.toFixed(2)}`)
        }
        expect(unsafeInteractivePairs, `${mode} accent hover pairs`).toEqual([])
    })

    it.each(['light', 'dark'] as const)('passes the complete normal-text matrix in %s mode', (mode) => {
        for (const preset of TALOS_THEME_PRESETS) {
            const style = talosThemeModeVariantStyle(preset.id, mode)
            const pairs = talosNormalTextPairsFromStyle(style)
            const result = talosThemeNormalTextContrast(preset.id, mode)

            expect(TALOS_NORMAL_TEXT_TOKEN_PAIRS).toHaveLength(14)
            expect(pairs, `${preset.id}/${mode} pair count`).toHaveLength(14)
            expect(pairs.map((pair) => pair.field)).toEqual(EXPECTED_NORMAL_TEXT_PAIR_FIELDS)
            expect(result.valid, `${preset.id}/${mode}: ${result.errors.map((error) => error.message).join('; ')}`).toBe(true)
            expect(result.errors).toEqual([])
        }
    })

    it('reports every missing required normal-text token instead of dropping pairs', () => {
        const pairs = talosNormalTextPairsFromStyle({})
        const result = validateTalosNormalTextPairs(pairs)

        expect(pairs).toHaveLength(EXPECTED_NORMAL_TEXT_PAIR_FIELDS.length)
        expect(result.valid).toBe(false)
        expect(result.errors).toHaveLength(EXPECTED_NORMAL_TEXT_PAIR_FIELDS.length * 2)
        expect(result.errors.every((error) => error.code === 'missing-token')).toBe(true)
        expect(result.errors[0]).toMatchObject({
            code: 'missing-token',
            field: 'text-on-background.foreground',
        })
    })

    it('rejects color-mix expressions with anything other than two operands', () => {
        const result = validateTalosNormalTextPair({
            field: 'malformed-mix',
            foreground: '#111827',
            background: 'color-mix(in srgb, #ffffff 60%, #000000 20%, #ffffff 20%)',
        })

        expect(result.valid).toBe(false)
        expect(result.errors).toEqual(expect.arrayContaining([
            expect.objectContaining({ code: 'invalid-color', field: 'malformed-mix.background' }),
        ]))
    })

    it('treats explicit color-mix weight below 100 percent as transparent remainder', () => {
        const result = validateTalosNormalTextPair({
            field: 'underweight-mix',
            foreground: 'color-mix(in srgb, white 99%, black 0%)',
            background: 'black',
        })

        expect(result.valid).toBe(false)
        expect(result.errors).toEqual(expect.arrayContaining([
            expect.objectContaining({ code: 'invalid-color', field: 'underweight-mix.foreground' }),
        ]))
    })

    it('fails closed for color-mix opacity arbitrarily close to but below one', () => {
        const result = validateTalosNormalTextPair({
            field: 'near-opaque-mix',
            foreground: 'color-mix(in srgb, white 99.99%, black 0%)',
            background: 'black',
        })

        expect(result.valid).toBe(false)
        expect(result.errors).toEqual(expect.arrayContaining([
            expect.objectContaining({ code: 'invalid-color', field: 'near-opaque-mix.foreground' }),
        ]))
    })

    it('accepts a standard explicit 70/30 opaque color mix', () => {
        expect(validateTalosNormalTextPair({
            field: 'standard-mix',
            foreground: 'color-mix(in srgb, white 70%, black 30%)',
            background: 'black',
        })).toEqual({ valid: true, errors: [] })
    })

    it('normalizes explicit color-mix weights above 100 percent', () => {
        const normalized = talosContrastRatio('color-mix(in srgb, white 80%, black 80%)', 'white')
        const balanced = talosContrastRatio('color-mix(in srgb, white 50%, black 50%)', 'white')

        expect(normalized).toBeCloseTo(balanced, 10)
    })

    it('distributes omitted color-mix weights from the remaining percentage', () => {
        const explicitSeventyThirty = talosContrastRatio('color-mix(in srgb, white 70%, black 30%)', 'black')
        const explicitFiftyFifty = talosContrastRatio('color-mix(in srgb, white 50%, black 50%)', 'black')

        expect(talosContrastRatio('color-mix(in srgb, white 70%, black)', 'black')).toBeCloseTo(explicitSeventyThirty, 10)
        expect(talosContrastRatio('color-mix(in srgb, white, black 30%)', 'black')).toBeCloseTo(explicitSeventyThirty, 10)
        expect(talosContrastRatio('color-mix(in srgb, white, black)', 'black')).toBeCloseTo(explicitFiftyFifty, 10)
    })

    it('resolves nested var tokens through the supplied style map', () => {
        const style = {
            '--talos-fg': 'var(--talos-text-alias)',
            '--talos-text-alias': '#111827',
            '--talos-bg': 'color-mix(in srgb, var(--talos-panel-alias) 92%, white)',
            '--talos-panel-alias': '#ffffff',
        }
        const result = validateTalosNormalTextPair({
            field: 'nested-vars',
            foreground: 'var(--talos-fg)',
            background: 'var(--talos-bg)',
        }, style)

        expect(result).toEqual({ valid: true, errors: [] })
    })

    it('supports emitted black and white names while rejecting unknown named colors', () => {
        expect(validateTalosNormalTextPair({
            field: 'named-emitted',
            foreground: 'black',
            background: 'white',
        })).toEqual({ valid: true, errors: [] })

        const unknown = validateTalosNormalTextPair({
            field: 'named-unknown',
            foreground: 'rebeccapurple',
            background: 'white',
        })
        expect(unknown.valid).toBe(false)
        expect(unknown.errors).toEqual(expect.arrayContaining([
            expect.objectContaining({ code: 'invalid-color', field: 'named-unknown.foreground' }),
        ]))
    })

    it('does not use the known failing 58 percent light muted token', () => {
        for (const preset of TALOS_THEME_PRESETS) {
            expect(talosThemeModeVariantStyle(preset.id, 'light')['--talos-muted']).not.toContain(' 58%')
        }
    })

    it('derives a readable foreground for custom accents', () => {
        const style = talosThemeCustomizationStyle({ accent: '#a96617' })

        expect(style['--talos-accent-text']).toBeTruthy()
        expect(contrast(style['--talos-accent'], style['--talos-accent-text'])).toBeGreaterThanOrEqual(4.5)
        expect(talosContrastRatio(style['--talos-accent-hover'], style['--talos-accent-text'], style)).toBeGreaterThanOrEqual(4.5)
    })

    it('reports actionable errors for unsafe custom normal-text pairs without changing the sanitizer', () => {
        const customization = { text: '#777777', background: '#ffffff' }
        const result = validateTalosThemeCustomizationContrast(customization)

        expect(result.valid).toBe(false)
        expect(result.errors.some((error) => error.field.includes('text-on-background'))).toBe(true)
        expect(result.errors[0]?.message).toMatch(/contrast|foreground|background/i)
        expect(sanitizeTalosThemeCustomization(customization)).toEqual(customization)
    })

    it('validates unsafe customization against both forced light and dark modes', () => {
        const result = validateTalosThemeCustomizationContrast({ text: '#777777' }, 'forge')
        const modes = new Set(result.errors.map((error) => error.field.split('/')[0]))

        expect(result.valid).toBe(false)
        expect(modes).toEqual(new Set(['light', 'dark']))
        expect(result.errors.every((error) => /^(?:light|dark)\//.test(error.field))).toBe(true)
    })

    it('rejects a custom accent when its focus ring disappears against a forced-mode composer surface', () => {
        const result = validateTalosThemeCustomizationContrast({ accent: '#f0f0f0' }, 'paper')

        expect(result.valid).toBe(false)
        expect(result.errors).toEqual(expect.arrayContaining([
            expect.objectContaining({ field: expect.stringContaining('focus-ring-on-composer') }),
        ]))
    })

    it('accepts only strict raw theme exports before sanitization', () => {
        const validTheme = {
            id: 'strict-theme',
            name: 'Strict theme',
            base_theme: 'forge',
            tokens: {},
        }
        const validExport = {
            schema: 'talos_theme_export_v1',
            exported_at: '2026-07-10T00:00:00.000Z',
            theme: validTheme,
        }
        const inheritedThemeFields = Object.assign(
            Object.create({ base_theme: 'forge', tokens: {} }),
            { id: 'inherited-theme', name: 'Inherited theme' },
        )
        const inheritedSchema = Object.assign(
            Object.create({ schema: 'talos_theme_export_v1' }),
            { theme: validTheme },
        )

        expect(parseTalosThemeExport(validExport)).toMatchObject({
            id: 'strict-theme',
            base_theme: 'forge',
            tokens: {},
        })

        for (const malformed of [
            { ...validExport, schema: 'talos_theme_export_v0' },
            { schema: 'talos_theme_export_v1' },
            { ...validExport, theme: null },
            { ...validExport, theme: { id: 'missing-base', name: 'Missing base', tokens: {} } },
            { ...validExport, theme: { ...validTheme, base_theme: 'dark' } },
            { ...validExport, theme: { ...validTheme, base_theme: 'unsupported' } },
            { ...validExport, theme: { id: 'missing-tokens', name: 'Missing tokens', base_theme: 'forge' } },
            { ...validExport, theme: { ...validTheme, tokens: null } },
            { ...validExport, theme: { ...validTheme, tokens: [] } },
            { ...validExport, theme: inheritedThemeFields },
            inheritedSchema,
        ]) {
            expect(parseTalosThemeExport(malformed), JSON.stringify(malformed)).toBeNull()
        }
    })

    it('rejects unsafe imported theme exports before they can be applied', () => {
        expect(parseTalosThemeExport({
            schema: 'talos_theme_export_v1',
            exported_at: '2026-07-10T00:00:00.000Z',
            theme: {
                id: 'unsafe-theme',
                name: 'Unsafe theme',
                base_theme: 'forge',
                tokens: { text: '#777777', background: '#ffffff' },
            },
        })).toBeNull()
    })

    it('validates both modes against the selected base preset during import', () => {
        const forgeExport = {
            schema: 'talos_theme_export_v1',
            exported_at: '2026-07-10T00:00:00.000Z',
            theme: {
                id: 'forge-safe',
                name: 'Forge safe',
                base_theme: 'forge',
                tokens: BASE_SENSITIVE_CUSTOMIZATION,
            },
        }
        const paperExport = {
            schema: 'talos_theme_export_v1',
            exported_at: '2026-07-10T00:00:00.000Z',
            theme: {
                id: 'light-base-unsafe',
                name: 'Light base unsafe',
                base_theme: 'paper',
                tokens: BASE_SENSITIVE_CUSTOMIZATION,
            },
        }

        const forgeResult = validateTalosThemeCustomizationContrast(BASE_SENSITIVE_CUSTOMIZATION, 'forge')
        const paperResult = validateTalosThemeCustomizationContrast(BASE_SENSITIVE_CUSTOMIZATION, 'paper')
        const forgeRatio = forgeResult.errors.find((error) => error.field === 'light/text-on-background')?.ratio
        const paperRatio = paperResult.errors.find((error) => error.field === 'light/text-on-background')?.ratio

        expect(forgeResult.valid).toBe(false)
        expect(paperResult.valid).toBe(false)
        expect(forgeRatio).toBeTypeOf('number')
        expect(paperRatio).toBeTypeOf('number')
        expect(forgeRatio).not.toBe(paperRatio)
        expect(parseTalosThemeExport(forgeExport)).toBeNull()
        expect(parseTalosThemeExport(paperExport)).toBeNull()
    })

    it('exposes deterministic preset font tokens without requiring stylesheet edits', () => {
        for (const preset of TALOS_THEME_PRESETS) {
            const style = talosThemeModeVariantStyle(preset.id, 'dark')

            expect(style['--talos-font-ui'], preset.id).toContain(preset.fontUi)
            expect(style['--talos-font-mono'], preset.id).toContain(preset.fontMono)
        }
    })

    it('declares bounded density radius and motion defaults for every preset', () => {
        for (const preset of TALOS_THEME_PRESETS) {
            expect(['compact', 'comfortable', 'spacious'], `${preset.id} density`).toContain(preset.defaultDensity)
            expect(['sharp', 'balanced', 'soft'], `${preset.id} radius`).toContain(preset.defaultRadius)
            expect(['subtle', 'normal', 'cinematic'], `${preset.id} motion`).toContain(preset.defaultMotion)
        }

        expect(new Set(TALOS_THEME_PRESETS.map((preset) => preset.defaultDensity)).size).toBe(3)
        expect(new Set(TALOS_THEME_PRESETS.map((preset) => preset.defaultRadius)).size).toBeGreaterThanOrEqual(2)
        expect(new Set(TALOS_THEME_PRESETS.map((preset) => preset.defaultMotion)).size).toBe(3)
    })

    it('keeps Advanced area overrides isolated instead of overwriting global semantic tokens', () => {
        const style = talosThemeAreaTokenStyle({
            sidebar: { text: '#f8fafc', background: '#111827' },
            chat: { text: '#17202a', background: '#f8fafc' },
            composer: { muted: '#cbd5e1' },
        })

        expect(style).toMatchObject({
            '--talos-area-sidebar-text': '#f8fafc',
            '--talos-area-sidebar-background': '#111827',
            '--talos-area-chat-text': '#17202a',
            '--talos-area-chat-background': '#f8fafc',
            '--talos-area-composer-muted': '#cbd5e1',
        })
        expect(style['--talos-text']).toBeUndefined()
        expect(style['--talos-muted']).toBeUndefined()
        expect(style['--talos-background']).toBeUndefined()
    })

    it('uses only locally bundled families while preserving preset type personalities', () => {
        for (const preset of TALOS_THEME_PRESETS) {
            expect(BUNDLED_PRESET_FONTS.has(preset.fontUi), `${preset.id} fontUi`).toBe(true)
            expect(BUNDLED_PRESET_FONTS.has(preset.fontMono), `${preset.id} fontMono`).toBe(true)
            expect(preset.fontUi, `${preset.id} fontUi`).not.toBe('Orbitron')
            expect(preset.fontMono, `${preset.id} fontMono`).not.toBe('Orbitron')

            const style = talosThemeModeVariantStyle(preset.id, 'dark')
            expect(style['--talos-font-ui'], `${preset.id} UI token`).not.toContain('Orbitron')
            expect(style['--talos-font-mono'], `${preset.id} mono token`).not.toContain('Orbitron')
        }

        expect(new Set(TALOS_THEME_PRESETS.map((preset) => preset.fontUi))).toEqual(BUNDLED_PRESET_FONTS)
    })

    it('keeps Orbitron brand-only and resolves custom font aliases to bundled families', () => {
        const uiStyle = talosThemeCustomizationStyle({ font: 'inter' })
        const displayStyle = talosThemeCustomizationStyle({ font: 'display' })
        const monoStyle = talosThemeCustomizationStyle({ font: 'mono' })

        expect(uiStyle['--talos-font-ui']).toContain('Instrument Sans')
        expect(displayStyle['--talos-font-ui']).toContain('Sora')
        expect(displayStyle['--talos-font-display']).toContain('Sora')
        expect(monoStyle['--talos-font-ui']).toContain('JetBrains Mono')
        expect([uiStyle, displayStyle, monoStyle].flatMap((style) => Object.values(style)).join(' ')).not.toContain('Orbitron')
    })

    it.each(['light', 'dark'] as const)('keeps distinct semantic palette anchors in %s mode', (mode) => {
        for (const preset of TALOS_THEME_PRESETS) {
            const style = talosThemeModeVariantStyle(preset.id, mode)
            const statuses = [
                style['--talos-success'],
                style['--talos-warning'],
                style['--talos-danger'],
                style['--talos-info'],
            ]
            const anchors = [style['--talos-accent'], style['--talos-secondary'], ...statuses]

            expect(style['--talos-accent'], `${preset.id}/${mode} accent-secondary`).not.toBe(style['--talos-secondary'])
            expect(new Set(statuses), `${preset.id}/${mode} status identities`).toHaveLength(4)
            expect(new Set(anchors).size, `${preset.id}/${mode} semantic anchors`).toBeGreaterThanOrEqual(5)
        }
    })

})
