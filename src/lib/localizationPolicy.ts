import type { TalosLocaleMode, TalosSupportedLocale } from '@/i18n/contracts'

export const TALOS_SUPPORTED_LOCALES = Object.freeze([
    'en',
    'it',
] as const satisfies readonly TalosSupportedLocale[])

/**
 * Product seam requested by the owner: after manual evaluation this can be
 * disabled without removing system-locale resolution or the Settings picker.
 */
export const TALOS_INTRO_LANGUAGE_PAGE_ENABLED = true

export function parseTalosLocaleMode(value: unknown): TalosLocaleMode {
    return value === 'en' || value === 'it' || value === 'system'
        ? value
        : 'system'
}

function supportedPrimaryLanguage(tag: unknown): TalosSupportedLocale | null {
    if (typeof tag !== 'string') return null
    const primary = tag.trim().replaceAll('_', '-').split('-')[0]?.toLowerCase()
    return primary === 'it' || primary === 'en' ? primary : null
}

export function resolveTalosLocale(
    mode: TalosLocaleMode,
    systemLanguageTags: readonly string[],
): TalosSupportedLocale {
    if (mode === 'en' || mode === 'it') return mode
    for (const tag of systemLanguageTags) {
        const locale = supportedPrimaryLanguage(tag)
        if (locale) return locale
    }
    return 'en'
}

