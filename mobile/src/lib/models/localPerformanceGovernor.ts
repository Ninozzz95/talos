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
 *
 * ## ⛔⛔ 2026-09-10 — È ARRIVATO UN DATO, E DICE DI NON FARLO
 *
 * La domanda posta a questo file era: «il banco sul Pad dà a `burst` la sua
 * soglia d'ingresso?». La risposta misurata è **no, e per un motivo peggiore
 * di "non c'è ancora abbastanza"**: quel banco ha trovato che i segnali che
 * questo modulo legge sono CIECHI proprio al fenomeno che una soglia
 * d'ingresso dovrebbe evitare.
 *
 * `.claude/TACCUINO-VELOCITA-LOCALE-2026-09-10.md`, 36 celle di
 * `llama-bench` su OnePlus Pad 3, con campionamento delle frequenze DURANTE
 * il calcolo:
 *
 * ```text
 *   dumpsys thermalservice  ->  Thermal Status: 0   in 35 celle su 36
 *   cpu6-7 (prime, max 4.320 MHz):  2.438 -> 1.958 -> 1.017 MHz, in CALO
 * ```
 *
 * ⇒ I core prime hanno perso il **58% della frequenza** mentre il framework
 * dichiarava `0`, cioè «nessun throttling». Il calo si vede nei numeri di
 * throughput (447 → 421 → 404 → 391 tok/s di cella in cella) e non lo si
 * sarebbe mai visto guardando questi segnali.
 *
 * ⇒ Una soglia d'ingresso a `burst` costruita su `thermalStatus === 'none'`
 * e headroom alto sarebbe scattata **durante quella corsa**, cioè nel momento
 * esattamente sbagliato: avrebbe chiesto di più a un chip che stava già
 * togliendo. Questo dato non riempie il buco — lo **allarga**, e dice che
 * riempirlo richiede un segnale che qui non c'è (la frequenza vera, letta da
 * `scaling_cur_freq`, oppure il throughput osservato che cala a parità di
 * lavoro).
 *
 * ⛔ Perciò `burst` resta irraggiungibile di proposito, e adesso c'è una
 * misura che lo tiene tale invece di un'assenza di richieste. Chi in futuro
 * volesse renderlo raggiungibile deve prima aggiungere il segnale che manca,
 * non abbassare quelli che ci sono.
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
