import type { TalosResearchSource } from '@/lib/research/researchCollector'
import type { TalosResearchClaim } from '@/lib/research/researchSynthesis'
import {
    talosResearchOpposingCandidate,
    talosResearchParseOpposingVerdict,
} from '@/lib/research/researchOpposing'

/**
 * The three levels, and the refusal that holds them up.
 *
 * R-4. What the field actually measures, on deep research agents specifically
 * (arXiv 2605.06635): the link resolves more than 94% of the time, the source is
 * on-topic more than 80% of the time, and the source actually SUPPORTS the claim
 * between 39% and 77% of the time. So the dead link — the thing every product
 * checks — is not the problem. The problem is the live link that does not say
 * what the report claims it says. Worse: that accuracy falls by about 42% as an
 * agent goes from 2 retrievals to 150, meaning the deepest mode is the one whose
 * citations are least trustworthy, which is exactly backwards from what a reader
 * assumes.
 *
 * Hence the shape here:
 *
 *  L1  How the source was obtained. Recorded from the reading, not re-requested:
 *      a second fetch moments after the first only confirms what we just saw,
 *      and an HTTP status lies anyway (soft 404s answer 200 with an error page).
 *      The honest later question — "does it still say this?" — is R12's, and it
 *      is answerable only because we kept the text.
 *  L2  Is the passage really in the text we kept, and WHERE. Mechanical, free,
 *      no model, no opinion. It catches the worst category by itself: the
 *      quotation that was never on the page. The offsets are what let the report
 *      show the reader the exact span.
 *  L3  Does that passage support that claim. This costs a model, and it is
 *      judged one claim against one passage — never the report as a whole,
 *      because an off-the-shelf entailment scorer that reaches AUROC 0.90 on
 *      short claims collapses to 0.53 (chance) on long-form answers
 *      (arXiv 2606.23915). Granularity is not a detail; it is the difference
 *      between a check and a decoration.
 *
 * And the refusal: the model that wrote the claim never judges it. A model
 * evaluating its own output is up to 50% more likely to mark as satisfied a
 * criterion it actually failed (arXiv 2604.06996). A self-issued pass is worth
 * less than no pass at all, because it looks like one.
 */

/**
 * ⛔⛔ CONTESA-01 — «contesa» non è «parziale», e confonderle mente.
 *
 * - **parziale**: la fonte dice una parte di quello che si afferma. Una
 *   fonte, un verdetto a metà.
 * - **contesa**: una fonte dice di sì e un'altra dice di no. Due fonti, due
 *   verdetti opposti, e nessuna metà da nessuna parte.
 *
 * Registrarle come la stessa cosa lusinga il rapporto proprio dove è più
 * fragile: una contesa segnata «parziale» si legge come «quasi sostenuta»,
 * mentre vuol dire che il mondo non è d'accordo.
 *
 * ⛔ Ricerca del 2026-08-20: i conflitti sono di tre tipi distinti — nelle
 * prove, fra le fonti sulle prove, dentro la stessa fonte — e la pratica
 * concorde è mostrare **entrambe** le versioni col perché differiscono
 * (metodo, portata, data, disciplina). Non si media, e non si sceglie in
 * silenzio la più comoda.
 */
export type TalosResearchSupport = 'yes' | 'partial' | 'no' | 'unchecked' | 'contested'

/** Una fonte che dice il CONTRARIO, col suo passaggio: la scheda le affianca. */
export interface TalosResearchOpposing {
    readonly url: string
    readonly title: string
    /** Il passaggio come sta nella fonte, non come il modello lo ha riscritto. */
    readonly passage: string
    readonly span: TalosResearchSpan | null
}

/** Where the passage sits in the kept text, so the reader can be shown it. */
export interface TalosResearchSpan {
    readonly from: number
    readonly to: number
}

/** Enough to tell two judges apart, and to recognise the author among them. */
export interface TalosResearchJudgeIdentity {
    readonly id: string
    readonly provider: string
    readonly model: string
}

