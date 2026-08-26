/**
 * agui-events.mjs — traduttori PURI da forme interne di talosHarness.mjs
 * allo schema pubblico AG-UI (Agent User Interaction Protocol).
 *
 * ⛔ Zero dipendenze da talosLavora: ogni funzione qui prende dati già
 * pronti (la risposta OpenAI-shaped, un id, un esito) e restituisce
 * SOLO oggetti piatti — nessuna chiamata di rete, nessun I/O, nessuno
 * stato. Per questo si prova con un evento finto per riga, senza mai
 * far girare un vero talosLavora (vedi il piano, §1.6, punto 1).
 *
 * Schema verificato il 24/8 su docs.ag-ui.com/concepts/events — nomi di
 * campo esatti, non inventati. Vedi il piano (elegant-spinning-dongarra.md),
 * §1.2, per la tabella completa evento-per-evento con la fonte, e §0.1
 * per il perché SSE (non WebSocket) è il trasporto scelto: la ricerca
 * del 24/8 conferma che la maggioranza delle implementazioni AG-UI usa
 * SSE per il canale server→client, e l'unico segnale client→server che
 * questa fase richiede ("stop") è raro e non a bassa latenza, quindi
 * viaggia come POST separato invece di aprire un canale bidirezionale.
 */

export function runStarted({ threadId, runId, input, contesto }) {
    const evento = { type: 'RunStarted', threadId, runId }
    if (input !== undefined) evento.input = input
    /*
     * ⭐ `contesto` — {progetto, cartella, branch} da workspace-context.mjs —
     * non fa parte dello schema pubblico AG-UI (che non prevede un campo per
     * "dove sta girando", solo "cosa sta facendo"): è un'estensione
     * dichiarata, nello spirito di "loose event format matching" che AG-UI
     * stesso permette (ricerca del piano, §0.1). Solo se presente: il primo
     * chiamante di questa funzione (i test) non deve saperne niente.
     */
    if (contesto !== undefined) evento.contesto = contesto
    return evento
}

export function runFinished({ threadId, runId, outcome, result }) {
    const evento = { type: 'RunFinished', threadId, runId }
    if (outcome !== undefined) evento.outcome = outcome
    if (result !== undefined) evento.result = result
    return evento
}

export function runError({ message, code }) {
    const evento = { type: 'RunError', message }
    if (code !== undefined) evento.code = code
    return evento
}

export function textMessageStart({ messageId, role = 'assistant' }) {
    return { type: 'TextMessageStart', messageId, role }
}

export function textMessageContent({ messageId, delta }) {
    return { type: 'TextMessageContent', messageId, delta }
}

export function textMessageEnd({ messageId }) {
    return { type: 'TextMessageEnd', messageId }
}

export function toolCallStart({ toolCallId, toolCallName, parentMessageId }) {
    const evento = { type: 'ToolCallStart', toolCallId, toolCallName }
    if (parentMessageId !== undefined) evento.parentMessageId = parentMessageId
    return evento
}

export function toolCallArgs({ toolCallId, delta }) {
    return { type: 'ToolCallArgs', toolCallId, delta }
}

export function toolCallResult({ messageId, toolCallId, content, role = 'tool' }) {
    return { type: 'ToolCallResult', messageId, toolCallId, content, role }
}

export function stateDelta({ delta }) {
    return { type: 'StateDelta', delta }
}

/**
 * ⭐ Da una risposta grezza del modello (la stessa forma OpenAI che
 * talosLavora già costruisce — {role, content, tool_calls}, vedi
 * talosHarness.mjs riga ~761) all'elenco ORDINATO di eventi AG-UI per
 * quel giro.
 *
 * ⛔ Zero eventi di streaming a chunk: talosLavora riceve la risposta
 * già completa da chiamaConRitenta (il piano lo dichiara in §1.2), quindi
 * ogni messaggio di testo è uno Start+Content+End con UN SOLO delta, non
 * N — non è una scorciatoia, è la verità di come i dati arrivano oggi.
 *
 * `messageId` è responsabilità del CHIAMANTE (chi ha lo stato per
 * generarne uno univoco, es. agent-service.mjs con crypto.randomUUID) —
 * questa funzione resta pura e deterministica per essere provata senza
 * mock di generatori casuali.
 */
export function eventiPerRisposta(risposta, { messageId, parentMessageId } = {}) {
    const eventi = []
    if (risposta?.content) {
        eventi.push(textMessageStart({ messageId, role: risposta.role ?? 'assistant' }))
        eventi.push(textMessageContent({ messageId, delta: String(risposta.content) }))
        eventi.push(textMessageEnd({ messageId }))
    }
    for (const chiamata of risposta?.tool_calls ?? []) {
        eventi.push(toolCallStart({
            toolCallId: chiamata.id,
            toolCallName: chiamata.function?.name,
            parentMessageId,
        }))
        eventi.push(toolCallArgs({
            toolCallId: chiamata.id,
            delta: chiamata.function?.arguments ?? '',
        }))
    }
    return eventi
}

/**
 * ⭐ Dall'esito già calcolato di un attrezzo (la stessa stringa che
 * talosLavora mette in `messaggi.push({role:'tool', tool_call_id,
 * content})`, talosHarness.mjs riga ~836) a ToolCallResult.
 */
export function eventoPerEsitoTool({ messageId, toolCallId, content }) {
    return toolCallResult({ messageId, toolCallId, content: String(content) })
}

/**
 * ⭐ Dal prima/dopo che `scrivi` già costruisce internamente (vedi
 * `premessaDellaScrittura` in talosHarness.mjs — `prima` e `dopo` sono
 * già array di {percorso, testo}) a UNA operazione JSON Patch RFC 6902:
 * `replace` se il file esisteva già in `prima`, `add` se è nuovo.
 * Formato scelto dalla ricerca del piano §0.1 (`StateDelta` — RFC 6902
 * JSON Patch), non inventato qui.
 */
export function eventoPerScrittura({ percorso, contenuto, esisteva }) {
    return stateDelta({
        delta: [{
            op: esisteva ? 'replace' : 'add',
            path: `/file/${percorso}`,
            value: contenuto,
        }],
    })
}
