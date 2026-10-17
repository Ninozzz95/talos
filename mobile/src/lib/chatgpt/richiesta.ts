import { sha256 } from 'js-sha256'
import { parseRetryAfterMs } from '@/lib/chat/providerErrors'

/**
 * N15 — «Continue with ChatGPT» sul telefono: le richieste COME IL PIANO LE ACCETTA.
 *
 * Porto fedele di `harness-ui/src/chatgpt-richiesta.mjs` del desktop r4 `2a61e35dc` (stessi nomi, stesse regole, stessi
 * codici), con le sue prove portate in `tests/unit/chatgpt/richiesta.test.ts`. Regole ufficiali
 * (developers.openai.com/siwc/token-sharing-open-source/: models-and-inference, preview-limitations, errors-and-recovery):
 * solo `POST /v1/responses` con `store:false` e `stream:true`; una lista di campi da omettere; niente messaggi `system`
 * (si dicono come `developer`); la risposta è riuscita solo a `response.completed`; il limite d'uso è una PAUSA, mai un
 * cambio di strada di pagamento.
 *
 * Differenze dal desktop, solo di motore: `js-sha256` al posto di `node:crypto` (già dipendenza del mobile) e
 * `parseRetryAfterMs` (il lettore di `Retry-After` che il mobile ha già) al posto di `leggiAttesaRichiestaDalFornitore`.
 */

/** Al limite d'uso si aspetta e si riprova: 30 minuti se OpenAI non dice quanto; oltre 24 ore non si aspetta. */
export const ATTESA_LIMITE_DEL_PIANO_MS = 30 * 60 * 1000
export const ATTESA_LIMITE_DEL_PIANO_MASSIMA_MS = 24 * 60 * 60 * 1000

export function attesaDelLimiteDelPiano(intestazioni?: Headers | Record<string, string> | null): number | null {
    let dichiarata: number | null = null
    try {
        if (intestazioni) {
            const h = intestazioni instanceof Headers ? intestazioni : new Headers(intestazioni)
            const ms = h.get('retry-after-ms')
            dichiarata = typeof ms === 'string' && /^\d+(?:\.\d+)?$/u.test(ms.trim())
                ? Math.round(Number(ms.trim()))
                : parseRetryAfterMs(h.get('retry-after') ?? undefined)
        }
    } catch { dichiarata = null }
    if (dichiarata === null) return ATTESA_LIMITE_DEL_PIANO_MS
    return dichiarata > ATTESA_LIMITE_DEL_PIANO_MASSIMA_MS ? null : Math.max(dichiarata, 1000)
}

export const CAMPI_VIETATI_DAL_PIANO: readonly string[] = Object.freeze(['background', 'conversation', 'max_output_tokens', 'max_tool_calls', 'metadata',
    'moderation', 'multi_agent', 'prompt', 'prompt_cache_retention', 'safety_identifier', 'temperature', 'top_logprobs', 'top_p', 'truncation', 'user',
    'previous_response_id'])

type Corpo = Record<string, unknown>
type Voce = { role?: string } & Record<string, unknown>

const comeDeveloper = (voce: unknown): unknown => (voce && (voce as Voce).role === 'system' ? { ...(voce as Voce), role: 'developer' } : voce)

/**
 * La chiave della cache del prompt: la stessa per tutta una conversazione (modello, istruzioni, attrezzi e inizio fino al
 * primo messaggio della persona), così il prefisso non si ripaga a ogni giro dal limite d'uso della persona.
 */
export const LUNGHEZZA_MASSIMA_CHIAVE_CACHE = 64
export function chiaveDellaCacheDelPiano(corpo: Corpo | null | undefined): string {
    const input = Array.isArray(corpo?.input) ? (corpo!.input as unknown[]).map(comeDeveloper) : []
    const primoDellaPersona = input.findIndex((voce) => (voce as Voce | null)?.role === 'user')
    const prefisso = primoDellaPersona >= 0 ? input.slice(0, primoDellaPersona + 1) : input.slice(0, 1)
    const impronta = sha256(JSON.stringify([corpo?.model ?? null, corpo?.instructions ?? null, corpo?.tools ?? null, prefisso]))
    return `talos-${impronta}`.slice(0, LUNGHEZZA_MASSIMA_CHIAVE_CACHE)
}

