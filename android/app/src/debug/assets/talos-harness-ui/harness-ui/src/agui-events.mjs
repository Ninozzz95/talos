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

/** ⭐ 29/8 — porta canonico (ledger §17, FASE G.1): gemelle di textMessage*, per il "ragionamento" (R1, reasoning/thinking) quando il modello lo espone a pezzi. */
export function reasoningMessageStart({ messageId }) {
    return { type: 'ReasoningMessageStart', messageId, role: 'reasoning' }
}

export function reasoningMessageContent({ messageId, delta }) {
    return { type: 'ReasoningMessageContent', messageId, delta }
}

export function reasoningMessageEnd({ messageId }) {
    return { type: 'ReasoningMessageEnd', messageId }
}

/**
 * ⭐ 29/8 — porta canonico (ledger §17, FASE G.3): `esito` è ESATTAMENTE
 * ciò che l'hook ha risposto (o il rifiuto sintetico se l'hook è
 * fallito nell'esecuzione) — il pannello Control-plane mostra questo,
 * non una sua interpretazione.
 */
export function hookInvoked({ hookId, tipo, azione, esito }) {
    return { type: 'HookInvoked', hookId, tipo, azione: azione ?? null, esito }
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
 * ⭐⭐⭐ 2/9 — Stadio A (talosHarness.mjs, 23/8) compatta la conversazione
 * ogni GIRI_PRIMA_DI_COMPATTARE giri, ma il giro di compattazione non
 * emetteva mai un evento — buco dichiarato sopra la firma di
 * talosLavora ("la UI non vedrà 'sto riassumendo' in questa prima
 * fase"). Due eventi dedicati, non un riuso di TextMessage*: il
 * riassunto è manutenzione interna del kernel, mai una risposta che il
 * modello sta dando alla persona — mostrarlo come un messaggio normale
 * confonderebbe le due cose. `type` fuori dallo schema pubblico AG-UI,
 * stesso "loose event format matching" già dichiarato in testa al file
 * per `contesto`/`QueuedMessageDelivered`/`ArtifactCreated`.
 *
 * ⭐ Nomi concordati con la lane desktop (avm-03, 2/9, in vista
 * dell'unificazione dei due kernel — DECISIONE-KERNEL-DUE-COPIE):
 * `Start`/`End`, la stessa famiglia di `TextMessageStart`/`...End` e
 * `ReasoningMessageStart`/`...End` — una fase che dura e poi finisce,
 * non un valore che cambia (per questo non un semplice `stateDelta`:
 * la UI deve poter aprire "sto riassumendo" e poi TOGLIERLO, non solo
 * leggere un campo). Verificato: né la copia B né il backend desktop
 * hanno oggi un equivalente — non c'era niente da portare, il design è
 * nuovo per entrambi.
 */
export function compactionStart({ giro }) {
    return { type: 'CompactionStart', giro }
}

export function compactionEnd({ giro, compattato }) {
    return { type: 'CompactionEnd', giro, compattato }
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
/**
 * ⭐ 29/8 — porta canonico (LEDGER-MOBILE-PAREGGIO-DESKTOP-CODICE.md
 * §17, FASE G.1): `testoGiaStreamato`/`toolCallsGiaStreamate`, entrambi
 * opzionali (default = comportamento di prima, invariato per chi non
 * li passa). Con `onDelta` (agent-service.mjs) che manda testo e
 * argomenti tool-call A PEZZI mentre il giro è in corso, rimandarli
 * qui INTERI a fine giro duplicherebbe il messaggio in chat — stessa
 * famiglia di difetto già chiusa per RunFinished/RunStarted doppi.
 */
export function eventiPerRisposta(risposta, { messageId, parentMessageId, testoGiaStreamato = false, toolCallsGiaStreamate } = {}) {
    const eventi = []
    if (risposta?.content && !testoGiaStreamato) {
        eventi.push(textMessageStart({ messageId, role: risposta.role ?? 'assistant' }))
        eventi.push(textMessageContent({ messageId, delta: String(risposta.content) }))
        eventi.push(textMessageEnd({ messageId }))
    }
    const streamate = toolCallsGiaStreamate ?? new Set()
    for (const chiamata of risposta?.tool_calls ?? []) {
        if (streamate.has(chiamata.id)) continue
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
/*
 * ⛔ 28/8, ledger review-test-rischio §2.A: `contenutoPrima` esiste già nel
 * kernel (talosHarness.mjs, `onScrittura`, quarto parametro dal 27/8 — "un
 * vero formattatore diff, importantissimo") ma si perdeva qui: la funzione
 * non lo accettava, quindi la Review mostrava sempre il file intero. Campo
 * NUOVO e opzionale — un consumatore che lo ignora si comporta come prima.
 */
export function eventoPerScrittura({ percorso, contenuto, esisteva, contenutoPrima }) {
    return stateDelta({
        delta: [{
            op: esisteva ? 'replace' : 'add',
            path: `/file/${percorso}`,
            value: contenuto,
            previous: contenutoPrima ?? null,
        }],
    })
}

/** ⭐ 29/8 — porta canonico (ledger §17, FASE G.1): il totale token cumulativo che talosHarness.mjs riporta per TALOS-BANCO, ora tradotto anche qui per chi guarda una sessione dal vivo. */
export function eventoPerUsage(totali) {
    return stateDelta({
        delta: [{ op: 'replace', path: '/usage', value: totali }],
    })
}

/**
 * ⭐ 29/8 — porta canonico (ledger §18, FASE G — coda messaggi): un
 * messaggio accodato mentre la sessione era ancora in corso, consegnato
 * per davvero — il SOLO momento in cui il frontend può saperlo con
 * certezza (session-registry.mjs, codaMessaggiFn).
 */
export function queuedMessageDelivered({ testo }) {
    return { type: 'QueuedMessageDelivered', testo }
}

/** ⭐ 29/8 — porta canonico (ledger §17, FASE G.2): l'attrezzo `artifact_create` (talosHarness.mjs) torna un id al modello; l'HTML vero arriva qui, separato, per diventare un evento che il frontend può renderizzare (iframe sandboxato, mai srcdoc — vedi artifact-store.mjs). */
export function artifactCreated({ messageId, id, titolo }) {
    return { type: 'ArtifactCreated', messageId, id, titolo }
}

/**
 * ⭐ 30/8 — porta canonico (6c37f8d5, FASE H — permessi "On request"):
 * la carta interattiva del frontend (app.js, `appendApprovalCard`) nasce
 * da questi due eventi — richiesta quando session-registry.mjs chiama
 * chiediApprovazioneFn per un'azione che il livello di accesso non
 * concede da solo, risolta quando la persona risponde (o quando un
 * altro canale la risolve per lei, vedi `_rispostaDataQui()` in app.js).
 */
export function approvalRequested({ requestId, azione }) {
    return { type: 'ApprovalRequested', requestId, azione }
}

export function approvalResolved({ requestId, approvato }) {
    return { type: 'ApprovalResolved', requestId, approvato }
}

/**
 * ⭐⭐⭐ 30/8 — porta canonico ADATTATO (nessun equivalente nel canonico:
 * qui il kernel non ha mai avuto un modo di raggiungere Note/Attività/
 * Memoria/Libreria del telefono — owner, correggendo un mio errore:
 * quei sistemi esistono già, maturi e testati, vanno COLLEGATI non
 * ricostruiti). Stesso schema di `approvalRequested`/`approvalResolved`
 * sopra — richiesta/risposta, un solo slot pendente per voce — riusato
 * qui per DATI invece che per un sì/no.
 */
export function dataRequested({ requestId, tipo, args }) {
    return { type: 'DataRequested', requestId, tipo, args: args ?? null }
}

export function dataProvided({ requestId, tipo, errore }) {
    return { type: 'DataProvided', requestId, tipo, errore: errore ?? null }
}
