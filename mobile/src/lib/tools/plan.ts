import type { TalosToolAction } from '@/lib/tools/permissionTypes'
import type {
    TalosToolChainState,
    TalosToolReversibility,
    TalosToolRisk,
    TalosToolSecurity,
} from '@/lib/tools/security'
import { TALOS_EMPTY_CHAIN, talosAdvanceChain, talosEffectiveRisk } from '@/lib/tools/security'

/**
 * Il piano: quello che TALOS sta per fare, detto PRIMA di farlo.
 *
 * ## Perché esiste, e perché non è «una conferma più grande»
 *
 * Una conferma per tool arriva sempre **a metà**: hai già speso il tempo dei
 * primi tre passi quando il quarto ti chiede il permesso, e a quel punto dire
 * di no costa. Un piano ribalta il conto — niente è ancora stato toccato,
 * quindi **rifiutarlo costa zero**. È la lezione del plan mode di Claude Code,
 * ed è la ragione per cui un piano non è una conferma in più: è una conferma
 * *al posto* di quattro, spostata dove serve.
 *
 * ## ⛔ La soglia, e perché non è «più di un tool»
 *
 * Owner 2026-08-07, dopo la ricerca: il piano compare **sulla soglia di
 * rischio**, non sul numero di strumenti. La ragione è misurata e ha un nome —
 * *affaticamento da conferme*: alla cinquantesima richiesta il revisore tocca
 * «approva» prima di aver finito di leggere la frase, e venti richieste a basso
 * rischio all'ora bastano a far smettere di leggere. Una difesa che scatta
 * sempre viene spenta: è lo stesso difetto che la trifecta aveva prima di A8,
 * e sarebbe stupido riprodurlo nel piano il giorno dopo averlo curato.
 *
 * Quindi: «leggi questa nota e riassumila» parte. «Cerca sul web, scrivi un
 * PDF, mandalo in Libreria e cancella la bozza» si ferma e si mostra.
 *
 * ## Le altre tre regole, decise lo stesso giorno
 *
 * - **I passi si tolgono, non si riscrivono.** Chi toglie un passo dice «no» a
 *   quello e sì al resto. Non può cambiare gli argomenti: quelli restano del
 *   modello, che risponde di ciò che ha proposto — e una riga di audit deve
 *   poter dire chi ha scritto cosa.
 * - **Una deviazione ferma e ripropone.** Ciò che è già stato fatto resta
 *   fatto; per il resto serve una nuova approvazione. Un piano che cresce da
 *   solo mentre gira non è più il piano che hai letto.
 * - **L'approvazione si lega all'impronta degli argomenti.** Se cambiano fra la
 *   proposta e l'esecuzione, il permesso non vale più. Senza, un'iniezione che
 *   colpisce in quella finestra userebbe un consenso dato per altro.
 */

/** Il posto in cui un passo si trova, dal momento in cui viene proposto. */
export type TalosPlanStepState =
    /** Proposto e non ancora deciso. */
    | 'pending'
    /** L'utente l'ha tolto dal piano prima di approvare. */
    | 'removed'
    /** Escluso perché il permesso lo nega: non viene nemmeno mostrato come scelta. */
    | 'denied'
    | 'running'
    | 'done'
    | 'failed'

export interface TalosPlanStep {
    /** Stabile per tutta la vita del piano: la superficie lo usa come chiave. */
    id: string
    tool: string
    /** Il nome leggibile, quello della scheda di consenso. */
    title: string
    input: unknown
    /**
     * ⛔ L'impronta degli argomenti al momento della proposta.
     *
     * È ciò che rende l'approvazione una firma su QUESTA cosa e non
     * sull'intenzione. Al momento di eseguire si ricalcola e si confronta: se
     * non torna, il passo non parte e si richiede.
     */
    digest: string
    risk: TalosToolRisk
    reversibility: TalosToolReversibility
    actions: readonly TalosToolAction[]
    state: TalosPlanStepState
}

export type TalosPlanState = 'proposed' | 'approved' | 'running' | 'finished' | 'cancelled'