export interface TalosResearchChecks {
    /** L1: read from the page, taken from a search snippet, or cited into thin air. */
    readonly resolved: 'page' | 'snippet' | 'missing'
    /** L2 */
    readonly quotePresent: boolean
    readonly quoteSpan: TalosResearchSpan | null
    /** L3 */
    readonly claimSupported: TalosResearchSupport
    readonly supportReason: string
    /** Who returned the verdict, and when. Null when nobody did — and why is in the reason. */
    readonly judge: string | null
    readonly judgedAt: string | null
    /**
     * ⛔ CONTESA-01 — le fonti che dicono il contrario, col loro passaggio.
     *
     * Opzionale perché una verifica vecchia non le ha: assente vuol dire
     * «non guardato», non «non ce ne sono». Le due cose si leggono uguali
     * solo se non ti importa di sbagliare.
     */
    readonly opposing?: readonly TalosResearchOpposing[]
}

export interface TalosResearchVerifiedClaim {
    readonly claim: TalosResearchClaim
    /** The passage as it is in the source, not as the model retyped it. */
    readonly passage: string
    readonly checks: TalosResearchChecks
}

export interface TalosResearchVerifyDeps {
    /** The independent judge, or null when there is none. Chosen by `talosResearchPickJudge`. */
    readonly judge: TalosResearchJudgeIdentity | null
    /**
     * Asks the judge about ONE claim and ONE passage.
     *
     * The signature is the isolation: there is no way to hand it the question,
     * the summary, or the other claims, because everything you add pushes the
     * answer towards "yes, that fits".
     */
    readonly ask: (claim: string, passage: string) => Promise<string>
    /**
     * ⛔ CONTESA-02 — chiede allo stesso giudice se un passaggio di
     * un’ALTRA fonte contraddice l’affermazione.
     *
     * Opzionale, e assente vuol dire «non guardato»: senza, il verdetto
     * resta quello di prima e `opposing` non c’è. È la stessa distinzione
     * che il campo `opposing` porta nella scheda — «non guardato» non è
     * «non ce ne sono», e le due cose si leggono uguali solo se non
     * importa sbagliare.
     */
    readonly askOpposing?: (claim: string, passage: string) => Promise<string>
    readonly at: () => string
}

/* -------------------------------------------------------------------------- */
/* L2                                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Normalises a text while remembering where every character came from.
 *
 * A page and a model disagree about whitespace and quote marks and agree about
 * meaning, so the comparison has to be loose. But the REPORT needs to point at
 * the original text, so a loose comparison that loses the position is useless.
 * Keeping the map is what makes "tap the citation, see the exact words" work.
 */
function mapped(text: string): { flat: string, at: { s: number, e: number }[] } {
    const out: string[] = []
    const at: { s: number, e: number }[] = []

    for (let index = 0; index < text.length;) {
        const char = text[index]!
        if (/\s/.test(char)) {
            let end = index
            while (end < text.length && /\s/.test(text[end]!)) end += 1
            out.push(' ')
            at.push({ s: index, e: end })
            index = end
            continue
        }

        const plain = char === '‘' || char === '’' ? "'"
            : char === '“' || char === '”' ? '"'
                : char.toLowerCase()
        // One source character can lower-case into several; they all point back
        // to the one character, so the offsets stay honest either way.
        for (const produced of plain) {
            out.push(produced)
            at.push({ s: index, e: index + 1 })
        }
        index += 1
    }

    return { flat: out.join(''), at }
}

/**
 * Finds the passage in the kept text and returns where it is, or null.
 *
 * Null is a real answer: the model quoted something that is not there. Nothing
 * here looks for the nearest similar sentence — a verifier that helpfully finds
 * an approximation is a verifier that manufactures attributions, which is the
 * exact failure this file exists to catch.
 */
export function talosResearchLocate(text: string, quote: string): TalosResearchSpan | null {
    const haystack = mapped(text)
    const needle = mapped(quote).flat.trim()
    if (needle.length === 0) return null

    const found = haystack.flat.indexOf(needle)
    if (found < 0) return null

    return {
        from: haystack.at[found]!.s,
        to: haystack.at[found + needle.length - 1]!.e,
    }
}

/* -------------------------------------------------------------------------- */
/* L3                                                                          */
/* -------------------------------------------------------------------------- */

/**
 * The judge, chosen by elimination: anyone but the author.
 *
 * Candidates come in the order the caller prefers — the on-device engine first,
 * because it costs nothing, needs no network, and belongs to nobody's family of
 * cloud models. If every candidate is the author, this returns null and the
 * claims go out marked `unchecked` with the reason written down. That is the
 * whole point: an unjudged claim is honest, a self-judged one is not.
 */
