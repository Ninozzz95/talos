import { talosResearchDuration } from '@/lib/research/researchOutline'
import type { TalosResearchStep, TalosResearchStepKind, TalosResearchStepState } from '@/lib/research/researchRun'

/**
 * ⛔⛔ REGISTRO-01 — «Come è stato costruito», la sezione che mancava.
 *
 * ## Il difetto che chiude
 *
 * Una ricerca approfondita dura minuti e costa crediti. Alla fine la persona
 * legge un rapporto e una percentuale, e deve decidere se fidarsi **senza aver
 * visto niente di quello che è successo in mezzo**.
 *
 * ⛔ E non è trasparenza per bellezza: il numero dei passi e la loro durata
 * sono l'unica cosa che distingue una ricerca che ha davvero **letto** le
 * pagine da una che ha guardato quattro estratti. Due rapporti possono portare
 * lo stesso 100% e dietro avere lavori incomparabili — e oggi si leggono
 * uguali.
 *
 * ## La forma, dalla ricerca del 2026-08-20
 *
 * Il pattern concorde per gli agenti che lavorano a lungo è **sommario →
 * dettaglio → dati grezzi**: si riassume per tappe, si interrompe la persona
 * solo per ciò che decide, e il registro completo resta **a un clic**. Non
 * dieci righe sempre aperte — un sommario che si apre.
 *
 * ⇒ Qui escono le due cose insieme, così la schermata non ricalcola e non
 * decide: mostra.
 *
 * ⛔ Puro e senza I/O: i passi ce li ha già la corsa, e una sezione che
 * chiedesse qualcosa a disco o alla rete sarebbe in ritardo proprio mentre la
 * ricerca lavora.
 */

export interface TalosResearchLedgerEntry {
    readonly id: string
    readonly kind: TalosResearchStepKind
    readonly state: TalosResearchStepState
    /** Leggibile — «3 s», «1 min 07 s» — o `null` se non è finito. */
    readonly duration: string | null
    /** Quante volte è stato avviato. Due tentativi non sono un tentativo. */
    readonly attempts: number
    readonly error: string | null
}

export interface TalosResearchLedgerSummary {
    readonly total: number
    readonly search: number
    /** ⛔ Pagine APERTE davvero, contate dalle fonti — non passi `read`. */
    readonly read: number
    readonly synthesise: number
    /** ⛔ Affermazioni che un giudice ha guardato, contate dai verdetti. */
    readonly verify: number
    /** ⛔ A parte dagli altri: un lavoro incompleto va detto, non sommato. */
    readonly failed: number
    readonly interrupted: number
    /**
     * ⛔ Il tempo LAVORATO, non quello dall'inizio alla fine.
     *
     * Due passi da 3 s partiti insieme fanno 6 s di lavoro e 3 s di orologio.
     * La persona l'attesa la conosce — l'ha vissuta; quello che non sa è quanto
     * lavoro c'è dentro, ed è il numero che dice se un 100% è stato pagato.
     */
    readonly workedSeconds: number
}

export interface TalosResearchLedger {
    readonly summary: TalosResearchLedgerSummary
    readonly entries: readonly TalosResearchLedgerEntry[]
}

/**
 * ⛔⛔ LE PROVE, non i tipi di passo — e questa riga è nata da un errore MIO.
 *
 * La prima versione contava `kind === 'read'` e `kind === 'verify'`, e sul
 * Pad il 2026-08-20 ha scritto «3 passi · 2 ricerche · **0 pagine lette · 0
 * verifiche**» sotto un rapporto al 100% verificato da un giudice.
 *
 * MISURATO subito dopo, in `researchRuntime.ts`: il runtime emette **solo**
 * `search` e `synthesise`. `read` e `verify` non vengono creati mai — non
 * perché il lavoro non si faccia, ma perché avviene DENTRO quei due passi.
 * Il collettore apre le pagine (`obtained: 'page'`) e il giudice verifica
 * (`judge`, `judgedAt`): sono lì, con nome e ora.
 *
 * ⇒ Contare i tipi di passo faceva dire al registro una cosa falsa sul
 * lavoro — esattamente nel verso che questa sezione esiste per impedire, e
 * alla sua prima corsa vera. Si contano le **prove**: quante fonti sono
 * state aperte per davvero, quante affermazioni un giudice ha guardato.
 *
 * ⛔ Resta un buco vero, ma è un altro: le durate della lettura e della
 * verifica nessuno le registra, perché non hanno un passo loro. Il registro
 * dice quante, non quanto — e non finge di sapere il resto.
 */
export interface TalosResearchLedgerEvidence {
    /** Le fonti raccolte: `obtained` dice se la pagina è stata APERTA. */
    readonly sources?: readonly { readonly obtained?: 'page' | 'snippet' }[]
    /** Le affermazioni: `judge` non nullo vuol dire che qualcuno ha guardato. */
    readonly claims?: readonly { readonly checks?: { readonly judge?: string | null } }[]
}

/** I secondi fra due istanti, o `null` se manca un capo. */
function secondi(from: string | null, to: string | null): number | null {
    if (!from || !to) return null
    const inizio = Date.parse(from)
    const fine = Date.parse(to)
    if (Number.isNaN(inizio) || Number.isNaN(fine)) return null
    // Un tempo negativo è un orologio che è tornato indietro, non una durata.
    return Math.max(0, Math.round((fine - inizio) / 1000))
}

export function talosResearchLedger(
    steps: readonly TalosResearchStep[],
    evidence: TalosResearchLedgerEvidence = {},
): TalosResearchLedger {
    /*
     * ⛔ In ordine di ACCADIMENTO, non di identificativo.
     *
     * I rami partono in parallelo e gli id li assegna chi crea il piano: letti
     * per id, i passi raccontano una storia che non è successa. Chi non è mai
     * partito va in fondo — non ha un momento a cui appartenere.
     */
    const ordinati = [...steps].sort((a, b) => {
        const ta = a.startedAt ? Date.parse(a.startedAt) : Number.POSITIVE_INFINITY
        const tb = b.startedAt ? Date.parse(b.startedAt) : Number.POSITIVE_INFINITY
        return ta - tb
    })

    const entries = ordinati.map((step) => {
        const durata = secondi(step.startedAt, step.finishedAt)
        return {
            id: step.id,
            kind: step.kind,
            state: step.state,
            duration: durata === null ? null : talosResearchDuration(durata),
            attempts: step.attempts,
            error: step.error,
        }
    })

    const quanti = (predicato: (step: TalosResearchStep) => boolean) =>
        steps.filter(predicato).length

    return {
        summary: {
            total: steps.length,
            search: quanti((step) => step.kind === 'search'),
            // ⛔ Dalle PROVE, non dai tipi di passo. Vedi la nota sopra:
            // il runtime non emette mai `read` né `verify`, e contarli
            // faceva dire al registro «0 pagine lette» su un rapporto
            // costruito leggendo le pagine.
            read: (evidence.sources ?? []).filter((s) => s.obtained === 'page').length,
            synthesise: quanti((step) => step.kind === 'synthesise'),
            verify: (evidence.claims ?? []).filter((c) => Boolean(c.checks?.judge)).length,
            failed: quanti((step) => step.state === 'failed'),
            interrupted: quanti((step) => step.state === 'interrupted'),
            workedSeconds: steps.reduce(
                (somma, step) => somma + (secondi(step.startedAt, step.finishedAt) ?? 0),
                0,
            ),
        },
        entries,
    }
}