/**
 * ⛔ Fin dove arriva un'approvazione. Owner 2026-08-07: **una porta, non un muro**.
 *
 * ## Perché la seconda porta ha avuto bisogno di essere ridisegnata
 *
 * Con l'impronta esatta degli argomenti (decisione 4), un piano che sopravvive
 * al turno **non aprirebbe su niente**: il messaggio dopo ha argomenti diversi,
 * l'impronta non torna, e si richiede lo stesso. Sarebbe un interruttore che
 * non cambia nulla — cioè peggio di non averlo, perché la persona crede di aver
 * scelto qualcosa.
 *
 * Quindi in `conversation` l'impronta smette di essere il vincolo: conta che il
 * **tool** fosse nel piano. E al posto dell'impronta subentra un vincolo che
 * protegge di più, non di meno.
 *
 * ## Il vincolo che tiene onesta la porta aperta
 *
 * L'approvazione permanente **decade da sola nel momento in cui entra contenuto
 * non fidato**. Una pagina web, un documento scaricato, una nota che viene da
 * lì: da quel punto la catena è contaminata, il piano approvato non vale più, e
 * si richiede.
 *
 * È la stessa proprietà della trifecta, applicata alla durata di un consenso
 * invece che a una singola chiamata — e risolve il vero pericolo di un permesso
 * lungo: non è che duri, è che duri **attraverso** il momento in cui arriva
 * l'istruzione di qualcun altro.
 *
 * La porta si chiude quando la stanza diventa pericolosa, e la scheda lo dice
 * PRIMA di farla aprire.
 */
export type TalosPlanScope =
    /** Vale per questo messaggio. Argomenti esatti. È il predefinito. */
    | 'turn'
    /** Vale finché non entra contenuto non fidato. Argomenti liberi sui tool approvati. */
    | 'conversation'

export interface TalosPlan {
    id: string
    steps: readonly TalosPlanStep[]
    /** Il rischio del passo peggiore, catena inclusa. */
    risk: TalosToolRisk
    state: TalosPlanState
    /** Quanto **vive**: il messaggio, o la conversazione. */
    scope: TalosPlanScope
    /**
     * ⛔ Se gli argomenti devono corrispondere ESATTAMENTE.
     *
     * Separato dalla durata di proposito, perche' sono due assi e confonderli
     * produce difetti che si vedono solo dopo. La prima versione li teneva
     * insieme: un piano «per questa richiesta» — che deve morire col turno ma
     * accettare argomenti nuovi — non era esprimibile, e messo su
     * `conversation` per allentare l'impronta sarebbe **sopravvissuto al
     * turno**. Cioe' «per questa richiesta» sarebbe diventato «per sempre»: la
     * bugia peggiore che una scheda di consenso possa dire.
     *
     * ⛔ E c'e' un accoppiamento che non e' negoziabile: **un piano che NON
     * controlla gli argomenti deve decadere sulla contaminazione**. Se non
     * guardi cosa passa, devi almeno guardare da dove viene il discorso.
     */
    matchArguments: boolean
    /**
     * Com'era la catena quando l'utente ha approvato.
     *
     * Serve a una cosa sola e importante: accorgersi che da allora è entrato
     * contenuto non fidato, e far **decadere** l'approvazione permanente.
     */
    approvedChain: TalosToolChainState
}

