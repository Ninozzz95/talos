import { talosResearchIsResting, talosResearchIsTerminal, talosResearchProgressOf } from './run.mjs'

/*
 * PORTO FEDELE di AVM/mobile/src/lib/research/researchCard.ts (211 righe, 11/09/2026).
 *
 * ⛔ `run.mjs` è il porto di `researchRun.ts` e lo cura un'altra sessione, in
 * parallelo: qui se ne importa solo il nome concordato.
 *
 * Che aspetto ha una ricerca da fuori, prima di aprirla.
 *
 * La stazione era un modulo con sotto un elenco di righe espandibili, e le
 * righe dicevano `3/3 · done`. Quella è la vista della macchina. Questa è
 * quella del lettore: che cosa ho chiesto, quando, com'è finita e — quando è
 * finita — **quanto regge**.
 *
 * L'ultima parte è tutto l'argomento. La ricerca sui concorrenti (2026-08-03)
 * ha trovato che tutti e cinque i prodotti guidano col volume — «56 siti»,
 * «hundreds of sources» — e nessuno dice se le affermazioni hanno retto. La sua
 * conclusione è che la vittoria non sono più citazioni, è un resoconto migliore
 * della relazione fra affermazione e prova. Quindi una scheda qui guida col
 * bilancio e mai col conteggio delle fonti.
 *
 * Pura apposta: una scheda è un riassunto, e un riassunto che ha bisogno di un
 * database è un riassunto che non si può provare.
 */

/**
 * @import { TalosResearchRun, TalosResearchStatus } from './run.mjs'
 */

/**
 * I secchi che il filtro offre. Una corsa sta in esattamente uno.
 * @typedef {'running' | 'paused' | 'unfinished' | 'cancelled' | 'done' | 'failed'} TalosResearchBucket
 */

/**
 * @typedef {object} TalosResearchStanding
 * @property {number} total
 * @property {number} supported
 * @property {number} partial
 * @property {number} unsupported
 * @property {number} unchecked
 * @property {number} [contested] ⛔ CONTESA-01 — le affermazioni su cui le fonti
 *   non concordano. Opzionale, e non per pigrizia: i rapporti scritti prima del
 *   2026-08-20 non hanno questo conto, e leggerlo come zero su un rapporto
 *   vecchio direbbe «nessun disaccordo» dove la verità è «non guardato». Chi lo
 *   mostra usa `?? 0` sapendo cosa sta facendo.
 */

/**
 * @typedef {object} TalosResearchCard
 * @property {string} id
 * @property {string} question Quello che l'elenco MOSTRA: l'etichetta scelta, o la domanda quando non ce n'è.
 * @property {string} originalQuestion La domanda come è stata posta, tenuta accanto all'etichetta perché la provenienza sopravviva a una rinomina.
 * @property {boolean} renamed Vero quando qualcuno ha dato un nome suo a questa ricerca.
 * @property {string} startedAt
 * @property {string} updatedAt
 * @property {TalosResearchBucket} bucket
 * @property {TalosResearchStatus} status La parola del giornale, che il secchio apposta sfuma.
 * @property {number} done
 * @property {number} total
 * @property {number} failedSteps Rami falliti, così una scheda può ammettere un risultato parziale invece di nasconderlo.
 * @property {TalosResearchStanding | null} standing Presente solo una volta letto il rapporto; l'elenco non lo aspetta.
 */

/**
 * In quale secchio sta una corsa.
 *
 * `running` lo decide il registro VIVO, non il giornale: una corsa che il
 * giornale chiama incompiuta può essere in volo proprio adesso, e chiamarla
 * interrotta mentre lavora è esattamente la bugia che questo rifacimento è
 * nato per togliere. Il giornale risponde a «che cosa è stato scritto», mai a
 * «che cosa sta succedendo».
 *
 * @param {TalosResearchRun} run
 * @param {boolean} isRunning
 * @returns {TalosResearchBucket}
 */
export function talosResearchBucketOf(run, isRunning) {
    if (isRunning) return 'running'
    if (run.status === 'failed') return 'failed'
    if (run.status === 'done') return 'done'
    // Annullata è una DECISIONE, come la pausa, e per la stessa ragione non sta
    // con le corse che il telefono ha ucciso. Peggio che disordinato: quelle
    // sono archiviate come «interrotte», il che promette che si possano
    // riprendere — e una ricerca annullata è l'unica cosa qui che non riparte mai.
    if (run.status === 'cancelled') return 'cancelled'
    // In pausa ha un secchio SUO, ed è il punto stesso della pausa: la persona
    // ha fermato apposta e conta di tornarci. Archiviarla accanto alle corse che
    // il telefono ha ucciso le direbbe che la sua decisione è stata un incidente.
    // `pause_requested` sta qui anche lui — è una pausa che non ha finito di
    // atterrare, non una situazione diversa per chi legge.
    if (talosResearchIsResting(run.status)) return 'paused'
    // Tutto il resto — planning, collecting, synthesising, verifying — è lavoro
    // che si è fermato senza finire. Un secchio solo, perché dal lato del
    // lettore sono la stessa situazione: deve qualcosa e non sta succedendo niente.
    return 'unfinished'
}

