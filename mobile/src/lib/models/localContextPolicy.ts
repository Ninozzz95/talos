/** Context shared by Model Lab fit verdicts and the real local chat runtime. */
export const TALOS_LOCAL_DEFAULT_CONTEXT_TOKENS = 4096

/** The single smaller context TALOS may try after a native context failure. */
export const TALOS_LOCAL_FALLBACK_CONTEXT_TOKENS = 2048

/**
 * ⛔ Qui c'era `TALOS_LOCAL_MAX_CONTEXT_TOKENS = 8192`, e non torna.
 *
 * Il commento diceva «il contesto più grande che TALOS può allocare
 * automaticamente su un telefono o un tablet»: un solo numero per ogni modello e
 * ogni dispositivo. Sul tablet dell'owner — 12 GB, un Llama-3.2-3B a IQ4_XS —
 * rifiutava la conversazione con `PROVIDER_CHAT_FAILED` appena il prompt con i
 * venti tool (≈5.779 token) più la risposta superava quella soglia, su un
 * dispositivo che di contesto ne reggeva molte volte tanto. Sullo stesso codice,
 * un telefono da 4 GB con un 7B avrebbe invece *promesso* 8192 e sarebbe stato
 * ucciso da Android nel mezzo.
 *
 * Un numero non può essere giusto per entrambi perché **non era una politica: era
 * una previsione**, e le previsioni sui dispositivi che non abbiamo mai visto si
 * sbagliano sempre per qualcuno (owner 2026-08-05, policy globale: «TALOS è
 * dinamico e adattabile a ogni modello — una cosa scritta a mano non potrebbe
 * mai esistere»).
 *
 * Il tetto ora **arriva da fuori**, calcolato da `talosMaxContextFor` sui numeri
 * veri di questo dispositivo e di questo modello, e `null` quando quei numeri
 * non ci sono. Vedi il parametro `ceilingTokens` qui sotto.
 */

/**
 * Ordered attempts for one open operation.
 *
 * An explicit small request is never raised. An explicit large request remains
 * the first attempt; only the bounded phone-safe fallback can follow it.
 */
export function talosLocalContextCandidates(requested?: number): number[] {
    const first = Number.isInteger(requested) && Number(requested) > 0
        ? Number(requested)
        : TALOS_LOCAL_DEFAULT_CONTEXT_TOKENS
    return first > TALOS_LOCAL_FALLBACK_CONTEXT_TOKENS
        ? [first, TALOS_LOCAL_FALLBACK_CONTEXT_TOKENS]
        : [first]
}

/** Retrying any other stage repeats deterministic failure and wastes memory. */
export function talosShouldRetryLocalOpen(stage: string): boolean {
    return stage === 'context'
}

/**
 * The exact bounded context required by a prompt and its requested reply.
 *
 * Returns the current context when it already fits, the next power of two when
 * one escalation can fit it, and null instead of truncating when the measured
 * ceiling would be exceeded.
 *
 * @param ceilingTokens quanto contesto QUESTO dispositivo può onestamente dare a
 *     QUESTO modello, da `talosMaxContextFor`.
 *
 *     **`null` non è «illimitato», è «non misurato»**, e la reazione giusta a
 *     «non lo so» non è rifiutare: è lasciare rispondere il motore. Chiedere e
 *     ricevere un no dal dispositivo è una misura; rifiutare al suo posto in
 *     base a un numero che non abbiamo è esattamente il difetto da cui viene
 *     tutto questo. Il caso esiste davvero — build nativa più vecchia, motore
 *     assente, modello non ancora aperto — e su quella strada il fallimento
 *     nativo alla fase `context` resta la rete di sicurezza, già gestita da chi
 *     chiama.
 */
export function talosLocalEscalatedContextTokens(
    currentContextTokens: number,
    promptTokens: number,
    completionTokens: number,
    ceilingTokens: number | null,
): number | null {
    if (![currentContextTokens, promptTokens, completionTokens].every(Number.isFinite)) return null
    const current = Math.max(0, Math.trunc(currentContextTokens))
    const prompt = Math.max(0, Math.trunc(promptTokens))
    const completion = Math.max(0, Math.trunc(completionTokens))
    const required = prompt + completion + 1
    if (!Number.isSafeInteger(required)) return null
    if (required <= current) return current

    // Un tetto misurato ma già più stretto del contesto aperto non retrocede:
    // ciò che è allocato è allocato, e il caso che conta qui è la crescita.
    const ceiling = ceilingTokens === null
        ? Number.MAX_SAFE_INTEGER
        : Math.max(Math.trunc(ceilingTokens), current)
    if (required > ceiling) return null

    /**
     * Potenza di due, ma mai a costo del contesto che c'è.
     *
     * Si arrotonda per eccesso perché un contesto di 6143 è un numero che non ha
     * scelto nessuno e che ogni motore riempie comunque. Quando però la potenza
     * di due successiva sfonda il tetto **e il fabbisogno no**, si prende il
     * tetto: rifiutare lì butterebbe via contesto che il dispositivo stava
     * offrendo, per un'estetica. Non è un caso di scuola — il tetto è spesso il
     * `trainedContext` dichiarato dal modello, che non è quasi mai una potenza
     * di due.
     */
    let candidate = 1
    while (candidate < required) candidate *= 2
    return candidate <= ceiling ? candidate : ceiling
}
