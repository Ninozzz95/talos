/**
 * ⛔ CLIENT DEL CONTROLLO REMOTO — il canale di lavoro (`talos-remote/1`) visto dal telefono (ledger
 * `LEDGER-CLIENT-REMOTO-MOBILE-2026-10-20.md`, fetta R-M1).
 *
 * Forme del PC (r4 `aeab15222`): `servizio.mjs` — `{t:'req', n, op, args}` → `{t:'res', n, ok, data|code,message}`, `ping`/`pong`
 * con `s`, `{t:'evt', sub, data}`, `{t:'error', code, retryAfterMs?, n?}`; `operazioni.mjs` — `session.events {sessionId, after, sub}`
 * (sub scelto dal telefono, 1-32 caratteri, al più 8 per connessione) e `session.unsubscribe {sub}`.
 *
 * Il trasporto (lo stream iroh del nativo) porta messaggi interi: il taglio a 4 byte e il tetto di 1 MiB stanno nel nativo.
 * Idempotenza (foglio §3): il PC risponde allo stesso `n` con la stessa risposta per 10 minuti ⇒ «Riprova» rimanda lo STESSO `n`,
 * e ogni rifiuto lo porta con sé.
 */
import { messaggioRemotoValido, nuovoNumeroRichiesta } from './filoRemoto'

export interface TrasportoRemoto {
    invia(messaggio: Record<string, unknown>): Promise<void>
    onMessaggio(cb: (m: unknown) => void): () => void
    onChiuso(cb: (motivo: string) => void): () => void
}

export interface ErroreRemoto extends Error {
    /** Un codice del PC (`CODICI_ERRORE_REMOTO`) o del telefono: `DISCONNECTED`. */
    code: string
    n?: string
    /** D-RM4-5: il motivo del rifiuto di r4 (`provider-key-missing-named`…), da cui la riga d'errore sceglie la frase. */
    reason?: string
    /** D-RM4-5: i parametri di quella frase (`{provider}`), solo testi brevi. */
    params?: Record<string, string>
    /** RA-04 (revisione 21/10/2026): lo stato HTTP che r4 ha dato al PC (400-599), quando il PC lo manda. */
    stato?: number
    retryAfterMs?: number
}

export const ISCRIZIONI_MASSIME_REMOTO = 8
/**
 * ⛔ D-RM4-5 (dal Pad, 20/10/2026): il motivo e i parametri del rifiuto arrivano dal PC, cioè da fuori: passano solo un motivo
 * che è una parola corta (come quelli di r4) e al più 10 parametri semplici (testo breve, numero, sì-no: come li manda il PC, r4
 * `3141738b1`), resi testo per la frase; tutto il resto si scarta.
 */
const MOTIVO_VALIDO = /^[A-Za-z0-9_.:-]{1,80}$/u // RA-14: la stessa regola del PC (r4 3141738b1)
/** RA-14 (revisione 21/10/2026): un codice del PC è un identificatore in maiuscole; `__proto__` o `constructor` no. */
const CODICE_VALIDO = /^[A-Z][A-Z0-9_]{0,63}$/u
function parametriStretti(x: unknown): Record<string, string> | undefined {
    if (!x || typeof x !== 'object' || Array.isArray(x)) return undefined
    const semplice = (v: unknown) => (typeof v === 'string' && v.length <= 200) || (typeof v === 'number' && Number.isFinite(v)) || typeof v === 'boolean'
    const voci = Object.entries(x as Record<string, unknown>)
        .filter(([k, v]) => /^[A-Za-z][A-Za-z0-9_]{0,31}$/u.test(k) && semplice(v)).slice(0, 10).map(([k, v]) => [k, String(v)])
    return voci.length ? Object.fromEntries(voci) as Record<string, string> : undefined
}
const N_VALIDO = /^[A-Za-z0-9_-]{8,64}$/u

function erroreRemoto(code: string, message: string, extra: { n?: string, retryAfterMs?: number } = {}): ErroreRemoto {
    return Object.assign(new Error(message), { code }, extra.n ? { n: extra.n } : {},
        Number.isFinite(extra.retryAfterMs) ? { retryAfterMs: extra.retryAfterMs } : {}) as ErroreRemoto
}

export interface IscrizioneRemota {
    sub: string
    disiscrivi(): Promise<void>
}

