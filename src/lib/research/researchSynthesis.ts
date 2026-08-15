import type { TalosResearchCollection, TalosResearchSource } from '@/lib/research/researchCollector'

/**
 * Turning what was gathered into a report whose citations can be checked.
 *
 * The second half of R-3, and the half that decides whether R-4 is possible at
 * all. The field's measured failure is not that models cite too little — it is
 * that what they cite cannot be verified: an answer scores 0.94 for looking
 * grounded and 0.61 for actually being supported by the source it names, and
 * every product ships the first number. Hallucinated citations run between 11%
 * and 57% depending on who is counting.
 *
 * So the output shape is not prose with footnotes. Every claim carries the id
 * of the source it rests on AND the passage it rests on, which is the structure
 * the field settled on in 2026 — and the passage is then checked, here, against
 * the text we kept when we read the page.
 *
 * That check is the whole reason the collector keeps the text. It is
 * mechanical, free, involves no model and has no opinion, and it catches the
 * worst category on its own: the quotation that was never on the page. What it
 * cannot judge — whether a real passage actually SUPPORTS the claim — is left
 * to R-4 and to a different model from the one that wrote the report, because
 * the author is the worst possible judge of their own citation.
 *
 * Nothing that fails is hidden. A claim whose quotation is not in the source is
 * marked `unsupported` and still shown, because a report that quietly drops its
 * weakest claims tells the reader it had none.
 */

export interface TalosResearchClaim {
    readonly text: string
    /** The source this rests on, by the number the prompt gave it. */
    readonly sourceIndex: number
    /** The passage the model says supports it, verbatim. */
    readonly quote: string
    /**
     * L2, decided here and now: is that passage actually in the text we kept?
     *
     * `unchecked` means there was no source to check against — a claim citing a
     * number nobody handed out. It is not a pass.
     */
    readonly quotePresent: 'yes' | 'no' | 'unchecked'
}

export interface TalosResearchReport {
    readonly summary: string
    readonly claims: readonly TalosResearchClaim[]
    /** Sources in the order the prompt numbered them, so citations resolve. */
    readonly sources: readonly TalosResearchSource[]
}

/** How much of one source goes into the prompt. Beyond this it is padding. */
const PROMPT_CHARS_PER_SOURCE = 4_000

/**
 * The instruction, and the shape it demands.
 *
 * Written as a strict format rather than a request for good behaviour: "cite
 * your sources" produces plausible citations, and a schema produces checkable
 * ones. The model is told the passage will be verified mechanically, because a
 * model that knows the quotation is checked stops inventing quotations — and
 * because it is true, which is the better reason.
 */
export function talosResearchSynthesisPrompt(
    question: string,
    collections: readonly TalosResearchCollection[],
): { prompt: string, sources: readonly TalosResearchSource[] } {
    const sources = collections.flatMap((collection) => collection.sources)
    const catalogue = sources.map((source, index) => [
        `[${index + 1}] ${source.title}`,
        source.url,
        source.publishedAt ? `data dichiarata: ${source.publishedAt}` : 'data non dichiarata',
        source.obtained === 'snippet' ? 'ATTENZIONE: solo estratto dal motore di ricerca' : '',
        source.text.slice(0, PROMPT_CHARS_PER_SOURCE),
    ].filter(Boolean).join('\n')).join('\n\n---\n\n')

    const prompt = [
        `Domanda: ${question}`,
        '',
        'Fonti raccolte, numerate:',
        '',
        catalogue,
        '',
        'Scrivi un rapporto rispettando ESATTAMENTE questo formato:',
        '',
        'SINTESI: una o due frasi che rispondono alla domanda.',
        '',
        // Written as an example rather than as a labelled placeholder because a
        // labelled one gets copied: a real run came back with six lines that
        // began with the word AFFERMAZIONE, and a report whose every claim is
        // the name of the field is worse than no report.
        'Poi una riga per ogni affermazione, in questa forma:',
        'affermazione | numero della fonte | "passaggio copiato dalla fonte"',
        '',
        'Per esempio:',
        'La torre è alta 96 metri | 3 | "la torre misura 96 metri dalla base"',
        '',
        'Regole:',
        '- scrivi l’affermazione vera e propria, non la parola «affermazione».',
        '- il passaggio deve essere copiato alla lettera dalla fonte che citi:',
        '  viene confrontato con il testo che abbiamo salvato, meccanicamente.',
        '- se le fonti non bastano a sostenere qualcosa, dillo invece di dedurlo.',
        '- niente affermazioni senza fonte.',
    ].join('\n')

    return { prompt, sources }
}

