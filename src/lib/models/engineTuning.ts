/**
 * Quanti thread al prefill, quanti alla generazione, e quanto grande il
 * microbatch — chiesto al chip vero.
 *
 * ## Il difetto che questo modulo chiude
 *
 * Il motore apriva ogni modello con `n_threads = 4` e `n_threads_batch` uguale
 * a `n_threads`. Due numeri sbagliati per due ragioni diverse:
 *
 * - **Quattro** era una costante. Sul OnePlus Pad 3 i core sono **otto**, e
 *   metà del chip stava a guardare durante il prefill.
 * - **Uguali** era una confusione. Il prefill macina matrici per matrici e si
 *   spalma sui core; la generazione produce un token per volta ed è legata
 *   alla banda di memoria, dove i thread in più si contendono la stessa
 *   memoria invece di calcolare. Sono carichi opposti e volevano numeri
 *   diversi.
 *
 * E `n_ubatch` non veniva impostato affatto, quindi il batch fisico e quello
 * logico coincidevano per omissione.
 *
 * ## Perché qui si calcola un PUNTO DI PARTENZA e non la risposta
 *
 * ⛔ Il numero giusto di thread non è una proprietà del chip: è una proprietà
 * del chip **più questo modello più questa quantizzazione più la temperatura di
 * adesso**. Non si può dedurre, si misura — ed è quello che fa
 * `nativeTuneThreads`, che prova i candidati sul contesto vero.
 *
 * Questo modulo fa due cose oneste: **da dove partire** prima di aver misurato,
 * e **quali candidati** vale la pena provare. Nessuna delle due è una
 * previsione sul risultato.
 *
 * ## La topologia, misurata e non dedotta dal nome del chip
 *
 * MISURATO sul Pad 2026-08-06: otto core, sei a capacità 792 e due a 1024.
 * Non è il classico big.LITTLE con quattro core lenti — qui **non c'è un core
 * lento**. Riconoscere i chip per nome sarebbe una lista che invecchia a ogni
 * telefono nuovo; `cpu_capacity` è un numero che il kernel dichiara, dove 1024
 * è il core più forte del sistema.
 */

export interface TalosCpuTopology {
    /** Quanti core il sistema concede a questo processo. */
    cores: number
    /** La capacità di ciascuno, 1024 = il più forte. Vuota se il kernel tace. */
    capacities: readonly number[]
}

export interface TalosEngineTuning {
    /** Generazione: legata alla banda di memoria. */
    threads: number
    /** Prefill: legato al calcolo. */
    threadsBatch: number
    /** Il batch fisico. Grande accelera il prefill e gonfia i buffer. */
    microBatch: number
    /** I valori che vale la pena misurare sul dispositivo. */
    candidates: readonly number[]
}

/**
 * Quanti core sono «forti», cioè entro un decimo dal migliore.
 *
 * La soglia non serve a etichettare l'hardware: serve a sapere se il chip ha
 * DAVVERO due categorie o se sono tutti uguali. Su un chip omogeneo il conto
 * torna uguale al totale, e la decisione a valle non cambia — che è il
 * comportamento giusto quando non c'è niente da distinguere.
 */
export function talosStrongCores(topology: TalosCpuTopology): number {
    const capacities = topology.capacities.filter((c) => Number.isFinite(c) && c > 0)
    if (capacities.length === 0) return Math.max(1, topology.cores)
    const massimo = Math.max(...capacities)
    return capacities.filter((c) => c >= massimo * 0.9).length
}

const MIN_THREADS = 2

export function talosEngineTuning(topology: TalosCpuTopology): TalosEngineTuning {
    const core = Math.max(1, Math.floor(topology.cores) || 1)

    /**
     * Il prefill prende tutto tranne uno.
     *
     * Quell'uno non è prudenza generica: mentre il modello macina, l'interfaccia
     * deve continuare a disegnare e a rispondere al dito. Prendersi anche
     * l'ultimo core fa guadagnare qualche punto percentuale di prefill e fa
     * perdere la fluidità, che è la cosa che si vede.
     */
    const threadsBatch = Math.max(MIN_THREADS, core - 1)

    /**
     * La generazione ne prende circa metà.
     *
     * Non è un compromesso timido: produrre un token per volta legge tutti i
     * pesi e fa pochissimo calcolo, quindi satura la banda di memoria molto
     * prima di saturare i core. Oltre quel punto i thread in più aspettano la
     * stessa memoria e scaldano.
     *
     * Metà è il PUNTO DI PARTENZA, e la misura sul dispositivo dirà se era
     * generoso o timido.
     */
    const forti = talosStrongCores(topology)
    const meta = Math.max(MIN_THREADS, Math.round(core / 2))
    const threads = Math.min(threadsBatch, meta)

    /**
     * Il microbatch: 256 quando i core sono pochi, 512 quando sono tanti.
     *
     * ⛔ E non di più, anche se il prefill andrebbe più veloce. L'attesa massima
     * dello Stop è **un microbatch intero**: raddoppiarlo raddoppia il tempo
     * che passa fra il dito e il silenzio, e su un telefono con 4,5 GB liberi
     * raddoppia anche il picco dei buffer di calcolo. Il prefill che corre non
     * vale un tasto Stop che tentenna.
     */
    const microBatch = core >= 6 ? 512 : 256

    /**
     * I candidati da misurare: pochi e distinti.
     *
     * Provarli tutti costerebbe più della differenza che si trova. Questi
     * quattro coprono le forme che contano — metà, i core forti, quasi tutti,
     * tutti — e i duplicati spariscono da soli su un chip piccolo.
     */
    const candidates = [...new Set([
        MIN_THREADS,
        meta,
        Math.max(MIN_THREADS, forti),
        threadsBatch,
        core,
    ])].filter((n) => n >= MIN_THREADS && n <= core).sort((a, b) => a - b)

    return { threads, threadsBatch, microBatch, candidates }
}

/**
 * L'esito di una taratura misurata sul dispositivo.
 *
 * `grid` non è decorazione: è la prova che la scelta viene da numeri e non da
 * un'opinione, ed è ciò che permette di accorgersi che due candidati erano
 * indistinguibili — nel qual caso conviene il più basso, che scalda meno.
 */
export interface TalosMeasuredTuning {
    threads: number
    threadsBatch: number
    prefillPerSecond: number
    decodePerSecond: number
    grid: ReadonlyArray<{ threads: number, prefill: number, decode: number }>
}

/**
 * Fra due candidati che si equivalgono vince il più basso.
 *
 * Una differenza sotto il 3% su un telefono è rumore: temperatura, un'altra app
 * che si sveglia, lo scheduler che sposta un thread. Sceglierla come vittoria
 * significa fissare per sempre una misura che domani sarebbe l'opposto — e il
 * candidato più alto costa più calore, che si paga sulle risposte lunghe.
 */
export function talosPreferFewerThreads(
    grid: TalosMeasuredTuning['grid'],
    campo: 'prefill' | 'decode',
): number | null {
    const validi = grid.filter((r) => r[campo] > 0)
    if (validi.length === 0) return null
    const migliore = Math.max(...validi.map((r) => r[campo]))
    return validi
        .filter((r) => r[campo] >= migliore * 0.97)
        .reduce((basso, r) => Math.min(basso, r.threads), Number.POSITIVE_INFINITY)
}