/** Il corpo come il piano lo accetta. L'oggetto di chi chiama non si tocca. */
export function adattaCorpoAlPiano(corpo: unknown): { corpo: Corpo, volevaIlFlusso: boolean, tolti: string[] } {
    if (!corpo || typeof corpo !== 'object' || Array.isArray(corpo)) {
        throw Object.assign(new Error('The request for the ChatGPT plan has no body.'), { code: 'CHATGPT_RICHIESTA_INCOMPLETA' })
    }
    const originale = corpo as Corpo
    const nuovo: Corpo = { ...originale }
    const tolti = CAMPI_VIETATI_DAL_PIANO.filter((campo) => Object.hasOwn(nuovo, campo))
    for (const campo of tolti) delete nuovo[campo]
    // un messaggio `system` esplicito viene rifiutato: è lo stesso contenuto, detto come `developer`
    if (Array.isArray(nuovo.input)) nuovo.input = (nuovo.input as unknown[]).map(comeDeveloper)
    const volevaIlFlusso = originale.stream === true
    nuovo.store = false
    nuovo.stream = true
    if (typeof nuovo.prompt_cache_key !== 'string' || nuovo.prompt_cache_key === '') nuovo.prompt_cache_key = chiaveDellaCacheDelPiano(nuovo)
    return { corpo: nuovo, volevaIlFlusso, tolti }
}

export interface TalosChatgptEventoFinale { tipo: string, risposta: Record<string, any> | null }

/** L'ultimo evento terminale del flusso decide; un flusso senza evento terminale non decide niente (`null`). */
export async function eventoFinaleDelFlusso(testoOStream: string | ReadableStream<Uint8Array> | null): Promise<TalosChatgptEventoFinale | null> {
    const testo = typeof testoOStream === 'string' ? testoOStream : await new Response(testoOStream).text()
    let finale: TalosChatgptEventoFinale | null = null
    const elementi: Array<{ indice: number, item: unknown }> = []
    for (const blocco of testo.split(/\r?\n\r?\n/u)) {
        const dati = blocco.split(/\r?\n/u).filter((riga) => riga.startsWith('data:')).map((riga) => riga.slice(5).trimStart()).join('\n')
        if (!dati || dati === '[DONE]') continue
        let evento: Record<string, any>
        try { evento = JSON.parse(dati) } catch { continue }
        if (evento?.type === 'response.output_item.done' && evento.item && typeof evento.item === 'object') {
            elementi.push({ indice: Number.isInteger(evento.output_index) ? evento.output_index : elementi.length, item: evento.item })
        } else if (['response.completed', 'response.failed', 'response.incomplete'].includes(evento?.type)) {
            finale = { tipo: evento.type, risposta: evento.response ?? null }
        } else if (evento?.type === 'error') {
            finale = { tipo: 'error', risposta: { error: evento.error ?? { code: evento.code ?? null, message: evento.message ?? null } } }
        }
    }
    if (finale?.tipo === 'response.completed' && finale.risposta
        && !(Array.isArray(finale.risposta.output) && finale.risposta.output.length > 0) && elementi.length > 0) {
        finale = { ...finale, risposta: { ...finale.risposta, output: elementi.sort((a, b) => a.indice - b.indice).map((e) => e.item) } }
    }
    return finale
}

const STATO_PER_CODICE: Readonly<Record<string, number>> = Object.freeze({ subscription_sharing_usage_limit_exceeded: 429,
    subscription_sharing_usage_unavailable: 503, subscription_sharing_user_unavailable: 503, subscription_sharing_user_not_eligible: 403,
    subscription_sharing_route_not_supported: 403, subscription_sharing_unsupported_capability: 400, subscription_sharing_invalid_user: 401 })

/**
 * Un `fetch` che sistema il corpo SUL FILO: chi chiama può continuare a chiedere una risposta intera, e la riceve costruita
 * dal flusso. Un flusso che non arriva a `response.completed` non è una risposta: torna l'errore del servizio, col suo codice.
 */
export function creaFetchDelPiano(fetchDiRete: typeof fetch = globalThis.fetch): typeof fetch {
    return async function fetchDelPiano(indirizzo: RequestInfo | URL, opzioni: RequestInit = {}): Promise<Response> {
        const url = String(typeof indirizzo === 'string' || indirizzo instanceof URL ? indirizzo : (indirizzo as Request)?.url ?? '')
        const metodo = String(opzioni.method ?? 'GET').toUpperCase()
        if (metodo !== 'POST' || !/\/responses(?:\?|$)/u.test(url) || typeof opzioni.body !== 'string') return fetchDiRete(indirizzo, opzioni)
        let originale: unknown
        try { originale = JSON.parse(opzioni.body) } catch { return fetchDiRete(indirizzo, opzioni) }
        const { corpo, volevaIlFlusso } = adattaCorpoAlPiano(originale)
        const risposta = await fetchDiRete(indirizzo, { ...opzioni, body: JSON.stringify(corpo) })
        if (volevaIlFlusso || !risposta.ok) return risposta
        const intestazioni = new Headers(risposta.headers)
        intestazioni.set('content-type', 'application/json')
        intestazioni.delete('content-length'); intestazioni.delete('content-encoding')
        const finale = await eventoFinaleDelFlusso(risposta.body)
        if (finale?.tipo === 'response.completed' && finale.risposta) return new Response(JSON.stringify(finale.risposta), { status: 200, headers: intestazioni })
        const errore = finale?.risposta?.error ?? (finale?.tipo === 'response.incomplete'
            ? { code: 'response_incomplete', message: `The response stopped before completing (${finale.risposta?.incomplete_details?.reason ?? 'unknown reason'}).` }
            : { code: 'stream_interrupted', message: 'The response stream ended before completing.' })
        return new Response(JSON.stringify({ error: errore }), { status: STATO_PER_CODICE[errore?.code] ?? 502, headers: intestazioni })
    } as typeof fetch
}

