import type { TalosResearchRun, TalosResearchStatus } from '@/lib/research/researchRun'
import {
    talosResearchIsResting,
    talosResearchIsTerminal,
    talosResearchProgressOf,
    talosResearchSourcesGathered,
    talosResearchWorkLeft,
} from '@/lib/research/researchRun'
import type { TalosResearchCompletion } from '@/lib/research/researchCompletion'

/**
 * What a research looks like from the outside, before you open it.
 *
 * The station used to be a form with a list of expandable rows underneath, and
 * the rows said `3/3 · done`. That is the machine's view. This is the reader's:
 * what did I ask, when, how did it end, and — when it ended — **how well does
 * it hold up**.
 *
 * The last part is the whole argument. The competitor research (2026-08-03)
 * found that all five products lead with volume — "56 siti", "hundreds of
 * sources" — and none of them says whether the claims stood. Its own conclusion
 * is that the win is not more citations, it is a better account of the relation
 * between claim and evidence. So a card here leads with the balance and never
 * with the source count.
 *
 * Pure on purpose: a card is a summary, and a summary that needs a database is
 * a summary you cannot test.
 */

/**
 * The buckets the filter offers. One run is in exactly one.
 *
 * ⛔ MB-1 (12/09/2026) — i sei secchi si ESTENDONO con tre, non si rinominano:
 * il desktop porta questo file tale e quale (§1.6 del disegno) e un nome
 * cambiato qui e' un nome rotto la'. I tre nuovi sono raffinamenti di `done`:
 * una corsa che il giornale dichiara conclusa ma il cui artefatto non regge non
 * e' conclusa, e dire in che modo non lo e' e' l'informazione che decide la
 * mossa successiva.
 */
export type TalosResearchBucket =
    | 'running' | 'paused' | 'unfinished' | 'cancelled' | 'done' | 'failed'
    | 'senza-rapporto' | 'bloccata-dal-permesso' | 'giri-esauriti'

export interface TalosResearchStanding {
    readonly total: number
    readonly supported: number
    readonly partial: number
    readonly unsupported: number
    readonly unchecked: number
    /**
     * ⛔ CONTESA-01 — le affermazioni su cui le fonti non concordano.
     *
     * Opzionale, e non per pigrizia: i rapporti scritti prima del
     * 2026-08-20 non hanno questo conto, e leggerlo come zero su un
     * rapporto vecchio direbbe «nessun disaccordo» dove la verità è
     * «non guardato». Chi lo mostra usa `?? 0` sapendo cosa sta facendo.
     */
    readonly contested?: number
}

export interface TalosResearchCard {
    readonly id: string
    /** What the list SHOWS: the chosen label, or the question when there is none. */
    readonly question: string
    /** The question as asked, kept beside the label so provenance survives a rename. */
    readonly originalQuestion: string
    /** True when someone named this research themselves. */
    readonly renamed: boolean
    readonly startedAt: string
    readonly updatedAt: string
    readonly bucket: TalosResearchBucket
    /** The journal's own word for it, which the bucket deliberately blurs. */
    readonly status: TalosResearchStatus
    readonly done: number
    readonly total: number
    /** Branches that failed, so a card can admit a partial result instead of hiding it. */
    readonly failedSteps: number
    /** Present only once the report has been read; the list does not wait for it. */
    readonly standing: TalosResearchStanding | null
    /**
     * Come e' finita davvero, quando l'artefatto e' stato guardato. (MB-1)
     *
     * `null` = non ancora guardato. Tenuto sulla scheda accanto al secchio e non
     * dedotto da esso, perche' sono due fatti: il secchio dice dove va nel
     * filtro, questo dice PERCHE' — e una scheda che mostra una diagnosi deve
     * poter dire di non averne ancora una.
     */
    readonly completion: TalosResearchCompletion | null
    /** Quante linee di indagine il piano prevede. Zero finché il piano non c'è. */
    readonly branches: number
    /**
     * Se le fonti sono già state raccolte — dal GIORNALE, non dal rapporto.
     *
     * ⛔ Due fatti diversi che la scheda confondeva (Pad, 12/09/2026, foto RC12):
     * `report` dice se c'è un rapporto da rileggere, questo dice se qualcuno ha
     * già pagato e scritto delle fonti. Una corsa che ha finito di raccogliere e
     * si è fermata sulla sintesi ha il secondo e non il primo — e la scheda,
     * leggendo solo il primo, annunciava «Fonti ancora da raccogliere» su un
     * lavoro già fatto.
     */
    readonly sourcesGathered: boolean
    /** La prima linea del piano, che è ciò che la scheda mostra finché non c'è un rapporto. */
    readonly firstBranch: string | null
    /**
     * Cosa dice il rapporto, quando è già stato letto. `null` = non ancora.
     *
     * Sta accanto a `standing` e non dentro, perché sono due domande diverse:
     * quello è il BILANCIO (quante reggono), questo è l'ANTEPRIMA (che cosa
     * c'è dentro). La scheda del mockup mostra tutte e due.
     */
    readonly report: TalosResearchCardReport | null
}

