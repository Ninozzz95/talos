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
     * ⭐⭐⭐ Il microbatch: **192**, e il numero viene da una misura su GPU.
     *
     * Il commento che stava qui aveva gia' capito il compromesso - *l'attesa
     * massima dello Stop e' un microbatch intero* - e sceglieva 512 su un
     * telefono con molti core. Il ragionamento era giusto; non era mai stato
     * **verificato su una scheda grafica**.
     *
     * ⛔ Misurato il 2026-08-20 su Adreno 830, prompt da 2.048 token, Stop
     * premuto dopo 200 ms. Il motore dichiara dove si ferma:
     *
     * ```
     *   512 (com'era)  1.443 ms   si ferma a 512/2048 - pezzo intero completato
     *   256            1.446 ms   idem
     *   192            ~460 ms    si ferma a 0/2048 - morde a meta'
     *   128            ~290 ms
     * ```
     *
     * ⇒ Il salto sta **fra 256 e 192**, e vale un fattore tre. Sotto quella
     * soglia la latenza e' semplicemente una lunghezza di microbatch.
     *
     * Il prezzo, sulle stesse misure: prefill **da 0 a 8% piu' lento** secondo
     * il modello, e in cambio la decodifica dopo un prompt lungo **+97%**, il
     * primo messaggio **4,5 secondi prima**, lo Stop **13× piu' pronto**.
     *
     * ⛔⛔ E NON si scende a 64 per far diventare verde il cancello G4.
     * Passerebbe, al prezzo del **28% di prefill**, e misurerebbe una cosa che
     * la cura vera dell'abort porta a millisecondi **senza pagare niente**.
     * Sarebbe ottimizzare il cancello invece della persona. ⇒ G4 resta
     * **rosso**, dichiarato, finche' quella cura non arriva.
     */
    const microBatch = 192

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
/**
 * ⛔⛔⛔ LA SCELTA STA ACCANTO ALLA REGOLA, non presso chi la chiama.
 *
 * Prima viveva dentro `threadTuningRun.ts`, e faceva così:
 *
 * ```ts
 * const threadsBatch = talosPreferFewerThreads(misura.grid, 'prefill') === null
 *     ? misura.threadsBatch
 *     : Math.max(...misura.grid.filter((r) => r.prefill > 0).map((r) => r.threads))
 * ```
 *
 * Chiamava la regola **solo per vedere se fosse nulla**, e poi ne buttava la
 * risposta per prendere il numero di thread PIÙ ALTO fra quelli provati.
 *
 * Il commento accanto diceva «il prefill prende il massimo perché SCALA». È vero
 * quasi sempre — ma «quasi sempre» è esattamente il motivo per cui si misura. Su
 * un dispositivo dove otto thread perdono contro sei per contesa di memoria o
 * per calore, TALOS osservava correttamente la regressione **e poi sceglieva
 * otto lo stesso**.
 *
 * ⇒ Una misura che non può cambiare la decisione non è una misura: è una
 * cerimonia. E costa — ogni thread in più è calore, che si paga sulle risposte
 * lunghe, e un core che non resta all'interfaccia.
 *
 * ⛔ E i due criteri restano DIVERSI, perché i due lavori lo sono: il prefill
 * scala coi thread, la generazione no. Ma tutti e due partono dal numero
 * MISURATO migliore, e a parità entro il 3% preferiscono il più basso. È la
 * stessa regola applicata a due colonne, non due politiche.
 */
export function talosScegliThread(
    misura: TalosMeasuredTuning,
): { threads: number, threadsBatch: number } {
    return {
        threadsBatch: talosPreferFewerThreads(misura.grid, 'prefill') ?? misura.threadsBatch,
        threads: talosPreferFewerThreads(misura.grid, 'decode') ?? misura.threads,
    }
}
