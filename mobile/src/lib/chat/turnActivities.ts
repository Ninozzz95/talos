/**
 * Le attivita' degli attrezzi di UNA coppia domanda-risposta.
 *
 * ⛔ Owner 2026-09-13, foto del Pad: «Dettagli esecuzione» di una risposta che aveva
 * cercato sul web (19 fonti) diceva «Nessun attrezzo usato». Chi scrive le attivita'
 * (toolset.ts, toolAuthorizationCheckpoint.ts, recordBrowserActivity) mette
 * `message_id: null`, quindi la lettura per messaggio era vuota PER COSTRUZIONE.
 *
 * ⇒ La coppia si delimita con gli orari dei messaggi della persona: dalla domanda
 * (inclusa) alla domanda successiva (esclusa), o fino in fondo per l'ultima coppia.
 * Un'attivita' gia' legata a un messaggio della coppia entra comunque.
 *
 * Lo stato dell'arte lega l'attrezzo al messaggio quando nasce: l'AI SDK salva le
 * chiamate come parti del messaggio dell'assistente
 * (https://ai-sdk.dev/docs/ai-sdk-ui/chatbot-message-persistence, letto il 2026-09-13).
 * Quel legame alla scrittura e' la cura di fondo, e va con la fase 1b; questa lettura
 * resta perche' le righe gia' salvate non lo avranno mai.
 */
export interface TalosTurnMessage { id: string, role: string, created_at: string }
export interface TalosTurnActivity { id: string, message_id: string | null, operation: string, created_at: string }

/** Le richieste di autorizzazione non sono attrezzi eseguiti: l'esecuzione ha la sua riga. */
const NOT_A_TOOL_RUN = new Set(['tool.authorization'])

export function talosTurnToolActivities<A extends TalosTurnActivity>(
    messages: readonly TalosTurnMessage[],
    activities: readonly A[],
    messageId: string,
): A[] | null {
    const index = messages.findIndex((message) => message.id === messageId)
    if (index < 0) return null
    let start = index
    while (start > 0 && messages[start].role !== 'user') start--
    let end = index + 1
    while (end < messages.length && messages[end].role !== 'user') end++
    const ids = new Set(messages.slice(start, end).map((message) => message.id))
    const from = messages[start].role === 'user' ? messages[start].created_at : ''
    const until = end < messages.length ? messages[end].created_at : null
    return activities.filter((activity) => {
        if (NOT_A_TOOL_RUN.has(activity.operation)) return false
        if (activity.message_id !== null) return ids.has(activity.message_id)
        return activity.created_at >= from && (until === null || activity.created_at < until)
    })
}

/** `tool.web_search` → `web_search`: le chiavi delle etichette sono il nome nudo dell'attrezzo. */
export function talosActivityToolName(operation: string): string {
    return operation.startsWith('tool.') ? operation.slice('tool.'.length) : operation
}
