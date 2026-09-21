import {
    talosResearchIsResting,
    talosResearchIsTerminal,
    talosResearchWorkLeft,
} from './run.mjs'
import { talosResearchReportRefOf } from './card.mjs'

/*
 * PORTO FEDELE di AVM/mobile/src/lib/research/researchNarration.ts (150 righe, 11/09/2026).
 *
 * ⛔ `run.mjs` è il porto di `researchRun.ts` e lo cura un'altra sessione, in
 * parallelo: qui se ne importa solo il nome concordato.
 *
 * Che cosa sta facendo la ricerca, detto in una frase.
 *
 * Owner 2026-08-03, sulla pagina com'era: «non c'è un progresso di quello che
 * si sta facendo … dei termini molto tecnici». Aveva ragione, e la diagnosi è
 * precisa: la pagina diceva QUANTO (`0/2`, `3 s`, `RACCOLGO`) e mai CHE COSA.
 * Un contatore ha significato solo per chi già sa che cosa si sta contando; chi
 * guarda vuole l'altra metà.
 *
 * Il materiale per la frase c'era già e non veniva usato. Il piano è stato
 * approvato prima che si spendesse un centesimo, quindi ogni ramo porta la
 * domanda a cui è andato a rispondere — il che vuol dire che «sto cercando le
 * fonti su «chi la brevettò»» non è una parafrasi gentile dello stato, È lo
 * stato, letto ad alta voce.
 *
 * Tutto qui dentro è aritmetica sulla corsa: niente disco, niente rete, nessun
 * orologio proprio. La riga si può quindi disegnare nello stesso fotogramma del
 * tocco.
 */

/**
 * @import { TalosResearchRun, TalosResearchStep } from './run.mjs'
 */

/**
 * @typedef {object} TalosResearchLine
 * @property {string} key Una chiave i18n. Le parole vivono nelle traduzioni, mai qui.
 * @property {Readonly<Record<string, string>>} params
 */

/** @type {Readonly<Record<string, string>>} */
const NO_PARAMS = Object.freeze({})

/**
 * @param {string} key
 * @param {Readonly<Record<string, string>>} [params]
 * @returns {TalosResearchLine}
 */
function line(key, params = NO_PARAMS) {
    return { key, params }
}

/**
 * La domanda a cui un ramo è andato a rispondere — l'unico nome umano che un passo ha.
 * @param {TalosResearchRun} run
 * @param {string} branchId
 * @returns {string | null}
 */
function branchQuestion(run, branchId) {
    return run.plan.find((branch) => branch.id === branchId)?.question ?? null
}

/**
 * Una frase per tutta la corsa.
 *
 * `driving` viene dal registro e non dal giornale, e i due sono davvero in
 * disaccordo: una corsa uccisa insieme all'app legge ancora `collecting`, e
 * dire «sto cercando» di una corsa che nessuno sta guidando è una bugia che la
 * persona può stare a guardare per un'ora. Fermo è una frase sua, con il punto
 * da cui ripartirebbe.
 *
 * @param {TalosResearchRun} run
 * @param {boolean} driving
 * @returns {TalosResearchLine}
 */
