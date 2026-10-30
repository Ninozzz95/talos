/**
 * ⛔ IMPOSTAZIONI-DAL-VIVO (owner 27/10/2026: «da remoto il dispositivo collegato deve poter istantaneamente e robustamente cambiare
 * tutte le impostazioni e sul pc devono essere visibili subito come modello, ragionamento etc, tutte queste cose devono essere
 * assolutamente testate e robuste»).
 *
 * Contratto F del censimento (Desktop, r4 `f573cdc93`): ogni cambio salvato annuncia `talos.impostazioni-sessione` con la FOTOGRAFIA
 * intera (`istantanea`) e una `versione` che cresce e non torna indietro; la stessa fotografia torna nella risposta di `/settings` e
 * `/rename`, e la riga di `GET /sessions` porta `versioneImpostazioni`. Il modello è Codex `thread/settings/updated` (fotografia intera,
 * mai un pezzo), come la finestra del PC (`applicaIstantaneaImpostazioni`).
 *
 * La regola del dispositivo, qui pura e provata da sola (IDV-01..08):
 * - si applica solo una fotografia PIÙ NUOVA di quella già applicata (il ripasso della storia, due cambi che si incrociano);
 * - mentre una scrittura propria è in volo, ciò che arriva si TRATTIENE (solo la più nuova): una fotografia partita prima del cambio
 *   del dispositivo non lo disfa sotto le dita;
 * - quando l'ultima scrittura torna, vale la più nuova fra la sua risposta e la trattenuta.
 */

export interface IstantaneaR4 {
    modello: string | null
    reasoning: { effort: string } | null
    permessi: string | null
    permessiPerAttrezzo: Record<string, string>
    modalitaOperativa: 'normale' | 'piano'
    nome: string | null
    /** Tenuti per il passo dei comandi del dispositivo (dove girano i comandi, il loro racconto): oggi nessuna vista li mostra. */
    doveGiranoIComandi: string | null
    comandiNellaConversazione: boolean
    versione: number
}

const testoONull = (v: unknown): string | null => (typeof v === 'string' && v ? v : null)

/** La fotografia letta campo per campo; `null` se non è un oggetto o la versione non è un intero ≥ 0. */
export function istantaneaR4(valore: unknown): IstantaneaR4 | null {
    if (!valore || typeof valore !== 'object' || Array.isArray(valore)) return null
    const v = valore as Record<string, unknown>
    if (typeof v.versione !== 'number' || !Number.isSafeInteger(v.versione) || v.versione < 0) return null
    const effort = v.reasoning && typeof v.reasoning === 'object' ? (v.reasoning as { effort?: unknown }).effort : null
    const mappa = v.permessiPerAttrezzo && typeof v.permessiPerAttrezzo === 'object' && !Array.isArray(v.permessiPerAttrezzo)
        ? Object.fromEntries(Object.entries(v.permessiPerAttrezzo as Record<string, unknown>).filter((e): e is [string, string] => typeof e[1] === 'string'))
        : {}
    return {
        modello: testoONull(v.modello),
        reasoning: typeof effort === 'string' && effort ? { effort } : null,
        permessi: testoONull(v.permessi),
        permessiPerAttrezzo: mappa,
        // un valore vecchio (`workflow`) si legge come Normale, come `normalizzaModoDiLavoro` del desktop
        modalitaOperativa: v.modalitaOperativa === 'piano' ? 'piano' : 'normale',
        nome: testoONull(v.nome),
        doveGiranoIComandi: testoONull(v.doveGiranoIComandi),
        comandiNellaConversazione: v.comandiNellaConversazione === true,
        versione: v.versione,
    }
}

export interface StatoImpostazioniR4 {
    /** La versione dell'ultima fotografia applicata; -1 = nessuna (allora vale la riga dell'elenco, o quella di prima). */
    applicata: number
    /** Le scritture del dispositivo partite e non ancora tornate. */
    inVolo: number
    /** La fotografia più nuova arrivata mentre una scrittura era in volo. */
    trattenuta: IstantaneaR4 | null
}

export const creaStatoImpostazioniR4 = (): StatoImpostazioniR4 => ({ applicata: -1, inVolo: 0, trattenuta: null })

const piuNuova = (a: IstantaneaR4 | null, b: IstantaneaR4 | null): IstantaneaR4 | null => (!a ? b : !b ? a : b.versione > a.versione ? b : a)

/** Una fotografia arrivata (evento, riga). `applica` è ciò che la vista deve mostrare adesso, o `null`. */
export function arrivaIstantanea(stato: StatoImpostazioniR4, arrivata: IstantaneaR4): { stato: StatoImpostazioniR4; applica: IstantaneaR4 | null } {
    if (arrivata.versione <= stato.applicata) return { stato, applica: null }
    if (stato.inVolo > 0) return { stato: { ...stato, trattenuta: piuNuova(stato.trattenuta, arrivata) }, applica: null }
    return { stato: { ...stato, applicata: arrivata.versione }, applica: arrivata }
}

export const inizioScrittura = (stato: StatoImpostazioniR4): StatoImpostazioniR4 => ({ ...stato, inVolo: stato.inVolo + 1 })

/**
 * Una scrittura del dispositivo è tornata, con la fotografia della risposta (o `null`: un rifiuto, un PC più vecchio). Finché ne resta
 * un'altra in volo si trattiene ancora; all'ultima vale la più nuova fra la risposta e la trattenuta, se è più nuova dell'applicata.
 */
export function fineScrittura(stato: StatoImpostazioniR4, risposta: IstantaneaR4 | null): { stato: StatoImpostazioniR4; applica: IstantaneaR4 | null } {
    const inVolo = Math.max(0, stato.inVolo - 1)
    const candidata = piuNuova(stato.trattenuta, risposta)
    if (inVolo > 0) return { stato: { ...stato, inVolo, trattenuta: candidata }, applica: null }
    if (!candidata || candidata.versione <= stato.applicata) return { stato: { ...stato, inVolo, trattenuta: null }, applica: null }
    return { stato: { applicata: candidata.versione, inVolo, trattenuta: null }, applica: candidata }
}
