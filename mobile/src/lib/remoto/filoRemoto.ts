/**
 * ⛔ CLIENT DEL CONTROLLO REMOTO — il filo, lato telefono (ledger `LEDGER-CLIENT-REMOTO-MOBILE-2026-10-20.md`, fetta R-M1).
 *
 * Contratti firmati: `CONTRATTO-FILO-CONTROLLO-REMOTO-2026-10-17.md` (v0.3) e `FILO-REMOTO-v1-2026-10-18.md` (v1 + v1.1). Il lato PC è
 * il riferimento, r4 `aeab15222`, `harness-ui/src/remoto/`:
 *   · `accoppiamento.mjs` `testoDelQr` e `codiceDiVerifica` (qui `leggiQrRemoto` e `codiceDiAccoppiamento`);
 *   · `filo.mjs` `CODICI` e `creaLettore` (il taglio a 4 byte sta nel nativo: qui arrivano messaggi interi, si controlla la forma).
 * Il telefono calcola il codice da sé e lo confronta con quello che manda il PC: è la difesa contro un QR fotografato da altri.
 */

export const ETICHETTA_CODICE_REMOTO = 'talos-remote-pair/v1'
export const ALPN_LAVORO_REMOTO = 'talos-remote/1'
export const ALPN_ACCOPPIAMENTO_REMOTO = 'talos-remote-pair/1'
export const VERSIONE_FILO_REMOTO = 1
const BYTE_GETTONE = 16

/** I codici d'errore del PC (`filo.mjs` `CODICI` @ aeab15222): le frasi le sceglie il telefono, in inglese e in italiano. */
export const CODICI_ERRORE_REMOTO: readonly string[] = Object.freeze([
    'VERSION_UNSUPPORTED', 'NOT_PAIRED', 'PAIR_TOKEN_INVALID', 'PAIR_LOCKED', 'PAIR_REJECTED', 'PAIR_EXPIRED', 'REVOKED',
    'RATE_LIMITED', 'TOO_LARGE', 'BAD_MESSAGE', 'UNKNOWN_OPERATION', 'NOT_ALLOWED_REMOTELY', 'OPERATION_FAILED', 'WAKE_TOKEN_INVALID',
])

export interface QrRemoto {
    pcId: string
    /** Il relay scelto per il fuori casa (n0 o talos-relay), o `null`: allora quelli predefiniti di iroh. */
    relay: string | null
    /** 16 byte casuali in base64url senza riempimento: monouso, 5 minuti. */
    gettone: string
    /** In millisecondi (il QR porta i secondi Unix). */
    scadeAlle: number
}

function byteDaBase64url(testo: string): Uint8Array | null {
    if (!/^[A-Za-z0-9_-]+$/u.test(testo)) return null
    try {
        const b64 = testo.replace(/-/gu, '+').replace(/_/gu, '/') + '='.repeat((4 - (testo.length % 4)) % 4)
        const grezzo = atob(b64)
        return Uint8Array.from(grezzo, (c) => c.charCodeAt(0))
    } catch {
        return null
    }
}

/** Il testo del QR del PC (`testoDelQr`): `talos-remote:1?pc=<id>&relay=<url>&t=<gettone>&exp=<secondi>`. `null` se non lo è. */
export function leggiQrRemoto(testo: string): QrRemoto | null {
    const prefisso = 'talos-remote:1?'
    if (typeof testo !== 'string' || !testo.startsWith(prefisso)) return null
    const parametri = new URLSearchParams(testo.slice(prefisso.length))
    const pcId = parametri.get('pc') ?? ''
    const gettone = parametri.get('t') ?? ''
    const exp = parametri.get('exp') ?? ''
    const relay = parametri.get('relay')
    if (!pcId || byteDaBase64url(gettone)?.length !== BYTE_GETTONE || !/^\d+$/u.test(exp)) return null
    if (relay !== null) {
        let url: URL
        try { url = new URL(relay) } catch { return null }
        // come `configuraRelay` del PC: fuori casa il relay va in https; http solo verso la propria macchina (le prove)
        const locale = ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)
        if (url.protocol !== 'https:' && !(url.protocol === 'http:' && locale)) return null
    }
    return { pcId, relay, gettone, scadeAlle: Number(exp) * 1000 }
}

/** Il codice di 6 cifre (§2 del foglio): SHA-256(etichetta ‖ 0 ‖ pcId ‖ 0 ‖ telefonoId ‖ 0 ‖ gettone), 4 byte BE mod 10^6. */
export async function codiceDiAccoppiamento(pcId: string, telefonoId: string, gettone: string): Promise<string> {
    const byteGettone = byteDaBase64url(gettone)
    if (!pcId || !telefonoId || byteGettone?.length !== BYTE_GETTONE) throw new Error('PAIR_BAD_INPUT')
    const codifica = new TextEncoder()
    const pezzi = [codifica.encode(ETICHETTA_CODICE_REMOTO), new Uint8Array([0]), codifica.encode(pcId), new Uint8Array([0]),
        codifica.encode(telefonoId), new Uint8Array([0]), byteGettone]
    const tutto = new Uint8Array(pezzi.reduce((n, p) => n + p.length, 0))
    let i = 0
    for (const p of pezzi) { tutto.set(p, i); i += p.length }
    const impronta = new DataView(await crypto.subtle.digest('SHA-256', tutto))
    return String(impronta.getUint32(0, false) % 1_000_000).padStart(6, '0')
}

/** La forma minima di un messaggio del filo (`creaLettore`): oggetto, `v:1`, `t` non vuoto. */
export function messaggioRemotoValido(m: unknown): m is { v: 1; t: string; [k: string]: unknown } {
    if (!m || typeof m !== 'object' || Array.isArray(m)) return false
    const r = m as { v?: unknown; t?: unknown }
    return r.v === VERSIONE_FILO_REMOTO && typeof r.t === 'string' && r.t.length > 0
}

/** Il numero di una richiesta (`n`, 8-64 `[A-Za-z0-9_-]`): unico per azione, riusato tale e quale per «Riprova». */
export function nuovoNumeroRichiesta(): string {
    const byte = crypto.getRandomValues(new Uint8Array(12))
    return btoa(String.fromCharCode(...byte)).replace(/\+/gu, '-').replace(/\//gu, '_').replace(/=+$/u, '')
}
