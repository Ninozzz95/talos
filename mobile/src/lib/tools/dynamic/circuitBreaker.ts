/**
 * ⛔⛔ Owner 2026-08-27 — due difetti confermati leggendo questo file
 * PRIMA del fix:
 *
 * 1. **Mai agganciato**: `interpreter.ts` non lo importava. Codice morto,
 *    esattamente come il gap `premesse`/`verify` di Fase 0 — scritto,
 *    mai chiamato. Ora `callCapability` lo consulta davvero.
 * 2. **Nessun mezzo stato**: dopo il cooldown, `canRun` cancellava lo
 *    stato e tornava CLOSED — non un singolo probe HALF-OPEN come da
 *    letteratura (Fowler/Resilience4j, e confermato dalla ricerca 2026:
 *    "the breaker allows a single trial request... if it fails, the
 *    breaker immediately transitions back to Open"). Risultato: dopo il
 *    cooldown QUALSIASI numero di chiamate concorrenti passava subito
 *    tutte insieme, e un solo fallimento doveva riaccumulare l'intera
 *    soglia da zero invece di riaprire subito.
 */
export interface CircuitBreakerState {
    failures: number[]
    openUntil: number | null
    /** Esattamente UN probe alla volta durante l'half-open. */
    halfOpenProbeInFlight: boolean
}

const EMPTY: CircuitBreakerState = { failures: [], openUntil: null, halfOpenProbeInFlight: false }

export class ForgeCircuitBreaker {
    private readonly state = new Map<string, CircuitBreakerState>()
    // ⛔ Niente proprietà-parametro (`constructor(private readonly x)`): il
    // repo compila con `erasableSyntaxOnly`, che vieta la sintassi che
    // assegna `this.x` implicitamente perché richiede una trasformazione
    // vera, non solo la rimozione dei tipi.
    private readonly threshold: number
    private readonly windowMs: number
    private readonly cooldownMs: number
    constructor(threshold = 3, windowMs = 10 * 60_000, cooldownMs = 30 * 60_000) {
        this.threshold = threshold
        this.windowMs = windowMs
        this.cooldownMs = cooldownMs
    }

    /**
     * ⛔ Ha un effetto: durante l'half-open, concedere il probe LO
     * consuma (nessun'altra chiamata concorrente lo riceve finché
     * `success`/`failure` non chiudono il giro). Non è una query pura di
     * proposito — è la stessa scelta di design di un vero circuit
     * breaker, non un difetto.
     */
    canRun(toolId: string, now = Date.now()): boolean {
        const state = this.state.get(toolId) ?? EMPTY
        if (state.openUntil === null) return true // CLOSED
        if (state.openUntil > now) return false // OPEN
        if (state.halfOpenProbeInFlight) return false // HALF-OPEN, probe già in corso
        this.state.set(toolId, { ...state, halfOpenProbeInFlight: true })
        return true // HALF-OPEN: questo è l'UNICO probe concesso
    }

    success(toolId: string): void { this.state.delete(toolId) } // torna CLOSED, storia azzerata

    failure(toolId: string, now = Date.now()): CircuitBreakerState {
        const previous = this.state.get(toolId) ?? EMPTY
        if (previous.halfOpenProbeInFlight) {
            // Il probe half-open è fallito: si riapre SUBITO, niente
            // soglia da riaccumulare — un solo fallimento durante la
            // prova basta a dire che il servizio non è ancora tornato.
            const next: CircuitBreakerState = { failures: previous.failures, openUntil: now + this.cooldownMs, halfOpenProbeInFlight: false }
            this.state.set(toolId, next)
            return next
        }
        const failures = [...previous.failures.filter((at) => at >= now - this.windowMs), now]
        const openUntil = failures.length >= this.threshold ? now + this.cooldownMs : null
        const next: CircuitBreakerState = { failures, openUntil, halfOpenProbeInFlight: false }
        this.state.set(toolId, next)
        return next
    }

    snapshot(toolId: string): CircuitBreakerState { return this.state.get(toolId) ?? EMPTY }
}
