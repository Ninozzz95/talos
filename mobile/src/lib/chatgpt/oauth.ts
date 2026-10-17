/**
 * N15 — «Continue with ChatGPT» sul telefono: i CONTI dell'accesso col piano ChatGPT della persona.
 *
 * Porto fedele di `harness-ui/src/chatgpt-oauth.mjs` del desktop r4 `2a61e35dc` (stessi nomi, stesse regole, stessi
 * codici d'errore), con le prove del desktop portate in `tests/unit/chatgpt/oauth.test.ts`. Cambia solo il motore:
 * qui c'è la WebView, quindi WebCrypto e `getRandomValues` al posto di `node:crypto` e di `Buffer`; per questo la verifica
 * dell'`id_token` è asincrona.
 *
 * Fonti ufficiali (developers.openai.com/siwc/token-sharing-open-source/, rilette dal desktop l'11/10/2026): authorize
 * `https://auth.openai.com/api/accounts/authorize`; prima volta `client_id=dynamic_agent_client` + `agent_name_hint` +
 * `ext_agent_host_id`; PKCE S256, `state`, `nonce`; ritorno `http://127.0.0.1:<porta>/auth/callback` (cambia solo la
 * porta, mai `localhost`); scambio senza segreto; accesso 1 ora, refresh 30 giorni che ruota, `earliest_refresh_at`.
 *
 * ⛔ Nessuna rete qui dentro e nessun token nei messaggi d'errore (CHATGPT-08).
 */

export const EMITTENTE = 'https://auth.openai.com'
export const INDIRIZZO_AUTORIZZAZIONE = 'https://auth.openai.com/api/accounts/authorize'
export const INDIRIZZO_SCAMBIO = 'https://auth.openai.com/api/accounts/oauth/token'
export const INDIRIZZO_SCOPERTA = 'https://auth.openai.com/.well-known/openid-configuration'
export const RISORSA = 'https://api.openai.com/v1'
export const CLIENT_DI_REGISTRAZIONE = 'dynamic_agent_client'
export const NOME_APP = 'TALOS'
export const PERCORSO_RITORNO = '/auth/callback'
export const SCOPE_DEL_PIANO = 'chatgpt.tokens.use.direct'
export const SCOPE_RICHIESTI: readonly string[] = Object.freeze(['openid', 'profile', 'email', 'offline_access', 'resource.invoke', SCOPE_DEL_PIANO])
export const ERRORI_DI_RINNOVO_DEFINITIVI: readonly string[] = Object.freeze(['invalid_grant', 'invalid_refresh_token', 'token_expired',
    'refresh_token_expired', 'refresh_token_reused', 'refresh_token_invalidated'])
/** Quanto prima della scadenza si rinnova: un giro lungo non deve trovarsi il token scaduto a metà. */
export const MARGINE_DI_RINNOVO_MS = 5 * 60 * 1000

export type TalosChatgptErrore = Error & { code: string }

function errore(messaggio: string, code: string): TalosChatgptErrore {
    return Object.assign(new Error(messaggio), { code })
}

/** Confronto a tempo costante (come `timingSafeEqual`): vuoti o di lunghezza diversa non sono mai uguali. */
function uguali(a: unknown, b: unknown): boolean {
    const x = String(a ?? ''); const y = String(b ?? '')
    if (x.length !== y.length || x.length === 0) return false
    let diversi = 0
    for (let i = 0; i < x.length; i++) diversi |= x.charCodeAt(i) ^ y.charCodeAt(i)
    return diversi === 0
}

