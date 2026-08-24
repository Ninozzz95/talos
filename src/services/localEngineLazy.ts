/**
 * Un solo `import()` reale di `@/services/localEngine` per tutto il
 * processo, condiviso da ogni chiamante — non uno a testa.
 *
 * ⛔⛔ Non è ottimizzazione: `import()` dinamico ripetuto dello STESSO
 * modulo mockato con `vi.mock`, chiamato da due punti "fire and forget"
 * concorrenti senza che nessuno attenda l'altro, si è dimostrato un
 * deadlock REALE sotto Vitest — riprodotto isolato, con due funzioni
 * minime e un modulo fittizio: il secondo `import()` non risolve mai
 * finché non condividono la stessa Promise cachata. `chatController.ts`
 * aveva un solo chiamante (`decideLocalEngineProbeConsent`) prima di P3-1,
 * quindi il rischio non si era mai manifestato — non è un bug nuovo, è un
 * bug che aveva sempre avuto un solo modo di innescarsi, e ora ne ha due:
 * il probe consent e il warm-load anticipato.
 *
 * Vive qui, non dentro `chatController.ts`: un modulo minimo importato
 * staticamente pesa quasi nulla nel grafo d'avvio (`scripts/verify-
 * initial-chunk.mjs`), a differenza del corpo intero di una funzione con i
 * suoi commenti.
 */
let cached: Promise<typeof import('@/services/localEngine')> | null = null

export function talosLocalEngineLazy(): Promise<typeof import('@/services/localEngine')> {
    if (!cached) cached = import('@/services/localEngine')
    return cached
}
