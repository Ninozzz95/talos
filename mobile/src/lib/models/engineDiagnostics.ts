import type { TalosModelShape } from '@/lib/models/fit'
import { TALOS_PREFIX_TOTAL_BYTES } from '@/lib/models/prefixCache'

/**
 * Il motore locale, raccontato a chi deve capire perché è lento.
 *
 * ## Perché esiste
 *
 * Owner 2026-08-06: «dobbiamo espandere il doctor con funzioni diagnostiche
 * avanzate, soprattutto per quanto riguarda i modelli locali».
 *
 * Aveva ragione, e la prova è arrivata poche ore prima: dal suo registro si
 * leggeva **111 secondi** prima della prima parola e **195 millisecondi** ai
 * giri successivi dello stesso invio. Tutti i numeri per capire il perché
 * esistevano già — li misura il motore da stamattina — e **non erano visibili
 * da nessuna parte**. Una misura che nessuno può leggere è una misura che non è
 * stata presa.
 *
 * ## Quali righe, e perché queste
 *
 * La lista viene dal capitolo «metriche da raccogliere» della ricerca
 * sull'ottimizzazione, ridotto a ciò che questo dispositivo sa già dire senza
 * un profiler attaccato. Il criterio di ogni riga è uno solo: **se questa riga
 * dicesse un valore diverso, cambierebbe cosa faccio dopo?** Se no, è rumore, e
 * il rumore in una schermata diagnostica costa più di quanto renda — perché
 * insegna a non leggerla.
 *
 * ## ⛔ Cosa NON entra
 *
 * Il testo dei messaggi, le istruzioni delle attività, i nomi dei file
 * personali. Il Doctor si copia negli appunti e finisce in una chat di supporto:
 * ciò che contiene deve poter essere letto da un estraneo. I percorsi dei
 * modelli sì — sono nomi pubblici di file scaricati da un catalogo pubblico — ma
 * ridotti al nome, perché un percorso intero è illeggibile e non aggiunge nulla.
 */

export interface TalosEngineDiagnosticRow {
    id: string
    /** La chiave i18n dell'etichetta. */
    labelKey: string
    value: string
    /**
     * `false` solo quando c'è qualcosa da fare. Una riga informativa che si
     * dipinge di rosso insegna a ignorare il rosso.
     */
    ok: boolean
}

export interface TalosEngineFacts {
    available: boolean
    backends: string
    loadedPath: string | null
    shape: TalosModelShape | null
    kvCacheType: string | null
    opensSinceStart: number | null
    /** Quante volte il contesto è stato rifatto tenendo il modello in memoria. */
    contextRebuilds: number | null
    threads: number | null
    threadsBatch: number | null
    microBatch: number | null
    contextTokens: number | null
    /**
     * ⛔ IL TERZO CRONOMETRO. Quanto è costata l'ultima apertura, e se i pesi
     * erano già in memoria.
     *
     * Owner 2026-08-07: due minuti per «ciao» con un 1,7B Q4 su un OnePlus 13.
     * Il numero contraddiceva le nostre misure — primo token a 126 ms dopo
     * 8A/8B/8C — e la contraddizione era tutta qui: le nostre erano a modello
     * GIÀ CARICATO, e il caricamento non lo cronometrava nessuno.
     *
     * I due campi stanno insieme perché separati non dicono niente: 800 ms è
     * ottimo per rileggere un gigabyte dal disco e pessimo per un contesto
     * rifatto.
     */
    lastOpenMs: number | null
    lastOpenReusedWeights: boolean | null
    /**
     * ⭐ I prefissi congelati: quanti e quanto occupano.
     *
     * Sta nel Doctor e NON fra i modelli, di proposito: un file da quasi un
     * gigabyte nell'elenco dei modelli sembrerebbe un modello scaricato per
     * sbaglio, e chi lo cancellasse si troverebbe la chat più lenta senza
     * capire perché. Lo spazio va mostrato — nascosto sarebbe peggio — ma
     * dove si mostrano le cache.
     */
    prefixCacheCount: number | null
    prefixCacheBytes: number | null
    contextCeiling: number | null
    /** Gli stadi dell'ultima generazione, se ce n'è stata una. */
    timings: {
        tokenizeMs: number
        prefixMs: number
        prefillMs: number
        firstTokenMs: number
        totalMs: number
        promptTokens: number
        reusedTokens: number
        newTokens: number
        producedTokens: number
        reusedContext: boolean
        /** ⛔ Il motore non SAPEVA tagliare la KV: vedi `localEngine`. */
        partialTrimRefused?: boolean
    } | null
    cpuCores: number | null
    cpuCapacities: readonly number[]
    installedTotal: number
    installedConversational: number
}