export function talosResearchPickJudge<T extends TalosResearchJudgeIdentity>(
    author: TalosResearchJudgeIdentity,
    // Generic so the caller keeps whatever it hung on the candidate — the model
    // object, the credentials — instead of picking a judge and then having to
    // look it up again by name, which is how the wrong one gets called.
    candidates: readonly T[],
): T | null {
    return candidates.find((candidate) => !(
        candidate.provider === author.provider && candidate.model === author.model
    )) ?? null
}

/**
 * Which houses to ask, and in what order.
 *
 * On-device first: free, offline, and related to no cloud model. Then any
 * provider that is not the author's, because self-preference is measured to
 * extend to a model's own family and not only to itself. The author's own
 * provider comes last, and is only ever reached with a different model — a real
 * but weaker independence, which is why the judge's name ends up in the report
 * for the reader to weigh.
 */
export function talosResearchJudgeOrder<P extends string>(
    authorProvider: P,
    providers: readonly P[],
    onDevice: P,
): readonly P[] {
    return [
        ...providers.filter((provider) => provider === onDevice),
        ...providers.filter((provider) => provider !== onDevice && provider !== authorProvider),
        ...providers.filter((provider) => provider !== onDevice && provider === authorProvider),
    ]
}

/**
 * What the judge is asked, and nothing else.
 *
 * The instruction to use only the passage is the load-bearing line: without it
 * the model answers from what it already knows, and a claim that happens to be
 * true collects a pass from a passage that never said it — which is precisely
 * the failure a citation check is supposed to catch.
 */
export function talosResearchJudgePrompt(claim: string, passage: string): string {
    return [
        'Passaggio, copiato dalla fonte:',
        '"""',
        passage,
        '"""',
        '',
        'Affermazione da verificare:',
        claim,
        '',
        'Il passaggio, DA SOLO, sostiene l’affermazione?',
        'Non usare altro: né quello che sai, né quello che ti sembra probabile.',
        '',
        // ⛔⛔ IL MENU CON LE BARRE lo faceva RICOPIARE.
        //
        //   MISURATO sul Pad il 2026-08-20 con gemma-3-4b come giudice: la
        //   risposta arrivava come «Sì | PARZIALE | Il passaggio indica che…»,
        //   cioè due voci del menu invece di una. Il parser prendeva la prima
        //   e quei rapporti risultavano al 100%: erano verdetti che il giudice
        //   non aveva dato.
        //
        //   ⇒ Le tre parole si elencano una per riga, senza barre, e si mostra
        //   com’è fatta una risposta buona. Non c’è più niente da ricopiare.
        'Rispondi con UNA riga sola. Comincia con UNA di queste tre parole:',
        'SI',
        'PARZIALE',
        'NO',
        'Poi un trattino e il motivo, massimo quindici parole.',
        '',
        'Esempio di risposta: SI — il passaggio lo dice testualmente.',
        '',
        'PARZIALE significa: il passaggio riguarda l’argomento ma non sostiene',
        'tutta l’affermazione (per esempio ne sostiene il fatto ma non la misura).',
    ].join('\n')
}

/**
 * `\b` is no use here: Italian verdicts end in accented letters, which JavaScript
 * does not count as word characters, so "Sì" would fail a word-boundary test.
 */
/**
 * ⛔ Le barre in testa si saltano: un modello che risponde «| PARZIALE |
 * motivo» ha dato il verdetto, con addosso la punteggiatura del menu.
 */
const VERDICT = /^[\s|]*(s[iì]|parziale|no)(?![\p{L}\p{N}])/iu

/** Un pezzo che è SOLO una parola di verdetto, senza niente attorno. */
const SOLO_VERDETTO = /^\s*(s[iì]|parziale|no)\s*$/iu

/**
 * Reads the verdict, or admits there wasn't one.
 *
 * An answer that does not parse is `unchecked`, never a pass. The alternative —
 * treating a confused answer as agreement — would put a verified mark on the
 * claims the judge found hardest, which is the worst possible place for it.
 */