/** Quello che serve sapere di una chiamata per metterla in un piano. */
export interface TalosPlanCandidate {
    id: string
    tool: string
    title: string
    input: unknown
    digest: string
    security: TalosToolSecurity
    actions: readonly TalosToolAction[]
    /** `false` quando il permesso nega: il passo entra come `denied`. */
    allowed: boolean
    /**
     * ⛔ Questo passo, da solo, avrebbe fatto comparire una scheda?
     *
     * È la condizione che rende il piano un guadagno netto invece di un costo,
     * e nasce da una misura sul dispositivo: per disegnare un gatto il modello
     * chiama `library_search`, `library_read` e `generate_image` — cioè **tre
     * schede** con i permessi su «chiedi ogni volta». Il piano non ne aggiunge
     * una: ne toglie due.
     *
     * Ma chi ha messo tutto su «consenti sempre» ha già detto «non chiedermelo»,
     * e mostrargli un piano contraddirebbe la sua impostazione — sarebbe una
     * seconda grammatica dei permessi mascherata da comodità, e l'owner ne ha
     * dichiarata una sola.
     *
     * Quindi il piano compare **solo se almeno un passo avrebbe chiesto**. In
     * ogni altro caso non c'è niente da risparmiare e non si disturba nessuno.
     */
    asks: boolean
    /**
     * Un passo che va confermato uno per uno e **non entra** nel piano.
     *
     * Sono i critici: `R4`, o ciò che il tool marca `confirmation: 'always'`.
     * Metterli in un elenco approvato in blocco significherebbe far passare per
     * routine la cosa che di routine non è.
     */
    critical: boolean
}

const SCALA: readonly TalosToolRisk[] = ['R0', 'R1', 'R2', 'R3', 'R4']

function peggiore(sinistra: TalosToolRisk, destra: TalosToolRisk): TalosToolRisk {
    return SCALA.indexOf(destra) > SCALA.indexOf(sinistra) ? destra : sinistra
}

/**
 * La soglia: da `R2` in su si mostra il piano.
 *
 * Non è un numero scelto a occhio. `R0` e `R1` sono le letture e le scritture
 * che si annullano da sole; `R2` è dove comincia ciò che esce dal dispositivo o
 * che l'utente dovrebbe poter fermare. Sotto, chiedere sarebbe rumore — e il
 * rumore è ciò che fa spegnere la difesa.
 */
export const TALOS_PLAN_RISK_THRESHOLD: TalosToolRisk = 'R2'

/**
 * Il rischio del gruppo, calcolato **sulla catena** e non sui singoli.
 *
 * Un passo alla volta ognuno può sembrare innocuo: è la sequenza a essere
 * pericolosa, ed è la stessa ragione per cui la trifecta guarda la catena
 * invece del tool. Qui si simula: si fa avanzare la catena passo per passo come
 * farebbe l'esecutore, e si prende il rischio effettivo peggiore che si incontra.
 */
export function talosPlanRisk(
    candidati: readonly TalosPlanCandidate[],
    chain: TalosToolChainState = TALOS_EMPTY_CHAIN,
): TalosToolRisk {
    let corrente = chain
    let massimo: TalosToolRisk = 'R0'
    for (const candidato of candidati) {
        if (!candidato.allowed) continue
        massimo = peggiore(massimo, talosEffectiveRisk(corrente, candidato.security))
        corrente = talosAdvanceChain(corrente, candidato.security)
    }
    return massimo
}

/**
 * Il piano va mostrato?
 *
 * Vero quando c'è **almeno un passo irreversibile** oppure quando il rischio
 * del gruppo raggiunge la soglia. Falso per un solo passo: un piano di un passo
 * è una scheda di consenso con un vestito diverso, e ne avremmo due che dicono
 * la stessa cosa.
 */
export function talosPlanNeedsApproval(
    candidati: readonly TalosPlanCandidate[],
    chain: TalosToolChainState = TALOS_EMPTY_CHAIN,
): boolean {
    const ammessi = candidati.filter((candidato) => candidato.allowed && !candidato.critical)
    if (ammessi.length < 2) return false
    /*
     * Niente da risparmiare, niente da chiedere.
     *
     * Se nessuno di questi passi avrebbe fatto comparire una scheda, il piano
     * sarebbe una scheda in PIÙ invece di quattro in meno — cioè l'esatto
     * contrario di ciò per cui esiste.
     */
    if (!ammessi.some((candidato) => candidato.asks)) return false
    if (ammessi.some((candidato) => candidato.security.reversibility === 'irreversible')) return true
    return SCALA.indexOf(talosPlanRisk(ammessi, chain))
        >= SCALA.indexOf(TALOS_PLAN_RISK_THRESHOLD)
}