/**
 * @param {TalosResearchRun} run
 * @param {{ isRunning: boolean, standing?: TalosResearchStanding | null }} options
 * @returns {TalosResearchCard}
 */
export function talosResearchCardOf(run, options) {
    const progress = talosResearchProgressOf(run)
    return {
        id: run.id,
        question: run.title ?? run.question,
        originalQuestion: run.question,
        renamed: run.title !== null,
        startedAt: run.startedAt,
        updatedAt: run.updatedAt,
        bucket: talosResearchBucketOf(run, options.isRunning),
        status: run.status,
        done: progress.done,
        total: progress.total,
        failedSteps: run.steps.filter((step) => step.state === 'failed').length,
        standing: options.standing ?? null,
    }
}

/**
 * Quanto regge un rapporto finito, come un numero solo fra 0 e 1.
 *
 * Il sostegno parziale conta metà. Non è una furbizia: un'affermazione che la
 * fonte sostiene in parte sta davvero in mezzo, e arrotondarla a «sostenuta» è
 * il modo in cui un rapporto finisce per sembrare più solido di quanto sia —
 * che è il guasto che tutta la verifica esiste per impedire. Il non verificato
 * conta zero per la stessa ragione: «non siamo riusciti a controllare» non è
 * una promozione.
 *
 * ⛔ Una CONTESA vale zero, come una smentita, e la ragione è la stessa che
 * regge tutta questa funzione: se le fonti si contraddicono, quell'affermazione
 * non è una prova. Contarla anche solo per metà rifarebbe esattamente il
 * difetto che la verifica esiste per impedire — un rapporto che sembra più
 * solido di quanto sia.
 *
 * @param {TalosResearchStanding | null} standing
 * @returns {number | null}
 */
export function talosResearchSolidity(standing) {
    if (!standing || standing.total === 0) return null
    return (standing.supported + (standing.partial * 0.5)) / standing.total
}

/**
 * Se un rapporto finito merita un secondo sguardo.
 *
 * Qualsiasi cosa non sostenuta, o una solidità sotto due terzi. La soglia è un
 * giudizio, ed è scritta qui invece che sparsa in un modello di pagina, così la
 * si può contestare in un posto solo.
 *
 * @param {TalosResearchCard} card
 * @returns {boolean}
 */
export function talosResearchNeedsAttention(card) {
    if (card.failedSteps > 0) return true
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
 * Il file del rapporto che la sintesi ha scritto, quando ce n'è uno da leggere.
 *
 * Vive qui invece che in ogni schermata: l'elenco, la pagina del rapporto, la
 * pagina dell'affermazione e quella della fonte ne hanno tutte bisogno, e
 * quattro copie dello stesso `find` è il modo in cui cominciano a non essere
 * più d'accordo su che cosa conti come finito.
 *
 * @param {TalosResearchRun} run
 * @returns {string | null}
 */
export function talosResearchReportRefOf(run) {
    const synthesis = run.steps.find((step) => step.kind === 'synthesise' && step.state === 'done')
    return synthesis?.resultRef ?? null
}

/**
 * Il filtro, applicato. `all` è un secchio che la UI offre e che i dati non hanno mai.
 *
 * @param {readonly TalosResearchCard[]} cards
 * @param {TalosResearchBucket | 'all'} bucket
 * @param {string} query
 * @returns {readonly TalosResearchCard[]}
 */
export function talosResearchFilterCards(cards, bucket, query) {
    const needle = query.trim().toLowerCase()
    return cards.filter((card) => {
        if (bucket !== 'all' && card.bucket !== bucket) return false
        if (needle.length === 0) return true
        return card.question.toLowerCase().includes(needle)
    })
}

/**
 * Che cosa si può fare a questa ricerca, adesso.
 *
 * Un elenco invece di un insieme di voci disabilitate: quali azioni esistono è
 * un fatto sulla cosa, e un menu di opzioni morte fa lavorare il lettore per
 * capire perché siano morte. Una ricerca viva offre Pausa e Annulla; una in
 * pausa offre Riprendi; una annullata nessuna delle due, perché il motore si
 * rifiuta di guidare una corsa finita e far finta di sì sarebbe un pulsante che
 * mente.
 *
 * Elimina manca mentre gira, e non è schizzinosità: togliere il giornale da
 * sotto all'unico scrittore distruggerebbe l'unica prova che un passo già
 * mandato a un fornitore era stato pagato. Prima si ferma.
 *
 * @typedef {'open' | 'rename' | 'pause' | 'resume' | 'cancel' | 'delete'} TalosResearchAction
 */

/**
 * @param {TalosResearchCard} card
 * @returns {readonly TalosResearchAction[]}
 */
export function talosResearchActionsFor(card) {
    /** @type {TalosResearchAction[]} */
    const actions = ['open', 'rename']
    if (card.bucket === 'running') {
        actions.push('pause', 'cancel')
        // Niente elimina: vedi sopra.
        return actions
    }
    // In riposo o solo interrotta — entrambe devono ancora lavoro ed entrambe riprendono.
    if (!talosResearchIsTerminal(card.status)) actions.push('resume', 'cancel')
    actions.push('delete')
    return actions
}
