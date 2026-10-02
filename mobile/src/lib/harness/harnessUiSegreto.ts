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

/**
 * Il flusso degli eventi di una sessione, con il segreto. `EventSource` del browser non manda intestazioni: si usa la
 * libreria `eventsource@5.1.2` (owner, 30/09), che accetta un `fetch` proprio. La libreria chiude il flusso su
 * qualunque stato diverso da 200, quindi un 401 (server ripartito) si cura qui: si rilegge il segreto e si ritenta
 * una volta.
 */
export function apriEventiServerCodice(url: string): EventSource {
    return new EventSource(url, {
        fetch: async (input, init) => {
            const chiedi = async (rinnova: boolean) => fetch(input, {
                ...init,
                headers: { ...(init?.headers as Record<string, string> | undefined), ...await intestazioniServerCodice({ rinnova }) },
            })
            const prima = await chiedi(false)
            return prima.status === 401 ? chiedi(true) : prima
        },
    })
}
