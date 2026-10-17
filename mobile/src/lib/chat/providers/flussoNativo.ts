/**
 * N15 — IL FLUSSO NATIVO: la risposta arriva a pezzi anche dove la pagina non può chiederla.
 *
 * Owner 13/10/2026, dal Pad: «c'è molto delay da quando invio la domanda a quando ricevo la risposta» → «Sì, risposta a
 * pezzi». MISURATO: dalla WebView il flusso verso `api.openai.com` non riesce mai (le origini di pagina sono rifiutate), e
 * il trasporto nativo di sempre (`CapacitorHttp`) torna la risposta INTERA. Qui il nativo (`TalosFlussoHttp`, OkHttp) legge
 * il corpo mentre arriva e lo consegna a righe; il lettore degli eventi resta UNO, quello in JavaScript.
 *
 * ⛔ Stessa firma e stessi errori di `talosFetchStream` (`streamShared.ts`): `stream HTTP <stato>: <dettaglio>` con
 * `retryAfter`, `stream stalled…`, `stream first byte timeout…`, `AbortError` allo Stop. Chi sta sopra — l'estrazione dei
 * pezzi, i rifiuti del piano, il ripiego — non deve sapere quale dei due trasporti ha lavorato.
 */
import { registerPlugin } from '@capacitor/core'
import type { TalosStreamRequest } from '@/lib/chat/providers/streamShared'

export interface TalosFlussoHttpPonte {
    apri(opzioni: { id: string, url: string, headers: Record<string, string>, body: string }): Promise<void>
    chiudi(opzioni: { id: string }): Promise<void>
    addListener(evento: string, ascoltatore: (dati: Record<string, unknown>) => void): Promise<{ remove(): Promise<void> }>
}

/** Gli stessi tempi di `talosFetchStream`: 60 s fra un pezzo e l'altro, 180 s per il primo. */
const SILENZIO_MS = 60_000
const PRIMO_PEZZO_MS = 180_000

let contatore = 0

function fermato(): Error {
    const errore = new Error('The operation was aborted.')
    errore.name = 'AbortError'
    return errore
}

export function creaFlussoNativo(ponte: TalosFlussoHttpPonte): (request: TalosStreamRequest) => Promise<void> {
    return async (request) => {
        if (request.signal?.aborted) throw fermato()
        contatore += 1
        const id = `flusso-${Date.now().toString(36)}-${contatore}`
        const maniglie: Array<{ remove(): Promise<void> }> = []
        let recinto: ReturnType<typeof setTimeout> | null = null
        let alloStop: (() => void) | null = null
        let chiuso = false

        try {
            await new Promise<void>((riuscito, fallito) => {
                const finisci = (errore?: Error): void => {
                    if (chiuso) return
                    chiuso = true
                    if (errore) fallito(errore)
                    else riuscito()
                }
                const arma = (ms: number, primo: boolean): void => {
                    if (recinto !== null) clearTimeout(recinto)
                    recinto = setTimeout(() => {
                        void ponte.chiudi({ id }).catch(() => undefined)
                        finisci(new Error(primo ? `stream first byte timeout after ${ms}ms` : `stream stalled: no data received for ${ms}ms`))
                    }, ms)
                }
                alloStop = () => {
                    void ponte.chiudi({ id }).catch(() => undefined)
                    finisci(fermato())
                }
                request.signal?.addEventListener('abort', alloStop, { once: true })
                arma(request.firstByteMs ?? PRIMO_PEZZO_MS, true)

                void (async () => {
                    maniglie.push(await ponte.addListener('talosFlussoPezzo', (dati) => {
                        if (chiuso || dati.id !== id || typeof dati.testo !== 'string') return
                        arma(request.stallMs ?? SILENZIO_MS, false)
                        request.onText(dati.testo)
                    }))
                    maniglie.push(await ponte.addListener('talosFlussoFine', (dati) => {
                        if (dati.id !== id) return
                        const stato = typeof dati.stato === 'number' ? dati.stato : 0
                        if (stato >= 200 && stato < 300) { finisci(); return }
                        const dettaglio = typeof dati.dettaglio === 'string' ? dati.dettaglio.slice(0, 512) : ''
                        finisci(Object.assign(
                            new Error(`stream HTTP ${stato}${dettaglio ? `: ${dettaglio}` : ''}`),
                            { retryAfter: typeof dati.retryAfter === 'string' ? dati.retryAfter : null },
                        ))
                    }))
                    maniglie.push(await ponte.addListener('talosFlussoGuasto', (dati) => {
                        if (dati.id !== id) return
                        finisci(new Error(`stream failed: ${typeof dati.messaggio === 'string' ? dati.messaggio.slice(0, 200) : 'unknown'}`))
                    }))
                    // ⛔ Gli ascoltatori PRIMA della richiesta: il primo pezzo può arrivare subito.
                    if (chiuso) return
                    await ponte.apri({ id, url: request.url, headers: request.headers, body: JSON.stringify(request.body) })
                })().catch((guasto: unknown) => finisci(guasto instanceof Error ? guasto : new Error(String(guasto))))
            })
        } finally {
            if (recinto !== null) clearTimeout(recinto)
            if (alloStop) request.signal?.removeEventListener('abort', alloStop)
            await Promise.all(maniglie.map((m) => m.remove().catch(() => undefined)))
        }
    }
}

let vero: ((request: TalosStreamRequest) => Promise<void>) | null = null

/** Il flusso nativo col ponte vero (`TalosFlussoHttp`). */
export function talosFlussoNativo(request: TalosStreamRequest): Promise<void> {
    vero ??= creaFlussoNativo(registerPlugin<TalosFlussoHttpPonte>('TalosFlussoHttp'))
    return vero(request)
}