/**
 * Costruisce il piano da proporre.
 *
 * ⛔ I passi negati entrano come `denied` e **non spariscono**: nasconderli
 * darebbe l'impressione che il modello non li avesse chiesti, e la pagina dei
 * permessi diventerebbe una cosa che agisce di nascosto. Si vedono, si dice che
 * sono esclusi, e non partono.
 *
 * I critici invece restano **fuori del tutto**: hanno la loro conferma, una per
 * una, ed è l'unico modo di non farli passare per routine.
 */
export function talosBuildPlan(
    id: string,
    candidati: readonly TalosPlanCandidate[],
    chain: TalosToolChainState = TALOS_EMPTY_CHAIN,
    scope: TalosPlanScope = 'turn',
): TalosPlan {
    const steps: TalosPlanStep[] = candidati
        .filter((candidato) => !candidato.critical)
        .map((candidato) => ({
            id: candidato.id,
            tool: candidato.tool,
            title: candidato.title,
            input: candidato.input,
            digest: candidato.digest,
            risk: candidato.security.risk,
            reversibility: candidato.security.reversibility,
            actions: candidato.actions,
            state: candidato.allowed ? 'pending' : 'denied',
        }))
    return {
        id,
        steps,
        risk: talosPlanRisk(candidati.filter((candidato) => !candidato.critical), chain),
        state: 'proposed',
        scope,
        // Il turno controlla gli argomenti; la conversazione no, altrimenti non
        // aprirebbe su niente. Chi vuole una combinazione diversa la imposta
        // dopo, ed e' il caso di «per questa richiesta».
        matchArguments: scope === 'turn',
        approvedChain: chain,
    }
}

/**
 * Toglie un passo, e ricalcola il rischio di ciò che resta.
 *
 * Ricalcolare non è un dettaglio: se l'utente toglie proprio il passo che
 * portava il gruppo sopra la soglia, il piano che resta è un'altra cosa e deve
 * dirlo. Un rischio che non scende quando togli il pezzo pericoloso è un numero
 * che nessuno crederà una seconda volta.
 */
export function talosPlanWithout(piano: TalosPlan, stepId: string): TalosPlan {
    const steps = piano.steps.map((step) => (
        step.id === stepId && step.state === 'pending'
            ? { ...step, state: 'removed' as const }
            : step
    ))
    return { ...piano, steps, risk: talosPlanRiskOfSteps(steps) }
}

/** Il rischio dichiarato dei passi ancora vivi. Nessuna catena: qui i passi sono già fissati. */
function talosPlanRiskOfSteps(steps: readonly TalosPlanStep[]): TalosToolRisk {
    return steps
        .filter((step) => step.state !== 'removed' && step.state !== 'denied')
        .reduce<TalosToolRisk>((massimo, step) => peggiore(massimo, step.risk), 'R0')
}

/** I passi che partiranno davvero: né tolti, né negati. */
export function talosPlanLiveSteps(piano: TalosPlan): readonly TalosPlanStep[] {
    return piano.steps.filter((step) => step.state !== 'removed' && step.state !== 'denied')
}

export type TalosPlanAdmission =
    /** È nel piano, con gli stessi argomenti: parte. */
    | { admitted: true, step: TalosPlanStep }
    /** Non era nel piano affatto. */
    | { admitted: false, reason: 'not-in-plan' }
    /** C'era, ma l'utente l'aveva tolto. */
    | { admitted: false, reason: 'removed' }
    /** C'era, ma gli argomenti non sono più quelli approvati. */
    | { admitted: false, reason: 'arguments-changed', step: TalosPlanStep }
    /**
     * Il piano valeva per la conversazione, ma **è entrato contenuto non
     * fidato** da quando l'hai approvato: l'approvazione permanente è decaduta.
     */
    | { admitted: false, reason: 'chain-contaminated' }

/**
 * ⛔ Questa chiamata è dentro il piano che l'utente ha letto?
 *
 * Le tre risposte negative sono distinte di proposito, perché portano a tre
 * frasi diverse verso la persona: «non l'avevi approvato», «l'avevi tolto»,
 * «l'avevi approvato ma con altri argomenti». Un «non consentito» solo non
 * direbbe niente di utile a nessuno dei tre.
 *
 * Il confronto sull'impronta è il pezzo che rende l'approvazione una firma su
 * QUESTA cosa: senza, un'iniezione che colpisce fra la proposta e l'esecuzione
 * userebbe un consenso dato per altro.
 */