export function base64Url(bytes: Uint8Array): string {
    let binario = ''
    for (const byte of bytes) binario += String.fromCharCode(byte)
    return btoa(binario).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function daBase64Url(testo: string): Uint8Array {
    const normale = testo.replace(/-/g, '+').replace(/_/g, '/')
    const binario = atob(normale + '='.repeat((4 - (normale.length % 4)) % 4))
    return Uint8Array.from(binario, (c) => c.charCodeAt(0))
}

const casuali = (quanti: number): Uint8Array => crypto.getRandomValues(new Uint8Array(quanti))

/** L'identità stabile di QUESTA installazione: un UUID casuale, mai un'email o un id della persona. Si crea una volta e si tiene. */
export function nuovoIdDellHost({ uuid = () => crypto.randomUUID() }: { uuid?: () => string } = {}): string {
    return `urn:uuid:${uuid()}`
}

/** Lo `state` e il `nonce`: 32 byte casuali. */
export function creaStato({ random = casuali }: { random?: (quanti: number) => Uint8Array } = {}): string {
    return base64Url(random(32))
}
export function creaNonce({ random = casuali }: { random?: (quanti: number) => Uint8Array } = {}): string {
    return base64Url(random(32))
}

/** La coppia PKCE (RFC 7636, S256): il verificatore resta sul telefono, la sfida va nell'indirizzo. */
export async function creaPkce({ random = casuali }: { random?: (quanti: number) => Uint8Array } = {}): Promise<{ verifier: string, challenge: string }> {
    const verifier = base64Url(random(32))
    const impronta = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))
    return { verifier, challenge: base64Url(new Uint8Array(impronta)) }
}

/** L'indirizzo di ritorno: sempre `127.0.0.1`, cambia solo la porta. */
export function indirizzoDiRitorno(porta: number): string {
    if (!Number.isInteger(porta) || porta < 1 || porta > 65535) throw errore('The sign-in callback needs a valid port.', 'CHATGPT_PORTA_NON_VALIDA')
    return `http://127.0.0.1:${porta}${PERCORSO_RITORNO}`
}

export interface TalosChatgptRichiestaDiAccesso {
    clientId?: string | null
    idDellHost: string
    ritorno: string
    stato: string
    nonce: string
    challenge: string
    idTokenPrecedente?: string | null
    email?: string | null
    consenso?: boolean
}

/**
 * L'indirizzo da aprire nella scheda del browser. `clientId` null = prima registrazione; altrimenti il client emesso
 * (`oaiapp_…`). `consenso` true solo quando la persona chiede di abilitare il piano dopo un accesso senza lo scope.
 */
export function indirizzoDiAutorizzazione(richiesta: TalosChatgptRichiestaDiAccesso): string {
    const { clientId = null, idDellHost, ritorno, stato, nonce, challenge, idTokenPrecedente = null, email = null, consenso = false } = richiesta ?? {}
    for (const [nome, valore] of Object.entries({ idDellHost, ritorno, stato, nonce, challenge })) {
        if (typeof valore !== 'string' || valore === '') throw errore(`The sign-in request is missing «${nome}».`, 'CHATGPT_RICHIESTA_INCOMPLETA')
    }
    if (clientId !== null && !clientIdEmesso(clientId)) throw errore('The saved client id is not one issued by OpenAI.', 'CHATGPT_CLIENT_NON_VALIDO')
    const url = new URL(INDIRIZZO_AUTORIZZAZIONE)
    const p = url.searchParams
    p.set('client_id', clientId ?? CLIENT_DI_REGISTRAZIONE)
    if (clientId === null) p.set('agent_name_hint', NOME_APP)
    p.set('ext_agent_host_id', idDellHost)
    p.set('response_type', 'code')
    p.set('redirect_uri', ritorno)
    p.set('scope', SCOPE_RICHIESTI.join(' '))
    p.set('resource', RISORSA)
    p.set('state', stato)
    p.set('nonce', nonce)
    p.set('code_challenge', challenge)
    p.set('code_challenge_method', 'S256')
    if (clientId !== null && idTokenPrecedente) p.set('id_token_hint', idTokenPrecedente)
    if (clientId !== null && email) p.set('login_hint', email)
    if (consenso) p.set('prompt', 'consent')
    return url.toString()
}

/** Vero solo per un client emesso dalla registrazione dinamica. */
export function clientIdEmesso(valore: unknown): valore is string {
    return typeof valore === 'string' && /^oaiapp_[A-Za-z0-9_-]{1,200}$/u.test(valore)
}

