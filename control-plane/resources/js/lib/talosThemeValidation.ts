import { validateTalosNormalTextPairs, type TalosContrastValidationResult } from './talosContrast'
import {
    sanitizeTalosThemeAreaTokens,
    sanitizeTalosThemeCustomization,
    talosThemeCustomizationStyle,
    talosThemeModeVariantStyle,
    validateTalosThemeCustomizationContrast,
    type TalosThemeAreaId,
    type TalosThemeAreaTokenKey,
    type TalosThemeAreaTokens,
    type TalosThemeCustomization,
    type TalosThemeId,
} from './talosThemes'

type TalosThemeAreaValidationOptions = {
    baseTheme: TalosThemeId
    area: TalosThemeAreaId
    tokens: Partial<Record<TalosThemeAreaTokenKey, string>>
    customization?: TalosThemeCustomization
}

type TalosThemeStateValidationOptions = {
    baseTheme: TalosThemeId
    customization?: TalosThemeCustomization
    areaTokens?: TalosThemeAreaTokens
}

const AREA_CONTRAST_TOKENS: Record<TalosThemeAreaId, {
    background: string
    surface: string
    text: string
    muted: string
    extraSurfaces?: Array<{ field: string, token: string, follows?: 'background' | 'surface' }>
}> = {
    sidebar: { background: '--talos-sidebar', surface: '--talos-panel-soft', text: '--talos-text', muted: '--talos-muted' },
    chat: { background: '--talos-chat-bg', surface: '--talos-panel', text: '--talos-text', muted: '--talos-muted' },
    composer: { background: '--talos-composer-bg', surface: '--talos-composer-surface', text: '--talos-composer-text', muted: '--talos-muted' },
    window: {
        background: '--talos-window-bg',
        surface: '--talos-card',
        text: '--talos-text',
        muted: '--talos-muted',
        extraSurfaces: [{ field: 'chrome', token: '--talos-header', follows: 'background' }],
    },
    header: { background: '--talos-header', surface: '--talos-panel', text: '--talos-text', muted: '--talos-muted' },
    button: {
        background: '--talos-secondary',
        surface: '--talos-active',
        text: '--talos-text',
        muted: '--talos-muted',
        extraSurfaces: [
            { field: 'transparent-background', token: '--talos-background' },
            { field: 'transparent-panel', token: '--talos-panel' },
            { field: 'transparent-card', token: '--talos-card' },
            { field: 'transparent-header', token: '--talos-header' },
            { field: 'transparent-sidebar', token: '--talos-sidebar' },
        ],
    },
    card: { background: '--talos-card', surface: '--talos-panel', text: '--talos-text', muted: '--talos-muted' },
    code: { background: '--talos-code-bg', surface: '--talos-code-surface', text: '--talos-code-text', muted: '--talos-muted' },
}

const TRANSPARENT_BUTTON_PARENT_AREAS = ['sidebar', 'chat', 'composer', 'window', 'header', 'card'] as const

export function validateTalosThemeAreaContrast({
    baseTheme,
    area,
    tokens,
    customization = {},
}: TalosThemeAreaValidationOptions): TalosContrastValidationResult {
    const areaTokens = sanitizeTalosThemeAreaTokens({ [area]: tokens })
    const tokenNames = AREA_CONTRAST_TOKENS[area]
    const errors = (['light', 'dark'] as const).flatMap((mode) => {
        const style: Record<string, string> = {
            ...talosThemeModeVariantStyle(baseTheme, mode),
            ...talosThemeCustomizationStyle(sanitizeTalosThemeCustomization(customization)),
        }
        const tokensForArea = areaTokens[area] ?? {}
        if (tokensForArea.background) style[tokenNames.background] = tokensForArea.background
        if (tokensForArea.surface) style[tokenNames.surface] = tokensForArea.surface
        if (tokensForArea.text) style[tokenNames.text] = tokensForArea.text
        if (tokensForArea.muted) style[tokenNames.muted] = tokensForArea.muted
        for (const extra of tokenNames.extraSurfaces ?? []) {
            if (extra.follows === 'background' && tokensForArea.background) style[extra.token] = tokensForArea.background
            if (extra.follows === 'surface' && tokensForArea.surface) style[extra.token] = tokensForArea.surface
        }
        const pairs = ([
            ['text-on-background', tokenNames.text, tokenNames.background],
            ['text-on-surface', tokenNames.text, tokenNames.surface],
            ['muted-on-background', tokenNames.muted, tokenNames.background],
            ['muted-on-surface', tokenNames.muted, tokenNames.surface],
            ...(tokenNames.extraSurfaces ?? []).flatMap((extra) => ([
                [`text-on-${extra.field}`, tokenNames.text, extra.token],
                [`muted-on-${extra.field}`, tokenNames.muted, extra.token],
            ] as const)),
        ] as const).map(([field, foregroundToken, backgroundToken]) => ({
            field: `${area}/${field}`,
            foreground: style[foregroundToken],
            background: style[backgroundToken],
            foregroundToken,
            backgroundToken,
        }))

        return validateTalosNormalTextPairs(pairs, style).errors.map((error) => ({
            ...error,
            field: `${mode}/${error.field}`,
            message: `${mode}: ${error.message}`,
        }))
    })

    return { valid: errors.length === 0, errors }
}

