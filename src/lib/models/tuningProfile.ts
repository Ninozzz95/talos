import type { TalosMeasuredTuning } from '@/lib/models/engineTuning'

/**
 * Il profilo dei thread, misurato una volta e ricordato.
 *
 * ## Perché ricordarlo
 *
 * Misurare costa: `nativeTuneThreads` prova ogni candidato con un prefill vero e
 * **azzera la conversazione in memoria**. Va benissimo farlo una volta; farlo a
 * ogni apertura vorrebbe dire pagare qualche secondo e buttare il contesto ogni
 * volta che qualcuno vuole solo scrivere un messaggio.
 *
 * ## ⛔ Perché un profilo ricordato è pericoloso
 *
 * Perché un numero misurato ieri su un'altra cosa è **peggio di nessun numero**:
 * ha l'aria di un fatto. Il conteggio giusto di thread non è una proprietà del
 * telefono — è una proprietà del **telefono più questo modello più questa
 * quantizzazione più questa build del motore**. Cambiane uno e la misura parla
 * di un'altra situazione.
 *
 * Quindi il profilo si conserva **con la sua chiave**, e la chiave contiene
 * tutto ciò che, cambiando, rende la misura muta. Non si aggiorna una parte: se
 * la chiave non combacia, il profilo non esiste.
 *
 * ## Cosa NON entra nella chiave, e perché
 *
 * La **temperatura**. Cambia di minuto in minuto, e metterla nella chiave
 * significherebbe non riusare mai niente. Ma è anche il motivo per cui un
 * profilo non è una verità eterna: è la scelta migliore *in condizioni normali*,
 * e quando il telefono scotta la decisione giusta è ridurre — che è un'altra
 * questione, e va risolta dove si legge la temperatura, non qui.
 */

export interface TalosTuningKey {
    /** Il modello di dispositivo, come lo dichiara Android. */
    deviceModel: string
    /** Quanti core: due telefoni con lo stesso nome possono averne di diversi. */
    cpuCores: number
    /**
     * Cosa identifica QUESTA build dell'app, e con lei il motore nativo dentro.
     *
     * Una build nuova può portare un llama.cpp diverso, con kernel diversi: una
     * misura presa con quello di prima non descrive più niente.
     */
    appBuild: string
    /** Il percorso del modello: due file possono chiamarsi uguale. */
    modelPath: string
    /**
     * Dimensione e data del file.
     *
     * ⛔ Insieme dicono «è ancora lo stesso file». Un modello riscaricato in una
     * quantizzazione diversa vive nello stesso posto con lo stesso nome, e senza
     * questi due la misura del vecchio verrebbe applicata al nuovo.
     */
    modelBytes: number
    modelModifiedAt: number
}

export interface TalosTuningProfile {
    key: TalosTuningKey
    threads: number
    threadsBatch: number
    /** I numeri da cui la scelta è nata: senza, è un'opinione. */
    prefillPerSecond: number
    decodePerSecond: number
    measuredAt: number
    /**
     * Quante volte, dopo aver applicato questo profilo, il motore è caduto.
     *
     * ⛔ Una configurazione che fa morire il processo non va riprovata all'
     * infinito solo perché era la più veloce. Alla seconda si mette in
     * quarantena e si torna al punto di partenza derivato, che è lento ma vivo.
     */
    failures: number
}

/** Oltre questo un profilo non si applica più, per quanto veloce fosse. */
export const TALOS_TUNING_FAILURE_LIMIT = 2

export function talosSameTuningKey(a: TalosTuningKey, b: TalosTuningKey): boolean {
    return a.deviceModel === b.deviceModel
        && a.cpuCores === b.cpuCores
        && a.appBuild === b.appBuild
        && a.modelPath === b.modelPath
        && a.modelBytes === b.modelBytes
        && a.modelModifiedAt === b.modelModifiedAt
}

/**
 * Il profilo da usare per questa situazione, o `null` se non ce n'è uno che
 * parli di essa.
 *
 * `null` non è un guasto: vuol dire «non lo so», e chi chiama ha già una
 * risposta onesta — il punto di partenza derivato dalla forma della CPU.
 */
export function talosProfileFor(
    profiles: readonly TalosTuningProfile[],
    key: TalosTuningKey,
): TalosTuningProfile | null {
    const trovato = profiles.find((profile) => talosSameTuningKey(profile.key, key))
    if (!trovato) return null
    if (trovato.failures >= TALOS_TUNING_FAILURE_LIMIT) return null
    if (!(trovato.threads > 0) || !(trovato.threadsBatch > 0)) return null
    return trovato
}

/**
 * Il profilo nuovo entra, e quello vecchio per la stessa chiave se ne va.
 *
 * ⛔ Sostituzione e non aggiunta: due profili per la stessa situazione sono due
 * risposte alla stessa domanda, e la seconda volta che si legge se ne prende una
 * a caso.
 *
 * La lista è limitata perché chi prova dieci modelli non deve portarsi dietro
 * dieci profili per sempre; i più vecchi escono, e al massimo si rimisura.
 */
export const TALOS_TUNING_PROFILE_LIMIT = 12

export function talosStoreProfile(
    profiles: readonly TalosTuningProfile[],
    profile: TalosTuningProfile,
): TalosTuningProfile[] {
    const altri = profiles.filter((existing) => !talosSameTuningKey(existing.key, profile.key))
    return [profile, ...altri].slice(0, TALOS_TUNING_PROFILE_LIMIT)
}

/**
 * Il motore è caduto con questo profilo: si segna.
 *
 * Si conta invece di cancellare subito perché una caduta può avere mille cause —
 * memoria occupata da un'altra app, un modello mezzo scaricato — e buttare una
 * misura buona al primo incidente vuol dire rimisurare per sempre.
 */
export function talosMarkTuningFailure(
    profiles: readonly TalosTuningProfile[],
    key: TalosTuningKey,
): TalosTuningProfile[] {
    return profiles.map((profile) => talosSameTuningKey(profile.key, key)
        ? { ...profile, failures: profile.failures + 1 }
        : profile)
}

/**
 * Da una misura a un profilo, scegliendo il candidato più basso fra quelli che
 * si equivalgono.
 *
 * Perché sotto il 3% su un telefono c'è rumore — temperatura, un'altra app che
 * si sveglia, lo scheduler che sposta un thread — e il candidato più alto si
 * paga in calore sulle risposte lunghe.
 */
export function talosProfileFromMeasurement(
    key: TalosTuningKey,
    measured: TalosMeasuredTuning,
    preferFewer: (grid: TalosMeasuredTuning['grid'], campo: 'prefill' | 'decode') => number | null,
    now: number,
): TalosTuningProfile | null {
    const threads = preferFewer(measured.grid, 'decode')
    const threadsBatch = preferFewer(measured.grid, 'prefill')
    if (threads === null || threadsBatch === null) return null
    return {
        key,
        threads,
        threadsBatch,
        prefillPerSecond: measured.prefillPerSecond,
        decodePerSecond: measured.decodePerSecond,
        measuredAt: now,
        failures: 0,
    }
}
