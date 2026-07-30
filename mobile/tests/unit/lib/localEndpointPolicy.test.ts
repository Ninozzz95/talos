import { describe, expect, it } from 'vitest'
import { talosClassifyProviderEndpoint } from '@/lib/network/localEndpointPolicy'

/**
 * I-11. Ollama runs on the user's own machine and speaks plain HTTP. Android
 * has refused cleartext by default since Android 9, so the endpoint the
 * settings screen happily accepted was rejected by the platform before a
 * single byte moved, with an error that explained nothing.
 *
 * Permitting cleartext is a manifest-level switch and it is all-or-nothing:
 * `network_security_config.xml` matches on host NAMES, so "private ranges
 * only" cannot be expressed there. The narrowing has to happen here instead,
 * and TALOS is distributed — the rule protects other people's phones, not just
 * one.
 *
 * The load-bearing decision is that cleartext is allowed only to an IP
 * LITERAL in a private range. A host name is refused however local it looks,
 * because a name is resolved later and by someone else: `ollama.lan` can
 * answer with a public address, and then the "local" exception has quietly
 * become a plaintext connection to the internet. Only an address written out
 * in full says where it goes at the moment we decide.
 */
describe('talosClassifyProviderEndpoint (I-11)', () => {
    it('accepts HTTPS anywhere, and reports it is not cleartext', () => {
        expect(talosClassifyProviderEndpoint('https://api.example.com/v1'))
            .toEqual({ allowed: true, cleartext: false })
        // HTTPS to a private address is still fine: encryption is the point.
        expect(talosClassifyProviderEndpoint('https://192.168.1.20:11434'))
            .toEqual({ allowed: true, cleartext: false })
    })

    it('accepts cleartext to a private IPv4 literal — the Ollama case', () => {
        for (const host of ['192.168.1.20', '10.0.0.5', '172.16.4.1', '172.31.255.254', '127.0.0.1']) {
            expect(talosClassifyProviderEndpoint(`http://${host}:11434`))
                .toEqual({ allowed: true, cleartext: true })
        }
    })

    it('accepts cleartext to loopback by name, which never leaves the device', () => {
        expect(talosClassifyProviderEndpoint('http://localhost:11434'))
            .toEqual({ allowed: true, cleartext: true })
    })

    it('accepts cleartext to IPv6 loopback and unique-local addresses', () => {
        expect(talosClassifyProviderEndpoint('http://[::1]:11434'))
            .toEqual({ allowed: true, cleartext: true })
        expect(talosClassifyProviderEndpoint('http://[fd12:3456::1]:11434'))
            .toEqual({ allowed: true, cleartext: true })
    })

    it('refuses cleartext to a public address', () => {
        expect(talosClassifyProviderEndpoint('http://93.184.216.34:11434'))
            .toEqual({ allowed: false, reason: 'cleartext_public' })
        expect(talosClassifyProviderEndpoint('http://172.32.0.1'))
            .toEqual({ allowed: false, reason: 'cleartext_public' })
        expect(talosClassifyProviderEndpoint('http://11.0.0.1'))
            .toEqual({ allowed: false, reason: 'cleartext_public' })
    })

    /**
     * The reason a name is not enough. `ollama.lan` looks local and resolves
     * wherever its DNS says — possibly to a public host, possibly differently
     * on the second lookup. The exception would have become a plaintext
     * connection to the internet, granted by a string that merely sounded safe.
     */
    it('refuses cleartext to any host NAME other than loopback', () => {
        for (const host of ['ollama.lan', 'my-nas.local', 'router', 'example.com']) {
            expect(talosClassifyProviderEndpoint(`http://${host}:11434`))
                .toEqual({ allowed: false, reason: 'cleartext_public' })
        }
    })

    it('refuses the link-local metadata address even though it is not routable', () => {
        // Nothing on a phone should be reaching a cloud metadata endpoint, and
        // the cost of excluding it is one comparison.
        expect(talosClassifyProviderEndpoint('http://169.254.169.254/latest/meta-data'))
            .toEqual({ allowed: false, reason: 'cleartext_public' })
    })

    it('refuses credentials embedded in the URL, on either scheme', () => {
        expect(talosClassifyProviderEndpoint('http://user:pass@192.168.1.20:11434'))
            .toEqual({ allowed: false, reason: 'credentials' })
        expect(talosClassifyProviderEndpoint('https://user:pass@api.example.com'))
            .toEqual({ allowed: false, reason: 'credentials' })
    })

    it('refuses anything that is not HTTP or HTTPS', () => {
        for (const value of ['ftp://192.168.1.20', 'file:///etc/passwd', 'javascript:alert(1)']) {
            expect(talosClassifyProviderEndpoint(value)).toEqual({ allowed: false, reason: 'scheme' })
        }
    })

    it('refuses what is not a URL at all', () => {
        for (const value of ['', '   ', 'not a url', '192.168.1.20:11434']) {
            expect(talosClassifyProviderEndpoint(value)).toEqual({ allowed: false, reason: 'malformed' })
        }
    })
})