export const ERRORI_DEL_PIANO: Readonly<Record<string, { code: string, transitorio: boolean, messaggio: string }>> = Object.freeze({
    subscription_sharing_usage_limit_exceeded: { code: 'CHATGPT_LIMITE_DEL_PIANO', transitorio: false, messaggio: 'The ChatGPT plan usage limit was reached. Check ChatGPT Settings → Usage.' },
    subscription_sharing_user_not_eligible: { code: 'CHATGPT_PIANO_NON_AMMESSO', transitorio: false, messaggio: 'Using the ChatGPT plan is not available for this account, workspace or policy.' },
    subscription_sharing_unsupported_capability: { code: 'CHATGPT_RICHIESTA_NON_AMMESSA', transitorio: false, messaggio: 'This request uses something the ChatGPT plan does not support.' },
    subscription_sharing_route_not_supported: { code: 'CHATGPT_RICHIESTA_NON_AMMESSA', transitorio: false, messaggio: 'The ChatGPT plan does not support this route.' },
    subscription_sharing_invalid_user: { code: 'CHATGPT_ACCESSO_NON_VALIDO', transitorio: false, messaggio: 'The ChatGPT connection was not accepted.' },
    chatpass_v2_scope_not_authorized: { code: 'CHATGPT_PIANO_NON_ABILITATO', transitorio: false, messaggio: 'Using the ChatGPT plan is not enabled for this sign-in.' },
    chatpass_v2_invalid_authorization_context: { code: 'CHATGPT_PIANO_NON_ABILITATO', transitorio: false, messaggio: 'Using the ChatGPT plan is not enabled for this sign-in.' },
    subscription_sharing_usage_unavailable: { code: 'CHATGPT_SERVIZIO_NON_DISPONIBILE', transitorio: true, messaggio: 'ChatGPT plan usage cannot be checked right now. Try again later.' },
    subscription_sharing_user_unavailable: { code: 'CHATGPT_SERVIZIO_NON_DISPONIBILE', transitorio: true, messaggio: 'ChatGPT plan usage is temporarily unavailable. Try again later.' },
})

/**
 * Un guasto qualunque della strada del piano, detto con un codice nostro. ⛔ Mai un cambio di fornitore da soli: chi chiama
 * ferma il giro e offre le scelte. Su questa strada un 429 è il limite d'uso del piano (l'unico 429 del piano).
 */
export function erroreDelPiano(guasto: any): any {
    if (typeof guasto?.code === 'string' && guasto.code.startsWith('CHATGPT_')) return guasto
    if (guasto?.name === 'AbortError' || guasto?.name === 'TimeoutError') return guasto
    const stato: number | null = Number.isInteger(guasto?.statusCode) ? guasto.statusCode : Number.isInteger(guasto?.status) ? guasto.status
        : Number.isInteger(guasto?.stato) ? guasto.stato : null
    let corpo = guasto?.data ?? null
    if (!corpo && typeof guasto?.responseBody === 'string') { try { corpo = JSON.parse(guasto.responseBody) } catch { corpo = null } }
    const codiceOpenAi: string | null = typeof corpo?.error?.code === 'string' ? corpo.error.code : null
    const noto = (codiceOpenAi ? ERRORI_DEL_PIANO[codiceOpenAi] : undefined) ?? (stato === 429 ? ERRORI_DEL_PIANO.subscription_sharing_usage_limit_exceeded
        : stato === 401 ? ERRORI_DEL_PIANO.subscription_sharing_invalid_user
            : stato === 403 ? ERRORI_DEL_PIANO.subscription_sharing_user_not_eligible
                : stato === 503 ? ERRORI_DEL_PIANO.subscription_sharing_usage_unavailable : null)
    const intestazioni = guasto?.responseHeaders ?? null
    const idRichiesta = intestazioni ? (intestazioni['x-oai-request-id'] ?? intestazioni['x-request-id'] ?? null) : null
    return Object.assign(new Error(noto?.messaggio ?? 'The request to the ChatGPT plan did not complete.'), {
        code: noto?.code ?? 'CHATGPT_ERRORE', transitorio: noto ? noto.transitorio : (stato === null || stato >= 500),
        stato, codiceOpenAi, parametro: typeof corpo?.error?.param === 'string' ? corpo.error.param : null, idRichiesta, fornitore: 'chatgpt',
        ...(intestazioni ? { intestazioni } : {}),
    })
}
