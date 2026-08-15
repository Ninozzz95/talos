const OPAQUE_HEX = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i
const COLOR_MIX = /^color-mix\(\s*in\s+srgb\s*,([\s\S]+)\)$/i
const TOKEN_REFERENCE = /^var\(\s*(--[a-z0-9_-]+)\s*\)$/i

export const TALOS_COLOR_RESOLUTION_MAX_DEPTH = 16 as const

const TALOS_COLOR_RESOLUTION_MAX_LENGTH = 4096

type Rgba = { red: number; green: number; blue: number; alpha: number }
export type TalosTokenStyle = Record<string, string>

export type TalosNormalTextPair = {
    field: string
    foreground?: string
    background?: string
    foregroundToken?: string
    backgroundToken?: string
    minimum?: number
}

export type TalosContrastValidationError = {
    code: 'invalid-color' | 'missing-token' | 'insufficient-contrast'
    field: string
    message: string
    ratio?: number
    minimum?: number
}

export type TalosContrastValidationResult = {
    valid: boolean
    errors: TalosContrastValidationError[]
}

export const TALOS_NORMAL_TEXT_TOKEN_PAIRS: Array<{
    field: string
    foreground: string
    background: string
}> = [
    { field: 'text-on-background', foreground: '--talos-text', background: '--talos-background' },
    { field: 'text-on-panel', foreground: '--talos-text', background: '--talos-panel' },
    { field: 'muted-on-background', foreground: '--talos-muted', background: '--talos-background' },
    { field: 'muted-on-panel', foreground: '--talos-muted', background: '--talos-panel' },
    { field: 'composer-text-on-surface', foreground: '--talos-composer-text', background: '--talos-composer-surface' },
    { field: 'assistant-text-on-surface', foreground: '--talos-assistant-text', background: '--talos-assistant' },
    { field: 'user-text-on-surface', foreground: '--talos-user-text', background: '--talos-user' },
    { field: 'system-text-on-surface', foreground: '--talos-system-text', background: '--talos-system' },
    { field: 'chat-error-text-on-surface', foreground: '--talos-chat-error-text', background: '--talos-chat-error' },
    { field: 'success-text-on-surface', foreground: '--talos-success', background: '--talos-success-soft' },
    { field: 'warning-text-on-surface', foreground: '--talos-warning', background: '--talos-warning-soft' },
    { field: 'danger-text-on-surface', foreground: '--talos-danger', background: '--talos-danger-soft' },
    { field: 'info-text-on-surface', foreground: '--talos-info', background: '--talos-info-soft' },
    { field: 'code-text-on-surface', foreground: '--talos-code-text', background: '--talos-code-bg' },
]

function linearChannel(value: number) {
    return value <= 0.04045
        ? value / 12.92
        : ((value + 0.055) / 1.055) ** 2.4
}

function splitTopLevel(value: string) {
    const parts: string[] = []
    let depth = 0
    let start = 0

    for (let index = 0; index < value.length; index += 1) {
        if (value[index] === '(') depth += 1
        if (value[index] === ')') depth -= 1
        if (depth < 0) return []
        if (value[index] === ',' && depth === 0) {
            parts.push(value.slice(start, index).trim())
            start = index + 1
        }
    }

    if (depth !== 0) return []
    parts.push(value.slice(start).trim())
    return parts
}

function colorOperand(value: string) {
    const percentage = value.match(/\s+(-?(?:\d+(?:\.\d+)?|\.\d+))%\s*$/)
    const color = percentage ? value.slice(0, percentage.index).trim() : value.trim()

    return {
        color,
        weight: percentage ? Number(percentage[1]) : undefined,
    }
}

function parseColor(
    value: string,
    style: TalosTokenStyle,
    resolving: Set<string> = new Set(),
    depth = 0,
): Rgba | null {
    if (depth > TALOS_COLOR_RESOLUTION_MAX_DEPTH || value.length > TALOS_COLOR_RESOLUTION_MAX_LENGTH) return null
    const normalized = value.trim()
    const hex = normalized.match(OPAQUE_HEX)

    if (hex) {
        return {
            red: Number.parseInt(hex[1], 16) / 255,
            green: Number.parseInt(hex[2], 16) / 255,
            blue: Number.parseInt(hex[3], 16) / 255,
            alpha: 1,
        }
    }

    const named = normalized.toLowerCase()
    if (named === 'black') return { red: 0, green: 0, blue: 0, alpha: 1 }
    if (named === 'white') return { red: 1, green: 1, blue: 1, alpha: 1 }
    if (named === 'transparent') return { red: 0, green: 0, blue: 0, alpha: 0 }

    const tokenReference = normalized.match(TOKEN_REFERENCE)
    if (tokenReference) {
        const token = tokenReference[1]
        const tokenValue = style[token]
        if (!tokenValue || resolving.has(token)) return null

        const nextResolving = new Set(resolving)
        nextResolving.add(token)
        return parseColor(tokenValue, style, nextResolving, depth + 1)
    }

    const colorMix = normalized.match(COLOR_MIX)
    if (!colorMix) return null

    const parts = splitTopLevel(colorMix[1])
    if (parts.length !== 2) return null

    const firstOperand = colorOperand(parts[0])
    const secondOperand = colorOperand(parts[1])
    const first = parseColor(firstOperand.color, style, resolving, depth + 1)
    const second = parseColor(secondOperand.color, style, resolving, depth + 1)
    if (!first || !second) return null

    const firstWeight = firstOperand.weight ?? (secondOperand.weight === undefined ? 50 : 100 - secondOperand.weight)
    const secondWeight = secondOperand.weight ?? (100 - firstWeight)
    const totalWeight = firstWeight + secondWeight
    const bothExplicit = firstOperand.weight !== undefined && secondOperand.weight !== undefined
    if (firstWeight < 0 || firstWeight > 100 || secondWeight < 0 || secondWeight > 100) return null
    if (totalWeight === 0 && bothExplicit) return { red: 0, green: 0, blue: 0, alpha: 0 }
    if (totalWeight <= 0) return null

    const firstFactor = firstWeight / totalWeight
    const secondFactor = secondWeight / totalWeight
    const mixedAlpha = first.alpha * firstFactor + second.alpha * secondFactor
    const alphaMultiplier = bothExplicit && totalWeight < 100 ? totalWeight / 100 : 1
    const alpha = mixedAlpha * alphaMultiplier
    if (alpha === 0) return { red: 0, green: 0, blue: 0, alpha: 0 }

    return {
        red: (first.red * first.alpha * firstFactor + second.red * second.alpha * secondFactor) / mixedAlpha,
        green: (first.green * first.alpha * firstFactor + second.green * second.alpha * secondFactor) / mixedAlpha,
        blue: (first.blue * first.alpha * firstFactor + second.blue * second.alpha * secondFactor) / mixedAlpha,
        alpha,
    }
}

