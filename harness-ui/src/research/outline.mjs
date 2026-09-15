import { talosResearchIsTerminal, talosResearchStepIdFor } from './run.mjs'

/*
 * PORTO FEDELE di AVM/mobile/src/lib/research/researchOutline.ts (85 righe, 11/09/2026).
 *
 * ⛔ `run.mjs` è il porto di `researchRun.ts` e lo cura un'altra sessione, in
 * parallelo: qui se ne importa solo il nome concordato, senza duplicarne una riga.
 *
 * Il documento, prima che esista.
 *
 * La ricerca visiva del 2026-08-03 fa una domanda a cui nessun concorrente
 * risponde: che cosa si disegna nel primo mezzo secondo, quando ancora non si
 * sa niente? Di quel momento non ha trovato uno screenshot in nessuno dei
 * cinque prodotti — le recensioni saltano dal piano allo stato popolato e il
 * marketing taglia la transizione. Il che fa comodo, perché vuol dire che la
 * risposta qui è nostra.
 *
 * E la risposta è che qualcosa lo sappiamo. Il piano è stato approvato prima
 * che si spendesse un centesimo: i suoi rami SONO le sezioni che il rapporto
 * avrà. Quindi la pagina si apre sulla forma del documento, con ogni sezione
 * che dice dov'è — invece che su una rotella, o, come faceva fino a oggi, su
 * niente del tutto.
 *
 * Tutto qui dentro è aritmetica sulla corsa. Niente disco, niente rete: il
 * primo fotogramma non può essere in ritardo perché non c'è niente da aspettare.
 */

/**
 * @import { TalosResearchRun, TalosResearchStepState } from './run.mjs'
 */

/**
 * @typedef {object} TalosResearchSection
 * @property {string} id
 * @property {string} question
 * @property {TalosResearchStepState} state
 */

/**
 * Una sezione per ramo, nell'ordine del piano.
 *
 * Un ramo senza ancora un passo è `pending` invece che assente: al lettore si
 * sta mostrando che cosa SUCCEDERÀ, e nascondere le parti non ancora partite
 * farebbe sembrare che il documento cresca dal nulla.
 *
 * @param {TalosResearchRun} run
 * @returns {readonly TalosResearchSection[]}
 */
export function talosResearchOutline(run) {
    return run.plan.map((branch) => {
        const step = run.steps.find((candidate) => candidate.id === talosResearchStepIdFor(branch.id, 'search'))
        return { id: branch.id, question: branch.question, state: step?.state ?? 'pending' }
    })
}

/**
 * Quando una corsa finita è finita davvero.
 *
 * NON `updatedAt`, che viene timbrato da ogni evento che il giornale accetta —
 * una rinomina compresa. Una ricerca conclusa in quattro minuti ieri e
 * rinominata oggi leggerebbe «conclusa in 1 giorno», e la pagina starebbe
 * citando il momento in cui le hai cambiato titolo come il momento in cui ha
 * smesso di pensare.
 *
 * L'ultimo passo che riporta una fine è la fine vera. Una corsa annullata prima
 * che un passo finisse non ne ha nessuno, e lì `updatedAt` è il meglio che c'è.
 *
 * @param {TalosResearchRun} run
 * @returns {string}
 */
function endedAt(run) {
    /** @type {string | null} */
    let last = null
    for (const step of run.steps) {
        if (step.finishedAt && (last === null || step.finishedAt > last)) last = step.finishedAt
    }
    return last ?? run.updatedAt
}

/**
 * Da quanto sta andando, in secondi.
 *
 * Dai tempi della corsa, mai da un cronometro fatto partire quando lo schermo
 * si è montato: una ricerca la si guarda da più posti e sopravvive a tutti,
 * quindi una durata posseduta da un componente ripartirebbe ogni volta che
 * qualcuno guarda. Una corsa finita misura fino a quando è finita; una viva
 * fino ad adesso.
 *
 * @param {TalosResearchRun} run
 * @param {string} now
 * @returns {number}
 */
export function talosResearchElapsedSeconds(run, now) {
    const started = Date.parse(run.startedAt)
    const until = Date.parse(talosResearchIsTerminal(run.status) ? endedAt(run) : now)
    if (!Number.isFinite(started) || !Number.isFinite(until)) return 0
    return Math.max(0, Math.round((until - started) / 1000))
}

/**
 * `4 min 08 s`, oppure `38 s`. Tabellare, e mai un numero nudo di secondi oltre
 * il minuto.
 *
 * @param {number} seconds
 * @returns {string}
 */
export function talosResearchDuration(seconds) {
    if (seconds < 60) return `${seconds} s`
    const minutes = Math.floor(seconds / 60)
    return `${minutes} min ${String(seconds % 60).padStart(2, '0')} s`
}
