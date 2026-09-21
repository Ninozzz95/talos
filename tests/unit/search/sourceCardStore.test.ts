import { describe, expect, it } from 'vitest'
import { talosSourceCardMissPath, talosSourceCardPath } from '@/lib/search/sourceCardStore'

/**
 * Slice 4 of the Library source cards, decided by what slice 3 found: a saved
 * search stores ONE dossier holding MANY links, so a card cannot live in a
 * file's metadata — several links share the file.
 *
 * A card belongs to the URL, not to whichever dossier happened to mention it.
 * Keying the stored bytes by a digest of the canonical URL makes that literal:
 * a site found in two different searches has one card, and the presence of the
 * file IS the index, so there is no second structure to keep in step, no
 * migration, and no concurrent-write problem.
 */
describe('talosSourceCardPath', () => {
    it('puts the bytes under the private prefix, keyed by the URL', async () => {
        const path = await talosSourceCardPath('https://example.org/a', 'icon', 'image/png')

        expect(path.startsWith('talos-vault/cards/')).toBe(true)
        expect(path.endsWith('-icon.png')).toBe(true)
    })

    it('gives the same URL the same path, so a site found twice has one card', async () => {
        const first = await talosSourceCardPath('https://example.org/a', 'icon', 'image/png')
        const second = await talosSourceCardPath('https://example.org/a', 'icon', 'image/png')

        expect(first).toBe(second)
    })

    it('keeps icon and preview apart for the same URL', async () => {
        const icon = await talosSourceCardPath('https://example.org/a', 'icon', 'image/png')
        const preview = await talosSourceCardPath('https://example.org/a', 'preview', 'image/png')

        expect(icon).not.toBe(preview)
    })

    /**
     * The writer had canonicalised before hashing and the readers had not, so a
     * link stored as `https://example.org` looked for a card written under
     * `https://example.org/` and never found it — every such site would have
     * been re-fetched forever while its perfectly good icon sat on disk.
     * Canonicalising HERE is the only version of this that cannot drift: there
     * is one function, so there is one answer.
     */
    it('gives one address written two ways one card', async () => {
        const bare = await talosSourceCardPath('https://example.org', 'icon', 'image/png')
        const slashed = await talosSourceCardPath('https://example.org/', 'icon', 'image/png')
        const cased = await talosSourceCardPath('https://EXAMPLE.org/', 'icon', 'image/png')

        expect(bare).toBe(slashed)
        expect(cased).toBe(slashed)
    })

    it('has no path at all for something that is not an address', async () => {
        await expect(talosSourceCardPath('not a url', 'icon', 'image/png')).rejects.toThrow()
        await expect(talosSourceCardMissPath('not a url')).rejects.toThrow()
    })

    it('keeps the record of a failure apart from the card itself', async () => {
        const miss = await talosSourceCardMissPath('https://example.org/a')
        const icon = await talosSourceCardPath('https://example.org/a', 'icon', 'image/png')

        expect(miss).toMatch(/^talos-vault\/cards\/[0-9a-f]{32}-miss\.txt$/)
        expect(miss.slice(0, 50)).toBe(icon.slice(0, 50))
    })

    it('gives different URLs different paths', async () => {
        const a = await talosSourceCardPath('https://example.org/a', 'icon', 'image/png')
        const b = await talosSourceCardPath('https://example.org/b', 'icon', 'image/png')

        expect(a).not.toBe(b)
    })

    /**
     * The URL is attacker-influenced and the result is a filesystem path. A
     * digest means no part of it can ever be a traversal, a separator, or a
     * name the platform reserves.
     */
    it('cannot be walked out of its directory by a hostile URL', async () => {
        for (const hostile of [
            'https://example.org/../../etc/passwd',
            'https://example.org/a%00.png',
            'https://example.org/' + 'x'.repeat(4000),
        ]) {
            const path = await talosSourceCardPath(hostile, 'icon', 'image/png')
            expect(path).toMatch(/^talos-vault\/cards\/[0-9a-f]{32}-icon\.png$/)
        }
    })

    it('maps the image type to a known extension and refuses the rest', async () => {
        expect(await talosSourceCardPath('https://e.org/a', 'icon', 'image/jpeg'))
            .toMatch(/\.jpg$/)
        expect(await talosSourceCardPath('https://e.org/a', 'icon', 'image/webp'))
            .toMatch(/\.webp$/)
        // An SVG icon is a document that executes; it never becomes a stored file.
        await expect(talosSourceCardPath('https://e.org/a', 'icon', 'image/svg+xml'))
            .rejects.toThrow('TALOS_SOURCE_CARD_TYPE_UNSUPPORTED')
    })
})
