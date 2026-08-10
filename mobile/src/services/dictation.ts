import { Capacitor } from '@capacitor/core'
import { SpeechRecognition } from '@capgo/capacitor-speech-recognition'
import { talosLogDeviceIssue, talosWithTimeout } from '@/lib/talosDeviceLog'
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
}

export interface TalosDictationStartOptions {
    language?: string
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
type SpeechRecognitionPlugin = typeof SpeechRecognition

function loadPlugin(): SpeechRecognitionPlugin {
    return SpeechRecognition
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
                events.onError(/permission|not.?allowed|denied/i.test(detail)
                    ? 'permissionDenied'
                    : 'recognitionFailed')
            })
            try {
                await talosWithTimeout(
                    plugin.start({
                        partialResults: true,
                        popup: false,
                        ...(options.language ? { language: options.language } : {}),
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

function webSpeechConstructor(): (new () => WebSpeechRecognitionInstance) | null {
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
                events.onError(event.error === 'not-allowed'
                    ? 'permissionDenied'
                    : 'recognitionFailed')
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
}

/** Le ultime transizioni, dalla più vecchia. Vuoto se non si è mai dettato. */
export function talosDettaturaDiario(): readonly string[] {
    return [...diario]
}

export interface TalosDictationDiagnostics {
    buildId: string
    native: boolean
    registered: boolean
    pluginLoaded: boolean
    methods: string[]
    permissionsRaw: string | null
    availableRaw: string | null
    available: boolean | null
    trace: string
    error: string | null
    /** Le ultime transizioni della dettatura, per spiegare un blocco. */
    diario: readonly string[]
}

function talosBuildId(): string {
    // Injected by vite.config.ts `define`; absent in dev/test.
    return typeof __TALOS_BUILD_ID__ !== 'undefined' ? __TALOS_BUILD_ID__ : 'dev'
}

const PLUGIN_METHODS = ['available', 'start', 'stop', 'checkPermissions', 'requestPermissions', 'getPluginVersion', 'addListener', 'removeAllListeners'] as const

export async function talosDictationDiagnostics(): Promise<TalosDictationDiagnostics> {
    const buildId = talosBuildId()
    const native = Capacitor.isNativePlatform()
    if (!native) {
        const webOk = webSpeechConstructor() !== null
        const trace = `build ${buildId} · web speech ${webOk ? 'present' : 'absent'}`
        return {
            buildId, native, registered: webOk, pluginLoaded: webOk, methods: webOk ? ['webSpeech'] : [],
            permissionsRaw: null, availableRaw: null, available: webOk, trace,
            error: webOk ? null : trace,
            diario: talosDettaturaDiario(),
        }
    }

    // F5.3 (owner: "debug più esplicativo") — every step probed SEPARATELY,
    // fenced, timed, and written to the Doctor ring, so a single report pins
    // the exact dying step without adb.
    const steps: string[] = [`build ${buildId}`]
    const failures: string[] = []
    const step = async <T>(name: string, run: () => Promise<T>, ms = 3000): Promise<T | null> => {
        const started = performance.now()
        try {
            const value = await talosWithTimeout(run(), ms, `TALOS_SPEECH_STEP_${name}`)
            steps.push(`${name}:ok(${Math.round(performance.now() - started)}ms)`)
            return value
        } catch (error) {
            const detail = String(error).slice(0, 120)
            const failure = `${name}:FAIL ${detail}`
            steps.push(failure)
            failures.push(failure)
            talosLogDeviceIssue(`TALOS_SPEECH_STEP_${name}`, detail)
            return null
        }
    }

    // Step 0 — is the plugin REGISTERED in the native runtime? Synchronous,
    // cannot hang; false means the native class failed to load and every
    // bridge call to it will die.
    let registered = false
    try {
        registered = Capacitor.isPluginAvailable('SpeechRecognition')
    } catch { registered = false }
    steps.push(`registered:${registered}`)
    if (!registered) {
        const failure = `build ${buildId} · plugin NOT registered in the native runtime`
        talosLogDeviceIssue('TALOS_SPEECH_STEP_registered', failure)
        const trace = steps.join(' · ')
        return {
            buildId, native, registered, pluginLoaded: false, methods: [],
            permissionsRaw: null, availableRaw: null, available: null,
            trace, error: failure,
            diario: talosDettaturaDiario(),
        }
    }

    // Step 1 — resolve the wrapper SYNCHRONOUSLY. It is a thenable Capacitor
    // proxy, so it must NEVER be awaited / wrapped in a promise (that is the
    // R-mic hang: `resolve:FAIL TIMEOUT`). A plain property read is safe and
    // does not touch the bridge; inventory the methods to PROVE it's the real
    // capgo plugin.
    let plugin: SpeechRecognitionPlugin | null = null
    try {
        plugin = loadPlugin()
        steps.push('resolve:ok(sync)')
    } catch (error) {
        const detail = String(error).slice(0, 120)
        const failure = `resolve:FAIL ${detail}`
        steps.push(failure)
        failures.push(failure)
        talosLogDeviceIssue('TALOS_SPEECH_STEP_resolve', detail)
    }
    if (!plugin) {
        const trace = steps.join(' · ')
        return {
            buildId, native, registered, pluginLoaded: false, methods: [],
            permissionsRaw: null, availableRaw: null, available: null,
            trace, error: failures.join(' · ') || trace,
            diario: talosDettaturaDiario(),
        }
    }
    const pluginObj = plugin as unknown as Record<string, unknown>
    const methods = PLUGIN_METHODS.filter((name) => typeof pluginObj[name] === 'function')
    steps.push(`methods:[${methods.join(',')}]`)

    const version = await step('version', () => plugin.getPluginVersion?.() ?? Promise.resolve({ version: 'n/a' }))
    if (version && typeof (version as { version?: string }).version === 'string') {
        steps.push(`v${(version as { version: string }).version}`)
    }

    const permissions = await step('checkPermissions', () => plugin.checkPermissions())
    const permissionsRaw = permissions ? JSON.stringify(permissions) : null
    if (permissionsRaw) steps.push(`perm:${permissionsRaw.slice(0, 80)}`)

    const availability = await step('available', () => plugin.available())
    const availableRaw = availability ? JSON.stringify(availability) : null
    if (availableRaw) steps.push(`avail:${availableRaw.slice(0, 60)}`)

    const report: TalosDictationDiagnostics = {
        buildId,
        native,
        registered,
        pluginLoaded: true,
        diario: talosDettaturaDiario(),
        methods,
        permissionsRaw,
        availableRaw,
        available: availability ? (availability as { available?: boolean }).available === true : null,
        trace: steps.join(' · '),
        error: failures.length > 0 ? failures.join(' · ') : null,
    }
    return report
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

export function talosDictationEngine(): TalosDictationEngine {
    if (Capacitor.isNativePlatform()) return nativeEngine()
    if (webSpeechConstructor()) return webEngine()
    return unsupportedEngine
}
