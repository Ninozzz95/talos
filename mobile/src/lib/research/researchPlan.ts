import type { TalosResearchBranch, TalosResearchDepth } from '@/lib/research/researchRun'

/**
 * The plan, its cost, and the refusal to invent a number.
 *
 * R-2. Gemini shows a plan and lets it be edited, and that is as far as the
 * field goes: nobody tells you what the run will cost before it runs. With
 * BYOK the user is paying out of their own pocket, so saying it is not a
 * flourish — it is owed.
 *
 * The awkward part is that we are not allowed to know the price. Prices change,
 * and a price list baked into an APK is a lie with a release date on it — the
 * rule against static lists exists for exactly this. OpenRouter publishes
 * per-token rates in its own model list, which is a live source we may read;
 * the other providers publish nothing machine-readable at all.
 *
 * So the cost has two halves and they are treated differently. The WORK —
 * searches, pages, minutes, tokens — is arithmetic over the plan and is always
 * shown. The MONEY is shown only where a published price was actually
 * obtained, and where it was not, the answer is "not knowable from here"
 * rather than a plausible figure. A made-up price is worse than no price: it
 * would be believed.
 */

export interface TalosResearchDepthProfile {
    readonly depth: TalosResearchDepth
    /** How many lines of enquiry the plan opens by default. */
    readonly branches: number
    /** Sources the whole run expects to read. Spread across the branches. */
    readonly sources: number
    /** Rough wall-clock, for a user deciding whether to start now. */
    readonly minutes: number
}

/**
 * The three levels, with the numbers from the competitor measurements: OpenAI
 * reads 50–200 sources in 10–30 minutes, Gemini 30–150 in 5–15, Claude 20–100
 * in 5–20, Perplexity finishes in 2–4. These sit deliberately at the low end of
 * that range — this runs on a phone battery, not a datacentre.
 *
 * Defaults, not cages: the plan stays editable, which is the point of R-2.
 */
export const TALOS_RESEARCH_DEPTHS: Readonly<Record<TalosResearchDepth, TalosResearchDepthProfile>> = Object.freeze({
    quick: Object.freeze({ depth: 'quick', branches: 2, sources: 10, minutes: 3 }),
    deep: Object.freeze({ depth: 'deep', branches: 4, sources: 30, minutes: 10 }),
    exhaustive: Object.freeze({ depth: 'exhaustive', branches: 6, sources: 80, minutes: 25 }),
})

/**
 * How much text one source costs to take in.
 *
 * A page that has been stripped to its readable part is a few thousand words;
 * at roughly four characters to a token that lands near this figure. It is an
 * estimate and is labelled as one everywhere it surfaces — the real number is
 * only known once the page has been fetched.
 */
const TOKENS_PER_SOURCE = 1_500

/** What the strong model spends pulling one branch together at the end. */
const TOKENS_PER_BRANCH_SYNTHESIS = 2_000

/** The facets a question is opened along, in the order they are worth opening. */
const FACETS: readonly string[] = [
    'fatti e numeri',
    'fonti contrarie',
    'chi lo dice e con quale interesse',
    'quanto è recente',
    'casi reali',
    'cosa resta incerto',
]

/**
 * A first plan for a question. The user is expected to change it.
 *
 * Branch questions are the question itself seen from a different side, because
 * a plan whose branches are paraphrases of each other spends four times to
 * learn one thing. The facets are ordered by how often they change an answer,
 * so a two-branch quick run gets the two that matter most.
 */
