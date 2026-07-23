import { computed, ref, type ComputedRef, type Ref } from 'vue'
import { Capacitor } from '@capacitor/core'
import { talosDictationEngine, type TalosDictationEngine } from '@/services/dictation'

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
}

export interface TalosMobileDictation {
    supported: Ref<boolean>
    /** F4-#18: on native the mic is ALWAYS visible — failures surface at tap. */
    visible: ComputedRef<boolean>
    status: Ref<TalosMobileDictationStatus>
    error: Ref<string | null>
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
            error.value = 'The speech recognizer stopped responding. Tap the microphone to try again.'
        }, LISTENING_INACTIVITY_MS)
    }

    async function start(): Promise<void> {
        error.value = null
        const granted = await engine.requestPermission()
        if (!granted) {
            status.value = 'error'
            error.value = 'TALOS needs microphone permission to dictate.'
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
            error.value = 'Speech recognition did not hear anything. Check that Google speech services are enabled, then try again.'
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
                error.value = "TALOS did not hear any speech. Try again closer to the microphone."
            },
            onError: (message) => {
                if (epoch !== sessionEpoch) return
                clearWatchdog()
                stopLevel()
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
        stopLevel()
        stopEngineBestEffort()
    }

    return { supported, visible, status, error, level, toggle, cancel }
}