export function creaClienteRemoto(
    trasporto: TrasportoRemoto,
    { onErroreDelCanale, ora = () => Date.now() }: { onErroreDelCanale?: (code: string) => void, ora?: () => number } = {},
) {
    const inAttesa = new Map<string, { risolvi: (d: unknown) => void, rifiuta: (e: ErroreRemoto) => void }>()
    const ping = new Map<string, { inizio: number, risolvi: (ms: number) => void, rifiuta: (e: ErroreRemoto) => void }>()
    const iscrizioni = new Map<string, (evento: unknown) => void>()
    let chiuso: ErroreRemoto | null = null

    const chiudiTutto = (e: ErroreRemoto) => {
        if (chiuso) return
        chiuso = e
        for (const [n, attesa] of inAttesa) attesa.rifiuta(Object.assign(erroreRemoto(e.code, e.message), { n }))
        for (const p of ping.values()) p.rifiuta(erroreRemoto(e.code, e.message))
        inAttesa.clear(); ping.clear(); iscrizioni.clear()
    }

    trasporto.onMessaggio((m) => {
        if (!messaggioRemotoValido(m)) return // una forma storta si scarta: il nativo chiude lo stream sui guasti di taglio
        const r = m as Record<string, unknown>
        if (r.t === 'res' && typeof r.n === 'string') {
            const attesa = inAttesa.get(r.n)
            if (!attesa) return
            inAttesa.delete(r.n)
            if (r.ok === true) attesa.risolvi(r.data)
            else {
                const code = typeof r.code === 'string' && CODICE_VALIDO.test(r.code) ? r.code : 'OPERATION_FAILED'
                const e = erroreRemoto(code, String(r.message ?? code), { n: r.n })
                const params = parametriStretti(r.params)
                const stato = Number.isInteger(r.stato) && (r.stato as number) >= 400 && (r.stato as number) <= 599 ? { stato: r.stato as number } : {}
                attesa.rifiuta(Object.assign(e, typeof r.reason === 'string' && MOTIVO_VALIDO.test(r.reason) ? { reason: r.reason } : {}, params ? { params } : {}, stato))
            }
            return
        }
        if (r.t === 'error') {
            const code = typeof r.code === 'string' && CODICE_VALIDO.test(r.code) ? r.code : 'BAD_MESSAGE'
            const n = typeof r.n === 'string' ? r.n : undefined
            const extra = { n, retryAfterMs: typeof r.retryAfterMs === 'number' ? r.retryAfterMs : undefined }
            if (n && inAttesa.has(n)) {
                inAttesa.get(n)!.rifiuta(erroreRemoto(code, code, extra))
                inAttesa.delete(n)
                return
            }
            // un errore del canale (REVOKED, NOT_PAIRED, VERSION_UNSUPPORTED…): il PC chiude lo stream
            onErroreDelCanale?.(code)
            chiudiTutto(erroreRemoto(code, code))
            return
        }
        if (r.t === 'evt' && typeof r.sub === 'string') {
            iscrizioni.get(r.sub)?.(r.data)
            return
        }
        if (r.t === 'pong' && typeof r.s === 'string') {
            const p = ping.get(r.s)
            if (p) { ping.delete(r.s); p.risolvi(ora() - p.inizio) }
        }
    })
    trasporto.onChiuso((motivo) => chiudiTutto(erroreRemoto('DISCONNECTED', motivo)))

    function richiesta(op: string, args: Record<string, unknown>, { n = nuovoNumeroRichiesta() }: { n?: string } = {}): Promise<unknown> {
        if (!N_VALIDO.test(n)) throw erroreRemoto('BAD_MESSAGE', 'invalid request number')
        if (chiuso) return Promise.reject(Object.assign(erroreRemoto(chiuso.code, chiuso.message), { n }))
        return new Promise((risolvi, rifiuta) => {
            inAttesa.set(n, { risolvi, rifiuta })
            trasporto.invia({ v: 1, t: 'req', n, op, args }).catch(() => {
                inAttesa.delete(n)
                rifiuta(erroreRemoto('DISCONNECTED', 'send failed', { n }))
            })
        })
    }

    async function iscrivi(sessionId: string, after: number, onEvento: (evento: unknown) => void): Promise<IscrizioneRemota> {
        if (iscrizioni.size >= ISCRIZIONI_MASSIME_REMOTO) throw erroreRemoto('RATE_LIMITED', 'too many subscriptions')
        const sub = nuovoNumeroRichiesta().slice(0, 16)
        // registrata prima della risposta: la rigiocata della storia parte subito dopo l'ammissione
        iscrizioni.set(sub, onEvento)
        try {
            await richiesta('session.events', { sessionId, after, sub })
        } catch (e) {
            iscrizioni.delete(sub)
            throw e
        }
        return {
            sub,
            async disiscrivi() {
                if (!iscrizioni.delete(sub)) return
                await richiesta('session.unsubscribe', { sub }).catch(() => undefined)
            },
        }
    }

    function fai_ping(): Promise<number> {
        if (chiuso) return Promise.reject(erroreRemoto(chiuso.code, chiuso.message))
        const s = nuovoNumeroRichiesta()
        return new Promise((risolvi, rifiuta) => {
            ping.set(s, { inizio: ora(), risolvi, rifiuta })
            trasporto.invia({ v: 1, t: 'ping', s }).catch(() => { ping.delete(s); rifiuta(erroreRemoto('DISCONNECTED', 'send failed')) })
        })
    }

    return { richiesta, iscrivi, ping: fai_ping, get chiuso() { return chiuso } }
}
