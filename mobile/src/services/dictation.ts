import { Capacitor } from '@capacitor/core'
import { SpeechRecognition } from '@capgo/capacitor-speech-recognition'
import { talosLogDeviceIssue, talosWithTimeout } from '@/lib/talosDeviceLog'
import { talosTracciaFuori } from '@/lib/device/traccia'
import type { TalosDictationErrorCode } from '@/lib/dictationPolicy'

/**
 * F2-T5 — guarded dictation engine. Native path uses the capgo speech plugin
 * (R1: STATIC import — the dynamic micro-chunk never settled on the owner's
 * WebView) with LIVE partial results; web falls back to the Web
 * Speech API when the browser exposes it. Anything else reports unsupported
 * honestly — no fake mic.
 */
export interface TalosDictationEvents {
    /** F5-#29: fired when the recognizer REALLY starts hearing speech. */
    onStart?: () => void
    onPartial: (text: string) => void
    onEnd: () => void
    onError: (code: TalosDictationErrorCode) => void
    /** ⭐ La lingua che il motore ha davvero sentito (API 34). */
    onLanguage?: (tag: string) => void
    /**
     * ⭐⭐ IL VOLUME VERO DEL MICROFONO, in dB grezzi come li dà Android.
     *
     * ⛔ Grezzi di proposito: la scala di `onRmsChanged` non è dichiarata in
     * nessuna documentazione e cambia col dispositivo e col microfono. Chi
     * disegna la normalizza su quello che sta sentendo davvero — vedi
     * `useTalosMobileDictation`. Un fondo scala scritto a mano qui sarebbe un
     * fatto sul telefono inventato a tavolino.
     *
     * Arriva ~12 volte al secondo (il picco di una finestra da 80 ms), non 30:
     * il ritmo delle waveform dei messaggi vocali, a un terzo del costo di ponte.
     */
    onLevel?: (db: number) => void
}

export interface TalosDictationStartOptions {
    language?: string
    /**
     * ⭐ Acceso, il motore decide la lingua ASCOLTANDO, e la cambia anche a
     * meta' frase. Default acceso: chiedere in anticipo la lingua di ogni
     * frase e' il difetto che l'owner ha pagato il 2026-08-10.
     */
    autoLanguage?: boolean
    /** Fra quali lingue puo' muoversi: mai piu' di tre, o inizia a sbagliare. */
    allowedLanguages?: readonly string[]
    /**
     * ⛔⛔ QUANTO SILENZIO prima che il motore consideri finito il turno, in ms.
     *
     * Esisteva nel nativo (`silenceMillis`) e NESSUNO lo passava: il motore
     * usava il suo default corto, chiudeva dopo un secondo, e chi voleva un
     * ascolto continuo era costretto a riaprirlo di continuo — che è il modo
     * documentato per farlo fallire in silenzio. Owner 2026-08-11: «la modalità
     * ascolto rimane ma non ascolta niente».
     */
    silenceMillis?: number

    /**
     * Quanto il microfono resta aperto ANCHE se non ha ancora sentito niente —
     * il tempo che TALOS concede a chi sta pensando prima di parlare.
     *
     * ⛔ Separato da `silenceMillis` di proposito: quello dice «questa pausa
     * significa che hai finito» ed è corto perché la domanda parta subito;
     * questo dice «non chiudermi in faccia» ed è lungo. Legarli — come faceva
     * un `silenzio * 5` — significa che non puoi migliorare uno senza peggiorare
     * l'altro.
     */
    minimumMillis?: number
}

export interface TalosDictationEngine {
    supported(): Promise<boolean>
    requestPermission(): Promise<boolean>
    start(events: TalosDictationEvents, options?: TalosDictationStartOptions): Promise<void>
    stop(): Promise<void>
}

