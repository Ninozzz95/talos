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

/**
 * The stored extension follows the content type the site served, so "is there
 * an icon for this url" is a question about several possible files rather than
 * one. Reading, and deciding whether a url still needs work, must look for the
 * same set — an icon check that only knew about `.png` would re-fetch every
 * `.ico` site forever, having stored a perfectly good icon each time.
 *
 * A preview is only ever the webp this app re-encoded.
 */
const ICON_TYPES = ['image/png', 'image/x-icon', 'image/jpeg', 'image/webp', 'image/gif'] as const
const PREVIEW_TYPES = ['image/webp'] as const

export function talosSourceCardTypes(kind: TalosSourceCardKind): readonly string[] {
    return kind === 'preview' ? PREVIEW_TYPES : ICON_TYPES
}

/**
 * Canonicalise, then hash — here, so writer and readers cannot disagree.
 *
 * The first cut canonicalised in the capture and hashed raw everywhere else, so
 * a link stored as `https://example.org` looked for a card written under
 * `https://example.org/` and never found it: the site was re-fetched forever
 * while its perfectly good icon sat on disk. A url that will not parse has no
 * path at all rather than a path that means nothing.
 */
async function digest(url: string): Promise<string> {
    const bytes = new TextEncoder().encode(new URL(url).toString())
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

/**
 * Where the record of a FAILED capture lives.
 *
 * The absence of a card cannot distinguish "never tried" from "tried, and this
 * site has no favicon" — so without this mark, every dead link is a page fetch
 * on every Library open, forever. It holds the time of the attempt rather than
 * being a bare flag, because a phone that was merely offline must get another
 * chance instead of losing that favicon permanently.
 */
export async function talosSourceCardMissPath(url: string): Promise<string> {
    return `${CARD_PREFIX}${await digest(url)}-miss.txt`
}