export function talosPlanAdmits(
    piano: TalosPlan,
    tool: string,
    digest: string,
    /** Com'è la catena ADESSO. Serve solo alla portata `conversation`. */
    chain: TalosToolChainState = piano.approvedChain,
): TalosPlanAdmission {
    /*
     * ⛔ Prima di tutto: l'approvazione permanente è ancora viva?
     *
     * Se da quando l'utente ha approvato è entrato contenuto non fidato, decade.
     * Il controllo sta in cima di proposito: deve valere anche per un passo che
     * corrisponde perfettamente, perché il pericolo non è l'argomento sbagliato
     * — è che l'argomento giusto venga eseguito dopo che qualcun altro ha
     * parlato dentro la conversazione.
     */
    if (!piano.matchArguments
        && chain.untrustedSeen
        && !piano.approvedChain.untrustedSeen) {
        return { admitted: false, reason: 'chain-contaminated' }
    }

    const candidati = piano.steps.filter((step) => step.tool === tool)
    if (candidati.length === 0) return { admitted: false, reason: 'not-in-plan' }

    const vivo = (step: TalosPlanStep) => step.state !== 'removed' && step.state !== 'denied'

    const esatto = candidati.find((step) => step.digest === digest)
    if (esatto) {
        return vivo(esatto)
            ? { admitted: true, step: esatto }
            : { admitted: false, reason: 'removed' }
    }

    /*
     * Il tool c'è, l'impronta no.
     *
     * Su `turn` è una deviazione e si ferma. Su `conversation` è precisamente
     * ciò che la porta serve a permettere: lo stesso strumento su un argomento
     * nuovo, che è come sono fatti i messaggi successivi.
     */
    if (!piano.matchArguments) {
        const utilizzabile = candidati.find(vivo)
        if (utilizzabile) return { admitted: true, step: utilizzabile }
        return { admitted: false, reason: 'removed' }
    }
    return { admitted: false, reason: 'arguments-changed', step: candidati[0]! }
}

/**
 * ⛔ Un piano approvato basta, al posto della scheda di questo passo?
 *
 * ## Perché sta QUI e non nel controller
 *
 * Perché una regola di sicurezza scritta in due posti è una regola che un
 * giorno vale in un posto solo. La prima versione viveva nel controller e il
 * test se la riscriveva accanto per provarla: due copie identiche il primo
 * giorno, e la copia nel test sarebbe rimasta verde mentre il prodotto
 * sbagliava. Una funzione sola, usata da entrambi.
 *
 * ## I due pavimenti, e perché non si attraversano
 *
 * L'approvazione di un piano non compra ciò che nemmeno «consenti sempre»
 * compra:
 *
 * - **la trifecta chiusa** — dati privati, contenuto non fidato e un modo per
 *   farlo uscire, tutti e tre insieme. Non è una domanda sul singolo tool: è su
 *   ciò che è successo prima nel discorso, e il piano è stato letto **prima**
 *   che succedesse. Approvarlo non poteva includere una cosa che non era ancora
 *   accaduta.
 * - **`R4`** — le azioni che non si ritirano. Non entrano nemmeno nel piano
 *   (`critical`); questo è il secondo controllo, per quando ci si arriva **per
 *   via della catena** — cioè il caso che nessuno aveva previsto scrivendo il
 *   tool.
 */
export function talosPlanReplacesConsent(
    piano: TalosPlan | null,
    richiesta: { tool: string, digest: string, reason?: string, risk?: string },
    chain: TalosToolChainState,
): boolean {
    if (!piano || piano.state !== 'approved') return false
    if (richiesta.reason === 'trifecta') return false
    if (richiesta.risk === 'R4') return false
    return talosPlanAdmits(piano, richiesta.tool, richiesta.digest, chain).admitted
}
