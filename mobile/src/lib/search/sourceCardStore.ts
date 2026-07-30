/**
 * Where a Library source card's bytes live.
 *
 * Slice 3 turned up the fact that decided this: a saved search stores ONE
 * dossier holding MANY links, so a card cannot be a field on a file's metadata
 * — several links share the file. A card belongs to the URL, not to whichever
 * dossier happened to mention it.
 *
 * Keying the stored bytes by a digest of the canonical URL makes that literal.
 * A site found in two different searches has one card; the presence of the file
 * IS the index, so there is no second structure to keep in step, no schema
 * migration, and no concurrent-write problem to get wrong.
 *
 * The URL is attacker-influenced and the result is a filesystem path, so it is
 * hashed rather than sanitised: no part of a hostile URL can survive into a
 * traversal, a separator, or a name the platform reserves.
 */

const CARD_PREFIX = 'talos-vault/cards/'

/**
 * SVG is deliberately absent. An SVG "icon" is a document that can carry script
 * and external references; it never becomes a stored file here.
 */
const EXTENSIONS: Readonly<Record<string, string>> = {
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/webp': 'webp',
    'image/gif': 'gif',
    'image/x-icon': 'ico',
    'image/vnd.microsoft.icon': 'ico',
}

export type TalosSourceCardKind = 'icon' | 'preview'

async function digest(value: string): Promise<string> {
    const bytes = new TextEncoder().encode(value)
    const hash = await crypto.subtle.digest('SHA-256', bytes)
    return [...new Uint8Array(hash)]
        .slice(0, 16)
        .map((byte) => byte.toString(16).padStart(2, '0'))
        .join('')
}

export async function talosSourceCardPath(
    url: string,
    kind: TalosSourceCardKind,
    contentType: string,
): Promise<string> {
    const extension = EXTENSIONS[contentType.toLowerCase().split(';')[0]?.trim() ?? '']
    if (!extension) throw new Error('TALOS_SOURCE_CARD_TYPE_UNSUPPORTED')
    return `${CARD_PREFIX}${await digest(url)}-${kind}.${extension}`
}
