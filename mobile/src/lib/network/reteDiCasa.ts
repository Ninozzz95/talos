import { TalosMobileProviderError, type TalosMobileProviderOperation } from '@/lib/chat/providerErrors'
import { talosReteLocaleBloccata } from '@/lib/network/reteLocaleBloccata'

/**
 * ASS-148, parte Ollama (owner 29/10 «Frase + pulsante», OK del Desktop). Un modulo a parte, caricato SOLO quando una chiamata di rete
 * fallisce: il pezzo d'avvio non ne paga il peso (il tetto è a 669.000 byte).
 *
 * La rete di casa è quella che il permesso «Rete locale» di Android 17 copre: privati IPv4 (RFC 1918), link-local 169.254/16, IPv6
 * fc00::/7 e fe80::/10, nomi mDNS `.local`. Mai il loopback, né internet. Serve solo a scegliere la frase dell'errore: dove si può
 * andare lo decide `talosClassifyProviderEndpoint`.
 */
export function talosHostDellaReteDiCasa(hostname: string): boolean {
    const host = hostname.trim().toLowerCase().replace(/^\[|\]$/g, '')
    if (host.endsWith('.local') && host.length > '.local'.length) return true
    // un IPv4 scritto dentro un IPv6 («::ffff:192.168.1.5»): conta l'IPv4 (nota del Desktop, 29/10)
    if (host.startsWith('::ffff:') && host.slice(7).includes('.')) return talosHostDellaReteDiCasa(host.slice(7))
    const v4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host)
    if (v4) {
        const [a, b] = [Number(v4[1]), Number(v4[2])]
        if (v4.slice(1).some((o) => Number(o) > 255)) return false
        return a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 169 && b === 254)
    }
    if (!host.includes(':')) return false
    return /^f[cd][0-9a-f]{0,2}:/.test(host) || /^fe[89ab][0-9a-f]?:/.test(host)
}

/** L'errore da lanciare al posto di un errore di RETE: la causa vera se la rete di casa è bloccata dal permesso, se no quello di prima. */
export async function talosErroreDellaReteDiCasa(errore: unknown, endpoint: string, operation: TalosMobileProviderOperation): Promise<unknown> {
    let host = ''
    try { host = new URL(endpoint).hostname } catch { return errore }
    if (!talosHostDellaReteDiCasa(host) || !await talosReteLocaleBloccata()) return errore
    // la causa di rete vera resta attaccata, per i registri e la copia della diagnostica (nota del Desktop, 29/10)
    return Object.assign(new TalosMobileProviderError({ provider: 'ollama', operation, message: 'TALOS_PROVIDER_LOCAL_NETWORK_BLOCKED' }), { cause: errore })
}