/** The field's own name, handed back instead of a claim. Never a claim. */
const PLACEHOLDER = /^[<\[(]?\s*(l['’]?\s*)?affermazione\s*(vera e propria)?\s*[>\])]?$/i

/**
 * R11 — a follow-up answered from what was already paid for.
 *
 * The same shape as the synthesis, because it must be checked the same way: a
 * follow-up whose citations nobody verified would be the weak link in an
 * otherwise verified dossier. What changes is the standing instruction — no
 * search is happening, so the sources are all there will ever be, and the model
 * is told to say so rather than fill the gap from memory.
 *
 * With everything already on disk this costs one model call and no network for
 * the sources; on the device's own engine it costs nothing at all. Elsewhere a
 * follow-up starts the whole research again.
 */
export function talosResearchFollowUpPrompt(
    question: string,
    collections: readonly TalosResearchCollection[],
): { prompt: string, sources: readonly TalosResearchSource[] } {
    const built = talosResearchSynthesisPrompt(question, collections)
    return {
        sources: built.sources,
        prompt: [
            'Queste sono le fonti già raccolte in una ricerca precedente.',
            'NON è stata fatta nessuna ricerca nuova e non ce ne sarà: quello che',
            'c’è qui sotto è tutto quello che esiste.',
            '',
            built.prompt,
            '',
            '- se queste fonti non rispondono alla domanda, scrivilo nella SINTESI',
            '  invece di rispondere da quello che sai: qui si risponde solo con le fonti.',
        ].join('\n'),
    }
}

/** Whitespace and quote marks differ between a page and a model. Meaning does not. */
function comparable(text: string): string {
    return text
        .replace(/[‘’“”]/g, (mark) => (mark === '‘' || mark === '’' ? "'" : '"'))
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase()
}

/**
 * Reads the model's answer, and checks every quotation while doing it.
 *
 * Lines that do not fit the format are ignored rather than rescued: a parser
 * that guesses what a malformed citation meant is a parser that invents
 * attributions, which is the failure this whole file is aimed at.
 */
export function talosResearchParseSynthesis(
    answer: string,
    sources: readonly TalosResearchSource[],
): TalosResearchReport {
    const lines = answer.split('\n').map((line) => line.trim()).filter(Boolean)
    const summary = lines
        .find((line) => line.toUpperCase().startsWith('SINTESI:'))
        ?.slice('SINTESI:'.length)
        .trim() ?? ''

    const claims: TalosResearchClaim[] = []
    for (const line of lines) {
        const parts = line.split('|').map((part) => part.trim())
        if (parts.length < 3) continue
        const sourceIndex = Number.parseInt(parts[1]!.replace(/[^0-9]/g, ''), 10)
        if (!Number.isFinite(sourceIndex)) continue
        const quote = parts.slice(2).join('|').replace(/^["“]|["”]$/g, '').trim()
        if (parts[0]!.length === 0 || quote.length === 0) continue
        // The template, echoed back. Seen on a real run: every line began with
        // the word AFFERMAZIONE, and the report filed six claims each of which
        // was the name of the field. Dropped rather than shown, which leaves
        // the synthesis with nothing and makes the step fail — the honest
        // outcome, because nothing was actually claimed.
        if (PLACEHOLDER.test(parts[0]!)) continue

        const source = sources[sourceIndex - 1]
        claims.push({
            text: parts[0]!,
            sourceIndex,
            quote,
            // The check the kept text pays for. No model, no opinion, no cost.
            quotePresent: !source
                ? 'unchecked'
                : comparable(source.text).includes(comparable(quote)) ? 'yes' : 'no',
        })
    }

    return { summary, claims, sources }
}

/** What the reader is owed up front: how much of this held up. */
export function talosResearchReportStanding(report: TalosResearchReport): {
    readonly total: number
    readonly supported: number
    readonly unsupported: number
} {
    return {
        total: report.claims.length,
        supported: report.claims.filter((claim) => claim.quotePresent === 'yes').length,
        // `unchecked` counts here, not as a pass: a claim citing a source
        // nobody handed out is not a claim that survived a check.
        unsupported: report.claims.filter((claim) => claim.quotePresent !== 'yes').length,
    }
}
