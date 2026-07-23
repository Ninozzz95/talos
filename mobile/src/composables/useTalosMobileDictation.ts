import { ref, type Ref } from 'vue'
import { talosDictationEngine, type TalosDictationEngine } from '@/services/dictation'

/**
 * F2-T5 — dictation state for the composer. Live partials compose onto the
 * draft text captured AT START (so typing before dictating is never lost),
 * permission and availability stay honest, stop/end always return to idle.
 */
export type TalosMobileDictationStatus = 'idle' | 'listening' | 'error'

export interface UseTalosMobileDictationOptions {
    /** Current draft text — captured once when listening starts. */
    base: () => string
    /** Receives the FULL composed draft (base + live transcript). */
    onTranscript: (text: string) => void
    engine?: TalosDictationEngine
}

export interface TalosMobileDictation {
    supported: Ref<boolean>
    status: Ref<TalosMobileDictationStatus>
    error: Ref<string | null>
    toggle(): Promise<void>
}

export function useTalosMobileDictation(options: UseTalosMobileDictationOptions): TalosMobileDictation {
    const engine = options.engine ?? talosDictationEngine()
    const supported = ref(false)
    const status = ref<TalosMobileDictationStatus>('idle')
    const error = ref<string | null>(null)

    void engine.supported().then((available) => {
        supported.value = available
    }).catch(() => {
        supported.value = false
    })

    async function start(): Promise<void> {
        error.value = null
        const granted = await engine.requestPermission()
        if (!granted) {
            status.value = 'error'
            error.value = 'TALOS needs microphone permission to dictate.'
            return
        }
        const capturedBase = options.base().trim()
        status.value = 'listening'
        await engine.start({
            onPartial: (text) => {
                const transcript = text.trim()
                if (!transcript) return
                options.onTranscript(capturedBase ? `${capturedBase} ${transcript}` : transcript)
            },
            onEnd: () => {
                if (status.value === 'listening') status.value = 'idle'
            },
            onError: (message) => {
                status.value = 'error'
                error.value = message
            },
        })
    }

    async function toggle(): Promise<void> {
        if (status.value === 'listening') {
            await engine.stop()
            status.value = 'idle'
            return
        }
        if (!supported.value) return
        await start()
    }

    return { supported, status, error, toggle }
}