/**
 * Legge il ritorno dal browser. Torna `{ codice, clientId, scopes }` o lancia con un codice.
 * ⛔ Lo `state` si valida PER PRIMO, anche davanti a un errore: un ritorno con lo stato sbagliato non è nostro.
 */
export function leggiRitorno(
    indirizzo: string,
    { statoAtteso, clientIdSalvato = null }: { statoAtteso?: string, clientIdSalvato?: string | null } = {},
): { codice: string, clientId: string, scopes: string[] } {
    const url = new URL(indirizzo, 'http://127.0.0.1')
    if (url.pathname !== PERCORSO_RITORNO) throw errore('This is not the sign-in callback.', 'CHATGPT_RITORNO_SCONOSCIUTO')
    const p = url.searchParams
    if (!uguali(p.get('state'), statoAtteso)) throw errore('This sign-in answer does not belong to the request that was started.', 'CHATGPT_STATO_DIVERSO')
    if (p.get('error')) {
        const negato = p.get('error') === 'access_denied'
        throw errore(negato ? 'The sign-in was cancelled.' : 'OpenAI did not complete the sign-in.', negato ? 'CHATGPT_ACCESSO_NEGATO' : 'CHATGPT_AUTORIZZAZIONE_RIFIUTATA')
    }
    const codice = p.get('code')
    if (!codice) throw errore('The sign-in answer carries no code.', 'CHATGPT_CODICE_MANCANTE')
    const tornato = p.get('client_id')
    if (tornato !== null && !clientIdEmesso(tornato)) throw errore('OpenAI returned a client id of an unknown shape.', 'CHATGPT_CLIENT_NON_VALIDO')
    if (clientIdSalvato === null && tornato === null) throw errore('The first sign-in did not return a client id.', 'CHATGPT_CLIENT_NON_VALIDO')
    if (clientIdSalvato !== null && tornato !== null && tornato !== clientIdSalvato) {
        throw errore('OpenAI returned a different client id from the saved one.', 'CHATGPT_CLIENT_DIVERSO')
    }
    const scopes = String(p.get('scope') ?? '').split(/\s+/u).filter(Boolean)
    return { codice, clientId: (tornato ?? clientIdSalvato)!, scopes }
}

/** Il corpo (form) dello scambio del codice. Stesso `redirect_uri` e stessa `resource` della richiesta. */
export function corpoDelloScambio({ clientId, codice, verifier, ritorno }: { clientId?: string, codice?: string, verifier?: string, ritorno?: string } = {}): string {
    if (!clientIdEmesso(clientId)) throw errore('The code exchange needs the issued client id.', 'CHATGPT_CLIENT_NON_VALIDO')
    for (const [nome, valore] of Object.entries({ codice, verifier, ritorno })) {
        if (typeof valore !== 'string' || valore === '') throw errore(`The code exchange is missing «${nome}».`, 'CHATGPT_RICHIESTA_INCOMPLETA')
    }
    return new URLSearchParams({ grant_type: 'authorization_code', client_id: clientId, code: codice!, code_verifier: verifier!, redirect_uri: ritorno!,
        resource: RISORSA }).toString()
}

/** Il corpo (form) del rinnovo. */
export function corpoDelRinnovo({ clientId, refreshToken }: { clientId?: string, refreshToken?: string } = {}): string {
    if (!clientIdEmesso(clientId)) throw errore('The token renewal needs the issued client id.', 'CHATGPT_CLIENT_NON_VALIDO')
    if (typeof refreshToken !== 'string' || refreshToken === '') throw errore('There is no refresh token to renew with.', 'CHATGPT_RICHIESTA_INCOMPLETA')
    return new URLSearchParams({ grant_type: 'refresh_token', client_id: clientId, refresh_token: refreshToken }).toString()
}

function istante(valore: unknown): number | null {
    if (typeof valore === 'number' && Number.isFinite(valore)) return valore < 1e12 ? valore * 1000 : valore // secondi o millisecondi
    if (typeof valore === 'string' && valore !== '') {
        const t = /^\d+$/u.test(valore) ? istante(Number(valore)) : Date.parse(valore)
        return t !== null && Number.isFinite(t) ? t : null
    }
    return null
}

