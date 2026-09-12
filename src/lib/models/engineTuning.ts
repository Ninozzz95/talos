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

/**
 * ⭐⭐⭐ I GRUPPI DI CORE, come li dichiara il kernel — non come li chiama il
 * marketing del chip.
 *
 * `cpu_capacity` è un numero per core, e core con lo stesso numero sono lo
 * stesso pezzo di silicio ripetuto. Raggrupparli per valore esatto dà la forma
 * vera del chip: sul OnePlus Pad 3, misurato il 2026-08-06, esce
 * `[{capacity: 1024, cores: 2}, {capacity: 792, cores: 6}]` — due prime e sei
 * uguali fra loro, che NON è il classico quattro-più-quattro.
 *
 * ⛔ Serve perché i confini fra un gruppo e l'altro sono gli unici numeri di
 * thread che questo dispositivo rende speciali, e sono diversi su ogni chip.
 * Una griglia «di due in due» li manca per costruzione su un chip 3+5.
 *
 * ⛔ Capacità illeggibili non si indovinano: un chip che non dichiara niente
 * torna UN gruppo solo, con `capacity: -1` — la stessa sentinella che usa il
 * lato nativo (`talos_core_cpu.capacity`), non uno zero che sembrerebbe una
 * misura.
 */
export interface TalosCoreCluster {
    /** Il valore di `cpu_capacity` condiviso, o `-1` se il kernel tace. */
    capacity: number
    cores: number
}

export function talosCoreClusters(topology: TalosCpuTopology): readonly TalosCoreCluster[] {
    const core = Math.max(1, Math.floor(topology.cores) || 1)
    const capacities = topology.capacities.filter((c) => Number.isFinite(c) && c > 0)
    if (capacities.length === 0) return [{ capacity: -1, cores: core }]
    const conteggio = new Map<number, number>()
    for (const capacity of capacities) conteggio.set(capacity, (conteggio.get(capacity) ?? 0) + 1)
    return [...conteggio.entries()]
        .map(([capacity, cores]) => ({ capacity, cores }))
        .sort((a, b) => b.capacity - a.capacity)
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
     *
     * ⛔⛔ 2026-09-10 — LA PREMESSA DI QUESTA RIGA È IN DISCUSSIONE, e va detto
     * qui invece che scoperto due volte.
     *
     * «Metà» nasce da due misure che dicevano la generazione PIATTA nei thread:
     * l'8B (25,9 → 23,9 tok/s fra 2 e 8) e una nota sul Pad («due thread
     * valgono quanto sei»). Se è piatta, tanto vale prenderne pochi.
     *
     * Il banco del 2026-09-10 dice il contrario, con più giri e in alternanza
     * stretta (`.claude/TACCUINO-VELOCITA-LOCALE-2026-09-10.md`): fra 6 e 8
     * thread la generazione cambia del **15,4%**, con i range che **non si
     * sovrappongono** — cioè non è piatta affatto.
     *
     * ⛔ Ma quel banco **non ha misurato 4**, che è esattamente il numero che
     * questa riga produce su un chip a otto core. ⇒ Cambiarlo adesso vorrebbe
     * dire spostarsi da un punto non misurato a un altro punto scelto a
     * tavolino, e sarebbe la stessa classe di errore che il banco ha appena
     * smascherato. Il numero resta; la cella che manca è **`-t 4` contro
     * `-t 6` sulla generazione, in alternanza stretta**, ed è nel rapporto
     * come lavoro da fare sul Pad.
     */
    const meta = Math.max(MIN_THREADS, Math.round(core / 2))
    const threads = Math.min(threadsBatch, meta)

    /**
     * ⭐⭐⭐ Il microbatch: **512**, e il numero viene da due misure separate
     * da tredici giorni - la seconda dopo che una cura ha cambiato la fisica
     * del problema.
     *
     * Il commento che stava qui in origine aveva gia' capito il compromesso -
     * *l'attesa massima dello Stop e' un microbatch intero* - e sceglieva 512
     * su un telefono con molti core. Il ragionamento era giusto; non era mai
     * stato **verificato su una scheda grafica**.
     *
     * Misurato il 2026-08-20 su Adreno 830, prompt da 2.048 token, Stop
     * premuto dopo 200 ms. Il motore dichiarava dove si fermava:
     *
     * ```
     *   512 (com'era)  1.443 ms   si ferma a 512/2048 - pezzo intero completato
     *   256            1.446 ms   idem
     *   192            ~460 ms    si ferma a 0/2048 - morde a meta'
     *   128            ~290 ms
     * ```
     *
     * Il salto stava **fra 256 e 192**, un fattore tre - e quella misura aveva
     * scelto 192, dichiarando G4 rosso finche' la cura vera dell'abort (che
     * allora non esisteva ancora) non fosse arrivata.
     *
     * ⛔⛔ La cura e' arrivata il 21/8 (`ggml-opencl`,
     * `TALOS_OPENCL_ABORT_CHECK_STRIDE=16`: il motore ora guarda se deve
     * fermarsi ogni 16 righe DENTRO il batch, non solo a fine batch) - e il
     * 23/8 la stessa misura, ripetuta su un modello diverso (Qwen3-1.7B, non
     * una ripetizione: conferma indipendente), dice che il fenomeno che
     * giustificava 192 e' sparito:
     *
     * ```
     * ubatch | PP2048 tok/s | Stop-durante-prefill (mediana, prompt 2048)
     * -------+--------------+---------------------------------------------
     *  128   |    343       |   1 ms
     *  192   |    361       |   2 ms
     *  256   |    377       |   5 ms
     *  512   |    410       |   7 ms
     * ```
     *
     * Non c'e' piu' un salto: a QUALSIASI valore provato lo Stop resta a
     * singole cifre di millisecondi, ben sotto qualunque soglia di
     * percezione umana. La cura ha spostato il collo di bottiglia da «quanto
     * e' grande il pezzo» a «quanto spesso si controlla dentro il pezzo» - e
     * il secondo si e' gia' risolto.
     *
     * ⭐ Ricerca 23/8: **512 e' anche il default upstream** di llama.cpp per
     * `-ub` (non un numero TALOS-specifico), col «ginocchio» della curva
     * throughput/dimensione riportato fra 1024 e 2048 su prompt molto lunghi
     * - territorio che questa campagna non ha misurato sul Pad, quindi non
     * si sale oltre 512 senza una nuova misura. 256 resta il ripiego noto se
     * un device piu' povero andasse in pressione di memoria.
     *
     * ⇒ 512 domina 192 su ENTRAMBI gli assi: +13,7% di throughput di
     * prefill, e uno Stop che non e' piu' un compromesso. G4 non e' piu'
     * rosso per questo motivo.
     *
     * ⛔⛔ Lo stesso principio vale ora AL CONTRARIO: non si scende sotto 512
     * senza una nuova misura che lo giustifichi - questa tabella e' la
     * soglia, non un punto di partenza da cui negoziare per comodita'.
     */
    const microBatch = 512

    return {
        threads,
        threadsBatch,
        microBatch,
        candidates: talosThreadCandidatesFromTopology(topology),
    }
}

