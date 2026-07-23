import { computed, ref, type ComputedRef, type Ref } from 'vue'
import { Capacitor } from '@capacitor/core'
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
    /** Injectable for tests; defaults to the real platform check. */
    native?: boolean
}

export interface TalosMobileDictation {
    supported: Ref<boolean>
    /** F4-#18: on native the mic is ALWAYS visible — failures surface at tap. */
    visible: ComputedRef<boolean>
    status: Ref<TalosMobileDictationStatus>
    error: Ref<string | null>
    toggle(): Promise<void>
}

export function useTalosMobileDictation(options: UseTalosMobileDictationOptions): TalosMobileDictation {
    const engine = options.engine ?? talosDictationEngine()
    const native = options.native ?? Capacitor.isNativePlatform()
    const supported = ref(false)
    const status = ref<TalosMobileDictationStatus>('idle')
    const error = ref<string | null>(null)

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

    // F4-#18 inversion: hiding the mic on a failed probe made real-device
    // failures undiagnosable. On native the button always shows and a tap
    // attempts the engine — errors surface in the visible banner.
    const visible = computed(() => native || supported.value)

    async function toggle(): Promise<void> {
        if (status.value === 'listening') {
            await engine.stop()
            status.value = 'idle'
            return
        }
        if (!visible.value) return
        await start()
    }

    return { supported, visible, status, error, toggle }
}