// F5.2 — migrated to the MAINTAINED fork (@capgo/capacitor-speech-recognition):
// the community plugin's native available() never settles on modern Android
// (Doctor ring evidence). The fork ships real `error` events (code+message),
// a finite `listeningState`, and crash fixes.
// R1-mic — OWNER DEVICE EVIDENCE (Doctor F5.3): `registered:true` but
// `import:FAIL TALOS_SPEECH_STEP_import_TIMEOUT` — the native plugin is fine;
// the DYNAMIC import never settled on the owner's WebView → import STATICALLY.
//
// R-mic ROOT CAUSE (Doctor deep debug: `resolve:FAIL TIMEOUT` on a static
// return): a Capacitor plugin proxy is THENABLE. Its get-trap returns a caller
// function for EVERY property, including `then`, so `await pluginProxy` /
// `return pluginProxy` from an async function assimilates it as a promise —
// calling `proxy.then(...)`, which the bridge forwards as a native method
// "then" that never answers → 4s hang. loadPlugin is therefore SYNCHRONOUS and
// callers must NEVER await the plugin OBJECT — only its method results (those
// are real bridge promises, safe to await).
export type SpeechRecognitionPlugin = typeof SpeechRecognition

/*
 * ⛔ PUBBLICI per un motivo dichiarato: la diagnostica del Doctor vive in
 * `dictationDiagnostica.ts` e non qui, perché questo modulo lo carica la
 * schermata iniziale e quello lo apre solo chi va a cercarlo. Da lì servono
 * questi due accessori — e sono due domande legittime («qual è il plugin
 * nativo», «questo browser ha Web Speech»), non due segreti.
 */
export function loadPlugin(): SpeechRecognitionPlugin {
    return SpeechRecognition
}

/**
 * ⛔⛔ IL SILENZIO NON E' UN GUASTO — owner 2026-08-10, dal Pad: preme il
 * microfono in una chat nuova e legge in rosso «Il riconoscimento vocale non e'
 * riuscito. Riprova.».
 *
 * MISURATO in logcat, non dedotto:
 *
 *     W RecognitionClient: #onError space agsa_transcription_NO_SPEECH_DETECTED
 *
 * Il motore aveva ascoltato 4,6 s e funzionato benissimo: non aveva sentito
 * parlare, e l'ha detto. Android lo consegna come `ERROR_NO_MATCH` /
 * `ERROR_SPEECH_TIMEOUT`, il fork lo gira come `NO_MATCH` / `SPEECH_TIMEOUT`, e
 * noi lo mettevamo nel mucchio dei guasti — l'esito piu' NORMALE che esista
 * (premere, ripensarci, parlare piano) diventava un allarme che dice di
 * riprovare senza dire cosa cambiare.
 *
 * ⛔ La distinzione non e' cosmetica: `recognitionFailed` manda a cercare un
 * guasto che non c'e'. `noSpeech` dice la cosa vera — avvicinati e riparla.
 */
/**
 * ⛔ `NO_PROGRESS` sta qui dentro, e non e' indulgenza — owner 2026-08-10,
 * premendo il microfono mentre TALOS parlava. Il motore risponde
 * `agsa_transcription_ONLINE_NO_PROGRESS`: «il riconoscitore in rete non e'
 * andato da nessuna parte». Per chi ha premuto e non ha ancora detto niente e'
 * la stessa cosa del silenzio — e chiamarlo guasto manda a cercare una rottura
 * che non c'e', esattamente come faceva `NO_MATCH` stamattina.
 */
const SILENZIO = /NO_MATCH|SPEECH_TIMEOUT|NO_SPEECH|no-speech|NO_PROGRESS/i
const PERMESSO = /permission|not.?allowed|denied/i

export function talosEsitoDettatura(dettaglio: string): TalosDictationErrorCode {
    if (PERMESSO.test(dettaglio)) return 'permissionDenied'
    if (SILENZIO.test(dettaglio)) return 'noSpeech'
    return 'recognitionFailed'
}