function validateTransparentButtonsAcrossAreas({
    baseTheme,
    customization,
    areaTokens,
}: Required<TalosThemeStateValidationOptions>): TalosContrastValidationResult {
    const buttonTokens = areaTokens.button
    if (!buttonTokens || Object.keys(buttonTokens).length === 0) {
        return { valid: true, errors: [] }
    }

    const errors = (['light', 'dark'] as const).flatMap((mode) => {
        const style: Record<string, string> = {
            ...talosThemeModeVariantStyle(baseTheme, mode),
            ...talosThemeCustomizationStyle(customization),
        }
        const buttonDefinition = AREA_CONTRAST_TOKENS.button
        const foregrounds = [
            ['text', buttonTokens.text ?? style[buttonDefinition.text]],
            ['muted', buttonTokens.muted ?? style[buttonDefinition.muted]],
        ] as const
        const surfaces = TRANSPARENT_BUTTON_PARENT_AREAS.flatMap((areaId) => {
            const definition = AREA_CONTRAST_TOKENS[areaId]
            const areaState = areaTokens[areaId] ?? {}
            const values: Array<readonly [string, string | undefined]> = [
                [`${areaId}-background`, areaState.background ?? style[definition.background]],
                [`${areaId}-surface`, areaState.surface ?? style[definition.surface]],
            ]
            if (areaId === 'window') {
                values.push(['window-chrome', areaState.background ?? style['--talos-header']])
            }
            return values
        })
        const pairs = foregrounds.flatMap(([foregroundName, foreground]) => (
            surfaces.map(([surfaceName, background]) => ({
                field: `button/${foregroundName}-on-${surfaceName}`,
                foreground,
                background,
            }))
        ))

        return validateTalosNormalTextPairs(pairs, style).errors.map((error) => ({
            ...error,
            field: `${mode}/${error.field}`,
            message: `${mode}: ${error.message}`,
        }))
    })

    return { valid: errors.length === 0, errors }
}

export function validateTalosThemeStateContrast({
    baseTheme,
    customization = {},
    areaTokens = {},
}: TalosThemeStateValidationOptions): TalosContrastValidationResult {
    const safeCustomization = sanitizeTalosThemeCustomization(customization)
    const safeAreaTokens = sanitizeTalosThemeAreaTokens(areaTokens)
    const errors = [...validateTalosThemeCustomizationContrast(safeCustomization, baseTheme).errors]

    for (const [area, tokens] of Object.entries(safeAreaTokens) as Array<[
        TalosThemeAreaId,
        Partial<Record<TalosThemeAreaTokenKey, string>>,
    ]>) {
        errors.push(...validateTalosThemeAreaContrast({
            baseTheme,
            area,
            tokens,
            customization: safeCustomization,
        }).errors)
    }

    errors.push(...validateTransparentButtonsAcrossAreas({
        baseTheme,
        customization: safeCustomization,
        areaTokens: safeAreaTokens,
    }).errors)

    return { valid: errors.length === 0, errors }
}