/**
 * Quante fonti per ramo regge un autore che gira SUL TELEFONO.
 *
 * Il rapporto si scrive leggendo tutte le fonti raccolte in un colpo solo,
 * quindi la profondita' non decide solo quanto si cerca: decide la lunghezza
 * del prompt finale. Misurato sul OnePlus Pad 3 il 2026-08-04 — dieci pagine
 * facevano 11009 token, e un 3B con quel prompt macinava mezz'ora senza
 * consegnare. Non e' un limite del contesto (quello e' 16384): e' il tempo.
 *
 * Il tetto e' sul TOTALE, non sul singolo ramo, e la differenza non e' un
 * dettaglio: la sintesi legge tutti i rami insieme. Col tetto per ramo,
 * «Esaustiva» restava a 39.000 token — sei rami da tre fonti — cioe' oltre il
 * doppio del contesto, esattamente il difetto che si voleva chiudere.
 *
 * Sei fonti in tutto tengono la sintesi in un prompt che un modello sul
 * dispositivo scrive in minuti, non in decine di minuti, a QUALSIASI
 * profondita'. Il numero e' basso di proposito: un rapporto che arriva vale
 * piu' di uno piu' ricco che non arriva.
 */
const TALOS_LOCAL_SOURCES_TOTAL = 6

export function talosResearchPlanFor(
    question: string,
    depth: TalosResearchDepth,
    /** L'autore gira sul dispositivo: il piano si adatta a lui. */
    localAuthor = false,
): readonly TalosResearchBranch[] {
    const profile = TALOS_RESEARCH_DEPTHS[depth]
    const chiesto = Math.max(1, Math.round(profile.sources / profile.branches))
    // Si ABBASSA soltanto: se la profondita' chiede gia' meno di cosi', quella
    // vince — nessuno ha chiesto di gonfiare una ricerca rapida.
    /*
     * Il totale si DISTRIBUISCE, non si divide e basta.
     *
     * Dividere e arrotondare per difetto perdeva fonti a ogni ramo: sei fonti
     * su quattro rami facevano uno per ramo, cioe' quattro — e sulle linguette
     * «Approfondita» mostrava 4 dove «Rapida» mostrava 6. Piu' profonda che
     * rende meno non e' una scelta discutibile: sembra rotta, e lo era.
     *
     * Il resto va ai primi rami, quindi il totale e' esatto a qualsiasi
     * profondita' e le linguette dicono tutte lo stesso numero.
     */
    const perBranch = localAuthor
        ? Math.max(1, Math.min(chiesto, Math.floor(TALOS_LOCAL_SOURCES_TOTAL / profile.branches)))
        : chiesto
    const avanzo = localAuthor && perBranch * profile.branches < TALOS_LOCAL_SOURCES_TOTAL
        ? Math.min(TALOS_LOCAL_SOURCES_TOTAL - perBranch * profile.branches, profile.branches)
        : 0
    return Array.from({ length: profile.branches }, (_, index) => ({
        id: `b${index + 1}`,
        question: `${question.trim()} — ${FACETS[index % FACETS.length]}`,
        estimate: {
            searches: 1,
            pages: perBranch + (index < avanzo ? 1 : 0),
            tokens: (perBranch + (index < avanzo ? 1 : 0)) * TOKENS_PER_SOURCE + TOKENS_PER_BRANCH_SYNTHESIS,
        },
    }))
}

export interface TalosResearchPlanTotals {
    readonly branches: number
    readonly searches: number
    readonly pages: number
    readonly tokens: number
    readonly minutes: number
}

/**
 * How long the whole thing takes, once the branches are known.
 *
 * A page costs about this much wall-clock to fetch and strip on a phone: the
 * network is most of it and the parsing is not free. Multiplied by the pages,
 * it is what the user is really deciding about when they choose a depth.
 */
const SECONDS_PER_PAGE = 6

export function talosResearchPlanTotals(plan: readonly TalosResearchBranch[]): TalosResearchPlanTotals {
    const totals = plan.reduce(
        (sum, branch) => ({
            searches: sum.searches + branch.estimate.searches,
            pages: sum.pages + branch.estimate.pages,
            tokens: sum.tokens + branch.estimate.tokens,
        }),
        { searches: 0, pages: 0, tokens: 0 },
    )
    return {
        branches: plan.length,
        ...totals,
        // Rounded UP, and never to zero for a plan that has work in it: a run
        // announced as "0 minutes" that takes forty seconds has lied about the
        // only thing the user asked.
        minutes: plan.length === 0 ? 0 : Math.max(1, Math.ceil((totals.pages * SECONDS_PER_PAGE) / 60)),
    }
}