function nativeEngine(): TalosDictationEngine {
    let active = false
    return {
        async supported() {
            try {
                const plugin = loadPlugin()
                const probe = await talosWithTimeout(plugin.available(), 3000, 'TALOS_SPEECH_AVAILABLE')
                return probe.available !== false
            } catch (error) {
                talosLogDeviceIssue('TALOS_SPEECH_AVAILABLE', String(error))
                // The fork may drop the legacy probe — the tap path stays the
                // honest arbiter on native.
                return true
            }
        },
        async requestPermission() {
            try {
                const plugin = loadPlugin()
                const status = (await talosWithTimeout(
                    plugin.requestPermissions(),
                    30000,
                    'TALOS_SPEECH_PERMISSION',
                )) as unknown as Record<string, string>
                return status.speechRecognition === 'granted' || status.microphone === 'granted'
            } catch (error) {
                talosLogDeviceIssue('TALOS_SPEECH_PERMISSION', String(error))
                return false
            }
        },
        async start(events, options = {}) {
            talosDettaturaAnnota('avvio')
            const plugin = loadPlugin()
            active = true
            await plugin.removeAllListeners()
            await plugin.addListener('partialResults', (data: { matches?: string[]; accumulatedText?: string }) => {
                const match = (typeof data.accumulatedText === 'string' && data.accumulatedText)
                    || data.matches?.[0]
                if (typeof match === 'string' && match) events.onPartial(match)
            })
            await plugin.addListener('listeningState', (data: { state?: string; status?: string }) => {
                const state = data.state ?? data.status
                talosDettaturaAnnota(`stato:${state ?? '?'}${active ? '' : ' (sessione gia chiusa)'}`)
                if (state === 'started' || state === 'listening') events.onStart?.()
                if ((state === 'stopped' || state === 'idle') && active) {
                    active = false
                    events.onEnd()
                }
            })
            // F5.2: runtime recognizer errors finally reach JS as an event.
            await plugin.addListener('error', (data: { code?: string | number; message?: string }) => {
                talosDettaturaAnnota(`errore:${data.code ?? '?'}${active ? '' : ' (sessione gia chiusa)'}`)
                if (!active) return
                active = false
                talosLogDeviceIssue('TALOS_SPEECH_ERROR', `${data.code ?? ''} ${data.message ?? ''}`)
                const detail = `${data.code ?? ''} ${data.message ?? ''}`
                events.onError(talosEsitoDettatura(detail))
            })
            try {
                await talosWithTimeout(
                    plugin.start({
                        partialResults: true,
                        popup: false,
                        ...(options.language ? { language: options.language } : {}),
                        ...(options.silenceMillis ? { silenceMillis: options.silenceMillis } : {}),
                        ...(options.minimumMillis ? { minimumMillis: options.minimumMillis } : {}),
                    }),
                    10000,
                    'TALOS_SPEECH_START',
                )
            } catch (error) {
                // With partialResults the fork resolves start() when listening
                // ARMS — a rejection here is a genuine failure to start.
                if (!active) return
                active = false
                await plugin.removeAllListeners().catch(() => undefined)
                talosLogDeviceIssue('TALOS_SPEECH_START', String(error))
                events.onError('startFailed')
            }
        },
        async stop() {
            talosDettaturaAnnota('stop chiesto dalla persona')
            const plugin = loadPlugin()
            active = false
            // SF5-1 discipline kept: never trust a native stop to settle.
            void plugin.stop().catch(() => undefined)
            await plugin.removeAllListeners()
        },
    }
}

