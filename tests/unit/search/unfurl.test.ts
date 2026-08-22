import { describe, expect, it } from 'vitest'
import { talosUnfurlPage } from '@/lib/search/unfurl'

/**
 * Slice 1 of the Library source cards (owner 2026-07-30, complete scope).
 *
 * Pure HTML → card fields. The competitors do this in a cloud service that
 * sees every URL; TALOS does it on the bytes it already fetched through its own
 * safe-web boundary, so this layer is a string parser with no network and no
 * excuse for a network. Everything downstream — the icon and preview fetch, the
 * grid tile, the sources chip — hangs off what this returns.
 *
 * Adversarial, because HTML is attacker-controlled: relative URLs, javascript:,
 * data:, protocol-relative, and tags that simply are not there.
 */
const PAGE = 'https://blog.example.com/posts/omniroute'

describe('talosUnfurlPage', () => {
    it('prefers Open Graph over the document fallbacks', () => {
        const card = talosUnfurlPage(PAGE, `
            <html><head>
                <title>Fallback title</title>
                <meta property="og:title" content="OmniRoute, explained">
                <meta property="og:site_name" content="Example Blog">
                <meta property="og:image" content="https://cdn.example.com/hero.jpg">
                <link rel="icon" href="/favicon-32.png" sizes="32x32">
            </head></html>
        `)

        expect(card).toEqual({
            title: 'OmniRoute, explained',
            siteName: 'Example Blog',
            imageUrl: 'https://cdn.example.com/hero.jpg',
            iconUrl: 'https://blog.example.com/favicon-32.png',
        })
    })

    it('falls back to <title> and the hostname when Open Graph is absent', () => {
        const card = talosUnfurlPage(PAGE, '<html><head><title>Plain page</title></head></html>')

        expect(card.title).toBe('Plain page')
        expect(card.siteName).toBe('blog.example.com')
    })

    it('resolves every URL against the page, including protocol-relative ones', () => {
        const card = talosUnfurlPage(PAGE, `
            <meta property="og:image" content="//cdn.example.com/x.png">
            <link rel="icon" href="icons/site.png">
        `)

        expect(card.imageUrl).toBe('https://cdn.example.com/x.png')
        // Relative to the page's directory, resolved by the URL parser.
        expect(card.iconUrl).toBe('https://blog.example.com/posts/icons/site.png')
    })

    it('picks the largest declared icon, and apple-touch-icon over a bare /favicon.ico', () => {
        const card = talosUnfurlPage(PAGE, `
            <link rel="icon" href="/small.png" sizes="16x16">
            <link rel="icon" href="/big.png" sizes="180x180">
            <link rel="apple-touch-icon" href="/apple.png">
        `)

        expect(card.iconUrl).toBe('https://blog.example.com/big.png')
    })

    it('falls back to /favicon.ico when the page declares no icon', () => {
        const card = talosUnfurlPage(PAGE, '<html><head><title>x</title></head></html>')
        expect(card.iconUrl).toBe('https://blog.example.com/favicon.ico')
    })

    it('refuses a javascript: or data: URL in any slot, rather than passing it on', () => {
        const card = talosUnfurlPage(PAGE, `
            <meta property="og:image" content="javascript:alert(1)">
            <link rel="icon" href="data:image/png;base64,AAAA">
        `)

        // The malicious image is dropped; the icon falls back to the safe default.
        expect(card.imageUrl).toBeNull()
        expect(card.iconUrl).toBe('https://blog.example.com/favicon.ico')
    })

    it('drops an icon or image on a different, non-https host it cannot vouch for', () => {
        const card = talosUnfurlPage(PAGE, `
            <meta property="og:image" content="http://insecure.example.com/x.png">
        `)
        // http downgrade for a subresource we would fetch: refused.
        expect(card.imageUrl).toBeNull()
    })

    it('bounds a hostile title instead of carrying it whole', () => {
        const card = talosUnfurlPage(PAGE, `
            <meta property="og:title" content="${'A'.repeat(5000)}">
        `)
        expect(card.title.length).toBeLessThanOrEqual(300)
    })

    it('returns honest nulls, never throws, on empty or junk input', () => {
        expect(() => talosUnfurlPage(PAGE, '')).not.toThrow()
        const card = talosUnfurlPage(PAGE, '')
        expect(card.title).toBe('blog.example.com')
        expect(card.imageUrl).toBeNull()
        expect(card.iconUrl).toBe('https://blog.example.com/favicon.ico')
    })

    it('decodes HTML entities in attribute values', () => {
        const card = talosUnfurlPage(PAGE, `
            <meta property="og:title" content="Cost &amp; latency &lt;100ms">
        `)
        expect(card.title).toBe('Cost & latency <100ms')
    })
})
