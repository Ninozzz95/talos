import { talosLasciaGiroCodice, talosSeguiGiroCodice } from '@/lib/harness/terminalePonte'

/**
 * ⛔ F4 — «Notifica solo mentre lavora» (owner 13/10/2026; ledger `LEDGER-CODICE-SENZA-PONTE-2026-10-13.md` §14-15).
 *
 * Con il Codice in casa Node è un figlio dell'app e sta nel suo stesso cgroup (misurato sul Pad il 14/10): quando l'app va
 * in cache, Android la congela dopo dieci secondi e il giro si ferma con lei. Il rimedio è il servizio in primo piano
 * `TalosRunService`, acceso solo da `RunStarted` a `RunFinished`/`RunError`. Gli eventi arrivano dal flusso che l'app apre
 * per conto del Codice (`apriEventiServerCodice`): niente da cambiare in `app.js` né nel server.
 *
 * ⛔ Il servizio lo tiene il NATIVO (`TalosCodiceCustode.kt`), non questo modulo. Prima versione, provata sul Pad il 14/10:
 * il custode stava qui, e con l'app sulla Home la WebView è congelata anche col servizio acceso — il giro è finito alle
 * 09:22 e la notifica era ancora accesa quattro minuti dopo. Qui si dice solo «comincia» e «è finito» (la via veloce con
 * l'app davanti); se l'app è dietro, la fine la vede il nativo chiedendo lo stato al server. I giri vecchi che il flusso
 * ripete all'apertura non accendono niente: il nativo segue solo una sessione che il server dice al lavoro.
 */

export interface DipendenzeCustodeGiriCodice {
    segui: (idSessione: string, titolo: string, testo: string) => Promise<boolean>
    lascia: (idSessione: string) => Promise<void>
}

export interface OpzioniOsservaGiri {
    /** Il nome della sessione: la notifica dice QUALE lavoro continua. */
    titolo: string
    testo: string
    /** Il server acceso è quello dentro l'app? Sulla strada del ponte non è nostro figlio e non serve niente. */
    inCasa: () => Promise<boolean>
}

export interface CustodeGiriCodice {
    osserva(url: string, flusso: EventSource, opzioni: OpzioniOsservaGiri): void
}

export function idSessioneDaUrlEventi(url: string): string | null {
    const trovato = /\/sessions\/([^/?#]+)\/events(?:[?#]|$)/.exec(url)
    if (!trovato) return null
    try {
        return decodeURIComponent(trovato[1])
    } catch {
        return null
    }
}

export function creaCustodeGiriCodice(dipendenze: DipendenzeCustodeGiriCodice): CustodeGiriCodice {
    async function inizio(id: string, opzioni: OpzioniOsservaGiri): Promise<void> {
        if (!await opzioni.inCasa().catch(() => false)) return
        await dipendenze.segui(id, opzioni.titolo, opzioni.testo)
    }

    return {
        osserva(url, flusso, opzioni) {
            const id = idSessioneDaUrlEventi(url)
            if (!id) return
            flusso.addEventListener('message', (messaggio: MessageEvent) => {
                let evento: { type?: unknown } | null
                try {
                    evento = JSON.parse(String(messaggio.data))
                } catch {
                    return
                }
                if (evento?.type === 'RunStarted') {
                    void inizio(id, opzioni).catch(() => {})
                } else if (evento?.type === 'RunFinished' || evento?.type === 'RunError') {
                    void dipendenze.lascia(id).catch(() => {})
                }
            })
        },
    }
}

/** L'unico custode dell'app. */
export const custodeGiriCodice: CustodeGiriCodice = creaCustodeGiriCodice({
    segui: talosSeguiGiroCodice,
    lascia: talosLasciaGiroCodice,
})