interface WebSpeechRecognitionInstance {
    lang: string
    continuous: boolean
    interimResults: boolean
    onresult: ((event: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null
    onerror: ((event: { error?: string }) => void) | null
    onend: (() => void) | null
    start(): void
    stop(): void
}

export function webSpeechConstructor(): (new () => WebSpeechRecognitionInstance) | null {
    const scope = globalThis as Record<string, unknown>
    const ctor = scope.SpeechRecognition ?? scope.webkitSpeechRecognition
    return typeof ctor === 'function' ? ctor as new () => WebSpeechRecognitionInstance : null
}

function webEngine(): TalosDictationEngine {
    let recognition: WebSpeechRecognitionInstance | null = null
    let stopping = false
    return {
        async supported() {
            return webSpeechConstructor() !== null
        },
        async requestPermission() {
            // The Web Speech API prompts on start; there is no separate grant step.
            return webSpeechConstructor() !== null
        },
        async start(events, options = {}) {
            const Ctor = webSpeechConstructor()
            if (!Ctor) {
                events.onError('unavailable')
                return
            }
            stopping = false
            recognition = new Ctor()
            recognition.continuous = true
            recognition.interimResults = true
            recognition.lang = options.language || navigator.language || 'en-US'
            let finalText = ''
            recognition.onresult = (event) => {
                let interim = ''
                for (let index = event.resultIndex; index < event.results.length; index += 1) {
                    const result = event.results[index] as ArrayLike<{ transcript: string }> & { isFinal?: boolean }
                    const transcript = result[0]?.transcript ?? ''
                    if ((result as { isFinal?: boolean }).isFinal) finalText += transcript
                    else interim += transcript
                }
                const combined = `${finalText}${interim}`.trim()
                if (combined) events.onPartial(combined)
            }
            const instance = recognition
            recognition.onerror = (event) => {
                if (stopping || instance !== recognition) return
                // Il web dice `no-speech` dove il nativo dice `NO_MATCH`: stessa
                // cosa, stesso esito — la regola sta in un posto solo.
                events.onError(talosEsitoDettatura(String(event.error ?? '')))
            }
            recognition.onend = () => {
                // A superseded instance must not clobber the live session.
                if (instance !== recognition) return
                recognition = null
                if (!stopping) events.onEnd()
            }
            recognition.start()
        },
        async stop() {
            stopping = true
            recognition?.stop()
            recognition = null
        },
    }
}

const unsupportedEngine: TalosDictationEngine = {
    async supported() { return false },
    async requestPermission() { return false },
    async start(events) { events.onError('unavailable') },
    async stop() {},
}

/**
 * F4-#18 — raw diagnostics for the in-app Doctor (no adb needed).
 * Owner deep-debug (2026-07-24, "dobbiamo debuggare esattamente quello che
 * succede, non andare alla cieca"): the report carries a BUILD STAMP (which
 * APK is running — the single fact that told us the owner was on a stale F5.3
 * build), a full plugin-method inventory (proves the wrapper is really the
 * capgo one), and the RAW native results verbatim, not just pass/fail.
 */
/**
 * ⛔⛔ IL DIARIO DELLA DETTATURA — perché un difetto che non si riproduce
 * non si indovina: si strumenta.
 *
 * Owner 2026-08-10: «quando la dettatura vocale è finita, il pulsante da stop
 * non ritorna a icona microfono». MISURATO sul Pad, tre uscite su tre, con
 * tocchi reali:
 *
 * ```
 *   il motore decide che hai smesso   Detta → Interrompi (505 ms) → Detta (5.556 ms)  ✅
 *   tocchi tu lo stop                 Detta → Interrompi → Detta (506 ms)             ✅
 *   ritorno dallo sfondo              torna «Invia messaggio», ed è giusto: c'è testo ✅
 * ```
 *
 * ⇒ Non si riproduce da qui. E un difetto visto da chi lo usa e non da chi lo
 * cerca non è un difetto immaginario: è un difetto di cui non conosciamo la
 * strada. Questo diario tiene le ultime transizioni con l'ora, così la
 * prossima volta la Diagnostica dice **qual è stato l'ultimo evento
 * ricevuto** invece di lasciarci a ipotizzare.
 *
 * Sedici righe: abbastanza per una sessione intera, poche abbastanza da non
 * diventare un archivio che nessuno legge.
 */
const DIARIO_MAX = 16
const diario: string[] = []

export function talosDettaturaAnnota(evento: string): void {
    const ora = new Date().toISOString().slice(11, 23)
    diario.push(`${ora} ${evento}`)
    if (diario.length > DIARIO_MAX) diario.shift()
    /*
     * ⛔⛔ E SI SENTE ANCHE DA FUORI — perché per giorni non si è sentito.
     *
     * Questo diario esisteva già e registrava esattamente le transizioni che
     * servono («avvio», «stato:ready», «errore:NO_MATCH»). Era invisibile: si
     * legge solo dal pannello del Doctor, cioè da dentro l'app, cioè non mentre
     * stai riproducendo il difetto su un altro schermo.
     *
     * ⛔ E la strada ovvia NON esiste: MISURATO l'11 agosto sul Pad, un
     * `console.info` dalla WebView **non arriva in `logcat`** in questa app —
     * provato scrivendo una riga di prova e trovando zero occorrenze. Quindi
     * l'unico canale che porta fuori una decisione presa dal JS è il ponte.
     *
     * Costa una chiamata al ponte per transizione — poche decine per sessione,
     * non per fotogramma — e in cambio la catena «la persona ha parlato → il
     * motore ha risposto → noi abbiamo deciso» si legge tutta di fila accanto ai
     * tempi del motore, che è la cosa che mancava per chiudere questo difetto.
     */
    /*
     * ⛔⛔ L'ORA VIAGGIA COL FATTO, perché il ponte NON conserva l'ordine.
     *
     * MISURATO il 12 agosto: in `logcat` la riga «toggle da onMounted»
     * compariva **1,4 secondi dopo** due righe che nel codice le vengono dopo.
     * Non era un ritardo vero — Capacitor esegue tutti i plugin su un thread
     * solo (vedi `campiona-la-pila-non-indovinare-inquilino`), quindi l'ora che
     * si legge in `logcat` è quella di CONSEGNA, non quella del fatto.
     *
     * Una traccia che riordina gli eventi è peggio di nessuna traccia: fa
     * dedurre cause a rovescio. L'istante si prende QUI, dove il fatto succede,
     * e si porta dietro.
     */
    // ⛔ Il come sta in `talosTracciaFuori`: da quando anche il pilota dello
    // schermo deve raccontare dove si ferma, questo canale ha due utenti — e
    // due copie sarebbero due comportamenti che divergono alla prima modifica.
    talosTracciaFuori(evento, ora)
}

/** Le ultime transizioni, dalla più vecchia. Vuoto se non si è mai dettato. */
export function talosDettaturaDiario(): readonly string[] {
    return [...diario]
}


/** F4-#18 — request the mic permission at a meaningful moment (intro CTA / first tap). */
export async function requestTalosDictationPermission(): Promise<boolean> {
    if (!Capacitor.isNativePlatform()) return true
    try {
        const plugin = loadPlugin()
        const status = (await talosWithTimeout(
            plugin.requestPermissions(),
            30000,
            'TALOS_SPEECH_PERMISSION_INTRO',
        )) as unknown as Record<string, string>
        return status.speechRecognition === 'granted' || status.microphone === 'granted'
    } catch (error) {
        talosLogDeviceIssue('TALOS_SPEECH_PERMISSION_INTRO', String(error))
        return false
    }
}

/**
 * ⛔⛔ IL MOTORE DI CASA ARRIVA AL PRIMO USO, non all'avvio.
 *
 * MISURATO: tenendolo qui il grafo iniziale saliva a 602.547 byte su un tetto
 * di 600.000 (compito #51). Nessuno paga un riconoscitore vocale per aprire una
 * chat: il modulo si carica quando qualcuno tocca il microfono.
 *
 * ⛔ Qui si importa un modulo NOSTRO, non il proxy di un plugin: la trappola
 * gia' pagata era `await` su un proxy Capacitor (e' thenable e il ponte gira un
 * metodo `then` che non risponde mai). Un import dinamico di un chunk Vite non
 * ha niente a che vedere con quello — l'app ne fa gia' decine.
 */
function casaEngine(): TalosDictationEngine {
    let vero: TalosDictationEngine | null = null
    const carica = async (): Promise<TalosDictationEngine> => {
        if (!vero) vero = (await import('@/services/dictationCasa')).creaMotoreDiCasa()
        return vero
    }
    return {
        supported: async () => (await carica()).supported(),
        requestPermission: async () => (await carica()).requestPermission(),
        start: async (eventi, opzioni) => (await carica()).start(eventi, opzioni),
        stop: async () => { if (vero) await vero.stop() },
    }
}

/**
 * ⛔ La scelta si rifà a ogni chiamata, e NON si tiene in cache: la prima
 * versione la memorizzava «per non attraversare il ponte», che era un'ipotesi
 * sbagliata — `isPluginAvailable` legge la mappa dei plugin registrati in
 * pagina, non chiama il nativo. Una cache lì avrebbe solo congelato una scelta
 * fatta prima che i plugin finissero di registrarsi.
 */
export function talosDictationEngine(): TalosDictationEngine {
    if (Capacitor.isNativePlatform()) {
        return Capacitor.isPluginAvailable('TalosDictation') ? casaEngine() : nativeEngine()
    }
    if (webSpeechConstructor()) return webEngine()
    return unsupportedEngine
}