/**
 * ⭐⭐⭐ I candidati da misurare, e adesso ci sono anche i CONFINI DEI GRUPPI.
 *
 * ## Che cosa mancava, e come si è visto
 *
 * La lista di prima copriva quattro forme sensate — metà dei core, i core
 * forti, tutti tranne uno, tutti. Su un chip 6+2 come il OnePlus Pad 3 sono
 * `[2, 4, 7, 8]`, e **il sei non c'è**.
 *
 * Il banco `llama-bench` del 2026-09-10 sullo stesso Pad
 * (`.claude/TACCUINO-VELOCITA-LOCALE-2026-09-10.md`, sezione «6 THREAD FANNO
 * +15,4% DI GENERAZIONE»), Q4_0, alternanza stretta, 4 cicli × 2 ripetizioni:
 *
 * ```text
 *   -t 8   generazione 53,33 tok/s   [51,1 - 55,1]
 *   -t 6   generazione 61,52 tok/s   [59,5 - 65,6]   ⇒ +15,4%, range DISGIUNTI
 * ```
 *
 * ⇒ Il punto migliore misurato su questo dispositivo era **fuori dalla griglia
 * che questa funzione produce**. Una misura che non può proporre il vincitore
 * non è una misura: è una cerimonia, lo stesso difetto già corretto una volta
 * in `talosScegliThread` qui sotto.
 *
 * ## ⛔ Perché il rimedio NON è scrivere «6»
 *
 * `6` su un Pad a otto core non è una costante: è *il gruppo di core uguali
 * fra loro*, cioè un fatto che `cpu_capacity` dichiara e che su un altro
 * telefono vale un altro numero. Owner 2026-08-05: «TALOS è dinamico e
 * adattabile a ogni modello — una cosa scritta a mano non potrebbe mai
 * esistere». Quindi si aggiungono i **confini**, calcolati:
 *
 *  - la dimensione di ogni gruppo preso da solo (sul Pad: 2 e 6);
 *  - la somma cumulativa dai più forti in giù (sul Pad: 2 e 8).
 *
 * Sul Pad la griglia diventa `[2, 4, 6, 7, 8]` — cinque celle invece di
 * quattro, e il vincitore misurato è dentro. Su un chip omogeneo i confini
 * coincidono col totale e non si aggiunge nemmeno una cella.
 *
 * ⛔ E non si aggiunge nient'altro: ogni cella costa un prefill vero e azzera
 * la conversazione in memoria (`talosMeasureThreadTuning`). Una griglia fitta
 * misurerebbe meglio e la pagherebbe chi voleva solo scrivere un messaggio.
 */
export function talosThreadCandidatesFromTopology(
    topology: TalosCpuTopology,
): readonly number[] {
    const core = Math.max(1, Math.floor(topology.cores) || 1)
    const forti = talosStrongCores(topology)
    const meta = Math.max(MIN_THREADS, Math.round(core / 2))
    const threadsBatch = Math.max(MIN_THREADS, core - 1)

    const confini: number[] = []
    let cumulativo = 0
    for (const cluster of talosCoreClusters(topology)) {
        confini.push(cluster.cores)
        cumulativo += cluster.cores
        confini.push(cumulativo)
    }

    return [...new Set([
        MIN_THREADS,
        meta,
        Math.max(MIN_THREADS, forti),
        threadsBatch,
        core,
        ...confini,
    ])].filter((n) => n >= MIN_THREADS && n <= core).sort((a, b) => a - b)
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
