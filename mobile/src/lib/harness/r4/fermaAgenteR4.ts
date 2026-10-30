/**
 * «Ferma» nella scheda Agenti del telefono (owner 29/10 notte, G1 del mockup «Ferma tutto»; spec
 * `Downloads/handoff-talos-mobile-2026-09-29/in-corso/SPEC-FERMA-NELLA-SCHEDA-AGENTI-2026-10-29.md`). PEZZO VERO: va, senza cambiare, in
 * `src/lib/harness/r4/fermaAgenteR4.ts`. Solo regole: le prove in `fermaAgente.test.ts`.
 *
 *  · «Ferma» c'è solo per un agente VIVO: non concluso e non interrotto (la stessa regola di «Ferma tutto», `agenteVivoR4`); chi aspetta
 *    un permesso o una risposta è vivo, una delega in pausa no (r4 la segna conclusa).
 *  · La conferma sta NELLA RIGA (owner 29/10: niente finestra). Se l'agente finisce da solo mentre è aperta, si chiude e la riga dice
 *    «Aveva già finito: niente da fermare».
 *  · Una sezione (una richiesta) con una conferma aperta non si richiude da sola.
 *  · La strada: `POST /api/v1/sessions/<figlia>/stop` con `{ figlie: 'tutte' }` (correzione del Desktop, 29/10 notte, FA-G1): è
 *    `fermaTutto` su quella figlia, lei e le sue discendenti, niente risveglio, risultati in coda. Con `{}` il server fermerebbe la figlia
 *    SENZA cascata (ASYNC 4 della CLI) e le sue figlie continuerebbero a lavorare e a costare. La rotta è quella dello Stop della chat
 *    (`useConversazioneR4.ts`, `ferma()`), con l'id della figlia.
 * ⛔ Le parole sono quelle del PC (pannello v2, `frontend/src/components/pannello/agenti.js:306-318`), identiche per parità.
 */
import { agenteVivoR4, type SessioneDellAlberoR4 } from './fermaTuttoR4'

export { agenteVivoR4 }

/** Le voci dei tre puntini di un agente: «Ferma questa delega» solo se è vivo. Vuoto = niente tre puntini. */
export interface VoceMenuAgenteR4 { id: 'ferma'; label: string; danger: true; testId: string }
export function vociMenuAgenteR4(agente: SessioneDellAlberoR4, lingua: string): VoceMenuAgenteR4[] {
    return agenteVivoR4(agente) ? [{ id: 'ferma', label: testoFermaAgenteR4('menu.ferma', lingua), danger: true, testId: 'talos-codice-r4-agente-menu-ferma' }] : []
}

/** Lo stato di una riga: la conferma aperta, e l'esito della richiesta (in corso, fatta, già finita, non riuscita). */
export type EsitoRigaR4 =
    | { tipo: 'in-corso'; dal: number }
    | { tipo: 'fatto' }
    | { tipo: 'gia-finito' }
    | { tipo: 'errore'; messaggio: string }
export interface StatoRigaAgenteR4 { conferma: boolean; esito: EsitoRigaR4 | null }
export const RIGA_A_RIPOSO_R4: StatoRigaAgenteR4 = Object.freeze({ conferma: false, esito: null })

/** «Ferma questa delega» dal menu: la conferma si apre solo per un agente vivo e mai due volte sulla stessa richiesta. */
export function apriConfermaR4(stato: StatoRigaAgenteR4, agente: SessioneDellAlberoR4): StatoRigaAgenteR4 {
    if (!agenteVivoR4(agente) || stato.esito?.tipo === 'in-corso') return stato
    return { conferma: true, esito: null }
}
export function annullaConfermaR4(stato: StatoRigaAgenteR4): StatoRigaAgenteR4 {
    return stato.conferma ? { ...stato, conferma: false } : stato
}
/** «Ferma la delega»: la richiesta parte (una sola) e la riga dice «Lo fermo…». `null` = niente da mandare. */
export function confermaFermaR4(stato: StatoRigaAgenteR4, agente: SessioneDellAlberoR4, adesso: number): StatoRigaAgenteR4 | null {
    if (!stato.conferma || stato.esito?.tipo === 'in-corso') return null
    if (!agenteVivoR4(agente)) return { conferma: false, esito: { tipo: 'gia-finito' } }
    return { conferma: false, esito: { tipo: 'in-corso', dal: adesso } }
}
/** L'esito della rotta: «Fermato», o il perché a parole (mai una riga muta). */
export function esitoFermaR4(stato: StatoRigaAgenteR4, risposta: { ok: true } | { ok: false; messaggio?: string | null }, lingua: string): StatoRigaAgenteR4 {
    if (stato.esito?.tipo !== 'in-corso') return stato
    return risposta.ok
        ? { conferma: false, esito: { tipo: 'fatto' } }
        : { conferma: false, esito: { tipo: 'errore', messaggio: risposta.messaggio || testoFermaAgenteR4('errore', lingua) } }
}
/** L'agente è cambiato (elenco riletto, evento dal vivo): finito da solo con la conferma aperta → la conferma si chiude e lo si dice. */
export function aggiornaConAgenteR4(stato: StatoRigaAgenteR4, agente: SessioneDellAlberoR4): StatoRigaAgenteR4 {
    if (stato.conferma && !agenteVivoR4(agente)) return { conferma: false, esito: { tipo: 'gia-finito' } }
    return stato
}

