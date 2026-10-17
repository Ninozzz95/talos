import { EventSource } from 'eventsource'
import { leggiSegretoServerDalPonte, talosTerminaleDisponibile } from '@/lib/harness/terminalePonte'

/*
 * ⛔⛔ 70-A (30/09/2026, contratto desktop 70 «MobileOriginCapacitor OPEN») — il segreto del server del Codice lato app.
 *
 * Misurato con la sonda del 30/09: qualunque pagina o app del telefono avviava una sessione sulla 4174. Ora il server
 * vuole `Authorization: Bearer <segreto>` su tutta l'API; il segreto lo crea lui a ogni avvio e lo scrive in un file
 * leggibile solo dall'utente `shell` (owner, 30/09 sera: «Lo crea il server»), e l'app lo legge dal ponte adb
 * (`TalosTerminalPlugin.leggiSegretoServer`). Ledger `.claude/ragionamento/LEDGER-70A-SERVER-CODICE-PROTETTO-2026-09-30.md`.
 *
 * ⛔ Il segreto non va mai in un log, in un toast o in un messaggio d'errore.
 */

const FORMATO = /^[0-9a-f]{64}$/

let ricordato: string | null = null

export interface OpzioniSegreto {
    /** Il server ha risposto 401: si rilegge il file (il server è ripartito con un segreto nuovo). */
    rinnova?: boolean
    /** Quanto si aspetta il file mentre il server parte. */
    attesaMs?: number
    pausaMs?: number
}

function aspetta(ms: number): Promise<void> {
    return new Promise((risolvi) => setTimeout(risolvi, ms))
}

/** Il segreto del server in corso, o null se il ponte non c'è o il file non arriva in tempo. */
export async function leggiSegretoServerCodice({ rinnova = false, attesaMs = 15_000, pausaMs = 500 }: OpzioniSegreto = {}): Promise<string | null> {
    if (rinnova) ricordato = null
    if (ricordato) return ricordato
    if (!talosTerminaleDisponibile()) return null
    const scadenza = Date.now() + attesaMs
    for (;;) {
        try {
            const lettura = await leggiSegretoServerDalPonte()
            if (typeof lettura.segreto === 'string' && FORMATO.test(lettura.segreto)) {
                ricordato = lettura.segreto
                return ricordato
            }
        } catch {
            // Il ponte non ha risposto: si ritenta fino alla scadenza, come per il file non ancora scritto.
        }
        if (Date.now() >= scadenza) return null
        await aspetta(pausaMs)
    }
}

/** Le intestazioni da aggiungere a ogni richiesta al server del Codice. */
export async function intestazioniServerCodice(opzioni?: OpzioniSegreto): Promise<Record<string, string>> {
    const segreto = await leggiSegretoServerCodice(opzioni)
    return segreto ? { Authorization: `Bearer ${segreto}` } : {}
}

/*
 * ⛔⛔ RIPRESA-SSE (14/10/2026, riprodotto sul Pad, Android 16) — Home durante un giro lungo, ritorno dopo la fine: la
 * risposta finale non arrivava mai e la spia restava «In corso». Il server aveva finito (sessione `conclusa`), ma il
 * renderer della WebView era stato congelato e al ritorno la connessione del flusso era ferma. `eventsource@5.1.2`
 * aspetta `reader.read()` per sempre (dist/EventSource.js:271) e non ha nessun timeout di lettura: una connessione
 * che smette di consegnare byte senza un errore non fa mai scattare `error`, quindi niente riconnessione con
 * `Last-Event-ID` e niente replay. Il server il battito lo manda già (`:battito` ogni 15 s, http-app.mjs:1834), ma
 * la libreria scarta i commenti: nessuno lo guardava.
 *
 * Cura, come i client SSE maturi: si sorveglia il corpo della risposta.
 * - Silenzio oltre tre battiti (45 s, lo stesso `heartbeatTimeout` di serie del polyfill Yaffle/EventSource; il
 *   `readTimeoutMillis` di launchdarkly-eventsource fa lo stesso) → la connessione è morta.
 * - Ritorno in primo piano (`visibilitychange` visibile, o `resume` dopo un congelamento: Page Lifecycle API) con
 *   l'ultimo byte più vecchio di un battito e mezzo → non ci si fida della connessione.
 * In entrambi i casi si rompe il corpo con un `TypeError` (mai un `AbortError`: la libreria lo scambierebbe per una
 * sua `close()` e resterebbe ferma per sempre, dist/EventSource.js:296). La libreria allora fa da sé quello che la
 * specifica prevede: `error` con readyState CONNECTING, attesa, riconnessione con `Last-Event-ID`; il server rimanda
 * solo gli eventi dopo quell'id (`iscriviti(…, daSequenza)`) e `app.js` scarta comunque i doppioni per `_sequenza`.
 * Lo stesso oggetto EventSource resta vivo: chi lo osserva (app.js, il custode dei giri) non deve fare niente.
 */
