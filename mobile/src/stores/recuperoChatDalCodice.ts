import type { TalosChatRepository, TalosLocalChatSession } from '@/repositories/chatRepository'

/**
 * ⭐ B3-REC (owner 24/09/2026: «sì, devono restare separate») — riporta nella Chat le conversazioni finite per sbaglio
 * dentro una sessione del Codice.
 *
 * Come ci finivano (difetto 4 del ledger B3): le sessioni del Codice stanno nello STESSO archivio della chat
 * (`metadata.codice`), e `createSession` scrive sempre la sessione attiva. Creata una sessione del Codice, al riavvio la
 * chat nativa si apriva su quella e ci scriveva: la conversazione spariva dall'elenco della Chat (che nasconde il
 * Codice) e non compariva nel Codice (che quei messaggi non li legge). `readSnapshot` ora non lo fa più; questo modulo
 * sistema ciò che è già successo sui telefoni.
 *
 * ⛔ Perché è sicuro: il Codice non scrive MAI nella tabella dei messaggi — la sua conversazione passa dal kernel
 * (`lib/harnessUiBridge.ts`). Quindi ogni messaggio dentro una sessione del Codice è della chat. Si spostano solo quelli,
 * in una chat nuova; la sessione del Codice resta nel Codice con il suo titolo.
 *
 * Caricato a richiesta da `stores/chat.ts` solo quando c'è qualcosa da recuperare: il pacchetto d'avvio ha un tetto
 * (`scripts/verify-initial-chunk.mjs`).
 */
export async function recuperaChatFiniteNelCodice(
    repository: Pick<TalosChatRepository, 'listSessions' | 'listMessages' | 'moveMessagesToNewSession'>,
    sessioni: TalosLocalChatSession[],
    opzioni: { titolo: (prompt: string) => string; nuovoId: () => string },
): Promise<TalosLocalChatSession[]> {
    let recuperate = 0
    const candidate = sessioni.filter((sessione) => sessione.metadata?.codice === true && sessione.has_messages === true)
    for (const sessione of candidate) {
        // Una sessione che non si lascia recuperare non ferma le altre, né l'avvio: la transazione dell'archivio l'ha
        // lasciata com'era, e al prossimo avvio si riprova.
        try {
            const messaggi = await repository.listMessages(sessione.id)
            const primo = messaggi[0]
            if (!primo) continue
            const primoTuo = messaggi.find((messaggio) => messaggio.role === 'user')
            const ultimoModello = [...messaggi].reverse().find((messaggio) => messaggio.model_profile_id)?.model_profile_id
            const ultimaModifica = messaggi.reduce(
                (ultima, messaggio) => (messaggio.updated_at > ultima ? messaggio.updated_at : ultima),
                primo.updated_at,
            )
            const nuova = await repository.moveMessagesToNewSession(sessione.id, {
                id: opzioni.nuovoId(),
                title: opzioni.titolo(primoTuo?.content ?? ''),
                active_model_profile_id: ultimoModello ?? sessione.active_model_profile_id,
                surface: sessione.surface,
                mode: sessione.mode,
                persistence_mode: sessione.persistence_mode,
                created_at: primo.created_at,
                updated_at: ultimaModifica,
                // La traccia di dove veniva: si può ritrovare, e non si confonde con una chat nata qui.
                metadata: { recuperata_dal_codice: sessione.id },
            })
            if (nuova) recuperate += 1
        } catch (error) {
            console.warn('[chat] recupero di una chat finita nel Codice non riuscito:', error)
        }
    }
    // L'elenco si rilegge solo se è cambiato qualcosa: le chat nuove e il puntatore spostato vengono dall'archivio.
    return recuperate > 0 ? repository.listSessions() : sessioni
}