function opaqueColor(value: string, style: TalosTokenStyle = {}) {
    const color = parseColor(value, style)
    if (!color || color.alpha < 1) {
        throw new Error(`TALOS contrast requires an opaque color: ${value}`)
    }

    return color
}

function canonicalChannel(value: number) {
    return Math.round(Math.min(1, Math.max(0, value)) * 255)
        .toString(16)
        .padStart(2, '0')
}

export function talosCanonicalOpaqueColor(value: string, style: TalosTokenStyle = {}) {
    const color = opaqueColor(value, style)
    return `#${canonicalChannel(color.red)}${canonicalChannel(color.green)}${canonicalChannel(color.blue)}`
}

export function talosRelativeLuminance(color: string, style: TalosTokenStyle = {}) {
    const parsed = opaqueColor(color, style)

    return (0.2126 * linearChannel(parsed.red))
        + (0.7152 * linearChannel(parsed.green))
        + (0.0722 * linearChannel(parsed.blue))
}

export function talosContrastRatio(first: string, second: string, style: TalosTokenStyle = {}) {
    const firstLuminance = talosRelativeLuminance(first, style)
    const secondLuminance = talosRelativeLuminance(second, style)
    const bright = Math.max(firstLuminance, secondLuminance)
    const dark = Math.min(firstLuminance, secondLuminance)

    return (bright + 0.05) / (dark + 0.05)
}

export function talosReadableForeground(
    background: string,
    dark = '#111827',
    light = '#ffffff',
    style: TalosTokenStyle = {},
) {
    return talosContrastRatio(background, dark, style) >= talosContrastRatio(background, light, style)
        ? dark
        : light
}

export function talosNormalTextPairsFromStyle(style: TalosTokenStyle): TalosNormalTextPair[] {
    return TALOS_NORMAL_TEXT_TOKEN_PAIRS.map(({ field, foreground, background }) => ({
        field,
        foreground: style[foreground],
        background: style[background],
        foregroundToken: foreground,
        backgroundToken: background,
    }))
}

export function validateTalosNormalTextPair(
    pair: TalosNormalTextPair,
    style: TalosTokenStyle = {},
): TalosContrastValidationResult {
    const minimum = pair.minimum ?? 4.5
    const errors: TalosContrastValidationError[] = []

    for (const name of ['foreground', 'background'] as const) {
        const value = pair[name]
        if (!value) {
            const token = pair[`${name}Token`]
            errors.push({
                code: 'missing-token',
                field: `${pair.field}.${name}`,
                message: `${pair.field} requires ${token ?? name}.`,
            })
            continue
        }

        try {
            opaqueColor(value, style)
        } catch {
            errors.push({
                code: 'invalid-color',
                field: `${pair.field}.${name}`,
                message: `${pair.field} ${name} must be an opaque six-digit hex, emitted named color, or resolvable color-mix value.`,
            })
        }
    }

    if (errors.length > 0) {
        return { valid: false, errors }
    }

    const ratio = talosContrastRatio(pair.foreground!, pair.background!, style)
    if (ratio < minimum) {
        errors.push({
            code: 'insufficient-contrast',
            field: pair.field,
            ratio,
            minimum,
            message: `${pair.field} contrast is ${ratio.toFixed(2)}:1; normal text requires at least ${minimum.toFixed(1)}:1.`,
        })
    }

    return { valid: errors.length === 0, errors }
}

export function validateTalosNormalTextPairs(
    pairs: TalosNormalTextPair[],
    style: TalosTokenStyle = {},
): TalosContrastValidationResult {
    const errors = pairs.flatMap((pair) => validateTalosNormalTextPair(pair, style).errors)
    return { valid: errors.length === 0, errors }
}
