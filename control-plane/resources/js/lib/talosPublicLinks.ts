export interface TalosPublicLinks {
    avmDeepDive?: string
    patreon?: string
    kofi?: string
}

const LINK_KEYS = ['avmDeepDive', 'patreon', 'kofi'] as const

function acceptedLink(value: unknown): string | null {
    if (typeof value !== 'string' || value === '' || /\s/.test(value)) return null

    let url: URL
    try {
        url = new URL(value)
    } catch {
        return null
    }

    if (url.protocol !== 'https:' || url.username !== '' || url.password !== '') return null

    return value
}

export function parseTalosPublicLinks(value: unknown): TalosPublicLinks {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {}

    const links: TalosPublicLinks = {}
    for (const key of LINK_KEYS) {
        const accepted = acceptedLink((value as Record<string, unknown>)[key])
        if (accepted) links[key] = accepted
    }

    return links
}