function nomeFile(path: string | null): string {
    if (!path) return ''
    const pezzi = path.split('/')
    return pezzi[pezzi.length - 1] ?? path
}

function millisecondi(value: number): string {
    if (value < 0) return '—'
    return value >= 1_000 ? `${(value / 1_000).toFixed(1)}s` : `${Math.round(value)}ms`
}

/**
 * Quanto pesa la cache per un token, in byte.
 *
 * Il numero che ridimensiona ogni discussione sul contesto: per un modello da
 * 28 strati, 8 teste KV e testa da 128 sono **112 KiB per token**, cioè oltre un
 * gigabyte e mezzo a quattordicimila token. Mostrarlo evita di chiedersi perché
 * un contesto «solo» di 16k non ci sta.
 */
export function talosKvBytesPerTokenOf(shape: TalosModelShape): number {
    return shape.layers * shape.kvHeads * shape.headDim * 2 * shape.kvBytesPerElement
}

function byteLeggibili(bytes: number): string {
    if (bytes >= 1_000_000_000) return `${(bytes / 1_000_000_000).toFixed(2)} GB`
    if (bytes >= 1_000_000) return `${Math.round(bytes / 1_000_000)} MB`
    if (bytes >= 1_000) return `${Math.round(bytes / 1_000)} KB`
    return `${Math.round(bytes)} B`
}

function talosPercentualeHeadroom(valore: number | null): string {
    return valore === null ? '—' : `${Math.round(valore)}%`
}

/**
 * P2-3 — una riga sola, coi segnali GREZZI (non lo stato dell'isteresi,
 * che ha bisogno di più campioni nel tempo — vedi
 * `localPerformanceGovernor.ts`). `null` se il device non ha dato
 * nessuna lettura per nessun campo: mostrare una riga di soli «—» non
 * cambierebbe cosa fa dopo chi legge, quindi non è una riga (§ "se
 * dicesse un valore diverso" in testa a questo file).
 */
export function talosPerformanceHeadroomRow(segnali: {
    cpuHeadroom: number | null
    gpuHeadroom: number | null
    thermalHeadroom: number | null
    thermalStatus: 'none' | 'light' | 'moderate' | 'severe' | 'critical' | null
}): TalosEngineDiagnosticRow | null {
    if (segnali.cpuHeadroom === null && segnali.gpuHeadroom === null
        && segnali.thermalHeadroom === null && segnali.thermalStatus === null) {
        return null
    }
    const pressioneTermicaReale = segnali.thermalStatus === 'severe' || segnali.thermalStatus === 'critical'
    return {
        id: 'engine-performance-headroom',
        labelKey: 'doctor.performanceHeadroom',
        value: `CPU ${talosPercentualeHeadroom(segnali.cpuHeadroom)} · `
            + `GPU ${talosPercentualeHeadroom(segnali.gpuHeadroom)} · `
            + `termico ${talosPercentualeHeadroom(segnali.thermalHeadroom)} `
            + `(${segnali.thermalStatus ?? 'n/d'})`,
        // `false` solo con una VERA pressione termica: '—' per un'API sotto
        // soglia non è un problema da segnalare in rosso, è semplicemente un
        // dato che questo device non sa dare.
        ok: !pressioneTermicaReale,
    }
}