export interface TalosChatgptToken {
    accessToken: string
    refreshToken: string
    idToken: string | null
    scadeAlle: number
    rinnovaNonPrimaDi: number | null
    scopes: string[]
    pianoAbilitato: boolean
}

/**
 * Legge la risposta dell'endpoint dei token (scambio o rinnovo). `scopesPrecedenti` vale quando il rinnovo non ripete `scope`.
 * ⛔ Un refresh token mancante è un errore: senza, dopo un'ora la persona sarebbe fuori senza saperlo.
 */
export function leggiRispostaToken(
    risposta: unknown,
    { ora = Date.now(), scopesPrecedenti = null }: { ora?: number, scopesPrecedenti?: string[] | null } = {},
): TalosChatgptToken {
    if (!risposta || typeof risposta !== 'object') throw errore('OpenAI answered the token request in an unknown shape.', 'CHATGPT_RISPOSTA_INATTESA')
    const r = risposta as Record<string, unknown>
    const accesso = r.access_token; const refresh = r.refresh_token; const idToken = r.id_token ?? null; const durata = r.expires_in
    if (typeof accesso !== 'string' || accesso === '' || String(r.token_type ?? '').toLowerCase() !== 'bearer') {
        throw errore('OpenAI answered the token request without a bearer token.', 'CHATGPT_RISPOSTA_INATTESA')
    }
    if (typeof refresh !== 'string' || refresh === '') throw errore('OpenAI answered the token request without a refresh token.', 'CHATGPT_RISPOSTA_INATTESA')
    if (typeof durata !== 'number' || !Number.isFinite(durata) || durata <= 0) throw errore('OpenAI answered the token request without a lifetime.', 'CHATGPT_RISPOSTA_INATTESA')
    const scopes = typeof r.scope === 'string' ? r.scope.split(/\s+/u).filter(Boolean) : (scopesPrecedenti ?? [])
    return { accessToken: accesso, refreshToken: refresh, idToken: typeof idToken === 'string' && idToken !== '' ? idToken : null,
        scadeAlle: ora + durata * 1000, rinnovaNonPrimaDi: istante(r.earliest_refresh_at), scopes, pianoAbilitato: pianoAbilitato(scopes) }
}

/** Il piano paga solo se lo scope del piano è fra quelli CONCESSI (non fra quelli chiesti). */
export function pianoAbilitato(scopes: unknown): boolean {
    return Array.isArray(scopes) && scopes.includes(SCOPE_DEL_PIANO)
}

/** Vero se con questo codice il rinnovo non va ritentato: i token si tolgono e si rifà l'accesso. */
export function rinnovoDefinitivamenteFallito(codice: unknown): boolean {
    return ERRORI_DI_RINNOVO_DEFINITIVI.includes(String(codice ?? ''))
}

/** Quando rinnovare: `MARGINE_DI_RINNOVO_MS` prima della scadenza, ma mai prima di `rinnovaNonPrimaDi` se OpenAI l'ha dato. */
export function quandoRinnovare({ scadeAlle, rinnovaNonPrimaDi = null }: { scadeAlle?: number, rinnovaNonPrimaDi?: number | null } = {}): number {
    if (typeof scadeAlle !== 'number' || !Number.isFinite(scadeAlle)) throw errore('The token carries no expiry.', 'CHATGPT_RICHIESTA_INCOMPLETA')
    const voluto = scadeAlle - MARGINE_DI_RINNOVO_MS
    return typeof rinnovaNonPrimaDi === 'number' && Number.isFinite(rinnovaNonPrimaDi) ? Math.max(voluto, Math.min(rinnovaNonPrimaDi, scadeAlle)) : voluto
}

