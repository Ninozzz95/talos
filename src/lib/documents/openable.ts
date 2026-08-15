/**
 * Whether the in-app viewer has anything useful to show for a file.
 *
 * Pure and eagerly importable on purpose: the SERVICE that hands a file to
 * another app pulls in Capacitor Filesystem and Share, and loading those to
 * answer a question about a media type would drag native plugins into a text
 * preview — and into every test that renders one.
 */
export function talosNeedsExternalOpen(mediaType: string): boolean {
    return !(mediaType.startsWith('text/')
        || mediaType === 'application/json'
        || mediaType.startsWith('image/'))
}