export function talosResearchParseVerdict(answer: string): { support: TalosResearchSupport, reason: string } {
    for (const line of answer.split('\n')) {
        const match = VERDICT.exec(line)
        if (!match) continue

        /**
         * ⛔⛔ IL MENU RICOPIATO non è una scelta.
         *
         * MISURATO sul Pad il 2026-08-20: il giudice ha risposto «Sì |
         * PARZIALE | Il passaggio indica che…», cioè ha ricopiato due voci
         * del formato invece di sceglierne una. Il parser prendeva la prima
         * e attaccava il resto — barre comprese — come «motivo»: a schermo
         * si leggeva «contesa» sopra e «| PARZIALE |» sotto, due parole
         * diverse per lo stesso stato, e il verdetto era il più generoso
         * dei due.
         *
         * ⇒ Due voci del menu in una riga = nessun verdetto. Sceglierne una
         * al posto suo sarebbe inventare la parte che non ha detto.
         */
        const pezzi = line.split('|').map((pezzo) => pezzo.trim())
        if (pezzi.filter((pezzo) => SOLO_VERDETTO.test(pezzo)).length >= 2) {
            return { support: 'unchecked', reason: '' }
        }

        const word = match[1]!.toLowerCase()
        return {
            support: word === 'parziale' ? 'partial' : word === 'no' ? 'no' : 'yes',
            // La barra sta fra i separatori: «SI | motivo» è la stessa cosa
            // di «SI — motivo», e la barra non è parte del motivo.
            reason: line.slice(match[0].length).replace(/^[\s|—–\-:,.]+/, '').trim(),
        }
    }
    return { support: 'unchecked', reason: '' }
}

/* -------------------------------------------------------------------------- */
/* The three levels together                                                   */
/* -------------------------------------------------------------------------- */

const NO_SOURCE = 'la fonte citata non esiste fra quelle raccolte'
const NO_QUOTE = 'il passaggio non è nel testo della fonte'
const NO_JUDGE = 'nessun giudice indipendente disponibile: l’autore non può verificare sé stesso'

/**
 * Runs the three levels over every claim.
 *
 * SEQUENTIALLY, and not by accident: the on-device engine answers one request at
 * a time and refuses the second, so a verification that fanned out would fail
 * every claim but the first — on the very judge that costs nothing and is
 * therefore the default.
 *
 * L3 is skipped when L2 failed. Asking a model whether an invented passage
 * supports a claim is asking it about something that is not evidence; the
 * citation is already broken, and paying to have it discussed would only produce
 * a second opinion about a fabrication.
 */
/**
 * Cerca chi dice il contrario, e chiede al giudice se lo dice davvero.
 *
 * ⛔ UNA sola candidata per affermazione: è una chiamata al giudice in più,
 * e sul motore del telefono le chiamate sono in fila. Cercarne tre
 * raddoppierebbe il tempo di un rapporto per trovare, quasi sempre, la
 * stessa cosa.
 *
 * ⛔ E un guasto qui NON porta via l’affermazione: torna vuoto, il verdetto
 * resta quello del primo giro. Una contesa che non si è potuta cercare non
 * è una contesa che non c’è, ma è comunque meglio di un rapporto perso.
 */
async function contrarie(
    deps: TalosResearchVerifyDeps,
    claim: TalosResearchClaim,
    sources: readonly TalosResearchSource[],
    support: TalosResearchSupport,
    /** Quello che il giudice ha appena approvato: chi lo ripete non lo nega. */
    passage: string,
): Promise<readonly TalosResearchOpposing[]> {
    // La contesa è disaccordo: senza un accordo prima non c’è niente con cui
    // essere in disaccordo, e chiedere costerebbe per nulla.
    if (!deps.askOpposing) return []
    if (support !== 'yes' && support !== 'partial') return []

    const candidata = talosResearchOpposingCandidate(claim.text, claim.sourceIndex - 1, sources, passage)
    if (!candidata) return []

    try {
        const risposta = await deps.askOpposing(claim.text, candidata.passage)
        if (!talosResearchParseOpposingVerdict(risposta)) return []
        return [{
            url: candidata.url,
            title: candidata.title,
            passage: candidata.passage,
            span: candidata.span,
        }]
    } catch {
        return []
    }
}

