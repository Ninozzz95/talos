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

/**
 * ⭐⭐⭐ 27/8, piano sezione "RICOGNIZIONE COMPETITIVA" (R1) — verificato
 * su docs.ag-ui.com/concepts/events (WebFetch, non assunto): questi TRE
 * eventi esistono davvero nello schema pubblico, stesso schema
 * Start/Content/End di TextMessage*, `role:'reasoning'` fisso. La doc
 * segnala che i vecchi eventi `THINKING_*` sono deprecati a favore di
 * questi — REASONING_* è la forma corrente.
 */
export function reasoningMessageStart({ messageId }) {
    return { type: 'ReasoningMessageStart', messageId, role: 'reasoning' }
}

export function reasoningMessageContent({ messageId, delta }) {
    return { type: 'ReasoningMessageContent', messageId, delta }
}

export function reasoningMessageEnd({ messageId }) {
    return { type: 'ReasoningMessageEnd', messageId }
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
 * ⭐⭐⭐ 28/8 — `ArtifactCreated`. ⛔ NON è nello schema pubblico AG-UI
 * (verificato il 24/8 su docs.ag-ui.com/concepts/events per gli eventi
 * sopra: non esiste un evento per "un documento HTML autosufficiente da
 * mostrare"): stessa estensione dichiarata di `contesto` su RunStarted,
 * stesso spirito "loose event format matching".
 *
 * ⛔⛔ NIENTE `html` qui dentro — cambiato dopo la prima versione,
 * misurato dal vivo: `html` viaggiava nell'evento SSE e il frontend lo
 * passava a `iframe.srcdoc`, ma un `srcdoc` eredita la CSP della pagina
 * (vedi artifact-store.mjs) — lo script del modello non partiva mai.
 * La cura è servire l'HTML da una rotta HTTP vera
 * (`GET /api/v1/artifacts/:id`, la sua CSP dedicata), quindi qui basta
 * l'`id`: il frontend punta `iframe.src` lì, il browser fa il resto.
 */
export function artifactCreated({ messageId, id, titolo }) {
    return { type: 'ArtifactCreated', messageId, id, titolo }
}

/**
 * ⭐⭐⭐ 28/8 — workspace-watcher.mjs: i file sono cambiati FUORI
 * dall'app (Explorer, un editor, git...), owner 27/8: "se muovo i
 * file il work tree non si aggiorna automaticamente". Fuori dallo
 * schema pubblico AG-UI (stessa estensione già dichiarata per
 * `ArtifactCreated`) — `percorsi` sono i percorsi RELATIVI coinvolti,
 * già debounced/deduplicati dal watcher; il frontend oggi li usa solo
 * per decidere SE invalidare (mai un diff fine, vedi app.js), ma sono
 * inoltrati comunque: costano poco e un consumo più preciso è lavoro
 * futuro, non una riscrittura del contratto.
 */
export function workspaceChanged({ percorsi }) {
    return { type: 'WorkspaceChanged', percorsi }
}

/**
 * ⭐ Da una risposta grezza del modello (la stessa forma OpenAI che
 * talosLavora già costruisce — {role, content, tool_calls}, vedi
 * talosHarness.mjs riga ~761) all'elenco ORDINATO di eventi AG-UI per
 * quel giro.
 *
 * ⛔ Zero eventi di streaming a chunk QUI: questa funzione traduce la
 * risposta GIÀ COMPLETA che `onGiro` riceve a fine giro (talosHarness.mjs),
 * quindi ogni messaggio di testo resta uno Start+Content+End con UN SOLO
 * delta. ⭐ 27/8 — lo streaming vero (testo E ragionamento, a pezzi,
 * PRIMA che il giro finisca) esiste ora come canale SEPARATO: vedi
 * `reasoningMessageStart/Content/End` sopra e `onDelta` in
 * agent-service.mjs — non sostituisce questa funzione, la precede nel
 * tempo (i delta arrivano durante il giro, questa traduce cosa resta a
 * fine giro).
 *
 * `messageId` è responsabilità del CHIAMANTE (chi ha lo stato per
 * generarne uno univoco, es. agent-service.mjs con crypto.randomUUID) —
 * questa funzione resta pura e deterministica per essere provata senza
 * mock di generatori casuali.
 *
 * ⛔ `testoGiaStreamato` — ⭐ 27/8, R1: quando `onDelta` ha già mandato il
 * testo di QUESTO giro a pezzi (Start, N Content, End — dal vivo, prima
 * ancora che il giro finisse — vedi agent-service.mjs), rimandarlo qui INTERO
 * duplicherebbe il messaggio in chat — stessa famiglia di difetto già
 * trovata e chiusa stanotte per RunFinished.
 *
 * ⛔ `toolCallsGiaStreamate` — Piano procedi-col-generare-un-snoopy-neumann.md,
 * Fase 4: STESSA famiglia di difetto, applicata alle tool-call. Prima
 * di questa fase erano dichiarate "non ancora streamate" (vedi il
 * commento che questa riga sostituisce) — ora che `onDelta` le manda a
 * pezzi (agent-service.mjs), rimandarle qui INTERE le duplicherebbe. Un
 * `Set`/array di `toolCallId` (non un booleano unico: un giro può avere
 * PIÙ tool-call, a differenza del testo/ragionamento che ne hanno al
 * più uno) — ogni tool-call il cui id è dentro viene saltata qui,
 * l'altre (fornitori/percorsi che non passano da `onDelta`, es. la
 * risposta non-streaming) restano emesse come sempre.
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
 *
 * ⭐⭐⭐ 27/8, owner: "un vero formattatore diff, importantissimo".
 * `contenutoPrima` — quinto campo, NON standard RFC 6902 (la spec non lo
 * vieta: un consumer che non lo conosce lo ignora) — è il testo del file
 * un istante prima di questa scrittura, ora tornato da
 * `premessaDellaScrittura` (vedi AVM-harness). ⛔ Aggiunto SOLO quando
 * presente (`contenutoPrima !== undefined`): un chiamante vecchio che non
 * lo passa produce l'identico oggetto di prima, byte per byte — nessuna
 * chiave fantasma `prima: undefined` che romperebbe un
 * `assert.deepStrictEqual` già scritto altrove.
 */
export function eventoPerScrittura({ percorso, contenuto, esisteva, contenutoPrima }) {
    return stateDelta({
        delta: [{
            op: esisteva ? 'replace' : 'add',
            path: `/file/${percorso}`,
            value: contenuto,
            ...(contenutoPrima !== undefined ? { prima: contenutoPrima } : {}),
        }],
    })
}

/**
 * ⭐⭐⭐ Piano procedi-col-generare-un-snoopy-neumann.md, Fase 3 — il
 * contatore costo/token per una sessione VIVA (oggi esiste solo per le
 * righe storiche della Board campagne). Stesso formato StateDelta di
 * `eventoPerScrittura` sopra, stesso path-prefix `/usage` (mai
 * `/file/*`): `replace` sempre, perché `totali` da `talosHarness.mjs`
 * è già una SOMMA cumulativa a ogni giro, non un delta da sommare qui —
 * un secondo consumer che sommasse di nuovo raddoppierebbe il conto.
 */
export function eventoPerUsage(totali) {
    return stateDelta({
        delta: [{ op: 'replace', path: '/usage', value: totali }],
    })
}