/** Una fonte come la scheda la mostra: un nome e da dove viene. */
export interface TalosResearchSourceBrief {
    readonly title: string
    /** Una pagina del web, o un materiale senza indirizzo. Decide l'icona. */
    readonly web: boolean
}

export interface TalosResearchCardReport {
    /** La prima affermazione: l'unica riga di sostanza che entra in una scheda. */
    readonly firstClaim: string | null
    readonly claims: number
    readonly sources: readonly TalosResearchSourceBrief[]
}

/**
 * Che cosa ha da dire questa scheda, in una riga.
 *
 * Una funzione sola perché la scheda e la riga dell'elenco devono raccontare la
 * stessa cosa nello stesso ordine: due copie di questa scala di priorità sono
 * il modo in cui la griglia e l'elenco cominciano a dire due cose diverse della
 * stessa ricerca.
 *
 * L'ordine è una scala di urgenza, non di ricchezza:
 *  1. si sta fermando — un tocco appena dato aspetta una risposta;
 *  2. sta lavorando — quanto manca;
 *  3. ⛔ MB-1: è finita e NON regge — è la cosa che va detta prima del bilancio,
 *     perché un bilancio calcolato su un rapporto che non si rilegge non esiste;
 *  4. il bilancio — quanto tiene, che è il differenziatore del prodotto;
 *  5. lo stato, quando non c'è altro.
 */
export type TalosResearchCardVoice =
    | { readonly kind: 'pausing' }
    | { readonly kind: 'running' }
    | { readonly kind: 'incomplete', readonly bucket: TalosResearchBucket }
    | { readonly kind: 'standing' }
    | { readonly kind: 'state' }

export function talosResearchCardVoice(card: TalosResearchCard): TalosResearchCardVoice {
    if (card.status === 'pause_requested') return { kind: 'pausing' }
    if (card.bucket === 'running') return { kind: 'running' }
    if (talosResearchBucketIsIncomplete(card.bucket)) return { kind: 'incomplete', bucket: card.bucket }
    if (card.standing && card.standing.total > 0) return { kind: 'standing' }
    return { kind: 'state' }
}

/**
 * Which bucket a run is in.
 *
 * `running` is decided by the LIVE registry, not by the journal: a run the
 * journal calls unfinished may be in flight right now, and calling it
 * interrupted while it is working is the exact lie this refactor set out to
 * remove. The journal answers "what has been written", never "what is
 * happening".
 */
export function talosResearchBucketOf(
    run: TalosResearchRun,
    isRunning: boolean,
    /**
     * Come e' finita davvero, guardando l'artefatto. (MB-1)
     *
     * Opzionale, e non per pigrizia: leggere il rapporto costa un accesso al
     * disco e la lista non lo aspetta — le righe compaiono subito e il verdetto
     * arriva dietro. Assente vuol dire «non ancora guardato», che e' diverso da
     * «guardato e non regge», e i due non devono somigliarsi.
     *
     * ⛔ Nessuno riscrive niente: la corsa su disco resta `done`, qui si decide
     * solo come RACCONTARLA. Cio' che e' costato denaro non si sovrascrive.
     */
    completion?: TalosResearchCompletion | null,
): TalosResearchBucket {
    if (isRunning) return 'running'
    if (run.status === 'failed') return 'failed'
    if (run.status === 'done') {
        if (completion && completion !== 'con-rapporto') return completion
        return 'done'
    }
    // Una corsa che NON e' terminale ma che ha gia' finito di raccogliere: e' il
    // caso nuovo, quello in cui il cancello di MB-1 ha trattenuto
    // `run_finished`. Dire «interrotta» qui nasconderebbe l'unica cosa che si
    // sa — perche' si e' fermata.
    //
    // ⛔ Il verdetto vale SOLO quando non resta lavoro di raccolta: una corsa
    // uccisa alla seconda linea su sei non ha un rapporto perche' non e' ancora
    // arrivata a scriverlo, e chiamarla «giri esauriti» sarebbe una diagnosi
    // inventata su una corsa sana. Interrotta e' la parola giusta, li'.
    //
    // ⛔ E nemmeno quando un passo e' FALLITO: misurato sul Pad il 12/09/2026,
    // la sintesi e' caduta su un `HTTP 401 User not found` di OpenRouter (la
    // chiave ruotata) e la scheda diceva «Riprendi: i giri sono finiti» — una
    // diagnosi inventata su un errore del provider, che la chat nello stesso
    // minuto raccontava per nome. Un passo `failed` porta gia' la sua causa
    // (`step.error`, mostrata nel rapporto): il verdetto sull'artefatto non
    // deve coprirla. Il 401 di OpenRouter con quel testo e' la chiave, non
    // il modello: github.com/anomalyco/opencode/issues/2245 (letto 12/09/2026).
    if (completion && completion !== 'con-rapporto'
        && !talosResearchIsResting(run.status)
        && talosResearchWorkLeft(run).length === 0
        && !run.steps.some((step) => step.state === 'failed')) {
        return completion
    }
    // Cancelled is a DECISION, like pausing, and for the same reason it does
    // not belong with the runs the phone killed. Worse than untidy: those are
    // filed as "interrupted", which promises they can be carried on — and a
    // cancelled research is the one thing here that never resumes.
    if (run.status === 'cancelled') return 'cancelled'
    // Paused is its OWN bucket, and that is the point of pausing: the person
    // stopped this on purpose and expects to come back to it. Filing it beside
    // the runs the phone killed would tell them their decision was an accident.
    // `pause_requested` sits here too — it is a pause that has not finished
    // landing, not a different situation for the reader.
    if (talosResearchIsResting(run.status)) return 'paused'
    // Everything else — planning, collecting, synthesising, verifying, cancelled
    // — is work that stopped without finishing. One bucket, because from the
    // reader's side they are the same situation: it owes something and nothing
    // is happening.
    return 'unfinished'
}

