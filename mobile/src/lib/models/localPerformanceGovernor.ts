import type { TalosPerformanceSignals } from '@/services/localEngine'

/**
 * P2-3 — lo stato che un futuro selettore leggerà per scegliere fra
 * profili GIÀ QUALIFICATI (mai per inventare `gpuLayers=13` o accendere
 * FA non qualificata — l'invariante è nel piano, non ripetuto qui).
 *
 * ⛔ `'burst'` è nel tipo ma non ancora RAGGIUNGIBILE da
 * {@link talosAdvancePerformanceGovernor}: il piano nomina i tre stati
 * ma non specifica una soglia di ingresso per quello opportunistico, e
 * nessun consumatore lo chiede oggi. Inventare una soglia senza un dato
 * o una richiesta reale sarebbe esattamente il tipo di numero scritto a
 * mano che questo progetto evita — resta un gap dichiarato, non un
 * default silenzioso.
 */
export type TalosPerformanceGovernorState = 'burst' | 'balanced' | 'constrained'

export interface TalosPerformanceGovernorTracker {
    readonly state: TalosPerformanceGovernorState
    readonly consecutiveBad: number
    readonly consecutiveGood: number
}

export const TALOS_PERFORMANCE_GOVERNOR_INITIAL: TalosPerformanceGovernorTracker = Object.freeze({
    state: 'balanced',
    consecutiveBad: 0,
    consecutiveGood: 0,
})

/**
 * ⛔ Isteresi ASIMMETRICA per costruzione, non per svista: entrare in
 * `constrained` costa 3 campioni cattivi di fila, uscirne ne costa 5
 * buoni — di più, non uguali. Un singolo campione buono dopo una serie
 * cattiva non prova che la pressione sia finita, e uscire troppo presto
 * rifarebbe la stessa oscillazione già misurata altrove in questa
 * sessione ("sotto carico non cala: oscilla" — 9 salti in 10 minuti).
 */
const CAMPIONI_CATTIVI_PER_ENTRARE_CONSTRAINED = 3
const CAMPIONI_BUONI_PER_USCIRE_CONSTRAINED = 5

/** Sotto questa soglia [0,100] un singolo segnale headroom conta come pressione. */
const HEADROOM_SOTTO_PRESSIONE = 20
/** Sopra questa soglia un singolo segnale headroom conta come tranquillo. */
const HEADROOM_TRANQUILLO = 40

const STATI_TERMICI_SOTTO_PRESSIONE: ReadonlySet<string> = new Set(['severe', 'critical'])
const STATI_TERMICI_TRANQUILLI: ReadonlySet<string> = new Set(['none', 'light'])

/**
 * Un campione È cattivo se il termico è già sopra la soglia, OPPURE se
 * un qualunque headroom letto (non `null`) è basso — basta UNO, non
 * serve che lo siano tutti: un solo collo di bottiglia reale è
 * sufficiente a far sentire la pressione all'utente.
 */
function talosCampioneCattivo(segnali: TalosPerformanceSignals): boolean {
    if (segnali.thermalStatus !== null && STATI_TERMICI_SOTTO_PRESSIONE.has(segnali.thermalStatus)) {
        return true
    }
    return [segnali.cpuHeadroom, segnali.gpuHeadroom, segnali.thermalHeadroom]
        .some((valore) => valore !== null && valore < HEADROOM_SOTTO_PRESSIONE)
}

/**
 * Un campione È buono solo se il termico è tranquillo E ogni headroom
 * letto è alto — qui invece serve il consenso di TUTTI i segnali
 * disponibili: uscire dalla cautela è una decisione che deve essere
 * confermata da ogni fonte che sa rispondere, non da una sola.
 */
function talosCampioneBuono(segnali: TalosPerformanceSignals): boolean {
    if (segnali.thermalStatus === null || !STATI_TERMICI_TRANQUILLI.has(segnali.thermalStatus)) {
        return false
    }
    return [segnali.cpuHeadroom, segnali.gpuHeadroom, segnali.thermalHeadroom]
        .every((valore) => valore === null || valore >= HEADROOM_TRANQUILLO)
}

/**
 * Un passo dell'isteresi: UNA lettura in ingresso, lo stato aggiornato in
 * uscita — pura, senza un tracker nascosto in un modulo. Chi chiama tiene
 * il {@link TalosPerformanceGovernorTracker} fra un campione e l'altro
 * (nello store che guida la generazione), non questo file.
 */
export function talosAdvancePerformanceGovernor(
    previous: TalosPerformanceGovernorTracker,
    segnali: TalosPerformanceSignals,
): TalosPerformanceGovernorTracker {
    const cattivo = talosCampioneCattivo(segnali)
    const buono = talosCampioneBuono(segnali)

    const consecutiveBad = cattivo ? previous.consecutiveBad + 1 : 0
    const consecutiveGood = buono ? previous.consecutiveGood + 1 : 0

    if (previous.state === 'constrained') {
        // ⛔ Si esce SOLO da qui: mai un salto diretto constrained -> burst,
        // anche se una lettura fosse eccezionalmente buona — l'isteresi
        // vale la sicurezza, non la reattività.
        const state = consecutiveGood >= CAMPIONI_BUONI_PER_USCIRE_CONSTRAINED ? 'balanced' : 'constrained'
        return { state, consecutiveBad, consecutiveGood }
    }

    const state = consecutiveBad >= CAMPIONI_CATTIVI_PER_ENTRARE_CONSTRAINED ? 'constrained' : 'balanced'
    return { state, consecutiveBad, consecutiveGood }
}
