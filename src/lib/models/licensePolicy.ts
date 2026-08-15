/**
 * Positive, versioned licence policy for model weights shown by TALOS.
 *
 * This is deliberately narrower than "open source". The filter promises only
 * that Hugging Face declares one of these exact permissive identifiers; it is
 * not legal advice and it never turns missing or custom metadata into consent.
 */

export type TalosLicenceDisposition =
    | 'permissive-declared'
    | 'restricted'
    | 'custom'
    | 'unknown'

export const TALOS_PERMISSIVE_MODEL_LICENCES = Object.freeze([
    'apache-2.0',
    'mit',
    'bsd',
    'bsd-2-clause',
    'bsd-3-clause',
    'isc',
    'bsl-1.0',
    'cc0-1.0',
    'unlicense',
    'zlib',
] as const)

const PERMISSIVE = new Set<string>(TALOS_PERMISSIVE_MODEL_LICENCES)
const NARROW_ALIASES: Readonly<Record<string, string>> = Object.freeze({
    cc0: 'cc0-1.0',
    'apache2.0': 'apache-2.0',
})

const RESTRICTED_PREFIXES = Object.freeze([
    'agpl',
    'cc-by',
    'cc-by-nc',
    'cc-by-nd',
    'cc-by-sa',
    'gpl',
    'lgpl',
    'llama',
    'openrail',
    'rail',
] as const)

function normalise(value: string | null | undefined): string | null {
    if (typeof value !== 'string') return null
    const trimmed = value.trim().toLowerCase().replace(/^license:/u, '').trim()
    if (!trimmed) return null
    return NARROW_ALIASES[trimmed] ?? trimmed
}

/** Card metadata wins over the duplicated tag because it is the model card's authority. */
export function talosModelLicenceId(
    tags: readonly string[] | null | undefined,
    cardLicence?: string | null,
): string | null {
    const fromCard = normalise(cardLicence)
    if (fromCard !== null) return fromCard

    for (const tag of tags ?? []) {
        if (!/^license:/iu.test(tag.trim())) continue
        return normalise(tag)
    }
    return null
}

export function talosClassifyModelLicence(
    licence: string | null | undefined,
): TalosLicenceDisposition {
    const normalised = normalise(licence)
    if (normalised === null) return 'unknown'
    if (PERMISSIVE.has(normalised)) return 'permissive-declared'
    if (normalised === 'other' || normalised === 'custom' || normalised.startsWith('custom:')) {
        return 'custom'
    }
    if (RESTRICTED_PREFIXES.some((prefix) => {
        if (prefix === 'llama' || prefix === 'openrail' || prefix === 'rail') {
            return normalised.startsWith(prefix)
        }
        return normalised === prefix || normalised.startsWith(`${prefix}-`)
    })) return 'restricted'
    return 'unknown'
}

export interface TalosLicensedModel {
    tags?: readonly string[] | null
    /** Normalised card metadata from the browse response, when available. */
    licence?: string | null
}

export function talosHasDeclaredPermissiveLicence(model: TalosLicensedModel): boolean {
    return talosClassifyModelLicence(talosModelLicenceId(model.tags, model.licence))
        === 'permissive-declared'
}