export async function talosResearchVerify(
    deps: TalosResearchVerifyDeps,
    claims: readonly TalosResearchClaim[],
    sources: readonly TalosResearchSource[],
): Promise<readonly TalosResearchVerifiedClaim[]> {
    const verified: TalosResearchVerifiedClaim[] = []

    for (const claim of claims) {
        const source = sources[claim.sourceIndex - 1]
        const span = source ? talosResearchLocate(source.text, claim.quote) : null
        const passage = source && span ? source.text.slice(span.from, span.to) : ''

        const base = {
            resolved: (source ? source.obtained : 'missing') as TalosResearchChecks['resolved'],
            quotePresent: span !== null,
            quoteSpan: span,
        }

        if (!source || !span) {
            verified.push({
                claim,
                passage,
                checks: {
                    ...base,
                    claimSupported: 'unchecked',
                    supportReason: source ? NO_QUOTE : NO_SOURCE,
                    judge: null,
                    judgedAt: null,
                },
            })
            continue
        }

        if (!deps.judge) {
            verified.push({
                claim,
                passage,
                checks: { ...base, claimSupported: 'unchecked', supportReason: NO_JUDGE, judge: null, judgedAt: null },
            })
            continue
        }

        try {
            // The passage sent is the one cut out of the source, so a model
            // cannot get a doctored quotation past the check that reads it.
            const verdict = talosResearchParseVerdict(await deps.ask(claim.text, passage))
            const judged = verdict.support !== 'unchecked'
            const opposing = judged ? await contrarie(deps, claim, sources, verdict.support, passage) : []
            verified.push({
                claim,
                passage,
                checks: {
                    ...base,
                    // ⛔ La contesa NON sostituisce il verdetto a mano: la regola
                    //   («era un sì o un in parte, e qualcuno dice di no») sta in
                    //   un posto solo, con i suoi test.
                    claimSupported: talosResearchContestedVerdict(verdict.support, opposing),
                    supportReason: judged ? verdict.reason : 'il giudice non ha dato un verdetto leggibile',
                    judge: judged ? deps.judge.id : null,
                    judgedAt: judged ? deps.at() : null,
                    ...(opposing.length ? { opposing } : {}),
                },
            })
        } catch (failure) {
            // One judge that falls over must not take the report with it: the
            // other claims are still checkable, and this one says why it isn't.
            verified.push({
                claim,
                passage,
                checks: {
                    ...base,
                    claimSupported: 'unchecked',
                    supportReason: failure instanceof Error ? failure.message : 'il giudice non ha risposto',
                    judge: null,
                    judgedAt: null,
                },
            })
        }
    }

    return verified
}

/** The line at the top of the report: how much of this actually held up. */
/**
 * ⛔ CONTESA-01 — il verdetto FINALE, dopo aver guardato anche le contrarie.
 *
 * Contesa vuol dire **disaccordo**, e il disaccordo esiste solo se il
 * giudice aveva detto di sì (o in parte) e qualcuno dice di no. Se il
 * giudice ha già detto «no», una fonte contraria non è un conflitto: è la
 * stessa cosa detta due volte, e chiamarla contesa toglierebbe forza a un
 * «no» che invece è solido.
 *
 * ⛔ E una NON verificata non diventa contesa: se nessuno ha giudicato non
 * c'è niente con cui l'altra fonte possa essere in disaccordo.
 */
export function talosResearchContestedVerdict(
    support: TalosResearchSupport,
    opposing: readonly TalosResearchOpposing[] | undefined,
): TalosResearchSupport {
    if (!opposing?.length) return support
    return support === 'yes' || support === 'partial' ? 'contested' : support
}

export function talosResearchVerifiedStanding(claims: readonly TalosResearchVerifiedClaim[]): {
    readonly total: number
    readonly supported: number
    readonly partial: number
    readonly unsupported: number
    readonly unchecked: number
    /** ⛔ CONTESA-01: a parte, mai dentro le parziali né dentro le sostenute. */
    readonly contested: number
} {
    const count = (support: TalosResearchSupport) =>
        claims.filter((entry) => entry.checks.claimSupported === support).length

    return {
        total: claims.length,
        supported: count('yes'),
        partial: count('partial'),
        unsupported: count('no'),
        // Kept apart from `unsupported` on purpose: "we could not check this"
        // and "we checked, and the source does not say it" are different
        // admissions, and merging them would flatter the second.
        unchecked: count('unchecked'),
        // ⛔ E la contesa sta fuori da tutte e tre: non è una sostenuta con
        // una riserva, non è una parziale, e non è un'ammissione di non
        // sapere. È il mondo che non concorda, ed è un esito suo.
        contested: count('contested'),
    }
}
