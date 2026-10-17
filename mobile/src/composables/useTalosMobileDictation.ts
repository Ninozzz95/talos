import { computed, ref, type ComputedRef, type Ref } from 'vue'
import { Capacitor } from '@capacitor/core'
import { talosDettaturaAnnota, talosDictationEngine, type TalosDictationEngine } from '@/services/dictation'
import type { TalosDictationErrorCode } from '@/lib/dictationPolicy'

/**
 * F2-T5 — dictation state for the composer. Live partials compose onto the
 * draft text captured AT START (so typing before dictating is never lost),
 * permission and availability stay honest, stop/end always return to idle.
 */
export type TalosMobileDictationStatus = 'idle' | 'starting' | 'listening' | 'error'

export interface UseTalosMobileDictationOptions {
    /** Current draft text — captured once when listening starts. */
    base: () => string
    /** Receives the FULL composed draft (base + live transcript). */
    onTranscript: (text: string) => void
    engine?: TalosDictationEngine
    /**
     * N12 — chiede il motore locale (Parakeet) quando il suo modello è sul telefono: il testo giusto arriva dopo lo stop.
     * Lo chiede solo chi è fatto per aspettarlo: chat e Codice, e la barra dell'assistente insieme a `chiudeAlSilenzio`
     * (senza, la sua cattura non finirebbe mai da sola: DICT-N12-01).
     */
    motoreLocale?: boolean
    /** Injectable for tests; defaults to the real platform check. */
    native?: boolean
    /** Resolved at start so a persisted language change applies next session. */
    language?: () => string | undefined
    /** ⭐ Il motore decide la lingua ascoltando, e la cambia a meta' frase. */
    autoLanguage?: () => boolean
    /** Fra quali lingue puo' muoversi: mai piu' di tre. */
    allowedLanguages?: () => readonly string[]
    /**
     * ⛔ Ferma la voce prima di ascoltare. Chi parla tace quando l'altro
     * comincia: senza, la lettura in corso ruba l'audio al riconoscitore e la
     * dettatura fallisce in 500 ms senza nemmeno partire (misurato).
     */
    zittisci?: () => void | Promise<void>
    /**
     * ⛔ Quanto silenzio prima che il motore chiuda il turno, in ms. Chi vuole
     * un ascolto CONTINUO deve dirlo al motore, non riaprirlo di continuo:
     * `startListening` richiamata a raffica fallisce in silenzio, ed è il
     * difetto che l'owner ha visto l'11 agosto («l'ascolto resta ma non capisce
     * niente»).
     */
    silenceMillis?: () => number | undefined
    minimumMillis?: () => number | undefined
    /**
     * N12 — «a turno»: il motore locale chiude da sé quando chi parla tace (la barra dell'assistente). Il riconoscitore di
     * sistema lo fa già per conto suo; chat e Codice non lo chiedono, lì la dettatura la chiude la persona.
     */
    chiudeAlSilenzio?: () => boolean
    /** Live locale boundary; raw plugin prose never becomes application UI. */
    errorMessage?: (code: TalosDictationErrorCode) => string
    /**
     * N12 — il motore locale non ha potuto fare la sua parte e il testo è quello del riconoscitore di sistema: non è un
     * errore (il testo c'è), ma chi detta deve poterlo sapere. Arriva il codice del motivo; la frase la sceglie chi compone.
     */
    onFallback?: (code: string) => void
}

export interface TalosMobileDictation {
    supported: Ref<boolean>
    /** F4-#18: on native the mic is ALWAYS visible — failures surface at tap. */
    visible: ComputedRef<boolean>
    status: Ref<TalosMobileDictationStatus>
    error: Ref<string | null>
    /**
     * ⛔ Il CODICE accanto alla frase: la schermata deve poter distinguere «non
     * hai parlato» da «si è rotto qualcosa» per non colorare di rosso un esito
     * normale — owner 2026-08-10, misurato sul Pad.
     */
    errorCode: Ref<TalosDictationErrorCode | null>
    /** F5.2 waveform: 0..1, spikes on incoming speech, decays to a listening floor. */
    level: Ref<number>
    /**
     * N12 — vero quando la fine della dettatura l'ha decisa un motore che attende il finale (il locale), dopo parole
     * sentite: il testo giusto è già scritto, e chi sta sopra può mandare subito (owner 13/10/2026: «Via l'attesa di
     * sicurezza»). Col riconoscitore di sistema resta falso. Torna falso a ogni dettatura nuova.
     */
    chiusaDalMotore: Ref<boolean>
    toggle(): Promise<void>
    /** SF5-3: silent teardown (send-time cleanup) — no messages, no resurrection. */
    cancel(): void
    /**
     * N12 — chiude la dettatura per USARNE il testo (invio): se il motore dà il testo giusto dopo lo stop, lo aspetta
     * (mai più di qualche secondo); altrimenti è come `cancel`.
     */
    finisci(): Promise<void>
}

