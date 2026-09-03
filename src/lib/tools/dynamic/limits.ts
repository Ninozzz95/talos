/**
 * ⛔⛔ Owner 2026-08-27 — la revisione ingegneristica della ZIP (finding
 * critico #3): "maxInputBytes nei capability descriptor non viene
 * utilizzato nel runtime... anche altri limiti importanti non sono
 * effettivamente garantiti". Confermato leggendo `capabilityCatalog.ts`
 * prima di questo fix: NESSUNA delle 9 capability built-in dichiarava
 * `maxInputBytes` — "applicalo se dichiarato" avrebbe voluto dire "mai",
 * perché niente lo dichiarava. Ora il catalogo dichiara un valore vero per
 * ognuna, e questo file stima le dimensioni e fissa i tetti che
 * `interpreter.ts`/`validator.ts` applicano davvero.
 *
 * `TextEncoder`, non `Buffer`: gira nella WebView, non in Node — `Buffer`
 * non esiste lì per costruzione.
 */
const encoder = new TextEncoder()

/** Stima in byte UTF-8 di un valore, così com'è serializzato per il
 * confronto con un tetto — un valore non serializzabile (es. un
 * `Symbol`) conta come oversize per costruzione, non come zero. */
export function estimateForgeBytes(value: unknown): number {
    try {
        const json = JSON.stringify(value)
        if (json === undefined) return Number.POSITIVE_INFINITY
        return encoder.encode(json).length
    } catch {
        return Number.POSITIVE_INFINITY
    }
}

/** Manifest intero, a tempo d'installazione — un manifest più grande di
 * questo non è "un tool con molti nodi", è un abuso della struttura
 * dichiarativa per portare dati arbitrari. 64 KB è largo per un DSL
 * dichiarativo bounded (max 64 nodi, max 256 transizioni). */
export const MAX_MANIFEST_BYTES = 65_536

/** Tetto di riserva per una capability che non dichiara il proprio
 * `maxInputBytes` — mai "illimitato di fatto" per omissione. */
export const DEFAULT_MAX_INPUT_BYTES = 65_536

/** Il risultato di UNA capability o nodo LLM, prima ancora che diventi
 * output finale — un risultato enorme è un problema di memoria/DoS anche
 * se non viene mai restituito. */
export const MAX_CAPABILITY_RESULT_BYTES = 262_144

/** L'output finale del tool (nodo `return`). */
export const MAX_OUTPUT_BYTES = 262_144

/** Eventi di trace per esecuzione — oltre MAX_TRANSITIONS(256) × i 3
 * tentativi di retry possibili per nodo, con margine: è una difesa di
 * riserva, non un limite che l'uso normale dovrebbe mai avvicinare. */
export const MAX_TRACE_EVENTS = 1024

/**
 * ⛔ Owner 2026-08-27, Fase 5 — approssimazione, non un vero tokenizer.
 * Ricerca 2026: 4 caratteri/token è l'euristica comune (Anthropic ne usa
 * 3,5), con un errore misurato del 10-20% su prosa inglese normale, di
 * più su codice/JSON/script non latini. Va bene per un tetto di
 * SICUREZZA (fermare un input/output fuori scala) — non per un budget di
 * costo preciso, che vorrebbe il tokenizer vero del provider.
 */
const APPROX_CHARS_PER_TOKEN = 4

export function estimateForgeTokens(value: unknown): number {
    const bytes = estimateForgeBytes(value)
    if (!Number.isFinite(bytes)) return Number.POSITIVE_INFINITY
    return Math.ceil(bytes / APPROX_CHARS_PER_TOKEN)
}
