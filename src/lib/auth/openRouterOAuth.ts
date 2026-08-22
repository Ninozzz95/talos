/**
 * Accedere a OpenRouter senza incollare una chiave.
 *
 * ## Perché solo OpenRouter, e non tutti e cinque
 *
 * Owner 2026-08-06: «oauth per i provider assieme ad api key, anthropic openai
 * gemini e openrouter». La ricerca ha dato una risposta netta e scomoda: di
 * quei cinque **solo OpenRouter è possibile**, e non per pigrizia nostra.
 *
 * TALOS è un'app distribuita. Chiunque scarichi l'APK ha in mano ogni byte che
 * contiene, quindi un `client_secret` dentro l'APK non è un segreto: è una
 * password scritta sul muro. Gli altri quattro provider offrono OAuth solo per
 * client «riservati», cioè con un segreto custodito su un server che noi non
 * abbiamo e che — per la regola local-first — non vogliamo avere. Per loro la
 * chiave API incollata a mano resta l'unica strada onesta.
 *
 * OpenRouter invece pubblica un flusso **PKCE per client pubblici**: nessun
 * segreto, la prova è che chi chiude lo scambio è lo stesso che l'ha aperto.
 *
 * ## La stranezza utile di OpenRouter
 *
 * Alla fine dello scambio non torna un token con una scadenza da rinnovare:
 * torna **una chiave API**, uguale a quella che si sarebbe incollata a mano.
 * Questo è il motivo per cui questo modulo finisce dove finisce — la chiave
 * entra nella cassaforte esistente e da lì in poi non esiste più nessun
 * «accesso OAuth» da mantenere, aggiornare o far scadere. Un pezzo di stato in
 * meno per sempre.
 *
 * ## Dove torna la risposta
 *
 * `callback_url` accetta `https://…` e `http://127.0.0.1:<porta>` su qualunque
 * porta. Non accetta schemi propri (`talos://…`), quindi il classico deep link
 * di Android è escluso; e un indirizzo `https` nostro richiederebbe un dominio
 * e un file di verifica firmato con la chiave dell'APK, che è un pezzo di
 * infrastruttura che questa app non ha e non deve avere.
 *
 * Resta l'anello di ritorno locale — `127.0.0.1` — che è anche ciò che RFC 8252
 * raccomanda per le app native: il browser **di sistema** fa l'accesso, la
 * password di OpenRouter non attraversa mai il nostro processo, e la risposta
 * rientra da una porta che abbiamo aperto noi un istante prima.
 *
 * Qui dentro non c'è niente di nativo e niente di globale: solo i conti, così
 * si possono provare senza un telefono.
 */

export const TALOS_OPENROUTER_AUTH_URL = 'https://openrouter.ai/auth'
export const TALOS_OPENROUTER_KEYS_URL = 'https://openrouter.ai/api/v1/auth/keys'
/** Il percorso su cui il browser rientra. Vale come firma della richiesta. */
export const TALOS_OAUTH_CALLBACK_PATH = '/talos-openrouter'

export interface TalosPkcePair {
    verifier: string
    challenge: string
}

export interface TalosOpenRouterExchange {
    code: string
    verifier: string
}

/**
 * Il verificatore: da 43 a 128 caratteri dell'insieme «non riservato».
 *
 * 32 byte casuali in base64url danno esattamente 43 caratteri, cioè il minimo
 * consentito con la massima entropia per carattere. Non c'è ragione di
 * allungarlo: l'entropia sta nei byte, non nella lunghezza del testo.
 */
export function talosCreateCodeVerifier(
    random: (bytes: Uint8Array) => Uint8Array = (bytes) => crypto.getRandomValues(bytes),
): string {
    return talosBase64Url(random(new Uint8Array(32)))
}

