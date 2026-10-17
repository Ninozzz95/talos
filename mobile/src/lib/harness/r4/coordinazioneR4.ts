/**
 * ⛔ K3 Coordinazione (ledger `LEDGER-K3-AUTOMAZIONI-FORNITORI-COORDINAZIONE-2026-10-17.md`): le regole della Coordinazione come il
 * desktop r4 @ 701c6c0d2 (`components/coordinazione.js`, `legacy/app.js` `catenaCoordinazioneDella`). Lo stato vive nelle scelte per
 * attrezzo della sessione, alla chiave `delega_sottotask`: «sempre» = accesa; assente o «chiedi» = spenta (di serie).
 */
export const CHIAVE_COORDINAZIONE_R4 = 'delega_sottotask'
/** Agenti avviati da soli per conversazione (owner 08/10/2026 sul desktop): la riga del foglio lo dice. */
export const TETTO_AVVII_DA_SOLO_R4 = 20

const eMappa = (m: unknown): m is Record<string, unknown> => Boolean(m) && typeof m === 'object' && !Array.isArray(m)

/**
 * Accesa per una catena di sessioni (la sessione prima, la conversazione principale ultima): un «nega», un «chiedi» o un valore
 * storto in un anello spengono; un anello senza la chiave eredita; la conversazione principale decide.
 */
export function coordinazioneAccesaNellaCatenaR4(sceltePerAnello: unknown): boolean {
    const anelli = Array.isArray(sceltePerAnello) ? sceltePerAnello : []
    if (anelli.length === 0) return false
    const scelte = anelli.map((m) => (eMappa(m) && Object.hasOwn(m, CHIAVE_COORDINAZIONE_R4) ? m[CHIAVE_COORDINAZIONE_R4] : undefined))
    if (scelte.some((s) => s !== undefined && s !== 'sempre')) return false
    return scelte[scelte.length - 1] === 'sempre'
}

interface VoceSessioneR4 { sessionId?: unknown; padreId?: unknown; permessiPerAttrezzo?: unknown }

/**
 * Le scelte per attrezzo dalla sessione aperta (prima: le sue scelte VIVE) alla conversazione principale (ultima), dall'elenco delle
 * sessioni di r4 (`GET /sessions`). `scelte: null` se un anello manca dall'elenco o la catena gira in tondo: lo stato vero non si
 * può dire. `delega` vero per un agente delegato (decide la catena, l'interruttore non si tocca).
 */
export function catenaDellaSessioneR4(sessionId: string, voci: readonly VoceSessioneR4[], scelteVive: unknown): { delega: boolean; scelte: unknown[] | null } {
    const perId = new Map(voci.filter((v) => typeof v?.sessionId === 'string').map((v) => [v.sessionId as string, v]))
    const scelte: unknown[] = [scelteVive]
    const voce = perId.get(sessionId)
    if (typeof voce?.padreId !== 'string' || !voce.padreId) return { delega: false, scelte }
    const visti = new Set([sessionId])
    for (let padreId: unknown = voce.padreId; typeof padreId === 'string' && padreId;) {
        const padre = visti.has(padreId) ? undefined : perId.get(padreId)
        if (!padre) return { delega: true, scelte: null }
        visti.add(padreId)
        scelte.push(padre.permessiPerAttrezzo)
        padreId = padre.padreId
    }
    return { delega: true, scelte }
}
