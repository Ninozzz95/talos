/**
 * ⛔ R-M5a, `device.seen` (contratto col Desktop del 21/10/2026, r4 4a03ae75c): «collegato» non vuol dire «visto». Dal Pad: app uccisa
 * con la carta appena nata, la connessione QUIC morta è rimasta «in linea» ~30 s e il PC ha tolto la sveglia ⇒ nessuna notifica. Ora
 * il PC toglie la sveglia SOLO su `device.seen {sessionId}` (per sessione e discendenti, idempotente, vale per le novità nate prima); a
 * telefono collegato senza conferma la sveglia parte dopo 10 s. Il telefono conferma quando una carta (permesso, domanda, piano, anche
 * di una figlia disegnata nella madre) è sullo schermo con l'app VISIBILE: nascosta, la sveglia deve partire.
 */
import { TALOS_METADATA_APPROVAZIONE } from '@/lib/harness/r4/approvazioneChiave'
import { TALOS_METADATA_DOMANDA } from '@/lib/harness/r4/domandaChiave'
import { TALOS_METADATA_PIANO } from '@/lib/harness/r4/pianoChiave'

type MessaggioConCarte = { id?: unknown, metadata?: Record<string, unknown> | null }

const CHIAVI = [TALOS_METADATA_APPROVAZIONE, TALOS_METADATA_DOMANDA, TALOS_METADATA_PIANO] as const

/** Le carte ancora aperte (esito nullo) nei messaggi della vista: `tipo:requestId`, o `tipo:<id del messaggio>` per il piano. */
export function carteAperteR4(messaggi: ReadonlyArray<MessaggioConCarte>): string[] {
    const aperte: string[] = []
    for (const m of messaggi) {
        for (const chiave of CHIAVI) {
            const v = m?.metadata?.[chiave] as { esito?: unknown, requestId?: unknown } | undefined
            if (!v || typeof v !== 'object' || v.esito !== null) continue
            aperte.push(`${chiave}:${typeof v.requestId === 'string' ? v.requestId : String(m.id ?? '')}`)
        }
    }
    return aperte
}

/**
 * Il segnale verso il PC: una conferma per ogni carta NUOVA vista ad app visibile (le già confermate no), e di nuovo tutte quando
 * l'app torna visibile con le carte ancora lì (nel frattempo il PC ha potuto svegliare; la conferma è idempotente). Un rifiuto del PC
 * (sessione sparita, canale caduto) non esce: la peggiore conseguenza è una notifica in più.
 */
export function creaSegnaleVista({ invia, visibile }: { invia: (sessionId: string, carte: string[]) => Promise<unknown>, visibile: () => boolean }) {
    let sessione: string | null = null
    let carte: string[] = []
    const confermate = new Set<string>()

    function prova(): void {
        if (!sessione || !visibile() || !carte.some((c) => !confermate.has(c))) return
        const mandate = [...carte]
        for (const c of mandate) confermate.add(c)
        // revisione R-M5a bis (12): una conferma che non parte non resta «fatta»: si ritenta al prossimo aggiornamento
        void invia(sessione, mandate).catch(() => { for (const c of mandate) confermate.delete(c) })
    }

    return {
        aggiorna(sessionId: string | null, aperte: readonly string[]): void {
            if (sessionId !== sessione) confermate.clear()
            sessione = sessionId
            carte = [...aperte]
            prova()
        },
        tornataVisibile(): void { prova() },
        nascosta(): void { confermate.clear() },
    }
}