export function talosResearchCardOf(
    run: TalosResearchRun,
    options: {
        isRunning: boolean
        standing?: TalosResearchStanding | null
        /** MB-1: l'esito misurato sull'artefatto, quando e' gia' stato letto. */
        completion?: TalosResearchCompletion | null
        /** L'anteprima del rapporto, quando e' gia' stato letto. */
        report?: TalosResearchCardReport | null
    },
): TalosResearchCard {
    const progress = talosResearchProgressOf(run)
    const completion = options.completion ?? null
    return {
        id: run.id,
        question: run.title ?? run.question,
        originalQuestion: run.question,
        renamed: run.title !== null,
        startedAt: run.startedAt,
        updatedAt: run.updatedAt,
        bucket: talosResearchBucketOf(run, options.isRunning, completion),
        status: run.status,
        done: progress.done,
        total: progress.total,
        failedSteps: run.steps.filter((step) => step.state === 'failed').length,
        standing: options.standing ?? null,
        completion,
        branches: run.plan.length,
        sourcesGathered: talosResearchSourcesGathered(run),
        firstBranch: run.plan[0]?.question ?? null,
        report: options.report ?? null,
    }
}

/**
 * L'anteprima che la scheda mostra, ricavata dal record del rapporto.
 *
 * Il taglio a due fonti e' del mockup e non e' arbitrario: una scheda che
 * elenca dodici fonti non e' un'anteprima, e' l'indice del dossier con la
 * grafica sbagliata. Il numero intero resta nel piede.
 */
export function talosResearchCardReportOf(record: {
    readonly claims: readonly { readonly text: string }[]
    readonly sources: readonly { readonly title: string, readonly url: string }[]
}): TalosResearchCardReport {
    return {
        firstClaim: record.claims[0]?.text ?? null,
        claims: record.claims.length,
        sources: record.sources.map((source) => ({
            title: source.title,
            // Un indirizzo vero, non una stringa vuota: e' la differenza fra
            // una pagina aperta sul web e un materiale interno al dossier, e
            // decide quale delle due icone dice la verita'.
            web: source.url.trim().length > 0,
        })),
    }
}

/**
 * I tre secchi che dicono «conclusa, ma non regge». (MB-1)
 *
 * Una funzione invece di tre confronti sparsi: la lista, il filtro e la pagina
 * del rapporto devono concordare su che cosa conta come incompleto, e tre copie
 * dello stesso `includes` sono il modo in cui smettono di concordare.
 */
export function talosResearchBucketIsIncomplete(bucket: TalosResearchBucket): boolean {
    return bucket === 'senza-rapporto' || bucket === 'bloccata-dal-permesso' || bucket === 'giri-esauriti'
}

/**
 * How well a finished report holds up, as one number between 0 and 1.
 *
 * Partial support counts half. Not a hedge: a claim the source backs in part is
 * genuinely between the two, and rounding it up to "supported" is how a report
 * ends up looking stronger than it is — which is the failure mode the whole
 * verification exists to prevent. Unchecked counts as zero for the same reason:
 * "we could not check" is not a pass.
 */
/*
 * ⛔ Una CONTESA vale zero, come una smentita, e la ragione è la stessa
 * che regge tutta questa funzione: se le fonti si contraddicono, quella
 * affermazione non è una prova. Contarla anche solo per metà rifarebbe
 * esattamente il difetto che la verifica esiste per impedire — un rapporto
 * che sembra più solido di quanto sia.
 */
