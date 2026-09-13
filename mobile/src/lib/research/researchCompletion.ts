import { talosResearchParseReport } from '@/lib/research/researchReport'

/**
 * «Conclusa» solo se esiste un artefatto che si rilegge davvero. (MB-1 · C20)
 *
 * Il difetto che questo file esiste per rendere impossibile e' stato visto sul
 * desktop: una ricerca dichiarata `done` con un rapporto di 290 byte che era la
 * SCUSA del modello — «La sessione e' in sola lettura, quindi non posso creare
 * documenti direttamente…». Lo stato diceva una cosa, il file ne diceva
 * un'altra, e niente nel sistema metteva le due a confronto.
 *
 * Ricerca, 12/09/2026, prima di scrivere una riga:
 *
 *  - «Beyond Object Validation: Relational Conformance in Multi-Artifact Agent
 *    Releases», arXiv:2607.14155 — un rilascio puo' superare OGNI cancello
 *    automatico, di schema e di documentazione, e portarsi dentro lo stesso un
 *    certificato fallito sotto un'intestazione «Gold Path». Lo stato dichiarato
 *    e l'artefatto prodotto sono due fatti diversi, e il primo non prova il
 *    secondo.
 *    https://arxiv.org/html/2607.14155
 *  - «Marco DeepResearch: Unlocking Efficient Deep Research Agents via
 *    Verification-Centric Design», arXiv:2603.28376 — la verifica al centro,
 *    non in coda. https://arxiv.org/pdf/2603.28376
 *  - Sci-MMR, 10/09/2026 (§5 del disegno) — la risposta risulta «giusta» venti
 *    punti oltre le prove effettivamente recuperate: lo stato si controlla
 *    contro l'artefatto, mai contro la conclusione del modello.
 *
 * ⛔ Questo modulo NON scrive niente e non tocca il giornale. E' una domanda
 * che si fa all'artefatto al momento di guardarlo, e la ragione e' scritta nel
 * disegno: le ricerche gia' su disco con `done` e un rapporto illeggibile si
 * mostrano per quello che sono SENZA riscrivere il file — cio' che e' costato
 * denaro non si sovrascrive mai. Lo stesso conto, fatto al volo, vale per le
 * corse nuove e per quelle vecchie: una regola sola, nessuna migrazione.
 */

/**
 * Come e' finita davvero una ricerca, guardando cio' che ha prodotto.
 *
 * Quattro esiti e non due, perche' «non c'e' un rapporto» e' una diagnosi
 * inutile: chi legge vuole sapere PERCHE' non c'e', ed e' il perche' che decide
 * la mossa successiva.
 */
export type TalosResearchCompletion =
    /** Il record recintato si rilegge e porta almeno un'affermazione e almeno una fonte. */
    | 'con-rapporto'
    /** Il rapporto e' stato scritto ma non si rilegge, oppure e' vuoto. */
    | 'senza-rapporto'
    /** Fra le prove c'e' un rifiuto di permesso, e nessun rapporto valido. */
    | 'bloccata-dal-permesso'
    /** Il rapporto non e' mai stato scritto: la corsa e' finita prima di arrivarci. */
    | 'giri-esauriti'

/** I tre esiti che NON sono una conclusione, nell'ordine in cui si raccontano. */
export const TALOS_RESEARCH_INCOMPLETE: readonly TalosResearchCompletion[] = Object.freeze([
    'bloccata-dal-permesso', 'giri-esauriti', 'senza-rapporto',
])

/**
 * Le parole con cui un permesso negato si presenta, nelle due lingue.
 *
 * Due famiglie, non un elenco solo, e la differenza e' cio' che tiene basso il
 * numero di falsi positivi:
 *
 *  A. il permesso NOMINATO — «sola lettura», «permission denied», `EACCES`.
 *     Basta da sola: sono parole che non compaiono per caso.
 *  B. l'impotenza PIU' l'atto di scrivere — «non posso» + «creare/salvare/file».
 *     Serve la coppia: «non posso» da solo compare in mille frasi innocue.
 *
 * ⛔ Nessuna delle due viene mai consultata su un rapporto che si rilegge: la
 * porta si apre solo quando l'artefatto valido NON c'e'. Un rapporto vero che
 * PARLA di permessi resta `con-rapporto`, perche' il record vince sul testo.
 */
const PERMESSO_NOMINATO: readonly RegExp[] = Object.freeze([
    /\bsola lettura\b/i,
    /\bin sola lettura\b/i,
    /\bpermess[oi] negat[oi]\b/i,
    /\baccesso negato\b/i,
    /\bnon ho i permessi\b/i,
    /\bread[-\s]?only\b/i,
    /\bpermission denied\b/i,
    /\bnot permitted\b/i,
    /\boperation not permitted\b/i,
    /\bEACCES\b/,
    /\bEPERM\b/,
])

