import { Capacitor } from '@capacitor/core'
import { talosLogDeviceIssue, talosWithTimeout } from '@/lib/talosDeviceLog'

/**
 * F2-T5 — guarded dictation engine. Native path uses the pinned
 * `@capacitor-community/speech-recognition` plugin (lazy import — keeps it out
 * of the entry chunk) with LIVE partial results; web falls back to the Web
 * Speech API when the browser exposes it. Anything else reports unsupported
 * honestly — no fake mic.
 */
export interface TalosDictationEvents {
    /** F5-#29: fired when the recognizer REALLY starts hearing speech. */
    onStart?: () => void
    onPartial: (text: string) => void
    onEnd: () => void
    onError: (message: string) => void
}

export interface TalosDictationEngine {
    supported(): Promise<boolean>
    requestPermission(): Promise<boolean>
    start(events: TalosDictationEvents): Promise<void>
    stop(): Promise<void>
}

// F5.2 — migrated to the MAINTAINED fork (@capgo/capacitor-speech-recognition):
// the community plugin's native available() never settles on modern Android
// (Doctor ring evidence). The fork ships real `error` events (code+message),
// a finite `listeningState`, and crash fixes.
type SpeechRecognitionPlugin = typeof import('@capgo/capacitor-speech-recognition').SpeechRecognition

async function loadPlugin(): Promise<SpeechRecognitionPlugin> {
    // F5.1: fence the import so the mic tap and the Doctor always answer.
    const loaded = await talosWithTimeout(
        import('@capgo/capacitor-speech-recognition'),
        4000,
        'TALOS_SPEECH_PLUGIN_LOAD',
    )
    return loaded.SpeechRecognition
}

function nativeEngine(): TalosDictationEngine {
    let active = false
    return {
        async supported() {
            try {
                const plugin = await loadPlugin()
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
                const plugin = await loadPlugin()
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
        async start(events) {
            const plugin = await loadPlugin()
            active = true
            await plugin.removeAllListeners()
            await plugin.addListener('partialResults', (data: { matches?: string[]; accumulatedText?: string }) => {
                const match = (typeof data.accumulatedText === 'string' && data.accumulatedText)
                    || data.matches?.[0]
                if (typeof match === 'string' && match) events.onPartial(match)
            })
            await plugin.addListener('listeningState', (data: { state?: string; status?: string }) => {
                const state = data.state ?? data.status
                if (state === 'started' || state === 'listening') events.onStart?.()
                if ((state === 'stopped' || state === 'idle') && active) {
                    active = false
                    events.onEnd()
                }
            })
            // F5.2: runtime recognizer errors finally reach JS as an event.
            await plugin.addListener('error', (data: { code?: string | number; message?: string }) => {
                if (!active) return
                active = false
                talosLogDeviceIssue('TALOS_SPEECH_ERROR', `${data.code ?? ''} ${data.message ?? ''}`)
                events.onError(data.message
                    ? `Speech recognition error: ${data.message}`
                    : 'Speech recognition failed. Try again.')
            })
            try {
                await talosWithTimeout(
                    plugin.start({ partialResults: true, popup: false }),
                    10000,
                    'TALOS_SPEECH_START',
                )
            } catch (error) {
                // With partialResults the fork resolves start() when listening
                // ARMS — a rejection here is a genuine failure to start.
                if (!active) return
                active = false
                await plugin.removeAllListeners().catch(() => undefined)
                events.onError(error instanceof Error ? error.message : 'Speech recognition could not start.')
            }
        },
        async stop() {
            const plugin = await loadPlugin()
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
        async start(events) {
            const Ctor = webSpeechConstructor()
            if (!Ctor) {
                events.onError('Speech recognition is not available in this browser.')
                return
            }
            stopping = false
            recognition = new Ctor()
            recognition.continuous = true
            recognition.interimResults = true
            recognition.lang = navigator.language || 'en-US'
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
                    ? 'TALOS needs microphone permission to dictate.'
                    : 'Speech recognition failed. Try again.')
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
    async start(events) { events.onError('Dictation is not available on this device.') },
    async stop() {},
}

/** F4-#18 — raw diagnostics for the in-app Settings row (no adb needed). */
export interface TalosDictationDiagnostics {
    native: boolean
    pluginLoaded: boolean
    available: boolean | null
    error: string | null
}

export async function talosDictationDiagnostics(): Promise<TalosDictationDiagnostics> {
    const native = Capacitor.isNativePlatform()
    if (!native) {
        return { native, pluginLoaded: webSpeechConstructor() !== null, available: webSpeechConstructor() !== null, error: null }
    }

    // F5.3 (owner: "debug più esplicativo") — every step probed SEPARATELY,
    // fenced, and written to the Doctor ring, so a single report pins the
    // exact dying step without adb.
    const steps: string[] = []
    const step = async <T>(name: string, run: () => Promise<T>, ms = 3000): Promise<T | null> => {
        try {
            const value = await talosWithTimeout(run(), ms, `TALOS_SPEECH_STEP_${name}`)
            steps.push(`${name}:ok`)
            return value
        } catch (error) {
            const detail = String(error).slice(0, 120)
            steps.push(`${name}:FAIL ${detail}`)
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
        talosLogDeviceIssue('TALOS_SPEECH_STEP_registered', 'plugin NOT registered in the native runtime')
        return { native, pluginLoaded: false, available: null, error: steps.join(' · ') }
    }

    const plugin = await step('import', () => loadPlugin(), 4000)
    if (!plugin) return { native, pluginLoaded: false, available: null, error: steps.join(' · ') }

    const version = await step('version', () => plugin.getPluginVersion?.() ?? Promise.resolve({ version: 'n/a' }))
    if (version && typeof (version as { version?: string }).version === 'string') {
        steps.push(`v${(version as { version: string }).version}`)
    }
    const permissions = await step('checkPermissions', () => plugin.checkPermissions())
    if (permissions) steps.push(`perm:${JSON.stringify(permissions).slice(0, 60)}`)
    const availability = await step('available', () => plugin.available())

    return {
        native,
        pluginLoaded: true,
        available: availability ? (availability as { available?: boolean }).available === true : null,
        error: steps.join(' · '),
    }
}

/** F4-#18 — request the mic permission at a meaningful moment (intro CTA / first tap). */
export async function requestTalosDictationPermission(): Promise<boolean> {
    if (!Capacitor.isNativePlatform()) return true
    try {
        const plugin = await loadPlugin()
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
