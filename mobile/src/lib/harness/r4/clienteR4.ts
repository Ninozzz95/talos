/**
 * ⛔ K3-B1/K3-B2 (ledger `LEDGER-K3-CODICE-COME-LA-CHAT-2026-10-15.md`): il ponte verso il client nativo di r4
 * (`TalosR4ClientePlugin.kt`). Le chiamate partono dal lato nativo, solo verso 127.0.0.1 e solo su `/api/v1/…`, col cookie
 * `talos_token` messo dal nativo: la pagina il token non lo vede mai.
 */
import { registerPlugin } from '@capacitor/core'
import type { StatoFileRemoto } from '@/lib/remoto/fileRemoti'

export interface TalosR4ClientePonte {
    /**
     * R5.13 F3-bis (revisione del blocco 9, B9-2/B9-5): `segnale` e `onStato` li legge solo il ponte remoto, per l'immagine che va al PC
     * (ferma l'invio di una bozza tolta; dice l'avanzamento). Al nativo locale non si passano mai.
     */
    richiesta(opzioni: { metodo: 'GET' | 'POST'; percorso: string; corpo?: string; segnale?: AbortSignal; onStato?: (s: StatoFileRemoto) => void }): Promise<{ stato: number; corpo: string }>
    /** Eventi: `r4Pezzo {id, testo}`, `r4Fine {id}`, `r4Errore {id, motivo}` (`motivo` = `HTTP <stato>` o il nome del guasto). */
    apriFlusso(opzioni: { id: string; percorso: string }): Promise<void>
    chiudiFlusso(opzioni: { id: string }): Promise<void>
    /**
     * K3-TERM T2: la WebSocket del Terminale di r4. Eventi: `r4TermDati {id, testo}`, `r4TermControllo {id, json}`,
     * `r4TermChiuso {id, codice, motivo}`, `r4TermErrore {id, motivo, stato?}`.
     */
    apriTerminale(opzioni: { id: string; terminalId: string }): Promise<void>
    scriviTerminale(opzioni: { id: string; testo: string }): Promise<void>
    ridimensionaTerminale(opzioni: { id: string; cols: number; rows: number }): Promise<void>
    chiudiTerminale(opzioni: { id: string }): Promise<void>
    /**
     * K3-C Allegati A2 (owner 16/10 «Anteprima vera»): un'immagine mandata a r4, riletta intera (`GET /api/v1/chat-images/<64 hex>`),
     * in base64 col suo tipo. `richiesta` legge il corpo come testo e i byte di un'immagine non ci passano. Facoltativa: un ponte di
     * prova può non averla, e allora l'anteprima non c'è.
     */
    immagine?(opzioni: { id: string }): Promise<{ stato: number; tipo: string; base64: string }>
    /**
     * K3-C Allegati A3 (owner 16/10 «L'app li scrive in allegati/»): un documento scelto (`content://`) scritto dal nativo in
     * `<cartella di lavoro>/allegati/` senza mai sovrascrivere; torna la ricevuta del desktop, col testo solo se chiesto ed entro il
     * tetto. I rifiuti portano i codici dell'helper del desktop (`QUERY_INVALID`, `PAYLOAD_LIMIT`, `FILE_EXISTS`, …).
     *
     * R5.13 F3: dal ponte remoto (`ponteRemotoR4.ts`) il file va alla sessione `sessionId` del PC, a pezzi; `onStato` dice l'invio e la
     * pausa. La ricevuta remota NON ha `assoluto`: il percorso assoluto del PC non esce mai dal PC. Il nativo locale li ignora.
     */
    allegaFile?(opzioni: { uri: string; nome: string; testo: boolean; sessionId?: string; onStato?: (s: StatoFileRemoto) => void; segnale?: AbortSignal }): Promise<{ tipo: string; nome: string; percorso: string; bytes: number; assoluto?: string; testo?: string }>
    /** A3: un'immagine scelta come file (`content://`), letta dal nativo fino a 5 MiB, perché la pagina quei byte non li legge. */
    immagineScelta?(opzioni: { uri: string }): Promise<{ tipo: string; base64: string }>
    addListener(
        evento: 'r4Pezzo' | 'r4Fine' | 'r4Errore' | 'r4TermDati' | 'r4TermControllo' | 'r4TermChiuso' | 'r4TermErrore',
        ascoltatore: (dati: Record<string, unknown>) => void,
    ): Promise<{ remove(): Promise<void> }>
}

let ponte: TalosR4ClientePonte | null = null

export function talosClienteR4(): TalosR4ClientePonte {
    ponte ??= registerPlugin<TalosR4ClientePonte>('TalosR4Cliente')
    return ponte
}
