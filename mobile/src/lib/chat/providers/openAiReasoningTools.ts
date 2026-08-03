/**
 * I modelli OpenAI che non accettano tool e ragionamento nella stessa richiesta.
 *
 * Segnalato dall'owner il 2026-08-03 con uno screenshot dal telefono: con
 * `gpt-5.6-luna` selezionato, «Ciaoo» riceve un errore invece di una risposta.
 *
 *   PROVIDER_HTTP_400 — «Function tools with reasoning_effort are not supported
 *   for gpt-5.6-luna in /v1/chat/completions. To use function tools, use
 *   /v1/responses or set reasoning_effort to 'none'.»
 *
 * Non è un caso limite: TALOS offre i suoi tool a ogni messaggio, quindi su
 * quel modello NON funziona niente. Un modello che c'è nell'elenco e non
 * risponde mai è peggio di uno assente.
 *
 * ## Il fatto che ribalta la correzione ovvia
 *
 * Provato contro l'API vera lo stesso giorno, con tre richieste identiche
 * tranne quel campo:
 *
 *   - `reasoning_effort: 'high'` + tool → **400**
 *   - campo **omesso** + tool          → **400**
 *   - `reasoning_effort: 'none'` + tool → **200**
 *
 * Togliere il campo NON basta: quando manca, il modello applica un livello suo
 * lato server e il rifiuto resta identico. Serve un `'none'` **esplicito**. La
 * correzione che sembrava ovvia — «non mandarlo» — sarebbe stata sbagliata, e
 * lo si scopre solo chiedendolo al provider.
 *
 * ## Perché non c'è un elenco di modelli
 *
 * Un elenco cablato invecchia dentro l'APK ([[app-distributed-nothing-static]])
 * e sbaglierebbe sul prossimo modello che OpenAI pubblica. Il provider invece
 * lo dice, e lo dice in modo riconoscibile: `param` vale `reasoning_effort`. Si
 * impara dal rifiuto e si ricorda per quel modello.
 */

/** Quale livello si può chiedere quando la coppia non è ammessa. */
export const TALOS_OPENAI_REASONING_NONE = 'none'

/**
 * Vero quando questo 400 è ESATTAMENTE quel rifiuto.
 *
 * Stretta di proposito: chiedono entrambe le prove — il parametro nominato e la
 * frase — perché un riconoscimento largo trasformerebbe altri 400 legittimi in
 * un tentativo silenzioso con il ragionamento spento, cioè in una richiesta
 * diversa da quella che l'utente ha chiesto, mandata senza dirlo.
 */
export function talosOpenAiRejectsToolsWithReasoning(status: number, data: unknown): boolean {
    if (status !== 400) return false
    const error = (data as { error?: { message?: unknown, param?: unknown } } | null)?.error
    if (!error) return false
    if (error.param !== 'reasoning_effort') return false
    const message = typeof error.message === 'string' ? error.message.toLowerCase() : ''
    return message.includes('function tools') && message.includes('reasoning_effort')
}

/**
 * I modelli che ce l'hanno già detto, in questa sessione.
 *
 * In memoria e non su disco: è una proprietà del modello dal lato del provider,
 * e OpenAI può toglierla domani senza avvisare. Ricordarla per sempre
 * significherebbe spegnere il ragionamento su un modello che nel frattempo lo
 * accetta — e nessuno andrebbe mai a controllare.
 */
const learned = new Set<string>()

export function talosRememberReasoningConflict(modelId: string): void {
    learned.add(modelId)
}

export function talosHasReasoningConflict(modelId: string): boolean {
    return learned.has(modelId)
}

/** Per i test: nessuno stato di modulo deve sopravvivere a un caso. */
export function __resetTalosReasoningConflicts(): void {
    learned.clear()
}