export function useTalosMobileDictation(options: UseTalosMobileDictationOptions): TalosMobileDictation {
    const engine = options.engine ?? talosDictationEngine({ locale: options.motoreLocale === true })
    const native = options.native ?? Capacitor.isNativePlatform()
    const supported = ref(false)
    const status = ref<TalosMobileDictationStatus>('idle')
    const error = ref<string | null>(null)
    /**
     * ⛔ QUALE esito, non solo che testo — owner 2026-08-10, dal Pad.
     * Il silenzio e' un esito normale e non va vestito da guasto: la schermata
     * ha bisogno del CODICE per scegliere il colore, non della frase.
     */
    const errorCode = ref<TalosDictationErrorCode | null>(null)
    const defaultErrorMessages: Record<TalosDictationErrorCode, string> = {
        permissionDenied: 'Microphone permission is required.',
        unavailable: 'Dictation unavailable.',
        recognitionFailed: 'Speech recognition failed.',
        startFailed: 'Speech recognition failed to start.',
        startTimeout: 'Speech did not hear anything.',
        noSpeech: 'No speech heard. Try again.',
        stoppedResponding: 'Speech stopped responding. Try again.',
    }
    const messageFor = (code: TalosDictationErrorCode): string =>
        options.errorMessage?.(code) ?? defaultErrorMessages[code]

    // F5.2 waveform — the maintained fork exposes no RMS (upstream ticket
    // filed): the level is driven by the REAL signal we do have, incoming
    // speech. Spike on partials (scaled by new characters), exponential decay
    // to a quiet listening floor, hard zero when the session ends.
    const level = ref(0)
    const chiusaDalMotore = ref(false)
    const LEVEL_FLOOR = 0.12
    let decayTimer: ReturnType<typeof setInterval> | null = null
    let lastPartialLength = 0

    function startLevel(): void {
        lastPartialLength = 0
        level.value = LEVEL_FLOOR
        if (decayTimer !== null) clearInterval(decayTimer)
        decayTimer = setInterval(() => {
            level.value = Math.max(LEVEL_FLOOR, level.value * 0.82)
        }, 120)
    }

    function speechLevelSpike(text: string): void {
        // ⛔ RIPIEGO, non la strada principale: sul web non esiste un livello del
        // microfono, e li' l'unico segnale vero e' quanto cresce il trascritto.
        // Sul telefono arriva `onLevel` col volume, e questa non serve piu'.
        if (volumeVero) return
        const grown = Math.max(0, text.length - lastPartialLength)
        lastPartialLength = text.length
        level.value = Math.min(1, Math.max(level.value, 0.4 + Math.min(0.5, grown * 0.06)))
    }

    /**
     * ⭐⭐ IL VOLUME, NORMALIZZATO SU QUELLO CHE SI SENTE DAVVERO.
     *
     * Owner 2026-08-12: «la waveform reagisce in base al volume». Android manda
     * `onRmsChanged` in dB, ma **non dichiara la scala**: sui documenti non c'e'
     * un fondo scala, e fra un microfono e l'altro cambia. Inchiodare due numeri
     * qui vorrebbe dire scrivere a mano un fatto sul dispositivo — e allora la
     * barra resterebbe piatta su un telefono e satura su un altro.
     *
     * ## ⛔ Il primo tentativo era una finestra TUTTA adattiva, ed era piatta
     *
     * Minimo e massimo visti in questa sessione: sembra la cosa più onesta ed è
     * fragile nel modo peggiore, perché si tara sul PRIMO campione. MISURATO sul
     * Pad il 12 agosto, con la sonda qui sotto:
     *
     *     primo volume dal microfono db=7.00   ⇒ dbMin = dbMax = 7
     *     stanza muta, db≈1.0                  ⇒ (1,0−0,5)/6,5 = 0,077
     *     barra alta 3,7 px su 24              ⇒ una linea punteggiata
     *
     * Il riconoscitore apre con un valore alto — la sua taratura, non la voce —
     * e da lì in poi tutto il parlato normale resta schiacciato in fondo.
     *
     * ⇒ Si parte dai bordi EMPIRICI qui sotto e la finestra può solo
     * **allargarsi**. Così la scala è giusta al primo campione su qualunque
     * telefono, e un dispositivo fuori scala si sistema da solo — che è quello
     * che la versione tutta adattiva non poteva essere.
     */
    let volumeVero = false
    /**
     * ⭐ I bordi EMPIRICI, e non li ho scelti io: `Cleveroad/WaveInApp` fa questo
     * mestiere in produzione e usa `MIN_RMS_DB_VALUE = -2.12f`,
     * `MAX_RMS_DB_VALUE = 10.0f`. Combaciano con quello che ho misurato in
     * logcat su questo dispositivo: stanza muta fra 0,4 e 2,2, picchi oltre 7.
     */
    const DB_MUTO = -2.12
    const DB_PIENO = 10
    /** Sotto questa escursione il rumore di fondo diventerebbe barra piena. */
    const ESCURSIONE_MINIMA = 4
    let dbMin = DB_MUTO
    let dbMax = DB_PIENO

    function realLevel(db: number): void {
        if (!Number.isFinite(db)) return
        /*
         * ⛔ UNA riga per sessione, e serve a rispondere alla sola domanda che
         * conta quando l'onda resta piatta: «gli eventi ARRIVANO?». Senza,
         * «piatta» significa allo stesso modo motore muto, ponte che non
         * consegna, e normalizzazione sbagliata — tre cure diverse.
         */
        if (!volumeVero) talosDettaturaAnnota(`dett: primo volume dal microfono db=${db.toFixed(2)}`)
        volumeVero = true
        if (decayTimer !== null) { clearInterval(decayTimer); decayTimer = null }
        /*
         * ⛔⛔ IL FONDO SI ALLARGA E BASTA; IL TETTO SCENDE PIANO VERSO LA TUA VOCE.
         *
         * Owner 2026-08-12, dopo la correzione precedente: «la waveform non è
         * alta come prima». Vero, ed era una conseguenza diretta: passando ai
         * bordi fissi -2,12..10 dB, una voce normale a ~5-7 dB finiva a 0,59
         * invece che quasi a fondo scala. Il fondo scala era diventato quello di
         * un URLO, e nessuno urla al telefono.
         *
         * ⛔ Ma tornare alla finestra tutta adattiva è escluso: si tarava sul
         * PRIMO campione e l'onda restava piatta (misurato: `db=7.00` in
         * apertura, poi tutto schiacciato a 0,077).
         *
         * ⇒ I due bordi si comportano in modo DIVERSO, perché rispondono a due
         * domande diverse:
         *   - il **fondo** è il silenzio di questa stanza: si allarga verso il
         *     basso e non risale mai, se no il rumore verrebbe amplificato;
         *   - il **tetto** è quanto forte parli TU: parte dal valore empirico e
         *     scende piano verso i picchi veri, come fa il guadagno automatico
         *     di un misuratore di livello. Chi parla piano riempie la barra
         *     quanto chi parla forte, che è il punto di una waveform.
         *
         * Lo 0,6% per campione a ~12 campioni al secondo fa ~7% al secondo: in
         * pochi secondi la scala è la tua, e un picco isolato la rialza subito.
         */
        if (db < dbMin) dbMin = db
        if (db > dbMax) {
            dbMax = db
        } else {
            const sceso = dbMax - (dbMax - dbMin) * 0.006
            // ⛔ Un'escursione minima, se no il respiro diventa fondo scala.
            dbMax = Math.max(sceso, dbMin + ESCURSIONE_MINIMA)
        }
        level.value = Math.min(1, Math.max(0, (db - dbMin) / (dbMax - dbMin)))
    }

    function stopLevel(): void {
        if (decayTimer !== null) clearInterval(decayTimer)
        decayTimer = null
        level.value = 0
        // ⛔ La finestra del volume NON si eredita: una stanza diversa, o una
        // voce diversa, hanno un fondo e un tetto diversi.
        dbMin = DB_MUTO
        dbMax = DB_PIENO
    }

    // Owner report (2026-07-23): the availability probe runs at app start,
    // when Android's RecognitionService binding may not be ready yet — a
    // single early "false" hid the mic forever. Retry with backoff; if the
    // device genuinely has no recognizer it stays honestly hidden.
    async function probeSupported(attempt = 0): Promise<void> {
        try {
            supported.value = await engine.supported()
        } catch {
            supported.value = false
        }
        if (!supported.value && attempt < 3) {
            setTimeout(() => { void probeSupported(attempt + 1) }, [1000, 3000, 8000][attempt])
        }
    }
    void probeSupported()

    // F5-#29 liveness: with partialResults the native plugin resolves start()
    // BEFORE listening and swallows runtime recognizer errors (reject on a
    // released call + stopListening() emits no event). The composable owns
    // liveness: 'starting' at tap, 'listening' only on a real signal, an 8s
    // watchdog when no signal ever arrives, and an honest message when the
    // session ends without a single recognized word.
    const START_WATCHDOG_MS = 8000
    // SF5-2: the plugin can die silently DURING listening too (errors reject a
    // released call, stopListening emits nothing) — an inactivity window with
    // no partial ends the session honestly.
    const LISTENING_INACTIVITY_MS = 15000
    let watchdog: ReturnType<typeof setTimeout> | null = null
    let heardAnything = false
    /** La bozza che c'era nel campo quando questa dettatura è partita (serve a ricomporre il testo finale). */
    let basePresa = ''
    // SF5-1/3: the native stop() promise may NEVER settle (plugin never
    // resolves the call) and late events from a dead session must be inert —
    // every session gets an epoch; stale events are dropped.
    let sessionEpoch = 0
    /**
     * N12 — la sessione appena fermata di cui si aspetta ancora UN testo: quello giusto, che il motore locale dà dopo lo
     * stop. `scritto` è ciò che la dettatura ha messo nel campo per ultimo: se la persona l'ha toccato, il finale non si applica.
     */
    let finaleAtteso: { epoch: number, base: string, scritto: string } | null = null
    let ultimoScritto = ''
    /** Oltre questo l'invio non aspetta più: sul Pad Parakeet risponde in meno di un secondo, col modello già caricato. */
    const TETTO_DEL_FINALE_MS = 8000

    function clearWatchdog(): void {
        if (watchdog !== null) clearTimeout(watchdog)
        watchdog = null
    }

    function stopEngineBestEffort(): void {
        void engine.stop().catch(() => undefined)
    }

    function armListeningWatchdog(epoch: number): void {
        clearWatchdog()
        watchdog = setTimeout(() => {
            if (epoch !== sessionEpoch || status.value !== 'listening') return
            // N12 (Pad, 13/10/2026): col motore locale la cattura non finisce da sola. Un silenzio lungo lì NON è un guasto:
            // è la fine normale della dettatura, e il testo giusto (Parakeet) deve ancora arrivare.
            if (engine.attendeIlFinale === true) {
                talosDettaturaAnnota('dett: silenzio lungo, chiudo e aspetto il testo finale')
                aspettaIlFinale()
                sessionEpoch += 1
                status.value = 'idle'
                stopLevel()
                stopEngineBestEffort()
                return
            }
            talosDettaturaAnnota('dett: CANE DA GUARDIA, nessuna parziale da troppo')
            stopEngineBestEffort()
            sessionEpoch += 1
            status.value = 'error'
            error.value = messageFor('stoppedResponding')
            errorCode.value = 'stoppedResponding'
        }, LISTENING_INACTIVITY_MS)
    }

    async function start(): Promise<void> {
        error.value = null
        errorCode.value = null
        // ⛔⛔ CHI PARLA TACE, quando l'altro comincia — owner 2026-08-10, sul Pad:
        // «subito dopo che mi risponde, se lo premo di nuovo mi spunta l'errore».
        //
        // MISURATO, la finestra e' esattamente quella in cui TALOS sta ancora
        // leggendo: premendo il microfono a 200 ms e a 1.500 ms dall'inizio
        // della lettura arriva `recognitionFailed` in 500 ms — SEMPRE lo stesso
        // tempo, e in logcat il riconoscitore non compare affatto: non parte
        // proprio. Lasciando finire la voce, invece, parte e dice
        // `NO_SPEECH_DETECTED`, che e' il comportamento giusto.
        //
        // ⇒ La voce e il microfono si contendono l'audio, e non e' un caso
        // limite: era una cosa che MANCAVA. Nessuna riga, in tutta l'app,
        // fermava la lettura prima di ascoltare — mentre ogni assistente
        // vocale fa il contrario, e chi detta si aspetta che TALOS stia zitto.
        //
        // ⛔ Si ferma PRIMA di chiedere il permesso: la scheda del permesso puo'
        // restare aperta secondi, e nel frattempo la voce continuerebbe a
        // parlare sopra a una domanda che aspetta una risposta.
        await options.zittisci?.()
        const granted = await engine.requestPermission()
        if (!granted) {
            status.value = 'error'
            error.value = messageFor('permissionDenied')
            errorCode.value = 'permissionDenied'
            return
        }
        const capturedBase = options.base().trim()
        finaleAtteso = null
        ultimoScritto = ''
        heardAnything = false
        chiusaDalMotore.value = false
        status.value = 'starting'
        sessionEpoch += 1
        const epoch = sessionEpoch
        clearWatchdog()
        watchdog = setTimeout(() => {
            if (epoch !== sessionEpoch || status.value !== 'starting') return
            stopEngineBestEffort()
            sessionEpoch += 1
            status.value = 'error'
            error.value = messageFor('startTimeout')
            errorCode.value = 'startTimeout'
        }, START_WATCHDOG_MS)
        await engine.start({
            onStart: () => {
                if (epoch !== sessionEpoch) return
                if (status.value === 'starting') status.value = 'listening'
                startLevel()
                armListeningWatchdog(epoch)
            },
            onPartial: (text) => {
                if (epoch !== sessionEpoch) {
                    // N12: l'unico evento che conta dopo lo stop è il testo finale di un motore che lo dichiara.
                    const atteso = finaleAtteso
                    if (!atteso || atteso.epoch !== epoch) return
                    finaleAtteso = null
                    const finale = text.trim()
                    if (!finale || options.base().trim() !== atteso.scritto.trim()) return
                    options.onTranscript(atteso.base ? `${atteso.base} ${finale}` : finale)
                    return
                }
                if (status.value === 'starting') {
                    status.value = 'listening'
                    startLevel()
                }
                speechLevelSpike(text)
                armListeningWatchdog(epoch)
                heardAnything = true
                const transcript = text.trim()
                if (!transcript) return
                ultimoScritto = capturedBase ? `${capturedBase} ${transcript}` : transcript
                basePresa = capturedBase
                options.onTranscript(ultimoScritto)
            },
            onFallback: (code) => {
                talosDettaturaAnnota(`dett: ripiego sul sistema ${code}`)
                options.onFallback?.(code)
            },
            onLevel: (db) => {
                if (epoch !== sessionEpoch) return
                if (status.value === 'starting') status.value = 'listening'
                realLevel(db)
            },
            onEnd: () => {
                talosDettaturaAnnota(`dett: onEnd sentito=${heardAnything} stato=${status.value}`)
                if (epoch !== sessionEpoch) return
                clearWatchdog()
                stopLevel()
                if (status.value !== 'starting' && status.value !== 'listening') return
                if (heardAnything) {
                    // Prima del cambio di stato: chi osserva lo stato lo legge già giusto.
                    chiusaDalMotore.value = engine.attendeIlFinale === true
                    status.value = 'idle'
                    return
                }
                status.value = 'error'
                error.value = messageFor('noSpeech')
                errorCode.value = 'noSpeech'
            },
            onError: (code) => {
                talosDettaturaAnnota(`dett: onError ${code}`)
                if (epoch !== sessionEpoch) return
                clearWatchdog()
                stopLevel()
                status.value = 'error'
                error.value = messageFor(code)
                errorCode.value = code
            },
        }, {
            language: options.language?.(),
            autoLanguage: options.autoLanguage?.() ?? true,
            allowedLanguages: options.allowedLanguages?.() ?? [],
            silenceMillis: options.silenceMillis?.(),
            minimumMillis: options.minimumMillis?.(),
            // Solo quando serve: chi non lo chiede manda al motore le stesse opzioni di prima (DICT-I18N-01).
            ...(options.chiudeAlSilenzio?.() === true ? { endOnSilence: true } : {}),
        })
    }

    // F4-#18 inversion: hiding the mic on a failed probe made real-device
    // failures undiagnosable. On native the button always shows and a tap
    // attempts the engine — errors surface in the visible banner.
    const visible = computed(() => native || supported.value)

    async function toggle(): Promise<void> {
        talosDettaturaAnnota(`dett: toggle da stato=${status.value}`)
        if (status.value === 'listening' || status.value === 'starting') {
            // SF5-1: the native stop() promise may never settle — the UI goes
            // idle NOW; the engine teardown is best-effort in the background.
            clearWatchdog()
            aspettaIlFinale()
            sessionEpoch += 1
            status.value = 'idle'
            stopLevel()
            stopEngineBestEffort()
            return
        }
        if (!visible.value) return
        await start()
    }

    function cancel(): void {
        /*
         * ⛔⛔⛔ SI DICE AL NATIVO CHE ABBIAMO FINITO **SEMPRE**, anche quando
         * qui dentro risulta che non stavamo ascoltando.
         *
         * MISURATO sul Pad il 2026-08-14, logcat, barra aperta e ferma:
         *
         *     16:42:56.900  errore:NO_MATCH            ← lo stato diventa `error`
         *     16:42:57.267  barra: scaduta, smetto     ← e qui si chiama cancel()
         *     16:43:40.160  nessuno ha preso il microfono: me lo riprendo
         *
         * **Quarantatré secondi** fra «smetto» e il microfono che torna alla
         * parola di attivazione, e a restituirlo non è stato nessuno di noi: è
         * scattata la rete di sicurezza del servizio. In mezzo, la barra a
         * schermo, la notifica che dice di aspettare, e «hey jarvis» sordo — il
         * difetto che l'owner ha descritto parola per parola.
         *
         * La causa era questa riga, che usciva quando lo stato non era
         * `listening`. Ma `error` è **esattamente** lo stato in cui la barra si
         * trova dopo un silenzio, cioè il caso più comune di tutti. Il motore
         * era fermo davvero; il microfono no.
         *
         * ⇒ Lo stato di QUESTO oggetto dice se c'è una sessione da chiudere,
         * non se c'è un microfono da restituire. La seconda cosa è vera comunque
         * — abbiamo smesso di volerlo — e va detta comunque. Fermare un motore
         * già fermo non è un errore: lo dice anche il nativo, che lo ignora.
         */
        // Chi butta via non vuole nemmeno il testo giusto che sta per arrivare.
        finaleAtteso = null
        if (status.value !== 'listening' && status.value !== 'starting') {
            stopEngineBestEffort()
            return
        }
        clearWatchdog()
        sessionEpoch += 1
        status.value = 'idle'
        error.value = null
        errorCode.value = null
        stopLevel()
        stopEngineBestEffort()
    }

    /** Se il motore dà il testo giusto dopo lo stop, la sessione che si sta chiudendo ne aspetta ancora uno. */
    function aspettaIlFinale(): void {
        finaleAtteso = engine.attendeIlFinale === true && heardAnything
            ? { epoch: sessionEpoch, base: basePresa, scritto: ultimoScritto }
            : null
    }

    async function finisci(): Promise<void> {
        if (status.value !== 'listening' && status.value !== 'starting') { cancel(); return }
        if (engine.attendeIlFinale !== true) { cancel(); return }
        clearWatchdog()
        aspettaIlFinale()
        sessionEpoch += 1
        status.value = 'idle'
        error.value = null
        errorCode.value = null
        stopLevel()
        let sveglia: ReturnType<typeof setTimeout> | undefined
        await Promise.race([
            engine.stop().catch(() => undefined),
            new Promise<void>((basta) => { sveglia = setTimeout(basta, TETTO_DEL_FINALE_MS) }),
        ])
        clearTimeout(sveglia)
    }

    return { supported, visible, status, error, errorCode, level, chiusaDalMotore, toggle, cancel, finisci }
}