/**
 * A price the PROVIDER published, per million tokens. Never assembled here.
 *
 * Split because the two rates differ by an order of magnitude on most models,
 * and a research run is lopsided: it reads far more than it writes, so using
 * one rate for both would misstate the total in whichever direction the model
 * happens to be priced.
 */
export interface TalosResearchPrice {
    readonly currency: string
    readonly promptPerMillion: number
    readonly completionPerMillion: number
}

export type TalosResearchCost =
    | { readonly known: true, readonly currency: string, readonly amount: number }
    /** No published price was obtained. NOT an error, and not a zero. */
    | { readonly known: false }

/**
 * What the run will cost, when that can be said at all.
 *
 * The share written versus read is not a guess pulled from nowhere: a research
 * run reads pages and writes a summary, so the output is a small fraction of
 * the input. Getting it wrong moves the estimate by a few percent; pretending
 * to know a price we were never told would move it from an estimate to a
 * fiction.
 */
const COMPLETION_SHARE = 0.15

export function talosResearchPlanCost(
    totals: TalosResearchPlanTotals,
    price: TalosResearchPrice | null,
): TalosResearchCost {
    if (!price) return { known: false }
    const completion = totals.tokens * COMPLETION_SHARE
    const prompt = totals.tokens - completion
    const amount = (prompt * price.promptPerMillion + completion * price.completionPerMillion) / 1_000_000
    return { known: true, currency: price.currency, amount }
}

/** Removing a line of enquiry. The ids of the others do not move. */
export function talosResearchPlanWithout(
    plan: readonly TalosResearchBranch[],
    branchId: string,
): readonly TalosResearchBranch[] {
    return plan.filter((branch) => branch.id !== branchId)
}

/**
 * Adding one, with an estimate borrowed from the plan it joins.
 *
 * A new branch costs what the others cost — that is what "one more of these"
 * means — and a plan whose branches carry wildly different estimates for the
 * same kind of work would make the total unreadable. The id is deliberately
 * not a counter over the current length: removing b2 and then adding one would
 * produce a second b2, and a duplicate id is a step that overwrites another's
 * place in the journal.
 */
export function talosResearchPlanWith(
    plan: readonly TalosResearchBranch[],
    question: string,
    depth: TalosResearchDepth,
): readonly TalosResearchBranch[] {
    const highest = plan.reduce((top, branch) => {
        const parsed = Number.parseInt(branch.id.replace(/^b/, ''), 10)
        return Number.isFinite(parsed) && parsed > top ? parsed : top
    }, 0)
    const template = plan[0]?.estimate ?? talosResearchPlanFor(question, depth)[0]!.estimate
    return [...plan, { id: `b${highest + 1}`, question: question.trim(), estimate: template }]
}

/** Rewording one. The estimate does not change: the work is the same shape. */
export function talosResearchPlanReworded(
    plan: readonly TalosResearchBranch[],
    branchId: string,
    question: string,
): readonly TalosResearchBranch[] {
    return plan.map((branch) => (
        branch.id === branchId ? { ...branch, question: question.trim() } : branch
    ))
}

/**
 * Quanto DEVE LEGGERE IN UNA VOLTA chi scrive il rapporto.
 *
 * Non e' il totale della ricerca — quello comprende le ricerche e le sintesi
 * per ramo, che sono chiamate separate. Il prompt finale porta il testo di
 * tutte le fonti raccolte, e basta.
 *
 * La differenza conta perche' e' quella che un avviso mostra all'utente: dire
 * 21.000 quando il modello ne legge 9.000 e' una cifra plausibile invece che
 * vera, ed e' esattamente cio' che la disciplina sul costo vieta.
 */
export function talosResearchSynthesisLoad(plan: readonly TalosResearchBranch[]): number {
    return plan.reduce((sum, branch) => sum + branch.estimate.pages, 0) * TOKENS_PER_SOURCE
}