export function talosResearchNarration(run, driving) {
    if (talosResearchIsTerminal(run.status)) {
        if (run.status === 'cancelled') return line('research.cancelledHere')
        if (run.status === 'failed') return line('research.say.failed')
        /*
         * «Conclusa» e «conclusa senza rapporto» sono lo stesso stato e due
         * situazioni completamente diverse, e dire alla persona la prima quando
         * era la seconda è costato ore il 2026-08-03: la corsa era finita, la
         * pagina lo diceva, e nessuno ha pensato di chiedersi perché non ci
         * fosse niente da leggere.
         */
        return talosResearchReportRefOf(run) ? line('research.say.done') : line('research.doneNoReport')
    }

    // Da dove ripartirebbe. Le corse terminali non devono niente, ed è per
    // questo che si legge solo dopo il ramo terminale qui sopra.
    const next = talosResearchWorkLeft(run)[0]?.question ?? null

    /*
     * Aver chiesto di fermarsi non è essersi fermati. Una pausa durante un
     * passo già pagato lo lascia finire e depositare prima — «drain then
     * checkpoint» — e lo scarto fra i due può essere un minuto in cui una
     * persona guarda un pulsante che ha già premuto. Dire «in pausa» lì
     * sarebbe la parola della pagina contro quella della rotella.
     */
    if (run.status === 'pause_requested') return line('research.say.pausing')
    if (talosResearchIsResting(run.status)) {
        return next ? line('research.say.pausedAt', { question: next }) : line('research.say.paused')
    }
    if (!driving) {
        return next ? line('research.say.stoppedAt', { question: next }) : line('research.say.stopped')
    }
    if (run.plan.length === 0) return line('research.say.planning')

    const running = run.steps.find((step) => step.state === 'running')
    if (running) {
        if (running.kind === 'synthesise') return line('research.say.writing')
        if (running.kind === 'verify') return line('research.say.verifying')
        const question = branchQuestion(run, running.branchId)
        if (!question) return line('research.say.collecting')
        return line(running.kind === 'read' ? 'research.say.reading' : 'research.say.searching', { question })
    }

    // Fra due passi il motore ha già deciso che cosa viene dopo, e lo scarto è
    // di millisecondi. Dire che cosa sta per fare batte il tacere proprio nel
    // fotogramma in cui è più probabile che una persona stia guardando.
    return next ? line('research.say.searching', { question: next }) : line('research.say.writing')
}

/**
 * @typedef {object} TalosResearchDoneNotice
 * @property {string} title Le parole della persona, non tradotte — è la sua domanda.
 * @property {TalosResearchLine} text
 * @property {string} route La pagina di QUESTA ricerca. Una notifica che atterra
 *   altrove ha speso l'attenzione dell'utente senza restituire niente.
 */

/**
 * Che cosa annunciare quando una ricerca finisce, oppure niente.
 *
 * Una ricerca dura minuti: la persona la avvia, blocca il telefono, e fino a
 * oggi niente le diceva che era finita. Doveva stare lì a guardarla — il che
 * rende il lavoro in sottofondo senza valore.
 *
 * `cancelled` tace apposta. L'hanno fermata loro pochi secondi fa; dirgli che
 * si è fermata è l'app che gli ripete la loro stessa azione, e ogni notifica
 * così rende più facile scartare la prossima senza leggerla.
 *
 * @param {TalosResearchRun} run
 * @returns {TalosResearchDoneNotice | null}
 */
export function talosResearchDoneNotice(run) {
    if (!talosResearchIsTerminal(run.status)) return null
    if (run.status === 'cancelled') return null
    return {
        title: run.title ?? run.question,
        // Non guidata, e terminale: la stessa frase che mostra la pagina, che è
        // il modo in cui la notifica e la pagina non possono finire in disaccordo.
        text: talosResearchNarration(run, false),
        route: `/research/${run.id}`,
    }
}

/**
 * Il nome di un passo, per il registro in fondo alla pagina.
 *
 * Il registro stampava `b1:search` e `synthesis`, che sono gli identificativi
 * del motore — utili a esattamente un lettore, e li ha scritti lui. I nomi qui
 * dicono a che cosa SERVIVA il passo, e la domanda del ramo rende ogni ricerca
 * distinguibile dalla successiva senza un numero di serie.
 *
 * @param {TalosResearchRun} run
 * @param {TalosResearchStep} step
 * @returns {TalosResearchLine}
 */
export function talosResearchStepTitle(run, step) {
    if (step.kind === 'synthesise') return line('research.stepTitle.write')
    if (step.kind === 'verify') return line('research.stepTitle.verify')
    const question = branchQuestion(run, step.branchId)
    if (step.kind === 'read') {
        return question ? line('research.stepTitle.read', { question }) : line('research.stepTitle.readPlain')
    }
    return question ? line('research.stepTitle.search', { question }) : line('research.stepTitle.searchPlain')
}
