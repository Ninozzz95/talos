/**
 * ⛔ K4-E (ledger `LEDGER-K4E-R4-NELLA-RELEASE-2026-10-17.md`; owner 17/10 «r4 al posto, il vecchio come ripiego»): la voce «Codice»
 * (`/harness`) apre il Codice su r4 quando l'APK lo porta. Se r4 non parte, `/codice-r4` torna al Codice vecchio con `ripiego=1`
 * (`ROTTA_RIPIEGO_R4`) e lì si resta: niente giro a vuoto fra le due schermate. Le sessioni del Codice vecchio non migrano: si
 * vedono solo dal ripiego.
 * ⛔ ELENCO-R4 (owner 18/10 «la lista delle sessioni … esattamente come sulla chat Legacy»): sul telefono `/harness` non rimanda più a
 * r4: è l'elenco delle sessioni di r4 (`HarnessScreen.vue`). Il rimando resta solo sul tablet, dove l'elenco sta nella colonna e il
 * centro apre l'ultima sessione (`apriCodiceSulTabletR4`).
 */
export const ROTTA_RIPIEGO_R4 = Object.freeze({ name: 'harness', query: Object.freeze({ ripiego: '1' }) })

interface RottaR4 { name?: unknown; query?: Record<string, unknown> }
interface RouterR4 { replace: (destinazione: { name: string; params?: Record<string, string> }) => unknown }

/**
 * Sul tablet la pagina-elenco `/harness` non esiste (la barra laterale ha già l'elenco): l'app apriva l'ultima sessione del Codice
 * vecchio, in gara con `apriCodiceR4SeDisponibile` di `HarnessScreen`. Visto sul Pad (17/10): vinceva il Codice vecchio. Ora prima
 * r4, se c'è; altrimenti, come prima, la sessione vecchia più recente o la bozza.
 * ⛔ La rotta si RILEGGE (`rottaAttuale`) dopo ogni attesa: sul Pad, mentre si chiedeva al ponte, `HarnessScreen` aveva già mandato a
 * r4, e la rotta letta all'inizio diceva ancora `harness`: la sessione vecchia si apriva 57 ms dopo, sopra r4.
 */
export async function apriCodiceSulTabletR4({ rottaAttuale, router, disponibile, sessioniVecchie, sessioniR4 }: {
    rottaAttuale: () => RottaR4
    router: { replace: (destinazione: { name: string; params?: Record<string, string> }) => unknown }
    disponibile: () => Promise<boolean>
    sessioniVecchie: () => Promise<{ id: string }[]>
    /** ELENCO-R4 (18/10): le sessioni r4 dalla più recente; come il classico, il tablet apre l'ultima. Un guasto apre la bozza. */
    sessioniR4: () => Promise<{ id: string }[]>
}): Promise<void> {
    const ultimaR4 = async (): Promise<string | null> => {
        try { return (await sessioniR4())[0]?.id ?? null } catch { return null }
    }
    if (await apriCodiceR4SeDisponibile({ rotta: rottaAttuale(), router, disponibile, ultimaSessione: ultimaR4, rottaAttuale })) return
    if (rottaAttuale().name !== 'harness') return
    const sessioni = await sessioniVecchie()
    if (rottaAttuale().name !== 'harness') return
    await router.replace({ name: 'harness-session', params: { id: sessioni[0]?.id ?? 'new' } })
}

/** Vero se ha mandato a r4. Solo dalla pagina del Codice vecchio, senza ripiego; un guasto del ponte lascia dov'è. */
export async function apriCodiceR4SeDisponibile({ rotta, router, disponibile, ultimaSessione, rottaAttuale }: {
    rotta: RottaR4
    router: RouterR4
    disponibile: () => Promise<boolean>
    /** Facoltativa: la sessione r4 da aprire (il tablet apre l'ultima); senza, o `null`, si apre la bozza. */
    ultimaSessione?: () => Promise<string | null>
    /** Con `ultimaSessione`: la rotta riletta dopo l'attesa, perché nel frattempo la persona può essere andata altrove. */
    rottaAttuale?: () => RottaR4
}): Promise<boolean> {
    if (rotta.name !== 'harness' || rotta.query?.ripiego === '1') return false
    let c = false
    try { c = await disponibile() } catch { c = false }
    if (!c) return false
    const id = ultimaSessione ? await ultimaSessione() : null
    if (rottaAttuale && rottaAttuale().name !== 'harness') return true
    await router.replace(id ? { name: 'codice-r4', params: { id } } : { name: 'codice-r4' })
    return true
}