const ALGORITMI: Readonly<Record<string, { kty: string, importa: RsaHashedImportParams | EcKeyImportParams, verifica: AlgorithmIdentifier | EcdsaParams }>> = Object.freeze({
    RS256: { kty: 'RSA', importa: { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, verifica: { name: 'RSASSA-PKCS1-v1_5' } },
    // WebCrypto verifica ECDSA nel formato grezzo r‖s (IEEE P1363): lo stesso del JWS, nessuna conversione DER.
    ES256: { kty: 'EC', importa: { name: 'ECDSA', namedCurve: 'P-256' }, verifica: { name: 'ECDSA', hash: 'SHA-256' } },
})

/**
 * Verifica l'`id_token` e torna `{ sub, email }`. Ordine: forma, algoritmo ammesso (mai `none`, mai uno simmetrico), chiave
 * della JWKS con quel `kid`, FIRMA, e solo dopo le affermazioni — issuer, audience = client emesso, scadenza, nonce.
 * `tolleranzaMs` copre l'orologio del telefono.
 */
export async function verificaIdToken(
    idToken: unknown,
    { jwks, clientId, nonce, ora = Date.now(), tolleranzaMs = 60_000 }:
        { jwks?: { keys?: unknown[] }, clientId?: string, nonce?: string, ora?: number, tolleranzaMs?: number } = {},
): Promise<{ sub: string, email: string | null }> {
    const rifiuta = (perche: string) => errore(`The identity token from OpenAI is not valid: ${perche}.`, 'CHATGPT_ID_TOKEN_NON_VALIDO')
    const pezzi = String(idToken ?? '').split('.')
    if (pezzi.length !== 3 || pezzi.some((p) => p === '')) throw rifiuta('unknown shape')
    let testa: Record<string, unknown>; let corpo: Record<string, unknown>
    try {
        const testo = (p: string) => JSON.parse(new TextDecoder().decode(daBase64Url(p))) as Record<string, unknown>
        testa = testo(pezzi[0]!); corpo = testo(pezzi[1]!)
    } catch { throw rifiuta('unreadable') }
    // Revisione 13/10/2026: testa e corpo devono essere OGGETTI (un corpo `null` è JSON valido e faceva uscire un TypeError nudo).
    const oggetto = (v: unknown) => Boolean(v) && typeof v === 'object' && !Array.isArray(v)
    if (!oggetto(testa) || !oggetto(corpo)) throw rifiuta('unreadable')
    // ⛔ Solo le voci PROPRIE della tabella: `constructor`, `toString`, `__proto__` non sono algoritmi.
    const nome = String(testa.alg)
    const algoritmo = Object.hasOwn(ALGORITMI, nome) ? ALGORITMI[nome] : undefined
    if (!algoritmo) throw rifiuta('signature algorithm not accepted')
    const chiavi = Array.isArray(jwks?.keys) ? jwks!.keys as Array<Record<string, unknown>> : []
    const jwk = chiavi.find((k) => k && k.kid === testa.kid && k.kty === algoritmo.kty && (k.use === undefined || k.use === 'sig'))
    if (!testa.kid || !jwk) throw rifiuta('signing key not published')
    let buona = false
    try {
        const chiave = await crypto.subtle.importKey('jwk', jwk as JsonWebKey, algoritmo.importa, false, ['verify'])
        buona = await crypto.subtle.verify(algoritmo.verifica, chiave, daBase64Url(pezzi[2]!) as BufferSource, new TextEncoder().encode(`${pezzi[0]}.${pezzi[1]}`) as BufferSource)
    } catch { buona = false }
    if (!buona) throw rifiuta('signature does not verify')
    if (corpo.iss !== EMITTENTE) throw rifiuta('unexpected issuer')
    const destinatari = Array.isArray(corpo.aud) ? corpo.aud : [corpo.aud]
    if (!clientIdEmesso(clientId) || !destinatari.includes(clientId)) throw rifiuta('issued for another client')
    if (typeof corpo.exp !== 'number' || corpo.exp * 1000 + tolleranzaMs <= ora) throw rifiuta('expired')
    if (typeof corpo.nbf === 'number' && corpo.nbf * 1000 - tolleranzaMs > ora) throw rifiuta('not valid yet')
    if (!uguali(corpo.nonce, nonce)) throw rifiuta('does not belong to this sign-in')
    if (typeof corpo.sub !== 'string' || corpo.sub === '') throw rifiuta('no account identity')
    return { sub: corpo.sub, email: typeof corpo.email === 'string' ? corpo.email : null }
}
