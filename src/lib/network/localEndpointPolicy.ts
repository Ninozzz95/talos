/**
 * I-11 — which provider endpoints TALOS will actually talk to, and over what.
 *
 * Ollama runs on the user's own machine and speaks plain HTTP. Android has
 * refused cleartext by default since Android 9, so an endpoint the settings
 * screen accepted was rejected by the platform before a byte moved, with an
 * error that explained nothing.
 *
 * Permitting cleartext is a manifest-level switch and it is all-or-nothing:
 * `network_security_config.xml` matches on host NAMES, so "private ranges only"
 * cannot be expressed there — verified against the current Android
 * documentation, which offers no IP or CIDR form for `<domain>`. The narrowing
 * therefore has to happen in the app, and TALOS is distributed, so this rule
 * protects other people's phones and not just one.
 *
 * From Android 17 the platform adds a second, independent gate: reaching a
 * local network address needs the `ACCESS_LOCAL_NETWORK` runtime permission,
 * which the user grants and can revoke. This module is not the only guardrail.
 */

export type TalosEndpointVerdict =
    | { readonly allowed: true; readonly cleartext: boolean }
    | {
        readonly allowed: false
        readonly reason: 'malformed' | 'scheme' | 'credentials' | 'cleartext_public'
    }

function ipv4Octets(hostname: string): readonly number[] | null {
    const parts = hostname.split('.')
    if (parts.length !== 4) return null
    const octets: number[] = []
    for (const part of parts) {
        // Reject "01" and "+1": a lenient parse is how an address sneaks past.
        if (!/^\d{1,3}$/.test(part)) return null
        const value = Number(part)
        if (value > 255) return null
        octets.push(value)
    }
    return octets
}

/**
 * Private per RFC 1918, plus loopback. Link-local (169.254.0.0/16) is
 * deliberately NOT here: nothing on a phone should be reaching a cloud
 * metadata endpoint, and excluding the range costs one comparison.
 */
function isPrivateIpv4(hostname: string): boolean {
    const octets = ipv4Octets(hostname)
    if (!octets) return false
    const [a, b] = octets as [number, number, number, number]
    if (a === 127) return true
    if (a === 10) return true
    if (a === 172 && b >= 16 && b <= 31) return true
    if (a === 192 && b === 168) return true
    return false
}

/**
 * Loopback and unique-local. Link-local (fe80::/10) is excluded for the same
 * reason as its IPv4 counterpart.
 */
function isPrivateIpv6(hostname: string): boolean {
    if (!hostname.includes(':')) return false
    const value = hostname.toLowerCase()
    if (value === '::1') return true
    // fc00::/7 — the first byte is 0xfc or 0xfd.
    return /^f[cd][0-9a-f]{2}:/.test(value)
}

/**
 * Classify a user-configured provider endpoint.
 *
 * Cleartext is allowed only to an IP LITERAL in a private range, or to
 * loopback by name. A host name is refused however local it sounds, because a
 * name is resolved later and by someone else: `ollama.lan` can answer with a
 * public address — or a different one on the second lookup — and the "local"
 * exception would have quietly become a plaintext connection to the internet.
 * Only an address written out in full states where it goes at the moment we
 * decide.
 */
export function talosClassifyProviderEndpoint(value: string): TalosEndpointVerdict {
    const trimmed = typeof value === 'string' ? value.trim() : ''
    if (trimmed === '') return { allowed: false, reason: 'malformed' }
    let url: URL
    try {
        url = new URL(trimmed)
    } catch {
        return { allowed: false, reason: 'malformed' }
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        return { allowed: false, reason: 'scheme' }
    }
    // Credentials in a URL leak into logs, diagnostics and redirects.
    if (url.username !== '' || url.password !== '') {
        return { allowed: false, reason: 'credentials' }
    }
    if (url.protocol === 'https:') return { allowed: true, cleartext: false }

    // WHATWG keeps the brackets on an IPv6 host: `[::1]`, not `::1`.
    const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, '')
    const local = hostname === 'localhost'
        || isPrivateIpv4(hostname)
        || isPrivateIpv6(hostname)
    return local
        ? { allowed: true, cleartext: true }
        : { allowed: false, reason: 'cleartext_public' }
}