export function talosBase64Url(bytes: Uint8Array): string {
    let binario = ''
    for (const byte of bytes) binario += String.fromCharCode(byte)
    return btoa(binario).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/**
 * La sfida: base64url dello SHA-256 del verificatore.
 *
 * `S256` e non `plain`: con `plain` la sfida È il verificatore, quindi
 * chiunque riesca a leggere l'indirizzo di autorizzazione può chiudere lo
 * scambio al posto nostro — che è precisamente ciò da cui PKCE difende.
 */
export async function talosCreateCodeChallenge(
    verifier: string,
    digest: (data: BufferSource) => Promise<ArrayBuffer> = (data) => crypto.subtle.digest('SHA-256', data),
): Promise<string> {
    return talosBase64Url(new Uint8Array(await digest(new TextEncoder().encode(verifier))))
}

export async function talosCreatePkcePair(): Promise<TalosPkcePair> {
    const verifier = talosCreateCodeVerifier()
    return { verifier, challenge: await talosCreateCodeChallenge(verifier) }
}

export function talosOpenRouterCallbackUrl(port: number): string {
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
        throw new Error('TALOS_OAUTH_PORT_INVALID')
    }
    return `http://127.0.0.1:${port}${TALOS_OAUTH_CALLBACK_PATH}`
}

export function talosOpenRouterAuthUrl(input: {
    callbackUrl: string
    challenge: string
}): string {
    const url = new URL(TALOS_OPENROUTER_AUTH_URL)
    url.searchParams.set('callback_url', input.callbackUrl)
    url.searchParams.set('code_challenge', input.challenge)
    url.searchParams.set('code_challenge_method', 'S256')
    return url.toString()
}

/**
 * Il codice che rientra dal browser, letto dall'indirizzo su cui è rientrato.
 *
 * Torna `null` per qualunque cosa non sia il nostro percorso con un codice
 * dentro: sull'anello di ritorno può bussare chiunque abbia accesso alla
 * macchina, e una richiesta che non riconosciamo non deve nemmeno cominciare
 * uno scambio.
 */
export function talosReadOpenRouterCode(target: string): string | null {
    let url: URL
    try {
        url = new URL(target, 'http://127.0.0.1')
    } catch {
        return null
    }
    if (url.pathname !== TALOS_OAUTH_CALLBACK_PATH) return null
    const code = url.searchParams.get('code')
    return typeof code === 'string' && code.trim() !== '' ? code.trim() : null
}

/**
 * Lo scambio: il codice più il verificatore diventano una chiave API.
 *
 * Nessun `client_secret`, che è tutto il punto. Se il codice fosse stato
 * intercettato da un'altra app sulla stessa macchina, questo passaggio
 * fallirebbe: il verificatore che lo sblocca non ha mai lasciato il processo.
 */
export async function talosExchangeOpenRouterCode(
    input: TalosOpenRouterExchange,
    fetchImpl: typeof fetch = fetch,
): Promise<string> {
    const response = await fetchImpl(TALOS_OPENROUTER_KEYS_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            code: input.code,
            code_verifier: input.verifier,
            code_challenge_method: 'S256',
        }),
    })
    if (!response.ok) {
        // ⛔ IL MOTIVO VIAGGIA COL GUASTO — 2026-08-10, misurato sul Pad.
        // Lo scambio e' fallito e l'interfaccia diceva solo «OpenRouter non ha
        // rilasciato la chiave»: non distingue una rete caduta da un codice
        // scaduto da un 403. Con un codice finto la stessa chiamata risponde
        // `400 {"error":{"message":"Invalid code"}}` — cioe' il corpo dice
        // tutto, e noi lo stavamo buttando.
        const corpo = await response.text().catch(() => '')
        throw new Error(
            `TALOS_OAUTH_EXCHANGE_FAILED:${response.status}:${corpo.slice(0, 200)}`,
        )
    }
    const payload: unknown = await response.json()
    const key = (payload as { key?: unknown } | null)?.key
    if (typeof key !== 'string' || key.trim() === '') throw new Error('TALOS_OAUTH_NO_KEY')
    return key.trim()
}
