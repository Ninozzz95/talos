import { computed, ref, type ComputedRef, type Ref } from 'vue'
import { Capacitor } from '@capacitor/core'
import { talosDictationEngine, type TalosDictationEngine } from '@/services/dictation'
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
    /** Live locale boundary; raw plugin prose never becomes application UI. */
    errorMessage?: (code: TalosDictationErrorCode) => string
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
    toggle(): Promise<void>
    /** SF5-3: silent teardown (send-time cleanup) — no messages, no resurrection. */
    cancel(): void
}

export function useTalosMobileDictation(options: UseTalosMobileDictationOptions): TalosMobileDictation {
    const engine = options.engine ?? talosDictationEngine()
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
        const grown = Math.max(0, text.length - lastPartialLength)
        lastPartialLength = text.length
        level.value = Math.min(1, Math.max(level.value, 0.4 + Math.min(0.5, grown * 0.06)))
    }

    function stopLevel(): void {
        if (decayTimer !== null) clearInterval(decayTimer)
        decayTimer = null
        level.value = 0
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
    // SF5-1/3: the native stop() promise may NEVER settle (plugin never
    // resolves the call) and late events from a dead session must be inert —
    // every session gets an epoch; stale events are dropped.
    let sessionEpoch = 0

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
        heardAnything = false
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
                if (epoch !== sessionEpoch) return
                if (status.value === 'starting') {
                    status.value = 'listening'
                    startLevel()
                }
                speechLevelSpike(text)
                armListeningWatchdog(epoch)
                heardAnything = true
                const transcript = text.trim()
                if (!transcript) return
                options.onTranscript(capturedBase ? `${capturedBase} ${transcript}` : transcript)
            },
            onEnd: () => {
                if (epoch !== sessionEpoch) return
                clearWatchdog()
                stopLevel()
                if (status.value !== 'starting' && status.value !== 'listening') return
                if (heardAnything) {
                    status.value = 'idle'
                    return
                }
                status.value = 'error'
                error.value = messageFor('noSpeech')
                errorCode.value = 'noSpeech'
            },
            onError: (code) => {
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
        })
    }

    // F4-#18 inversion: hiding the mic on a failed probe made real-device
    // failures undiagnosable. On native the button always shows and a tap
    // attempts the engine — errors surface in the visible banner.
    const visible = computed(() => native || supported.value)

    async function toggle(): Promise<void> {
        if (status.value === 'listening' || status.value === 'starting') {
            // SF5-1: the native stop() promise may never settle — the UI goes
            // idle NOW; the engine teardown is best-effort in the background.
            clearWatchdog()
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
        if (status.value !== 'listening' && status.value !== 'starting') return
        clearWatchdog()
        sessionEpoch += 1
        status.value = 'idle'
        error.value = null
        errorCode.value = null
        stopLevel()
        stopEngineBestEffort()
    }

    return { supported, visible, status, error, errorCode, level, toggle, cancel }
}