export function talosEngineDiagnosticRows(facts: TalosEngineFacts): TalosEngineDiagnosticRow[] {
    const rows: TalosEngineDiagnosticRow[] = []

    rows.push({
        id: 'engine',
        labelKey: 'doctor.engineLibrary',
        value: facts.available
            ? (facts.backends || 'CPU')
            : '—',
        ok: facts.available,
    })

    rows.push({
        id: 'engine-model',
        labelKey: 'doctor.engineModel',
        value: facts.loadedPath ? nomeFile(facts.loadedPath) : '—',
        // Nessun modello aperto è normale: si apre al primo messaggio.
        ok: true,
    })

    if (facts.shape) {
        rows.push({
            id: 'engine-shape',
            labelKey: 'doctor.engineShape',
            value: `${facts.shape.layers}×${facts.shape.kvHeads}×${facts.shape.headDim}`
                + ` · ${byteLeggibili(facts.shape.weightBytes)}`
                + ` · ${facts.shape.trainedContext} tok`,
            ok: true,
        })
        rows.push({
            id: 'engine-kv-cost',
            labelKey: 'doctor.engineKvCost',
            value: `${byteLeggibili(talosKvBytesPerTokenOf(facts.shape))}/tok`
                + (facts.kvCacheType ? ` · ${facts.kvCacheType}` : ''),
            ok: true,
        })
    }

    /**
     * ⛔ La riga che avrebbe fatto risparmiare cento secondi.
     *
     * Due aperture in una sessione in cui si è mandato un messaggio solo
     * significa che i pesi sono stati caricati e buttati e ricaricati. Non è un
     * sospetto: è la lettura diretta di un contatore.
     */
    if (facts.opensSinceStart !== null) {
        rows.push({
            id: 'engine-opens',
            labelKey: 'doctor.engineOpens',
            value: String(facts.opensSinceStart)
                + (facts.contextRebuilds ? ` · ${facts.contextRebuilds} contesti rifatti` : ''),
            ok: true,
        })
    }

    /**
     * ⛔ Il tempo che nessuno misurava, e che vale i due minuti.
     *
     * Le cinque fasi qui sotto partono tutte da un modello **già in memoria**.
     * Chi manda il primo messaggio dopo aver scelto un modello paga prima di
     * tutto questo — leggere un gigabyte dal disco e mapparlo — e finora quel
     * tempo non compariva da nessuna parte: si vedeva solo un contatore che
     * diceva QUANTE aperture, mai quanto costano.
     *
     * Va letto insieme al riuso: la stessa cifra è ottima o pessima a seconda
     * che i pesi fossero già lì. Per questo la riga lo dice, invece di lasciare
     * un numero nudo che ognuno interpreta come vuole.
     *
     * ⛔ E la soglia: **oltre due secondi con i pesi già in memoria** non è
     * lentezza, è un contesto che si sta ricostruendo quando non dovrebbe.
     */
    // ⛔ `!== null` NON basta: `undefined` lo supera, e da lì la riga mostra
    // «NaNms». Sembra pedanteria e non lo è — i test non passano dal typecheck
    // (`tsconfig.app.json` include solo `src/**`), quindi un oggetto di prova a
    // cui manca un campo non lo segnala nessuno, e questa riga l'ha scoperto.
    if (typeof facts.lastOpenMs === 'number' && Number.isFinite(facts.lastOpenMs)) {
        const riuso = facts.lastOpenReusedWeights === true
        rows.push({
            id: 'engine-open-time',
            labelKey: 'doctor.engineOpenTime',
            value: millisecondi(facts.lastOpenMs)
                + (facts.lastOpenReusedWeights === null
                    ? ''
                    : riuso ? ' · pesi già in memoria' : ' · letto dal disco'),
            ok: !riuso || facts.lastOpenMs <= 2_000,
        })
    }

    /**
     * ⛔ La riga che rende visibile lo spazio che ci prendiamo.
     *
     * Un prefisso congelato toglie 150 secondi di attesa a ogni chat nuova e in
     * cambio occupa quasi un gigabyte. È un baratto che conviene, ma è un
     * baratto: chi lo paga deve poterlo vedere, e la riga diventa rossa quando
     * supera il tetto che ci siamo dati — cioè quando lo sfratto non sta
     * facendo il suo mestiere.
     */
    if (facts.prefixCacheCount !== null && facts.prefixCacheCount > 0) {
        rows.push({
            id: 'engine-prefix-cache',
            labelKey: 'doctor.enginePrefixCache',
            value: `${facts.prefixCacheCount} · ${byteLeggibili(facts.prefixCacheBytes ?? 0)}`,
            ok: (facts.prefixCacheBytes ?? 0) <= TALOS_PREFIX_TOTAL_BYTES,
        })
    }

    if (facts.threads !== null || facts.threadsBatch !== null) {
        rows.push({
            id: 'engine-threads',
            labelKey: 'doctor.engineThreads',
            value: `${facts.threads ?? '—'} gen / ${facts.threadsBatch ?? '—'} prefill`
                + (facts.microBatch ? ` · µbatch ${facts.microBatch}` : ''),
            // I due numeri UGUALI sono il difetto che abbiamo appena tolto: due
            // carichi opposti con la stessa configurazione. Se ricompare, si vede.
            ok: facts.threads === null || facts.threadsBatch === null
                || facts.threads !== facts.threadsBatch,
        })
    }

    if (facts.contextTokens !== null || facts.contextCeiling !== null) {
        rows.push({
            id: 'engine-context',
            labelKey: 'doctor.engineContext',
            value: `${facts.contextTokens ?? '—'} / ${facts.contextCeiling ?? '—'}`,
            /**
             * ⛔ Il contesto in uso che SUPERA il tetto attuale è un avviso vero.
             *
             * Vuol dire che è stato allocato quando c'era più memoria libera, e
             * che adesso il dispositivo non lo concederebbe. Non è un guasto —
             * sta funzionando — ma è la condizione in cui il sistema uccide il
             * processo a metà risposta, e vale la pena vederla prima invece di
             * dedurla da un crash.
             *
             * MISURATO sul Pad: 8192 in uso contro 2304 di tetto, con sette
             * modelli sul disco e uno caricato.
             */
            ok: !(facts.contextTokens !== null && facts.contextCeiling !== null
                && facts.contextTokens > facts.contextCeiling),
        })
    }

    /**
     * ⭐ La riga più importante di tutte: **quale dei cinque stadi** si è preso
     * il tempo.
     *
     * «Nove secondi» non è una diagnosi. Prefisso alto e prefill basso vuol dire
     * che si sta ricalcolando ciò che era già in memoria; prefill alto con
     * prefisso a zero vuol dire che il prompt è grande davvero; primo token
     * lontano dal prefill vuol dire scheduler o pesi ancora freddi. Tre malattie,
     * tre cure diverse.
     */
    if (facts.timings) {
        const t = facts.timings
        rows.push({
            id: 'engine-stages',
            labelKey: 'doctor.engineStages',
            value: `tok ${millisecondi(t.tokenizeMs)}`
                + ` · pref ${millisecondi(t.prefixMs)}`
                + ` · prefill ${millisecondi(t.prefillMs)}`
                + ` · 1° tok ${millisecondi(t.firstTokenMs)}`
                + ` · tot ${millisecondi(t.totalMs)}`,
            ok: true,
        })
        rows.push({
            id: 'engine-reuse',
            labelKey: 'doctor.engineReuse',
            value: t.partialTrimRefused === true
                ? `0 / ${t.promptTokens} — questo modello non sa riusare la cache`
                : `${t.reusedTokens} / ${t.promptTokens} riusati`
                    + ` · ${t.newTokens} nuovi · ${t.producedTokens} prodotti`,
            /**
             * ⛔ Zero riusati su un prompt lungo E' il difetto: vuol dire che si sta
             * ripagando il prefill di tutta la conversazione. Sul primo turno e'
             * normale - non c'era niente da riusare - e per questo la soglia
             * guarda quanti token nuovi ci sono, non solo il riuso.
             *
             * ⭐⭐⭐ MA prima di accusare si chiede al motore SE POTEVA.
             *
             * ⛔⛔ `partialTrimRefused` dice che `llama_memory_seq_rm` ha rifiutato
             * il taglio parziale. Succede per costruzione sulle architetture con
             * KV condivisa fra gli ultimi strati - la famiglia Gemma -, e
             * `ggml-org/llama.cpp#21468` documenta che li' il riuso **non e'
             * supportato**, nemmeno con flash attention e SWA piena.
             *
             * ⇒ Accusare quel caso vorrebbe dire tenere una riga rossa che nessuno
             * puo' far diventare verde. Un allarme cosi' viene spento al terzo
             * squillo, e con lui se ne va anche quello vero. ⛔ La riga resta e
             * dice **perche'**: e' un fatto sul modello, non una colpa.
             */
            ok: t.partialTrimRefused === true
                || !t.reusedContext || t.reusedTokens > 0 || t.newTokens < 1_000,
        })
    }

    if (facts.cpuCores !== null) {
        const forti = facts.cpuCapacities.length > 0
            ? facts.cpuCapacities.filter((c) => c >= Math.max(...facts.cpuCapacities) * 0.9).length
            : null
        rows.push({
            id: 'engine-cpu',
            labelKey: 'doctor.engineCpu',
            value: `${facts.cpuCores} core`
                + (forti === null ? '' : ` · ${forti} forti`)
                + (facts.cpuCapacities.length ? ` · ${facts.cpuCapacities.join('/')}` : ''),
            ok: true,
        })
    }

    /**
     * Quanti file ci sono e quanti sono davvero modelli.
     *
     * La differenza fra i due numeri sono i **proiettori**: GGUF validi con cui
     * non si parla. Mostrarla evita la domanda «perché ne vedo cinque nella
     * cartella e quattro nel selettore».
     */
    rows.push({
        id: 'engine-installed',
        labelKey: 'doctor.engineInstalled',
        value: facts.installedConversational === facts.installedTotal
            ? String(facts.installedTotal)
            : `${facts.installedConversational} / ${facts.installedTotal}`,
        ok: true,
    })

    return rows
}