const IMPOTENZA: readonly RegExp[] = Object.freeze([
    /\bnon posso\b/i,
    /\bnon riesco\b/i,
    /\bnon sono in grado\b/i,
    /\bnon mi e'? consentito\b/i,
    /\bnon mi è consentito\b/i,
    /\bcannot\b/i,
    /\bcan'?t\b/i,
    /\bunable to\b/i,
    /\bnot allowed\b/i,
])

const ATTO_DI_SCRIVERE: readonly RegExp[] = Object.freeze([
    /\bcrear[ei]\b/i,
    /\bscriver[ei]\b/i,
    /\bsalvar[ei]\b/i,
    /\bdocument[oi]\b/i,
    /\bfile\b/i,
    /\bcreate\b/i,
    /\bwrite\b/i,
    /\bsave\b/i,
    /\bdocument\b/i,
])

function trova(testo: string, elenco: readonly RegExp[]): boolean {
    return elenco.some((forma) => forma.test(testo))
}

/**
 * Se in questo testo c'e' un rifiuto di permesso.
 *
 * Esportata perche' e' la regola, non un dettaglio: si prova da sola, al
 * dritto e al contrario, invece che solo attraverso l'esito complessivo.
 */
export function talosResearchPermissionRefusal(text: string | null | undefined): boolean {
    if (!text) return false
    if (trova(text, PERMESSO_NOMINATO)) return true
    return trova(text, IMPOTENZA) && trova(text, ATTO_DI_SCRIVERE)
}

export interface TalosResearchCompletionInput {
    /**
     * Dove il rapporto dovrebbe stare, se un passo di sintesi l'ha scritto.
     *
     * `null` e' un fatto diverso da «c'e' ma non si legge», ed e' la ragione per
     * cui viaggia separato dal testo: un rapporto mai scritto e uno scritto male
     * si riparano con due mosse diverse.
     */
    readonly reportRef: string | null
    /** Il documento del rapporto, quando e' stato possibile leggerlo dal magazzino. */
    readonly report: string | null
    /**
     * Quello che la corsa ha lasciato detto: errori dei passi, risultati degli
     * attrezzi. E' qui che si vede un permesso negato quando il rapporto tace.
     */
    readonly evidence?: readonly (string | null | undefined)[]
}

/**
 * Il record del rapporto, se e solo se REGGE.
 *
 * Regge vuol dire tre cose insieme: si rilegge (`talosResearchParseReport` gia'
 * torna `null` invece di un recupero parziale), porta almeno un'affermazione e
 * porta almeno una fonte. Il tetto e' `>= 1` e non zero perche' un rapporto con
 * zero affermazioni non e' un rapporto breve: e' una corsa che non ha prodotto
 * niente e lo sta dichiarando come risultato.
 */
export function talosResearchReportHolds(document: string | null): boolean {
    if (!document) return false
    const record = talosResearchParseReport(document)
    if (!record) return false
    return record.claims.length >= 1 && record.sources.length >= 1
}

/**
 * Come e' finita, guardando l'artefatto e non lo stato dichiarato.
 *
 * L'ordine delle domande e' il contenuto della funzione:
 *
 *  1. il rapporto REGGE? allora e' conclusa, e nient'altro conta — nemmeno un
 *     testo che nomina i permessi, perche' il record vince sulla prosa;
 *  2. c'e' un rifiuto di permesso fra le prove? quella e' la CAUSA, e viene
 *     prima della descrizione dell'effetto;
 *  3. il rapporto non e' mai stato scritto? allora la corsa si e' fermata prima
 *     di arrivarci: `giri-esauriti`;
 *  4. altrimenti c'e' un file e non si rilegge: `senza-rapporto`.
 */
export function talosResearchCompletionOf(input: TalosResearchCompletionInput): TalosResearchCompletion {
    if (talosResearchReportHolds(input.report)) return 'con-rapporto'

    const prove = [input.report, ...(input.evidence ?? [])]
    if (prove.some((voce) => talosResearchPermissionRefusal(voce))) return 'bloccata-dal-permesso'

    if (!input.reportRef) return 'giri-esauriti'
    return 'senza-rapporto'
}

/**
 * Il cancello: si puo' scrivere `run_finished`?
 *
 * Una funzione sola con un nome che dice cosa decide, perche' e' il punto in cui
 * MB-1 morde: senza di lei «conclusa» resta una parola che il motore si concede
 * da solo. Additiva per costruzione — il motore la chiama, la macchina a stati
 * degli undici eventi non cambia di una riga.
 */
export function talosResearchMayFinish(input: TalosResearchCompletionInput): boolean {
    return talosResearchCompletionOf(input) === 'con-rapporto'
}