const SILENZIO_MASSIMO_MS = 45_000
const SILENZIO_ALLA_RIPRESA_MS = 22_500
const CONTROLLO_SILENZIO_MS = 5_000

function corpoSorvegliato(risposta: Response, segnale: AbortSignal | null | undefined): Response {
    // Senza documento (nessuna pagina) o con la libreria che ha già chiuso, non c'è niente da sorvegliare.
    if (risposta.status !== 200 || !risposta.body || segnale?.aborted || typeof document === 'undefined') return risposta
    const lettore = risposta.body.getReader()
    let ultimoByte = Date.now()
    let finito = false
    let rotto = false
    let controllore: ReadableStreamDefaultController<Uint8Array> | null = null
    let controlloSilenzio: ReturnType<typeof setInterval> | undefined
    const allaRipresa = () => {
        if (document.visibilityState !== 'visible') return
        if (Date.now() - ultimoByte > SILENZIO_ALLA_RIPRESA_MS) rompi()
    }
    const smetti = () => {
        if (finito) return
        finito = true
        clearInterval(controlloSilenzio)
        document.removeEventListener('visibilitychange', allaRipresa)
        document.removeEventListener('resume', allaRipresa)
        segnale?.removeEventListener('abort', smetti)
    }
    const rompi = () => {
        if (finito) return
        smetti()
        rotto = true
        lettore.cancel().catch(() => undefined)
        controllore?.error(new TypeError('Flusso degli eventi fermo: riconnessione'))
    }
    controlloSilenzio = setInterval(() => {
        if (Date.now() - ultimoByte > SILENZIO_MASSIMO_MS) rompi()
    }, CONTROLLO_SILENZIO_MS)
    document.addEventListener('visibilitychange', allaRipresa)
    document.addEventListener('resume', allaRipresa)
    // `close()` della libreria (app.js che cambia sessione) interrompe tutto: niente sorveglianza orfana.
    segnale?.addEventListener('abort', smetti)
    const corpo = new ReadableStream<Uint8Array>({
        start(c) { controllore = c },
        async pull(c) {
            let lettura: ReadableStreamReadResult<Uint8Array>
            try {
                lettura = await lettore.read()
            } catch (errore) {
                // Caduta vera o `close()` della libreria (AbortError): passa com'è, la libreria sa distinguerle.
                smetti()
                if (!rotto) c.error(errore)
                return
            }
            if (lettura.done) {
                smetti()
                if (!rotto) c.close()
                return
            }
            if (finito) return
            ultimoByte = Date.now()
            c.enqueue(lettura.value)
        },
        cancel(motivo) {
            smetti()
            return lettore.cancel(motivo)
        },
    })
    return new Response(corpo, { status: risposta.status, statusText: risposta.statusText, headers: risposta.headers })
}

/**
 * Il flusso degli eventi di una sessione, con il segreto. `EventSource` del browser non manda intestazioni: si usa la
 * libreria `eventsource@5.1.2` (owner, 30/09), che accetta un `fetch` proprio. La libreria chiude il flusso su
 * qualunque stato diverso da 200, quindi un 401 (server ripartito) si cura qui: si rilegge il segreto e si ritenta
 * una volta. Il corpo è sorvegliato (RIPRESA-SSE, sopra): una connessione ferma si riapre con `Last-Event-ID`.
 */
export function apriEventiServerCodice(url: string): EventSource {
    return new EventSource(url, {
        fetch: async (input, init) => {
            const chiedi = async (rinnova: boolean) => fetch(input, {
                ...init,
                headers: { ...(init?.headers as Record<string, string> | undefined), ...await intestazioniServerCodice({ rinnova }) },
            })
            const prima = await chiedi(false)
            return corpoSorvegliato(prima.status === 401 ? await chiedi(true) : prima, init?.signal)
        },
    })
}