export function talosResearchSolidity(standing: TalosResearchStanding | null): number | null {
    if (!standing || standing.total === 0) return null
    return (standing.supported + (standing.partial * 0.5)) / standing.total
}

/**
 * Whether a finished report deserves a second look.
 *
 * Anything unsupported at all, or a solidity under two thirds. The threshold is
 * a judgement and it is written down here rather than scattered through a
 * template, so it can be argued with in one place.
 */
export function talosResearchNeedsAttention(card: TalosResearchCard): boolean {
    if (card.failedSteps > 0) return true
    // ⛔ MB-1: «conclusa» senza un artefatto che si rilegge e' il caso che
    // merita di piu' un secondo sguardo, ed era l'unico che passava inosservato
    // — perche' senza bilancio la scheda non aveva niente da segnalare.
    if (talosResearchBucketIsIncomplete(card.bucket)) return true
    if (!card.standing) return false
    if (card.standing.unsupported > 0) return true
    // ⛔ Anche UNA contesa merita un secondo sguardo: vuol dire che su quel
    // punto il mondo non concorda, ed è precisamente il caso in cui una
    // persona vuole leggere le fonti invece di fidarsi del riassunto.
    if ((card.standing.contested ?? 0) > 0) return true
    const solidity = talosResearchSolidity(card.standing)
    return solidity !== null && solidity < 2 / 3
}

/**
 * The report file the synthesis wrote, when there is one to read.
 *
 * Lives here rather than in each screen: the list, the report page, the claim
 * page and the source page all need it, and four copies of the same `find` is
 * how they start disagreeing about what counts as finished.
 */
export function talosResearchReportRefOf(run: TalosResearchRun): string | null {
    const synthesis = run.steps.find((step) => step.kind === 'synthesise' && step.state === 'done')
    return synthesis?.resultRef ?? null
}

/**
 * L'impronta di ciò da cui il VERDETTO dipende. (MB-1)
 *
 * ⛔ Misurato sul Pad il 12/09/2026 (foto RE5/RE6): una corsa conclusa col suo
 * rapporto — 26 affermazioni, «Il rapporto è pronto» — compariva nella stazione
 * come «Senza conclusione», e il filtro la contava lì. Dopo aver riaperto l'app
 * la stessa scheda diceva «Conclusa». Il verdetto era stato misurato DURANTE la
 * sintesi, quando il rapporto non esisteva ancora, e messo in cache per id: id
 * uguale, verdetto mai più guardato. Ricaricare l'app svuotava la cache, ed è
 * per questo che il secondo sguardo diceva il vero.
 *
 * ⇒ Una lettura si tiene finché vale, e vale finché la corsa è la stessa CORSA,
 * non finché ha lo stesso nome. Qui dentro c'è tutto ciò che può cambiare il
 * verdetto: lo stato, l'ultimo movimento del giornale e il rapporto su disco.
 * Una chiave che non li contiene è una cache che non scade mai.
 */
export function talosResearchVerdictKey(run: TalosResearchRun): string {
    return [run.id, run.status, run.updatedAt, talosResearchReportRefOf(run) ?? ''].join('|')
}

/** The filter, applied. `all` is a bucket the UI offers and the data never has. */
export function talosResearchFilterCards(
    cards: readonly TalosResearchCard[],
    bucket: TalosResearchBucket | 'all',
    query: string,
): readonly TalosResearchCard[] {
    const needle = query.trim().toLowerCase()
    return cards.filter((card) => {
        if (bucket !== 'all' && card.bucket !== bucket) return false
        if (needle.length === 0) return true
        return card.question.toLowerCase().includes(needle)
    })
}

/**
 * What can be done to this research, right now.
 *
 * A list rather than a set of disabled entries: which actions exist is a fact
 * about the thing, and a menu of dead options makes the reader work out why
 * they are dead. A running research offers Pause and Cancel; a paused one
 * offers Resume; a cancelled one offers neither, because the engine refuses to
 * drive a run that ended and pretending otherwise would be a button that lies.
 *
 * Delete is missing while it runs, and that is not squeamishness: removing the
 * journal from under the single writer would destroy the only record that a
 * step already sent to a provider had been paid for. Stop it first.
 */
export type TalosResearchAction = 'open' | 'rename' | 'pause' | 'resume' | 'cancel' | 'delete'

export function talosResearchActionsFor(card: TalosResearchCard): readonly TalosResearchAction[] {
    const actions: TalosResearchAction[] = ['open', 'rename']
    if (card.bucket === 'running') {
        actions.push('pause', 'cancel')
        // No delete: see above.
        return actions
    }
    // Resting or merely interrupted — both still owe work and both resume.
    if (!talosResearchIsTerminal(card.status)) actions.push('resume', 'cancel')
    actions.push('delete')
    return actions
}
