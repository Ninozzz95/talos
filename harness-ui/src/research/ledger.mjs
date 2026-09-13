import { talosResearchDuration } from './outline.mjs'

/*
 * PORTO FEDELE di AVM/mobile/src/lib/research/researchLedger.ts (162 righe, 11/09/2026).
 *
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

/**
 * @import { TalosResearchStep, TalosResearchStepKind, TalosResearchStepState } from './run.mjs'
 */

/**
 * @typedef {object} TalosResearchLedgerEntry
 * @property {string} id
 * @property {TalosResearchStepKind} kind
 * @property {TalosResearchStepState} state
 * @property {string | null} duration Leggibile — «3 s», «1 min 07 s» — o `null` se non è finito.
 * @property {number} attempts Quante volte è stato avviato. Due tentativi non sono un tentativo.
 * @property {string | null} error
 */

/**
 * @typedef {object} TalosResearchLedgerSummary
 * @property {number} total
 * @property {number} search
 * @property {number} read ⛔ Pagine APERTE davvero, contate dalle fonti — non passi `read`.
 * @property {number} synthesise
 * @property {number} verify ⛔ Affermazioni che un giudice ha guardato, contate dai verdetti.
 * @property {number} failed ⛔ A parte dagli altri: un lavoro incompleto va detto, non sommato.
 * @property {number} interrupted
 * @property {number} workedSeconds ⛔ Il tempo LAVORATO, non quello dall'inizio
 *   alla fine. Due passi da 3 s partiti insieme fanno 6 s di lavoro e 3 s di
 *   orologio. La persona l'attesa la conosce — l'ha vissuta; quello che non sa è
 *   quanto lavoro c'è dentro, ed è il numero che dice se un 100% è stato pagato.
 */

/**
 * @typedef {object} TalosResearchLedger
 * @property {TalosResearchLedgerSummary} summary
 * @property {readonly TalosResearchLedgerEntry[]} entries
 */

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
 *
 * @typedef {object} TalosResearchLedgerEvidence
 * @property {readonly { obtained?: 'page' | 'snippet' }[]} [sources] Le fonti raccolte: `obtained` dice se la pagina è stata APERTA.
 * @property {readonly { checks?: { judge?: string | null } }[]} [claims] Le affermazioni: `judge` non nullo vuol dire che qualcuno ha guardato.
 */

/**
 * I secondi fra due istanti, o `null` se manca un capo.
 * @param {string | null} from
 * @param {string | null} to
 * @returns {number | null}
 */
function secondi(from, to) {
    if (!from || !to) return null
    const inizio = Date.parse(from)
    const fine = Date.parse(to)
    if (Number.isNaN(inizio) || Number.isNaN(fine)) return null
    // Un tempo negativo è un orologio che è tornato indietro, non una durata.
    return Math.max(0, Math.round((fine - inizio) / 1000))
}

/**
 * @param {readonly TalosResearchStep[]} steps
 * @param {TalosResearchLedgerEvidence} [evidence]
 * @returns {TalosResearchLedger}
 */
export function talosResearchLedger(steps, evidence = {}) {
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

    /** @param {(step: TalosResearchStep) => boolean} predicato */
    const quanti = (predicato) => steps.filter(predicato).length

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