/**
 * Una sezione della scheda (una richiesta) è aperta? Come oggi (`TalosCodiceR4Agenti.vue:56`): la scelta della persona, se c'è, sennò
 * aperta la più recente. In più: una sezione che ha una conferma aperta (o una richiesta in viaggio) resta aperta anche quando arriva una
 * richiesta più nuova. Solo la persona la richiude.
 */
export function sezioneApertaR4(p: { id: string; sceltaDellaPersona?: boolean; piuRecente: string | null; cercando?: boolean; conConfermaAperta: boolean }): boolean {
    if (p.cercando) return true
    if (typeof p.sceltaDellaPersona === 'boolean') return p.sceltaDellaPersona
    return p.id === p.piuRecente || p.conConfermaAperta
}
/** Le righe che tengono aperta la loro sezione: una conferma aperta, o «Lo fermo…» in viaggio. */
export function tieneApertaR4(stato: StatoRigaAgenteR4 | undefined): boolean {
    return Boolean(stato && (stato.conferma || stato.esito?.tipo === 'in-corso'))
}

/** La rotta: la stessa dello Stop, con l'id della figlia e `figlie: 'tutte'` (FA-G1: la figlia E le sue figlie). */
export function richiestaFermaFigliaR4(figliaId: string): { metodo: 'POST'; percorso: string; corpo: { figlie: 'tutte' } } {
    return { metodo: 'POST', percorso: `/api/v1/sessions/${encodeURIComponent(figliaId)}/stop`, corpo: { figlie: 'tutte' } }
}

// ---- le parole del PC (pannello v2) ----
type Chiave = 'conferma.titolo' | 'menu.ferma' | 'conferma.domanda' | 'conferma.conseguenza' | 'conferma.ferma' | 'conferma.annulla'
    | 'esito.inCorso' | 'esito.fatto' | 'esito.giaFinito' | 'errore'
const TESTI: Record<'it' | 'en', Record<Chiave, string>> = {
    it: {
        'conferma.titolo': 'Fermare questa delega?', // delegations.stopTitle
        'menu.ferma': 'Ferma questa delega', // delegations.menu.stop
        'conferma.domanda': 'Il lavoro già fatto resta al suo posto.', // delegations.menu.stopQuestion
        'conferma.conseguenza': 'Quello in corso no: il giro si interrompe dove è arrivato.', // delegations.menu.stopConsequence
        'conferma.ferma': 'Ferma la delega', // delegations.menu.stopConfirm
        'conferma.annulla': 'Annulla', // la parola di `common.cancel` dell'app; nell'app si usa quella chiave
        'esito.inCorso': 'Lo fermo…', // agenti.fermaInCorso
        'esito.fatto': 'Fermato', // agenti.fermato
        'esito.giaFinito': 'Aveva già finito: niente da fermare', // agenti.giaFinito
        errore: 'Delega non fermata', // delegations.stopFailed (FA-G2, Desktop 29/10 notte)
    },
    en: {
        'conferma.titolo': 'Stop this delegation?',
        'menu.ferma': 'Stop this delegation',
        'conferma.domanda': 'The work already done stays where it is.',
        'conferma.conseguenza': 'The work in progress does not: the turn stops where it got to.',
        'conferma.ferma': 'Stop the delegation',
        'conferma.annulla': 'Cancel',
        'esito.inCorso': 'Stopping it…',
        'esito.fatto': 'Stopped',
        'esito.giaFinito': 'It had already finished: nothing to stop',
        errore: 'Delegation not stopped',
    },
}
export function testoFermaAgenteR4(chiave: Chiave, lingua: string): string {
    return TESTI[/^it(?:-|$)/iu.test(lingua) ? 'it' : 'en'][chiave]
}
