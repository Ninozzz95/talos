import { Capacitor } from '@capacitor/core'

/**
 * F2-T5 — guarded dictation engine. Native path uses the pinned
 * `@capacitor-community/speech-recognition` plugin (lazy import — keeps it out
 * of the entry chunk) with LIVE partial results; web falls back to the Web
 * Speech API when the browser exposes it. Anything else reports unsupported
 * honestly — no fake mic.
 */
export interface TalosDictationEvents {
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

type SpeechRecognitionPlugin = typeof import('@capacitor-community/speech-recognition').SpeechRecognition

async function loadPlugin(): Promise<SpeechRecognitionPlugin> {
    return (await import('@capacitor-community/speech-recognition')).SpeechRecognition
}

function nativeEngine(): TalosDictationEngine {
    let active = false
    return {
        async supported() {
            try {
                return (await (await loadPlugin()).available()).available
            } catch {
                return false
            }
        },
        async requestPermission() {
            try {
                const status = await (await loadPlugin()).requestPermissions()
                return status.speechRecognition === 'granted'
            } catch {
                return false
            }
        },
        async start(events) {
            const plugin = await loadPlugin()
            active = true
            await plugin.removeAllListeners()
            await plugin.addListener('partialResults', (data: { matches?: string[] }) => {
                const match = data.matches?.[0]
                if (typeof match === 'string' && match) events.onPartial(match)
            })
            await plugin.addListener('listeningState', (data: { status?: string }) => {
                if (data.status === 'stopped' && active) {
                    active = false
                    events.onEnd()
                }
            })
            try {
                await plugin.start({ partialResults: true, popup: false })
            } catch (error) {
                active = false
                await plugin.removeAllListeners()
                events.onError(error instanceof Error ? error.message : 'Speech recognition could not start.')
            }
        },
        async stop() {
            const plugin = await loadPlugin()
            active = false
            try {
                await plugin.stop()
            } finally {
                await plugin.removeAllListeners()
            }
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
            recognition.onerror = (event) => {
                if (stopping) return
                events.onError(event.error === 'not-allowed'
                    ? 'TALOS needs microphone permission to dictate.'
                    : 'Speech recognition failed. Try again.')
            }
            recognition.onend = () => {
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

export function talosDictationEngine(): TalosDictationEngine {
    if (Capacitor.isNativePlatform()) return nativeEngine()
    if (webSpeechConstructor()) return webEngine()
    return unsupportedEngine
}
